import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
function moduleUrl(file,replacements={}) {
 let code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 for(const [name,url] of Object.entries(replacements))code=code.replaceAll(`from '${name}'`,`from '${url}'`);
 return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const decimal=moduleUrl('./cost-basis-ledger.ts'),fx=moduleUrl('./fx.ts',{'./cost-basis-ledger':decimal});
const cashflow=moduleUrl('./cashflow-selectors.ts',{'./fx':fx});
const ledger=moduleUrl('./ledger-selectors.ts',{'./cashflow-selectors':cashflow});
const {getNetWorthSeries,getNetWorthRange,getNetWorthChange}=await import(moduleUrl('./net-worth-series.ts',{'./cashflow-selectors':cashflow,'./ledger-selectors':ledger,'./fx':fx}));
const {getCashflowSummary}=await import(cashflow);
const chart=await import(moduleUrl('./net-worth-chart.ts',{'./net-worth-series':moduleUrl('./net-worth-series.ts',{'./cashflow-selectors':cashflow,'./ledger-selectors':ledger,'./fx':fx}),'./cashflow-selectors':cashflow}));
const require=createRequire(import.meta.url);
const {formatPercent,formatFixed}=await import(moduleUrl('./format.ts',{'date-fns':pathToFileURL(require.resolve('date-fns')).href}));
const range={from:'2026-10-01',to:'2026-10-05'};
const base={currency:'THB',exchangeRates:{USD:1,THB:33.743},assets:[],trades:[],cashActivities:[],buckets:[],accounts:[],balances:[],brokerEntries:[]};
const row=(id,type,amount,date,bucketId='b',extra={})=>({id,type,originalAmount:amount,currency:'THB',bucketId,date,...extra});
const bucket=(amount,id='b',currency='THB')=>({id,currentAmount:amount,currency});
const vals=(scope,r=range)=>getNetWorthSeries({...base,...scope},r).map(p=>p.value);

test('parts reconcile every day, with USD and THB balances and cash transfers',()=>{
 const s={...base,assets:[{symbol:'A',shares:2,currentPrice:100,valueUSD:200,chartData:[{time:Date.parse('2026-10-01'),price:80},{time:Date.parse('2026-10-05'),price:100}]}],buckets:[bucket(1500),bucket(10,'usd','USD')],accounts:[{id:'ac',currency:'USD'}],balances:[{accountId:'ac',balance:25}],cashActivities:[row('1','INCOME',100,'2026-10-03')],brokerEntries:[{id:'1',accountId:'ac',type:'DEPOSIT',amount:5,currency:'USD',occurredAt:'2026-10-04'}]};
 for(const p of getNetWorthSeries(s,range))assert.ok(Math.abs(Object.values(p.parts).reduce((a,b)=>a+b,0)-p.value)<.000001);
 const end=getNetWorthSeries(s,range).at(-1);assert.equal(end.parts.assets,6748.6);assert.equal(end.parts.brokerCash,843.575);assert.equal(end.parts.buckets,1837.43);
});
test('nice ticks: 4–6 steps, 7% padding, positive/negative/flat/narrow/zero',()=>{
 for(const [min,max] of [[11933,27900],[23331.83,27794.52],[0,0],[26480.33,26480.33],[-20,-5],[-1,1],[.00001,.00003],[1e9,3e9],[10,10],[0,100],[999,1001],[100.0001,100.0002],[-40,-40]]){
  const ticks=chart.niceNetWorthTicks(min,max),pad=min===max?Math.abs(max)*.01:(max-min)*.07,low=min>=0?Math.max(0,min-pad):min-pad,high=min===0&&max===0?1:max+pad;
  assert.ok(ticks.length>=4&&ticks.length<=6);assert.ok(ticks.every(Number.isFinite));assert.ok(ticks[0]<=low+1e-9);assert.ok(ticks.at(-1)>=high-1e-9);
  const step=ticks[1]-ticks[0],factor=step/10**Math.floor(Math.log10(step));assert.ok([1,2,2.5,5,10].some(n=>Math.abs(n-factor)<1e-6));assert.ok(ticks.at(-1)-high<=step+1e-9);
 }
 assert.deepEqual(chart.niceNetWorthTicks(11933,27900),[10000,15000,20000,25000,30000]);
 assert.deepEqual(chart.niceNetWorthTicks(0,0),[0,.25,.5,.75,1]);
 assert.equal(chart.formatNetWorthTick(12500,[10000,12500,15000,17500]),'12.5k');assert.equal(chart.formatNetWorthTick(10000,[10000,12500,15000,17500]),'10.0k');
 assert.equal(chart.formatNetWorthTick(1230000,[1000000,1250000,1500000]),'1.2M');
});
test('display percentages cap extremes and normalize negative rounded zero',()=>{
 for(const v of [0,-0,-.0001])assert.equal(chart.formatNetWorthPercent(v),'0.0%');
 assert.equal(chart.formatNetWorthPercent(121.9),'+121.9%');assert.equal(chart.formatNetWorthPercent(1000),'>999%');assert.equal(chart.formatNetWorthPercent(-1000),'<-999%');assert.equal(chart.formatNetWorthPercent(null),'—');
 assert.equal(chart.netWorthPeriodLabel('ALL','2026-08-02','2026-10-26','en'),'since 2 Aug');assert.match(chart.netWorthPeriodLabel('ALL','2025-08-02','2026-10-26','th'),/2568/);
 assert.equal(chart.formatNetWorthDate('2026-09-26','en'),'26 Sep');assert.equal(chart.netWorthPeriodLabel('1Y','2026-08-02','2026-10-26','en'),'1Y');
});
test('monotone cubic passes real endpoints without any overshoot or non-flat plateaus',()=>{
 const points=[{x:0,y:10},{x:10,y:10},{x:20,y:50},{x:30,y:18},{x:40,y:18},{x:50,y:22},{x:60,y:100}];
 const path=chart.monotoneNetWorthPath(points);assert.ok(!path.includes(' H '));
 const segments=path.split(' C ').slice(1).map(segment=>segment.replaceAll(',','').trim().split(/\s+/).map(Number));
 for(let i=0;i<segments.length;i++){
  const p=points[i],next=points[i+1],[x1,y1,x2,y2,x3,y3]=segments[i];assert.equal(x3,next.x);assert.equal(y3,next.y);
  for(let j=0;j<=100;j++){const t=j/100,u=1-t,y=u*u*u*p.y+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y3;assert.ok(y>=Math.min(p.y,next.y)-1e-9&&y<=Math.max(p.y,next.y)+1e-9);}
 }
 const dates=Array.from({length:1000},(_,i)=>({date:new Date(Date.parse('2024-01-01')+i*86400000).toISOString().slice(0,10),value:100}));
 const labels=chart.netWorthDateTicks(dates,i=>i/999*300,'en');assert.ok(labels.length<5);assert.match(labels[0].label,/2024/);assert.ok(labels.every(t=>!t.label.includes('Sept')));
});
test('short history starts at first included observation; ALL has no 365-day cap',()=>{
 const s={...base,buckets:[bucket(100)],cashActivities:[row('a','INCOME',100,'2026-09-12')]};
 assert.deepEqual(chart.selectNetWorthRange(s,'1Y','2026-10-26'),{from:'2026-09-12',to:'2026-10-26',shortened:true});
 assert.equal(chart.selectNetWorthRange(s,'30D','2026-10-26').from,'2026-09-26');
 s.cashActivities[0].date='2020-01-01';assert.equal(chart.selectNetWorthRange(s,'ALL','2026-10-26').from,'2020-01-01');
 assert.equal(chart.selectNetWorthRange({...s,cashActivities:[row('a','INCOME',100,'2026-10-26')]},'7D','2026-10-26').from,'2026-10-26');
 assert.equal(chart.selectNetWorthRange({...base,portfolioId:'other',buckets:[{...bucket(100),portfolioId:'p'}],cashActivities:s.cashActivities},'ALL','2026-10-26').from,'2026-09-26');
});
test('downsample uses actual period closes, preserves opening/last/parts; never interpolates',()=>{
 const points=Array.from({length:1601},(_,i)=>({date:String(i),value:i,parts:{assets:i,buckets:0,brokerCash:0}}));
 const sampled=chart.downsampleNetWorth(points);assert.equal(sampled.length,400);assert.equal(sampled[0],points[0]);assert.equal(sampled.at(-1),points.at(-1));
 for(let i=1;i<sampled.length;i++)assert.equal(sampled[i],points[Math.ceil(i*1600/399)]);
 assert.deepEqual(chart.downsampleNetWorth([]),[]);
});
test('round 13 sample is unchanged by presentation and exposes Oct 15 source parts',()=>{
 const s={...base,buckets:[bucket(26480.33)],cashActivities:[row('old','INCOME',100,'2026-09-12'),row('a','INCOME',2700,'2026-10-06'),row('b','INCOME',1762.69,'2026-10-07'),row('c','EXPENSE',1314.19,'2026-10-23')]};
 const data=getNetWorthSeries(s,chart.selectNetWorthRange(s,'30D','2026-10-26')),change=getNetWorthChange(data),p=data.find(p=>p.date==='2026-10-15');
 assert.equal(data[0].value,23331.83);assert.equal(data.at(-1).value,26480.33);assert.equal(change.amount,3148.5);assert.equal(formatPercent(change.percent,1),'+13.5%');
 assert.equal(p.value,27794.52);assert.equal(Number((p.value-data[0].value).toFixed(2)),4462.69);assert.equal(formatPercent((p.value-data[0].value)/data[0].value*100,1),'+19.1%');assert.equal(p.parts.buckets,p.value);
 assert.match(chart.formatNetWorthDate('2026-10-15','th',true),/2569/);
 const allScope={...s,cashActivities:[row('opening','INCOME',11933.45,'2026-08-02'),row('old1','INCOME',5000,'2026-08-15'),row('old2','INCOME',6398.38,'2026-09-10'),...s.cashActivities.slice(1)]};
 const all=getNetWorthSeries(allScope,chart.selectNetWorthRange(allScope,'ALL','2026-10-26'));
 assert.equal(all[0].value,11933.45);assert.equal(all.at(-1).value,26480.33);assert.equal(getNetWorthChange(all).amount,14546.88);assert.equal(chart.formatNetWorthPercent(getNetWorthChange(all).percent),'+121.9%');

});
test('bucket EOD is current balance minus subsequent Ledger effects',()=>{
 assert.deepEqual(vals({buckets:[bucket(1150)],cashActivities:[row('1','INCOME',300,'2026-10-02'),row('2','EXPENSE',100,'2026-10-03'),row('3','EXPENSE',50,'2026-10-05')]}),[1000,1300,1200,1200,1150]);
});
test('no activity and empty portfolio produce flat daily series, never Start=0',()=>{
 assert.deepEqual(vals({buckets:[bucket(26480.33)]}),Array(5).fill(26480.33));
 assert.deepEqual(vals({}),Array(5).fill(0));
 assert.ok(getNetWorthSeries(base,range).every(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.date)));
});
test('internal bucket transfer cancels; external/single-wallet scope still moves',()=>{
 const rows=[row('out','WITHDRAW',250,'2026-10-03','a',{isTransfer:true}),row('in','DEPOSIT',250,'2026-10-03','b',{isTransfer:true})];
 assert.deepEqual(vals({buckets:[bucket(750,'a'),bucket(250)],cashActivities:rows}),Array(5).fill(1000));
 assert.deepEqual(vals({buckets:[bucket(250)],cashActivities:rows}),[0,0,250,250,250]);
});
test('asset opening price + bucket opening carried backward, latest price forward',()=>{
 const asset={symbol:'A',valueUSD:120,shares:1,currentPrice:120,chartData:[{time:Date.parse('2026-10-03'),price:100},{time:Date.parse('2026-10-04'),price:120}]};
 assert.deepEqual(vals({currency:'USD',assets:[asset],buckets:[bucket(50,'b','USD')]}),[150,150,150,170,170]);
});
test('trade quantity opening reconciles holdings without resetting an existing position to zero',()=>{
 const asset={symbol:'A',valueUSD:300,shares:3,currentPrice:100};
 assert.deepEqual(vals({currency:'USD',assets:[asset],trades:[{id:1,asset:'A',type:'BUY',shares:1,date:'2026-10-03',amountUSD:100}]}),[200,200,300,300,300]);
});
test('all components end at headline valuation exactly, including broker settlements',()=>{
 const s={...base,currency:'USD',assets:[{symbol:'A',valueUSD:200,shares:2,currentPrice:100}],buckets:[bucket(3374.3)],accounts:[{id:'ac',currency:'USD'}],balances:[{accountId:'ac',balance:50}],brokerEntries:[{id:'e',accountId:'ac',type:'DEPOSIT',amount:50,currency:'USD',occurredAt:'2026-10-03'}]};
 assert.deepEqual(getNetWorthSeries(s,range).map(p=>p.value),[300,300,350,350,350]);
});
test('bucket→broker transfer is counted once per actual leg, not mirrored activity or trade',()=>{
 const s={...base,currency:'USD',exchangeRates:{USD:1,THB:30},buckets:[bucket(2700)],accounts:[{id:'ac',currency:'USD'}],balances:[{accountId:'ac',balance:10}],cashActivities:[row('c','WITHDRAW',300,'2026-10-03','b',{isTransfer:true})],brokerEntries:[{id:'e',accountId:'ac',type:'DEPOSIT',amount:10,currency:'USD',occurredAt:'2026-10-03'}]};
 assert.deepEqual(getNetWorthSeries(s,range).map(p=>p.value),Array(5).fill(100));
});
test('different bucket currencies use current constant FX, ignoring execution-rate changes',()=>{
 assert.deepEqual(vals({exchangeRates:{THB:30,USD:1},buckets:[bucket(1500),bucket(50,'usd','USD')],cashActivities:[row('thb','INCOME',300,'2026-10-02','b',{rateAtTime:33}),row('usd','INCOME',10,'2026-10-04','usd',{currency:'USD',rateAtTime:35})]}),[2400,2700,2700,3000,3000]);
});
test('Bangkok end of day matches Ledger, including UTC date crossing',()=>{
 assert.deepEqual(vals({buckets:[bucket(100)],cashActivities:[row('1','INCOME',100,'2026-10-02T18:00:00Z')]}),[0,0,100,100,100]);
});
test('sample balance and monthly net reconcile to 24040.49 opening and +10.1%',()=>{
 const rows=[row('i','INCOME',3000,'2026-10-03'),row('o','EXPENSE',560.16,'2026-10-20')];
 const s={...base,buckets:[bucket(26480.33)],cashActivities:rows};
 const series=getNetWorthSeries(s,getNetWorthRange(s,'2026-10-26')),change=getNetWorthChange(series);
 assert.equal(series[0].value,24040.49);assert.equal(series.at(-1).value,26480.33);assert.equal(change.amount,2439.84);assert.equal(formatPercent(change.percent,1),'+10.1%');
 assert.equal(getCashflowSummary(rows,{...base,from:'2026-10-01',to:'2026-10-31'}).netMinor,243984);
});
test('zero/negative openings have no percent, tiny negatives never print negative zero',()=>{
 assert.equal(getNetWorthChange([{date:range.from,value:0},{date:range.to,value:100}]).percent,null);
 assert.equal(getNetWorthChange([{date:range.from,value:-50},{date:range.to,value:100}]).percent,null);
 assert.equal(formatPercent(-0,1),'0.0%');assert.equal(formatPercent(-.004,1),'0.0%');assert.equal(formatFixed(-.00001,2),'0.00');assert.equal(formatPercent(.004,1),'0.0%');
});
test('one-day activity still gets a daily 30-day window; explicit missing FX fails instead of inventing zero',()=>{
 const s={...base,buckets:[bucket(100)],cashActivities:[row('a','INCOME',20,'2026-10-26')]};const series=getNetWorthSeries(s,getNetWorthRange(s,'2026-10-26'));
 assert.equal(series.length,31);assert.equal(series[0].value,80);assert.equal(series.at(-1).value,100);
 assert.throws(()=>getNetWorthSeries({...s,currency:'USD',exchangeRates:{}},range),/missing FX/);
});
test('portfolio/setting scope and duplicate symbols remain separate',()=>{
 const a={symbol:'A',valueUSD:100,shares:1,currentPrice:100,portfolioId:'one'};
 const s={...base,currency:'USD',portfolioId:'one',assets:[a,{...a,portfolioId:'two',valueUSD:500,shares:5}],trades:[{asset:'A',portfolioId:'two',type:'BUY',shares:5,date:'2026-10-03'}]};
 assert.deepEqual(getNetWorthSeries(s,range).map(p=>p.value),Array(5).fill(100));
 assert.deepEqual(vals({kind:'cash_management',portfolioId:'one',assets:[a],buckets:[{...bucket(50),portfolioId:'one'},{...bucket(100),portfolioId:'two'}]}),Array(5).fill(50));
});

// The shared amount view retains Portfolio's existing decimal/currency markup.
test('shared money view preserves Portfolio typography and Dashboard currency prefix',async()=>{
 const utils=moduleUrl('./utils.ts',{'clsx':pathToFileURL(require.resolve('clsx')).href,'tailwind-merge':pathToFileURL(require.resolve('tailwind-merge')).href});
 const {MoneyValue}=await import(moduleUrl('../components/MoneyValue.tsx',{'react':pathToFileURL(require.resolve('react')).href,'@/src/lib/utils':utils,'@/src/lib/fx':fx}));
 const {renderToStaticMarkup}=await import('react-dom/server');const React=await import('react');
 const portfolio=renderToStaticMarkup(React.createElement(MoneyValue,{value:26480.33,cur:'THB'}));
 assert.match(portfolio,/26,480<span class="font-semibold text-\[0.6em\]">.33<\/span> <span class="font-bold text-\[0.5em\]">THB/);
 const dashboard=renderToStaticMarkup(React.createElement(MoneyValue,{value:26480.33,cur:'THB',symbol:true,decimalClass:'text-[0.5em]'}));assert.ok(dashboard.includes('฿26,480')&&dashboard.includes('.33'));
});
