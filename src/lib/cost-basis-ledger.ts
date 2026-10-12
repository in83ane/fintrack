/** Exact rational accounting. Decimal strings cross persistence boundaries;
 * no binary floating point is used in quantities, costs, fees or allocations.
 * Scope one ledger to one portfolio + symbol. Events must be chronological.
 */
export class Decimal {
  constructor(readonly n: bigint, readonly d: bigint = 1n) { if (d <= 0n) throw Error('Invalid denominator'); }
  static from(s: string): Decimal {
    if (!/^-?\d+(\.\d+)?$/.test(s)) throw Error(`Invalid decimal: ${s}`);
    const [whole, fraction = ''] = s.replace('-', '').split('.');
    return new Decimal(BigInt(whole + fraction) * (s.startsWith('-') ? -1n : 1n), 10n ** BigInt(fraction.length));
  }
  private reduce(n: bigint, d: bigint) { let a = n < 0n ? -n : n, b = d; while (b) [a, b] = [b, a % b]; return new Decimal(n / (a || 1n), d / (a || 1n)); }
  add(b: Decimal) { return this.reduce(this.n * b.d + b.n * this.d, this.d * b.d); }
  sub(b: Decimal) { return this.add(new Decimal(-b.n, b.d)); }
  mul(b: Decimal) { return this.reduce(this.n * b.n, this.d * b.d); }
  div(b: Decimal) { if (!b.n) throw Error('Division by zero'); return this.reduce(this.n * b.d * (b.n < 0n ? -1n : 1n), this.d * (b.n < 0n ? -b.n : b.n)); }
  cmp(b: Decimal) { const n = this.n * b.d - b.n * this.d; return n < 0n ? -1 : n > 0n ? 1 : 0; }
  toFixed(places = 6) { const scale = 10n ** BigInt(places), a = this.n < 0n ? -this.n : this.n; const rounded = (a * scale * 2n + this.d) / (2n * this.d); const digits = rounded.toString().padStart(places + 1, '0'); return `${this.n < 0n && rounded ? '-' : ''}${places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits}`; }
  snapshot() { return { numerator: this.n.toString(), denominator: this.d.toString() }; }
}
const D = Decimal.from;
const zero = () => D('0');
const sum = (values: Decimal[]) => values.reduce((a, b) => a.add(b), zero());
export type Method = 'SPECIFIC_LOT' | 'PROPORTIONAL';
/** Six-decimal share units. Truncate earlier cuts; the final lot gets the remainder.
 * Reserve enough capacity for later lots, including very small fractional lots. */
export function proportionalCuts(lots: readonly { id: string; remaining: string }[], quantity: string) {
  const qty = positive(quantity), total = sum(lots.map(l => D(l.remaining)));
  if (qty.cmp(total)>0) throw Error('ขายเกินจำนวนหุ้นที่ถืออยู่');
  if (D(qty.toFixed(6)).cmp(qty)) throw Error('จำนวนหุ้นรองรับทศนิยมไม่เกิน 6 ตำแหน่ง');
  let left=qty, capacity=total;
  return lots.map((lot,i)=>{
    const remaining=D(lot.remaining);
    if(remaining.cmp(zero())<0 || D(remaining.toFixed(6)).cmp(remaining)) throw Error('Invalid remaining quantity');
    capacity=capacity.sub(remaining);
    const exact=qty.mul(remaining).div(total);
    let cut=i===lots.length-1?left:new Decimal(exact.n*1000000n/exact.d,1000000n);
    const minimum=left.sub(capacity);
    if(cut.cmp(minimum)<0)cut=minimum;
    if(cut.cmp(remaining)>0)cut=remaining;
    if(cut.cmp(left)>0)cut=left;
    left=left.sub(cut);
    return {lotId:lot.id,qty:cut.toFixed(6)};
  }).filter(c=>D(c.qty).cmp(zero())>0);
}
export type BuyLot = Readonly<{ type: 'BUY'; id: string; symbol: string; date: string; price: string; qty: string; fee?: string }>;
export type SellTransaction = Readonly<{ type: 'SELL'; id: string; symbol: string; date: string; price: string; qty: string; fee?: string; method: Method; selections?: readonly { lotId: string; qty: string }[] }>;
export type Event = BuyLot | SellTransaction;
export type LotAllocation = { sellId: string; lotId: string; qtyClosed: Decimal; costPerShare: Decimal; cost: Decimal; sellFee: Decimal; realizedPnl: Decimal };
type Position = { buy: BuyLot; remaining: Decimal; cost: Decimal };
export type Ledger = { lots: Position[]; allocations: LotAllocation[]; invested: Decimal; realized: Decimal };
const remainingCost = (s: Ledger) => sum(s.lots.map(l => l.cost));
const remainingQty = (s: Ledger) => sum(s.lots.map(l => l.remaining));
function positive(s: string) { const v = D(s); if (v.cmp(zero()) <= 0) throw Error('Quantity/price must be positive'); return v; }
function fee(s = '0') { const v = D(s); if (v.cmp(zero()) < 0) throw Error('Fee must not be negative'); return v; }

/** Returns a new projection; neither input events nor prior projections mutate. */
export function replay(events: readonly Event[]): Ledger {
  const state: Ledger = { lots: [], allocations: [], invested: zero(), realized: zero() };
  const ids = new Set<string>(); let last = -Infinity; const symbol = events[0]?.symbol;
  for (const event of events) {
    try {
      const timestamp = Date.parse(event.date);
      if (!Number.isFinite(timestamp) || timestamp < last) throw Error('Events must be chronological');
      if (!event.id || ids.has(event.id) || event.symbol !== symbol) throw Error('Duplicate ID or mixed symbol');
      ids.add(event.id); last = timestamp;
      const qty = positive(event.qty), price = positive(event.price), fees = fee(event.fee);
      if (event.type === 'BUY') {
        const cost = qty.mul(price).add(fees);
        state.lots.push({ buy: { ...event }, remaining: qty, cost }); state.invested = state.invested.add(cost);
        continue;
      }
      if (qty.cmp(remainingQty(state)) > 0) throw Error('ขายเกินจำนวนหุ้นที่ถืออยู่');
      if (!['SPECIFIC_LOT', 'PROPORTIONAL'].includes(event.method)) throw Error('Invalid closing mode');
      const candidates = state.lots.filter(l => l.remaining.cmp(zero()) > 0);
      const selected = new Set<string>();
      const cuts: { lot: Position; qty: Decimal }[] = [];
      {
        const selections = event.method==='PROPORTIONAL'
          ? proportionalCuts(candidates.map(l=>({id:l.buy.id,remaining:l.remaining.toFixed(6)})),event.qty)
          : event.selections || [];
        for (const selection of selections) {
          if (selected.has(selection.lotId)) throw Error('Duplicate selected lot');
          selected.add(selection.lotId);
          const lot = candidates.find(l => l.buy.id === selection.lotId), cut = positive(selection.qty);
          if (!lot || cut.cmp(lot.remaining) > 0) throw Error(`ขายเกินจำนวนคงเหลือของไม้ ${selection.lotId}`);
          cuts.push({ lot, qty: cut });
        }
        if (sum(cuts.map(c => c.qty)).cmp(qty)) throw Error('Selected quantity does not equal sale quantity');
      }
      for (const cut of cuts) {
        const costPerShare = cut.lot.cost.div(cut.lot.remaining), cost = costPerShare.mul(cut.qty);
        const sellFee = fees.mul(cut.qty).div(qty), realizedPnl = price.mul(cut.qty).sub(cost).sub(sellFee);
        state.allocations.push({ sellId: event.id, lotId: cut.lot.buy.id, qtyClosed: cut.qty, costPerShare, cost, sellFee, realizedPnl });
        state.realized = state.realized.add(realizedPnl);
        cut.lot.remaining = cut.lot.remaining.sub(cut.qty); cut.lot.cost = cut.lot.cost.sub(cost);
      }
    } catch (error) { throw Error(`รายการ ${event.id}: ${(error as Error).message}`); }
  }
  return state;
}
export function mark(state: Ledger, market: string) {
  const qty = remainingQty(state), cost = remainingCost(state);
  const unrealized = positive(market).mul(qty).sub(cost), total = state.realized.add(unrealized);
  return { qty, cost, realized: state.realized, unrealized, total, invested: state.invested,
    average: qty.cmp(zero()) ? cost.div(qty) : zero(),
    unrealizedPercent: cost.cmp(zero()) ? unrealized.div(cost).mul(D('100')) : null,
    totalReturnPercent: state.invested.cmp(zero()) ? total.div(state.invested).mul(D('100')) : null };
}
/** Corrections are explicit replay proposals, not writes to posted events. */
export function previewCorrection(events: readonly Event[], lotId: string, patch: Partial<Pick<BuyLot, 'price' | 'qty' | 'fee'>>) {
  const before = replay(events), original = events.find(e => e.id === lotId && e.type === 'BUY');
  if (!original) throw Error('Buy lot not found');
  const affected = [...new Set(before.allocations.filter(a => a.lotId === lotId).map(a => a.sellId))];
  if (affected.length && patch.qty !== undefined && D(patch.qty).cmp(D(original.qty))) throw Error('จำนวนซื้อเดิมเปลี่ยนไม่ได้หลังมีการขาย');
  const after = replay(events.map(e => e.id === lotId ? { ...e, ...patch } as BuyLot : e));
  // Return all sales whose realized result changes under the proposed replay.
  const changedSales = [...new Set(after.allocations.filter(a => {
    const old = before.allocations.find(b => b.sellId === a.sellId && b.lotId === a.lotId);
    return !old || old.realizedPnl.cmp(a.realizedPnl) !== 0;
  }).map(a => a.sellId))];
  return { after, affectedSales: changedSales };
}
export function assertDeletable(events: readonly Event[], lotId: string) {
  if (replay(events).allocations.some(a => a.lotId === lotId)) throw Error('ห้ามลบไม้ที่มีประวัติขาย');
}
/** Only migrate legacy remaining quantities when complete exit history is proven. */
export function recoverOriginalQty(remaining: string, closed: readonly string[], historyComplete: boolean): string {
  if (!historyComplete) throw Error('ต้องให้ผู้ใช้ยืนยันจำนวนซื้อเดิม: ประวัติการปิดไม้ไม่ครบ');
  const values = [D(remaining), ...closed.map(D)];
  if (values.some(v => v.cmp(zero()) < 0)) throw Error('Negative legacy quantity');
  const places = Math.max(6, ...[remaining, ...closed].map(v => v.split('.')[1]?.length || 0));
  return sum(values).toFixed(places);
}
