// Public NAV service used by Finnomena's fund detail page. NAVs are dated
// end-of-day valuations, never intraday quotes or the underlying ETF price.
const FUNDS: Record<string, {id:string; name:string}> = {
  'X-SPACE': {id:'F00002JR2F',name:'กองทุนเปิดเอ็กซ์สปริง สเปซ อินโนเวเตอร์ อิควิตี้'},
};
export const isSupportedFund = (symbol:string) => Object.hasOwn(FUNDS,symbol.toUpperCase());

export function fundChartRange(points:{time:number;price:number}[], range:string) {
  if (!points.length) return [];
  if (range==='1d') return points.slice(-2);
  const end=points.at(-1)!.time;
  const days:Record<string,number>={'5d':5,'1mo':31,'3mo':93,'6mo':186,'1y':366};
  const start=range==='ytd' ? Date.UTC(new Date(end).getUTCFullYear(),0,1) : end-(days[range] ?? 366)*86400000;
  return points.filter(p => p.time>=start);
}

export function parseFundQuote(symbol:string, latest:any, history:any) {
  const info = FUNDS[symbol];
  const data = latest?.status === true ? latest.data : null;
  if (!info || data?.short_code !== symbol || data?.currency !== 'THB' || !Number.isFinite(Number(data.value)) || !(Number(data.value)>0) || !Number.isFinite(Date.parse(data.date))) return null;
  const points = (history?.status === true && history.data?.short_code === symbol && Array.isArray(history.data.navs) ? history.data.navs : [])
    .map((p:any) => ({time:Date.parse(p.date),price:Number(p.value)}))
    .filter((p:{time:number;price:number}) => Number.isFinite(p.time) && Number.isFinite(p.price) && p.price>0 && p.time<=Date.parse(data.date))
    .sort((a:{time:number},b:{time:number}) => a.time-b.time);
  const previous = points.filter((p:{time:number}) => p.time<Date.parse(data.date)).at(-1);
  const price = Number(data.value);
  const percent = typeof data.d_change === 'number' && Number.isFinite(data.d_change) ? data.d_change : null;
  return {symbol,name:info.name,price,quoteCurrency:'THB',quoteTimestamp:Date.parse(data.date),quoteAsOf:data.date.slice(0,10),
    quoteSource:'Finnomena / XSpring NAV',exchange:'Mutual fund NAV',
    dayChange:previous ? price-previous.price : null,dayChangePercent:percent,changePercent:percent ?? 0,
    chartData:points,intradayData:[]};
}

export async function fetchFundQuote(symbol:string) {
  const info=FUNDS[symbol];
  if (!info) return null;
  const base=`https://www.finnomena.com/fn3/api/fund/v2/public/funds/${info.id}`;
  const responses=await Promise.allSettled(['latest','nav/q?range=1Y'].map(async suffix => {
    const response=await fetch(`${base}/${suffix}`,{signal:AbortSignal.timeout(8000),next:{revalidate:1800}});
    if (!response.ok) throw Error('Fund NAV unavailable');
    return response.json();
  }));
  return parseFundQuote(symbol,responses[0].status==='fulfilled'?responses[0].value:null,responses[1].status==='fulfilled'?responses[1].value:null);
}
