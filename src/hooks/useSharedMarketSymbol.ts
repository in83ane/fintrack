"use client";
import { useCallback, useEffect, useState } from 'react';

export const MARKET_SYMBOL_KEY = 'fintrack-last-trade-symbol';
const EVENT = 'fintrack-market-symbol-changed';
export const normalizeMarketSymbol = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

function syncSymbolUrl(symbol: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get('symbol') === symbol) return;
  url.searchParams.set('symbol', symbol);
  // This only edits the current entry's query, not page navigation. Keep the
  // router metadata intact so Back/Forward can restore the Next.js route tree.
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/** A navigation preference only. Never writes lots, balances or execution data. */
export function useSharedMarketSymbol(requested: string, fallback = '') {
  const [symbol, update] = useState(normalizeMarketSymbol(requested));
  const [ready, setReady] = useState(false);
  const select = useCallback((value: string) => {
    const next = normalizeMarketSymbol(value);
    if (!next) return; // Clearing a search box must not forget the selected stock.
    update(next);
    syncSymbolUrl(next);
    try { window.localStorage.setItem(MARKET_SYMBOL_KEY, next); } catch { /* session still works */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);
  useEffect(() => {
    const receive = (value: string | null) => {
      const next = normalizeMarketSymbol(value || '');
      if (next) { update(next); syncSymbolUrl(next); }
    };
    const onLocal = (event: Event) => receive((event as CustomEvent<string>).detail);
    const onStorage = (event: StorageEvent) => { if (event.key === MARKET_SYMBOL_KEY) receive(event.newValue); };
    window.addEventListener(EVENT, onLocal);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EVENT, onLocal); window.removeEventListener('storage', onStorage); };
  }, []);
  useEffect(() => {
    let saved = '';
    try { saved = window.localStorage.getItem(MARKET_SYMBOL_KEY) || ''; } catch { /* unavailable */ }
    const next = normalizeMarketSymbol(requested || saved || fallback);
    if (next) select(next);
    setReady(true);
  }, [requested, fallback, select]);
  return { symbol, selectSymbol: select, ready };
}
