import { getCashflowSummary, localCashflowDay, transactionMoney, type CashflowRecord, type CashflowScope, type CashflowEntry } from './cashflow-selectors';

export type LedgerFilter = 'all' | 'cash' | 'transfer' | 'trade';
export type LedgerRow = CashflowEntry & { source: 'cash' | 'trade' | 'broker'; title: string; note: string; signedMinor: number; included: boolean };
export type BrokerMovement = { id: string; occurredAt: string; type: string; amount: number; currency: string; portfolioId: string; accountId: string; tradeId?: string; note?: string };

/** One visible-row projection feeds the strip, day nets, selection and export. */
export function getLedgerView(records: readonly CashflowRecord[], scope: CashflowScope, filter: LedgerFilter = 'cash', pending: readonly string[] = [], brokerEntries: readonly BrokerMovement[] = []) {
  const hidden = new Set(pending);
  const base = getCashflowSummary(records, { ...scope, includeInvestments: filter === 'all' || filter === 'trade' });
  const rows: LedgerRow[] = base.entries.filter(entry => {
    if (hidden.has(entry.id)) return false;
    const trade = entry.id.startsWith('trade:');
    return filter === 'all' || (filter === 'transfer' ? entry.kind === 'transfer' : filter === 'trade' ? trade : entry.kind !== 'transfer' && (!trade || entry.kind === 'income'));
  }).map(entry => ({ ...entry, source: entry.id.startsWith('trade:') ? 'trade' : 'cash', title: entry.category, note: entry.record.note || '',
    signedMinor: ['income', 'proceeds'].includes(entry.kind) || (entry.kind === 'transfer' && entry.record.type === 'DEPOSIT') ? entry.minor : -entry.minor, included: entry.kind !== 'transfer' }));
  // Cash funding entries are informational transfers. Trade-linked entries are already
  // represented by trades and must not be counted twice.
  if (filter === 'all' || filter === 'transfer') for (const entry of brokerEntries) {
    if (entry.tradeId || entry.type.startsWith('TRADE_')) continue;
    const day = localCashflowDay(entry.occurredAt), walletId = `broker:${entry.accountId}`, id = `broker:${entry.id}`;
    if (hidden.has(id) || (scope.portfolioId && scope.portfolioId !== '__all_portfolios__' && entry.portfolioId !== scope.portfolioId) || (scope.walletId && scope.walletId !== 'all' && walletId !== scope.walletId) || (scope.from && day < scope.from) || (scope.to && day > scope.to)) continue;
    const record = { id: entry.id, type: entry.type, date: entry.occurredAt, originalAmount: Math.abs(entry.amount), currency: entry.currency, isTransfer: true };
    const money = transactionMoney(record, scope);
    if (!money) continue;
    rows.push({ ...money, id, record, day, walletId, kind: 'transfer', category: entry.type, title: entry.type, note: entry.note || '', source: 'broker', signedMinor: entry.type === 'WITHDRAW' || entry.amount < 0 ? -money.minor : money.minor, included: false });
  }
  rows.sort((a,b) => b.record.date.localeCompare(a.record.date) || b.id.localeCompare(a.id));
  const totals = (items: LedgerRow[]) => {
    let inMinor = 0, outMinor = 0;
    for (const row of items) if (row.included) { if (row.signedMinor >= 0) inMinor += row.minor; else outMinor += row.minor; }
    return { inMinor, outMinor, netMinor: inMinor - outMinor };
  };
  const grouped = new Map<string, LedgerRow[]>();
  rows.forEach(row => grouped.set(row.day, [...(grouped.get(row.day) || []), row]));
  return { rows, ...totals(rows), groups: [...grouped].map(([day, entries]) => ({ day, rows: entries, ...totals(entries) })), missing: base.missing };
}
