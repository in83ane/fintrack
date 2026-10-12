import type { Trade } from '../context/AppContext';
import { Decimal, replay, type Event } from './cost-basis-ledger';

export const dcaLotId = (trade: Trade): number | undefined => {
  const match = /^DCA entry (\d+)$/.exec(trade.tag || '');
  return match ? Number(match[1]) : undefined;
};
// Negative IDs reserve a stable namespace for purchases from other screens.
export const tradeLotEntryId = (trade: Trade): number => dcaLotId(trade) ?? -trade.id;

/** Project open quantities from posted transactions, never from a saved draft.
 * Tagged sales consume their designated lot. Never guess an untagged sale's allocation.
 */
export function projectTradeLots(trades: Trade[], portfolioId: string, symbol: string) {
  const scopedLedger = trades.filter(t => t.portfolioId === portfolioId && t.asset.toUpperCase() === symbol.toUpperCase()).sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);
  // Decimal ledger methods are stored on the sale, never inferred from today's default.
  {
    const buys = scopedLedger.filter(t => t.type === 'BUY' || t.type === 'IMPORT');
    const events: Event[] = scopedLedger.filter(t => ['BUY','IMPORT','SELL'].includes(t.type)).map(t => {
      const qty = String(t.shares || 0), price = Decimal.from(String(t.amountUSD)).div(Decimal.from(qty)).toFixed(24);
      const base = { id: t.dbId || String(t.id), symbol: t.asset.toUpperCase(), date: t.date, price, qty, fee: String(t.fees || 0) };
      if(t.type !== 'SELL') return { ...base, type: 'BUY' as const };
      const oldId = /^DCA partial exit from entry (-?\d+)$/.exec(t.tag || '')?.[1];
      const oldLot = buys.find(b => tradeLotEntryId(b) === Number(oldId));
      if (!t.costMethod && !oldLot) throw Error(`NEEDS_REVIEW: sale ${t.dbId || t.id} has no proven lot method`);
      return { ...base, type: 'SELL' as const, method: t.costMethod || 'SPECIFIC_LOT', selections: t.lotSelections || (oldLot ? [{ lotId: oldLot.dbId || String(oldLot.id), qty }] : []) };
    });
    const ledger = replay(events);
    return ledger.lots.map(l => {
      const trade = buys.find(t => (t.dbId || String(t.id)) === l.buy.id)!;
      const sales = ledger.allocations.filter(a => a.lotId === l.buy.id).map(a => ({trade: scopedLedger.find(t => (t.dbId || String(t.id)) === a.sellId)!, quantity: Number(a.qtyClosed.toFixed(6)), pnl: Number(a.realizedPnl.toFixed(12))}));
      return {trade,quantity:Number(l.buy.qty),remaining:Number(l.remaining.toFixed(6)),price:Number((l.remaining.cmp(Decimal.from('0')) ? l.cost.div(l.remaining) : Decimal.from(l.buy.price)).toFixed(12)),realized:sales.reduce((s,a)=>s+a.pnl,0),sales};
    });
  }
}

export function projectLotPosition(trades: Trade[], portfolioId: string, symbol: string) {
  const scoped = trades.filter(t => t.portfolioId === portfolioId && t.asset.toUpperCase() === symbol.toUpperCase());
  if (!scoped.length || scoped.some(t => t.type === 'SHORT' || t.type === 'COVER')) return null;
  const lots = projectTradeLots(scoped, portfolioId, symbol);
  const shares = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  const cost = lots.reduce((sum, lot) => sum + lot.remaining * lot.price, 0);
  const invested = lots.reduce((sum, lot) => sum + lot.trade.amountUSD + (lot.trade.fees || 0), 0);
  const proceeds = scoped.filter(t => t.type === 'SELL').reduce((sum, t) => sum + t.amountUSD - (t.fees || 0), 0);
  return { shares, cost, invested, realized: proceeds - (invested - cost) };
}
