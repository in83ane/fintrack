import { Decimal as D } from './cost-basis-ledger';

export const formatShareQuantity = (value: string) => D.from(value).toFixed(6).replace(/\.?0+$/, '');
export const matchesSaleSymbol = (input: string, symbol: string) => Boolean(symbol.trim()) && input.trim().toUpperCase() === symbol.trim().toUpperCase();
type Position = { realized: string; invested: string; lots: { remaining: string; cost: string }[] };
/** Aggregate full-precision ledger values; formatting is only a display boundary. */
export function saleConfirmation(before: Pick<Position, 'realized'>, after: Position) {
  const zero = D.from('0');
  const remaining = after.lots.reduce((n, l) => n.add(D.from(l.remaining)), zero);
  const remainingCost = after.lots.reduce((n, l) => n.add(D.from(l.cost)), zero);
  const cumulative = D.from(after.realized), invested = D.from(after.invested);
  return {
    current: cumulative.sub(D.from(before.realized)), cumulative, invested, remaining,
    closedAll: remaining.cmp(zero) === 0,
    average: remaining.cmp(zero) ? remainingCost.div(remaining) : zero,
    returnPercent: invested.cmp(zero) ? cumulative.div(invested).mul(D.from('100')) : null,
  };
}
