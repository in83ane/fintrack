// Real Portfolio UI + TopBar, deterministic in-memory financial source, no writes to services.
import React, { createContext, useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {RouteSkeleton} from '../src/components/skeleton/RouteSkeleton';
import {LedgerActions} from '../src/components/LedgerActions';
import BucketView from '../src/app/(app)/budget/BucketView';
import { installChartMotion } from '../src/lib/chart-motion';
import {useLoadingGate} from '../src/hooks/useLoadingGate';
import PortfolioView from '../src/app/(app)/portfolio/PortfolioView';
import { TopBar } from '../src/components/TopBar';
import { PageTransition } from '../src/components/PageTransition';
// @ts-expect-error Test-only virtual dictionary extracted from the real AppContext.
import { translations } from 'qa-translations';
export const Navigation=createContext<any>({pathname:'/budget',prefetch:()=>{},push:()=>{}});
const App=createContext<any>(null);
export const useApp=()=>useContext(App);
export function useFxRate(){const {fx}=useApp();return fx;}
const portfolios=[{id:'p1',name:'Broker A',kind:'trading',color:'#4edea3'},{id:'p2',name:'Broker B',kind:'trading',color:'#adc6ff'}];
const assets=[{id:'a1',portfolioId:'p1',symbol:'AAPL',name:'Apple',allocation:'Stocks',currency:'USD',shares:2,avgCost:100,currentPrice:120,valueUSD:240},{id:'a2',portfolioId:'p2',symbol:'MSFT',name:'Microsoft',allocation:'Stocks',currency:'USD',shares:3,avgCost:200,currentPrice:220,valueUSD:660}];
const empty:any[]=[];
const buckets=[{id:'b1',name:'Essentials',targetPercent:50,currentAmount:500,currency:'THB',color:'#4edea3',icon:'wallet'},{id:'b2',name:'Savings',targetPercent:30,currentAmount:300,currency:'THB',color:'#adc6ff',icon:'piggy-bank'},{id:'b3',name:'Investing',targetPercent:20,currentAmount:200,currency:'THB',color:'#e9c349',icon:'trending-up'}];
function Fixture(){const [visible,setVisible]=useState(true),[tick,setTick]=useState(0);React.useEffect(()=>installChartMotion(),[]);const [loaded,setLoaded]=useState(false),[fxState,setFx]=useState('loading');const params=new URLSearchParams(location.search);const lang=params.get('lang')||'en';
  const fx=React.useMemo(()=>({rate:fxState==='ready'?'33.723':null,quote:fxState==='ready'?{fetchedAt:1792900000000}:null,mode:'auto',stale:false,loading:fxState==='loading',error:fxState==='error',setManual:()=>{},resetAuto:()=>{}}),[fxState]);
  const app={fx,t:(key:string)=>translations[lang][key]||key,language:lang,currency:'THB',setCurrency:()=>{},setLanguage:()=>{},portfolios,assets:params.has('empty')?empty:assets,activePortfolio:null,activePortfolioId:null,isAllPortfolios:true,isDataLoaded:loaded,moneyBuckets:buckets,brokerageAccounts:empty,allBrokerageAccounts:empty,brokerageCashBalances:empty,trades:empty,marketQuotes:{},netWorthSettings:{includeAssets:true,includeCash:true,includeBuckets:true},totalInvested:0,totalUnrealizedPL:0,totalRealizedPL:0,totalDividends:0,netWorthHistory:empty,allMoneyBuckets:buckets,cashActivities:empty,bucketActivities:empty,brokerageCashEntries:empty,allocations:empty,customCategories:empty,notifPreferences:{priceAlerts:true,rebalanceAlerts:true,weeklyReport:false},darkMode:true,formatMoney:(v:number)=>String(v),fetchAssetMarketData:async()=>null,exchangeRates:{USD:1,THB:33.723},notifications:empty,userProfile:loaded?{avatarUrl:'',initials:'FT',email:'fixture@example.test'}:null,selectPortfolio:()=>{},saveAssetPreferences:()=>{},setNetWorthSettings:()=>{},addToast:()=>{}};
  (window as any).__qaRemount=()=>setVisible(v=>!v);(window as any).__qaTick=()=>setTick(v=>v+1);
  (window as any).__qaLoad=()=>{setFx('ready');setLoaded(true);};(window as any).__qaFxError=()=>setFx('error');
  return <App.Provider value={app}><PageTransition><aside style={{position:'fixed',width:254,height:'100vh',borderRight:'1px solid var(--color-border)'}}><p style={{padding:24}}>FinTrack</p></aside><div style={{marginLeft:254}}><TopBar/><div data-route-entered><LedgerActions>{visible?<BucketView/>:<p>Other page</p>}</LedgerActions></div></div></PageTransition></App.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
