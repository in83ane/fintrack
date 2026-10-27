"use client";
// แก้ layout หน้านี้ ต้องแก้ LedgerSkeleton ด้วย
import { matchesRecord } from '@/src/lib/record-search';
import { RecordSearch } from '@/src/components/RecordSearch';
import { Sk } from '@/src/components/skeleton';
import { layout } from './skeleton-layout';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { Check, Download, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Wallet } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { FinanceIcon } from '@/src/components/FinanceIcon';
import { AddCashflowModal } from '@/src/components/AddCashflowModal';
import { DateRangeBar, type DateRangeState } from '@/src/components/DateRangeBar';
import { TransitionOverlay } from '@/src/components/TransitionOverlay';
import { useLedgerActions } from '@/src/components/LedgerActions';
import { GlideGroup, GlidingIndicator } from '@/src/components/GlidingIndicator';
import { getLedgerView, type LedgerFilter, type LedgerRow } from '@/src/lib/ledger-selectors';
import { displayCashflowCategory, formatCashflowMoney, localCashflowDay, monthBounds, toMinor } from '@/src/lib/cashflow-selectors';
import { CustomSelect } from '@/src/components/CustomSelect';
import { LedgerHint } from '@/src/components/LedgerHint';
import { LedgerRowsSkeleton } from '@/src/components/LedgerRowsSkeleton';
import { tradeDeletionReason } from '@/src/lib/trade-deletion-policy';

const control = 'ledger-control';
/** Original Ledger mapping. Keep labels/data separate from this display-only icon choice. */
function getCategoryIcon(category: string) {
  const value = category.toLowerCase();
  if (value.includes('food') || value.includes('อาหาร') || value.includes('lunch') || value.includes('dinner')) return 'food';
  if (value.includes('coffee') || value.includes('กาแฟ')) return 'coffee';
  if (value.includes('transport') || value.includes('taxi') || value.includes('grab') || value.includes('เดินทาง')) return 'transport';
  if (value.includes('travel') || value.includes('flight') || value.includes('ท่องเที่ยว')) return 'travel';
  if (value.includes('util') || value.includes('electric') || value.includes('internet') || value.includes('สาธารณ')) return 'utilities';
  if (value.includes('entertainment') || value.includes('บันเทิง') || value.includes('movie')) return 'entertainment';
  if (value.includes('shopping') || value.includes('ช้อปปิ้ง')) return 'shopping';
  if (value.includes('health') || value.includes('สุขภาพ') || value.includes('medical')) return 'health';
  if (value.includes('education') || value.includes('การศึกษา') || value.includes('book')) return 'education';
  if (value.includes('salary') || value.includes('allowance') || value.includes('เงินเดือน')) return 'card';
  if (value.includes('freelance') || value.includes('ฟรีแลนซ์')) return 'laptop';
  if (value.includes('invest') || value.includes('ลงทุน')) return 'investment';
  if (value.includes('dividend') || value.includes('ปันผล')) return 'coins';
  if (value.includes('gift') || value.includes('ของขวัญ')) return 'gift';
  if (value.includes('rental') || value.includes('rent') || value.includes('ค่าเช่า')) return 'home';
  return 'receipt';
}
export default function LedgerView({loading:forceLoading=false}:{loading?:boolean}) {
  const { t,language,currency,cashActivities,trades,brokerageCashEntries,moneyBuckets,brokerageAccounts,brokerageCashBalances,portfolios,activePortfolioId,activePortfolio,exchangeRates,isDataLoaded:appDataLoaded,updateCashActivity } = useApp();
  const isDataLoaded=appDataLoaded&&!forceLoading;
  const actions = useLedgerActions();
  const [range,setRange] = useState<DateRangeState>(()=>{const d=localCashflowDay(new Date().toISOString());return {mode:'month',year:Number(d.slice(0,4)),month:Number(d.slice(5,7))-1};});
  const [wallet,setWallet]=useState('all'),[filter,setFilter]=useState<LedgerFilter>('cash');
  const [addType,setAddType]=useState<'INCOME'|'EXPENSE'>('INCOME');
  const [selecting,setSelecting]=useState(false),[selected,setSelected]=useState<Set<string>>(new Set());
  const [detail,setDetail]=useState<LedgerRow|null>(null),[drawerOpen,setDrawerOpen]=useState(false),[showAdd,setShowAdd]=useState(false);
  const [confirm,setConfirm]=useState<LedgerRow[]>([]),[confirmOpen,setConfirmOpen]=useState(false);
  const [editing,setEditing]=useState(false),[editCategory,setEditCategory]=useState(''),[editNote,setEditNote]=useState(''),[editDate,setEditDate]=useState(''),[saving,setSaving]=useState(false);
  const lastSelected=useRef<string|null>(null),locale=language==='th'?'th-TH':'en-US';
  const text=(en:string,th:string)=>language==='th'?th:en;
  const m=(value:number)=>formatCashflowMoney(value,currency,true);
  const bounds=useMemo<{from?:string;to?:string}>(()=>{
    if(range.mode==='all')return {};
    if(range.mode==='custom')return {from:range.from,to:range.to};
    if(range.mode==='month')return monthBounds(`${range.year}-${String(range.month+1).padStart(2,'0')}`);
    const to=localCashflowDay(new Date().toISOString()),days={'1d':1,'1w':7,'1m':30,'2m':60,'3m':90,'6m':180,'1y':365}[range.mode];
    return {from:localCashflowDay(new Date(Date.parse(to+'T12:00:00+07:00')-(days-1)*86400000).toISOString()),to};
  },[range]);
  const [query,setQuery]=useState('');
  const searchCash=useMemo(()=>cashActivities.filter(r=>matchesRecord(query,r,[moneyBuckets.find(b=>b.id===r.bucketId)?.name||''])),[cashActivities,query,moneyBuckets]);
  const searchTrades=useMemo(()=>trades.filter(r=>matchesRecord(query,r)),[trades,query]);
  const searchBroker=useMemo(()=>brokerageCashEntries.filter(r=>matchesRecord(query,r,[brokerageAccounts.find(b=>b.id===r.accountId)?.name||''])),[brokerageCashEntries,query,brokerageAccounts]);
  const scope=useMemo(()=>({...bounds,walletId:wallet,portfolioId:activePortfolioId,currency,exchangeRates,trades:searchTrades}),[bounds,wallet,activePortfolioId,currency,exchangeRates,searchTrades]);
  // getLedgerView delegates to getCashflowSummary; strip and groups use the same rows.
  const view=useMemo(()=>getLedgerView(searchCash,scope,filter,actions.pending,searchBroker),[searchCash,scope,filter,actions.pending,searchBroker]);
  const period=range.mode==='month'?new Date(range.year,range.month,1).toLocaleDateString(locale,{month:'short',year:'numeric'}):range.mode==='all'?text('All time','ทั้งหมด'):range.mode==='custom'?`${range.from} – ${range.to}`:range.mode.toUpperCase();
  const totalAllWallets=useMemo(()=>moneyBuckets.reduce((acc,b)=>acc+(b.currency===currency?b.currentAmount:b.currentAmount/(exchangeRates[b.currency||'USD']||1)*(exchangeRates[currency]||1)),0),[moneyBuckets,currency,exchangeRates]);
  const wallets=[...moneyBuckets.map(b=>({id:b.id,name:b.name})),...brokerageAccounts.map(a=>({id:`broker:${a.id}`,name:a.name}))];
  // Preserve the old bucket scope; broker accounts are a separate picker.
  const visibleBuckets = moneyBuckets.slice(0,6);
  const selectedBucket = moneyBuckets.find(b=>b.id===wallet);
  if(selectedBucket && !visibleBuckets.some(b=>b.id===wallet)) visibleBuckets[visibleBuckets.length-1]=selectedBucket;
  const extraBuckets = moneyBuckets.filter(b=>!visibleBuckets.some(visible=>visible.id===b.id));
  const bucketBalance=(b:typeof moneyBuckets[number])=>`${formatCashflowMoney(toMinor(b.currentAmount),b.currency||'USD')}${(b.currency||'USD')!==currency?' '+(b.currency||'USD'):''}`;
  const brokerLabel=(account:typeof brokerageAccounts[number])=>{const broker=portfolios.find(p=>p.id===account.portfolioId);return broker?`${broker.name} · ${account.name}`:account.name;};
  const brokerBalance=(account:typeof brokerageAccounts[number])=>{const balance=brokerageCashBalances.find(b=>b.accountId===account.id);return balance&&Number.isFinite(balance.balance)?`${formatCashflowMoney(toMinor(balance.balance),account.currency)} ${account.currency}`:account.currency;};
  const selectedBroker=brokerageAccounts.find(a=>`broker:${a.id}`===wallet);
  const walletName=(id:string)=>id==='unassigned'?t('unassigned'):wallets.find(w=>w.id===id)?.name||id;
  const title=(r:LedgerRow)=>r.source==='trade'?`${r.record.type} ${(r.record as {asset?:string}).asset||r.category}`:t(displayCashflowCategory(r.title,language));
  const native=(r:LedgerRow)=>formatCashflowMoney((r.signedMinor<0?-1:1)*toMinor(r.nativeAmount),r.nativeCurrency,true);
  const fullDate=(r:LedgerRow)=>new Date(r.record.date).toLocaleString(locale,{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const cancelSelection=()=>{setSelecting(false);setSelected(new Set());lastSelected.current=null;};
  useEffect(()=>{setSelected(new Set());lastSelected.current=null;},[range,wallet,filter,activePortfolioId]);
  useEffect(()=>{setDrawerOpen(false);setEditing(false);setConfirmOpen(false);setSelecting(false);},[activePortfolioId]);
  useEffect(()=>{if(!selecting)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('[data-transition-dialog].open')){setSelecting(false);setSelected(new Set());lastSelected.current=null;}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[selecting]);
  const chosen=view.rows.filter(r=>selected.has(r.id));
  function toggle(row:LedgerRow,shift=false){const anchor=lastSelected.current;setSelected(old=>{const next=new Set(old);if(shift&&anchor){const a=view.rows.findIndex(r=>r.id===anchor),b=view.rows.findIndex(r=>r.id===row.id);if(a>=0)view.rows.slice(Math.min(a,b),Math.max(a,b)+1).forEach(r=>next.add(r.id));}else if(next.has(row.id))next.delete(row.id);else next.add(row.id);return next;});lastSelected.current=row.id;}
  function openRow(row:LedgerRow,shift=false){if(selecting)toggle(row,shift);else{setDetail(row);setDrawerOpen(true);setEditing(false);}}
  function exportSelected(){if(!chosen.length)return;const csv=Papa.unparse(chosen.map(r=>({id:r.record.id,date:r.record.date,type:r.record.type,category:r.category,wallet:walletName(r.walletId),amount:r.nativeAmount.toFixed(2),currency:r.nativeCurrency,note:r.note})),{escapeFormulae:true});const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download=`ledger-${bounds.from||'all'}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);actions.notify(t('ledgerExported').replace('{n}',String(chosen.length)));cancelSelection();}
  function blocked(row:LedgerRow):string|null{if(row.source==='trade'){const trade=trades.find(tr=>String(tr.id)===String(row.record.id));return trade?tradeDeletionReason(trade,trades,language):t('ledgerManaged');}if(row.source==='cash'&&(row.note.includes('[funding:')||row.note.includes('[plan:')||row.record.originalAmount===undefined||!row.record.currency))return t('ledgerManaged');return null;}
  function requestDelete(rows:LedgerRow[]){const reason=rows.map(blocked).find(Boolean);if(reason){actions.notify(reason);return;}setConfirm(rows);setConfirmOpen(true);}
  const deleteTotals=confirm.reduce((acc,r)=>{acc[r.nativeCurrency]=(acc[r.nativeCurrency]||0)+toMinor(r.nativeAmount);return acc;},{} as Record<string,number>);
  const deleteAmount=Object.entries(deleteTotals).map(([cur,minor])=>formatCashflowMoney(minor,cur)).join(' + ');
  async function saveEdit(event:React.FormEvent){event.preventDefault();if(!detail||detail.source!=='cash')return;setSaving(true);try{const saved=await updateCashActivity(String(detail.record.id),{category:editCategory,note:editNote,date:`${editDate}T${new Date(detail.record.date).toLocaleTimeString('en-GB',{timeZone:'Asia/Bangkok',hour12:false})}+07:00`});if(saved!==false){setEditing(false);setDrawerOpen(false);}}finally{setSaving(false);}}
  function dayLabel(day:string){const today=localCashflowDay(new Date().toISOString()),yesterday=localCashflowDay(new Date(Date.now()-86400000).toISOString());return `${day===today?t('today')+' · ':day===yesterday?t('yesterday')+' · ':''}${new Date(day+'T12:00:00+07:00').toLocaleDateString(locale,{weekday:'short',day:'numeric',month:'short',timeZone:'Asia/Bangkok'})}`;}
  return <div className={`${layout.root} sk-root`} aria-busy={!isDataLoaded} data-skeleton={!isDataLoaded?"ledger":undefined}>
    <div className="ledger-toolbar">
      <section className="ledger-filters" style={{'--i':0} as React.CSSProperties}>
        <DateRangeBar value={range} onChange={setRange} wrap hideCurrentMonthBadge className="ledger-date-range"/>
        <div className="ledger-record-actions"><button className={`${control} ledger-income`} onClick={()=>{setAddType('INCOME');setShowAdd(true);}}><ArrowDownLeft size={16}/>{t('income')}</button><button className={`${control} ledger-expense`} onClick={()=>{setAddType('EXPENSE');setShowAdd(true);}}><ArrowUpRight size={16}/>{t('expense')}</button></div>
      </section>
      <div className="ledger-wallets" style={{'--i':1} as React.CSSProperties} aria-label={t('wallet')}>
        <button className="ledger-wallet" aria-pressed={wallet==='all'} onClick={()=>setWallet('all')}><span className="ledger-wallet-copy"><span>{t('allWallets')}</span><span data-wallet-balance>{isDataLoaded?formatCashflowMoney(toMinor(totalAllWallets),currency):<Sk.Block className="block h-3 w-16"/>}</span></span></button>
        <button className="ledger-wallet" aria-pressed={wallet==='unassigned'} onClick={()=>setWallet('unassigned')}><FinanceIcon name="receipt" size={14}/><span className="ledger-wallet-copy"><span>{t('unassigned')}</span><span aria-hidden="true">&nbsp;</span></span></button>
        {visibleBuckets.map(b=><button key={b.id} data-wallet-id={b.id} className="ledger-wallet" title={b.name} aria-pressed={wallet===b.id} onClick={()=>setWallet(b.id)}><Wallet size={14}/><span className="ledger-wallet-copy"><span>{b.name}</span><span data-wallet-balance>{isDataLoaded?bucketBalance(b):<Sk.Block className="block h-3 w-16"/>}</span></span></button>)}
        {!isDataLoaded&&!moneyBuckets.length&&[0,1,2].map(i=><div key={i} aria-hidden="true" className="ledger-wallet ledger-wallet-placeholder"><Sk.Block className="h-3 w-3"/><span className="ledger-wallet-copy"><Sk.Block className="h-3 w-16"/><Sk.Block className="h-3 w-12"/></span></div>)}
        {extraBuckets.length>0&&<CustomSelect aria-label={t('ledgerMoreWallets')} className="ledger-wallet-select" value="" onChange={setWallet} placeholder={t('ledgerMoreWallets')} items={extraBuckets.map(b=>({value:b.id,label:<span className="ledger-wallet-copy"><span>{b.name}</span><span>{isDataLoaded?bucketBalance(b):<Sk.Block className="block h-3 w-16"/>}</span></span>}))}/>}
        {brokerageAccounts.length>0&&<CustomSelect aria-label={t('ledgerBrokers')} className={`ledger-wallet-select ${selectedBroker?'selected':''}`} value={wallet.startsWith('broker:')?wallet:''} onChange={setWallet} placeholder={t('ledgerBrokers')} triggerLabel={selectedBroker?<span className="ledger-wallet-copy"><span>{brokerLabel(selectedBroker)}</span><span>{brokerBalance(selectedBroker)}</span></span>:undefined} items={brokerageAccounts.map(a=>({value:`broker:${a.id}`,label:<span className="ledger-wallet-copy"><span>{brokerLabel(a)}</span><span>{isDataLoaded?brokerBalance(a):<Sk.Block className="block h-3 w-16"/>}</span></span>}))}/>}
      </div>
      <RecordSearch value={query} onChange={setQuery} th={language==='th'} count={view.rows.length}/>
      <section className="ledger-summary grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-surface" style={{'--i':2} as React.CSSProperties}>{[[t('ledgerIn'),view.inMinor,'var(--gain)'],[t('ledgerOut'),-view.outMinor,'var(--loss)'],[t('ledgerNet'),view.netMinor,'var(--color-foreground)']].map(([label,value,color])=><div key={String(label)} className="min-w-0 px-4 py-2.5"><p className="truncate text-xs text-muted">{label} {label!==t('ledgerNet')?`· ${period}`:''}</p><p data-loading-data className="mt-1 break-words text-xl font-semibold tabular-nums" style={{color:String(color)}}>{isDataLoaded?m(Number(value)):<Sk.Block className="block h-7 w-28 max-w-full"/>}</p></div>)}</section>
      <div className="ledger-type-row" style={{'--i':3} as React.CSSProperties}>
        <GlideGroup><div className="ledger-kind-tabs flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-1">{(['all','cash','transfer','trade'] as const).map(kind=><button key={kind} onClick={()=>setFilter(kind)} aria-pressed={filter===kind} className="relative isolate whitespace-nowrap rounded-lg px-3 py-1.5 text-xs">{filter===kind&&<GlidingIndicator activeKey={kind}/>}{t(kind==='all'?'all':kind==='cash'?'incomeExpense':kind==='transfer'?'transfers':'investments')}</button>)}</div></GlideGroup>
        <div className="ledger-type-actions">
          {view.missing.length>0&&<><span className="ledger-partial text-xs text-muted" role="status">{t('ledgerPartial')}</span><span className="ledger-partial-icon"><LedgerHint warning text={t('ledgerPartial')}/></span></>}
          {(filter==='all'||filter==='transfer')&&<LedgerHint text={t('ledgerExcluded')}/>}
          <button className={`${control} ${selecting?'':'ledger-export-icon'}`} aria-label={selecting?t('cancel'):t('ledgerExport')} title={selecting?t('cancel'):t('ledgerExport')} onClick={()=>selecting?cancelSelection():setSelecting(true)}>{selecting?t('cancel'):<Download size={16}/>}</button>
        </div>
      </div>
    </div>
    <div className={`ledger-list ${selecting?'selecting':''}`}>
      {!isDataLoaded?<LedgerRowsSkeleton label={t('ledgerLoading')}/>:!view.rows.length?<div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">{t('ledgerEmpty')}</div>:view.groups.map(group=><section className="st mb-6" key={group.day} style={{'--i':4} as React.CSSProperties}><header className="mb-2 flex items-center justify-between gap-3 text-xs"><h2 className="font-medium uppercase tracking-[.06em] text-muted">{dayLabel(group.day)}</h2><span className="font-semibold tabular-nums" style={{color:group.netMinor<0?'var(--loss)':'var(--gain)'}}>{m(group.netMinor)}</span></header><div className="overflow-hidden rounded-2xl border border-border bg-surface">{group.rows.map(row=><div key={row.id} data-ledger-row={row.id} tabIndex={selecting?0:-1} role={selecting?'button':undefined} aria-pressed={selecting?selected.has(row.id):undefined} aria-label={selecting?`${title(row)} ${native(row)}`:undefined} className={`ledger-row ${selecting&&selected.has(row.id)?'selected':''}`} onClick={e=>openRow(row,e.shiftKey)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key===' '||e.key==='Enter')){e.preventDefault();openRow(row,e.shiftKey);}}}>
        <div className="selcol" inert={!selecting}><button type="button" tabIndex={selecting?0:-1} className="ledger-checkbox" aria-label={`${text('Select','เลือก')} ${title(row)} ${native(row)}`} aria-pressed={selected.has(row.id)} onClick={e=>{e.stopPropagation();toggle(row,e.shiftKey);}}>{selected.has(row.id)&&<Check size={14}/>}</button></div>
        <span className={`ledger-category-tile ${row.signedMinor >= 0 ? 'income' : 'expense'}`}><FinanceIcon name={getCategoryIcon(row.category)} size={21}/></span>
        <button tabIndex={selecting?-1:0} className="min-w-0 flex-1 text-left" onClick={e=>{e.stopPropagation();openRow(row,e.shiftKey);}}><span className="block truncate text-sm font-semibold">{title(row)}</span><span className="ledger-row-meta">{row.note&&<span className="truncate">{row.note}<span className="mx-1 text-muted">·</span></span>}<Wallet size={12}/><span className="truncate">{walletName(row.walletId)}</span></span></button>
        <span className="shrink-0 text-right tabular-nums"><span className="block text-sm font-semibold" style={{color:row.signedMinor<0?'var(--loss)':'var(--gain)'}}>{native(row)}</span><span className="block text-xs text-muted">{new Date(row.record.date).toLocaleTimeString(locale,{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'})}</span></span>
      </div>)}</div></section>)}
    </div>
    <div className={`ledger-actbar ${selecting?'show':''}`} inert={!selecting} aria-label="Selection actions"><strong className="text-sm">{chosen.length?t('ledgerSelected').replace('{n}',String(chosen.length)):t('ledgerSelectPrompt')}</strong><button className="px-2 text-xs text-muted" onClick={()=>setSelected(new Set(view.rows.map(r=>r.id)))}>{t('ledgerSelectAll')}</button><button className={`${control} primary`} disabled={!chosen.length} onClick={exportSelected}>{t('ledgerExport')} ({chosen.length})</button><button className={`${control} danger`} disabled={!chosen.length||actions.busy} onClick={()=>requestDelete(chosen)}>{t('delete')} ({chosen.length})</button><button className="px-2 text-xs text-muted" onClick={cancelSelection}>{t('cancel')}</button></div>
    <TransitionOverlay open={drawerOpen} onClose={()=>{setDrawerOpen(false);setEditing(false);}} title={editing?t('ledgerEditTitle'):detail?title(detail):t('ledgerDetails')} variant="drawer" footer={detail?<div className="flex gap-2">{detail.source==='cash'&&!blocked(detail)?<button className={`${control} primary flex-1`} onClick={()=>{setEditing(true);setEditCategory(detail.category);setEditNote(detail.note);setEditDate(detail.day);}}>{t('edit')}</button>:<Link className={`${control} flex-1`} href={detail.note.includes('[plan:')?'/plan':'/portfolio'}>{t('edit')}</Link>}<button className={`${control} danger flex-1`} disabled={actions.busy} onClick={()=>requestDelete([detail])}>{t('delete')}</button></div>:undefined}>
      {detail&&<><p className="text-xs text-muted">{walletName(detail.walletId)} · {fullDate(detail)}</p><p className="my-6 text-4xl font-semibold tabular-nums" style={{color:detail.signedMinor<0?'var(--loss)':'var(--gain)'}}>{native(detail)}</p>{editing?<form onSubmit={saveEdit} className="space-y-4"><p className="text-xs text-muted">{t('ledgerEditLimited')}</p><label className="block text-xs text-muted">{t('category')}<input required value={editCategory} onChange={e=>setEditCategory(e.target.value)} className="ledger-input mt-1"/></label><label className="block text-xs text-muted">{t('noteOptional')}<input value={editNote} onChange={e=>setEditNote(e.target.value)} className="ledger-input mt-1"/></label><label className="block text-xs text-muted">{t('date')}<input type="date" required value={editDate} onChange={e=>setEditDate(e.target.value)} className="ledger-input mt-1"/></label><button disabled={saving} className={`${control} primary w-full`}>{t('SAVERECORD')}</button></form>:<dl className="divide-y divide-border">{[[t('date'),fullDate(detail)],[t('wallet'),walletName(detail.walletId)],[t('type'),detail.record.type],[t('category'),title(detail)],[t('note'),detail.note||'—']].map(([label,value])=><div key={label} className="grid grid-cols-[90px_1fr] gap-4 py-4 text-sm"><dt className="text-muted">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>}</>}
    </TransitionOverlay>
    <TransitionOverlay open={confirmOpen} onClose={()=>setConfirmOpen(false)} title={t('confirmDeleteRecord')} footer={<div className="flex justify-end gap-2"><button className={control} onClick={()=>setConfirmOpen(false)}>{t('cancel')}</button><button className={`${control} danger`} onClick={()=>{actions.schedule(confirm);setConfirmOpen(false);setDrawerOpen(false);cancelSelection();}}>{t('delete')}</button></div>}><p className="text-sm">{confirm.length===1?`${t('delete')} ${title(confirm[0])} ${native(confirm[0])} · ${fullDate(confirm[0])}?`:t('ledgerDeleteQuestion').replace('{n}',String(confirm.length)).replace('{amount}',deleteAmount)}</p><p className="mt-3 text-xs text-muted">{t('ledgerPending')}</p></TransitionOverlay>
    <AddCashflowModal isOpen={showAdd} onClose={()=>setShowAdd(false)} presetType={addType} presetBucketId={wallet==='all'||wallet.startsWith('broker:')?undefined:wallet==='unassigned'?'<no-bucket>':wallet}/>
  </div>;
}
