"use client";
import { useLayoutEffect, useRef, useState } from 'react';
import { SKELETON_DELAY, SKELETON_MIN } from '@/src/lib/loading-policy';

/** One threshold/minimum policy, with no delay whatsoever for ready data. */
export function useLoadingGate(pending: boolean, options: { immediate?: boolean; startedAt?: number; shownAt?: number; identity?: string } = {}) {
  const { immediate = false, startedAt = 0, shownAt = 0, identity = '' } = options;
  const [visible, setVisible] = useState(pending && immediate || shownAt > 0 && performance.now() - shownAt < SKELETON_MIN);
  const shown = useRef(shownAt);
  const started = useRef(0);
  useLayoutEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (pending) {
      started.current ||= startedAt || performance.now();
      const wait = immediate ? 0 : Math.max(0, SKELETON_DELAY - (performance.now() - (startedAt || started.current)));
      timer = setTimeout(() => { shown.current ||= performance.now(); setVisible(true); }, wait);
    } else {
      started.current = 0;
      const since = Math.max(shown.current, shownAt);
      const wait = since ? Math.max(0, SKELETON_MIN - (performance.now() - since)) : 0;
      if (!wait) { shown.current = 0; setVisible(false); }
      else timer = setTimeout(() => { shown.current = 0; setVisible(false); }, wait);
    }
    return () => clearTimeout(timer);
  }, [pending, immediate, startedAt, shownAt, identity]);
  return visible;
}
