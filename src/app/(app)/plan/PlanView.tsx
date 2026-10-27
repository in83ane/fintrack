'use client';
// แก้ layout หน้านี้ ต้องแก้ PlanSkeleton ด้วย
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Archive, RotateCcw, Pencil, Pause, Play, Trash2 } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { supabase } from '@/src/lib/supabase';
import GoalEditor, { type GoalDraft } from './GoalEditor';
import { isPlanDay, ruleOnDay, weeklyPlanProgress, type DailyPlan, type PlanVersion } from '@/src/lib/plan-recurrence';
import { localCashflowDay } from '@/src/lib/cashflow-selectors';
import PlanSkeleton from './PlanSkeleton';
import { planMinor, planMonthSchedule } from '@/src/lib/plan-money';

type Plan=DailyPlan;
type Tick={plan_id:string;day:string;amount:number;amount_minor?:number|string|null;currency:string|null;credited?:boolean;month_key?:string|null;group_key?:string|null;money_mode?:'expense'|'saving'|null};
type MonthLock={plan_id:string;month_key:string;target_minor:number|string;currency:string;money_mode:'expense'|'saving';monthly_method:'split'|'flexible';required_count:number;schedule:Record<string,{days:string[];quota:number}>;rule_snapshot:Plan;stopped:boolean};
type StatusEvent={plan_id:string;effective_on:string;status:Plan['status']};
async function loadPlanRows(table:string,columns:string,order:string,secondary:string){const data:any[]=[];for(let offset=0;;offset+=1000){const result=await supabase.from(table).select(columns).order(order).order(secondary).range(offset,offset+999);if(result.error)throw result.error;data.push(...(result.data||[]));if((result.data?.length||0)<1000)return data;}}

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
 const [monthLocks,setMonthLocks]=useState<MonthLock[]>([]),[statusEvents,setStatusEvents]=useState<StatusEvent[]>([]);
 const version=useRef(0),lock=useRef(false);
 const year=Number(month.slice(0,4)),monthNumber=Number(month.slice(5,7)),days=new Date(year,monthNumber,0).getDate();
 const fmt=(n:number,c:string)=>new Intl.NumberFormat(th?'th-TH':'en-US',{style:'currency',currency:c,maximumFractionDigits:2}).format(n);
 const reload=useCallback(async()=>{
  const run=++version.current;
  if(!userProfile?.email)return;
  try{
   const [p,c,v,ml,se]=await Promise.all([supabase.from('daily_plans').select('*').order('created_at'),supabase.from('plan_checks').select('plan_id,day,amount,amount_minor,currency,credited,month_key,group_key,money_mode').gte('day',`${year}-01-01`).lte('day',`${year}-12-31`).order('day').order('plan_id').range(0,999),supabase.from('plan_rule_versions').select('plan_id,effective_on,rule').order('plan_id').order('effective_on').range(0,999),loadPlanRows('plan_month_locks','*','plan_id','month_key'),loadPlanRows('plan_status_events','*','plan_id','effective_on')]);
   if(p.error||c.error||v.error)throw p.error||c.error||v.error;
   const history=v.data||[];
   if(history.length===1000)for(let offset=1000;;offset+=1000){const next=await supabase.from('plan_rule_versions').select('plan_id,effective_on,rule').order('plan_id').order('effective_on').range(offset,offset+999);if(next.error)throw next.error;history.push(...(next.data||[]));if((next.data?.length||0)<1000)break;}
   // Fetch the complete year's history, including accounts with many goals.
   const checks=c.data||[];
   if(checks.length===1000)for(let offset=1000;;offset+=1000){const next=await supabase.from('plan_checks').select('plan_id,day,amount,amount_minor,currency,credited,month_key,group_key,money_mode').gte('day',`${year}-01-01`).lte('day',`${year}-12-31`).order('day').order('plan_id').range(offset,offset+999);if(next.error)throw next.error;checks.push(...(next.data||[]));if((next.data?.length||0)<1000)break;}
   if(run!==version.current)return;setPlans(p.data||[]);setTicks(checks);setVersions(history);setMonthLocks(ml);setStatusEvents(se);setError(false);
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
 const monthLock=(p:Plan,day:string)=>monthLocks.find(l=>l.plan_id===p.id&&l.month_key.slice(0,7)===day.slice(0,7));
 const statusOn=(p:Plan,day:string)=>statusEvents.filter(e=>e.plan_id===p.id&&e.effective_on<=day).sort((a,b)=>b.effective_on.localeCompare(a.effective_on))[0]?.status||'active';
 const due=(p:Plan,day:string)=>{const l=monthLock(p,day);return statusOn(p,day)==='active'&&(l?Object.values(l.schedule).some(g=>g.days.includes(day)):isPlanDay({...ruleOnDay(p,historyFor(p),day),status:'active'},day));};
 const recorded=(p:Plan)=>ticks.filter(t=>t.plan_id===p.id&&t.day.startsWith(month));
 const monthlyProgress=(p:Plan)=>{
  const l=monthLock(p,`${month}-01`);if(!l&&!(p.amount>0&&p.amount_period==='month'))return null;
  const rows=recorded(p),actual=rows.reduce((n,t)=>n+BigInt(t.amount_minor??Math.round(Number(t.amount)*100)),0n);
  const target=BigInt(l?.target_minor??Math.round(Number(p.amount)*100)),credited=rows.filter(t=>t.credited!==false).length;
  const incomplete=actual<target||(l?.monthly_method!=='flexible'&&credited<(l?.required_count||1));
  return <div className="mt-2 space-y-1 text-xs"><span>{fmt(Number(actual)/100,l?.currency||p.currency||'THB')} / {fmt(Number(target)/100,l?.currency||p.currency||'THB')}</span><progress aria-label={`${p.name} ${text('monthly money','ยอดเงินรายเดือน')}`} value={Number(actual)} max={Number(target)||1} className="block h-1 w-full accent-primary"/>{l?.stopped&&incomplete&&<span className="block text-muted">{text('Incomplete because paused','ไม่ครบเพราะหยุด')}</span>}</div>;
 };

 async function toggle(p:Plan,day:string,checked:boolean){
  if(lock.current)return;
  const ml=monthLock(p,day),rule=ml?.rule_snapshot||ruleOnDay(p,historyFor(p),day);
  const monthly=!!ml||(p.amount>0&&p.amount_period==='month');
  let requested:number|null=null,extra=false;
  if(!checked&&monthly){
   const schedule=ml?.schedule||planMonthSchedule(p,day.slice(0,7),historyFor(p)).groups;
   const group=Object.entries(schedule).find(([,g])=>g.days.includes(day));
   const count=group?ticks.filter(t=>t.plan_id===p.id&&t.day.startsWith(day.slice(0,7))&&t.credited!==false&&group[1].days.includes(t.day)).length:0;
   const over=!!group&&count>=group[1].quota;
   if(over&&!window.confirm(text('This week’s quota is complete. This check records completion without moving money.','สัปดาห์นี้ครบโควตาแล้ว การติ๊กนี้บันทึกความสำเร็จแต่ไม่หักเงิน')))return;
   if(!over&&(ml?.monthly_method||p.monthly_method)==='flexible'){
    const raw=window.prompt(text(`Amount for this check (${ml?.currency||p.currency||'THB'})`,`จำนวนเงินสำหรับครั้งนี้ (${ml?.currency||p.currency||'THB'})`));if(raw===null)return;
    try{const minor=planMinor(raw.trim());if(minor<=0n)throw Error();requested=Number(minor);}catch{addToast(text('Enter a positive amount with at most two decimal places.','กรอกจำนวนเงินมากกว่าศูนย์ ทศนิยมไม่เกินสองตำแหน่ง'),'error');return;}
   }
  }else{
   extra=!checked&&p.amount>0&&rule.frequency==='weekly_target'&&weeklyPlanProgress(rule,ticks.filter(t=>t.plan_id===p.id).map(t=>t.day),day).complete;
   if(extra&&!window.confirm(text('This week’s target is complete. Move money for another check?','สัปดาห์นี้ครบเป้าแล้ว ต้องการบันทึกเงินเพิ่มอีกครั้งหรือไม่?')))return;
  }
  lock.current=true;setBusy(`${p.id}:${day}`);
  try{const result=checked?await supabase.from('plan_checks').delete().eq('plan_id',p.id).eq('day',day):await supabase.from('plan_checks').insert({plan_id:p.id,day,confirm_extra:extra,requested_minor:requested});
   if(result.error&&result.error.code!=='23505')throw result.error;
   financialRefresh();await reload();
  }catch(e){const message=(e as {message?:string}).message||'';addToast(message.includes('Legacy month')?text('This month uses the previous allocator. Keep its history and continue next month, or undo its checks before restarting.','เดือนนี้มีรายการจากระบบแบ่งเงินเดิม เก็บประวัติไว้แล้วเริ่มเดือนหน้า หรือยกเลิกติ๊กของเดือนนี้ก่อนเริ่มใหม่'):message.includes('Insufficient PLAN')?text('PLAN has insufficient funds to undo this transfer. Nothing was changed.','เงินใน PLAN ไม่พอคืนรายการโอน ยังไม่มีการเปลี่ยนแปลง'):message.includes('Insufficient')?text('Not enough money in this bucket. Nothing was changed.','เงินในกระเป๋าไม่พอ ยังไม่ได้หักเงิน'):text('Could not update this day. Check the remaining target, plan status and wallet balance.','บันทึกไม่สำเร็จ ตรวจยอดเป้าที่เหลือ สถานะแผน และยอดกระเป๋า'),'error');}
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
 const requiredFor=(p:Plan)=>monthLock(p,`${month}-01`)?.required_count??planMonthSchedule(p,month,historyFor(p)).required;
 const creditedSelected=selected.filter(t=>t.credited!==false).length;
 const scheduled=visible.reduce((n,p)=>n+requiredFor(p),0);
 if(loading)return <PlanSkeleton/>;
 return <div className="app-page-container space-y-6 py-6">
  <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold">PLAN</h1><p className="mt-2 text-sm text-muted">{text('Daily goals and money set aside for your plans.','เช็กเป้าหมายรายวันและติดตามเงินที่กันไว้ทำตามแผน')}</p><p className="mt-1 text-xs text-muted">{text('Savings transfer to PLAN; planned expenses reduce your total. Unchecking reverses the original amount.','เก็บออม: โอนไป PLAN ยอดรวมไม่ลด · รายจ่ายตามแผน: หักยอดรวม · เอาติ๊กออกย้อนยอดเดิม')}</p></div><button className={`${button} flex items-center gap-2 bg-primary text-primary-foreground`} onClick={()=>{setEditing(undefined);setShow(true);}}><Plus size={16}/>{text('New goal','เพิ่มเป้าหมาย')}</button></header>
  {error&&<button className={`${button} text-loss`} onClick={()=>void reload()}>{text('Could not load plans — Retry','โหลดแผนไม่สำเร็จ — ลองใหม่')}</button>}
  <div className="flex flex-wrap items-center gap-3"><button className={button} aria-label="Previous month" onClick={()=>shift(-1)}><ChevronLeft size={16}/></button><label className="text-sm"><span className="sr-only">{text('Month','เดือน')}</span><input type="month" className={input} value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label><button className={button} aria-label="Next month" onClick={()=>shift(1)}><ChevronRight size={16}/></button>{(['month','year'] as const).map(m=><button key={m} className={`${button} ${mode===m?'bg-primary/15 text-primary':''}`} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m==='month'?text('Month','เดือน'):text('Year','ปี')}</button>)}<label className="ml-auto text-xs text-muted"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)} className="mr-2"/>{text('Include archived','รวมเป้าหมายที่ archive')}</label></div>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[[text('Goals','เป้าหมาย'),visible.length],[text('Days checked','จำนวนครั้งที่ทำสำเร็จ'),creditedSelected],[text('Recorded for plans','ยอดบันทึกตามแผน'),Object.entries(totals).map(([c,n])=>fmt(n,c)).join(' · ')||fmt(0,currency)]].map(([label,value])=><section className="rounded-2xl border border-border bg-surface p-5" key={label}><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></section>)}</div>
  {mode==='month'?<section className="overflow-hidden rounded-2xl border border-border bg-surface"><p className="p-4 text-xs text-muted">{text('Check a day once you complete it. Future dates are disabled.','ติ๊กวันที่ทำสำเร็จ · ยังติ๊กวันในอนาคตไม่ได้')} · {creditedSelected}/{scheduled}</p><div className="overflow-x-auto"><table aria-label={text('Daily goal tracker','ตารางเช็กเป้าหมายรายวัน')} className="w-full border-collapse text-xs"><thead><tr><th className="sticky left-0 z-10 min-w-52 bg-background p-3 text-left">{text('Goal','เป้าหมาย')}</th>{Array.from({length:days},(_,i)=><th key={i} className={`min-w-10 py-3 text-center ${`${month}-${String(i+1).padStart(2,'0')}`===today?'text-primary':'text-muted'}`}>{i+1}</th>)}<th className="min-w-24 p-3">{text('Progress','สำเร็จ')}</th></tr></thead><tbody>{visible.map(p=>{const completed=ticks.filter(t=>t.plan_id===p.id&&t.day.startsWith(month)&&t.credited!==false).length;const displayPlan=monthLock(p,`${month}-01`)?.rule_snapshot||p;const bucket=moneyBuckets.find(b=>b.id===displayPlan.bucket_id);return <tr key={p.id} className="border-t border-border"><th className="sticky left-0 z-10 bg-background p-3 text-left font-normal"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{p.name}</span><button aria-label={`${p.archived?text('Restore','คืนแผน'):text('Archive','เก็บเข้ารายการ archive')} ${p.name}`} className="p-2 text-muted" onClick={()=>void changeStatus(p,p.archived?'active':'archived')}>{p.archived?<RotateCcw size={14}/>:<Archive size={14}/>}</button><button aria-label={`${text('Edit','แก้ไข')} ${p.name}`} className="p-2 text-muted" onClick={()=>{setEditing(p);setShow(true);}}><Pencil size={14}/></button>{!p.archived&&<button aria-label={`${p.status==='paused'?text('Resume','ทำต่อ'):text('Pause','พัก')} ${p.name}`} className="p-2 text-muted" onClick={()=>void changeStatus(p,p.status==='paused'?'active':'paused')}>{p.status==='paused'?<Play size={14}/>:<Pause size={14}/>}</button>}<button aria-label={`${text('Delete','ลบ')} ${p.name}`} className="p-2 text-muted" onClick={()=>void remove(p)}><Trash2 size={14}/></button></div><p className="text-muted">{displayPlan.money_mode==='saving'?text('Saving · ','เก็บออม · '):displayPlan.amount?text('Expense · ','รายจ่าย · '):''}{displayPlan.amount?`${fmt(Number(displayPlan.amount),displayPlan.currency||bucket?.currency||'THB')} / ${displayPlan.amount_period==='month'?text('month','เดือน'):text('day','วัน')} · ${bucket?.name||'—'}`:text('Habit','เป้าหมายทั่วไป')}</p>{monthlyProgress(p)}</th>{Array.from({length:days},(_,i)=>{const day=`${month}-${String(i+1).padStart(2,'0')}`,checked=ticks.some(t=>t.plan_id===p.id&&t.day===day);return <td key={day} className="text-center">{(checked||due(p,day))&&<input type="checkbox" aria-label={`${p.name} ${day}`} checked={checked} disabled={!!busy||day>today||(!checked&&!due(p,day))||(p.status!=='active'&&!checked)} onChange={()=>void toggle(p,day,checked)} className="h-5 w-5 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-25"/>}</td>;})}<td className="p-3 text-center font-semibold text-primary">{completed}<progress aria-label={`${p.name} ${text('progress','ความคืบหน้า')}`} value={completed} max={Math.max(1,requiredFor(p))} className="mt-2 block h-1 w-16 accent-primary"/></td></tr>;})}</tbody></table></div>{!visible.length&&<p className="p-10 text-center text-sm text-muted">{text('No goals in this month. Add your first goal.','ยังไม่มีเป้าหมายในเดือนนี้ เพิ่มเป้าหมายแรกได้เลย')}</p>}</section>:<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:12},(_,i)=>{const prefix=`${year}-${String(i+1).padStart(2,'0')}`,rows=ticks.filter(t=>t.day.startsWith(prefix));const sum=rows.reduce<Record<string,number>>((a,t)=>{if(t.currency)a[t.currency]=(a[t.currency]||0)+Number(t.amount);return a;},{});return <button key={prefix} className="rounded-2xl border border-border bg-surface p-5 text-left hover:border-primary" onClick={()=>{setMonth(prefix);setMode('month');}}><h2 className="font-semibold">{new Date(year,i,1).toLocaleDateString(th?'th-TH':'en-US',{month:'long'})}</h2><p className="mt-2 text-sm text-muted">{rows.filter(t=>t.credited!==false).length} {text('checks','ครั้ง')}</p><p className="mt-2 text-primary">{Object.entries(sum).map(([c,n])=>fmt(n,c)).join(' · ')||'—'}</p></button>;})}</section>}
  {show&&<GoalEditor key={editing?.id||'new'} plan={editing} today={today} th={th} buckets={moneyBuckets} lockedUntil={editing&&monthLock(editing,today)?new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),1)).toISOString().slice(0,10):undefined} hasChecks={!!editing&&ticks.some(t=>t.plan_id===editing.id)} onSave={saveGoal} onClose={()=>{setShow(false);setEditing(undefined);}}/>}
 </div>;
}
