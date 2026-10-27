"use client";
import React, { useId, useRef, useState } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import { FloatingPopover } from './FloatingPopover';

/** Ledger's explanatory text stays in the toolbar, with an accessible touch target. */
export function LedgerHint({ text, warning = false }: { text: string; warning?: boolean }) {
  const [open, setOpen] = useState(false), anchor = useRef<HTMLButtonElement>(null), id = useId();
  return <span className="ledger-hint">
    <button ref={anchor} type="button" className="ledger-hint-trigger" aria-label={text} aria-describedby={open ? id : undefined}
      onPointerEnter={event=>{if(event.pointerType==='mouse')setOpen(true);}} onPointerLeave={event=>{if(event.pointerType==='mouse')setOpen(false);}}
      onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onClick={()=>setOpen(true)}>
      {warning ? <TriangleAlert size={15}/> : <Info size={15}/>}
    </button>
    <FloatingPopover open={open} anchor={anchor} onClose={()=>setOpen(false)} width={280} align="right" className="p-3 text-xs leading-relaxed">
      <span id={id} role="tooltip">{text}</span>
    </FloatingPopover>
  </span>;
}
