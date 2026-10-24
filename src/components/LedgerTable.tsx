"use client";
import { formatLedgerAmount } from "@/src/lib/ledger-display";
import React,{useMemo,useState} from "react";
import {useInterface} from "./InterfaceProvider";
import {FinanceIcon} from "./FinanceIcon";
import {toLocalDateKey} from "./DateRangeBar";
import {Download,Trash2} from "lucide-react";
import {useApp} from "@/src/context/AppContext";
type Row={id:string;date:string;type:string;amountUSD:number;originalAmount?:number;originalCurrency?:string;category:string;note?:string;walletLabel?:string;bucketId:string;source:'cash'|'bucket'|'trade'};
export function downloadRows(rows:unknown[][],name:string){
  const csv=rows.map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""').replace(/^[=+@-]/,"'$&")}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export type LedgerRow = Row;
export function LedgerTable({rows,onDelete,categoryIcon,walletName,dateLabel}:{rows:Row[];onDelete:(row:Row)=>void;categoryIcon:(name:string)=>string;walletName:(row:Row)=>string;dateLabel:(date:string)=>string}){
  const {formatMoney,currency,language,exchangeRates,t}=useApp();
  const {density}=useInterface();
  const [selection,setSelection]=useState<Set<string>>(new Set());
  const selected=rows.filter(row=>selection.has(row.source+row.id));
  const balances=useMemo(()=>{let total=0;const map=new Map<string,number>();[...rows].sort((a,b)=>a.date.localeCompare(b.date)).forEach(row=>{total+=(row.type==='INCOME'?1:-1)*row.amountUSD;map.set(row.source+row.id,total);});return map;},[rows]);
  const groups=useMemo(()=>{const result=new Map<string,Row[]>();for(const row of rows){const day=toLocalDateKey(row.date);result.set(day,[...(result.get(day)||[]),row]);}return [...result];},[rows]);
  const toggle=(id:string)=>setSelection(previous=>{const next=new Set(previous);next.has(id)?next.delete(id):next.add(id);return next;});
  return <div className="ft-ledger-list">
    {selected.length>0&&<button className="ft-button ft-secondary mb-3" onClick={()=>downloadRows([['Date','Type','Category','Account','Amount (USD)'],...selected.map(row=>[row.date,row.type,row.category,walletName(row),(row.type==='INCOME'?1:-1)*row.amountUSD])],'fintrack-ledger.csv')}><Download size={15}/>Export selected ({selected.length})</button>}
    {groups.map(([day,items])=>{const net=items.reduce((sum,row)=>sum+(row.type==='INCOME'?1:-1)*row.amountUSD,0);return <section key={day} className="mb-5" aria-label={dateLabel(day)}>
      <header className="ft-ledger-day"><h2>{dateLabel(day)}</h2><span className={net>=0?'text-gain':'text-loss'}>{net>=0?'+':''}{formatMoney(net)}</span></header>
      <div className="space-y-2">{items.map(row=><article key={row.source+row.id} className="ft-ledger-row group">
        <input type="checkbox" aria-label={`Select ${row.category}`} checked={selection.has(row.source+row.id)} onChange={()=>toggle(row.source+row.id)}/>
        <span className={`ft-ledger-category ${row.type==='INCOME'?'text-gain bg-gain/10':'text-muted bg-surface-2'}`}><FinanceIcon name={categoryIcon(row.category)} size={20}/></span>
        <div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{t(row.category)}</h3><p className="truncate text-xs text-muted"><span>{row.note}</span>{row.note&&' · '}<span className="uppercase">{walletName(row)}</span></p></div>
        <div className="min-w-0 text-right tabular-nums"><p className={`font-semibold whitespace-nowrap ${row.type==='INCOME'?'text-gain':'text-loss'}`}>{row.type==='INCOME'?'+':'−'}{formatLedgerAmount(row,currency,exchangeRates,language)}</p><time dateTime={row.date} className="text-xs text-muted">{new Date(row.date).toLocaleTimeString(language==='th'?'th-TH':'en-GB',{hour:'2-digit',minute:'2-digit'})}</time><p className={`ft-ledger-running text-xs text-muted ${density==='compact'?'is-compact':''}`}>{language==='th'?'สุทธิสะสม':'Running net'} {formatMoney(balances.get(row.source+row.id)||0)}</p></div>
        <button className="ft-icon-button" aria-label={`Delete ${row.category}`} onClick={()=>onDelete(row)}><Trash2 size={16}/></button>
      </article>)}</div>
    </section>})}
  </div>;
}
