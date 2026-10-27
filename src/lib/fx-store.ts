import { FX_REFRESH_MS, FX_RESUME_MS, FX_STALE_MS, parseQuote, validRate, type FxQuote } from './fx';

export const FX_CACHE_KEY = 'fintrack.fx.valuation.cache.v1';
export const FX_SETTINGS_KEY = 'fintrack.fx.valuation.settings.v1';
export type FxState = { mode: 'auto' | 'manual'; rate: string | null; quote: FxQuote | null; stale: boolean; loading: boolean; error: boolean };
export const INITIAL_FX: FxState = { mode: 'auto', rate: null, quote: null, stale: false, loading: false, error: false };
type Environment = { now: () => number; visible: () => boolean; fetch: () => Promise<unknown>;
  read: (key: string) => string | null; write: (key: string, value: string) => void;
  every: (callback: () => void, ms: number) => () => void;
  onVisibility: (callback: () => void) => () => void };

/** Shared display-rate store. Only FX preferences/cache are persisted, never ledger amounts. */
export function createFxStore(env: Environment) {
  let state = INITIAL_FX, loaded = false, users = 0, failures = 0, nextFetch = 0, generation = 0;
  let pending: Promise<void> | null = null, stopTimer = () => {}, stopVisibility = () => {};
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<FxState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const safeWrite = (key: string, value: unknown) => { try { env.write(key, JSON.stringify(value)); } catch { /* private browsing */ } };
  const updateAge = () => {
    const stale = state.mode === 'auto' && !!state.quote && env.now() - state.quote.fetchedAt > FX_STALE_MS;
    if (stale !== state.stale) emit({ stale });
  };
  async function refresh(force = false): Promise<void> {
    if (state.mode !== 'auto' || !env.visible() || (!force && env.now() < nextFetch)) return;
    if (pending) return pending;
    const requestGeneration = generation;
    emit({ loading: true, error: false });
    pending = (async () => {
      try {
        const quote = parseQuote(await env.fetch(), env.now());
        if (!quote) throw Error('Invalid FX response');
        if (generation !== requestGeneration || state.mode !== 'auto') return;
        failures = 0; nextFetch = env.now() + FX_REFRESH_MS;
        safeWrite(FX_CACHE_KEY, quote);
        emit({ quote, rate: quote.rate });
      } catch {
        if (generation === requestGeneration) {
          emit({ error: true });
          failures++; nextFetch = env.now() + Math.min(FX_REFRESH_MS * 2 ** (failures - 1), FX_STALE_MS);
        }
      } finally {
        pending = null; emit({ loading: false }); updateAge();
      }
    })();
    return pending;
  }
  function initialize() {
    if (loaded) return;
    loaded = true;
    try { const quote = parseQuote(JSON.parse(env.read(FX_CACHE_KEY) || 'null'), env.now()); if (quote) emit({ quote, rate: quote.rate }); } catch {}
    try { const settings = JSON.parse(env.read(FX_SETTINGS_KEY) || 'null');
      if (settings?.mode === 'manual' && validRate(settings.manualRate)) emit({ mode: 'manual', rate: String(settings.manualRate) });
    } catch {}
    updateAge();
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      if (++users === 1) {
        initialize(); void refresh();
        stopTimer = env.every(() => { updateAge(); if (env.visible()) void refresh(); }, 60_000);
        stopVisibility = env.onVisibility(() => {
          updateAge();
          if (env.visible() && (!state.quote || env.now() - state.quote.fetchedAt >= FX_RESUME_MS)) {
            // Returning to the tab may bypass normal polling, but never failure backoff.
            void refresh(failures === 0);
          }
        });
      }
      return () => { if (--users === 0) { stopTimer(); stopVisibility(); } };
    },
    setManual(rate: string) {
      if (!validRate(rate)) return;
      generation++; emit({ mode: 'manual', rate, stale: false });
      safeWrite(FX_SETTINGS_KEY, { mode: 'manual', manualRate: rate });
    },
    async resetAuto() {
      generation++; emit({ mode: 'auto', rate: state.quote?.rate || null });
      safeWrite(FX_SETTINGS_KEY, { mode: 'auto' });
      if (pending) await pending;
      failures = 0; nextFetch = 0; updateAge(); await refresh(true);
    },
  };
}
