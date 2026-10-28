import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('./price-alerts.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { evaluatePriceAlerts: evaluate, marketAlertSymbol, parsePriceAlerts, startPriceAlertPolling: start } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const alert = (id, extra = {}) => ({ id, symbol: 'AAPL', name: 'Apple', targetPrice: 100, direction: 'above', isActive: true, createdAt: '2026-10-27', ...extra });
const quote = (price, extra = {}) => ({ symbol: 'AAPL', price, quoteCurrency: 'USD', ...extra });
const rates = { USD: 1, THB: 34 };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('inclusive above/below targets and multiple alerts fire once, independently of holdings', () => {
  const initial = [alert('1'), alert('2', { direction: 'below' }), alert('3', { targetPrice: 110 })];
  const result = evaluate(initial, [quote(100)], rates);
  assert.deepEqual(result.triggered.map(a => a.id), ['1', '2']);
  assert.equal(evaluate(result.alerts, [quote(100)], rates).triggered.length, 0);
  assert.equal(result.alerts[2].isActive, true);
  assert.equal(initial[0].isActive, true, 'evaluation does not mutate input or deliver side effects');
});
test('explicit target currencies, native THB stock quotes and legacy USD prices', () => {
  const result = evaluate([alert('1', { currency: 'THB', targetPrice: 3400 }), alert('2')], [quote(3400, { quoteCurrency: 'THB' })], rates);
  assert.deepEqual(result.triggered.map(a => a.currentPrice), [3400, 100]);
  assert.equal(evaluate([alert('1', { currency: 'THB', targetPrice: 3400 })], [quote(100)], rates).triggered.length, 1);
});
test('missing prices, invalid prices and missing FX never produce false notifications', () => {
  for (const prices of [[], [quote(0)], [quote(NaN)], [quote(Infinity)], [quote(100, { quoteCurrency: 'XYZ' })]]) {
    const result = evaluate([alert('1', { direction: 'below' })], prices, rates);
    assert.equal(result.triggered.length, 0); assert.deepEqual(result.unavailable, ['AAPL']);
  }
});
test('crypto aliases, exact exchange suffix and quote time are preserved', () => {
  assert.equal(marketAlertSymbol(' btcusdt '), 'BTC-USD');
  assert.equal(marketAlertSymbol('ptt.bk'), 'PTT.BK');
  const result = evaluate([alert('1', { symbol: 'BTC', targetPrice: 5 })], [quote(10, { symbol: 'BTC-USD', quoteTimestamp: 1000 })], rates, 2000);
  assert.equal(result.triggered[0].quoteAt, new Date(1000).toISOString());
});
test('safe storage parsing, empty deletion and invalid target rejection', () => {
  for (const raw of [null, 'bad', '{}', '[]', JSON.stringify([alert('1', { targetPrice: -1 })])]) assert.deepEqual(parsePriceAlerts(raw), []);
  assert.equal(parsePriceAlerts(JSON.stringify([alert('1')])).length, 1);
});
test('polls immediately, deduplicates symbols and requests fresh prices', async () => {
  let request, received;
  const poll = start({ symbols: ['BTC', 'BTCUSD'], onQuotes: quotes => { received = quotes; }, onError: assert.fail,
    fetcher: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ results: [quote(105)] }) }; } });
  await tick(); poll.stop();
  assert.ok(request.url.includes('symbols=BTC-USD'));
  assert.equal(request.options.cache, 'no-store'); assert.equal(received[0].price, 105);
});
test('one in-flight request, abort on removal/unmount, late responses cannot notify', async () => {
  let resolve, count = 0, signal, deliveries = 0;
  const poll = start({ symbols: ['AAPL'], onQuotes: () => deliveries++, onError: assert.fail,
    fetcher: async (_, options) => { count++; signal = options.signal; return new Promise(r => { resolve = r; }); } });
  void poll.refresh(); void poll.refresh(); assert.equal(count, 1);
  poll.stop(); assert.equal(signal.aborted, true);
  resolve({ ok: true, json: async () => ({ results: [quote(110)] }) }); await tick();
  assert.equal(deliveries, 0);
});
test('network failure is reported and next retry recovers', async () => {
  let calls = 0, errors = 0, deliveries = 0;
  const poll = start({ symbols: ['AAPL'], onQuotes: () => deliveries++, onError: () => errors++,
    fetcher: async () => { if (++calls === 1) throw new Error('offline'); return { ok: true, json: async () => ({ results: [quote(110)] }) }; } });
  await tick(); await poll.refresh(); poll.stop();
  assert.equal(errors, 1); assert.equal(deliveries, 1);
});
test('timer continues sampling without any asset/UI state change', async () => {
  let count = 0;
  const poll = start({ symbols: ['AAPL'], interval: 5, onQuotes: () => count++, onError: assert.fail,
    fetcher: async () => ({ ok: true, json: async () => ({ results: [quote(110)] }) }) });
  await new Promise(r => setTimeout(r, 35)); poll.stop();
  assert.ok(count >= 2);
});
test('large watch lists are batched without silently losing symbols', async () => {
  const urls = [];
  const poll = start({ symbols: Array.from({ length: 85 }, (_, i) => `S${i}`), onQuotes: () => {}, onError: assert.fail,
    fetcher: async url => { urls.push(url); return { ok: true, json: async () => ({ results: [] }) }; } });
  await tick(); poll.stop(); assert.equal(urls.length, 3);
});
