import React from 'react';
import {createRoot} from 'react-dom/client';
import PlanView from '../src/app/(app)/plan/PlanView';
const Context=React.createContext<any>(null);
export const useApp=()=>React.useContext(Context);
const th=new URLSearchParams(location.search).get('lang')==='th';
const value={language:th?'th':'en',userProfile:{email:'qa@example.test'},currency:'THB',moneyBuckets:[{id:'qa-bucket',name:'QA wallet',currency:'THB',currentAmount:10000}],addToast:(message:string)=>{document.getElementById('toast')!.textContent=message;}};
createRoot(document.getElementById('root')!).render(<React.StrictMode><Context.Provider value={value}><div id="toast" role="status"/><PlanView/></Context.Provider></React.StrictMode>);
