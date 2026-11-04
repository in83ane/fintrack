import { Decimal, proportionalCuts } from './cost-basis-ledger';

export type ImportCostMethod = 'PROPORTIONAL' | 'FIFO' | 'COMPRESSED_FIFO';
export type ImportCostPolicy = { method: ImportCostMethod; includeFees: boolean };
export const COST_PRESETS: Record<string, ImportCostPolicy> = {
  DIME: { method: 'COMPRESSED_FIFO', includeFees: false },
  WEBULL_AVERAGE: { method: 'PROPORTIONAL', includeFees: false },
};
export function costBasisDay(date: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
}

/** Preserve individual purchases while consuming older purchase days first.
 * Within each day, Compressed FIFO closes the same fraction of every open lot. */
export function allocateImportSale(lots: readonly { id: string; date: string; remaining: string }[], quantity: string, method: ImportCostMethod) {
  if (!['PROPORTIONAL', 'FIFO', 'COMPRESSED_FIFO'].includes(method)) throw Error('Choose a cost method');
  const zero = Decimal.from('0');
  const available = lots.filter(l => Decimal.from(l.remaining).cmp(zero) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Also validates precision, positive quantity and total capacity.
  const proportional = proportionalCuts(available, quantity);
  if (method === 'PROPORTIONAL') return proportional;
  const groups = new Map<string, typeof available>();
  for (const lot of available) {
    const key = method === 'FIFO' ? lot.id : costBasisDay(lot.date);
    const group = groups.get(key);
    if (group) group.push(lot);
    else groups.set(key, [lot]);
  }
  let left = Decimal.from(quantity);
  const cuts: { lotId: string; qty: string }[] = [];
  for (const group of groups.values()) {
    if (left.cmp(zero) === 0) break;
    const held = group.reduce((n, l) => n.add(Decimal.from(l.remaining)), zero);
    const take = left.cmp(held) < 0 ? left : held;
    cuts.push(...proportionalCuts(group, take.toFixed(6)));
    left = left.sub(take);
  }
  return cuts;
}
