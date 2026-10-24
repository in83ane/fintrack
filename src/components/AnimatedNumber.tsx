"use client";
import React,{useEffect,useRef,useState} from "react";
import {motion,useReducedMotion} from "motion/react";
import {useApp} from "@/src/context/AppContext";
interface AnimatedNumberProps {value:number;duration?:number;prefix?:string;suffix?:string;decimals?:number;className?:string;formatter?:(value:number)=>string;}
export function AnimatedNumber({value,duration=500,prefix='',suffix='',decimals=0,className='',formatter}:AnimatedNumberProps) {
  const {currency}=useApp(); const reduced=useReducedMotion();
  const [display,setDisplay]=useState(value); const counted=useRef(false);
  useEffect(()=>{
    if(counted.current || reduced || !Number.isFinite(value) || value===0){setDisplay(value);return;}
    counted.current=true; let frame=0;const started=performance.now();
    const tick=(now:number)=>{const progress=Math.min((now-started)/duration,1);setDisplay(value*(1-Math.pow(1-progress,3)));if(progress<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[value,duration,reduced]);
  const format=(n:number)=>formatter ? formatter(n) : `${prefix}${n.toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals})}${suffix}`;
  return <span className={`inline-block overflow-hidden align-bottom ft-number ${className}`} data-private aria-label={format(value)}><motion.span className="inline-block" key={currency} aria-hidden initial={reduced ? {opacity:.6} : {y:'25%',opacity:.6}} animate={{y:0,opacity:1}} transition={{duration:.32,ease:[.22,1,.36,1]}}>{format(display)}</motion.span></span>;
}
