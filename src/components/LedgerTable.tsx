"use client";
import { formatLedgerAmount, ledgerDisplayAmount } from "@/src/lib/ledger-display";
import React,{useMemo,useState,useEffect,useRef} from "react";
import {useInterface} from "./InterfaceProvider";
import {FinanceIcon} from "./FinanceIcon";
import {toLocalDateKey} from "./DateRangeBar";
import {AnimatePresence,motion} from "motion/react";
import {ConfirmModal} from "./ConfirmModal";
import {Download,Trash2,MoreHorizontal,Pencil,Copy} from "lucide-react";
import {useApp} from "@/src/context/AppContext";
type Row={id:string;date:string;type:string;amountUSD:number;originalAmount?:number;originalCurrency?:string;category:string;note?:string;walletLabel?:string;bucketId:string;source:'cash'|'bucket'|'trade';filterType?:string};
export function downloadRows(rows:unknown[][],name:string){
  const csv=rows.map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""').replace(/^[=+@-]/,"'$&")}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export type LedgerRow = Row;
const rowKey=(row:Row)=>`${row.source}:${row.id}`;
export function LedgerTable({rows,onDelete,onBulkDelete,onEdit,onDuplicate,selectMode,categoryIcon,walletName,dateLabel}:{rows:Row[];onDelete:(row:Row)=>void;onBulkDelete:(rows:Row[])=>void;onEdit:(row:Row)=>void;onDuplicate:(row:Row)=>void;selectMode:boolean;categoryIcon:(name:string)=>string;walletName:(row:Row)=>string;dateLabel:(date:string)=>string}){
  const {formatMoney,currency,language,exchangeRates,t}=useApp();
  const {density}=useInterface();
  const [selection,setSelection]=useState<Set<string>>(new Set());
  const [menu,setMenu]=useState<string|null>(null);
  const [bulkConfirm,setBulkConfirm]=useState(false);
  const anchor=useRef<string|null>(null);
  const listRef=useRef<HTMLDivElement>(null);
  const selected=rows.filter(row=>selection.has(rowKey(row)));
  const allKeys=useMemo(()=>rows.map(rowKey),[rows]);
  useEffect(()=>{setSelection(previous=>new Set([...previous].filter(key=>allKeys.includes(key))));},[allKeys]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenu(null);setSelection(new Set());anchor.current=null;}};const outside=(event:PointerEvent)=>{if(!(event.target as Element).closest('[data-row-actions]'))setMenu(null);};document.addEventListener('keydown',escape);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outside);};},[]);
  const balances=useMemo(()=>{let total=0;const map=new Map<string,number>();[...rows].sort((a,b)=>a.date.localeCompare(b.date)).forEach(row=>{total+=(row.type==='INCOME'?1:-1)*row.amountUSD;map.set(rowKey(row),total);});return map;},[rows]);
  const groups=useMemo(()=>{const result=new Map<string,Row[]>();for(const row of rows){const day=toLocalDateKey(row.date);result.set(day,[...(result.get(day)||[]),row]);}return [...result];},[rows]);
  const toggle=(key:string,range=false)=>{setSelection(previous=>{const next=new Set(previous);if(range&&anchor.current&&allKeys.includes(anchor.current)){const from=allKeys.indexOf(anchor.current),to=allKeys.indexOf(key);allKeys.slice(Math.min(from,to),Math.max(from,to)+1).forEach(id=>next.add(id));}else next.has(key)?next.delete(key):next.add(key);return next;});anchor.current=key;};
  const exportCsv=()=>downloadRows([['Date','Type','Category','Account','Amount (USD)'],...selected.map(row=>[row.date,row.type,row.category,walletName(row),(row.type==='INCOME'?1:-1)*row.amountUSD])],'fintrack-ledger.csv');
  const exportJson=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(selected,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='fintrack-ledger.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const bulkTotal=selected.reduce((sum,row)=>sum+ledgerDisplayAmount(row,currency,exchangeRates),0);
  const totalLabel=formatLedgerAmount({amountUSD:0,originalAmount:bulkTotal,originalCurrency:currency},currency,exchangeRates,language);
  return <div ref={listRef} className="ft-ledger-list" data-selecting={selectMode||selected.length>0}>
    {groups.map(([day,items])=>{const net=items.reduce((sum,row)=>sum+(row.type==='INCOME'?1:-1)*row.amountUSD,0);return <section key={day} className="mb-5" aria-label={dateLabel(day)}>
      <header className="ft-ledger-day"><h2>{dateLabel(day)}</h2><span className={net>=0?'text-gain':'text-loss'}>{net>=0?'+':''}{formatMoney(net)}</span></header>
      <div className="space-y-2">{items.map(row=>{const key=rowKey(row);const protectedRow=row.source!=='cash'||row.filterType!=='cash'||Boolean(row.note?.includes('[funding:'));return <article key={key} tabIndex={0} aria-label={`${t(row.category)} ${formatLedgerAmount(row,currency,exchangeRates,language)}`} className="ft-ledger-row group" data-selected={selection.has(key)} onKeyDown={event=>{if(event.target===event.currentTarget&&event.code==='Space'){event.preventDefault();toggle(key,event.shiftKey);}}} onClick={event=>{if(event.shiftKey&&!(event.target as Element).closest('button,input,a')){event.preventDefault();toggle(key,true);}}}>
        <input className="ft-row-check" type="checkbox" aria-label={`${language==='th'?'เลือก':'Select'} ${t(row.category)}`} checked={selection.has(key)} onClick={event=>{event.stopPropagation();toggle(key,event.shiftKey);}} onChange={()=>{}}/>
        <span className={`ft-ledger-category ${row.type==='INCOME'?'text-gain bg-gain/10':'text-muted bg-surface-2'}`}><FinanceIcon name={categoryIcon(row.category)} size={20}/></span>
        <div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{t(row.category)}</h3><p className="truncate text-xs text-muted"><span>{row.note}</span>{row.note&&' · '}<span className="uppercase">{walletName(row)}</span></p></div>
        <div className="min-w-0 text-right tabular-nums"><p className={`font-semibold whitespace-nowrap ${row.type==='INCOME'?'text-gain':'text-loss'}`}>{row.type==='INCOME'?'+':'−'}{formatLedgerAmount(row,currency,exchangeRates,language)}</p><time dateTime={row.date} className="text-xs text-muted">{new Date(row.date).toLocaleTimeString(language==='th'?'th-TH':'en-GB',{hour:'2-digit',minute:'2-digit'})}</time><p className={`ft-ledger-running text-xs text-muted ${density==='compact'?'is-compact':''}`}>{language==='th'?'สุทธิสะสม':'Running net'} {formatMoney(balances.get(key)||0)}</p></div>
        <div className="relative" data-row-actions><button className="ft-icon-button ft-row-menu-trigger" aria-label={`${language==='th'?'ตัวเลือก':'Actions for'} ${t(row.category)}`} aria-expanded={menu===key} onClick={()=>setMenu(menu===key?null:key)}><MoreHorizontal size={18}/></button>{menu===key&&<div className="ft-menu absolute right-0 top-full z-20" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setMenu(null);(event.currentTarget.previousElementSibling as HTMLButtonElement)?.focus();}}}>
          <button disabled={protectedRow} title={protectedRow?(language==='th'?'แก้ไขจากหน้ารายการต้นทาง':'Manage this linked activity at its source'):undefined} onClick={()=>{setMenu(null);onEdit(row);}}><Pencil size={15}/>{t('edit')}</button>
          <button disabled={protectedRow} onClick={()=>{setMenu(null);onDuplicate(row);}}><Copy size={15}/>{language==='th'?'ทำสำเนา':'Duplicate'}</button>
          <button disabled={row.source==='trade'||Boolean(row.note?.includes('[funding:'))} onClick={()=>{setMenu(null);onDelete(row);}}><Trash2 size={15}/>{t('delete')}</button>
        </div>}</div>
      </article>})}</div>
    </section>})}
    <AnimatePresence>{selected.length>0&&<motion.div key="selection" role="region" aria-label={language==='th'?'รายการที่เลือก':'Selected transactions'} className="ft-selection-bar" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:16}} transition={{duration:.18}}>
      <span aria-live="polite" className="font-semibold">{selected.length} {language==='th'?'รายการที่เลือก':'selected'}</span>
      <details className="relative"><summary className="ft-button ft-secondary"><Download size={15}/>{language==='th'?'ส่งออก':'Export'}</summary><div className="ft-menu absolute bottom-full mb-2"><button onClick={exportCsv}>CSV</button><button onClick={exportJson}>JSON</button></div></details>
      <button className="ft-button text-loss" disabled={selected.some(row=>row.source==='trade'||row.note?.includes('[funding:'))} onClick={()=>setBulkConfirm(true)}><Trash2 size={15}/>{t('delete')}</button>
      <button className="ft-button ft-secondary" onClick={()=>setSelection(new Set())}>{language==='th'?'ล้าง':'Clear'}</button>
      <button className="text-xs text-primary underline" onClick={()=>setSelection(new Set(allKeys))}>{language==='th'?'เลือกทั้งหมดในช่วงนี้':'Select all in this period'}</button>
    </motion.div>}</AnimatePresence>
    <ConfirmModal isOpen={bulkConfirm} onClose={()=>setBulkConfirm(false)} onConfirm={()=>{onBulkDelete(selected);setSelection(new Set());}} title={language==='th'?'ลบรายการที่เลือก?':'Delete selected transactions?'} message={language==='th'?`ลบ ${selected.length} รายการ ยอดรวม ${totalLabel}? ไม่สามารถยกเลิกหลังลบได้`:`Delete ${selected.length} transactions totaling ${totalLabel}? This cannot be undone.`} confirmText={t('delete')} cancelText={t('cancel')}/>
  </div>;
}
