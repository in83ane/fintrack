'use client';
// แก้ layout หน้านี้ ต้องแก้ PlanSkeleton ด้วย
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Archive, RotateCcw, Pencil, Pause, Play, Trash2 } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { supabase } from '@/src/lib/supabase';
import GoalEditor, { type GoalDraft } from './GoalEditor';
import { isPlanDay, planDates, ruleOnDay, weeklyPlanProgress, type DailyPlan, type PlanVersion } from '@/src/lib/plan-recurrence';
import { localCashflowDay } from '@/src/lib/cashflow-selectors';
import PlanSkeleton from './PlanSkeleton';

type Plan=DailyPlan;
type Tick={plan_id:string;day:string;amount:number;currency:string|null};
const input='w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm';
const button='rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-40';
export default function PlanView(){
 const {language,userProfile,moneyBuckets,currency,addToast}=useApp();
 const th=language==='th', text=(en:string,thai:string)=>th?thai:en;
 const today=localCashflowDay(new Date().toISOString());
 const [month,setMonth]=useState(today.slice(0,7)),[mode,setMode]=useState<'month'|'year'>('month');
 const [plans,setPlans]=useState<Plan[]>([]),[ticks,setTicks]=useState<Tick[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const [show,setShow]=useState(false),[archived,setArchived]=useState(false),[busy,setBusy]=useState('');
 const [editing,setEditing]=useState<Plan|undefined>();
 const [versions,setVersions]=useState<(PlanVersion&{plan_id:string})[]>([]);
 const version=useRef(0),lock=useRef(false);
 const year=Number(month.slice(0,4)),monthNumber=Number(month.slice(5,7)),days=new Date(year,monthNumber,0).getDate();
 const fmt=(n:number,c:string)=>new Intl.NumberFormat(th?'th-TH':'en-US',{style:'currency',currency:c,maximumFractionDigits:2}).format(n);
 const reload=useCallback(async()=>{
  const run=++version.current;
  if(!userProfile?.email)return;
  try{
   const [p,c,v]=await Promise.all([supabase.from('daily_plans').select('*').order('created_at'),supabase.from('plan_checks').select('plan_id,day,amount,currency').gte('day',`${year}-01-01`).lte('day',`${year}-12-31`).order('day').order('plan_id').range(0,999),supabase.from('plan_rule_versions').select('plan_id,effective_on,rule').order('plan_id').order('effective_on').range(0,999)]);
   if(p.error||c.error||v.error)throw p.error||c.error||v.error;
   const history=v.data||[];
   if(history.length===1000)for(let offset=1000;;offset+=1000){const next=await supabase.from('plan_rule_versions').select('plan_id,effective_on,rule').order('plan_id').order('effective_on').range(offset,offset+999);if(next.error)throw next.error;history.push(...(next.data||[]));if((next.data?.length||0)<1000)break;}
   // Fetch the complete year's history, including accounts with many goals.
   const checks=c.data||[];
   if(checks.length===1000)for(let offset=1000;;offset+=1000){const next=await supabase.from('plan_checks').select('plan_id,day,amount,currency').gte('day',`${year}-01-01`).lte('day',`${year}-12-31`).order('day').order('plan_id').range(offset,offset+999);if(next.error)throw next.error;checks.push(...(next.data||[]));if((next.data?.length||0)<1000)break;}
   if(run!==version.current)return;setPlans(p.data||[]);setTicks(checks);setVersions(history);setError(false);
  }catch{if(run===version.current)setError(true);}finally{if(run===version.current)setLoading(false);}
 },[userProfile?.email,year]);
 useEffect(()=>{const generation=version;setLoading(true);void reload();const wake=()=>void reload();window.addEventListener('focus',wake);return()=>{generation.current++;window.removeEventListener('focus',wake);};},[reload]);
 const financialRefresh=()=>window.dispatchEvent(new Event('fintrack:financial-change'));
 async function saveGoal(draft:GoalDraft){
  if(lock.current)return;lock.current=true;setBusy('save');
  try{const result=editing?await supabase.from('daily_plans').update(draft).eq('id',editing.id):await supabase.from('daily_plans').insert(draft);if(result.error)throw result.error;setShow(false);setEditing(undefined);await reload();}
  finally{lock.current=false;setBusy('');}
 }
 const historyFor=(p:Plan)=>versions.filter(v=>v.plan_id===p.id);
 const due=(p:Plan,day:string)=>isPlanDay(ruleOnDay(p,historyFor(p),day),day);
 async function toggle(p:Plan,day:string,checked:boolean){
  if(lock.current)return;
  const rule=ruleOnDay(p,historyFor(p),day);
  const extra=!checked&&p.amount>0&&rule.frequency==='weekly_target'&&weeklyPlanProgress(rule,ticks.filter(t=>t.plan_id===p.id).map(t=>t.day),day).complete;
  if(extra&&!window.confirm(text('This week’s target is complete. Record another expense from this bucket?','สัปดาห์นี้ครบเป้าแล้ว ต้องการหักเงินจากกระเป๋าเพิ่มอีกครั้งหรือไม่?')))return;
  lock.current=true;setBusy(`${p.id}:${day}`);
  try{const result=checked?await supabase.from('plan_checks').delete().eq('plan_id',p.id).eq('day',day):await supabase.from('plan_checks').insert({plan_id:p.id,day,confirm_extra:extra});
   if(result.error&&result.error.code!=='23505')throw result.error;
   financialRefresh();await reload();
  }catch(e){const message=(e as {message?:string}).message||'';addToast(message.includes('Insufficient')?text('Not enough money in this bucket. Nothing was changed.','เงินในกระเป๋าไม่พอ ยังไม่ได้หักเงิน'):text('Could not update this day. Please retry.','บันทึกวันนี้ไม่สำเร็จ กรุณาลองอีกครั้ง'),'error');}
  finally{setBusy('');lock.current=false;}
 }
 async function changeStatus(p:Plan,status:Plan['status']){if(lock.current)return;lock.current=true;try{const {error}=await supabase.from('daily_plans').update({status}).eq('id',p.id);if(error)throw error;await reload();}catch{addToast(text('Could not update plan','แก้ไขแผนไม่สำเร็จ'),'error');}finally{lock.current=false;}}
 async function remove(p:Plan){
  const message=p.has_money_history?text('Archive this goal? Financial history is kept and you can restore it.','เก็บเป้าหมายนี้เข้ารายการ archive? ประวัติเงินยังอยู่และกู้คืนเป้าหมายได้'):text('Delete this goal and its non-financial check-ins permanently?','ลบเป้าหมายและประวัติการเช็กที่ไม่มีรายการเงินอย่างถาวรหรือไม่?');
  if(lock.current||!window.confirm(message))return;lock.current=true;
  try{const {error}=await supabase.rpc('remove_daily_plan',{target_id:p.id});if(error)throw error;await reload();}catch{addToast(text('Could not remove plan','ลบเป้าหมายไม่สำเร็จ'),'error');}finally{lock.current=false;}
 }
 const shift=(n:number)=>{const d=new Date(year,monthNumber-1+n,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);};
 const visible=plans.filter(p=>(archived||!p.archived)&&p.starts_on<=(mode==='year'?`${year}-12-31`:`${month}-${String(days).padStart(2,'0')}`)&&(p.ends_on===null||p.ends_on>=`${mode==='year'?year:month}-01${mode==='year'?'-01':''}`));
 const selected=ticks.filter(t=>visible.some(p=>p.id===t.plan_id)&&(mode==='year'||t.day.startsWith(month)));
 const totals=selected.reduce<Record<string,number>>((s,t)=>{if(t.currency)s[t.currency]=(s[t.currency]||0)+Number(t.amount);return s;},{});
 const scheduled=visible.reduce((n,p)=>n+planDates(p,`${month}-01`,`${month}-${String(days).padStart(2,'0')}`,historyFor(p)).length,0);
 if(loading)return <PlanSkeleton/>;
 return <div className="app-page-container space-y-6 py-6">
  <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold">PLAN</h1><p className="mt-2 text-sm text-muted">{text('Daily goals and money set aside for your plans.','เช็กเป้าหมายรายวันและติดตามเงินที่กันไว้ทำตามแผน')}</p><p className="mt-1 text-xs text-muted">{text('Money goals record an expense from the selected bucket. Unchecking reverses that expense.','เป้าหมายเงิน: ติ๊กเพื่อบันทึกรายจ่ายจาก bucket · เอาติ๊กออกเพื่อคืนเงิน')}</p></div><button className={`${button} flex items-center gap-2 bg-primary text-primary-foreground`} onClick={()=>{setEditing(undefined);setShow(true);}}><Plus size={16}/>{text('New goal','เพิ่มเป้าหมาย')}</button></header>
  {error&&<button className={`${button} text-loss`} onClick={()=>void reload()}>{text('Could not load plans — Retry','โหลดแผนไม่สำเร็จ — ลองใหม่')}</button>}
  <div className="flex flex-wrap items-center gap-3"><button className={button} aria-label="Previous month" onClick={()=>shift(-1)}><ChevronLeft size={16}/></button><label className="text-sm"><span className="sr-only">{text('Month','เดือน')}</span><input type="month" className={input} value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label><button className={button} aria-label="Next month" onClick={()=>shift(1)}><ChevronRight size={16}/></button>{(['month','year'] as const).map(m=><button key={m} className={`${button} ${mode===m?'bg-primary/15 text-primary':''}`} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m==='month'?text('Month','เดือน'):text('Year','ปี')}</button>)}<label className="ml-auto text-xs text-muted"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)} className="mr-2"/>{text('Include archived','รวมเป้าหมายที่ archive')}</label></div>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[[text('Goals','เป้าหมาย'),visible.length],[text('Days checked','จำนวนครั้งที่ทำสำเร็จ'),selected.length],[text('Recorded for plans','รายจ่ายตามแผน'),Object.entries(totals).map(([c,n])=>fmt(n,c)).join(' · ')||fmt(0,currency)]].map(([label,value])=><section className="rounded-2xl border border-border bg-surface p-5" key={label}><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></section>)}</div>
  {mode==='month'?<section className="overflow-hidden rounded-2xl border border-border bg-surface"><p className="p-4 text-xs text-muted">{text('Check a day once you complete it. Future dates are disabled.','ติ๊กวันที่ทำสำเร็จ · ยังติ๊กวันในอนาคตไม่ได้')} · {selected.length}/{scheduled}</p><div className="overflow-x-auto"><table aria-label={text('Daily goal tracker','ตารางเช็กเป้าหมายรายวัน')} className="w-full border-collapse text-xs"><thead><tr><th className="sticky left-0 z-10 min-w-52 bg-background p-3 text-left">{text('Goal','เป้าหมาย')}</th>{Array.from({length:days},(_,i)=><th key={i} className={`min-w-10 py-3 text-center ${`${month}-${String(i+1).padStart(2,'0')}`===today?'text-primary':'text-muted'}`}>{i+1}</th>)}<th className="min-w-24 p-3">{text('Progress','สำเร็จ')}</th></tr></thead><tbody>{visible.map(p=>{const completed=ticks.filter(t=>t.plan_id===p.id&&t.day.startsWith(month)).length;const bucket=moneyBuckets.find(b=>b.id===p.bucket_id);return <tr key={p.id} className="border-t border-border"><th className="sticky left-0 z-10 bg-background p-3 text-left font-normal"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{p.name}</span><button aria-label={`${p.archived?text('Restore','คืนแผน'):text('Archive','เก็บเข้ารายการ archive')} ${p.name}`} className="p-2 text-muted" onClick={()=>void changeStatus(p,p.archived?'active':'archived')}>{p.archived?<RotateCcw size={14}/>:<Archive size={14}/>}</button><button aria-label={`${text('Edit','แก้ไข')} ${p.name}`} className="p-2 text-muted" onClick={()=>{setEditing(p);setShow(true);}}><Pencil size={14}/></button>{!p.archived&&<button aria-label={`${p.status==='paused'?text('Resume','ทำต่อ'):text('Pause','พัก')} ${p.name}`} className="p-2 text-muted" onClick={()=>void changeStatus(p,p.status==='paused'?'active':'paused')}>{p.status==='paused'?<Play size={14}/>:<Pause size={14}/>}</button>}<button aria-label={`${text('Delete','ลบ')} ${p.name}`} className="p-2 text-muted" onClick={()=>void remove(p)}><Trash2 size={14}/></button></div><p className="text-muted">{p.amount?`${fmt(Number(p.amount),bucket?.currency||'THB')} / ${p.amount_period==='month'?text('month','เดือน'):text('day','วัน')} · ${bucket?.name||'—'}`:text('Daily habit','เป้าหมายรายวัน')}</p></th>{Array.from({length:days},(_,i)=>{const day=`${month}-${String(i+1).padStart(2,'0')}`,checked=ticks.some(t=>t.plan_id===p.id&&t.day===day);return <td key={day} className="text-center">{(checked||due(p,day))&&<input type="checkbox" aria-label={`${p.name} ${day}`} checked={checked} disabled={!!busy||day>today||(!checked&&!due(p,day))||(p.archived&&!checked)} onChange={()=>void toggle(p,day,checked)} className="h-5 w-5 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-25"/>}</td>;})}<td className="p-3 text-center font-semibold text-primary">{completed}<progress aria-label={`${p.name} ${text('progress','ความคืบหน้า')}`} value={completed} max={Math.max(1,planDates(p,`${month}-01`,`${month}-${String(days).padStart(2,'0')}`,historyFor(p)).length)} className="mt-2 block h-1 w-16 accent-primary"/></td></tr>;})}</tbody></table></div>{!visible.length&&<p className="p-10 text-center text-sm text-muted">{text('No goals in this month. Add your first goal.','ยังไม่มีเป้าหมายในเดือนนี้ เพิ่มเป้าหมายแรกได้เลย')}</p>}</section>:<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:12},(_,i)=>{const prefix=`${year}-${String(i+1).padStart(2,'0')}`,rows=ticks.filter(t=>t.day.startsWith(prefix));const sum=rows.reduce<Record<string,number>>((a,t)=>{if(t.currency)a[t.currency]=(a[t.currency]||0)+Number(t.amount);return a;},{});return <button key={prefix} className="rounded-2xl border border-border bg-surface p-5 text-left hover:border-primary" onClick={()=>{setMonth(prefix);setMode('month');}}><h2 className="font-semibold">{new Date(year,i,1).toLocaleDateString(th?'th-TH':'en-US',{month:'long'})}</h2><p className="mt-2 text-sm text-muted">{rows.length} {text('checks','ครั้ง')}</p><p className="mt-2 text-primary">{Object.entries(sum).map(([c,n])=>fmt(n,c)).join(' · ')||'—'}</p></button>;})}</section>}
  {show&&<GoalEditor key={editing?.id||'new'} plan={editing} today={today} th={th} buckets={moneyBuckets} hasChecks={!!editing&&ticks.some(t=>t.plan_id===editing.id)} onSave={saveGoal} onClose={()=>{setShow(false);setEditing(undefined);}}/>}
 </div>;
}
