"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RouteSkeleton } from './skeleton/RouteSkeleton';
import { useApp } from '@/src/context/AppContext';
import { skeletonTimes, traceNavigation, useNavigationPathname, usePageNavigation } from './PageTransition';

export function RouteLoading({ failed = false, retry, path: frozenPath, navigation: frozenNavigation }: { failed?: boolean; retry?: () => void; path?: string; navigation?: {revision:number; startedAt:number} }) {
  const requestedPath = useNavigationPathname();
  const path = frozenPath ?? requestedPath;
  const { language, isDataLoaded } = useApp();
  const requestedNavigation = usePageNavigation();
  const navigation = frozenNavigation ?? requestedNavigation;
  const mountedAt = useRef(0);
  useLayoutEffect(() => {
    // A fast router commit can prepare this tree while the wrapper is held.
    // Count the minimum from its reveal eligibility, not that hidden mount.
    if (navigation.revision && navigation.revision === requestedNavigation.revision && !requestedNavigation.skeletonAllowed) return;
    if (!skeletonTimes.has(navigation.revision)) skeletonTimes.set(navigation.revision, performance.now());
    if(skeletonTimes.size>64) skeletonTimes.delete(skeletonTimes.keys().next().value!);
  }, [navigation.revision, requestedNavigation.revision, requestedNavigation.skeletonAllowed]);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    mountedAt.current ||= performance.now();
    const age = performance.now() - (navigation.startedAt || mountedAt.current);
    setElapsed(age >= 20000 ? 20 : age >= 8000 ? 8 : 0);
    traceNavigation('loading', { isDataLoaded });
    const slow = setTimeout(() => setElapsed(8), Math.max(0, 8000 - age));
    const timeout = setTimeout(() => setElapsed(20), Math.max(0, 20000 - age));
    return () => { clearTimeout(slow); clearTimeout(timeout); };
  // Data readiness must not restart the watchdog while a route is suspended.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, navigation.startedAt]);
  const error = failed || elapsed >= 20;
  const th = language === 'th';
  return <div data-route-loading data-route={path} aria-busy={!error} style={{ minHeight: 'calc(100dvh - var(--topbar-h))' }}>
    <RouteSkeleton path={path}/>
    <div role={error ? 'alert' : 'status'} className="app-page-container pb-6 text-sm text-muted">
      {error ? <><p>{th ? 'โหลดหน้านี้ไม่สำเร็จ กรุณาลองอีกครั้ง' : 'This page could not be loaded. Please try again.'}</p><button className="ledger-control mt-3" onClick={retry || (() => location.reload())}>{th ? 'ลองอีกครั้ง' : 'Retry'}</button></> : elapsed >= 8 ? (th ? 'ใช้เวลานานกว่าปกติ…' : 'Taking longer than usual…') : <span className="sr-only">{th ? 'กำลังโหลด…' : 'Loading…'}</span>}
    </div>
  </div>;
}
