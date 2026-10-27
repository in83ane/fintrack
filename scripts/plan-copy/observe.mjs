import { GuardError, requireSafe } from './guard.mjs';

export const WAIT_SQL = `/* copy:wait */ select pid, state, wait_event_type, wait_event,
 pg_blocking_pids(pid) blockers from pg_stat_activity where pid=any($1::int[])`;
export const LOCK_SQL = `/* copy:locks */ select pid,locktype,mode,granted,
 relation::text relation_id, classid::text class_id, objid::text object_id,
 objsubid, transactionid::text transaction_id
 from pg_locks where pid=any($1::int[]) order by pid,locktype,mode,granted`;
const text = v => v == null ? null : String(v).replace(/[^A-Za-z0-9_ :/-]/g, '').slice(0, 80);
export async function snapshot(observer, pids) {
  await observer.query('select pg_stat_clear_snapshot()');
  const activity = (await observer.query(WAIT_SQL, [pids])).rows.map(r => ({
    pid: Number(r.pid), state: text(r.state), wait_event_type: text(r.wait_event_type), wait_event: text(r.wait_event),
    blockers: (r.blockers || []).map(Number),
  }));
  const locks = (await observer.query(LOCK_SQL, [pids])).rows.map(r => ({
    pid: Number(r.pid), locktype: text(r.locktype), mode: text(r.mode), granted: r.granted === true,
    relation_id: text(r.relation_id), class_id: text(r.class_id), object_id: text(r.object_id),
    objsubid: Number(r.objsubid), transaction_id: text(r.transaction_id),
  }));
  return { at: new Date().toISOString(), activity, locks };
}
export function provesWaiting(s, a, b) {
  return s.activity.some(r => r.pid === b && r.wait_event_type === 'Lock' && r.blockers.includes(a))
    && s.locks.some(r => r.pid === b && !r.granted);
}
export async function waitForBlocking(observer, a, b, evidence, settled, options = {}) {
  const now = options.now || (() => performance.now());
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const limit = options.timeoutMs ?? 5000, start = now();
  while (now() - start < limit) {
    requireSafe(!settled(), 'B_FINISHED_WITHOUT_OBSERVED_WAIT');
    const s = await snapshot(observer, [a, b]); evidence.push(s);
    if (provesWaiting(s, a, b)) return;
    await sleep(100);
  }
  throw new GuardError('BLOCKING_NOT_PROVEN');
}
export async function deadline(body, ms, signal) {
  if (signal?.aborted) throw new GuardError('RUN_INTERRUPTED');
  let timer, listener;
  try {
    const cancellation = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new GuardError('RUN_WATCHDOG_TIMEOUT')), ms);
      listener = () => reject(new GuardError('RUN_INTERRUPTED'));
      signal?.addEventListener('abort', listener, { once: true });
    });
    return await Promise.race([body(), cancellation]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', listener); }
}
export async function closeClients(clients) {
  // pg.Client.end() closes an active connection too; the server rolls back an open transaction.
  // No reconnect, background retry, deleting fixtures or broad pg_terminate_backend.
  const results = await Promise.allSettled(clients.map(c => deadline(() => c.end(), 3000)));
  return results.every(r => r.status === 'fulfilled');
}
