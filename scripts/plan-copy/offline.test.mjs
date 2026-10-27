import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execute, main, schedulerGuidance } from './run.mjs';
import { readConfig, CONFIRMATION, safeError, GuardError } from './guard.mjs';
import { newFixture, requireFixture } from './fixture.mjs';
import { validateResult } from './assertions.mjs';
import { waitForBlocking, provesWaiting, deadline } from './observe.mjs';
import { insufficient } from './competitors.mjs';

const env = () => ({ PLAN_COPY_DATABASE_URL: 'postgresql://qa_admin:synthetic-password@127.0.0.1:5432/fintrack_copy',
  PLAN_COPY_EXPECTED_HOST: '127.0.0.1', PLAN_COPY_EXPECTED_PORT: '5432', PLAN_COPY_EXPECTED_DATABASE: 'fintrack_copy',
  PLAN_COPY_EXPECTED_LOGIN_ROLE: 'qa_admin', PLAN_COPY_EXPECTED_SERVER_ADDRS: '127.0.0.1',
  PLAN_COPY_ID: '11111111-1111-4111-8111-111111111111', PLAN_COPY_CONFIRM: CONFIRMATION });
const validTotals = winner => ({ current_amount: '200.0000', cash_sum: '200.0000', debits: 1, mirrors: 1,
  cash_rows: 2, mirror_rows: 2, checks: winner === 'plan' ? 1 : 0,
  ledger_receipts: winner === 'ledger' ? 1 : 0, bad_cash_links: 0, orphan_mirrors: 0 });

/** No pg import, sockets, SQL engine or app environment. This is a protocol mock,
 * NOT proof that PostgreSQL accepts SQL, blocks locks, or enforces RLS. */
function mockPg(fault = {}) {
  const state = { clients: [], connects: 0, events: [], holder: null, pending: null, winner: null, fixtureWrites: 0 };
  class MockClient {
    constructor(options) { this.options = options; this.label = ['A', 'B', 'observer'][state.clients.length]; this.pid = 1100 + state.clients.length; this.uid = null; state.clients.push(this); }
    on() {}
    async connect() {
      state.connects++;
      if (fault.hangConnect) return new Promise((_, reject) => { this.hanging = reject; });
      if (fault.connectFailure) throw new Error('postgresql://qa_admin:secret@host/db');
    }
    async end() {
      this.ended = true; this.hanging?.(new Error('closed'));
      if (state.pending) { state.pending.reject(new Error('closed')); state.pending = null; }
    }
    async query(sql, params = []) {
      state.events.push({ session: this.label, sql, params });
      if (this.ended) throw new Error('closed');
      const rows = value => ({ rows: value });
      if (sql.includes('copy:identity')) return rows([{ db: fault.database || 'fintrack_copy', login_role: 'qa_admin', current_role: 'qa_admin',
        server_addr: fault.address || '127.0.0.1', server_port: 5432, pid: fault.samePid ? 1 : this.pid,
        read_only: fault.writable ? 'off' : 'on', can_assume_authenticated: !fault.roleDenied }]);
      if (sql.includes('copy:marker-acl')) return rows([{ unsafe: !!fault.markerWritable }]);
      if (sql.includes('copy:marker')) return rows([{ copy_id: fault.marker || env().PLAN_COPY_ID, database_name: 'fintrack_copy',
        purpose: 'fintrack-disposable-concurrency-copy', outbound_disabled: !fault.outbound, fixture_triggers_reviewed: !fault.triggersUnreviewed }]);
      if (sql.includes('copy:capabilities')) return rows([{ writer_ready: !fault.noWriter, cron_table: fault.badCron ? null : 'cron.job', cron_installed: true,
        queue_table: fault.badQueue ? null : 'net.http_request_queue', net_installed: true, vault_table: 'vault.decrypted_secrets',
        can_seed_user: !fault.seedDenied, can_read_links: !fault.linksDenied, can_read_receipts: !fault.receiptsDenied }]);
      if (sql.includes('copy:scheduler')) {
        if (fault.permission) throw Object.assign(new Error('secret SQL detail'), { code: '42501' });
        return rows(fault.active ? [{ id: '7', active: true, unresolved_command: false }]
          : fault.unresolvedJob ? [{ id: '7', active: false, unresolved_command: true }] : []);
      }
      if (sql.includes('copy:queue')) return rows([{ pending: fault.queue ? '1' : '0' }]);
      if (sql.includes('copy:vault-url')) return rows([{ entries: 1, unsafe: !!fault.productionUrl }]);
      if (sql.includes('copy:visibility')) return rows(fault.hiddenSessions ? [] : state.clients.map(c => ({ pid: c.pid, usename: 'qa_admin', application_name: c.options.application_name })));
      if (sql.includes('copy:today')) return rows([{ day: fault.midnight && this.label === 'B' ? '2026-10-29' : '2026-10-28' }]);
      if (sql.includes("set_config('request.jwt.claim.sub'")) { this.uid = params[0]; return rows([]); }
      if (sql.includes('copy:auth-check')) return rows([{ role: 'authenticated', uid: this.uid }]);
      if (sql.includes('copy:seed-user')) {
        state.fixtureWrites++;
        if (fault.seedFailure) throw Object.assign(new Error('password=secret'), { code: '23514' });
        return rows([]);
      }
      if (sql.includes('copy:opening')) { state.winner = null; return rows([]); }
      if (sql.includes('copy:seed-plan')) return rows([{ id: randomUUID() }]);
      if (sql.includes('copy:plan-debit') || sql.includes('copy:ledger-debit')) {
        this.kind = sql.includes('copy:plan-debit') ? 'plan' : 'ledger';
        if (!state.holder) { state.holder = this; return rows([{ cash_id: randomUUID() }]); }
        if (fault.earlyB) return rows([{ cash_id: randomUUID() }]);
        return new Promise((resolve, reject) => { state.pending = { resolve, reject, client: this }; });
      }
      if (sql === 'commit' || sql === 'rollback') {
        this.uid = null;
        if (state.holder === this) {
          if (sql === 'commit') state.winner = this.kind;
          const pending = state.pending; state.holder = null; state.pending = null;
          if (pending) {
            if (fault.deadlock) pending.reject(Object.assign(new Error('contains secret'), { code: '40P01' }));
            else if (sql === 'commit') pending.reject(Object.assign(new Error(fault.wrongRejection ? 'Different validation failure' : 'Insufficient bucket balance'), { code: 'P0001' }));
            else { state.holder = pending.client; pending.resolve(rows([{ cash_id: randomUUID() }])); }
          }
        }
        return rows([]);
      }
      if (sql.includes('copy:wait')) return rows(state.clients.slice(0, 2).map(c => ({ pid: c.pid,
        state: 'active', wait_event_type: c.label === 'B' && state.pending && !fault.noWait ? 'Lock' : null,
        wait_event: 'advisory', blockers: c.label === 'B' && state.pending && !fault.noWait ? [state.clients[0].pid] : [] })));
      if (sql.includes('copy:locks')) return rows(state.pending && !fault.noWait ? [{ pid: state.clients[1].pid, locktype: 'advisory', mode: 'ExclusiveLock', granted: false, class_id: '761', object_id: '1', objsubid: 1 }] : []);
      if (sql.includes('copy:result')) return rows([{ ...validTotals(state.winner), ...(fault.badTotal ? { cash_sum: '-600' } : {}) }]);
      if (sql === 'begin read write' || sql === 'set local role authenticated' || sql === 'select pg_stat_clear_snapshot()' || sql.includes('copy:seed-portfolio')) return rows([]);
      throw new Error('Unexpected mock query');
    }
  }
  return { Client: MockClient, state };
}
const fastClock = () => { let t = 0; return { now: () => t, sleep: async ms => { t += ms; }, timeoutMs: 300 }; };

for (const [name, patch] of [
  ['missing URL', { PLAN_COPY_DATABASE_URL: undefined }], ['bad confirmation', { PLAN_COPY_CONFIRM: 'yes' }],
  ['invalid URL', { PLAN_COPY_DATABASE_URL: 'bad' }], ['non-postgres URL', { PLAN_COPY_DATABASE_URL: 'https://qa_admin:pw@127.0.0.1:5432/fintrack_copy' }],
  ['wrong host', { PLAN_COPY_EXPECTED_HOST: 'another.invalid' }], ['wrong database', { PLAN_COPY_EXPECTED_DATABASE: 'other' }],
  ['wrong port', { PLAN_COPY_EXPECTED_PORT: '5433' }], ['wrong login', { PLAN_COPY_EXPECTED_LOGIN_ROLE: 'other' }],
  ['missing marker ID', { PLAN_COPY_ID: '' }], ['invalid address', { PLAN_COPY_EXPECTED_SERVER_ADDRS: '*' }],
  ['URL option injection', { PLAN_COPY_DATABASE_URL: env().PLAN_COPY_DATABASE_URL + '?options=-c%20role=postgres' }],
  ['URL fragment', { PLAN_COPY_DATABASE_URL: env().PLAN_COPY_DATABASE_URL + '#secret' }],
  ['known production host', { PLAN_COPY_DATABASE_URL: 'postgresql://qa_admin:pw@db.sbojwnbwfepdvtsmzvwc.supabase.co:5432/fintrack_copy', PLAN_COPY_EXPECTED_HOST: 'db.sbojwnbwfepdvtsmzvwc.supabase.co' }],
  ['pooler', { PLAN_COPY_DATABASE_URL: 'postgresql://qa_admin:pw@aws-0-test.pooler.supabase.com:5432/fintrack_copy', PLAN_COPY_EXPECTED_HOST: 'aws-0-test.pooler.supabase.com' }],
  ['encoded production user', { PLAN_COPY_DATABASE_URL: 'postgresql://sbojwnbwfepdvtsmzvwc:pw@127.0.0.1:5432/fintrack_copy', PLAN_COPY_EXPECTED_LOGIN_ROLE: 'sbojwnbwfepdvtsmzvwc' }],
  ['no password', { PLAN_COPY_DATABASE_URL: 'postgresql://qa_admin@127.0.0.1:5432/fintrack_copy' }],
]) test(`guard: ${name}; mock pg.Client connect = 0`, async () => {
  const mock = mockPg(); let loads = 0;
  await assert.rejects(() => execute({ ...env(), ...patch }, { Client: mock.Client, loadClient: async () => { loads++; return mock.Client; } }), GuardError);
  assert.equal(mock.state.connects, 0); assert.equal(mock.state.clients.length, 0); assert.equal(loads, 0);
});
test('invalid guard also prevents dynamic driver import without injected Client', async () => {
  let loads = 0; await assert.rejects(() => execute({}, { loadClient: async () => { loads++; throw new Error('must not load'); } }), GuardError); assert.equal(loads, 0);
});
test('only explicit PLAN_COPY configuration is used; TLS is verified for remote host', () => {
  const e = { ...env(), DATABASE_URL: 'production-secret', PGHOST: 'production', PGOPTIONS: 'unsafe', PLAN_COPY_DATABASE_URL: 'postgresql://qa_admin:pw@copy.example.test:5432/fintrack_copy', PLAN_COPY_EXPECTED_HOST: 'copy.example.test' };
  const c = readConfig(e); assert.equal(c.host, 'copy.example.test'); assert.deepEqual(c.ssl, { rejectUnauthorized: true }); assert.match(c.options, /read_only=on/); assert.ok(!JSON.stringify(c).includes('production-secret'));
});
for (const fault of ['database', 'address', 'samePid', 'writable', 'roleDenied', 'marker', 'markerWritable', 'outbound', 'triggersUnreviewed', 'noWriter', 'seedDenied', 'linksDenied', 'receiptsDenied', 'badCron', 'badQueue', 'active', 'unresolvedJob', 'queue', 'productionUrl', 'permission', 'hiddenSessions']) {
  test(`preflight ${fault}: no fixture writes; all sessions closed`, async () => {
    const mock = mockPg({ [fault]: ['database', 'address', 'marker'].includes(fault) ? 'mismatch' : true });
    const report = await execute(env(), { Client: mock.Client });
    assert.equal(report.passed, false); assert.equal(mock.state.fixtureWrites, 0);
    assert.equal(report.connectionsClosed, true); assert.ok(mock.state.clients.every(c => c.ended));
  });
}
test('all three mocked races: wait evidence precedes A release; fresh fixtures, exact final counts', async () => {
  const mock = mockPg(), saved = [];
  const report = await execute(env(), { Client: mock.Client, save: async r => saved.push(structuredClone(r)) });
  assert.equal(report.passed, true); assert.equal(mock.state.connects, 3); assert.equal(report.rounds.length, 3);
  assert.ok(report.rounds.every(r => r.observedWaiting && r.passed && r.totals.cash_sum === '200.00'));
  assert.deepEqual(report.rounds.map(r => r.bOutcome), ['rejected_insufficient', 'rejected_insufficient', 'committed_once']);
  for (const key of ['owner', 'portfolio', 'bucket', 'plan', 'openingRequest', 'ledgerRequest']) assert.equal(new Set(report.fixtures.map(f => f[key])).size, 3);
  assert.ok(saved.some(r => r.fixtures.length === 1 && r.fixtures[0].plan === null));
  for (let i = 0; i < mock.state.events.length; i++) {
    const event = mock.state.events[i];
    if (event.session === 'A' && ['commit', 'rollback'].includes(event.sql)) {
      const before = mock.state.events.slice(0, i), lastDebit = before.findLastIndex(e => e.sql.includes('copy:plan-debit') || e.sql.includes('copy:ledger-debit'));
      const lastSeed = before.findLastIndex(e => e.sql.includes('copy:seed-plan'));
      if (lastDebit > lastSeed) assert.ok(before.slice(lastDebit).some(e => e.sql.includes('copy:locks')));
    }
  }
  assert.ok(mock.state.events.filter(e => e.session === 'observer').every(e => !/begin read write|insert into|delete from|update public|alter |grant /i.test(e.sql)));
  assert.equal(mock.state.events.filter(e => e.sql.includes('copy:opening')).length, 3);
  assert.ok(mock.state.events.filter(e => e.sql.includes('copy:seed-plan')).every(e => e.sql.includes("800,'day','expense'")));
  assert.ok(!mock.state.events.some(e => /delete from auth|update public.money_buckets|truncate /i.test(e.sql)));
});
for (const fault of ['noWait', 'earlyB', 'wrongRejection', 'deadlock', 'badTotal', 'midnight', 'seedFailure', 'connectFailure']) {
  test(`failure ${fault}: never accepted; rollback/close and sanitized report`, async () => {
    const mock = mockPg({ [fault]: true });
    const report = await execute(env(), { Client: mock.Client, waitOptions: fastClock() });
    assert.equal(report.passed, false); assert.ok(mock.state.clients.every(c => c.ended));
    assert.ok(!JSON.stringify(report).includes('secret'));
    if (fault === 'deadlock') assert.equal(report.rounds[0].bError.sqlstate, '40P01');
    if (fault === 'seedFailure') assert.ok(mock.state.events.some(e => e.sql === 'rollback'));
    if (fault === 'badTotal') assert.equal(report.rounds[0].actual.cash_sum, '-600');
  });
}
test('watchdog closes clients and reports failure, never retries or purges', async () => {
  const mock = mockPg({ hangConnect: true });
  const report = await execute(env(), { Client: mock.Client, runTimeoutMs: 10 });
  assert.equal(report.error.code, 'RUN_WATCHDOG_TIMEOUT'); assert.ok(mock.state.clients.every(c => c.ended)); assert.equal(mock.state.fixtureWrites, 0);
});
test('interrupt closes connections without leaking an active watchdog timer', async () => {
  const mock = mockPg({ hangConnect: true }), controller = new AbortController();
  const pending = execute(env(), { Client: mock.Client, signal: controller.signal }); controller.abort();
  const report = await pending; assert.equal(report.error.code, 'RUN_INTERRUPTED'); assert.ok(mock.state.clients.every(c => c.ended));
});
test('abort before startup creates no connection attempts', async () => {
  const mock = mockPg(), controller = new AbortController(); controller.abort();
  const report = await execute(env(), { Client: mock.Client, signal: controller.signal });
  assert.equal(report.passed, false); assert.equal(mock.state.connects, 0);
});
test('late checkpoint after watchdog cannot start seed SQL', async () => {
  const mock = mockPg(); let release;
  const report = await execute(env(), { Client: mock.Client, runTimeoutMs: 10,
    save: async r => { if (!r.finishedAt) await new Promise(resolve => { release = resolve; }); } });
  assert.equal(report.error.code, 'RUN_WATCHDOG_TIMEOUT'); release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(mock.state.fixtureWrites, 0); assert.ok(mock.state.clients.every(c => c.ended));
});
test('scheduler guidance starts with read-only inspection; writes labelled manual templates', () => {
  const guidance = schedulerGuidance();
  assert.ok(guidance.indexOf('READ ONLY') < guidance.indexOf('COPY MUTATION TEMPLATE'));
  assert.match(guidance, /NOT EXECUTED/); assert.match(guidance, /cron\.job/); assert.match(guidance, /net\.http_request_queue/);
});
test('only real wait evidence qualifies; stale/other blocker is rejected', () => {
  assert.equal(provesWaiting({ activity: [{ pid: 2, wait_event_type: 'Lock', blockers: [3] }], locks: [{ pid: 2, granted: false }] }, 1, 2), false);
  assert.equal(provesWaiting({ activity: [{ pid: 2, wait_event_type: 'Lock', blockers: [1] }], locks: [{ pid: 2, granted: true }] }, 1, 2), false);
});
test('financial assertions reject partial rows, receipts and orphan mirrors', () => {
  for (const key of ['current_amount', 'cash_sum', 'debits', 'mirrors', 'cash_rows', 'mirror_rows', 'checks', 'ledger_receipts', 'bad_cash_links', 'orphan_mirrors']) {
    const row = validTotals('plan'); row[key] = 99; assert.throws(() => validateResult(row, 'plan'), GuardError);
  }
});
test('cannot pass externally supplied fixture IDs; generated identities are unique', () => {
  assert.throws(() => requireFixture({ owner: randomUUID() }), GuardError);
  const a = newFixture(randomUUID(), 1), b = newFixture(randomUUID(), 1); requireFixture(a, false); assert.notEqual(a.owner, b.owner);
});
test('insufficient acceptance is narrow; raw messages/details never reach output', () => {
  assert.equal(insufficient({ code: 'P0001', message: 'Something else' }), false);
  assert.equal(insufficient({ code: '55P03', message: 'Insufficient bucket balance' }), false);
  const result = safeError({ code: '40P01', message: 'postgresql://user:pass@host/db', detail: 'Bearer SECRET' });
  assert.deepEqual(result, { code: 'DEADLOCK', sqlstate: '40P01' });
});
test('CLI help/unknown arguments require no DB driver or env', async () => {
  assert.equal(await main(['--help'], {}), 0); assert.equal(await main(['--anything'], {}), 2);
});
test('source has no dotenv, application imports, pool or automatic cleanup', () => {
  for (const file of ['run.mjs', 'guard.mjs', 'fixture.mjs', 'competitors.mjs', 'observe.mjs', 'assertions.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"]dotenv|from ['"].*src\/|new Pool\(|delete from auth\.users|purge_my_financial_data/i);
  }
});
