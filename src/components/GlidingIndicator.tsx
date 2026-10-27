"use client";
import React, { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { useMotionSettings } from './MotionSettings';

type Selection = { key: string; rect: DOMRect; node: HTMLElement; animation?: Animation };
const Group = createContext<React.RefObject<Selection | null> | null>(null);
export function GlideGroup({ children }: { children: React.ReactNode }) {
  const selection = useRef<Selection | null>(null);
  return <Group.Provider value={selection}>{children}</Group.Provider>;
}

/** Anchored to the active item. Only a committed selection change uses FLIP. */
export function GlidingIndicator({ activeKey, className = '', style }: { activeKey: string; className?: string; style?: React.CSSProperties }) {
  const group = useContext(Group);
  const local = useRef<Selection | null>(null);
  const selection = group || local;
  const element = useRef<HTMLSpanElement>(null);
  const { multiplier } = useMotionSettings();
  useLayoutEffect(() => {
    const node = element.current!;
    const target = node.parentElement!;
    const next = target.getBoundingClientRect();
    const previous = selection.current;
    const old = previous?.node.isConnected ? previous.node.parentElement!.getBoundingClientRect() : previous?.rect;
    previous?.animation?.cancel();
    const current: Selection = { key: activeKey, rect: next, node };
    selection.current = current;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (previous && previous.key !== activeKey && old && next.width && next.height && !reduced.matches) {
      current.animation = node.animate([
        { transform: `translate(${old.x-next.x}px, ${old.y-next.y}px) scale(${old.width/next.width}, ${old.height/next.height})` },
        { transform: 'none' },
      ], { duration: 320 * multiplier, easing: 'cubic-bezier(.3,1.15,.5,1)' });
    }
    // Geometry changes never animate. Keep the next selection's origin current.
    const snap = () => {
      const rect = target.getBoundingClientRect();
      if (rect.x !== current.rect.x || rect.y !== current.rect.y || rect.width !== current.rect.width || rect.height !== current.rect.height || reduced.matches) current.animation?.cancel();
      current.rect = rect;
    };
    const observer = new ResizeObserver(snap);
    for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement) observer.observe(ancestor);
    window.addEventListener('resize', snap);
    window.addEventListener('scroll', snap, true);
    document.fonts?.addEventListener('loadingdone', snap);
    reduced.addEventListener('change', snap);
    return () => {
      current.rect = target.getBoundingClientRect();
      current.animation?.cancel();
      observer.disconnect();
      window.removeEventListener('resize', snap);
      window.removeEventListener('scroll', snap, true);
      document.fonts?.removeEventListener('loadingdone', snap);
      reduced.removeEventListener('change', snap);
    };
  }, [activeKey, multiplier, selection]);
  return <span ref={element} data-gliding-indicator data-active-key={activeKey} aria-hidden="true" className={`pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-primary/14 ${className}`} style={{ ...style, transformOrigin: '0 0', transition: 'none' }}/>;
}
