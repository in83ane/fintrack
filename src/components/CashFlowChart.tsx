"use client";
import React from "react";
import {ResponsiveContainer,ComposedChart,Bar,Line,XAxis,YAxis,CartesianGrid,Tooltip,Legend} from "recharts";
import {useReducedMotion} from "motion/react";
import {useApp} from "@/src/context/AppContext";

export default function CashFlowChart({data}:{data:{label:string;income:number;expense:number}[]}){
  const {language,formatMoney,currency}=useApp();const reduced=useReducedMotion();
  const rows=data.map(row=>({...row,net:row.income-row.expense}));
  const labels=language==='th'?{income:'รายรับ',expense:'รายจ่าย',net:'สุทธิ'}:{income:'Income',expense:'Expense',net:'Net'};
  return <section className="ft-panel p-5 sm:p-6"><div className="flex justify-between gap-4"><h2 className="text-base font-semibold">{language==='th'?'รายรับและรายจ่าย':'Income & Expenses'}</h2><span className="text-xs text-muted">{currency}</span></div>
    {rows.length ? <div className="ft-chart mt-5 h-72"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{top:10,right:8,left:8,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--ft-line)"/><XAxis dataKey="label" tick={{fill:'var(--ft-muted)',fontSize:12}} axisLine={false} tickLine={false}/><YAxis width={76} tickFormatter={value=>formatMoney(Number(value))} tick={{fill:'var(--ft-muted)',fontSize:12}} axisLine={false} tickLine={false}/><Tooltip formatter={(value)=>formatMoney(Number(value))} contentStyle={{background:'var(--ft-overlay)',border:'1px solid var(--ft-line)',borderRadius:12,color:'var(--ft-ink)'}}/><Legend/><Bar name={labels.income} dataKey="income" fill="var(--ft-gain)" radius={[3,3,0,0]} maxBarSize={32} isAnimationActive={!reduced} animationDuration={500}/><Bar name={labels.expense} dataKey="expense" fill="var(--ft-loss)" radius={[3,3,0,0]} maxBarSize={32} isAnimationActive={!reduced} animationDuration={500}/><Line name={labels.net} dataKey="net" stroke="var(--ft-accent)" strokeWidth={2.5} dot={{r:3}} isAnimationActive={!reduced} animationDuration={500}/></ComposedChart></ResponsiveContainer></div> : <p className="flex h-64 items-center justify-center text-sm text-muted">{language==='th'?'บันทึกรายรับหรือรายจ่ายเพื่อดูแนวโน้ม':'Record income or an expense to see your monthly trend.'}</p>}
  </section>;
}
