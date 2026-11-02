import {NextResponse} from 'next/server';
import {fetchStockSplits, type StockSplit} from '@/src/lib/stock-splits';

export async function GET(request:Request) {
  const params=new URL(request.url).searchParams;
  const symbols=[...new Set((params.get('symbols') || '').toUpperCase().split(',').filter(Boolean))];
  const from=params.get('from') || '';
  const today=new Date().toISOString().slice(0,10);
  if(!symbols.length || symbols.length>40 || symbols.some(s=>!/^[A-Z0-9.^=-]{1,30}$/.test(s))
    || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(Date.parse(from)) || from<'1900-01-01' || from>today) return NextResponse.json({error:'Invalid symbols or start date'},{status:400});
  const splits:StockSplit[]=[],unavailable:string[]=[];
  // Bound upstream concurrency; missing data is explicit, never "no splits".
  for(let i=0;i<symbols.length;i+=6) {
    const batch=symbols.slice(i,i+6);
    const results=await Promise.allSettled(batch.map(symbol=>fetchStockSplits(symbol,from,today)));
    results.forEach((result,index)=>result.status==='fulfilled'?splits.push(...result.value):unavailable.push(batch[index]));
  }
  return NextResponse.json({splits,unavailable});
}
