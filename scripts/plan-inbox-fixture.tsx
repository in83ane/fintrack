import React from 'react';
import {createRoot} from 'react-dom/client';
import PlanView from '../src/app/(app)/plan/PlanView';
import {useNotificationInbox} from '../src/hooks/useNotificationInbox';
const Context=React.createContext<any>(null);
export const useApp=()=>React.useContext(Context);
function App(){
 const th=new URLSearchParams(location.search).get('lang')==='th';
 const inbox=useNotificationInbox('qa-user','qa@example.test');
 const value={language:th?'th':'en',userProfile:{email:'qa@example.test'},currency:'THB',moneyBuckets:[{id:'bucket',name:'Main wallet',currency:'THB',currentAmount:10000}],addToast:()=>{}};
 return <Context.Provider value={value}><aside><output data-testid="unread">{inbox.unread}</output><button onClick={()=>void inbox.refresh()}>Refresh inbox</button><button onClick={()=>void inbox.mark()}>Read all</button><button onClick={inbox.loadMore}>More history</button><output data-testid="history">{inbox.notifications.length}</output>{inbox.notifications.slice(0,2).map(n=><button key={n.id} onClick={()=>void inbox.mark(n.id)}>{n.title}</button>)}</aside><PlanView/></Context.Provider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
