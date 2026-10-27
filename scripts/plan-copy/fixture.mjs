import { randomUUID } from 'node:crypto';
import { requireSafe, UUID } from './guard.mjs';

const owned = new WeakSet();
export function newFixture(runId, round) {
  const f = { runId, round, owner: randomUUID(), portfolio: randomUUID(), bucket: randomUUID(),
    openingRequest: randomUUID(), ledgerRequest: randomUUID(), ledgerCash: randomUUID(), plan: null, day: null };
  owned.add(f); return f;
}
export function requireFixture(f, ready = true) {
  requireSafe(owned.has(f) && [f.runId, f.owner, f.portfolio, f.bucket, f.openingRequest, f.ledgerRequest, f.ledgerCash].every(id => UUID.test(id)), 'SYNTHETIC_FIXTURE_REQUIRED');
  if (ready) requireSafe(UUID.test(f.plan || '') && /^\d{4}-\d{2}-\d{2}$/.test(f.day || ''), 'FIXTURE_NOT_READY');
}
export async function authenticate(c, f) {
  requireFixture(f, false);
  await c.query('set local role authenticated');
  await c.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true), set_config('request.jwt.claim.role','authenticated',true)",
    [f.owner, JSON.stringify({ sub: f.owner, role: 'authenticated' })]);
  const row = (await c.query('/* copy:auth-check */ select current_user role, auth.uid()::text uid')).rows[0];
  requireSafe(row?.role === 'authenticated' && row.uid === f.owner, 'FIXTURE_AUTH_MISMATCH');
}
export async function createFixture(c, f, checkpoint = async () => {}) {
  requireFixture(f, false);
  // Persist identifiers BEFORE seed writes; a lost commit response must not hide them.
  await checkpoint(f);
  await c.query('begin read write');
  try {
    f.day = (await c.query("/* copy:today */ select (clock_timestamp() at time zone 'Asia/Bangkok')::date::text day")).rows[0].day;
    // No Auth API, signup mail, password or copied user identity. Inspect auth triggers first.
    await c.query(`/* copy:seed-user */ insert into auth.users
      (id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values($1,'authenticated','authenticated',$2,null,'{}'::jsonb,$3::jsonb,now(),now())`,
    [f.owner, `plan-copy-${f.owner}@fixture.invalid`, JSON.stringify({ plan_copy_run: f.runId })]);
    await authenticate(c, f);
    await c.query(`/* copy:seed-portfolio */ insert into public.portfolios(id,user_id,name,kind,is_default)
      values($1,$2,$3,'cash_management',false)`, [f.portfolio, f.owner, `QA ${f.runId} round ${f.round}`]);
    await c.query('/* copy:opening */ select public.save_cash_bucket($1,$2,$3::jsonb,$4)',
      [f.openingRequest, f.bucket, JSON.stringify({ name: `QA THB ${f.round}`, portfolio_id: f.portfolio, currency: 'THB', current_amount: 1000 }), 35]);
    const plans = await c.query(`/* copy:seed-plan */ insert into public.daily_plans
      (name,amount,amount_period,money_mode,bucket_id,starts_on,ends_on,frequency)
      values($1,800,'day','expense',$2,$3::date,$3::date,'daily') returning id::text`,
    [`QA expense ${f.runId}`, f.bucket, f.day]);
    f.plan = plans.rows[0]?.id;
    requireFixture(f);
    await checkpoint(f);
    await c.query('commit');
    return f;
  } catch (error) {
    await c.query('rollback').catch(() => {});
    throw error;
  }
}
