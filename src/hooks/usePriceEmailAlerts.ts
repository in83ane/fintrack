'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/src/lib/supabase';
export interface EmailAlertStatus {
  configured:boolean; recipientAllowed:boolean; schedulerHealthy:boolean; ready:boolean; testMode:boolean;
}
export interface EmailPriceAlert {
  id:string;symbol:string;target_price:number;currency:'USD'|'THB';direction:'above'|'below';note:string;
  status:'active'|'pending'|'sent'|'failed'|'skipped'|'triggered';current_price:number|null;checked_at:string|null;triggered_at:string|null;sent_at:string|null;last_error:string|null;
}
export function usePriceEmailAlerts(open:boolean, owner?:string) {
  const [status,setStatus]=useState<EmailAlertStatus|null>(null);
  const [alerts,setAlerts]=useState<EmailPriceAlert[]>([]);
  const [error,setError]=useState(false);
  const [loading,setLoading]=useState(false);
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const version=++generation.current;
    if(!open||!owner)return;
    setLoading(true);
    try {
      const [config,rows]=await Promise.all([
        supabase.functions.invoke('price-email-alerts',{body:{action:'status'}}),
        supabase.from('price_email_alerts').select('id,symbol,target_price,currency,direction,note,status,current_price,checked_at,triggered_at,sent_at,last_error').order('status').order('created_at',{ascending:false}).limit(100),
      ]);
      if(config.error||rows.error)throw Error('Email alerts unavailable');
      if(version!==generation.current)return;
      setStatus(config.data);setAlerts(rows.data as EmailPriceAlert[]);setError(false);
    } catch {if(version===generation.current){setError(true);setStatus(null);}}
    finally {if(version===generation.current)setLoading(false);}
  },[open,owner]);
  useEffect(()=>{
    setAlerts([]);setStatus(null);setError(false);
    void refresh();
    if(!open)return;
    const timer=setInterval(()=>void refresh(),30000);
    return ()=>{generation.current++;clearInterval(timer);};
  },[refresh,open]);
  async function create(input:{symbol:string;targetPrice:number;currency:string;direction:'above'|'below';note:string;locale:string}) {
    if(!status?.ready)throw Error('Background monitoring is not connected');
    const {error}=await supabase.from('price_email_alerts').insert({
      symbol:input.symbol,target_price:input.targetPrice,currency:input.currency,
      direction:input.direction,note:input.note,locale:input.locale,
    });
    if(error)throw Error('Could not save email alert');
    await refresh();
  }
  async function remove(id:string) {
    const {error}=await supabase.from('price_email_alerts').delete().eq('id',id);
    if(error)throw Error('Could not delete email alert');
    await refresh();
  }
  return {status,alerts,error,loading,refresh,create,remove};
}
