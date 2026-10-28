"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { PAGE_ENTER, PAGE_EXIT, SKELETON_DELAY, STALE_TTL } from '@/src/lib/loading-policy';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/src/context/AppContext';

export type PagePhase = 'idle' | 'leaving' | 'held' | 'entering';
type Navigation = { revision: number; startedAt: number; pathname?: string; signal?: AbortSignal; phase: PagePhase; exitFrom: number; swapped: boolean; skeletonAllowed: boolean };
const initialNavigation: Navigation = { revision: 0, startedAt: 0, phase: 'idle', exitFrom: 1, swapped: false, skeletonAllowed: false };
const NavigationContext = createContext(initialNavigation);
const DestinationContext = createContext<(path: string, revision: number) => void>(() => {});
export const usePageNavigation = () => useContext(NavigationContext);
export const useDestinationReady = () => useContext(DestinationContext);
/** Buttons use the same transition path as links; destinations stay unchanged. */
export function usePageRouter() {
  const router = useRouter();
  const push = useCallback((href: string) => window.dispatchEvent(new CustomEvent('fintrack:navigate', { detail: href })), []);
  return { ...router, push };
}
/** The requested location drives the persistent title and selection immediately. */
export function useNavigationPathname() {
  const committed = usePathname();
  return useContext(NavigationContext).pathname ?? committed;
}
export const visitedRoutes = new Map<string, number>();
export const skeletonTimes = new Map<number, number>();

/** Opt-in development diagnostics. No customer data is logged. */
export function traceNavigation(phase: string, detail: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== 'development') return;
  if (new URLSearchParams(location.search).has('traceNavigation')) sessionStorage.setItem('fintrack:trace-navigation', '1');
  if (sessionStorage.getItem('fintrack:trace-navigation') !== '1') return;
  const entry = { at: Math.round(performance.now()), phase, route: document.querySelector('[data-route-page]')?.getAttribute('data-route') || location.pathname, browserPath: location.pathname, title: document.querySelector('header h2')?.textContent?.trim(), ...detail };
  const debug = window as unknown as { __navigationLog?: unknown[] };
  (debug.__navigationLog ||= []).push(entry);
  console.debug('[navigation]', JSON.stringify(entry));
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const committedPath = usePathname();
  const { isDataLoaded } = useApp();
  const dataReady = useRef(isDataLoaded);
  dataReady.current = isDataLoaded;
  const routerRef = useRef(router);
  routerRef.current = router;
  const current = useRef(initialNavigation);
  const pendingHref = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const timers = useRef<{ wait?: ReturnType<typeof setTimeout>; exit?: ReturnType<typeof setTimeout>; enter?: ReturnType<typeof setTimeout>; watchdog?: ReturnType<typeof setTimeout> }>({});
  const [navigation, setNavigation] = useState(initialNavigation);
  const update = useCallback((patch: Partial<Navigation>) => {
    const before = current.current;
    current.current = { ...before, ...patch };
    setNavigation(current.current);
    if (before.phase !== current.current.phase) traceNavigation(current.current.phase, { target: current.current.pathname, revision: current.current.revision });
  }, []);

  // Called from the template's layout effect: entering is committed before paint,
  // never from a passive effect. Late commits cannot reveal an obsolete request.
  const destinationReady = useCallback((path: string, revision: number) => {
    const state = current.current;
    if (state.phase !== 'held' || state.pathname !== path || state.revision !== revision) return;
    clearTimeout(timers.current.watchdog);
    update({ phase: 'entering' });
    timers.current.enter = setTimeout(() => {
      if (current.current.revision === revision && current.current.phase === 'entering') update({ phase: 'idle' });
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : PAGE_ENTER);
  }, [update]);

  useEffect(() => {
    // Browser back/forward and direct router navigations may commit without a
    // captured link. Never overwrite a newer requested location with a late one.
    if (pendingHref.current && new URL(pendingHref.current, location.href).pathname !== committedPath) return;
    pendingHref.current = null;
    if (current.current.pathname !== committedPath) update({ pathname: committedPath });
  }, [committedPath, update]);

  useEffect(() => {
    const finishExit = () => {
      timers.current.exit = undefined;
      // CSS held has opacity:0 even if timers run before/after the animation.
      // Keep the Next outlet mounted while it fetches/commits the destination.
      flushSync(() => update({ phase: 'held', swapped: true }));
      if (pendingHref.current) routerRef.current.push(pendingHref.current, { scroll: true });
      const revision = current.current.revision;
      timers.current.watchdog = setTimeout(() => {
        if (current.current.revision === revision && current.current.phase === 'held') update({ skeletonAllowed: true });
      }, 8000);
    };
    const leave = () => {
      if (current.current.phase === 'leaving' || current.current.phase === 'held') return;
      const wrapper = document.querySelector<HTMLElement>('[data-page-wrapper]');
      const exitFrom = wrapper ? Number(getComputedStyle(wrapper).opacity) : 1;
      clearTimeout(timers.current.enter);
      update({ phase: 'leaving', exitFrom });
      timers.current.exit = setTimeout(finishExit, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : PAGE_EXIT);
    };
    const navigate = (url: URL, historyCommit = false) => {
      const href = url.pathname + url.search + url.hash;
      if (!historyCommit && (pendingHref.current === href || (!pendingHref.current && href === location.pathname + location.search + location.hash))) return;
      const phase = current.current.phase;
      const exitFrom = Number(getComputedStyle(document.querySelector('[data-page-wrapper]') || document.body).opacity);
      clearTimeout(timers.current.wait);
      clearTimeout(timers.current.enter);
      clearTimeout(timers.current.watchdog);
      request.current?.abort();
      request.current = new AbortController();
      pendingHref.current = href;
      traceNavigation('requested', { target: url.pathname });
      flushSync(() => update({ revision: current.current.revision + 1, startedAt: performance.now(), pathname: url.pathname, signal: request.current!.signal, skeletonAllowed: false, swapped: phase === 'held', ...(phase === 'entering' ? { phase: 'leaving', exitFrom } : {}) }));
      const revision = current.current.revision;
      routerRef.current.prefetch(url.pathname + url.search);
      timers.current.wait = setTimeout(() => {
        if (current.current.revision !== revision) return;
        update({ skeletonAllowed: true });
        // A cold destination is now eligible to display its actual skeleton.
        if (!current.current.swapped) leave();
      }, SKELETON_DELAY);
      if (historyCommit) {
        clearTimeout(timers.current.exit);
        // History already moved; don't push a duplicate entry on back/forward.
        flushSync(() => update({ phase: 'held', swapped: true, skeletonAllowed: true }));
        return;
      }
      if (phase === 'leaving') return; // Keep the existing exit clock and opacity.
      if (phase === 'held') { routerRef.current.push(href, { scroll: true }); return; }
      if (phase === 'entering') {
        timers.current.exit = setTimeout(finishExit, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : PAGE_EXIT);
        return;
      }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || (dataReady.current && Date.now() - (visitedRoutes.get(url.pathname) || 0) < STALE_TTL)) leave();
    };
    const localAnchor = (event: Event) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!anchor || anchor.download || (anchor.target && anchor.target !== '_self') || anchor.getAttribute('href')?.startsWith('#')) return null;
      const url = new URL(anchor.href, location.href);
      return url.origin === location.origin && /^\/(dashboard|portfolio|ledger|cashflow|terminal|trade|budget|history|settings|calendar|trader-hub|transactions|plan)(\/|$)/.test(url.pathname) ? url : null;
    };
    const warm = (event: Event) => {
      const url = localAnchor(event);
      if (url && url.pathname !== location.pathname) routerRef.current.prefetch(url.pathname + url.search);
    };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = localAnchor(event);
      if (!url) return;
      // Prevent Next Link's own push even for a repeated pending destination.
      // Otherwise a second click can bypass the held/swap boundary entirely.
      event.preventDefault();
      navigate(url);
    };
    const custom = (event: Event) => navigate(new URL((event as CustomEvent<string>).detail, location.href));
    const pop = () => navigate(new URL(location.href), true);
    document.addEventListener('click', click, true);
    document.addEventListener('pointerover', warm, true);
    document.addEventListener('pointerdown', warm, true);
    document.addEventListener('focusin', warm, true);
    window.addEventListener('popstate', pop);
    window.addEventListener('fintrack:navigate', custom);
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
      request.current?.abort();
      document.removeEventListener('click', click, true);
      document.removeEventListener('pointerover', warm, true);
      document.removeEventListener('pointerdown', warm, true);
      document.removeEventListener('focusin', warm, true);
      window.removeEventListener('popstate', pop);
      window.removeEventListener('fintrack:navigate', custom);
    };
  }, [update]);
  return <NavigationContext.Provider value={navigation}><DestinationContext.Provider value={destinationReady}>{children}</DestinationContext.Provider></NavigationContext.Provider>;
}
