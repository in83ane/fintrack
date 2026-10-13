export type HoldingSort = 'custom' | 'name-asc' | 'name-desc' | 'value-desc' | 'value-asc' | 'return-desc' | 'return-asc' | 'day-desc' | 'day-asc' | 'unrealized-asc' | 'unrealized-desc';
export type HoldingSortField = 'name' | 'value' | 'return' | 'day' | 'unrealized';
export function toggleHoldingSort(current: HoldingSort, field: HoldingSortField): HoldingSort {
  return current === `${field}-desc` ? `${field}-asc` : current === `${field}-asc` ? `${field}-desc` : `${field}-${field === 'name' ? 'asc' : 'desc'}`;
}
export function filterHoldings<T extends { symbol: string; name?: string }>(rows: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return rows.filter(row => `${row.symbol} ${row.name ?? ''}`.toLocaleLowerCase().includes(needle));
}
type Sortable = { id: string; symbol: string; shares: number; price: number; avgCost: number; investedCost?: number; realizedPL?: number; dividends?: number; isFavorite?: boolean; sortOrder?: number; dayChangePercent?: number | null };
export function orderHoldings<T extends Sortable>(rows: readonly T[], sort: HoldingSort, favoritesFirst: boolean) {
  const metric = (h: T) => sort.startsWith('day') ? h.dayChangePercent ?? null : sort.startsWith('return')
    ? (h.investedCost ?? h.avgCost * h.shares) > 0 ? ((h.price - h.avgCost) * h.shares + (h.realizedPL || 0) + (h.dividends || 0)) / (h.investedCost ?? h.avgCost * h.shares) * 100 : null
    : sort.startsWith('unrealized') ? h.avgCost > 0 ? (h.price - h.avgCost) / h.avgCost * 100 : null
    : sort.startsWith('value') ? h.price * h.shares : h.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) => {
    if (favoritesFirst && !!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1;
    if (sort.startsWith('name')) return (sort.endsWith('desc') ? -1 : 1) * a.symbol.localeCompare(b.symbol);
    const x = metric(a), y = metric(b);
    const validX = x !== null && Number.isFinite(x), validY = y !== null && Number.isFinite(y);
    if (validX !== validY) return validX ? -1 : 1;
    return (validX && validY ? (x! - y!) * (sort.endsWith('desc') ? -1 : 1) : 0) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id);
  });
}

/** Move within one broker only; never reorder or drop another broker's assets. */
export function moveHoldingBefore<T extends Sortable & { brokerId: string }>(rows: readonly T[], source: string, target: string): T[] | null {
  const from = rows.find(h => h.id === source), to = rows.find(h => h.id === target);
  if (!from || !to || source === target || from.brokerId !== to.brokerId) return null;
  const ordered = orderHoldings(rows.filter(h => h.brokerId === from.brokerId), 'custom', false).filter(h => h.id !== source);
  ordered.splice(ordered.findIndex(h => h.id === target), 0, from);
  return ordered;
}

/** The 1-day chart's reference close is the previous trading session, not the 1-month chart baseline. */
export function dailyMove(price: number, dailyMeta: Record<string, unknown>, intradayMeta?: Record<string, unknown>) {
  const previous = [intradayMeta?.previousClose, intradayMeta?.chartPreviousClose, dailyMeta.regularMarketPreviousClose, dailyMeta.previousClose]
    .find(value => typeof value === 'number' && Number.isFinite(value) && value > 0) as number | undefined;
  if (!previous || !Number.isFinite(price) || price <= 0) return { previousClose: null, dayChange: null, dayChangePercent: null };
  return { previousClose: previous, dayChange: price - previous, dayChangePercent: (price - previous) / previous * 100 };
}
