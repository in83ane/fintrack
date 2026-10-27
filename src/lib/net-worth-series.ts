import { getNetWorthIncludedSources, localCashflowDay, type CashflowRecord } from './cashflow-selectors';
import { getLedgerView } from './ledger-selectors';
import { decimal } from './fx';

export type NetWorthParts = { assets: number; brokerCash: number; buckets: number };
export type NetWorthPoint = { date: string; value: number; parts?: NetWorthParts };
type Asset = { symbol: string; portfolioId?: string; valueUSD: number; shares?: number; currentPrice?: number; is_active?: boolean; chartData?: {time:number; price:number}[] };
type Trade = CashflowRecord & { asset: string; shares?: number; pricePerUnit?: number; fees?: number };
export type NetWorthScope = {
  portfolioId?: string | null; kind?: string;
  settings?: {includeAssets?:boolean; includeCash?:boolean; includeBuckets?:boolean};
  currency?: string; exchangeRates: Record<string,number>; timeZone?: string;
  assets: readonly Asset[]; trades: readonly Trade[]; cashActivities: readonly CashflowRecord[];
  buckets: readonly {id:string; currentAmount:number; currency?:string; portfolioId?:string}[];
  accounts: readonly {id:string; currency:string; portfolioId?:string}[];
  balances: readonly {accountId:string; balance:number}[];
  brokerEntries: readonly {id:string; accountId:string; portfolioId?:string; type:string; amount:number; currency:string; occurredAt:string}[];
};
export type NetWorthRange = {from:string; to:string};
const allPortfolioId = (id: string | null | undefined) => id==='__all_portfolios__'?null:id;
const marketDay = (time:number, timeZone?:string) => Number.isFinite(time) ? localCashflowDay(new Date(time).toISOString(),timeZone) : '';
export function shiftNetWorthDay(day: string, offset: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0,10);
}
/** Retain the stock chart's market-history window. Cash-only/empty scopes use
 * the same daily grid for the last 30 days, never a fictitious Start point. */
export function getNetWorthRange(scope: NetWorthScope, today = localCashflowDay(new Date().toISOString(), scope.timeZone)): NetWorthRange {
  const id = allPortfolioId(scope.portfolioId);
  const included = getNetWorthIncludedSources(id, scope.kind, scope.settings || {});
  const assets = scope.assets.filter(a=>!id||!a.portfolioId||a.portfolioId===id);
  const marketDays = included.assets ? assets.filter(a=>a.is_active!==false).flatMap(a=>a.chartData||[]).map(p=>marketDay(p.time,scope.timeZone)).filter(d=>d&&d<=today).sort() : [];
  const tradeDays = included.assets && assets.length ? scope.trades.filter(t=>!id||!t.portfolioId||t.portfolioId===id).map(t=>localCashflowDay(t.date,scope.timeZone)).filter(d=>d&&d<=today).sort() : [];
  const candidate = marketDays[0] || tradeDays[0] || shiftNetWorthDay(today,-30);
  return {from: candidate>=today ? shiftNetWorthDay(today,-30) : candidate<shiftNetWorthDay(today,-365) ? shiftNetWorthDay(today,-365) : candidate, to:today};
}

/** Display valuation, not a ledger mutation. Cash is reconstructed from current
 * native balances minus subsequent signed Ledger rows. Both transfer legs stay
 * in this projection so internal transfers cancel, and a scope boundary remains
 * a real cash movement. BucketActivity mirrors are deliberately NOT added again.
 * Every native component uses the same current FX quote for the entire window.
 */
export function getNetWorthSeries(scope: NetWorthScope, range: NetWorthRange): NetWorthPoint[] {
  if (!localCashflowDay(range.from) || !localCashflowDay(range.to) || range.from>range.to) return [];
  const included = getNetWorthIncludedSources(allPortfolioId(scope.portfolioId),scope.kind,scope.settings||{});
  const target = scope.currency || 'USD';
  const fx = (amount:number, currency='USD') => {
    if (!Number.isFinite(amount)) throw Error('Net worth: unresolved balance');
    if (currency===target) return decimal(amount);
    const source = currency==='USD'?1:scope.exchangeRates[currency], dest=target==='USD'?1:scope.exchangeRates[target];
    if (!(source>0) || !(dest>0)) throw Error(`Net worth: missing FX ${currency}/${target}`);
    return decimal(amount).div(decimal(source)).mul(decimal(dest));
  };
  const inScope = (item:{portfolioId?:string}) => !scope.portfolioId || scope.portfolioId==='__all_portfolios__' || !item.portfolioId || item.portfolioId===scope.portfolioId;
  const buckets = included.buckets ? scope.buckets.filter(inScope) : [];
  const accounts = included.cash ? scope.accounts.filter(inScope) : [];
  const bucketIds = new Set(buckets.map(b=>b.id)), accountIds = new Set(accounts.map(a=>a.id));
  let currentCash = decimal(0);
  for(const bucket of buckets) currentCash=currentCash.add(fx(bucket.currentAmount,bucket.currency));
  const currentBuckets = currentCash;
  for(const account of accounts) currentCash=currentCash.add(fx(scope.balances.find(b=>b.accountId===account.id)?.balance||0,account.currency));
  const rows: CashflowRecord[] = scope.cashActivities.filter(r=>!!r.bucketId&&bucketIds.has(r.bucketId));
  // Broker entries contain the actual cash settlement, including trade-linked
  // fees; do not also subtract the corresponding Trade amounts.
  for(const entry of scope.brokerEntries.filter(e=>accountIds.has(e.accountId))) rows.push({
    id:`broker:${entry.id}`, date:entry.occurredAt, brokerageAccountId:entry.accountId,
    type:entry.type==='WITHDRAW'||entry.type==='TRADE_BUY'||entry.amount<0?'WITHDRAW':'DEPOSIT',
    originalAmount:Math.abs(entry.amount), currency:entry.currency, isTransfer:true,
  });
  const effects = new Map<string, ReturnType<typeof decimal>>();
  const bucketEffects = new Map<string, ReturnType<typeof decimal>>();
  // Ask the Ledger selector for signs in each record's native denomination.
  // Valuation FX is then applied once, rather than historical execution FX.
  for(const currency of new Set(rows.map(r=>r.originalAmount!==undefined?r.currency||'USD':'USD'))) {
    const group=rows.filter(r=>(r.originalAmount!==undefined?r.currency||'USD':'USD')===currency);
    const ledger=getLedgerView(group,{currency,exchangeRates:scope.exchangeRates,timeZone:scope.timeZone},'all');
    if(ledger.missing.length) throw Error('Net worth: unresolved ledger money');
    for(const row of ledger.rows) {
      const effect = fx(row.signedMinor/100,currency);
      effects.set(row.day,(effects.get(row.day)||decimal(0)).add(effect));
      if (row.record.bucketId && bucketIds.has(row.record.bucketId)) bucketEffects.set(row.day,(bucketEffects.get(row.day)||decimal(0)).add(effect));
    }
  }
  const assets = included.assets ? scope.assets.filter(inScope) : [];
  const prepared = assets.map(asset=>{
    const prices=(asset.chartData||[]).map(p=>({day:marketDay(p.time,scope.timeZone),price:p.price})).filter(p=>p.day&&Number.isFinite(p.price)&&p.price>0).sort((a,b)=>a.day.localeCompare(b.day));
    const trades=scope.trades.filter(t=>t.asset.toUpperCase()===asset.symbol.toUpperCase()&&(!asset.portfolioId||t.portfolioId===asset.portfolioId)).map(t=>{
      const units=t.shares||(t.pricePerUnit?(t.amountUSD||0)/t.pricePerUnit:0);
      return {day:localCashflowDay(t.date,scope.timeZone),units:['BUY','IMPORT','COVER'].includes(t.type)?units:['SELL','SHORT'].includes(t.type)?-units:0};
    });
    return {asset,prices,trades};
  });
  const currentTotal=assets.reduce((sum,a)=>sum.add(fx(a.valueUSD)),currentCash);
  const result:NetWorthPoint[]=[];
  for(let day=range.from; day<=range.to; day=shiftNetWorthDay(day,1)) {
    let value=currentCash;
    for(const [date,effect] of effects) if(date>day) value=value.sub(effect);
    const cash = value;
    let bucketValue = currentBuckets;
    for(const [date,effect] of bucketEffects) if(date>day) bucketValue=bucketValue.sub(effect);
    for(const {asset,prices,trades} of prepared) {
      // Unknown earlier holdings are an opening position, not zero. With a
      // complete trade ledger this equals the former cumulative share count.
      const quantity=Math.max(0,(asset.shares||0)-trades.filter(t=>t.day>day).reduce((s,t)=>s+t.units,0));
      const latest=prices.at(-1)?.price;
      const historical=[...prices].reverse().find(p=>p.day<=day)?.price||prices[0]?.price;
      const currentUnit=asset.currentPrice||asset.valueUSD/Math.max(asset.shares||1,1);
      const unit=latest&&historical?historical*(currentUnit/latest):currentUnit;
      value=value.add(fx(asset.shares ? quantity*unit : asset.valueUSD));
    }
    result.push({date:day,value:Number(value.toFixed(12)),parts:{assets:Number(value.sub(cash).toFixed(12)),brokerCash:Number(cash.sub(bucketValue).toFixed(12)),buckets:Number(bucketValue.toFixed(12))}});
  }
  // The latest point and headline share this exact valuation source. No rounding
  // to USD cents here: it would destroy satang accuracy when formatted in THB.
  if(result.length) {
    result[result.length-1].value=Number(currentTotal.toFixed(12));
    result[result.length-1].parts={assets:Number(currentTotal.sub(currentCash).toFixed(12)),brokerCash:Number(currentCash.sub(currentBuckets).toFixed(12)),buckets:Number(currentBuckets.toFixed(12))};
  }
  return result;
}

export function getNetWorthChange(series: readonly NetWorthPoint[]) {
  const opening=series[0]?.value||0,current=series.at(-1)?.value||0;
  const amount=Number(decimal(current).sub(decimal(opening)).toFixed(12));
  return {amount,percent:opening>0?amount/opening*100:null,days:series.length>1?Math.round((Date.parse(series.at(-1)!.date)-Date.parse(series[0].date))/86400000):0};
}
