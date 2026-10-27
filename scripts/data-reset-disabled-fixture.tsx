import React from 'react';
import {createRoot} from 'react-dom/client';
import SettingsPage from '../src/app/(app)/settings/page';
import SettingsSkeleton from '../src/app/(app)/settings/SettingsSkeleton';
// @ts-expect-error QA dictionary is extracted from the real provider, without running it.
import {translations} from 'qa-translations';
const Context=React.createContext<any>(null);
export const useApp=()=>React.useContext(Context);
function Fixture(){
  const params=new URLSearchParams(location.search),language=params.get('lang')==='th'?'th':'en';
  const [toast,setToast]=React.useState('');
  const app={language,t:(key:string)=>translations[language][key]||key,currency:'THB',
    darkMode:params.get('theme')!=='light',setLanguage:()=>{},setCurrency:()=>{},setDarkMode:()=>{},
    addToast:setToast,notifPreferences:{priceAlerts:true,rebalanceAlerts:false,weeklyReport:false},setNotifPreferences:()=>{},
    trades:[],cashActivities:[],moneyBuckets:[],bucketActivities:[],allocations:[],activePortfolioId:null};
  return <Context.Provider value={app}><div role="status" id="qa-toast">{toast}</div>{params.has('skeleton')?<SettingsSkeleton/>:<SettingsPage/>}</Context.Provider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
