import type { NetWorthPoint, NetWorthScope } from './net-worth-series';
import { shiftNetWorthDay } from './net-worth-series';
import { getNetWorthIncludedSources, localCashflowDay } from './cashflow-selectors';

export const NET_WORTH_PERIODS = ['7D', '30D', '90D', '1Y', 'ALL'] as const;
export type NetWorthPeriod = typeof NET_WORTH_PERIODS[number];

/** Display range only: do not change the valuation or manufacture earlier data. */
export function selectNetWorthRange(scope: NetWorthScope, period: NetWorthPeriod, today: string) {
  const id = scope.portfolioId === '__all_portfolios__' ? null : scope.portfolioId;
  const included = getNetWorthIncludedSources(id, scope.kind, scope.settings || {});
  const inScope = (item:{portfolioId?:string}) => !id || !item.portfolioId || item.portfolioId === id;
  const assets = included.assets ? scope.assets.filter(inScope) : [];
  const buckets = new Set(included.buckets ? scope.buckets.filter(inScope).map(b=>b.id) : []);
  const accounts = new Set(included.cash ? scope.accounts.filter(inScope).map(a=>a.id) : []);
  const dates = [
    ...assets.flatMap(a=>(a.chartData || []).filter(p=>Number.isFinite(p.time)).map(p=>new Date(p.time).toISOString())),
    ...scope.trades.filter(t=>inScope(t)&&assets.some(a=>a.symbol.toUpperCase()===t.asset.toUpperCase())).map(t=>t.date),
    ...scope.cashActivities.filter(r=>r.bucketId&&buckets.has(r.bucketId)).map(r=>r.date),
    ...scope.brokerEntries.filter(e=>accounts.has(e.accountId)).map(e=>e.occurredAt),
  ].map(d=>localCashflowDay(d,scope.timeZone)).filter(d=>d&&d<=today).sort();
  const first = dates[0];
  const requested = shiftNetWorthDay(today,-({ '7D':7, '30D':30, '90D':90, '1Y':365, 'ALL':30 }[period]));
  const from = first && (period==='ALL'||first>requested) ? first : requested;
  return {from,to:today,shortened:!!first&&period!=='ALL'&&first>requested};
}

/** Keep the opening value, then the actual closing observation of each bin. */
export function downsampleNetWorth(data: readonly NetWorthPoint[], limit=400): NetWorthPoint[] {
  if (data.length<=limit) return [...data];
  if (limit<2) throw Error('At least two observations are required');
  return [data[0], ...Array.from({length:limit-1},(_,i)=>data[Math.ceil((i+1)*(data.length-1)/(limit-1))])];
}

/** Nice, padded display bounds; valuation data is never rounded or clipped. */
export function niceNetWorthTicks(min:number,max:number):number[] {
  if(!Number.isFinite(min)||!Number.isFinite(max))return [0,.25,.5,.75,1];
  if(min>max)[min,max]=[max,min];
  if(min===0&&max===0)return [0,.25,.5,.75,1];
  const pad=min===max?Math.abs(max)*.01:(max-min)*.07;
  const low=min>=0?Math.max(0,min-pad):min-pad,high=max+pad;
  const power=Math.floor(Math.log10((high-low)/4));
  const candidates:{ticks:number[];span:number;distance:number}[]=[];
  for(let exponent=power-2;exponent<=power+3;exponent++)for(const factor of [1,2,2.5,5]){
    const step=factor*10**exponent;
    const start=Math.floor(low/step+1e-10)*step,end=Math.ceil(high/step-1e-10)*step;
    const count=Math.round((end-start)/step)+1;
    if(count<4||count>6)continue;
    const span=end-start,coverage=(max-min)/span;
    candidates.push({ticks:Array.from({length:count},(_,i)=>Number((start+i*step).toPrecision(14))),span,distance:coverage<.7?.7-coverage:coverage>.85?coverage-.85:0});
  }
  candidates.sort((a,b)=>a.distance-b.distance||a.span-b.span);
  return candidates[0]?.ticks||[low,low+(high-low)/3,low+2*(high-low)/3,high];
}
export function formatNetWorthTick(value:number,ticks:readonly number[]=[value]) {
  const magnitude=Math.abs(value),step=Math.abs((ticks[1]??value)-ticks[0])||1;
  const unit=magnitude>=1e6?1e6:magnitude>=1e3?1e3:1,suffix=unit===1e6?'M':unit===1e3?'k':'';
  const fractional=ticks.some(v=>Math.abs(v/unit-Math.round(v/unit))>1e-8);
  const decimals=unit>1?(fractional?1:0):step>=1?0:Math.min(8,Math.max(0,-Math.floor(Math.log10(step)))+(step/10**Math.floor(Math.log10(step))===2.5?1:0));
  const rounded=(value/unit).toFixed(decimals);
  return `${Number(rounded)===0?(0).toFixed(decimals):rounded}${suffix}`;
}
const dateFormatters=new Map<string,Intl.DateTimeFormat>();
/** Ledger's Intl locales and Bangkok calendar; order parts without hardcoded months. */
export function formatNetWorthDate(day:string,language:'en'|'th',full=false){
  const key=language+full;
  if(!dateFormatters.has(key))dateFormatters.set(key,new Intl.DateTimeFormat(language==='th'?'th-TH':'en-US',{day:'numeric',month:'short',...(full?{year:'numeric' as const}:{}),timeZone:'Asia/Bangkok'}));
  const parts=dateFormatters.get(key)!.formatToParts(new Date(`${day}T12:00:00+07:00`));
  return ['day','month',...(full?['year']:[])].map(type=>parts.find(p=>p.type===type)?.value).filter(Boolean).join(' ');
}
export function formatNetWorthPercent(value:number|null){
  if(value===null||!Number.isFinite(value))return '—';
  if(value>999)return '>999%';
  if(value< -999)return '<-999%';
  const rounded=value.toFixed(1);
  return Number(rounded)===0?'0.0%':`${value>0?'+':''}${rounded}%`;
}
export function netWorthPeriodLabel(period:NetWorthPeriod,first:string,last:string,language:'en'|'th'){
  return period==='ALL'?`${language==='th'?'ตั้งแต่':'since'} ${formatNetWorthDate(first,language,first.slice(0,4)!==last.slice(0,4))}`:period;
}
/** Monotone cubic Hermite (Fritsch–Carlson limiter). Every control value stays
 * inside adjacent observed values; flat intervals are exactly horizontal. */
export function monotoneNetWorthPath(points:readonly {x:number;y:number}[]){
  if(!points.length)return '';
  if(points.length===1)return `M ${points[0].x} ${points[0].y}`;
  const slopes=points.slice(1).map((p,i)=>(p.y-points[i].y)/(p.x-points[i].x));
  const tangents=points.map((_,i)=>i===0?slopes[0]:i===points.length-1?slopes.at(-1)!:slopes[i-1]*slopes[i]<=0?0:2/(1/slopes[i-1]+1/slopes[i]));
  slopes.forEach((s,i)=>{if(s===0){tangents[i]=0;tangents[i+1]=0;return;}const a=tangents[i]/s,b=tangents[i+1]/s,norm=Math.hypot(a,b);if(norm>3){tangents[i]=3*a/norm*s;tangents[i+1]=3*b/norm*s;}});
  return points.slice(1).reduce((path,p,i)=>{const previous=points[i],dx=(p.x-previous.x)/3;return `${path} C ${previous.x+dx} ${previous.y+tangents[i]*dx}, ${p.x-dx} ${p.y-tangents[i+1]*dx}, ${p.x} ${p.y}`;},`M ${points[0].x} ${points[0].y}`);
}
export function netWorthDateTicks(points:readonly NetWorthPoint[],x:(i:number)=>number,language:'en'|'th'){
  const multiYear=points.length>0&&points[0].date.slice(0,4)!==points.at(-1)!.date.slice(0,4);
  for(let count=Math.min(5,points.length);count>=1;count--){
    let previousYear='';
    const labels=Array.from({length:count},(_,i)=>Math.round(i*(points.length-1)/Math.max(1,count-1))).map(index=>{
      const year=points[index].date.slice(0,4),label=formatNetWorthDate(points[index].date,language,multiYear&&year!==previousYear);previousYear=year;return {index,label};
    });
    if(labels.every((label,i)=>i===0||x(label.index)-x(labels[i-1].index)>=(label.label.length+labels[i-1].label.length)*3+48))return labels;
  }
  return [];
}

export type Rect = {left:number;top:number;width:number;height:number};
/** All coordinates are relative to the plot; bounds may extend into the card. */
export function placeNetWorthTooltip(point:{x:number;y:number}, size:{width:number;height:number}, bounds:Rect) {
  const {width:w,height:h}=size, pad=8;
  const left=bounds.left+pad,right=bounds.left+bounds.width-pad,top=bounds.top+pad,bottom=bounds.top+bounds.height-pad;
  const clampX=(x:number)=>Math.max(left,Math.min(right-w,x));
  const clampY=(y:number)=>Math.max(top,Math.min(bottom-h,y));
  const above={left:clampX(point.x-w/2),top:point.y-14-h};
  if(above.top>=top) return above;
  const sides=[{left:point.x+16,space:right-point.x},{left:point.x-16-w,space:point.x-left}].sort((a,b)=>b.space-a.space);
  for(const side of sides) if(side.left>=left&&side.left+w<=right) return {left:side.left,top:clampY(point.y-h/2)};
  if(point.y+14+h<=bottom) return {left:clampX(point.x-w/2),top:point.y+14};
  // The caller can compact the details if no candidate fits in a short card.
  return {left:above.left,top:clampY(above.top)};
}
