"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { getNetWorthSeries, type NetWorthScope } from '@/src/lib/net-worth-series';
import { NET_WORTH_PERIODS, selectNetWorthRange, type NetWorthPeriod } from '@/src/lib/net-worth-chart';
import { SKELETON_DELAY } from '@/src/lib/loading-policy';

const STORAGE_KEY='fintrack:net-worth-period';
export function useNetWorthChart(scope:NetWorthScope, today:string) {
  const [requested,setRequested]=useState<NetWorthPeriod>('30D');
  const preferred=useRef(requested);
  preferred.current=requested;
  const initial=useMemo(()=>{
    // A new scope starts in the selected period, never briefly resets to 30D.
    const period=preferred.current, range=selectNetWorthRange(scope,period,today);
    try { return {scope,today,period,range,data:getNetWorthSeries(scope,range)}; }
    catch { return {scope,today,period,range,data:[]}; }
  },[scope,today]);
  const [resolved,setResolved]=useState(initial);
  const [dim,setDim]=useState(false);
  const [failed,setFailed]=useState(false);
  const cache=useRef(new Map<NetWorthPeriod,typeof initial>());
  const requestId=useRef(0);
  useEffect(()=>{try{const saved=localStorage.getItem(STORAGE_KEY);if(NET_WORTH_PERIODS.includes(saved as NetWorthPeriod))setRequested(saved as NetWorthPeriod);}catch{}},[]);
  useEffect(()=>{cache.current=new Map([[initial.period,initial]]);},[initial]);
  useEffect(()=>{
    const id=++requestId.current, cached=cache.current.get(requested);
    setDim(false);setFailed(false);
    if(cached){setResolved(cached);return;}
    const range=selectNetWorthRange(scope,requested,today);
    let worker:Worker|undefined, cancelled=false, watchdog:ReturnType<typeof setTimeout>;
    const timer=setTimeout(()=>setDim(true),SKELETON_DELAY);
    const finish=(data:typeof initial.data,error=false)=>{
      if(cancelled||id!==requestId.current)return;
      clearTimeout(timer);clearTimeout(watchdog);setDim(false);setFailed(error);
      if(!error){const next={scope,today,period:requested,range,data};cache.current.set(requested,next);setResolved(next);}
    };
    const fallback=()=>{try{finish(getNetWorthSeries(scope,range));}catch{finish([],true);}};
    watchdog=setTimeout(()=>{worker?.terminate();finish([],true);},20_000);
    try {
      worker=new Worker(new URL('../lib/net-worth-worker.ts',import.meta.url));
      worker.onmessage=e=>{if(e.data.id===id)finish(e.data.data||[],e.data.error);};
      worker.onerror=()=>{worker?.terminate();fallback();};
      worker.postMessage({id,scope,range});
    }catch{fallback();}
    return ()=>{cancelled=true;clearTimeout(timer);clearTimeout(watchdog);worker?.terminate();};
  },[scope,today,requested,initial]);
  function select(period:NetWorthPeriod){setRequested(period);try{localStorage.setItem(STORAGE_KEY,period);}catch{}}
  // A changed portfolio must never paint the previous portfolio's cached chart.
  const current=resolved.scope===scope&&resolved.today===today?resolved:initial;
  return {...current,select,dim,failed};
}
