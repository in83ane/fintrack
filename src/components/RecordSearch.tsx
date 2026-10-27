'use client';
import { Search, X } from 'lucide-react';
export function RecordSearch({value,onChange,th,count}:{value:string;onChange:(q:string)=>void;th:boolean;count:number}) {
  const label=th?'ค้นหาโน้ต วันที่ หมวดหมู่ หรือชื่อรายการ':'Search notes, dates, categories or titles';
  return <div className="flex flex-wrap items-center gap-3 py-2"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3">
    <Search size={16} className="shrink-0 text-muted" aria-hidden="true"/>
    <input type="search" aria-label={label} placeholder={label} value={value} onChange={e=>onChange(e.target.value)} className="min-w-0 w-full bg-transparent py-2.5 text-sm outline-none"/>
    {value&&<button type="button" onClick={()=>onChange('')} aria-label={th?'ล้างคำค้น':'Clear search'} className="p-1 text-muted"><X size={16}/></button>}
  </div><span className="text-xs text-muted" role="status">{value?`${count} ${th?'รายการที่พบในช่วงที่เลือก':'matches in selected period'}`:th?'ค้นหาในช่วงเวลาที่เลือก':'Search within selected period'}</span></div>;
}
