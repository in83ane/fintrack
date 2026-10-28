// Real Portfolio UI + TopBar, deterministic in-memory financial source, no writes to services.
import React, { createContext, useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {RouteSkeleton} from '../src/components/skeleton/RouteSkeleton';
import {LedgerActions} from '../src/components/LedgerActions';
import PortfolioView from '../src/app/(app)/portfolio/PortfolioView';
import { TopBar } from '../src/components/TopBar';
import { PageTransition } from '../src/components/PageTransition';
// @ts-expect-error Test-only virtual dictionary extracted from the real AppContext.
import { translations } from 'qa-translations';
export const Navigation=createContext<any>({pathname:'/portfolio',prefetch:()=>{},push:()=>{}});
const App=createContext<any>(null);
export const useApp=()=>useContext(App);
export function useFxRate(){const {fx}=useApp();return fx;}
const portfolios=[{id:'p1',name:'Dime',kind:'trading',color:'#4edea3'},{id:'p2',name:'Webull',kind:'trading',color:'#adc6ff'}];
const assets=[{id:'a1',portfolioId:'p1',symbol:'AAPL',name:'Apple',allocation:'Stocks',currency:'USD',shares:2,avgCost:100,currentPrice:120,valueUSD:240},{id:'a2',portfolioId:'p2',symbol:'MSFT',name:'Microsoft',allocation:'Stocks',currency:'USD',shares:3,avgCost:200,currentPrice:220,valueUSD:660}];
const empty:any[]=[];
function Fixture(){const [selected,setSelected]=useState<string|null>(null);const [loaded,setLoaded]=useState(false),[fxState,setFx]=useState('loading');const params=new URLSearchParams(location.search);const lang=params.get('lang')||'en';
  const fx=React.useMemo(()=>({rate:fxState==='ready'?'33.723':null,quote:fxState==='ready'?{fetchedAt:1792900000000}:null,mode:'auto',stale:false,loading:fxState==='loading',error:fxState==='error',setManual:()=>{},resetAuto:()=>{}}),[fxState]);
  const app={fx,t:(key:string)=>translations[lang][key]||key,language:lang,currency:'THB',setCurrency:()=>{},setLanguage:()=>{},portfolios,assets:params.has('empty')?empty:selected?assets.filter(a=>a.portfolioId===selected):assets,activePortfolio:portfolios.find(p=>p.id===selected)||null,activePortfolioId:selected,isAllPortfolios:selected===null,isDataLoaded:loaded,moneyBuckets:empty,brokerageAccounts:empty,allBrokerageAccounts:empty,brokerageCashBalances:empty,trades:empty,marketQuotes:{},netWorthSettings:{includeAssets:true,includeCash:true,includeBuckets:true},totalInvested:0,totalUnrealizedPL:0,totalRealizedPL:0,totalDividends:0,netWorthHistory:empty,allMoneyBuckets:empty,cashActivities:empty,bucketActivities:empty,brokerageCashEntries:empty,allocations:empty,customCategories:empty,notifPreferences:{priceAlerts:true,rebalanceAlerts:true,weeklyReport:false},darkMode:true,formatMoney:(v:number)=>String(v),fetchAssetMarketData:async()=>null,exchangeRates:{USD:1,THB:33.723},notifications:empty,userProfile:loaded?{avatarUrl:'',initials:'FT',email:'fixture@example.test'}:null,selectPortfolio:setSelected,saveAssetPreferences:()=>{},setNetWorthSettings:()=>{},addToast:()=>{}};
  (window as any).__qaSelect=setSelected;
  (window as any).__qaLoad=()=>{setFx('ready');setLoaded(true);};(window as any).__qaFxError=()=>setFx('error');
  return <App.Provider value={app}><PageTransition><aside style={{position:'fixed',width:254,height:'100vh',borderRight:'1px solid var(--color-border)'}}><p style={{padding:24}}>FinTrack</p></aside><div style={{marginLeft:254}}><TopBar/><div data-route-entered><LedgerActions>{params.has('route')?<RouteSkeleton path={'/'+params.get('route')}/>:<PortfolioView/>}</LedgerActions></div></div></PageTransition></App.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
