// Isolated browser fixture: real UI/selectors, in-memory writes only.
import React, { useState, useEffect, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import Ledger from '../src/app/(app)/ledger/page';
import Template from '../src/app/(app)/template';
import { PriceAlertManager } from '../src/components/PriceAlertManager';
import { Sidebar } from '../src/components/Sidebar';
import { TopBar } from '../src/components/TopBar';
import { MotionSettings } from '../src/components/MotionSettings';
import { LedgerActions } from '../src/components/LedgerActions';
import { PageTransition } from '../src/components/PageTransition';
import { RouteViewport } from '../src/components/RouteContent';
import { transitionTheme } from '../src/lib/theme-transition';
// Supplied by the runner from the real dictionary (not a duplicate translation).
// @ts-expect-error Virtual module supplied only by the QA bundler.
import { translations } from 'qa-translations';
export const Navigation = createContext<any>(null);
const App = createContext<any>(null);
export const useApp = () => useContext(App);
const record=(id:string,type:string,amount:number,date:string,category:string)=>({id,type,originalAmount:amount,currency:'THB',amountUSD:amount/33.7,rateAtTime:33.7,bucketId:'wallet',category,note:id==='food'?'Lunch with family':'',date});
const initial=[record('salary','INCOME',8270.28,'2026-10-25T03:00:00Z','Salary'),record('food','EXPENSE',126,'2026-10-25T02:00:00Z','Food'),record('coffee','EXPENSE',117.21,'2026-10-24T03:00:00Z','Coffee'),record('rent','EXPENSE',5530,'2026-10-24T02:00:00Z','Housing')];
function Fixture(){
  const [currency,setCurrency]=useState('THB');
  const [pathname,setPath]=useState(location.pathname),[cash,setCash]=useState(initial),[dark,setDark]=useState(true);
  const [customCategories,setCustomCategories]=useState([{id:'weekly',type:'INCOME',label:'เงินรายอาทิตย์'}]);
  const params=new URLSearchParams(location.search),language=params.get('lang')==='th'?'th':'en';
  const [loaded,setLoaded]=useState(params.get('state')!=='loading');
  const sequence=React.useRef(0);
  const push=React.useCallback((url:string)=>{const id=++sequence.current;setTimeout(()=>{if(id!==sequence.current)return;history.pushState({},'',url);setPath(new URL(url,location.href).pathname);},Number(new URLSearchParams(location.search).get('routeDelay')||0));},[]);
  useEffect(()=>{const pop=()=>setPath(location.pathname);window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  (window as any).__qaLoad=()=>setLoaded(true);
  (window as any).__qaCalls??=[];
  const app={assets:[],addNotification:()=>{},customCategories,addCustomCategory:async(type:string,label:string)=>setCustomCategories(old=>[...old,{id:label,type,label}]),removeCustomCategory:async(id:string)=>setCustomCategories(old=>old.filter(c=>c.id!==id)),t:(key:string)=>translations[language][key]||key,language,currency,cashActivities:params.get('state')==='empty'?[]:cash,trades:[],brokerageCashEntries:[],moneyBuckets:[{id:'wallet',name:'Everyday wallet',currency:'THB',currentAmount:9000,currentAmountUSD:9000/33.7,targetAmount:10000,allocationPercent:100}],brokerageCashBalances:[],brokerageAccounts:[],portfolios:[],activePortfolioId:null,activePortfolio:null,isAllPortfolios:true,exchangeRates:{USD:1,THB:33.709},isDataLoaded:loaded,userProfile:null,notifications:[],markNotificationRead:()=>{},clearNotifications:()=>{},setLanguage:()=>{},setCurrency,selectPortfolio:()=>{},createPortfolio:()=>{},renamePortfolio:()=>{},addToast:()=>{},updateMoneyBucket:()=>{},addBucketActivity:()=>{},formatMoney:(v:number)=>String(v),removeCashActivity:async(id:string)=>{(window as any).__qaCalls.push(id);setCash(rows=>rows.filter(r=>r.id!==id));},updateCashActivity:async(id:string,values:any)=>setCash(rows=>rows.map(r=>r.id===id?{...r,...values}:r)),addCashActivity:async()=>null};
  if(params.has('wallets')) {
    const count=Number(params.get('wallets'));
    app.moneyBuckets=Array.from({length:count},(_,i)=>({id:i===0?'wallet':`wallet-${i}`,name:['True Money','NEXT','K Bank','เป๋าตัง','Savings','Travel','Holiday USD','Emergency USD'][i],currency:i>=6?'USD':'THB',currentAmount:i>=6?100:1000+i*100,currentAmountUSD:0,targetAmount:10000,allocationPercent:0}));
    (app as any).brokerageAccounts=[{id:'a',name:'Cash USD',currency:'USD',portfolioId:'broker-a'},{id:'b',name:'Cash USD',currency:'USD',portfolioId:'broker-b'}];
    (app as any).brokerageCashBalances=[{accountId:'a',balance:25.5}];
    (app as any).portfolios=[{id:'broker-a',name:'Broker A'},{id:'broker-b',name:'Broker B'}];
  }
  return <App.Provider value={app}><Navigation.Provider value={{pathname,push,replace:push,prefetch:()=>{}}}><MotionSettings><LedgerActions><PageTransition><Sidebar/><PriceAlertManager/><div className="ml-[var(--sidebar-w)]"><TopBar/><button className="sr-only" onClick={event=>{const next=!dark;void transitionTheme(()=>{document.documentElement.classList.toggle('light-mode',!next);setDark(next);},{x:event.clientX,y:event.clientY});}}>Theme</button><button data-test-fixed-plus className="fixed bottom-8 right-8 z-40 h-14 w-14 rounded-full">+</button><main data-page-content><RouteViewport><Template key={pathname}>{pathname==='/ledger'?<Ledger/>:<div className="app-page-container py-6"><h1>{pathname}</h1>{[0,1,2].map(i=><section key={i} className="st h-28 my-4 bg-surface rounded-xl">Page card {i}</section>)}</div>}</Template></RouteViewport></main></div></PageTransition></LedgerActions></MotionSettings></Navigation.Provider></App.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
