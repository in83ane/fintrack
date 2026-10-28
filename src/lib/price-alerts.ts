export const PRICE_ALERT_EVENT = 'fintrack:open-price-alerts';
export const PRICE_ALERT_INTERVAL = 15_000;

export interface PriceAlert {
  id: string;
  symbol: string;
  name: string;
  targetPrice: number;
  /** Older alerts compared against asset.currentPrice, which is always USD. */
  currency?: string;
  direction: 'above' | 'below';
  isActive: boolean;
  createdAt: string;
  triggeredAt?: string;
  currentPrice?: number;
  checkedAt?: string;
  quoteAt?: string;
  note?: string;
}

export interface AlertQuote {
  symbol: string;
  price: number;
  quoteCurrency: string;
  quoteTimestamp?: number;
}

export function marketAlertSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  for (const base of ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'USDT', 'BNB', 'ADA', 'AVAX', 'LINK']) {
    if ([base, `${base}USD`, `${base}USDT`].includes(upper)) return `${base}-USD`;
  }
  return upper;
}

export function parsePriceAlerts(raw: string | null): PriceAlert[] {
  try {
    const data = JSON.parse(raw || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((a): a is PriceAlert => a && typeof a.id === 'string' &&
      typeof a.symbol === 'string' && a.symbol.trim() && Number.isFinite(a.targetPrice) && a.targetPrice > 0 &&
      ['above', 'below'].includes(a.direction) && typeof a.isActive === 'boolean');
  } catch { return []; }
}

/** Pure evaluation: quote and target must use the same currency; never infer prices from holdings/cost. */
export function evaluatePriceAlerts(alerts: PriceAlert[], quotes: AlertQuote[], rates: Record<string, number>, now = Date.now()) {
  const triggered: PriceAlert[] = [];
  const unavailable: string[] = [];
  const updated = alerts.map(alert => {
    if (!alert.isActive) return alert;
    const quote = quotes.find(q => marketAlertSymbol(q.symbol) === marketAlertSymbol(alert.symbol));
    const currency = alert.currency || 'USD';
    const from = quote?.quoteCurrency === 'USD' ? 1 : rates[quote?.quoteCurrency || ''];
    const to = currency === 'USD' ? 1 : rates[currency];
    const price = quote && quote.quoteCurrency === currency ? quote.price : quote && quote.price / from * to;
    if (!quote || !Number.isFinite(price) || price! <= 0) {
      unavailable.push(alert.symbol);
      return alert;
    }
    const hit = alert.direction === 'above' ? price! >= alert.targetPrice : price! <= alert.targetPrice;
    const next = { ...alert, currentPrice: price, checkedAt: new Date(now).toISOString(),
      quoteAt: quote.quoteTimestamp ? new Date(quote.quoteTimestamp).toISOString() : undefined,
      ...(hit ? { isActive: false, triggeredAt: new Date(now).toISOString() } : {}) };
    if (hit) triggered.push(next);
    return next;
  });
  return { alerts: updated, triggered, unavailable };
}

/** One request at a time; wake on focus/online, abort on teardown, never emit late responses. */
export function startPriceAlertPolling(options: {
  symbols: string[];
  onQuotes: (quotes: AlertQuote[]) => void | Promise<void>;
  onError: (error: unknown) => void;
  fetcher?: typeof fetch;
  interval?: number;
}) {
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  async function refresh() {
    if (stopped || inFlight || !options.symbols.length) return;
    clearTimeout(timer);
    inFlight = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 12_000);
    try {
      const symbols = [...new Set(options.symbols.map(marketAlertSymbol))];
      const quotes: AlertQuote[] = [];
      // Bound upstream fan-out without dropping users with more than 40 alerts.
      for (let i = 0; i < symbols.length; i += 40) {
        const response = await (options.fetcher || fetch)(`/api/market?quotesOnly=1&symbols=${encodeURIComponent(symbols.slice(i, i + 40).join(','))}`, {
          signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Price service: ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.results)) throw new Error('Invalid price response');
        quotes.push(...data.results);
      }
      if (!stopped) await options.onQuotes(quotes);
    } catch (error) {
      if (!stopped) options.onError(error);
    } finally {
      clearTimeout(timeout);
      inFlight = false;
      if (!stopped) timer = setTimeout(refresh, options.interval ?? PRICE_ALERT_INTERVAL);
    }
  }
  void refresh();
  return { refresh, stop() { stopped = true; clearTimeout(timer); controller?.abort(); } };
}
