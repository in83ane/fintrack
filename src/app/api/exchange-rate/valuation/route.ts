import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { validRate, type FxQuote } from '@/src/lib/fx';

export const dynamic = 'force-dynamic';
// Server-only credential. Never use NEXT_PUBLIC_* or return provider errors.
const wise = unstable_cache(async (): Promise<FxQuote> => {
  const token = process.env.WISE_API_TOKEN?.trim();
  if (!token) throw Error('Wise not configured');
  const response = await fetch('https://api.wise.com/2026Q4/rates?source=USD&target=THB', {
    method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw Error('Wise rate unavailable');
  const data = await response.json();
  if (!Array.isArray(data) || data.length !== 1) throw Error('Invalid Wise rate');
  const quote = data[0];
  const quotedAt = typeof quote.time === 'string' ? Date.parse(quote.time) : NaN;
  const now = Date.now();
  if (quote.source !== 'USD' || quote.target !== 'THB' || !validRate(quote.rate)
    || !Number.isFinite(quotedAt) || quotedAt > now + 60_000 || now - quotedAt > 60 * 60_000) throw Error('Invalid or stale Wise rate');
  return { rate: String(quote.rate), fetchedAt: now, source: 'wise', providerDate: quote.time };
}, ['valuation-fx-wise-2026Q4-v1'], { revalidate: 600 });
async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw Error(`FX provider HTTP ${response.status}`);
  return response.json();
}
const frankfurter = unstable_cache(async (): Promise<FxQuote> => {
  const data = await json('https://api.frankfurter.dev/v2/rate/USD/THB');
  if (data.base !== 'USD' || data.quote !== 'THB' || !validRate(data.rate)) throw Error('Invalid Frankfurter rate');
  return { rate: String(data.rate), fetchedAt: Date.now(), source: 'frankfurter', providerDate: data.date };
}, ['valuation-fx-frankfurter-v1'], { revalidate: 600 });
const exchangeRateApi = unstable_cache(async (): Promise<FxQuote> => {
  const data = await json('https://open.er-api.com/v6/latest/USD');
  if (data.result !== 'success' || data.base_code !== 'USD' || !validRate(data.rates?.THB)) throw Error('Invalid ExchangeRate-API rate');
  return { rate: String(data.rates.THB), fetchedAt: Date.now(), source: 'open.er-api.com', providerDate: data.time_last_update_utc };
}, ['valuation-fx-er-api-v1'], { revalidate: 3600 });
let pending: Promise<FxQuote | null> | null = null;
let retryAfter = 0;
export async function GET() {
  if (Date.now() < retryAfter) return NextResponse.json({ error: 'FX unavailable' }, { status: 503 });
  pending ??= (async () => {
    const providers = process.env.WISE_API_TOKEN?.trim() ? [wise, frankfurter, exchangeRateApi] : [frankfurter, exchangeRateApi];
    for (const provider of providers) { try { return await provider(); } catch { /* keep actual source on fallback */ } }
    retryAfter = Date.now() + 60_000;
    return null;
  })();
  const quote = await pending; pending = null;
  return NextResponse.json(quote || { error: 'FX unavailable' }, { status: quote ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
