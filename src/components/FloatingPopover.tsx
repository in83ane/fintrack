"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Viewport positioning shared by selects and date filters; never clipped by a form. */
export function FloatingPopover({ open, anchor, onClose, children, className = '', align = 'left', width }: {
  open: boolean; anchor: React.RefObject<HTMLElement | null>; onClose: () => void; children: React.ReactNode;
  className?: string; align?: 'left' | 'right'; width?: number | 'anchor';
}) {
  const panel = useRef<HTMLDivElement>(null), close = useRef(onClose);
  close.current = onClose;
  const [present, setPresent] = useState(open);
  const [position, setPosition] = useState<React.CSSProperties>({});
  useEffect(() => { if (open) { setPresent(true); return; } const timer = setTimeout(() => setPresent(false), 120); return () => clearTimeout(timer); }, [open]);
  useLayoutEffect(() => {
    if (!open || !present) return;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect(); if (!rect) return;
      const panelWidth = Math.min(width === 'anchor' ? rect.width : width || Math.max(rect.width, 180), window.innerWidth - 16);
      const wanted = Math.min(panel.current?.scrollHeight || 280, 280);
      const below = window.innerHeight - rect.bottom - 14, above = rect.top - 14;
      const flip = below < wanted && above > below;
      setPosition({ width: panelWidth, maxHeight: Math.min(280, Math.max(0, flip ? above : below)), left: Math.max(8, Math.min(align === 'right' ? rect.right - panelWidth : rect.left, window.innerWidth - panelWidth - 8)),
        top: flip ? undefined : rect.bottom + 6, bottom: flip ? window.innerHeight - rect.top + 6 : undefined });
    };
    update();
    const observer = new ResizeObserver(update); if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [open, present, anchor, width, align]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) close.current(); };
    // Runs before document-level modal handlers: Escape closes this layer first.
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current(); anchor.current?.focus({ preventScroll: true }); } };
    window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escape, true); };
  }, [open, anchor]);
  if (!present) return null;
  return createPortal(<div ref={panel} data-field-popover inert={!open} onClick={event=>event.stopPropagation()} className={`field-popover ${open ? 'open' : ''} ${className}`} style={position}>{children}</div>, document.body);
}
