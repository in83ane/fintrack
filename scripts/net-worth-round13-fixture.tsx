import React, {createContext,useContext,useState} from 'react';
import {createRoot} from 'react-dom/client';
import DashboardView from '../src/app/(app)/dashboard/DashboardView';
import {getNetWorthSeries,getNetWorthRange} from '../src/lib/net-worth-series';
import {selectNetWorthRange,downsampleNetWorth} from '../src/lib/net-worth-chart';
// @ts-expect-error virtual QA dictionary extracted from production
import {translations} from 'qa-translations';
const App=createContext<any>(null);
export const useApp=()=>useContext(App);
const rate=33.743;
function Fixture(){
 const params=new URLSearchParams(location.search),scenario=params.get('scenario')||'bucket',language=params.get('lang')||'en';
 const [loading,setLoading]=useState(false);(window as any).__loading=setLoading;
 const oldCash=[{id:'i',type:'INCOME',originalAmount:3000,currency:'THB',bucketId:'b',date:'2026-10-03',category:'Salary'},{id:'o',type:'EXPENSE',originalAmount:560.16,currency:'THB',bucketId:'b',date:'2026-10-20',category:'Food'}];
 const cash=[{id:'opening',type:'INCOME',originalAmount:100,currency:'THB',bucketId:'b',date:'2026-09-12',category:'Salary'},{id:'a',type:'INCOME',originalAmount:2700,currency:'THB',bucketId:'b',date:'2026-10-06',category:'Salary'},{id:'b',type:'INCOME',originalAmount:1762.69,currency:'THB',bucketId:'b',date:'2026-10-07',category:'Gift'},{id:'c',type:'EXPENSE',originalAmount:1314.19,currency:'THB',bucketId:'b',date:'2026-10-23',category:'Food'}];
 const asset={symbol:'AAA',name:'Example',shares:10,currentPrice:120,valueUSD:1200,avgCost:100,chartData:scenario==='long'?Array.from({length:1200},(_,i)=>({time:Date.parse('2026-10-26')-(1199-i)*86400000,price:100+i*.01})):Array.from({length:31},(_,i)=>({time:Date.parse('2026-09-26')+i*86400000,price:100+i*2/3}))};
 const assets=['stock','mixed','long'].includes(scenario)?[asset]:[];
 const buckets=['bucket','mixed','one-day'].includes(scenario)?[{id:'b',name:'Cash',currency:'THB',currentAmount:26480.33}]:[];
 const rows=scenario==='one-day'?[{...cash[0],originalAmount:2439.84,date:'2026-10-26'}]:buckets.length?cash:[];
 const scope={assets,trades:[],buckets,cashActivities:rows,accounts:[],balances:[],brokerEntries:[],currency:'USD',exchangeRates:{USD:1,THB:rate}};
 const series=getNetWorthSeries(scope,getNetWorthRange(scope,'2026-10-26'));
 (window as any).__expected=(period:any)=>{const range=selectNetWorthRange(scope,period,'2026-10-26');return {range,data:getNetWorthSeries(scope,range),sample:downsampleNetWorth(getNetWorthSeries(scope,range))}};(window as any).__series=series;(window as any).__format=(value:number)=>'฿'+(value*rate).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const app={...scope,netWorthScope:scope,netWorthHistory:series,moneyBuckets:buckets,bucketActivities:[],marketQuotes:{},currency:'THB',language,t:(k:string)=>translations[language][k]||k,formatMoney:(window as any).__format,totalInvested:assets.length?1000:0,totalUnrealizedPL:assets.length?200:0,totalRealizedPL:0,totalDividends:0,portfolios:[],activePortfolio:null,activePortfolioId:null,isAllPortfolios:true,isDataLoaded:!loading,netWorthSettings:{includeAssets:true,includeCash:true,includeBuckets:true},addToast:()=>{}};
 return <App.Provider value={app}><aside style={{position:'fixed',width:254,height:'100dvh',borderRight:'1px solid var(--color-border)',padding:24}}>FinTrack</aside><div style={{marginLeft:254}}><header style={{height:74,padding:24,borderBottom:'1px solid var(--color-border)'}}>DASHBOARD</header><DashboardView/></div></App.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
