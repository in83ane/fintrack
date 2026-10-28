import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readConfig, clientConfig, preflight, requireSafe, safeError, GuardError } from './guard.mjs';
import { newFixture, createFixture } from './fixture.mjs';
import { SCENARIOS, beginActor, perform, insufficient } from './competitors.mjs';
import { waitForBlocking, snapshot, deadline, closeClients } from './observe.mjs';
import { verifyResult } from './assertions.mjs';

export async function runRound({ a, b, observer, pids, fixture, scenario, result, waitOptions }) {
  let aOpen = false, bOpen = false;
  try {
    aOpen = true; await beginActor(a, fixture);
    await perform(a, scenario.first, fixture);
    bOpen = true; await beginActor(b, fixture);
    let done = false;
    // Attach rejection handling immediately so no background rejection is lost.
    const pending = perform(b, scenario.second, fixture).then(
      () => { done = true; return { ok: true }; },
      error => { done = true; return { ok: false, error }; },
    );
    try {
      await waitForBlocking(observer, pids[0], pids[1], result.lockSnapshots, () => done, waitOptions);
    } catch (error) {
      const outcome = done ? await pending : null;
      if (outcome && !outcome.ok) result.bError = safeError(outcome.error);
      throw error;
    }
    result.observedWaiting = true;
    await a.query(scenario.release); aOpen = false;
    const outcome = await pending;
    if (scenario.release === 'commit') {
      if (!outcome.ok) result.bError = safeError(outcome.error);
      requireSafe(!outcome.ok && insufficient(outcome.error), 'B_MUST_REJECT_INSUFFICIENT');
      await b.query('rollback'); bOpen = false;
      result.bOutcome = 'rejected_insufficient';
    } else {
      if (!outcome.ok) result.bError = safeError(outcome.error);
      requireSafe(outcome.ok, 'B_MUST_SUCCEED_AFTER_ROLLBACK');
      await b.query('commit'); bOpen = false;
      result.bOutcome = 'committed_once';
    }
    result.totals = await verifyResult(observer, fixture, scenario.winner, result);
    result.passed = true;
    return result;
  } catch (error) {
    result.error = safeError(error);
    try { result.lockSnapshots.push(await snapshot(observer, pids.slice(0, 2))); } catch { result.finalSnapshotUnavailable = true; }
    throw error;
  } finally {
    // A rollback releases B before issuing rollback on B's queued connection.
    if (aOpen) await a.query('rollback').catch(() => {});
    if (bOpen) await b.query('rollback').catch(() => {});
  }
}

/** Dependency-injected entry point. Offline tests supply MockClient, never pg. */
export async function execute(env, { Client, loadClient, save = async () => {}, signal, runTimeoutMs = 180000, waitOptions } = {}) {
  const config = readConfig(env); // Must precede driver loading, construction and connect.
  const Driver = Client || await (loadClient || (async () => (await import('pg')).Client))();
  const report = { runId: randomUUID(), mode: config.mode, startedAt: new Date().toISOString(),
    copyId: config.copyId, passed: false, fixtures: [], rounds: [], sessionErrors: [] };
  const clients = [];
  let stopping = false;
  const checkRunning = () => requireSafe(!stopping && !signal?.aborted, 'RUN_INTERRUPTED');
  const checkpoint = async () => { checkRunning(); await save(report); checkRunning(); };
  try {
    for (const label of ['A', 'B', 'observer']) {
      const raw = new Driver(clientConfig(config, report.runId, label));
      raw.on?.('error', error => report.sessionErrors.push({ session: label, ...safeError(error) }));
      // Watchdog/abort must prevent late async continuations issuing new SQL.
      clients.push({
        connect: async () => { checkRunning(); await raw.connect(); checkRunning(); },
        query: async (...args) => { checkRunning(); const result = await raw.query(...args); checkRunning(); return result; },
        end: () => raw.end(),
      });
    }
    await deadline(async () => {
      for (const c of clients) await c.connect();
      for (const [index, scenario] of SCENARIOS.entries()) {
        // Recheck identity/marker/scheduler before every fresh fixture.
        report.preflight = await preflight(clients, config);
        const f = newFixture(report.runId, index + 1); report.fixtures.push(f);
        await createFixture(clients[0], f, checkpoint);
        const result = { round: index + 1, name: scenario.name, passed: false, observedWaiting: false, lockSnapshots: [] };
        report.rounds.push(result); await checkpoint();
        await runRound({ a: clients[0], b: clients[1], observer: clients[2], pids: report.preflight.pids,
          fixture: f, scenario, result, waitOptions });
        await checkpoint();
      }
      requireSafe(report.sessionErrors.length === 0, 'SESSION_ERRORS_RECORDED');
      report.passed = true;
    }, runTimeoutMs, signal);
  } catch (error) { report.error = safeError(error); }
  finally {
    stopping = true;
    report.connectionsClosed = await closeClients(clients);
    if (!report.connectionsClosed) { report.passed = false; report.error = { code: 'CONNECTION_CLOSE_UNCONFIRMED' }; }
    report.finishedAt = new Date().toISOString();
    await save(report);
  }
  return report;
}

export async function main(args = process.argv.slice(2), env = process.env) {
  if (!args.length || (args.length === 1 && args[0] === '--help')) {
    console.log('No connection made. Read scripts/plan-copy/README.md. Offline: npm test --prefix scripts/plan-copy. Copy integration requires explicit --run and all PLAN_COPY_* guards.');
    return 0;
  }
  if (args.length !== 1 || args[0] !== '--run') { console.error('INVALID_ARGUMENTS'); return 2; }
  const abort = new AbortController(), stop = () => abort.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const reportDir = join(dirname(fileURLToPath(import.meta.url)), 'reports');
    const report = await execute(env, { signal: abort.signal, save: async report => {
      await mkdir(reportDir, { recursive: true });
      await writeFile(join(reportDir, `${report.runId}.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
    } });
    console.table(report.rounds.map(r => ({ round: r.round, waited: r.observedWaiting, ...(r.actual || r.totals), passed: r.passed })));
    console.log(JSON.stringify({ passed: report.passed, runId: report.runId, error: report.error,
      evidence: join(reportDir, `${report.runId}.json`), fixtureCleanup: 'none' }));
    if (!report.passed && /SCHEDULER|QUEUE|WORKER_URL|INVENTORY/.test(report.error?.code || '')) console.error(schedulerGuidance());
    return report.passed ? 0 : 1;
  } catch (error) { console.error(JSON.stringify(safeError(error))); return 2; }
  finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
export function schedulerGuidance() {
  return [
    'STOP: verify the COPY in your admin client. These are manual templates; the harness executes none of them.',
    'READ ONLY (when relation exists): select jobid, active from cron.job order by jobid;',
    'READ ONLY (when relation exists): select id from net.http_request_queue order by id;',
    "READ ONLY: select id, decrypted_secret = 'https://disabled.invalid' as neutralized from vault.decrypted_secrets where name='fintrack_price_alert_url';",
    'After inspection and with copy egress blocked: see README for exact scoped operator actions.',
    "COPY MUTATION TEMPLATE, NOT EXECUTED: select cron.alter_job(job_id := <reviewed_job_id>, active := false, command := 'SELECT 1');",
    'Do not run these on production or change grants/guards to bypass a failure.',
  ].join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
