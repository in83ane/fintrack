"use client";
import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { formatPercent, formatPnL } from '@/src/lib/format';
import { getNetWorthChange, type NetWorthPoint } from '@/src/lib/net-worth-series';
import { downsampleNetWorth, formatNetWorthDate, formatNetWorthTick, niceNetWorthTicks, placeNetWorthTooltip, monotoneNetWorthPath, netWorthDateTicks } from '@/src/lib/net-worth-chart';
import './net-worth-chart.css';
import { useNetWorthReveal } from '@/src/hooks/useNetWorthReveal';

const PAD={top:8,right:16,bottom:24,left:50};
const signColor=(n:number)=>n>0?'var(--gain)':n<0?'var(--loss)':'var(--color-muted)';
export function NetWorthSparkline({data,formatMoney,t,language='en',valueScale=1,periodLabel='30D',dim=false}: {
  data:NetWorthPoint[];formatMoney:(n:number)=>string;t:(k:string)=>string;language?:'en'|'th';valueScale?:number;periodLabel?:string;dim?:boolean;
}) {
  const container=useRef<HTMLDivElement>(null), tooltip=useRef<HTMLDivElement>(null);
  const svgRef=useRef<SVGSVGElement>(null),plotRef=useRef<SVGGElement>(null),lineRef=useRef<SVGPathElement>(null),headRef=useRef<SVGCircleElement>(null);
  const [dims,setDims]=useState({width:800,height:160});
  const [index,setIndex]=useState(0),[visible,setVisible]=useState(false);
  const [position,setPosition]=useState({left:0,top:0});
  const [reduced,setReduced]=useState(false);
  const gradient=useId().replaceAll(':','');
  useLayoutEffect(()=>{
    const query=matchMedia('(prefers-reduced-motion: reduce)'),sync=()=>setReduced(query.matches);
    sync();query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync);
  },[]);
  const points=useMemo(()=>downsampleNetWorth(data),[data]);
  const safeIndex=Math.min(index,Math.max(0,points.length-1)), point=points[safeIndex];
  const nativeScale=Number.isFinite(valueScale)&&valueScale>0?valueScale:1;
  const {width:W,height:H}=dims;
  useLayoutEffect(()=>{
    const node=container.current;if(!node)return;
    const update=()=>{const r=node.getBoundingClientRect();setDims(old=>old.width===r.width&&old.height===r.height?old:{width:r.width,height:r.height});};
    update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();
  },[]);
  const chart=useMemo(()=>{
    const values=data.map(p=>p.value),minimum=Math.min(...values),maximum=Math.max(...values);
    const ticks=niceNetWorthTicks(minimum*nativeScale,maximum*nativeScale).map(v=>v/nativeScale);
    const [low,high]=[ticks[0],ticks[ticks.length-1]],span=high-low||1;
    const start=Date.parse(points[0]?.date||''),end=Date.parse(points.at(-1)?.date||'');
    const x=(i:number)=>PAD.left+(end>start?(Date.parse(points[i].date)-start)/(end-start):.5)*(W-PAD.left-PAD.right);
    const y=(value:number)=>PAD.top+(1-(value-low)/span)*(H-PAD.top-PAD.bottom);
    let line=monotoneNetWorthPath(points.map((p,i)=>({x:x(i),y:y(p.value)})));
    // A single observed day is a point, never an invented prior day/zero curve.
    if(points.length===1)line=`M ${PAD.left} ${y(points[0].value)} H ${W-PAD.right}`;
    const area=points.length?`${line} L ${points.length===1?W-PAD.right:x(points.length-1)} ${H-PAD.bottom} L ${points.length===1?PAD.left:x(0)} ${H-PAD.bottom} Z`:'';
    const dates=netWorthDateTicks(points,x,language);
    return {line,area,x,y,ticks,dates,minimum,maximum};
  },[data,points,W,H,nativeScale,language]);
  const hoverX=point?chart.x(safeIndex):0,hoverY=point?chart.y(point.value):0;
  useLayoutEffect(()=>{
    if(!point||!container.current||!tooltip.current)return;
    const update=()=>{
      const plot=container.current!.getBoundingClientRect(), card=container.current!.closest('[data-net-worth-card]')?.getBoundingClientRect()||plot;
      const tip=tooltip.current!.getBoundingClientRect();
      const next=placeNetWorthTooltip({x:hoverX,y:hoverY},{width:tip.width,height:tip.height},{left:card.left-plot.left,top:card.top-plot.top,width:card.width,height:card.height});
      setPosition(old=>old.left===next.left&&old.top===next.top?old:next);
    };
    update();const observer=new ResizeObserver(update);observer.observe(tooltip.current);return()=>observer.disconnect();
  },[point,hoverX,hoverY,dims,language]);
  const color=(data.at(-1)?.value||0)>=(data[0]?.value||0)?'#4EDEA3':'#FFB4AB';
  const actualIndex=point?data.findIndex(p=>p.date===point.date):-1, previous=data[actualIndex-1];
  const change=getNetWorthChange(data),fromStart=point?point.value-(data[0]?.value||0):0,dayChange=previous&&point?point.value-previous.value:0;
  const delta=(amount:number,opening:number)=>`${formatPnL(Math.abs(amount)<1e-10?0:amount,formatMoney)} (${opening>0?formatPercent(amount/opening*100,1):'—'})`;
  const date=(day:string,full=false)=>formatNetWorthDate(day,language,full);
  const high=data.find(p=>p.value===chart.maximum),low=data.find(p=>p.value===chart.minimum);
  const description=data.length?`${language==='th'?'มูลค่าสุทธิ':'Net worth'} ${formatMoney(data.at(-1)!.value)}, ${language==='th'?'เปลี่ยนแปลง':'change'} ${delta(change.amount,data[0].value)} · ${periodLabel}. ${language==='th'?'สูงสุด':'High'} ${formatMoney(chart.maximum)} ${high?date(high.date,true):''}, ${language==='th'?'ต่ำสุด':'low'} ${formatMoney(chart.minimum)} ${low?date(low.date,true):''}.`:t('noChartData');
  const details=point?.parts?Object.entries(point.parts).filter(([,value])=>Math.abs(value*nativeScale)>=.005):[];
  const partsLabel:Record<string,string>=language==='th'?{assets:'สินทรัพย์',brokerCash:'เงินสดโบรกเกอร์',buckets:'กระเป๋า'}:{assets:'Assets',brokerCash:'Broker cash',buckets:'Buckets'};
  const revision=`${nativeScale}:${periodLabel}:${data.map(p=>p.date+':'+p.value).join('|')}`;
  useNetWorthReveal({svg:svgRef,plot:plotRef,line:lineRef,head:headRef,path:chart.line,revision,reduced:!!reduced});
  return <div ref={container} className="nw-chart" data-chart-owned data-net-worth-chart data-period={periodLabel}>
    <div role="img" aria-label={description} tabIndex={0} className="nw-chart-focus" onFocus={()=>{setVisible(true);}} onBlur={()=>setVisible(false)} onKeyDown={e=>{
      if(e.key==='Escape'){setVisible(false);return;}
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();setVisible(true);setIndex(e.key==='Home'?0:e.key==='End'?points.length-1:Math.max(0,Math.min(points.length-1,safeIndex+(e.key==='ArrowRight'?1:-1))));
    }}>
      {data.length===0?<span className="nw-empty">{t('noChartData')}</span>:<>
      {chart.minimum===chart.maximum&&<p className="nw-flat">{language==='th'?'ไม่มีการเปลี่ยนแปลงในช่วงนี้':'No changes in this period'}</p>}
      <svg ref={svgRef} data-chart="net-worth" aria-hidden="true" viewBox={`0 0 ${W} ${H}`} onMouseLeave={()=>setVisible(false)} onMouseMove={e=>{
        const rect=e.currentTarget.getBoundingClientRect(),mouseX=(e.clientX-rect.left)*W/rect.width;
        let nearest=0;for(let i=1;i<points.length;i++)if(Math.abs(chart.x(i)-mouseX)<Math.abs(chart.x(nearest)-mouseX))nearest=i;
        setIndex(nearest);setVisible(true);
      }}>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.3}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
        {chart.ticks.map((value,i)=><g key={i}><line x1={PAD.left} y1={chart.y(value)} x2={W-PAD.right} y2={chart.y(value)} stroke="var(--color-border)" strokeOpacity={.4}/><text data-y-tick x={PAD.left-6} y={chart.y(value)+3} textAnchor="end" fill="var(--color-muted)" fontSize={9} fontWeight={500}>{chart.minimum===0&&chart.maximum===0?(value===0?'0':''):formatNetWorthTick(value*nativeScale,chart.ticks.map(v=>v*nativeScale))}</text></g>)}
        {chart.dates.map(({index,label})=><text data-x-tick key={index} x={chart.x(index)} y={H-6} textAnchor="middle" fill="var(--color-muted)" fontSize={9} fontWeight={500}>{label}</text>)}
        <motion.g animate={{opacity:dim?.6:1}} transition={{duration:reduced?0:.15}}>
          <g ref={plotRef} data-net-worth-reveal><path d={chart.area} fill={`url(#${gradient})`}/><path ref={lineRef} data-net-worth-line data-line-type="monotone-x" d={chart.line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"/></g>
          <circle ref={headRef} data-net-worth-head data-chart-decoration cx={0} cy={0} r={3} fill={color} className="nw-line-head"/>
        </motion.g>
        {visible&&point&&<g>
          {/* Keep the vertical guide out of the tooltip, even when it sits above. */}
          {!(hoverX>=position.left&&hoverX<=position.left+(tooltip.current?.offsetWidth||0))?<line x1={hoverX} x2={hoverX} y1={PAD.top} y2={H-PAD.bottom} stroke="var(--color-muted)" strokeOpacity={.4} strokeDasharray="3,3"/>:<>
            {position.top>PAD.top&&<line x1={hoverX} x2={hoverX} y1={PAD.top} y2={Math.min(H-PAD.bottom,position.top-4)} stroke="var(--color-muted)" strokeOpacity={.4} strokeDasharray="3,3"/>}
            {position.top+(tooltip.current?.offsetHeight||0)+4<H-PAD.bottom&&<line x1={hoverX} x2={hoverX} y1={Math.max(PAD.top,position.top+(tooltip.current?.offsetHeight||0)+4)} y2={H-PAD.bottom} stroke="var(--color-muted)" strokeOpacity={.4} strokeDasharray="3,3"/>}
          </>}
          <circle data-net-worth-marker data-date={point.date} data-value={point.value} cx={hoverX} cy={hoverY} r={3.5} fill={color} stroke="var(--color-background)" strokeWidth={2}/>
        </g>}
      </svg></>}
    </div>
    <div ref={tooltip} aria-hidden="true" data-net-worth-tooltip data-date={point?.date} data-value={point?.value} data-visible={visible&&!!point} className="nw-tooltip" style={position}>
      {point&&<><div className="nw-tip-date">{date(point.date,true)}</div><div className="nw-tip-total">{formatMoney(point.value)}</div>
      {previous&&<div className="nw-tip-change" style={{color:signColor(dayChange)}}>{language==='th'?'เปลี่ยนรายวัน':'Day change'} {delta(dayChange,previous.value)}</div>}
      <div className="nw-tip-change">{language==='th'?'เทียบ':'vs'} {date(data[0].date)} {delta(fromStart,data[0].value)}</div>
      <div className="nw-tip-parts">{details.map(([name,value])=><div key={name} data-part={name} data-value={value}><span>{partsLabel[name]}</span><span>{formatMoney(value)}</span></div>)}</div></>}
    </div>
    <span className="sr-only" role="status" aria-live="polite">{visible&&point?`${date(point.date,true)}, ${formatMoney(point.value)}${previous?`, ${language==='th'?'เปลี่ยนรายวัน':'Day change'} ${delta(dayChange,previous.value)}`:''}`:''}</span>
  </div>;
}
