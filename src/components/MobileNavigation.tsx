'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { useApp } from '@/src/context/AppContext';
import { lockDocumentScroll } from '@/src/lib/scroll-lock';

/** Native dialog supplies focus containment, Escape and an inert page underneath. */
export function MobileNavigation({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const pathname = usePathname();
  const { language } = useApp();
  useEffect(() => { close.current(); }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const resize = () => { if (desktop.matches) close.current(); };
    desktop.addEventListener('change', resize);
    return () => desktop.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!node || !open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    node.showModal();
    const unlock = lockDocumentScroll();
    return () => {
      node.close();
      unlock();
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);
  return <dialog ref={dialog} id="mobile-navigation" aria-label={language === 'th' ? 'เมนูหลัก' : 'Main menu'} className="mobile-navigation" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <Sidebar mobile onClose={onClose}/>
  </dialog>;
}
