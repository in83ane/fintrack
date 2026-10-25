import { decimal, validRate } from './fx';

export type CashflowRecord = {
  id?: string | number; amountUSD?: number; amount?: number; originalAmount?: number;
  currency?: string; rateAtTime?: number; fxRateTHB?: number; category?: string;
  type: string; date: string; isTransfer?: boolean; bucketId?: string;
  portfolioId?: string; brokerageAccountId?: string; sourceBucketId?: string; note?: string;
};
export type CashflowScope = {
  from?: string; to?: string; walletId?: string; portfolioId?: string | null;
  currency?: string; exchangeRates?: Record<string, number>; includeInvestments?: boolean;
  trades?: readonly CashflowRecord[]; category?: string; timeZone?: string;
};
export type FlowKind = 'income' | 'expense' | 'invested' | 'proceeds' | 'transfer';
export type CashflowEntry = {
  id: string; day: string; walletId: string; category: string; kind: FlowKind;
  minor: number; nativeAmount: number; nativeCurrency: string; rate: number | null;
  basis: 'native' | 'stored-rate' | 'current-rate' | 'legacy-usd';
  legacyMinor: number | null; record: CashflowRecord;
};
export const CATEGORY_ALIASES = {
  food: { en: 'Food', th: 'อาหาร', aliases: ['food', 'อาหาร'] },
} as const;
/** Labels mirror AppContext's existing valuation scope; they do not recalculate it. */
export function getNetWorthIncludedSources(portfolioId: string | null | undefined, kind: string | undefined, settings: { includeAssets?: boolean; includeCash?: boolean; includeBuckets?: boolean }) {
  return {
    assets: kind !== 'cash_management' && settings.includeAssets !== false,
    cash: (!portfolioId || kind === 'trading') && settings.includeCash !== false,
    buckets: (!portfolioId || kind === 'cash_management') && settings.includeBuckets !== false,
  };
}
export function cashflowCategoryKey(category = 'Other') {
  const key = category.trim().toLocaleLowerCase('en-US');
  return (CATEGORY_ALIASES.food.aliases as readonly string[]).includes(key) ? 'food' : key || 'other';
}
export function displayCashflowCategory(category = 'Other', language: 'en' | 'th' = 'en') {
  return cashflowCategoryKey(category) === 'food' ? CATEGORY_ALIASES.food[language] : category;
}
export function localCashflowDay(value: string, timeZone = 'Asia/Bangkok') {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value ? '' : value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-');
}
function walletKey(row: CashflowRecord) {
  return row.brokerageAccountId ? `broker:${row.brokerageAccountId}` : row.bucketId || row.sourceBucketId || 'unassigned';
}
export function selectCashflowRecords<T extends CashflowRecord>(records: readonly T[], scope: CashflowScope = {}): T[] {
  return records.filter(row => {
    const day = localCashflowDay(row.date, scope.timeZone);
    return !!day && (!scope.from || day >= scope.from) && (!scope.to || day <= scope.to)
      && (!scope.walletId || scope.walletId === 'all' || walletKey(row) === scope.walletId)
      // Cash rows have no portfolio id in the existing model. Their wallet scope remains authoritative.
      && (!row.portfolioId || !scope.portfolioId || scope.portfolioId === '__all_portfolios__' || row.portfolioId === scope.portfolioId)
      && (!scope.category || cashflowCategoryKey(row.category) === scope.category);
  });
}
export function toMinor(value: number | string) {
  const minor = Number(decimal(value).mul(decimal(100)).toFixed(0));
  if (!Number.isSafeInteger(minor)) throw Error('Money exceeds safe minor-unit range');
  return minor;
}
export function formatCashflowMoney(minor: number, currency = 'USD', signed = false) {
  if (!Number.isSafeInteger(minor)) return '—';
  return `${signed ? minor < 0 ? '−' : '+' : minor < 0 ? '−' : ''}${new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(minor) / 100).replace(/THB\s*/, '฿').replace(/฿\s+/, '฿')}`;
}
/** The only transaction conversion boundary. Native money wins; FX is applied once,
 * using the recorded execution rate before the current quote. Round to a payable
 * minor unit once here; every total and chart then sums those same integer units. */
export function transactionMoney(row: CashflowRecord, scope: CashflowScope = {}) {
  const target = scope.currency || 'USD';
  const originalKnown = row.originalAmount !== undefined && Number.isFinite(row.originalAmount);
  if (originalKnown && !['USD', 'THB'].includes(row.currency || '')) return null;
  const nativeCurrency = originalKnown ? row.currency! : 'USD';
  const nativeAmount = originalKnown ? row.originalAmount! : row.amountUSD ?? row.amount;
  if (nativeAmount === undefined || !Number.isFinite(nativeAmount) || nativeAmount < 0) return null;
  const stored = validRate(row.fxRateTHB) ? row.fxRateTHB! : validRate(row.rateAtTime) ? row.rateAtTime! : null;
  const current = scope.exchangeRates?.THB;
  const rate = stored || (validRate(current) ? current! : null);
  let value = decimal(nativeAmount);
  let basis: CashflowEntry['basis'] = originalKnown ? 'native' : 'legacy-usd';
  if (nativeCurrency !== target) {
    if (!rate || !['USD', 'THB'].includes(nativeCurrency) || !['USD', 'THB'].includes(target)) return null;
    value = nativeCurrency === 'USD' ? value.mul(decimal(rate)) : value.div(decimal(rate));
    basis = stored ? 'stored-rate' : 'current-rate';
  }
  const minor = Number(value.mul(decimal(100)).toFixed(0));
  if (!Number.isSafeInteger(minor)) return null;
  const legacyRate = target === 'USD' ? 1 : scope.exchangeRates?.[target];
  const legacyMinor = row.amountUSD !== undefined && validRate(legacyRate)
    ? Number(decimal(Number(decimal(row.amountUSD).toFixed(2))).mul(decimal(legacyRate)).mul(decimal(100)).toFixed(0)) : null;
  return { minor, nativeAmount, nativeCurrency, rate, basis, legacyMinor };
}
function classify(row: CashflowRecord, trade: boolean): FlowKind | null {
  if (row.isTransfer) return 'transfer';
  if (trade) return row.type === 'DIVIDEND' ? 'income' : ['BUY', 'COVER'].includes(row.type) ? 'invested' : ['SELL', 'SHORT'].includes(row.type) ? 'proceeds' : null;
  return ['INCOME', 'DEPOSIT'].includes(row.type) ? 'income' : ['EXPENSE', 'WITHDRAW'].includes(row.type) ? 'expense' : null;
}
export function getCashflowSummary(records: readonly CashflowRecord[], scope: CashflowScope = {}) {
  const selected = selectCashflowRecords(records, scope);
  const trades = selectCashflowRecords(scope.trades || [], { ...scope, category: undefined });
  const entries: CashflowEntry[] = [];
  const missing: { id: string; reason: string }[] = [];
  for (const [rows, trade] of [[selected, false], [trades, true]] as const) {
    rows.forEach((row, index) => {
      const kind = classify(row, trade);
      if (!kind || (trade && kind !== 'income' && !scope.includeInvestments)) return;
      const category = trade && kind === 'income' ? 'Dividend' : row.category || (kind === 'proceeds' ? 'Investment proceeds' : kind === 'invested' ? 'Invested' : 'Other');
      if (trade && scope.category && cashflowCategoryKey(category) !== scope.category) return;
      const id = `${trade ? 'trade:' : 'cash:'}${row.id ?? index}`;
      const money = transactionMoney(row, scope);
      if (!money) { missing.push({ id, reason: 'Missing native amount, currency or usable FX rate' }); return; }
      entries.push({ ...money, id, kind, walletId: walletKey(row), day: localCashflowDay(row.date, scope.timeZone), category, record: row });
    });
  }
  const sum = (kind: FlowKind) => entries.filter(row => row.kind === kind).reduce((total, row) => total + row.minor, 0);
  const incomeMinor = sum('income'), expenseMinor = sum('expense'), investedMinor = sum('invested'), proceedsMinor = sum('proceeds');
  const inflowMinor = incomeMinor + proceedsMinor, outflowMinor = expenseMinor + investedMinor;
  const netMinor = inflowMinor - outflowMinor;
  if (![incomeMinor, expenseMinor, investedMinor, proceedsMinor, inflowMinor, outflowMinor, netMinor].every(Number.isSafeInteger)) throw Error('Money total exceeds safe minor-unit range');
  return {
    records: selected, entries, missing, currency: scope.currency || 'USD',
    incomeMinor, expenseMinor, investedMinor, proceedsMinor, inflowMinor, outflowMinor, netMinor,
    savedMinor: Math.max(0, netMinor), overspentMinor: Math.max(0, -netMinor), netInvestedMinor: investedMinor - proceedsMinor,
    income: incomeMinor / 100, expenses: expenseMinor / 100, net: netMinor / 100,
    savingsRate: incomeMinor ? netMinor / incomeMinor * 100 : null,
    hasActivity: entries.some(row => row.kind !== 'transfer'),
  };
}
export type CashflowSummary = ReturnType<typeof getCashflowSummary>;
export function getCategoryBreakdown(summary: CashflowSummary, previous?: CashflowSummary, language: 'en' | 'th' = 'en', limit = 7) {
  const grouped = (input: CashflowSummary) => {
    const map = new Map<string, { key: string; name: string; minor: number }>();
    input.entries.filter(row => row.kind === 'expense').forEach(row => {
      const key = cashflowCategoryKey(row.category), prior = map.get(key);
      map.set(key, { key, name: displayCashflowCategory(row.category, language), minor: (prior?.minor || 0) + row.minor });
    });
    return map;
  };
  const old = previous ? grouped(previous) : new Map<string, { minor: number }>();
  const all = [...grouped(summary).values()].sort((a, b) => b.minor - a.minor);
  const rows = all.length > limit ? [...all.slice(0, limit), { key: '__other', name: language === 'th' ? 'อื่น ๆ' : 'Other', minor: all.slice(limit).reduce((s, x) => s + x.minor, 0) }] : all;
  return rows.map(row => {
    const before = row.key === '__other' ? all.slice(limit).reduce((s, x) => s + (old.get(x.key)?.minor || 0), 0) : old.get(row.key)?.minor || 0;
    return { ...row, share: summary.expenseMinor ? row.minor / summary.expenseMinor * 100 : 0, deltaMinor: row.minor - before, deltaPercent: before ? (row.minor - before) / before * 100 : null };
  });
}
export function monthBounds(key: string) {
  const [year, month] = key.split('-').map(Number);
  return { from: `${key}-01`, to: `${key}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}` };
}
export function getMonthlySeries(records: readonly CashflowRecord[], scope: CashflowScope, count = 12, anchor = scope.to || localCashflowDay(new Date().toISOString())) {
  const [year, month] = anchor.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(year, month - count + i, 1), key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { key, ...getCashflowSummary(records, { ...scope, ...monthBounds(key) }) };
  });
}
export function getDailySeries(records: readonly CashflowRecord[], scope: CashflowScope, month: string, today = localCashflowDay(new Date().toISOString())) {
  const bounds = monthBounds(month), totalDays = Number(bounds.to.slice(-2));
  const summary = getCashflowSummary(records, { ...scope, ...bounds });
  const elapsed = today > bounds.to ? totalDays : today < bounds.from ? 0 : Number(today.slice(-2));
  const observed = summary.entries.filter(row => row.day <= today && row.kind !== 'transfer');
  const observedNet = observed.reduce((s, row) => s + (row.kind === 'income' || row.kind === 'proceeds' ? row.minor : -row.minor), 0);
  let running = 0;
  const rows = Array.from({ length: totalDays }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, '0')}`, entries = summary.entries.filter(row => row.day === day && row.kind !== 'transfer');
    const incomeMinor = entries.filter(row => row.kind === 'income' || row.kind === 'proceeds').reduce((s, r) => s + r.minor, 0);
    const expenseMinor = entries.filter(row => row.kind === 'expense').reduce((s, r) => s + r.minor, 0);
    const investedMinor = entries.filter(row => row.kind === 'invested').reduce((s, r) => s + r.minor, 0);
    running += incomeMinor - expenseMinor - investedMinor;
    const projectedMinor = elapsed > 0 && i + 1 >= elapsed && today <= bounds.to && today >= bounds.from
      ? Number(decimal(observedNet).mul(decimal(i + 1)).div(decimal(elapsed)).toFixed(0)) : null;
    return { day, count: entries.length, expenseMinor, incomeMinor, netMinor: day <= today ? running : null, projectedMinor,
      large: entries.some(row => row.minor >= Math.max(summary.inflowMinor, summary.outflowMinor) / 5) };
  });
  return { rows, elapsed, totalDays, summary, projectedMinor: rows.at(-1)?.projectedMinor ?? summary.netMinor };
}
export function getBudgetStatus(summary: CashflowSummary, buckets: readonly { id: string; name: string; targetAmount?: number; currency?: string }[], scope: CashflowScope, pace: number) {
  return buckets.map(bucket => {
    const actualMinor = summary.entries.filter(row => row.kind === 'expense' && row.walletId === bucket.id).reduce((s, r) => s + r.minor, 0);
    const targetMinor = bucket.targetAmount ? transactionMoney({ type: 'TARGET', date: '', originalAmount: bucket.targetAmount, currency: bucket.currency }, scope)?.minor ?? null : null;
    return { ...bucket, actualMinor, targetMinor, pace, over: targetMinor !== null && actualMinor > targetMinor };
  });
}
export function getUpcomingRecurring() {
  return { supported: false as const, items: [], reason: 'Recurring schedules and due dates are not stored.' };
}
export type FlowNode = { id: string; name: string; layer: 0 | 1 | 2; minor: number; kind: string; walletId?: string; category?: string };
export type FlowLink = { source: string; target: string; minor: number; derived?: boolean };
/** Actual source/wallet/category edges only. A wallet deficit or unmatched transfer
 * is explicitly reconciled against unlinked balances; it is never fabricated income. */
export function getFlowGraph(summary: CashflowSummary, wallets: readonly { id: string; name: string }[], language: 'en' | 'th' = 'en', expanded = false) {
  const nodes = new Map<string, FlowNode>(), edges = new Map<string, FlowLink>();
  const add = (id: string, name: string, layer: 0 | 1 | 2, kind: string, walletId?: string, category?: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, name, layer, kind, minor: 0, walletId, category });
  };
  const link = (source: string, target: string, minor: number, derived = false) => {
    if (!minor) return;
    const key = `${source}|${target}`, old = edges.get(key);
    edges.set(key, { source, target, minor: (old?.minor || 0) + minor, derived });
  };
  const categories = getCategoryBreakdown(summary, undefined, language, Number.MAX_SAFE_INTEGER);
  const small = new Set(categories.filter(c => c.share < 3).map(c => c.key));
  const balances = new Map<string, { incoming: number; outgoing: number }>();
  for (const entry of summary.entries.filter(row => row.kind !== 'transfer')) {
    const wallet = `wallet:${entry.walletId}`;
    add(wallet, wallets.find(w => w.id === entry.walletId)?.name || (entry.walletId === 'unassigned' ? (language === 'th' ? 'ไม่ระบุกระเป๋า' : 'Unassigned wallet') : entry.walletId), 1, 'wallet', entry.walletId);
    const balance = balances.get(wallet) || { incoming: 0, outgoing: 0 };
    if (entry.kind === 'income' || entry.kind === 'proceeds') {
      const name = displayCashflowCategory(entry.category, language), id = `source:${cashflowCategoryKey(entry.category)}`;
      add(id, name, 0, entry.kind, undefined, cashflowCategoryKey(entry.category)); link(id, wallet, entry.minor); balance.incoming += entry.minor;
    } else {
      const category = cashflowCategoryKey(entry.category), other = !expanded && small.has(category);
      const id = entry.kind === 'invested' ? 'invested' : `category:${other ? '__other' : category}`;
      add(id, entry.kind === 'invested' ? (language === 'th' ? 'ลงทุน' : 'Invested') : other ? (language === 'th' ? 'อื่น ๆ · ขยาย' : 'Other · expand') : displayCashflowCategory(entry.category, language), 2, entry.kind, undefined, other ? '__other' : category);
      link(wallet, id, entry.minor); balance.outgoing += entry.minor;
    }
    balances.set(wallet, balance);
  }
  let savedLeft = summary.savedMinor, reconciliationMinor = 0;
  balances.forEach((balance, wallet) => {
    const residual = balance.incoming - balance.outgoing;
    if (residual > 0) {
      const saved = Math.min(savedLeft, residual); savedLeft -= saved;
      if (saved) { add('saved', language === 'th' ? 'ออม' : 'Saved', 2, 'saved'); link(wallet, 'saved', saved); }
      if (residual > saved) {
        add('unlinked-out', language === 'th' ? 'เงินโอนที่ยังเชื่อมไม่ได้' : 'Unlinked balance movement', 2, 'reconciliation');
        link(wallet, 'unlinked-out', residual - saved, true);
      }
    } else if (residual < 0) {
      add('unlinked-in', language === 'th' ? 'ยอดเดิม / เงินโอนที่ยังเชื่อมไม่ได้' : 'Opening / unlinked balance', 0, 'reconciliation');
      link('unlinked-in', wallet, -residual, true); reconciliationMinor += -residual;
    }
  });
  const links = [...edges.values()];
  nodes.forEach(node => {
    node.minor = Math.max(links.filter(l => l.source === node.id).reduce((s, l) => s + l.minor, 0), links.filter(l => l.target === node.id).reduce((s, l) => s + l.minor, 0));
  });
  return { nodes: [...nodes.values()].filter(n => n.minor > 0), links, reconciliationMinor, smallCategoryCount: small.size,
    incomeMinor: summary.incomeMinor, inflowMinor: summary.inflowMinor, expenseMinor: summary.expenseMinor, investedMinor: summary.investedMinor, netMinor: summary.netMinor };
}
export function getInvestmentCashflowSummary(records: readonly CashflowRecord[], scope: CashflowScope = {}) {
  const summary = getCashflowSummary([], { ...scope, trades: records, includeInvestments: true });
  return { records: summary.entries.map(e => e.record), buys: summary.investedMinor / 100, proceeds: summary.proceedsMinor / 100, dividends: summary.incomeMinor / 100, netInvested: summary.netInvestedMinor / 100, cashImpact: summary.netMinor / 100 };
}
