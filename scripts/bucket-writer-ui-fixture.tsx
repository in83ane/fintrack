import React from 'react';
import {createRoot} from 'react-dom/client';
import {AddCashflowModal} from '../src/components/AddCashflowModal';
import BucketView from '../src/app/(app)/budget/BucketView';
import {createBucketCommander,bucketWriteMessage} from '../src/lib/bucket-command';
// @ts-expect-error Test dictionary is extracted from the real provider.
import {translations} from 'qa-translations';
const Context=React.createContext<any>(null);
export const useApp=()=>React.useContext(Context);
const owner='11111111-1111-4111-8111-111111111111',bid='33333333-3333-4333-8333-333333333333',pid='44444444-4444-4444-8444-444444444444';
const execute=createBucketCommander(async args=>(await fetch('/write',{method:'POST',body:JSON.stringify(args)})).json());
function Fixture(){
 const params=new URLSearchParams(location.search),language=params.get('lang')||'en',th=language==='th';
 const [open,setOpen]=React.useState(false),[type,setType]=React.useState<'EXPENSE'|'INCOME'>('EXPENSE'),[toast,setToast]=React.useState('');
 const buckets=[{id:bid,name:'QA wallet',currency:'THB',currentAmount:1000,targetPercent:50,color:'#4edea3',icon:'wallet'},{id:'55555555-5555-4555-8555-555555555555',name:'Second wallet',currency:'THB',currentAmount:0,targetPercent:50,color:'#adc6ff',icon:'wallet'}];
 const addCashActivities=async(rows:any[],op:string)=>{
  const command={op,rows:rows.map(a=>({portfolio_id:pid,bucket_id:a.bucketId||null,type:a.type,original_amount:a.originalAmount,currency:a.currency,rate_at_time:a.rateAtTime,date:a.date,category:a.category,note:a.note||null,is_transfer:!!a.isTransfer}))};
  const result=await execute(owner,command);if(result.error){setToast(bucketWriteMessage(result.error,th));return null;}return result.data;
 };
 const forbidden=()=>{throw Error('Obsolete split writer called');};
 const app={language,currency:'THB',t:(key:string)=>translations[language][key]||key,formatMoney:(n:number)=>String(n),exchangeRates:{USD:1,THB:35},moneyBuckets:buckets,allMoneyBuckets:buckets,cashActivities:[],bucketActivities:[],customCategories:[],brokerageAccounts:[],allBrokerageAccounts:[],brokerageCashBalances:[],portfolios:[],isDataLoaded:true,activePortfolioId:pid,userProfile:{email:'qa@example.test'},addCashActivities,addToast:setToast,updateMoneyBucket:forbidden,addBucketActivity:forbidden,addCashActivity:forbidden};
 return <Context.Provider value={app}><div role="status" id="toast">{toast}</div><button onClick={()=>{setType('EXPENSE');setOpen(true);setToast('');}}>QA expense</button><button onClick={()=>{setType('INCOME');setOpen(true);setToast('');}}>QA income</button><AddCashflowModal isOpen={open} onClose={()=>setOpen(false)} presetType={type}/>{params.has('bucket')&&<BucketView/>}</Context.Provider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
