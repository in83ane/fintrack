import { db } from './supabase';
import { MemoryResource } from './memory-resource';

// Read every page before publishing a snapshot. Filtering a capped All response
// would otherwise omit a selected portfolio's older records.
async function readAll<T, R extends {data: T[] | null; error: unknown}>(reader: (range: {from:number;to:number}) => Promise<R>): Promise<R> {
  const size = 500;
  let result = await reader({from:0,to:size-1});
  if (result.error || !result.data || result.data.length < size) return result;
  const data = [...result.data];
  for (let from = size; ; from += size) {
    const next = await reader({from,to:from+size-1});
    if (next.error) return next;
    data.push(...(next.data || []));
    if (!next.data || next.data.length < size) break;
  }
  return {...result, data};
}
const fetchSnapshot = (userId: string) => Promise.all([
  readAll(range=>db.assets.getAll(userId, null, range)), readAll(range=>db.trades.getAll(userId, null, range)),
  readAll(range=>db.allocations.getAll(userId, null, range)), readAll(range=>db.buckets.getAll(userId, null, range)),
  readAll(range=>db.bucketActivities.getAll(userId, null, range)), readAll(range=>db.cashActivities.getAll(userId, null, range)),
  readAll(range=>db.userCategories.getAll(userId, null, range)), readAll(range=>db.brokerageAccounts.getAll(userId, null, range)),
  readAll(range=>db.brokerageCashEntries.getBalances(userId, null, range)), readAll(range=>db.brokerageCashEntries.getAll(userId, null, range)),
]);
type Snapshot = Awaited<ReturnType<typeof fetchSnapshot>>;
export const financialSnapshots = new MemoryResource<Snapshot>();
/** Invalidate after completion too, so a read during a write cannot stay fresh. */
export function afterFinancialWrite<T>(result: T): T { financialSnapshots.invalidate(); return result; }
export function readFinancialSnapshot(userId: string) {
  return financialSnapshots.read(userId, async () => {
    const result = await fetchSnapshot(userId);
    const failure = result.find(row => row.error)?.error;
    if (failure) throw failure;
    return result;
  });
}
function scope<T extends { portfolio_id?: string | null }, R extends { data: T[] | null }>(result: R, portfolioId: string | null): R {
  return portfolioId ? { ...result, data: result.data?.filter(row => row.portfolio_id === portfolioId) || null } : result;
}
/** Same equality filters as the existing database helpers; no financial calculations. */
function project(snapshot: Snapshot, tradingId: string | null, cashId: string | null, selectedId: string | null) {
  const [assets, trades, allocations, buckets, bucketActivities, cashActivities, categories, accounts, balances, entries] = snapshot;
  return [scope(assets, tradingId), scope(trades, tradingId), scope(allocations, tradingId), buckets,
    scope(bucketActivities, cashId), scope(cashActivities, cashId), scope(categories, selectedId),
    scope(accounts, tradingId), accounts, balances, scope(entries, tradingId)] as const;
}
const scoped = new WeakMap<Snapshot, Map<string, ReturnType<typeof project>>>();
export function scopeFinancialSnapshot(snapshot: Snapshot, tradingId: string | null, cashId: string | null, selectedId: string | null) {
  let portfolios = scoped.get(snapshot);
  if (!portfolios) { portfolios = new Map(); scoped.set(snapshot, portfolios); }
  const key = JSON.stringify([tradingId, cashId, selectedId]);
  if (!portfolios.has(key)) portfolios.set(key, project(snapshot, tradingId, cashId, selectedId));
  return portfolios.get(key)!;
}
