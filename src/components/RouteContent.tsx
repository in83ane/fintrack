"use client";

import React, { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useApp } from '@/src/context/AppContext';
import { RouteLoading } from './RouteLoading';
import { useLoadingGate } from '@/src/hooks/useLoadingGate';
import { PAGE_ENTER, PAGE_EXIT } from '@/src/lib/loading-policy';
import { visitedRoutes, skeletonTimes, traceNavigation, useDestinationReady, useNavigationPathname, usePageNavigation } from './PageTransition';

class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { traceNavigation('error', { message: error.message }); }
  render() { return this.state.failed ? <RouteLoading failed/> : this.props.children; }
}

function Entered({ children, path }: { children: React.ReactNode; path: string }) {
  const node = useRef<HTMLDivElement>(null);
  const { isDataLoaded } = useApp();
  useLayoutEffect(() => {
    const element = node.current!;
    let frame = 0, painted = false;
    const reveal = () => {
      if (painted || element.querySelector('[data-route-loading]') || !element.firstElementChild) return;
      painted = true;
      visitedRoutes.set(path, Date.now());
      traceNavigation('content-ready', { isDataLoaded, rendered: path });
      frame = requestAnimationFrame(() => {
        traceNavigation('paint', { isDataLoaded, rendered: path });
        const heading = element.querySelector<HTMLElement>('h1');
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      });
    };
    const observer = new MutationObserver(reveal);
    observer.observe(element, { childList: true, subtree: true });
    reveal();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [path, isDataLoaded]);
  return <div ref={node} data-route-entered>{children}</div>;
}

export function RouteContent({ children }: { children: React.ReactNode }) {
  const path = useNavigationPathname();
  const routerPath = usePathname();
  // A template is the identity of one committed Next segment, not the requested
  // location. Never label a still-mounted outgoing page as its destination.
  const committedPath = useRef(routerPath).current;
  const { isDataLoaded, dataLoadError } = useApp();
  const navigation = usePageNavigation();
  const destinationReady = useDestinationReady();
  const initial = navigation.revision === 0;
  const ready = committedPath === path && (isDataLoaded || ['/settings','/trader-hub'].includes(path));
  const loading = useLoadingGate(!ready, { immediate: true, shownAt: skeletonTimes.get(navigation.revision), identity: `${path}:${navigation.revision}` });
  const main = useRef<HTMLDivElement>(null);
  // Loading-gate state can belong to the preceding request until its layout
  // effect runs. A ready destination needs a minimum only if it actually showed
  // a skeleton for THIS revision, otherwise a same-route click flashes one.
  const wantsSkeleton = ready ? loading && skeletonTimes.has(navigation.revision) : initial || navigation.swapped && (navigation.skeletonAllowed || committedPath === path);
  const [presentation, setPresentation] = React.useState(() => ({ skeleton: !ready, path: committedPath, revision: navigation.revision, startedAt: navigation.startedAt }));
  let displayed = presentation;
  if (initial || navigation.swapped) {
    const next = { skeleton: wantsSkeleton, path: wantsSkeleton ? path : committedPath, revision: navigation.revision, startedAt: navigation.startedAt };
    if (next.skeleton !== presentation.skeleton || next.path !== presentation.path || next.revision !== presentation.revision) {
      displayed = next;
      setPresentation(next);
    }
  }
  // Retain the outgoing presentation (including its skeleton identity) during
  // waiting/leaving. Never resurrect its already-unmounted actual page.
  const showSkeleton = displayed.skeleton;
  const renderPath = displayed.path;
  useLayoutEffect(() => {
    // The persistent wrapper is already held at zero before router.push. This
    // acknowledgement changes it to entering in the same commit as its content.
    if (renderPath === path && (ready || showSkeleton && navigation.skeletonAllowed || dataLoadError)) destinationReady(path, navigation.revision);
  }, [renderPath, path, ready, showSkeleton, dataLoadError, navigation.revision, navigation.phase, navigation.skeletonAllowed, destinationReady]);
  useEffect(() => { traceNavigation('state', { committedPath, isDataLoaded, ready, loading, revision: navigation.revision }); }, [committedPath, isDataLoaded, ready, loading, navigation.revision]);
  return <div ref={main} data-page-root data-render-route={renderPath} data-transition-state={showSkeleton ? 'loading' : committedPath !== path ? 'waiting' : 'entered'}>
    {showSkeleton || (!isDataLoaded && dataLoadError) ? <RouteLoading path={renderPath} navigation={displayed} failed={!!dataLoadError}/> : <RouteErrorBoundary><Suspense fallback={<RouteLoading/>}><Entered path={committedPath}>{children}</Entered></Suspense></RouteErrorBoundary>}
  </div>;
}

/** One persistent opacity owner. The Next outlet must stay mounted while held. */
export function RouteViewport({ children }: { children: React.ReactNode }) {
  const main = useRef<HTMLDivElement>(null);
  const path = useNavigationPathname();
  const routerPath = usePathname();
  const navigation = usePageNavigation();
  const latest = useRef({ routerPath, navigation });
  latest.current = { routerPath, navigation };
  const {isDataRefreshing, dataLoadError} = useApp();
  const shimmerValues = useLoadingGate(!!isDataRefreshing);
  useEffect(() => { window.dispatchEvent(new Event('fintrack:route')); }, [path]);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const element = main.current!;
    let frame = 0, emptyFrames = 0;
    const check = () => {
      const root = element.querySelector('[data-route-page]');
      const count = element.querySelectorAll('[data-page-root]').length;
      // Held is deliberately invisible, not empty. Assert DOM content instead.
      const populated = root && root.getBoundingClientRect().height > 0 && root.textContent !== '';
      emptyFrames = populated ? 0 : emptyFrames + 1;
      if (emptyFrames === 2) console.error('[navigation] Empty content for more than one frame', { route: latest.current.routerPath, phase: latest.current.navigation.phase });
      if (count > 1) console.error('[navigation] Multiple page roots', latest.current.routerPath);
      if (sessionStorage.getItem('fintrack:trace-navigation') === '1') {
        const debug = window as unknown as { __fadeLog?: unknown[] };
        const logs = debug.__fadeLog ||= [];
        logs.push({t:performance.now(), phase:element.dataset.phase, routerRoute:latest.current.routerPath, renderRoute:element.querySelector('[data-render-route]')?.getAttribute('data-render-route'), opacity:Number(getComputedStyle(element).opacity), pageRootCount:count, revision:latest.current.navigation.revision});
        if (logs.length > 30000) logs.splice(0, 1000);
      }
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, []);
  const style = { '--page-exit-from':navigation.exitFrom, '--page-exit-duration':`${PAGE_EXIT}ms`, '--page-enter-duration':`${PAGE_ENTER}ms` } as React.CSSProperties;
  return <div ref={main} data-page-wrapper data-phase={navigation.phase} data-refreshing={isDataRefreshing || undefined} data-refresh-shimmer={shimmerValues || undefined} style={style}><div data-route-page data-route={path}>{children}</div>{dataLoadError && <p role="alert" className="app-page-container py-3 text-sm">{dataLoadError} <button className="ledger-control" onClick={()=>window.dispatchEvent(new Event('fintrack:financial-change'))}>Retry</button></p>}</div>;
}
