import { isIP } from 'node:net';

export const PRODUCTION_REF = 'sbojwnbwfepdvtsmzvwc';
export const CONFIRMATION = 'I_UNDERSTAND_THIS_IS_A_DISPOSABLE_COPY';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class GuardError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function requireSafe(condition, code) {
  if (!condition) throw new GuardError(code);
}
// Never include arbitrary server/driver messages, detail, hint, SQL or credentials.
export function safeError(error) {
  if (error instanceof GuardError) return { code: error.code };
  const sqlstate = typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null;
  return { code: sqlstate === '40P01' ? 'DEADLOCK' : 'DATABASE_OR_TRANSPORT_FAILURE', sqlstate };
}
const address = value => value.replace(/^::ffff:/i, '');
const hostName = value => value.replace(/^\[|\]$/g, '').toLowerCase();

/** Pure, synchronous guard. Must finish BEFORE importing pg/constructing clients. */
export function readConfig(env) {
  const get = key => {
    const value = env[`PLAN_COPY_${key}`];
    requireSafe(typeof value === 'string' && value.length > 0 && value === value.trim(), `ENV_${key}_REQUIRED`);
    return value;
  };
  requireSafe(get('CONFIRM') === CONFIRMATION, 'CONFIRMATION_MISMATCH');
  const raw = get('DATABASE_URL');
  requireSafe(raw.length < 4096, 'INVALID_DATABASE_URL');
  let url;
  try { url = new URL(raw); } catch { throw new GuardError('INVALID_DATABASE_URL'); }
  requireSafe(['postgres:', 'postgresql:'].includes(url.protocol) && !url.search && !url.hash, 'INVALID_DATABASE_URL');
  let user, password, database;
  try {
    user = decodeURIComponent(url.username); password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch { throw new GuardError('INVALID_DATABASE_URL'); }
  const host = hostName(url.hostname), expectedHost = hostName(get('EXPECTED_HOST'));
  requireSafe(host && !host.endsWith('.') && !host.includes('%') && !host.includes('/') && !host.includes('\\'), 'INVALID_HOST');
  requireSafe(!`${host} ${user} ${database}`.toLowerCase().includes(PRODUCTION_REF), 'PRODUCTION_ENDPOINT_FORBIDDEN');
  requireSafe(!host.endsWith('.pooler.supabase.com') && !host.includes('pooler'), 'DIRECT_CONNECTION_REQUIRED');
  const port = get('EXPECTED_PORT');
  requireSafe(/^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535 && url.port === port, 'PORT_MISMATCH');
  requireSafe(host === expectedHost, 'HOST_MISMATCH');
  requireSafe(/^[a-zA-Z_][\w-]{0,62}$/.test(database) && database === get('EXPECTED_DATABASE'), 'DATABASE_MISMATCH');
  requireSafe(/^[a-zA-Z_][\w-]{0,62}$/.test(user) && user === get('EXPECTED_LOGIN_ROLE') && !!password, 'LOGIN_ROLE_MISMATCH');
  requireSafe(!['authenticated', 'anon', 'service_role'].includes(user), 'ADMIN_LOGIN_REQUIRED');
  const serverAddresses = get('EXPECTED_SERVER_ADDRS').split(',').map(s => address(s.trim()));
  requireSafe(serverAddresses.length > 0 && serverAddresses.every(s => isIP(s)), 'INVALID_SERVER_ADDRESSES');
  const copyId = get('ID'); requireSafe(UUID.test(copyId), 'INVALID_COPY_ID');
  // Explicit fields prevent pg/libpq environment fallback or URL option overrides.
  return Object.freeze({ host, port: Number(port), user, password, database, copyId, serverAddresses,
    ssl: ['localhost', '127.0.0.1', '::1'].includes(host) ? false : { rejectUnauthorized: true },
    connectionTimeoutMillis: 5000, query_timeout: 35000, statement_timeout: 30000,
    lock_timeout: 15000, idle_in_transaction_session_timeout: 45000,
    options: '-c default_transaction_read_only=on -c search_path=pg_catalog -c timezone=Asia/Bangkok',
  });
}
export function clientConfig(config, runId, label) {
  const { copyId, serverAddresses, ...connection } = config;
  return { ...connection, application_name: `plan-copy:${runId}:${label}` };
}

export const IDENTITY_SQL = `/* copy:identity */
select current_database() db, session_user login_role, current_user current_role,
 inet_server_addr()::text server_addr, inet_server_port() server_port,
 pg_backend_pid() pid, current_setting('default_transaction_read_only') read_only,
 pg_has_role(session_user,'authenticated','MEMBER') can_assume_authenticated`;
export const MARKER_SQL = `/* copy:marker */
select copy_id::text, database_name, purpose, outbound_disabled, fixture_triggers_reviewed
from plan_copy_guard.identity where singleton = true`;
export const MARKER_ACL_SQL = `/* copy:marker-acl */
select has_table_privilege('authenticated','plan_copy_guard.identity','INSERT,UPDATE,DELETE,TRUNCATE')
 or has_table_privilege('anon','plan_copy_guard.identity','INSERT,UPDATE,DELETE,TRUNCATE') unsafe`;
export const CAPABILITIES_SQL = `/* copy:capabilities */
select to_regclass('cron.job')::text cron_table,
 to_regclass('net.http_request_queue')::text queue_table,
 to_regclass('vault.decrypted_secrets')::text vault_table,
 exists(select from pg_extension where extname='pg_cron') cron_installed,
 exists(select from pg_extension where extname='pg_net') net_installed,
 to_regprocedure('public.save_cash_bucket(uuid,uuid,jsonb,numeric)') is not null
 and to_regprocedure('public.write_bucket_cash(uuid,jsonb)') is not null
 and to_regclass('bucket_private.links') is not null
 and to_regclass('public.plan_month_locks') is not null writer_ready,
 has_table_privilege(session_user,'auth.users','INSERT') can_seed_user,
 has_table_privilege(session_user,'bucket_private.links','SELECT') can_read_links,
 has_table_privilege(session_user,'bucket_private.requests','SELECT') can_read_receipts`;
// Return classifications, never raw job SQL/headers/URL/secret contents.
export const SCHEDULER_SQL = `/* copy:scheduler */
select jobid::text id, active,
 command !~* '^\\s*select\\s+1\\s*;?\\s*$' unresolved_command
from cron.job order by jobid`;
export const QUEUE_SQL = `/* copy:queue */ select count(*)::text pending from net.http_request_queue`;
export const VAULT_SQL = `/* copy:vault-url */
select count(*)::int entries,
 coalesce(bool_or(decrypted_secret is null or decrypted_secret <> 'https://disabled.invalid'),false) unsafe
from vault.decrypted_secrets where name='fintrack_price_alert_url'`;

export function checkIdentity(row, config) {
  requireSafe(row?.db === config.database && row.login_role === config.user && row.current_role === config.user, 'LIVE_IDENTITY_MISMATCH');
  requireSafe(config.serverAddresses.includes(address(row.server_addr || '')) && Number(row.server_port) === config.port, 'LIVE_SERVER_MISMATCH');
  requireSafe(row.read_only === 'on' && row.can_assume_authenticated === true, 'LIVE_ROLE_OR_READ_ONLY_MISMATCH');
  requireSafe(Number.isInteger(row.pid) && row.pid > 0, 'INVALID_BACKEND_PID');
  return row.pid;
}
export async function preflight(clients, config) {
  const pids = [];
  for (const c of clients) pids.push(checkIdentity((await c.query(IDENTITY_SQL)).rows[0], config));
  requireSafe(new Set(pids).size === 3, 'DISTINCT_SESSIONS_REQUIRED');
  const observer = clients[2];
  const markers = (await observer.query(MARKER_SQL)).rows;
  requireSafe(markers.length === 1 && markers[0].copy_id === config.copyId && markers[0].database_name === config.database
    && markers[0].purpose === 'fintrack-disposable-concurrency-copy'
    && markers[0].outbound_disabled === true && markers[0].fixture_triggers_reviewed === true, 'COPY_MARKER_MISMATCH');
  requireSafe((await observer.query(MARKER_ACL_SQL)).rows[0]?.unsafe === false, 'COPY_MARKER_CLIENT_WRITABLE');
  const cap = (await observer.query(CAPABILITIES_SQL)).rows[0];
  requireSafe(cap?.writer_ready, 'WRITER_PREREQUISITES_MISSING');
  requireSafe(cap.can_seed_user === true && cap.can_read_links === true && cap.can_read_receipts === true, 'COPY_ADMIN_PRIVILEGES_REQUIRED');
  requireSafe(!cap.cron_installed || cap.cron_table === 'cron.job', 'CRON_INVENTORY_UNAVAILABLE');
  requireSafe(!cap.net_installed || cap.queue_table === 'net.http_request_queue', 'NET_INVENTORY_UNAVAILABLE');
  const jobs = cap.cron_table ? (await observer.query(SCHEDULER_SQL)).rows : [];
  // Arbitrary SQL/Vault indirection cannot be reliably classified by a regex.
  // Require no jobs or inactive SELECT 1 placeholders, even for copied unknown jobs.
  requireSafe(jobs.every(j => j.active === false && j.unresolved_command === false), 'SCHEDULER_NOT_NEUTRALIZED');
  if (cap.queue_table) requireSafe((await observer.query(QUEUE_SQL)).rows[0]?.pending === '0', 'OUTBOUND_QUEUE_NOT_EMPTY');
  if (cap.vault_table) {
    const v = (await observer.query(VAULT_SQL)).rows[0];
    requireSafe(v && v.entries <= 1 && v.unsafe === false, 'COPIED_WORKER_URL_NOT_NEUTRALIZED');
  }
  // Verify both privileges and observer visibility before writing any fixture.
  const visibility = await observer.query(`/* copy:visibility */ select pid, usename, application_name
    from pg_stat_activity where pid = any($1::int[])`, [pids]);
  requireSafe(visibility.rows.length === 3 && visibility.rows.every(r => r.usename === config.user
    && String(r.application_name).startsWith('plan-copy:')), 'OBSERVER_VISIBILITY_INSUFFICIENT');
  return { pids, scheduler: { checked: true, jobCount: jobs.length, pendingRequests: 0 } };
}
