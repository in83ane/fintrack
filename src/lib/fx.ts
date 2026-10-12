import { Decimal } from './cost-basis-ledger';

export type FxCurrency = 'USD' | 'THB';
export type NativeMoney = Readonly<{ amount: string | number | Decimal; currency: FxCurrency }>;
export function isFxCurrency(value: unknown): value is FxCurrency {
  return value === 'USD' || value === 'THB';
}
/** Missing/unsupported denominations must be resolved, never inferred. */
export function requireCurrency(value: unknown): asserts value is FxCurrency {
  if (!isFxCurrency(value)) throw Error('Missing or unsupported native currency; confirm the original currency before conversion');
}
export type FxQuote = { rate: string; fetchedAt: number; source: string; providerDate?: string };
export const FX_REFRESH_MS = 10 * 60_000;
export const FX_RESUME_MS = 5 * 60_000;
export const FX_STALE_MS = 60 * 60_000;

export function validRate(value: unknown): value is string | number {
  return (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)))
    && Number.isFinite(Number(value)) && Number(value) > 0;
}

/** Adapt legacy numeric projections without doing monetary arithmetic in float. */
export function decimal(value: string | number | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  const raw = String(value);
  if (!/[eE]/.test(raw)) return Decimal.from(raw);
  if (!Number.isFinite(Number(raw))) throw Error('Invalid monetary value');
  const [mantissa, exponent] = raw.toLowerCase().split('e');
  const negative = mantissa.startsWith('-');
  const [whole, fraction = ''] = mantissa.replace('-', '').split('.');
  const digits = whole + fraction, point = whole.length + Number(exponent);
  const expanded = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
    : point >= digits.length ? digits + '0'.repeat(point - digits.length)
    : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return Decimal.from((negative ? '-' : '') + expanded);
}

/** Display only. Never use these conversions to overwrite a ledger or a lot. */
export function convertMoney(amount: string | number | Decimal, from: FxCurrency, to: FxCurrency, rate: string | null): Decimal | null {
  requireCurrency(from);
  requireCurrency(to);
  const value = decimal(amount);
  if (from === to || value.cmp(decimal('0')) === 0) return value;
  if (!validRate(rate)) return null;
  return from === 'USD' ? value.mul(decimal(rate)) : value.div(decimal(rate));
}
/** Same-currency conversion returns the original money object, even without FX. */
export function convertNativeMoney(money: NativeMoney, targetCurrency: FxCurrency, rate: string | null): NativeMoney | null {
  requireCurrency(money.currency);
  requireCurrency(targetCurrency);
  if (money.currency === targetCurrency) return money;
  const amount = convertMoney(money.amount, money.currency, targetCurrency, rate);
  return amount === null ? null : { amount, currency: targetCurrency };
}
/** Convert each amount BEFORE summation; round only in formatMoney. */
export function sumNativeMoney(items: readonly NativeMoney[], targetCurrency: FxCurrency, rate: string | null): NativeMoney | null {
  requireCurrency(targetCurrency);
  let amount = decimal('0');
  for (const item of items) {
    const converted = convertNativeMoney(item, targetCurrency, rate);
    if (!converted) return null;
    amount = amount.add(decimal(converted.amount));
  }
  return { amount, currency: targetCurrency };
}
export function nativeDisplay(money: NativeMoney, targetCurrency: FxCurrency, rate: string | null) {
  const converted = convertNativeMoney(money, targetCurrency, rate);
  return {
    amount: converted ? formatMoney(decimal(converted.amount), targetCurrency) : formatMoney(null, targetCurrency),
    original: money.currency === targetCurrency ? null : formatMoney(decimal(money.amount), money.currency),
    converted: money.currency !== targetCurrency,
  };
}
export function convertUsd(amount: string | number | Decimal, currency: FxCurrency, rate: string | null) {
  return convertMoney(amount, 'USD', currency, rate);
}
export function formatAmount(value: Decimal | null, signed = false): string {
  if (!value) return '—';
  const fixed = value.toFixed(2);
  const [whole, fraction] = fixed.split('.');
  return `${signed && value.cmp(decimal('0')) >= 0 ? '+' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}
export function formatMoney(value: Decimal | null, currency: FxCurrency, signed = false) {
  return `${formatAmount(value, signed)} ${currency}`;
}
/** Historical Thai-stock display uses only the recorded execution rate. */
export function formatHistoricalStock(amount: number | string, symbol: string | null, recordedRate: number | string | null) {
  const currency: FxCurrency = /\.(BK|TH)$/i.test(symbol || '') ? 'THB' : 'USD';
  return formatMoney(convertUsd(amount, currency, validRate(recordedRate) ? String(recordedRate) : null), currency);
}
export function nativeTotals(entries: readonly { amount: number; signed: number; cur: FxCurrency }[]) {
  return (['USD', 'THB'] as const).filter(cur => entries.some(e => e.cur === cur)).map(cur => {
    let inc = decimal('0'), exp = decimal('0');
    for (const entry of entries.filter(e => e.cur === cur)) {
      if (entry.signed >= 0) inc = inc.add(decimal(entry.amount)); else exp = exp.add(decimal(entry.amount));
    }
    return { cur, inc, exp, net: inc.sub(exp) };
  });
}
export function formatNativeTotals(entries: readonly { amount: number; signed: number; cur: FxCurrency }[], field: 'inc' | 'exp' | 'net') {
  const totals = nativeTotals(entries);
  return totals.length ? totals.map(t => formatMoney(t[field], t.cur, field === 'net')).join(' · ') : '—';
}
export type ValuationItem = { amount: string | Decimal; currency: FxCurrency; cost?: string | Decimal; group: string; color: string };
export function valuePortfolio(items: readonly ValuationItem[], currency: FxCurrency, rate: string | null) {
  let total = decimal('0'), cost = decimal('0'), holdings = decimal('0');
  let unavailable = false;
  const groups = new Map<string, { label: string; color: string; value: Decimal }>();
  for (const item of items) {
    if (!isFxCurrency(item.currency)) { unavailable = true; continue; }
    if (!(item.amount instanceof Decimal) && !Number.isFinite(Number(item.amount))) { unavailable = true; continue; }
    const value = convertMoney(item.amount, item.currency, currency, rate);
    const basis = convertMoney(item.cost || '0', item.currency, currency, rate);
    if (!value || !basis) { unavailable = true; continue; }
    total = total.add(value);
    if (item.cost !== undefined) { holdings = holdings.add(value); cost = cost.add(basis); }
    const group = groups.get(item.group) || { label: item.group, color: item.color, value: decimal('0') };
    group.value = group.value.add(value); groups.set(item.group, group);
  }
  const profit = holdings.sub(cost);
  return { total: unavailable ? null : total, cost: unavailable ? null : cost,
    profit: unavailable ? null : profit, profitPct: cost.cmp(decimal('0')) > 0 ? profit.div(cost).mul(decimal('100')) : decimal('0'),
    // Numbers are used only by the decorative chart, never by money labels.
    segments: unavailable ? [] : [...groups.values()].map(g => ({ ...g, value: Number(g.value.toFixed(12)) })).filter(g => g.value > 0) };
}

export function parseQuote(value: unknown, now: number): FxQuote | null {
  if (!value || typeof value !== 'object') return null;
  const q = value as FxQuote;
  if (!validRate(q.rate) || typeof q.fetchedAt !== 'number' || !Number.isFinite(q.fetchedAt)
    || q.fetchedAt <= 0 || q.fetchedAt > now + 60_000 || !['wise', 'frankfurter', 'open.er-api.com'].includes(q.source)) return null;
  return { rate: String(q.rate), fetchedAt: q.fetchedAt, source: q.source, providerDate: q.providerDate };
}
