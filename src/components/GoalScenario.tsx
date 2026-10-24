"use client";
import React,{useId,useState} from "react";
import {useApp} from "@/src/context/AppContext";
export function GoalScenario({target,current,format}:{target:number;current:number;format:(n:number)=>string}){
  const {language}=useApp();const [months,setMonths]=useState(12);const id=useId();const gap=Math.max(0,target-current);
  const date=new Date();date.setMonth(date.getMonth()+months);
  return <details className="border-t border-border pt-3 text-sm"><summary className="text-primary font-medium">{language==='th'?'วางแผนถึงเป้าหมาย':'Explore This Goal'}</summary><div className="mt-4 space-y-3"><label htmlFor={id} className="flex justify-between gap-2 text-xs text-muted"><span>{language==='th'?'ระยะเวลาสมมติ':'What-if timeline'}</span><span>{months} {language==='th'?'เดือน':'months'}</span></label><input id={id} type="range" min="1" max="60" value={months} onChange={e=>setMonths(Number(e.target.value))} className="w-full accent-primary"/><p className="font-semibold ft-number" data-private>{format(gap/months)}<span className="ml-1 text-xs font-normal text-muted">/ {language==='th'?'เดือน':'month'}</span></p><p className="text-xs text-muted">{language==='th'?'ถึง':'By'} {date.toLocaleDateString(language==='th'?'th-TH':'en-US',{month:'short',year:'numeric'})} · {language==='th'?'ไม่รวมผลตอบแทน':'Excludes returns'}</p></div></details>;
}
