import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { requireSafe } from './guard.mjs';
import { assertSqlSyntax } from './local-syntax.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const local = name => `scripts/plan-copy/local/${name}.sql`;
const migration = name => `supabase/migrations/${name}.sql`;
// Explicit allowlist, never discover executable files with a glob.
export const FILES = Object.freeze([
 local('auth-bootstrap'), 'supabase_schema.sql', 'trade_journal_schema.sql',
 ...['002_professional_logic_fix','003_add_currency_historical_rate','004_fix_currency_drift',
 '005_cash_activity_persistence_columns','006_money_bucket_currency','007_dca_assistant_persistence','008_portfolios'].map(migration),
 local('observed-schema-prerequisite'),
 ...['009_scope_all_portfolio_data','010_history_ledger','011_history_trade_only','012_financial_integrity',
 '013_portfolio_roles_and_brokerage_accounts','014_enforce_cash_management_bucket_boundary','015_portfolio_asset_groups',
 '016_default_thb_usd_cash_accounts'].map(migration),
 local('empty-legacy-accounts'),
 ...['018_bucket_broker_transfers',
 '019_remove_empty_duplicate_cash_wallets','020_correct_brokerage_trade_deletions','021_correct_brokerage_trade_updates',
 '022_brokerage_cash_after_trade','023_position_projection_trigger_permissions'].map(migration),
 local('baseline-grants'),
 ...['20261027070148_daily_plans','20261027070606_plan_monthly_targets','20261027075524_plan_recurrence_rules',
 '20261027081807_plan_monthly_recurrence_guard','20261027084140_plan_atomic_money','20261027131636_bucket_atomic_writer'].map(migration),
 local('runner-grants'),
]);
export const CORRUPT_017 = Object.freeze({
 path: migration('017_name_legacy_default_cash_accounts'),
 rawSha256: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
 replacement: local('empty-legacy-accounts'),
 reason: 'Corrupt source contains only 3; original SQL unavailable. Owner approved empty-table guard for fresh local synthetic bootstrap only; legacy renaming not exercised.',
});
export const SKIPPED = Object.freeze([CORRUPT_017, ...[
 '20261026193556_price_email_alerts','20261026193649_price_email_schedule','20261026194020_price_email_security',
 '20261026194238_price_email_generated_ids','20261027065744_persistent_notifications',
].map(name => ({ path: migration(name), reason: 'Notification/outbound dependency group; not exercised by local writer races' }))]);
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export function assertCleanSql(sql) {
 requireSafe(!/[\u0000\ufffd\ufeff]/u.test(sql), 'SOURCE_ENCODING_CONTAMINATION');
}

// Decode bytes strictly, never silently replace malformed input. UTF-16 needs
// an explicit BOM; stripping that BOM is safe only AFTER identifying encoding.
export function decodeSql(bytes) {
 requireSafe(!(bytes[0]===0xff && bytes[1]===0xfe && bytes[2]===0 && bytes[3]===0)
   && !(bytes[0]===0 && bytes[1]===0 && bytes[2]===0xfe && bytes[3]===0xff), 'SOURCE_ENCODING_UNSUPPORTED');
 let encoding='utf-8', offset=0;
 if(bytes[0]===0xff && bytes[1]===0xfe){encoding='utf-16le';offset=2;}
 else if(bytes[0]===0xfe && bytes[1]===0xff){encoding='utf-16be';offset=2;}
 else if(bytes[0]===0xef && bytes[1]===0xbb && bytes[2]===0xbf){offset=3;}
 let sql;
 try { sql=new TextDecoder(encoding,{fatal:true,ignoreBOM:true}).decode(bytes.subarray(offset)); }
 catch { requireSafe(false,'SOURCE_ENCODING_INVALID'); }
 assertCleanSql(sql);
 sql=sql.replace(/\r\n?/g,'\n');
 return {sql,encoding,bomRemoved:offset>0,rawSha256:sha256(bytes)};
}

export async function loadManifest(root = ROOT) {
 const files = [];
 for (const path of FILES) {
   let bytes;
   try { bytes = await readFile(resolve(root,path)); }
   catch { throw new Error(`BOOTSTRAP_SOURCE_MISSING: ${path}`); }
   const decoded=decodeSql(bytes), {sql}=decoded;
   // Bundles are psql input: source must never inject psql metacommands.
   requireSafe(!/^\s*\\/m.test(sql), 'SOURCE_PSQL_COMMAND_FORBIDDEN');
   assertSqlSyntax(sql, path);
   files.push({ path, sha256: sha256(sql), ...decoded });
 }
 // Never silently continue this exception after the original source changes.
 const corrupt017 = await readFile(resolve(root, CORRUPT_017.path));
 requireSafe(sha256(corrupt017) === CORRUPT_017.rawSha256, 'LOCAL_017_EXCEPTION_REQUIRES_REVIEW');
 const entries = files.map(({path,sha256,encoding,bomRemoved,rawSha256}) => ({path,sha256,encoding,bomRemoved,rawSha256}));
 return { files, entries, sha256: sha256(JSON.stringify(entries)), skipped: SKIPPED };
}
