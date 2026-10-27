"use client";
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { lockDocumentScroll } from '@/src/lib/scroll-lock';
export function TransitionOverlay({ open, onClose, title, children, footer, variant = 'modal', initialFocus, className = '', headingContent, overlayClassName = '' }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode;
  variant?: 'modal' | 'drawer'; initialFocus?: string; className?: string; headingContent?: React.ReactNode; overlayClassName?: string;
}) {
  const [mounted, setMounted] = useState(false), root = useRef<HTMLDivElement>(null), heading = useId(), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open || !mounted) return;
    const trigger = document.activeElement as HTMLElement | null;
    const unlock = lockDocumentScroll();
    const frame = requestAnimationFrame(() => { const target = (initialFocus ? root.current?.querySelector<HTMLElement>(initialFocus) : null) || root.current; target?.focus({ preventScroll: true }); });
    const keys = (event: KeyboardEvent) => {
      const dialogs = [...document.querySelectorAll('[data-transition-dialog].open')];
      if (dialogs.at(-1) !== root.current) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const targets = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') || [])].filter(el => el.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus({ preventScroll: true }); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first?.focus({ preventScroll: true }); }
    };
    document.addEventListener('keydown', keys, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', keys, true); unlock(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [open, mounted, initialFocus]);
  if (!mounted) return null;
  return createPortal(<div className={`transition-overlay ${variant} ${overlayClassName}`} inert={!open} aria-hidden={!open || undefined}>
    <div className={`transition-scrim ${open ? 'open' : ''}`} onClick={() => close.current()}/>
    <div ref={root} data-transition-dialog role="dialog" aria-modal="true" aria-labelledby={heading} tabIndex={-1} className={`transition-${variant} ${open ? 'open' : ''} ${className}`}>
      <header className="flex shrink-0 items-center justify-between gap-4"><h2 id={heading} className={headingContent ? 'sr-only' : 'text-xl font-semibold'}>{title}</h2>{headingContent}<button type="button" onClick={() => close.current()} aria-label="Close / ปิด" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted hover:text-foreground"><X size={18}/></button></header>
      <div className="overlay-body min-h-0 overflow-y-auto">{children}</div>
      {footer && <footer className="shrink-0 border-t border-border pt-4">{footer}</footer>}
    </div>
  </div>, document.body);
}
