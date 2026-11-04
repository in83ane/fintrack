"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { supabase } from '@/src/lib/supabase';
import { readAll } from '@/src/lib/financial-snapshot';
import { cashflowCategoryKey, formatCashflowMoney } from '@/src/lib/cashflow-selectors';
import { expenseCategories, spendingByCategory, summarizeTracker, type ExpenseLine, type ExpenseTracker, type TrackerChoice } from '@/src/lib/expense-tracking';
import { useLedgerActions } from '@/src/components/LedgerActions';
import { TrackerForm } from './TrackerForm';

function ActivityList({title,rows,empty,render}: {title:string;rows:ExpenseLine[];empty:string;render:(row:ExpenseLine)=>React.ReactNode}) {
  const {language} = useApp();
  const [limit,setLimit] = useState(20);
  return <details className="border-t border-border py-4"><summary className="cursor-pointer text-sm font-semibold">{title} <span className="ml-1 text-muted tabular-nums">{rows.length}</span></summary>
    {rows.length ? <><ul className="mt-2 divide-y divide-border">{rows.slice(0,limit).map(row=><li key={row.id} className="flex flex-wrap items-center gap-2 py-2">{render(row)}</li>)}</ul>
      {rows.length>limit && <button className="ledger-control" onClick={()=>setLimit(limit+30)}>{language==='th'?'ดูเพิ่ม':'Show more'}</button>}</> : <p className="mt-3 text-sm text-muted">{empty}</p>}
  </details>;
}

export default function SpendingPage() {
  const {currentUserId,language} = useApp();
  return currentUserId ? <TrackerWorkspace key={currentUserId} owner={currentUserId}/> : <p role="status" className="app-page-container py-6">{language==='th'?'กำลังตรวจสอบบัญชี…':'Checking account…'}</p>;
}

function TrackerWorkspace({owner}:{owner:string}) {
  const {language,t,cashActivities,customCategories,exchangeRates,currency,isDataLoaded,dataLoadError} = useApp();
  const {pending} = useLedgerActions();
  const txt = (en:string,th:string) => language==='th'?th:en;
  const [trackers,setTrackers] = useState<ExpenseTracker[]>([]);
  const [ready,setReady] = useState(false), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  const [selected,setSelected] = useState(''), [edit,setEdit] = useState<ExpenseTracker|null>(null);
  const [busy,setBusy] = useState(false), [removing,setRemoving] = useState(false);
  useEffect(()=>{
    let live = true;
    async function load() {
      setReady(false);setError('');
      try {
        const [rules,links] = await Promise.all([
          readAll(range=>Promise.resolve(supabase.from('expense_trackers').select('id,name,category,keywords,opening_amount,currency,opening_fx').eq('user_id',owner).order('created_at').order('id').range(range.from,range.to))),
          readAll(range=>Promise.resolve(supabase.from('expense_tracker_choices').select('tracker_id,activity_id,decision').order('tracker_id').order('activity_id').range(range.from,range.to))),
        ]);
        if (rules.error || links.error) throw Error((rules.error || links.error)!.message);
        const choices = new Map<string,TrackerChoice[]>();
        for (const link of links.data || []) {
          const list = choices.get(link.tracker_id) || [];
          list.push(link as TrackerChoice); choices.set(link.tracker_id,list);
        }
        if (live) {setTrackers((rules.data || []).map(rule=>({...rule,choices:choices.get(rule.id) || []})) as ExpenseTracker[]);setReady(true);}
      } catch(e) {if(live)setError(e instanceof Error?e.message:String(e));}
    }
    void load();return ()=>{live=false;};
  },[owner,retry]);
  const current = trackers.find(item=>item.id===selected);
  const ledger = useMemo(()=>cashActivities.filter(row=>!pending.includes('cash:'+row.id)),[cashActivities,pending]);
  const overviewCurrency = currency === 'USD' ? 'USD' : 'THB';
  const overview = useMemo(()=>spendingByCategory(ledger,trackers,overviewCurrency,exchangeRates),[ledger,trackers,overviewCurrency,exchangeRates]);
  const overviewMoney = (minor:number)=>formatCashflowMoney(minor,overviewCurrency);
  const summary = useMemo(()=>current ? summarizeTracker(current,ledger,trackers,exchangeRates) : null,[current,ledger,trackers,exchangeRates]);
  const categories = [...new Set([...expenseCategories,...customCategories.filter(c=>c.type==='EXPENSE').map(c=>c.label),...cashActivities.filter(c=>!c.isTransfer && ['EXPENSE','WITHDRAW'].includes(c.type)).map(c=>c.category),...trackers.map(rule=>rule.category)].filter(Boolean))];
  const money = (minor:number)=>formatCashflowMoney(minor,current?.currency || 'THB');
  const noComment = txt('No comment','ไม่มีคอมเมนต์');
  const start = (category = 'entertainment')=>setEdit({id:crypto.randomUUID(),name:'',category,keywords:[],opening_amount:0,currency:currency==='USD'?'USD':'THB',opening_fx:exchangeRates.THB});
  async function save(draft:ExpenseTracker) {
    const {id,choices,...fields} = draft;
    const exists = trackers.some(item=>item.id===id);
    const query = exists ? supabase.from('expense_trackers').update(fields).eq('id',id).eq('user_id',owner) : supabase.from('expense_trackers').insert({...fields,id,user_id:owner});
    const {data,error} = await query.select('id').single();
    if (error || !data) throw Error(error?.message || txt('Could not save','บันทึกไม่สำเร็จ'));
    setTrackers(prev=>exists?prev.map(item=>item.id===id?{...draft,choices:item.choices}:item):[...prev,{...draft,choices}]);setSelected(id);setRemoving(false);
  }
  async function choose(id:string, decision:TrackerChoice['decision']) {
    if (!current || busy) return;
    setBusy(true);setError('');
    try {
      const {error}=await supabase.from('expense_tracker_choices').upsert({tracker_id:current.id,activity_id:id,decision},{onConflict:'tracker_id,activity_id'});
      if(error) throw Error(error.message);
      setTrackers(prev=>prev.map(item=>item.id===current.id?{...item,choices:[...(item.choices || []).filter(choice=>choice.activity_id!==id),{activity_id:id,decision}]}:item));
    } catch(e) {setError(e instanceof Error?e.message:String(e));} finally {setBusy(false);}
  }
  async function remove() {
    if(!current || busy) return;setBusy(true);setError('');
    try {
      const {error}=await supabase.from('expense_trackers').delete().eq('id',current.id).eq('user_id',owner).select('id').single();
      if(error) throw Error(error.message);
      setTrackers(prev=>prev.filter(item=>item.id!==current.id));setSelected('');setRemoving(false);
    } catch(e) {setError(e instanceof Error?e.message:String(e));} finally {setBusy(false);}
  }
  const line = (row:ExpenseLine)=> <><div className="min-w-32 flex-1"><p className="break-words text-sm">{row.label||noComment}</p><p className="text-xs text-muted">{row.day}</p></div><span className="text-sm tabular-nums">{money(row.minor)}</span></>;
  const choice = (row:ExpenseLine,decision:TrackerChoice['decision'])=><button disabled={busy} className="ledger-control" onClick={()=>void choose(row.id,decision)}>{decision==='include'?txt('Include','เพิ่มเข้าหัวข้อ'):txt('Skip','ข้าม')}</button>;
  return <div className="app-page-container mx-auto max-w-6xl space-y-6 py-6 pb-28">
    <Link href="/ledger" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"><ArrowLeft size={16}/>Ledger</Link>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">{txt('Spending trackers','ติดตามค่าใช้จ่าย')}</h1><p className="mt-1 text-sm text-muted">{txt('See all Ledger expenses by category, or open a tracker for a closer look.','ดูรายจ่ายทั้งหมดจาก Ledger แยกตามหมวด หรือเลือกหัวข้อเพื่อดูเฉพาะเรื่องที่สนใจ')}</p></div>
      <button className="ledger-control primary" disabled={!ready || !isDataLoaded} onClick={()=>start(current?.category)}><Plus size={16}/>{txt('New tracker','สร้างหัวข้อ')}</button></header>
    {error && <div role="alert" className="rounded-lg border border-border p-3 text-sm">{error} {!ready && <button className="ledger-control" onClick={()=>setRetry(retry+1)}>{txt('Retry','ลองอีกครั้ง')}</button>}</div>}
    {!isDataLoaded ? <p role="status" className="py-6 text-muted">{dataLoadError || txt('Loading spending history…','กำลังโหลดประวัติค่าใช้จ่าย…')}</p>
    : <div className="grid items-start gap-6 md:grid-cols-[minmax(13rem,1fr)_minmax(0,3fr)]">
      <nav aria-label={txt('Spending views','เลือกมุมมองค่าใช้จ่าย')} className="space-y-1">
        <button className={'block w-full rounded-lg border px-3 py-2 text-left font-semibold '+(!current?'border-primary bg-surface':'border-transparent hover:bg-surface')} aria-pressed={!current} onClick={()=>{setSelected('');setRemoving(false);}}>{txt('All categories','ภาพรวมทุกหมวด')}</button>
        {!!trackers.length && <p className="px-3 pt-4 text-xs text-muted">{txt('My trackers','หัวข้อที่ติดตาม')}</p>}
        {trackers.map(item=><button key={item.id} className={'block w-full rounded-lg border px-3 py-2 text-left '+(item.id===current?.id?'border-primary bg-surface':'border-transparent hover:bg-surface')} aria-pressed={item.id===current?.id} onClick={()=>{setSelected(item.id);setRemoving(false);}}><span className="block break-words font-medium">{item.name}</span><span className="text-xs text-muted">{t(expenseCategories.includes(cashflowCategoryKey(item.category)) ? cashflowCategoryKey(item.category) : item.category)} · {item.keywords.length ? item.keywords.join(', ') : txt('Entire category','ทั้งหมวด')}</span></button>)}
      </nav>
      {!current || !summary ? <section className="min-w-0 rounded-xl border border-border p-4 sm:p-6">
        <h2 className="text-xl font-semibold">{txt('Spending by category','รายจ่ายแยกตามหมวด')}</h2>
        <p className="mt-4 text-sm text-muted">{ready ? txt('Total spent','ใช้จ่ายสะสม') : txt('From Ledger','จาก Ledger')}</p>
        <p className="text-3xl font-semibold tabular-nums">{overviewMoney(overview.reduce((sum,g)=>sum+g.totalMinor,0))}</p>
        <p className="mt-1 mb-4 text-sm text-muted">{txt('Ledger','จาก Ledger')} {overviewMoney(overview.reduce((sum,g)=>sum+g.ledgerMinor,0))}{ready && <> · {txt('Before Ledger','ยอดเก่า')} {overviewMoney(overview.reduce((sum,g)=>sum+g.openingMinor,0))}</>}</p>
        {!overview.length && <p className="border-t border-border py-4 text-sm text-muted">{txt('Expenses will appear here when you record them in Ledger.','เมื่อบันทึกรายจ่ายใน Ledger หมวดและยอดจะปรากฏที่นี่อัตโนมัติ')}</p>}
        {overview.map(group=><details key={group.key} className="border-t border-border py-3">
          <summary className="cursor-pointer"><span className="inline-flex w-[calc(100%-1.5rem)] items-baseline justify-between gap-3 align-middle"><strong className="break-words">{t(group.label)}</strong><span className="shrink-0 font-semibold tabular-nums">{overviewMoney(group.totalMinor)}</span></span></summary>
          <div className="mt-3 space-y-3 pl-3 text-sm"><p className="text-muted">{txt('Ledger entries','รายการจาก Ledger')} · {group.rows.length} · {overviewMoney(group.ledgerMinor)}</p>
            <ul className="space-y-1">{group.groups.map(g=><li key={g.label} className="flex justify-between gap-3"><span className="break-words">{g.label || noComment} <span className="text-muted">× {g.count}</span></span><span className="tabular-nums">{overviewMoney(g.minor)}</span></li>)}</ul>
            {!!group.openingItems.length && <div><p className="text-muted">{txt('Opening balances','ยอดเก่าตามหัวข้อ')}</p>{group.openingItems.map(item=><p key={item.id} className="flex justify-between gap-3"><span>{item.name}</span><span>{overviewMoney(item.minor)}</span></p>)}</div>}
            {!!group.missing && <p className="text-warning">{txt('Missing an amount or exchange rate','รายการที่ขาดยอดหรืออัตราแลกเปลี่ยน')} · {group.missing}</p>}
            <ActivityList title={txt('Ledger history','ประวัติใน Ledger')} rows={group.rows} empty={txt('No entries','ยังไม่มีรายการ')} render={row=><><span className="min-w-24 flex-1 break-words">{row.label||noComment}<small className="block text-muted">{row.day}</small></span><span>{overviewMoney(row.minor)}</span></>}/>
            <button className="ledger-control" disabled={!ready} onClick={()=>start(group.label)}><Plus size={14}/>{txt('Track a topic in this category','ติดตามหัวข้อในหมวดนี้')}</button>
          </div>
        </details>)}
      </section> :
      <section key={current.id} className="min-w-0 rounded-xl border border-border p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3"><h2 className="break-words text-xl font-semibold">{current.name}</h2><button className="ledger-control" onClick={()=>setEdit(current)}>{t('edit')}</button></div>
        <p className="mt-5 text-sm text-muted">{txt('Total spent','ใช้จ่ายสะสม')}</p><p className="break-words text-3xl font-semibold tabular-nums">{money(summary.totalMinor)}</p>
        <p className="mb-5 mt-2 text-sm text-muted">{txt('Before Ledger','ยอดเก่า')} {money(summary.openingMinor)} + Ledger {money(summary.ledgerMinor)}</p>
        {!!summary.missing && <p role="status" className="text-sm text-warning">{txt('Entries missing a usable amount or FX rate','รายการที่ยังรวมไม่ได้เพราะขาดยอดหรืออัตราแลกเปลี่ยน')} · {summary.missing}</p>}
        {!!summary.openingItems.length && <details className="border-t border-border py-4 text-sm"><summary className="cursor-pointer font-semibold">{txt('Opening balances','ที่มาของยอดเก่า')}</summary>{summary.openingItems.map(item=><div key={item.id} className="mt-2 flex justify-between gap-3"><span>{item.name}</span><span>{money(item.minor)}</span></div>)}</details>}
        <h3 className="border-t border-border pt-4 text-sm font-semibold">{txt('Ledger spending by comment','ค่าใช้จ่ายใน Ledger แยกตามคอมเมนต์')}</h3>
        <ul className="my-3 space-y-2">{summary.groups.map(group=><li key={group.label} className="flex justify-between gap-3 text-sm"><span className="break-words">{group.label||noComment} <span className="text-muted">× {group.count}</span></span><span className="shrink-0 tabular-nums">{money(group.minor)}</span></li>)}</ul>
        {!summary.rows.length && <p className="mb-4 text-sm text-muted">{txt('No matching expenses yet.','ยังไม่มีรายจ่ายที่ตรงกับหัวข้อนี้')}</p>}
        <ActivityList title={txt('Included Ledger entries','รายการ Ledger ที่นับแล้ว')} rows={summary.rows} empty={txt('No entries','ยังไม่มีรายการ')} render={row=><>{line(row)}{!!current.keywords.length && choice(row,'skip')}</>}/>
        {!!current.keywords.length && <><ActivityList title={txt('Other entries in this category to review','แนะนำให้ตรวจ · รายการอื่นในหมวดเดียวกัน')} rows={summary.suggestions} empty={txt('Nothing to review','ไม่มีรายการรอตรวจ')} render={row=><>{line(row)}{choice(row,'include')}{choice(row,'skip')}</>}/>
        <ActivityList title={txt('Skipped entries','รายการที่ข้ามไว้')} rows={summary.skipped} empty={txt('No skipped entries','ยังไม่มีรายการที่ข้าม')} render={row=><>{line(row)}{choice(row,'include')}</>}/></>}
        <div className="mt-3 border-t border-border pt-3 text-sm">{removing ? <div className="space-y-2"><p>{txt('Remove this tracker and its opening balance? Its Ledger entries stay available.','ลบหัวข้อนี้พร้อมยอดตั้งต้นไหม? รายการเดิมยังดูได้ใน Ledger')}</p><button disabled={busy} className="ledger-control danger" onClick={()=>void remove()}>{t('delete')}</button> <button className="ledger-control" onClick={()=>setRemoving(false)}>{t('cancel')}</button></div> : <button className="text-muted hover:text-foreground" onClick={()=>setRemoving(true)}>{txt('Remove tracker','ลบหัวข้อ')}</button>}</div>
      </section>}</div>}
    {edit && <TrackerForm initial={edit} categories={categories.includes(edit.category) ? categories : [...categories,edit.category]} trackers={trackers} onSave={save} onClose={()=>setEdit(null)}/>}
  </div>;
}
