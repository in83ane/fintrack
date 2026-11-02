export type StockSplit = {symbol:string; date:string; numerator:number; denominator:number; source:string};

export function validateStockSplit(split:StockSplit, today=new Date().toISOString().slice(0,10)) {
  const parsed=Date.parse(`${split.date}T00:00:00Z`);
  return /^[A-Z0-9.^=-]{1,30}$/.test(split.symbol) && /^\d{4}-\d{2}-\d{2}$/.test(split.date)
    && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0,10)===split.date
    && split.date>='1900-01-01' && split.date<=today
    && [split.numerator,split.denominator].every(n=>Number.isInteger(n)&&n>0&&n<=1000000)
    && split.numerator!==split.denominator && split.source.trim().length>0 && split.source.length<=500;
}

/** Read the event date, never the chart bucket key (monthly buckets differ). */
export function parseStockSplits(symbol:string, payload:any, from:string, today:string):StockSplit[] {
  const chart=payload?.chart?.result?.[0];
  if(payload?.chart?.error || !chart || chart.meta?.symbol?.toUpperCase()!==symbol) throw Error('Split history unavailable');
  const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:chart.meta.exchangeTimezoneName || 'UTC',year:'numeric',month:'2-digit',day:'2-digit'});
  const result:StockSplit[]=[];
  for(const event of Object.values(chart.events?.splits || {}) as any[]) {
    if(!Number.isFinite(event.date) || event.date<=0) throw Error('Invalid split event date');
    const parts=dateFormat.formatToParts(new Date(event.date*1000));
    const date=['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');
    const split={symbol,date,numerator:Number(event.numerator),denominator:Number(event.denominator),source:`Yahoo Finance: https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`};
    if(!validateStockSplit(split,today)) { if(date>today) continue; throw Error('Invalid split event'); }
    if(date>from && !result.some(s=>s.date===date)) result.push(split);
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date));
}

export async function fetchStockSplits(symbol:string,from:string,today:string) {
  const response=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${Math.max(0,Math.floor(Date.parse(from)/1000))}&period2=${Math.floor(Date.now()/1000)}&interval=1mo&events=splits`,{signal:AbortSignal.timeout(10000),next:{revalidate:3600}});
  if(!response.ok) throw Error('Split history unavailable');
  return parseStockSplits(symbol,await response.json(),from,today);
}
