'use client';
import { useState } from 'react';
import { Modal } from '@/src/components/Modal';
import { CustomSelect } from '@/src/components/CustomSelect';
import { validatePlanRule, type DailyPlan, type PlanFrequency } from '@/src/lib/plan-recurrence';

export type GoalDraft = Pick<DailyPlan, 'name'|'amount'|'amount_period'|'bucket_id'|'starts_on'|'ends_on'|'frequency'|'days_of_week'|'weekly_target'|'monthly_day'|'status'|'money_mode'|'monthly_method'>;
const field = 'mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm';
const button = 'rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-40';
export default function GoalEditor({plan,today,th,buckets,onSave,onClose,hasChecks,lockedUntil}:{
 plan?:DailyPlan;today:string;th:boolean;buckets:{id:string;name:string;currency?:string}[];
 onSave:(draft:GoalDraft)=>Promise<void>;onClose:()=>void;hasChecks:boolean;lockedUntil?:string;
}) {
 const text=(en:string,thai:string)=>th?thai:en;
 const [draft,setDraft]=useState<GoalDraft>(()=>plan?{
  name:plan.name,amount:Number(plan.amount),amount_period:plan.amount_period,bucket_id:plan.bucket_id,
  starts_on:plan.starts_on,ends_on:plan.ends_on,frequency:plan.frequency,days_of_week:plan.days_of_week,
  weekly_target:plan.weekly_target,monthly_day:plan.monthly_day,status:plan.status,
  money_mode:plan.money_mode||'expense',monthly_method:plan.monthly_method||'split',
 }:{name:'',amount:0,amount_period:'day',bucket_id:null,starts_on:today,ends_on:null,frequency:'daily',days_of_week:[],weekly_target:3,monthly_day:Number(today.slice(8)),status:'active',money_mode:'expense',monthly_method:'split'});
 const [kind,setKind]=useState(plan?.amount?'money':'habit'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [amount,setAmount]=useState(plan?.amount?String(plan.amount):'');
 const payload={...draft,name:draft.name.trim(),amount:kind==='habit'?0:Number(amount),bucket_id:kind==='habit'?null:draft.bucket_id};
 const valid=!!payload.name&&payload.name.length<=100&&!validatePlanRule(payload)&&(kind==='habit'||(!!payload.bucket_id&&Number.isFinite(payload.amount)&&payload.amount>=0.01&&payload.amount<1e12&&/^\d+(\.\d{1,2})?$/.test(amount)));
 const update=<K extends keyof GoalDraft>(key:K,value:GoalDraft[K])=>setDraft(d=>({...d,[key]:value}));
 async function save(e:React.FormEvent){e.preventDefault();if(!valid||busy)return;setBusy(true);setError('');try{await onSave(payload);}catch{setError(text('Could not save. Check your connection and try again.','บันทึกไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง'));}finally{setBusy(false);}}
 return <Modal isOpen onClose={()=>{if(!busy)onClose();}} title={plan?text('Edit goal','แก้ไขเป้าหมาย'):text('New goal','เพิ่มเป้าหมาย')}>
  <form onSubmit={save} className="w-full max-w-md space-y-4">
   <label className="block text-sm">{text('Goal name','ชื่อเป้าหมาย')}<input autoFocus required maxLength={100} className={field} value={draft.name} onChange={e=>update('name',e.target.value)}/></label>
   <CustomSelect aria-label={text('Goal type','ประเภทเป้าหมาย')} value={kind} onChange={setKind} items={[{value:'habit',label:text('Habit · no money movement','เป้าหมายทั่วไป · ไม่หักเงิน')},{value:'money',label:text('Money goal','เป้าหมายเงิน')}]}/>
   {kind==='money'&&<>
    <CustomSelect aria-label={text('Money action','การบันทึกเงิน')} value={draft.money_mode||'expense'} onChange={v=>update('money_mode',v as 'expense'|'saving')} items={[{value:'saving',label:text('Save · transfer to PLAN (total unchanged)','เก็บออม · โอนไป PLAN (ยอดรวมไม่ลด)')},{value:'expense',label:text('Planned expense · reduce total','รายจ่ายตามแผน · หักจากยอดรวม')}]}/>
    <CustomSelect aria-label={text('Amount frequency','ช่วงเป้าหมายเงิน')} value={draft.amount_period} onChange={v=>update('amount_period',v as 'day'|'month')} items={[{value:'day',label:text('Amount per check','จำนวนเงินต่อครั้ง')},{value:'month',label:text('Monthly target','เป้าหมายต่อเดือน')}]}/>
    <label className="block text-sm">{draft.amount_period==='month'?text('Monthly target','ยอดเป้าหมายต่อเดือน'):text('Amount per check','จำนวนเงินต่อครั้ง')}<input required type="number" min="0.01" max="999999999999.99" step="0.01" className={field} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <CustomSelect aria-label={text('Source bucket','กระเป๋าที่หักเงิน')} value={draft.bucket_id||''} onChange={v=>update('bucket_id',v)} placeholder={text('Choose bucket','เลือกกระเป๋า')} items={buckets.filter(b=>['USD','THB'].includes(b.currency||'')).map(b=>({value:b.id,label:`${b.name} · ${b.currency}`}))}/>
    {draft.amount_period==='month'&&<CustomSelect aria-label={text('Monthly allocation','วิธีแบ่งเป้ารายเดือน')} value={draft.monthly_method||'split'} onChange={v=>update('monthly_method',v as 'split'|'flexible')} items={[{value:'split',label:text('Split across required checks','หารตามจำนวนครั้งที่ต้องทำ')},{value:'flexible',label:text('Enter amount each time','ระบุยอดตามสะดวกแต่ละครั้ง')}]}/>}
   </>}
   <CustomSelect aria-label={text('Repeat','ความถี่')} value={draft.frequency} onChange={v=>update('frequency',v as PlanFrequency)} items={[{value:'daily',label:text('Every day','ทุกวัน')},{value:'weekdays',label:text('Selected weekdays','เฉพาะวันที่เลือก')},{value:'weekly_target',label:text('X times per week','X ครั้งต่อสัปดาห์')},{value:'monthly',label:text('Every month','ทุกเดือน')}]}/>
   {draft.frequency==='weekdays'&&<fieldset><legend className="text-sm">{text('Days of the week','วันในสัปดาห์')}</legend><div className="mt-2 flex flex-wrap gap-2">{(th?['จ','อ','พ','พฤ','ศ','ส','อา']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).map((label,i)=><label key={i} className={`${button} flex items-center gap-1`}><input type="checkbox" checked={draft.days_of_week.includes(i+1)} onChange={e=>update('days_of_week',e.target.checked?[...draft.days_of_week,i+1].sort():draft.days_of_week.filter(d=>d!==i+1))}/>{label}</label>)}</div></fieldset>}
   {draft.frequency==='weekly_target'&&<label className="block text-sm">{text('Checks per week (Monday–Sunday)','จำนวนครั้งต่อสัปดาห์ (จันทร์–อาทิตย์)')}<input aria-label={text('Checks per week (Monday–Sunday)','จำนวนครั้งต่อสัปดาห์ (จันทร์–อาทิตย์)')} required type="number" min="1" max="7" step="1" className={field} value={draft.weekly_target} onChange={e=>update('weekly_target',Number(e.target.value))}/><span className="mt-1 block text-xs text-muted">{text('Choose any days. Extra checks do not increase weekly credit.','เลือกทำวันไหนก็ได้ ติ๊กเกินเป้าได้ แต่ไม่นับความสำเร็จรายสัปดาห์เพิ่ม')}</span></label>}
   {draft.frequency==='monthly'&&<label className="block text-sm">{text('Day of month','วันที่ของเดือน')}<input aria-label={text('Day of month','วันที่ของเดือน')} required type="number" min="1" max="31" step="1" className={field} value={draft.monthly_day} onChange={e=>update('monthly_day',Number(e.target.value))}/><span className="mt-1 block text-xs text-muted">{text('Shorter months use their last day.','เดือนที่มีวันไม่ถึง ใช้วันสุดท้ายของเดือน')}</span></label>}
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.ends_on===null} onChange={e=>update('ends_on',e.target.checked?null:draft.starts_on)}/>{text('No end date','ไม่มีวันสิ้นสุด')}</label>
   <div className="grid grid-cols-2 gap-3"><label className="text-sm">{text('Start','เริ่ม')}<input required disabled={hasChecks} type="date" className={field} value={draft.starts_on} max={draft.ends_on||undefined} onChange={e=>update('starts_on',e.target.value)}/></label>{draft.ends_on!==null&&<label className="text-sm">{text('End','สิ้นสุด')}<input required type="date" min={draft.starts_on} className={field} value={draft.ends_on} onChange={e=>update('ends_on',e.target.value)}/></label>}</div>
   {plan&&<p className="text-xs text-muted">{lockedUntil?text(`This month is locked at its original target. Amount/rule changes apply from ${lockedUntil}.`,`เดือนนี้ล็อกยอดและกฎเดิมแล้ว การแก้ยอด/กฎมีผลตั้งแต่ ${lockedUntil}`):text('Rule changes apply from today. Existing recorded amounts stay unchanged.','กฎที่แก้มีผลตั้งแต่วันนี้ ยอดที่เคยบันทึกไว้ไม่เปลี่ยน')}</p>}
   {error&&<p className="text-sm text-loss" role="alert">{error}</p>}
   <button type="submit" disabled={!valid||busy} className={`${button} w-full bg-primary text-primary-foreground`}>{busy?text('Saving…','กำลังบันทึก…'):plan?text('Save changes','บันทึกการแก้ไข'):text('Create goal','สร้างเป้าหมาย')}</button>
  </form>
 </Modal>;
}
