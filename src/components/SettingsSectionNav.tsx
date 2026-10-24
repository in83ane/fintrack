"use client";
import React,{useEffect,useRef,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {useApp} from '@/src/context/AppContext';

export function SettingsSectionNav(){
  const {t,language}=useApp();
  const reduced=useReducedMotion();
  const [active,setActive]=useState('profile');
  const frame=useRef(0);
  const moving=useRef(false);
  const pulseTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const ids=['profile','regional','appearance','data','notifications','security','danger'];
  const labels=[t('accountProfile'),t('regionalSettings'),t('appearance'),t('dataManagement'),t('notifPreferences'),t('accountSecurity'),language==='th'?'ลบข้อมูล':'Danger Zone'];
  const navigate=(id:string,animate=true)=>{
    const section=document.getElementById(`settings-${id}`);if(!section)return;
    cancelAnimationFrame(frame.current);
    setActive(id);moving.current=true;
    history.replaceState(history.state,'',`#settings-${id}`);
    const inset=(document.querySelector('.ft-topbar')?.getBoundingClientRect().height||76)+24;
    const start=window.scrollY;
    const end=Math.max(0,Math.min(start+section.getBoundingClientRect().top-inset,document.documentElement.scrollHeight-window.innerHeight));
    const finish=()=>{moving.current=false;section.setAttribute('tabindex','-1');section.focus({preventScroll:true});if(!reduced&&animate){document.querySelectorAll('.ft-section-arrived').forEach(el=>el.classList.remove('ft-section-arrived'));section.classList.add('ft-section-arrived');if(pulseTimer.current)clearTimeout(pulseTimer.current);pulseTimer.current=setTimeout(()=>section.classList.remove('ft-section-arrived'),700);}};
    if(reduced||!animate){window.scrollTo({top:end,behavior:'instant'});finish();return;}
    const began=performance.now();
    const tick=(now:number)=>{const progress=Math.min((now-began)/500,1);window.scrollTo({top:start+(end-start)*(1-Math.pow(1-progress,4)),behavior:'instant'});if(progress<1)frame.current=requestAnimationFrame(tick);else finish();};
    frame.current=requestAnimationFrame(tick);
  };
  useEffect(()=>{
    const sections=ids.map(id=>document.getElementById(`settings-${id}`)).filter((el):el is HTMLElement=>!!el);
    const height=document.querySelector('.ft-topbar')?.getBoundingClientRect().height||76;
    const observer=new IntersectionObserver(entries=>{if(moving.current)return;const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible[0])setActive(visible[0].target.id.replace('settings-',''));},{rootMargin:`-${height+24}px 0px -55% 0px`,threshold:0});
    sections.forEach(section=>observer.observe(section));
    const cancel=()=>{cancelAnimationFrame(frame.current);moving.current=false;};
    const hash=()=>{const id=location.hash.replace('#settings-','');if(ids.includes(id))navigate(id,false);};
    const initial=requestAnimationFrame(hash);
    window.addEventListener('hashchange',hash);window.addEventListener('wheel',cancel,{passive:true});window.addEventListener('touchstart',cancel,{passive:true});
    return()=>{observer.disconnect();cancel();cancelAnimationFrame(initial);if(pulseTimer.current)clearTimeout(pulseTimer.current);window.removeEventListener('hashchange',hash);window.removeEventListener('wheel',cancel);window.removeEventListener('touchstart',cancel);};
    // IDs are fixed; localized labels do not alter section geometry or navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[reduced]);
  return <nav className="ft-settings-nav" aria-label={language==='th'?'ส่วนการตั้งค่า':'Settings sections'}>{ids.map((id,index)=><a key={id} href={`#settings-${id}`} aria-current={active===id?'location':undefined} onClick={event=>{event.preventDefault();navigate(id);}} className="relative">{active===id&&<motion.span className="ft-settings-pill" layoutId="settings-section-pill" transition={reduced?{duration:0}:{duration:.22,ease:[.22,1,.36,1]}}/>}<span className="relative">{labels[index]}</span></a>)}</nav>;
}
