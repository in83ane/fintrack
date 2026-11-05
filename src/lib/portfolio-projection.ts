import type { Asset, Trade } from '../context/AppContext';
import type { readFinancialSnapshot } from './financial-snapshot';
import { assetAllocation } from './instrument-metadata';
type Snapshot = Awaited<ReturnType<typeof readFinancialSnapshot>>;
export function portfolioAsset(a: NonNullable<Snapshot[0]['data']>[number]): Asset {
  const quantity = a.quantity || 0;
  const currentPrice = a.current_price || a.avg_purchase_price || (quantity > 0 ? (a.value_usd || 0) / quantity : 0);
  const nextAsset = {
      id: a.id,
      name: a.name,
      symbol: a.symbol,
      valueUSD: (() => {
        if (currentPrice && quantity) return currentPrice * quantity;
        if (a.avg_purchase_price && quantity) return a.avg_purchase_price * quantity;
        return a.value_usd || 0;
      })(),
      change: a.change_percentage || 0,
      allocation: assetAllocation(a.allocation, a.asset_type, a.symbol),
      currency: a.currency || undefined, nativePrice: a.native_price || undefined,
      quoteAsOf: a.quote_as_of || undefined, quoteSource: a.quote_source || undefined,
      dayChangeNative: a.native_day_change ?? null,
      shares: quantity,
      avgCost: a.avg_purchase_price || 0,
      currentPrice,
      isFavorite: a.is_favorite,
      sortOrder: a.sort_order,
      portfolioPreferences: a.portfolio_id ? { [a.portfolio_id]: { isFavorite: a.is_favorite, sortOrder: a.sort_order } } : {},
      is_active: a.is_active,
      portfolioId: a.portfolio_id || undefined,
      brokerageAccountId: a.brokerage_account_id || undefined,
    };

  return nextAsset;
}
export function portfolioTrade(t: NonNullable<Snapshot[1]['data']>[number]): Trade {

  // Extract source bucket ID from notes if present
  let sourceBucketId: string | undefined = undefined;
  if (t.notes && t.notes.startsWith("Source Wallet ID: ")) {
    sourceBucketId = t.notes.replace("Source Wallet ID: ", "").trim();
  }

  return {
    id: parseInt(t.id.split('-')[0], 16) || Date.now(), // Fallback for old trade ID system if needed
    asset: t.symbol,
    type: t.type,
    amountUSD: t.amount_usd,
    date: t.execution_date,
    createdAt: t.created_at,
    rateAtTime: t.exchange_rate_at_time || 1,
    fees: Number(t.fees || 0),
    includeFees: t.portfolios?.cost_include_fees !== false,
    costMethod: t.cost_basis_sales?.method,
    closeMode: t.cost_basis_sales?.request?.closeMode,
    lotSelections: t.cost_basis_sales?.selections,
    fxRateTHB: Number(t.tags?.find((tag: string) => tag.startsWith('FX USD/THB '))?.slice(11)) || undefined,
    currency: t.currency || 'USD',
    originalAmount: t.original_amount || undefined,
    shares: t.quantity || 0,
    pricePerUnit: t.price_at_execution || 0,
    sourceBucketId: sourceBucketId,
    brokerageAccountId: t.brokerage_account_id || undefined,
    tag: (t.tags && t.tags.length > 0) ? t.tags[0] : undefined,
    dbId: t.id,
    portfolioId: t.portfolio_id || undefined,
  };

}
/** Replace only the loaded scope, retaining the other portfolios even for an empty selection. */
export function replacePortfolioScope<T extends {portfolioId?:string}>(all: readonly T[], scoped: readonly T[], portfolioId: string | null): T[] {
 return portfolioId ? [...all.filter(row=>row.portfolioId!==portfolioId),...scoped] : [...scoped];
}
