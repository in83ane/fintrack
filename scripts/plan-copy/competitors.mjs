import { authenticate, requireFixture, BANGKOK_TODAY_SQL } from './fixture.mjs';
import { requireSafe } from './guard.mjs';

export const SCENARIOS = Object.freeze([
  { name: 'PLAN holds; Ledger waits then rejects', first: 'plan', second: 'ledger', release: 'commit', winner: 'plan' },
  { name: 'Ledger holds; PLAN waits then rejects', first: 'ledger', second: 'plan', release: 'commit', winner: 'ledger' },
  { name: 'PLAN rolls back; Ledger waits then succeeds', first: 'plan', second: 'ledger', release: 'rollback', winner: 'ledger' },
]);
export async function beginActor(c, f) {
  requireFixture(f);
  await c.query('begin read write');
  await authenticate(c, f);
  const today = (await c.query(BANGKOK_TODAY_SQL)).rows[0]?.day;
  requireSafe(today === f.day, 'BANGKOK_DAY_CHANGED_START_NEW_RUN');
}
export async function perform(c, kind, f) {
  requireFixture(f);
  if (kind === 'plan') {
    const result = await c.query('/* copy:plan-debit */ insert into public.plan_checks(plan_id,day) values($1,$2::date) returning cash_id::text', [f.plan, f.day]);
    requireSafe(result.rows.length === 1 && !!result.rows[0].cash_id, 'PLAN_DID_NOT_DEBIT');
    return;
  }
  requireSafe(kind === 'ledger', 'UNKNOWN_COMPETITOR');
  await c.query('/* copy:ledger-debit */ select public.write_bucket_cash($1,$2::jsonb)', [f.ledgerRequest, JSON.stringify({ op: 'create', rows: [{
    id: f.ledgerCash, portfolio_id: f.portfolio, bucket_id: f.bucket, type: 'EXPENSE',
    original_amount: 800, currency: 'THB', rate_at_time: 35,
    date: `${f.day}T12:00:00+07:00`, category: 'QA', note: `synthetic run ${f.runId}`,
  }] })]);
}
export function insufficient(error) {
  // An unrelated P0001, timeout, permission failure or deadlock is NOT acceptance.
  return error?.code === 'P0001' && /Insufficient bucket balance/i.test(error.message || '');
}
