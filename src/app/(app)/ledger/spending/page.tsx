"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Plus, X } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { supabase } from '@/src/lib/supabase';
import { readAll } from '@/src/lib/financial-snapshot';
import { cashflowCategoryKey, formatCashflowMoney } from '@/src/lib/cashflow-selectors';
import { expenseCategories, incomeCategories, trackerKind, isLedgerTrackerRecord, type TrackerKind, spendingByCategory, summarizeTracker, type ExpenseLine, type ExpenseTracker, type TrackerChoice } from '@/src/lib/expense-tracking';
import { useLedgerActions } from '@/src/components/LedgerActions';
import { TrackerForm } from './TrackerForm';

type SkipNotice = {
  key: string; trackerId: string; activityId: string; previous?: TrackerChoice['decision']; message: string;
};

function SkipToast({notice, dismiss, undo, busy, label}: {
  notice: SkipNotice; dismiss: (key: string)=>void; undo: (notice: SkipNotice)=>void; busy: boolean; label: string;
}) {
  useEffect(()=>{
    const timer = window.setTimeout(()=>dismiss(notice.key),5000);
    return ()=>window.clearTimeout(timer);
  },[notice.key,dismiss]);
  return <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#343940] px-4 py-3 text-sm text-[#fff] shadow-lg">
    <span role="status" className="min-w-0 break-words">{notice.message}</span><span aria-hidden="true">·</span>
    <button className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20 focus-visible:outline-2" disabled={busy} onClick={()=>undo(notice)}>{label}</button>
  </div>;
}

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
  const [kind,setKind] = useState<TrackerKind>('EXPENSE');
  const income = kind === 'INCOME';
  const presets = income ? incomeCategories : expenseCategories;
  const [trackers,setTrackers] = useState<ExpenseTracker[]>([]);
  const [ready,setReady] = useState(false), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  const [selected,setSelected] = useState(''), [edit,setEdit] = useState<ExpenseTracker|null>(null);
  const [notices,setNotices] = useState<SkipNotice[]>([]);
  const dismiss = useCallback((key: string)=>setNotices(list=>list.filter(n=>n.key!==key)),[]);
  const totalRef = useRef<HTMLParagraphElement>(null);
  const [busy,setBusy] = useState(false), [removing,setRemoving] = useState(false);
  useEffect(()=>{
    let live = true;
    async function load() {
      setReady(false);setError('');
      try {
        const [rules,links] = await Promise.all([
          readAll(range=>Promise.resolve(supabase.from('expense_trackers').select('id,name,category,keywords,opening_amount,currency,opening_fx,kind').eq('user_id',owner).order('created_at').order('id').range(range.from,range.to))),
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
  const visibleTrackers = trackers.filter(item=>trackerKind(item)===kind);
  const current = visibleTrackers.find(item=>item.id===selected);
  const ledger = useMemo(()=>cashActivities.filter(row=>!pending.includes('cash:'+row.id)),[cashActivities,pending]);
  const overviewCurrency = currency === 'USD' ? 'USD' : 'THB';
  const overview = useMemo(()=>spendingByCategory(ledger,trackers,overviewCurrency,exchangeRates,kind),[ledger,trackers,overviewCurrency,exchangeRates,kind]);
  const overviewMoney = (minor:number)=>formatCashflowMoney(minor,overviewCurrency);
  const summary = useMemo(()=>current ? summarizeTracker(current,ledger,trackers,exchangeRates) : null,[current,ledger,trackers,exchangeRates]);
  const categories = [...new Set([...presets,...customCategories.filter(c=>c.type===kind).map(c=>c.label),...cashActivities.filter(c=>isLedgerTrackerRecord(c,kind)).map(c=>c.category),...visibleTrackers.map(rule=>rule.category)].filter(Boolean))];
  const money = (minor:number)=>formatCashflowMoney(minor,current?.currency || 'THB');
  const noComment = txt('No comment','ไม่มีคอมเมนต์');
  const start = (category = income ? 'salary' : 'entertainment')=>setEdit({kind,id:crypto.randomUUID(),name:'',category,keywords:[],opening_amount:0,currency:currency==='USD'?'USD':'THB',opening_fx:exchangeRates.THB});
  async function save(draft:ExpenseTracker) {
    const {id,choices,kind:draftKind,...fields} = draft;
    const exists = trackers.some(item=>item.id===id);
    const query = exists ? supabase.from('expense_trackers').update(fields).eq('id',id).eq('user_id',owner) : supabase.from('expense_trackers').insert({...fields,kind:draftKind ?? 'EXPENSE',id,user_id:owner});
    const {data,error} = await query.select('id').single();
    if (error || !data) throw Error(error?.message || txt('Could not save','บันทึกไม่สำเร็จ'));
    setTrackers(prev=>exists?prev.map(item=>item.id===id?{...draft,choices:item.choices}:item):[...prev,{...draft,choices}]);setSelected(id);setRemoving(false);
  }
  function applyChoice(trackerId:string, activityId:string, decision?:TrackerChoice['decision']) {
    setTrackers(prev=>prev.map(item=>{
      if (item.id!==trackerId) return item;
      const choices = (item.choices || []).filter(c=>c.activity_id!==activityId);
      if (decision) choices.push({activity_id:activityId,decision});
      return {...item,choices};
    }));
  }
  async function choose(row:ExpenseLine, action:'include'|'remove'|'unrelated') {
    if (!current || busy) return;
    const trackerId = current.id, activityId = row.id;
    const decision = action==='include' ? 'include' : 'skip';
    const previous = current.choices?.find(c=>c.activity_id===activityId)?.decision;
    const total = totalRef.current;
    setBusy(true);setError('');
    try {
      const {error}=await supabase.from('expense_tracker_choices').upsert({tracker_id:trackerId,activity_id:activityId,decision},{onConflict:'tracker_id,activity_id'});
      if(error) throw Error(error.message);
      applyChoice(trackerId,activityId,decision);
      const name = row.label || noComment;
      const amount = money(row.minor);
      const notice = { key:crypto.randomUUID(),trackerId,activityId,previous,message:txt(`Skipped ${name} ${amount}`,`ข้าม ${name} ${amount} แล้ว`) };
      setNotices(list=>{
        const others = list.filter(n=>n.trackerId!==trackerId || n.activityId!==activityId);
        return decision==='skip' ? [...others,notice] : others;
      });
      if (action==='remove' && total?.isConnected) {
        total.animate([{backgroundColor:'var(--color-primary)',color:'var(--color-primary-foreground)'},{backgroundColor:'transparent',color:'var(--color-foreground)'}],
          {duration:800,easing:'ease-out'});
      }
    } catch(e) {setError(e instanceof Error?e.message:String(e));} finally {setBusy(false);}
  }
  async function undoSkip(notice:SkipNotice) {
    if (busy) return;
    setBusy(true);setError('');
    try {
      const table = supabase.from('expense_tracker_choices');
      const query = notice.previous ? table.update({decision:notice.previous}) : table.delete();
      const {data,error} = await query.eq('tracker_id',notice.trackerId).eq('activity_id',notice.activityId).eq('decision','skip').select('activity_id').maybeSingle();
      if (error) throw Error(error.message);
      if (data) applyChoice(notice.trackerId,notice.activityId,notice.previous);
      else setRetry(value=>value+1);
      dismiss(notice.key);
    } catch(e) {setError(e instanceof Error?e.message:String(e));} finally {setBusy(false);}
  }
  async function remove() {
    if(!current || busy) return;setBusy(true);setError('');
    try {
      const {error}=await supabase.from('expense_trackers').delete().eq('id',current.id).eq('user_id',owner).select('id').single();
      if(error) throw Error(error.message);
      setNotices(list=>list.filter(n=>n.trackerId!==current.id));setTrackers(prev=>prev.filter(item=>item.id!==current.id));setSelected('');setRemoving(false);
    } catch(e) {setError(e instanceof Error?e.message:String(e));} finally {setBusy(false);}
  }
  function line(row:ExpenseLine, actions?:React.ReactNode) {
    return <><div className="min-w-32 flex-1"><p className="break-words text-sm">{row.label||noComment}</p><p className="text-xs text-muted">{row.day}</p></div>
      <div className="spending-row-end ml-auto flex items-center">
        <span className="whitespace-nowrap text-sm tabular-nums">{money(row.minor)}</span>
        {actions && <div className="spending-action-slot"><div className="min-w-0 overflow-clip">
          <div className="flex w-max items-center gap-2 p-1 pl-2">{actions}</div>
        </div></div>}
      </div></>;
  }
  function choice(row:ExpenseLine, action:'include'|'remove'|'unrelated') {
    if (action==='unrelated') return <button disabled={busy} className="ledger-control" onClick={()=>void choose(row,action)}>{txt('Not relevant','ไม่เกี่ยว')}</button>;
    const add = action==='include';
    const label = add ? txt('Include','เพิ่มเข้าหัวข้อ') : txt('Remove','เอาออก');
    const Icon = add ? Plus : X;
    return <button type="button" aria-label={label} title={label} disabled={busy} onClick={()=>void choose(row,action)}
      className="spending-row-action inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
      <Icon size={17} aria-hidden="true"/>
    </button>;
  }
  return <div className="app-page-container mx-auto max-w-6xl space-y-6 py-6 pb-28">
    <Link href="/ledger" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"><ArrowLeft size={16}/>Ledger</Link>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">{txt('Income & spending trackers','ติดตามรายรับ–รายจ่าย')}</h1><p className="mt-1 text-sm text-muted">{txt('See your Ledger by category, or track a topic in more detail.','ดูรายการจาก Ledger แยกตามหมวด หรือเลือกติดตามเฉพาะเรื่องที่สนใจ')}</p></div>
      <button className="ledger-control primary" disabled={!ready || !isDataLoaded} onClick={()=>start(current?.category)}><Plus size={16}/>{txt('New tracker','สร้างหัวข้อ')}</button></header>
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border pb-3">
      <div role="group" aria-label={txt('Tracker type','ประเภทที่ติดตาม')} className="flex shrink-0 gap-5">
        {(['EXPENSE','INCOME'] as const).map(value=>{
          const active = kind===value;
          const Icon = value==='INCOME' ? ArrowDownLeft : ArrowUpRight;
          return <button key={value} type="button" aria-pressed={active} disabled={busy}
            onClick={()=>{setKind(value);setSelected('');setRemoving(false);setEdit(null);}}
            className={'inline-flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-50 '+(active?'border-primary text-foreground':'border-transparent text-muted hover:border-border hover:text-foreground')}>
            <Icon size={17} aria-hidden="true" className={active ? (value==='INCOME'?'text-gain':'text-loss') : ''}/>
            {value==='INCOME'?txt('Income','รายรับ'):txt('Expenses','รายจ่าย')}
          </button>;
        })}
      </div>
      {income && <p className="min-w-0 basis-64 flex-1 text-xs leading-relaxed text-muted">{txt('Includes income and deposits recorded in Ledger. Transfers between your accounts are excluded.','รวมรายรับและเงินฝากที่บันทึกใน Ledger ไม่นับเงินโอนระหว่างบัญชี')}</p>}
    </div>
    {error && <div role="alert" className="rounded-lg border border-border p-3 text-sm">{error} {!ready && <button className="ledger-control" onClick={()=>setRetry(retry+1)}>{txt('Retry','ลองอีกครั้ง')}</button>}</div>}
    {!isDataLoaded ? <p role="status" className="py-6 text-muted">{dataLoadError || txt('Loading Ledger history…','กำลังโหลดประวัติ Ledger…')}</p>
    : <div className="grid items-start gap-6 md:grid-cols-[minmax(13rem,1fr)_minmax(0,3fr)]">
      <nav aria-label={txt('Tracker views','เลือกมุมมองการติดตาม')} className="space-y-1">
        <button className={'block w-full rounded-lg border px-3 py-2 text-left font-semibold '+(!current?'border-primary bg-surface':'border-transparent hover:bg-surface')} aria-pressed={!current} onClick={()=>{setSelected('');setRemoving(false);}}>{txt('All categories','ภาพรวมทุกหมวด')}</button>
        {!!visibleTrackers.length && <p className="px-3 pt-4 text-xs text-muted">{txt('My trackers','หัวข้อที่ติดตาม')}</p>}
        {visibleTrackers.map(item=><button key={item.id} className={'block w-full rounded-lg border px-3 py-2 text-left '+(item.id===current?.id?'border-primary bg-surface':'border-transparent hover:bg-surface')} aria-pressed={item.id===current?.id} onClick={()=>{setSelected(item.id);setRemoving(false);}}><span className="block break-words font-medium">{item.name}</span><span className="text-xs text-muted">{t(presets.includes(cashflowCategoryKey(item.category)) ? cashflowCategoryKey(item.category) : item.category)} · {item.keywords.length ? item.keywords.join(', ') : txt('Entire category','ทั้งหมวด')}</span></button>)}
      </nav>
      {!current || !summary ? <section className="min-w-0 rounded-xl border border-border p-4 sm:p-6">
        <h2 className="text-xl font-semibold">{income ? txt('Income by category','รายรับแยกตามหมวด') : txt('Spending by category','รายจ่ายแยกตามหมวด')}</h2>
        <p className="mt-4 text-sm text-muted">{ready ? (income ? txt('Total received','รายรับสะสม') : txt('Total spent','ใช้จ่ายสะสม')) : txt('From Ledger','จาก Ledger')}</p>
        <p className="text-3xl font-semibold tabular-nums">{overviewMoney(overview.reduce((sum,g)=>sum+g.totalMinor,0))}</p>
        <p className="mt-1 mb-4 text-sm text-muted">{txt('Ledger','จาก Ledger')} {overviewMoney(overview.reduce((sum,g)=>sum+g.ledgerMinor,0))}{ready && <> · {txt('Before Ledger','ยอดเก่า')} {overviewMoney(overview.reduce((sum,g)=>sum+g.openingMinor,0))}</>}</p>
        {!overview.length && <p className="border-t border-border py-4 text-sm text-muted">{income ? txt('Income recorded in Ledger appears here automatically.','เมื่อบันทึกรายรับใน Ledger หมวดและยอดจะปรากฏที่นี่อัตโนมัติ') : txt('Expenses will appear here when you record them in Ledger.','เมื่อบันทึกรายจ่ายใน Ledger หมวดและยอดจะปรากฏที่นี่อัตโนมัติ')}</p>}
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
        <p className="mt-5 text-sm text-muted">{(income ? txt('Total received','รายรับสะสม') : txt('Total spent','ใช้จ่ายสะสม'))}</p><p ref={totalRef} className="w-fit max-w-full break-words rounded-md text-3xl font-semibold tabular-nums">{money(summary.totalMinor)}</p>
        <p className="mb-5 mt-2 text-sm text-muted">{txt('Before Ledger','ยอดเก่า')} {money(summary.openingMinor)} + Ledger {money(summary.ledgerMinor)}</p>
        {!!summary.missing && <p role="status" className="text-sm text-warning">{txt('Entries missing a usable amount or FX rate','รายการที่ยังรวมไม่ได้เพราะขาดยอดหรืออัตราแลกเปลี่ยน')} · {summary.missing}</p>}
        {!!summary.openingItems.length && <details className="border-t border-border py-4 text-sm"><summary className="cursor-pointer font-semibold">{txt('Opening balances','ที่มาของยอดเก่า')}</summary>{summary.openingItems.map(item=><div key={item.id} className="mt-2 flex justify-between gap-3"><span>{item.name}</span><span>{money(item.minor)}</span></div>)}</details>}
        <h3 className="border-t border-border pt-4 text-sm font-semibold">{income ? txt('Ledger income by comment','รายรับใน Ledger แยกตามคอมเมนต์') : txt('Ledger spending by comment','ค่าใช้จ่ายใน Ledger แยกตามคอมเมนต์')}</h3>
        <ul className="my-3 space-y-2">{summary.groups.map(group=><li key={group.label} className="flex justify-between gap-3 text-sm"><span className="break-words">{group.label||noComment} <span className="text-muted">× {group.count}</span></span><span className="shrink-0 tabular-nums">{money(group.minor)}</span></li>)}</ul>
        {!summary.rows.length && <p className="mb-4 text-sm text-muted">{income ? txt('No matching income yet.','ยังไม่มีรายรับที่ตรงกับหัวข้อนี้') : txt('No matching expenses yet.','ยังไม่มีรายจ่ายที่ตรงกับหัวข้อนี้')}</p>}
        <ActivityList title={txt('Included Ledger entries','รายการ Ledger ที่นับแล้ว')} rows={summary.rows} empty={txt('No entries','ยังไม่มีรายการ')} render={row=>line(row,!!current.keywords.length && choice(row,'remove'))}/>
        {!!current.keywords.length && <><ActivityList title={txt('Other entries in this category to review','แนะนำให้ตรวจ · รายการอื่นในหมวดเดียวกัน')} rows={summary.suggestions} empty={txt('Nothing to review','ไม่มีรายการรอตรวจ')} render={row=>line(row,<>{choice(row,'include')}{choice(row,'unrelated')}</>)}/>
        <ActivityList title={txt('Skipped entries','รายการที่ข้ามไว้')} rows={summary.skipped} empty={txt('No skipped entries','ยังไม่มีรายการที่ข้าม')} render={row=>line(row,choice(row,'include'))}/></>}
        <div className="mt-3 border-t border-border pt-3 text-sm">{removing ? <div className="space-y-2"><p>{txt('Remove this tracker and its opening balance? Its Ledger entries stay available.','ลบหัวข้อนี้พร้อมยอดตั้งต้นไหม? รายการเดิมยังดูได้ใน Ledger')}</p><button disabled={busy} className="ledger-control danger" onClick={()=>void remove()}>{t('delete')}</button> <button className="ledger-control" onClick={()=>setRemoving(false)}>{t('cancel')}</button></div> : <button className="text-muted hover:text-foreground" onClick={()=>setRemoving(true)}>{txt('Remove tracker','ลบหัวข้อ')}</button>}</div>
      </section>}</div>}
    {!!notices.length && createPortal(<div className="pointer-events-none fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[160] mx-auto flex max-h-[40vh] max-w-fit flex-col gap-2 overflow-auto sm:bottom-20">
      {notices.map(notice=><div key={notice.key} className="pointer-events-auto"><SkipToast notice={notice} dismiss={dismiss} undo={undoSkip} busy={busy} label={txt('Undo','เลิกทำ')}/></div>)}
    </div>,document.body)}
    {edit && <TrackerForm initial={edit} categories={categories.includes(edit.category) ? categories : [...categories,edit.category]} trackers={trackers} onSave={save} onClose={()=>setEdit(null)}/>}
  </div>;
}
