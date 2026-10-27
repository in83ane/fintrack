import { createClient } from 'npm:@supabase/supabase-js@2.103.0';
import { targetQuote, marketSymbol } from './core.js';
const env = key => Deno.env.get(key);
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth:{persistSession:false,autoRefreshToken:false} });
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply = (value,status=200) => Response.json(value,{status,headers:{...cors,'Cache-Control':'no-store'}});
const requireOk = async query => {const {data,error}=await query;if(error)throw Error('Database operation failed');return data;};
const hash = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function quote(symbol) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`,{
    headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'},signal:AbortSignal.timeout(5000),
  });
  if(!response.ok) throw Error('Quote unavailable');
  const data=await response.json(), meta=data.chart?.result?.[0]?.meta;
  if(!Number.isFinite(meta?.regularMarketPrice)||meta.regularMarketPrice<=0||!meta.currency) throw Error('Quote unavailable');
  return {price:meta.regularMarketPrice,currency:meta.currency,time:meta.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null};
}
async function run(config,deadline) {
  let checked=0,sent=0;
  // Fair queue across accounts; bounded work keeps each free-tier invocation short.
  const active=await requireOk(db.from('price_email_alerts').select('*').eq('status','active').order('checked_at',{ascending:true,nullsFirst:true}).limit(20));
  const quoteCache=new Map();
  const getQuote=symbol=>{const key=marketSymbol(symbol);if(!quoteCache.has(key))quoteCache.set(key,quote(key).catch(()=>null));return quoteCache.get(key);};
  for(let offset=0;offset<active.length && Date.now()<deadline-15000;offset+=4) {
    await Promise.all(active.slice(offset,offset+4).map(async alert=>{
      const market=await getQuote(alert.symbol);
      const fx=market && market.currency!==alert.currency ? await getQuote('THB=X'):null;
      const result=targetQuote(alert,market,fx?.price);
      const now=new Date().toISOString();
      const patch=result ? {checked_at:now,quote_at:market.time,current_price:result.price,last_error:null,...(result.hit?{status:'triggered',triggered_at:now}:{})}
        : {checked_at:now,last_error:market?'fx_or_currency_unavailable':'quote_unavailable'};
      await requireOk(db.from('price_email_alerts').update(patch).eq('id',alert.id).eq('status','active'));
      checked++;
    }));
  }
  return {checked,sent};
}
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{headers:cors});
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  const config={configured:true}; // Inbox delivery needs no email service.
  try {
    const token=request.headers.get('x-alert-worker-token');
    if(!token) {
      const bearer=request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
      if(!bearer)return reply({error:'Unauthorized'},401);
      const {data,error}=await db.auth.getUser(bearer);
      if(error||!data.user)return reply({error:'Unauthorized'},401);
      const body=await request.json().catch(()=>({}));
      if(body.action!=='status')return reply({error:'Forbidden'},403);
      const worker=await requireOk(db.from('price_email_worker').select('last_run_at,configured').eq('id',true).single());
      const schedulerHealthy=!!worker.last_run_at && Date.now()-Date.parse(worker.last_run_at)<180000;
      return reply({configured:config.configured,recipientAllowed:true,schedulerHealthy,testMode:false,
        ready:schedulerHealthy,intervalSeconds:60,delivery:"inbox"});
    }
    if(token.length>256)return reply({error:'Unauthorized'},401);
    const tokenHash=await hash(token), leaseId=crypto.randomUUID(), now=new Date();
    const lease=await requireOk(db.from('price_email_worker').update({lease_id:leaseId,lease_until:new Date(now.getTime()+120000).toISOString(),last_run_at:now.toISOString(),configured:config.configured})
      .eq('id',true).eq('token_hash',tokenHash).lt('lease_until',now.toISOString()).select('id').maybeSingle());
    if(!lease) return reply({error:'Unauthorized or worker busy'},409);
    try {
      if(!config.configured)return reply({configured:false,checked:0,sent:0});
      return reply({configured:true,...await run(config,Date.now()+45000)});
    } finally {
      await requireOk(db.from('price_email_worker').update({lease_until:new Date().toISOString(),lease_id:null}).eq('id',true).eq('lease_id',leaseId));
    }
  } catch {return reply({error:'Alert worker unavailable; will retry on the next scheduled run'},503);}
});
