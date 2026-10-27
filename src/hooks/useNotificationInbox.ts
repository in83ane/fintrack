'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import type { AppNotification } from '@/src/context/AppContext';

/** The database owns history. Local storage is only a durable outbox for offline writes. */
export function useNotificationInbox(userId?: string, email?: string) {
  const [notifications,setNotifications]=useState<AppNotification[]>([]);
  const [unread,setUnread]=useState(0),[limit,setLimit]=useState(50),[hasMore,setHasMore]=useState(false);
  const [error,setError]=useState(false),[loading,setLoading]=useState(false);
  const owner=useRef(userId); owner.current=userId;
  const epoch=useRef(0), busy=useRef(false);
  const key=email?`fintrack-notifications:${encodeURIComponent(email)}`:'';
  const refresh=useCallback(async()=>{
    if(!userId||busy.current)return;
    busy.current=true; const run=epoch.current; setLoading(true);
    const valid=()=>owner.current===userId&&run===epoch.current;
    try {
      let local:AppNotification[]=[];
      try {local=JSON.parse(localStorage.getItem(key)||'[]');}catch{/* no cached outbox */}
      if(Array.isArray(local)) for(const n of local) {
        if(!valid())return;
        if(!n?.id||!n.title||!Number.isFinite(Date.parse(String(n.time))))continue;
        const {error:saveError}=await supabase.from('account_notifications').insert({user_id:userId,id:n.id,title:n.title.slice(0,500),message:n.message.slice(0,4000),type:n.type,created_at:new Date(n.time).toISOString(),read:!!n.read});
        if(saveError&&saveError.code!=='23505')throw saveError;
        // Remove only this acknowledged item, preserving writes added during the request.
        try {const latest=JSON.parse(localStorage.getItem(key)||'[]');localStorage.setItem(key,JSON.stringify(latest.filter((r:AppNotification)=>r.id!==n.id)));}catch{/* storage unavailable */}
      }
      const [rows,count]=await Promise.all([
        (async()=>{const data:any[]=[];for(let offset=0;offset<=limit;offset+=500){const page=await supabase.from('account_notifications').select('*').eq('user_id',userId).order('read').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,Math.min(offset+499,limit));if(page.error)return page;data.push(...(page.data||[]));if((page.data?.length||0)<Math.min(500,limit-offset+1))break;}return {data,error:null};})(),
        supabase.from('account_notifications').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('read',false),
      ]);
      if(rows.error||count.error)throw rows.error||count.error;
      if(!valid())return;
      setNotifications((rows.data||[]).slice(0,limit).map(n=>({...n,time:new Date(n.created_at)})));
      setHasMore((rows.data?.length||0)>limit); setUnread(count.count||0);setError(false);
    }catch{if(valid())setError(true);}finally{if(valid()){busy.current=false;setLoading(false);}}
  },[userId,key,limit]);
  useEffect(()=>{
    epoch.current++;busy.current=false;setNotifications([]);setUnread(0);setHasMore(false);setLimit(50);
  },[userId]);
  useEffect(()=>{
    void refresh();
    const wake=()=>{if(document.visibilityState==='visible')void refresh();};
    const timer=setInterval(wake,15000);
    window.addEventListener('focus',wake);window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);
    return()=>{clearInterval(timer);window.removeEventListener('focus',wake);window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake);epoch.current++;busy.current=false;};
  },[refresh]);
  const add=useCallback((title:string,message:string,type:AppNotification['type'])=>{
    if(!userId)return;
    const n:AppNotification={id:crypto.randomUUID(),title,message,type,time:new Date(),read:false};
    try {const rows=JSON.parse(localStorage.getItem(key)||'[]');localStorage.setItem(key,JSON.stringify([n,...rows]));void refresh();}
    catch {void supabase.from('account_notifications').insert({user_id:userId,id:n.id,title,message,type}).then(({error})=>{if(owner.current===userId){if(error)setError(true);else void refresh();}});}
    setNotifications(rows=>[n,...rows]);setUnread(n=>n+1);
  },[userId,key,refresh]);
  const mark=useCallback(async(id?:string)=>{
    if(!userId)return;
    let query=supabase.from('account_notifications').update({read:true}).eq('user_id',userId).eq('read',false);
    if(id)query=query.eq('id',id);
    const {error}=await query;
    if(owner.current!==userId)return;
    if(error){setError(true);return;}
    await refresh();
  },[userId,refresh]);
  return {notifications,unread,hasMore,error,loading,refresh,add,mark,loadMore:()=>setLimit(n=>n+50)};
}
