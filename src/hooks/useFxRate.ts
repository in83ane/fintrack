'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { createFxStore, INITIAL_FX } from '../lib/fx-store';

const store = createFxStore({
  now: () => Date.now(), visible: () => document.visibilityState !== 'hidden',
  fetch: async () => {
    const response = await fetch('/api/exchange-rate/valuation', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw Error('FX unavailable');
    return response.json();
  },
  read: key => localStorage.getItem(key), write: (key, value) => localStorage.setItem(key, value),
  every: (callback, ms) => { const id = setInterval(callback, ms); return () => clearInterval(id); },
  onVisibility: callback => { document.addEventListener('visibilitychange', callback); return () => document.removeEventListener('visibilitychange', callback); },
});
export function useFxRate() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => INITIAL_FX);
  useEffect(() => store.start(), []);
  return { ...state, setManual: store.setManual, resetAuto: store.resetAuto };
}
