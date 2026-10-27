"use client";

import React, { useLayoutEffect, useRef } from 'react';

type Box = React.HTMLAttributes<HTMLDivElement> & { width?: React.CSSProperties['width']; height?: React.CSSProperties['height'] };
function Block({ className = '', width, height, style, ...props }: Box) {
  return <span {...props} aria-hidden="true" className={`sk-shimmer block rounded-md ${className}`} style={{ width, height, ...style }}/>;
}
function Line({ height = 14, width = '60%', ...props }: Box) { return <Block height={height} width={width} {...props}/>; }
function Circle({ width = 32, height = width, ...props }: Box) { return <Block width={width} height={height} {...props} style={{ borderRadius: '50%', ...props.style }}/>; }
function Tile({ width = 48, height = width, ...props }: Box) { return <Block width={width} height={height} {...props} style={{ borderRadius: 14, flexShrink: 0, ...props.style }}/>; }
function Pill({ height = 34, width = 90, ...props }: Box) { return <Block height={height} width={width} {...props} style={{ borderRadius: 999, ...props.style }}/>; }
function Card({ className = 'rounded-2xl border border-border bg-surface p-4', ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={className} {...props}/>; }
function Root({ children, className = '', name, ...props }: React.HTMLAttributes<HTMLDivElement> & { name?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // All placeholders use the document clock, including subsequently mounted chunks.
    ref.current?.style.setProperty('--sk-phase', `${-(performance.now() % 1600)}ms`);
  }, []);
  return <div {...props} ref={ref} data-skeleton={name || ''} aria-busy="true" className={`sk-root ${className}`}><span role="status" className="sr-only">Loading…</span>{children}</div>;
}
function Chart({ height = 256, className = '', ...props }: Box) {
  return <div {...props} aria-hidden="true" className={`sk-chart relative min-w-0 ${className}`} style={{ height, ...props.style }}>
    <div className="absolute inset-x-8 inset-y-5 flex flex-col justify-between border-b border-l border-border">{[0,1,2,3,4].map(i=><div key={i} className="w-full border-t border-border opacity-40"/>)}</div>
    <div className="absolute inset-x-8 bottom-0 flex justify-between">{[0,1,2,3,4].map(i=><Line key={i} width={i%2 ? 28 : 40} height={8}/>)}</div>
    <svg className="absolute inset-x-8 top-1/4 h-1/2 w-[calc(100%-4rem)] text-muted opacity-20" viewBox="0 0 600 100" preserveAspectRatio="none"><path d="M0 75 L65 65 L120 72 L190 40 L250 55 L330 25 L400 43 L475 18 L540 28 L600 12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6"/></svg>
  </div>;
}
function Donut({ width = 96, className = '' }: Box) { return <div aria-hidden="true" className={`sk-donut sk-shimmer shrink-0 ${className}`} style={{ width, height: width, borderRadius: '50%', maskImage: 'radial-gradient(transparent 48%, #000 49%)' }}/>; }
function Row({ className = 'ledger-row', index = 0 }: { className?: string; index?: number }) {
  return <div aria-hidden="true" className={className}><Tile/><div className="min-w-0 flex-1 space-y-2"><Line width={[110,160,85,135][index%4]}/><Line width={[85,120,65,95][index%4]} height={11}/></div><div className="space-y-2"><Line width={75}/><Line width={50} height={11} className="ml-auto"/></div></div>;
}
function TableRow({ columns = 6, index = 0 }: { columns?: number; index?: number }) { return <tr aria-hidden="true" className="border-b border-border">{Array.from({length:columns},(_,i)=><td key={i} className="px-3 py-4"><Line width={`${[90,60,40][(i+index)%3]}%`}/><Line height={10} width="40%" className="mt-2"/></td>)}</tr>; }
export const Sk = { Root, Line, Block, Circle, Tile, Pill, Card, Chart, Donut, Row, TableRow };
