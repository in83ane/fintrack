"use client";
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Own only this chart's existing clip reveal, so the global chart observer
 * cannot replay an outgoing path or stagger the area separately from its line. */
export function useNetWorthReveal({svg,plot,line,head,path,revision,reduced}:{
  svg:RefObject<SVGSVGElement|null>;plot:RefObject<SVGGElement|null>;
  line:RefObject<SVGPathElement|null>;head:RefObject<SVGCircleElement|null>;
  path:string;revision:string;reduced:boolean;
}) {
  const [visible,setVisible]=useState(false);
  const played=useRef<string|null>(null);
  useLayoutEffect(()=>{
    const node=svg.current;if(!node)return;
    const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting&&entries[0].intersectionRatio>=.35),{threshold:.35});
    observer.observe(node);return()=>observer.disconnect();
  },[svg]);
  useLayoutEffect(()=>{
    const node=line.current,group=plot.current,dot=head.current,root=svg.current;
    if(!node||!group||!dot||!root||!path)return;
    dot.style.offsetPath=`path("${path}")`;
    dot.style.offsetDistance='100%';
    dot.style.opacity='1';
    if(reduced||!visible||played.current===revision){delete root.dataset.chartAnimating;return;}
    const duration=played.current===null?1200:500;
    played.current=revision;
    root.dataset.chartAnimating='true';
    root.dataset.chartDuration=String(duration);
    dot.style.offsetDistance='0%';
    // One group owns both fills and stroke: identical clip and timing.
    const animation=group.animate([{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}],{duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
    const length=node.getTotalLength(),first=node.getPointAtLength(0),last=node.getPointAtLength(length);
    let frame=0;
    const tick=()=>{
      const progress=Number(animation.effect?.getComputedTiming().progress??1);
      const x=first.x+(last.x-first.x)*progress;
      let low=0,high=length;
      for(let i=0;i<24;i++){const middle=(low+high)/2;if(node.getPointAtLength(middle).x<x)low=middle;else high=middle;}
      dot.style.offsetDistance=`${length?(low+high)/2/length*100:100}%`;
      if(animation.playState!=='finished')frame=requestAnimationFrame(tick);
      else {dot.style.offsetDistance='100%';delete root.dataset.chartAnimating;animation.cancel();}
    };
    frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);animation.cancel();delete root.dataset.chartAnimating;};
  },[svg,plot,line,head,path,revision,reduced,visible]);
}
