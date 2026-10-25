// Browser QA only: production page and chart components, in-memory context.
// This file is outside app routes and never reads or writes user storage.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CashflowPage from '../src/app/(app)/cashflow/page';
import { installChartMotion } from '../src/lib/chart-motion';
const today='2026-10-25';
const record=(id:string,type:string,amount:number,bucketId:string,category:string,date=today)=>({id,type,originalAmount:amount,currency:'THB',amountUSD:amount/33.7,rateAtTime:33.7,bucketId,category,date});
const buckets=[{id:'true',name:'True Money',currency:'THB',targetAmount:3000,currentAmount:1000},{id:'pao',name:'เป๋าตัง',currency:'THB',targetAmount:1500,currentAmount:2000},{id:'k',name:'K Bank',currency:'THB',targetAmount:10000,currentAmount:15000},{id:'next',name:'NEXT',currency:'THB',targetAmount:2500,currentAmount:8700.33}];
const cash=[record('salary','INCOME',7000,'k','Salary','2026-10-01'),record('freelance','INCOME',1270.28,'true','Freelance','2026-10-10'),record('food1','EXPENSE',126,'true','Food','2026-10-11'),record('food2','EXPENSE',20,'true','อาหาร','2026-10-12'),record('food3','EXPENSE',110,'true','Food','2026-10-13'),record('rent','EXPENSE',4000,'k','Housing','2026-10-02'),record('travel','EXPENSE',1400,'pao','Transport','2026-10-09'),record('coffee','EXPENSE',117.21,'next','Coffee','2026-10-15')];
export function useApp(){return (window as any).__qaApp;}
function Fixture(){
  const mode=new URLSearchParams(location.search).get('state')||'populated';
  const [version,setVersion]=useState(0);
  const cashActivities=mode==='error'?new Proxy([],{get(target,key){if(key==='filter')throw Error('Fixture: unavailable financial data');return Reflect.get(target,key);}}):mode==='empty'?[]:mode==='partial'?[...cash,{id:'missing',type:'INCOME',originalAmount:50,currency:'USD',date:today,category:'Gift'}]:cash;
  (window as any).__qaApp={cashActivities,trades:mode==='empty'?[]:[{id:1,type:'BUY',originalAmount:300,currency:'USD',amountUSD:300,rateAtTime:33.7,portfolioId:'p',brokerageAccountId:'broker',date:today},{id:2,type:'SELL',originalAmount:20,currency:'USD',amountUSD:20,rateAtTime:33.7,portfolioId:'p',brokerageAccountId:'broker',date:today}],moneyBuckets:mode==='empty'?[]:buckets,brokerageAccounts:[{id:'broker',name:'Broker cash',currency:'USD',portfolioId:'p'}],activePortfolioId:null,activePortfolio:null,currency:'THB',exchangeRates:mode==='partial'?{}:{USD:1,THB:33.709},language:'en',isDataLoaded:mode!=='loading',netWorthHistory:[{date:today,value:792.09}],netWorthSettings:{includeAssets:true,includeCash:true,includeBuckets:true},formatMoney:(usd:number)=>`฿${(usd*33.709).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`,t:(key:string)=>({addRecord:'Add record',viewAllTransactions:'View all transactions'}[key]||key),addToast:()=>{},addCashActivity:()=>{},assets:[]};
  (window as any).__qaRerender=()=>setVersion(v=>v+1);
  useEffect(()=>installChartMotion(),[]);
  return <div data-version={version}><CashflowPage/></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
