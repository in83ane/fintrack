import { requireSafe } from './guard.mjs';
import { requireFixture } from './fixture.mjs';

export const RESULT_SQL = `/* copy:result */
select b.current_amount::text,
 (select coalesce(sum(case when c.type in ('INCOME','DEPOSIT') then c.original_amount
 when c.type in ('EXPENSE','WITHDRAW') then -c.original_amount end),0)::text
 from public.cash_activities c where c.user_id=$1 and c.bucket_id=$2) cash_sum,
 (select count(*)::int from public.cash_activities where user_id=$1 and bucket_id=$2 and type='EXPENSE') debits,
 (select count(*)::int from public.bucket_activities where user_id=$1 and bucket_id=$2 and type='withdraw') mirrors,
 (select count(*)::int from public.cash_activities where user_id=$1 and bucket_id=$2) cash_rows,
 (select count(*)::int from public.bucket_activities where user_id=$1 and bucket_id=$2) mirror_rows,
 (select count(*)::int from public.plan_checks where user_id=$1 and plan_id=$3) checks,
 (select count(*)::int from bucket_private.requests where owner=$1 and id=$4) ledger_receipts,
 (select count(*)::int from public.cash_activities c left join bucket_private.links l on l.cash_id=c.id
 left join public.bucket_activities m on m.id=l.activity_id
 where c.bucket_id=$2 and (c.user_id<>$1 or l.owner is distinct from $1::uuid or m.id is null
 or m.user_id is distinct from $1::uuid or m.bucket_id is distinct from c.bucket_id
 or c.original_amount is null or c.currency<>'THB' or m.currency is distinct from c.currency
 or m.original_amount is distinct from c.original_amount
 or (c.type='DEPOSIT' and m.type<>'deposit') or (c.type='EXPENSE' and m.type<>'withdraw'))) bad_cash_links,
 (select count(*)::int from public.bucket_activities m left join bucket_private.links l on l.activity_id=m.id
 left join public.cash_activities c on c.id=l.cash_id
 where m.bucket_id=$2 and (m.user_id<>$1 or c.id is null or c.bucket_id is distinct from m.bucket_id)) orphan_mirrors
from public.money_buckets b where b.user_id=$1 and b.id=$2`;
export function validateResult(row, winner) {
  requireSafe(row && Number(row.current_amount) === 200 && Number(row.cash_sum) === 200
    && row.debits === 1 && row.mirrors === 1 && row.cash_rows === 2 && row.mirror_rows === 2
    && row.checks === (winner === 'plan' ? 1 : 0) && row.ledger_receipts === (winner === 'ledger' ? 1 : 0)
    && row.bad_cash_links === 0 && row.orphan_mirrors === 0, 'FINANCIAL_ASSERTION_FAILED');
  return { current_amount: '200.00', cash_sum: '200.00', debits: 1, mirrors: 1,
    checks: row.checks, ledger_receipts: row.ledger_receipts, orphan_mirrors: 0 };
}
export async function verifyResult(observer, f, winner, evidence = {}) {
  requireFixture(f);
  const rows = (await observer.query(RESULT_SQL, [f.owner, f.bucket, f.plan, f.ledgerRequest])).rows;
  requireSafe(rows.length === 1, 'FIXTURE_WALLET_MISSING');
  // Preserve observed numeric values even when assertions fail; never copy raw rows.
  evidence.actual = Object.fromEntries(['current_amount', 'cash_sum', 'debits', 'mirrors', 'cash_rows', 'mirror_rows',
    'checks', 'ledger_receipts', 'bad_cash_links', 'orphan_mirrors'].map(key => {
    const value = rows[0][key];
    return [key, /^-?\d+(\.\d+)?$/.test(String(value)) ? String(value) : 'invalid'];
  }));
  return validateResult(rows[0], winner);
}
