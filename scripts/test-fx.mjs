import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function moduleUrl(path, replacements = {}) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [name, url] of Object.entries(replacements)) code = code.replaceAll(`from '${name}'`, `from '${url}'`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const ledgerUrl = moduleUrl('../src/lib/cost-basis-ledger.ts');
const fxUrl = moduleUrl('../src/lib/fx.ts', { './cost-basis-ledger': ledgerUrl });
const { decimal, convertUsd, convertMoney, formatAmount, valuePortfolio, validRate, formatHistoricalStock, formatNativeTotals, FX_REFRESH_MS, FX_STALE_MS } = await import(fxUrl);
const { createFxStore, FX_CACHE_KEY, FX_SETTINGS_KEY } = await import(moduleUrl('../src/lib/fx-store.ts', { './fx': fxUrl }));
const { replay, mark } = await import(ledgerUrl);
const { convertNativeMoney, sumNativeMoney, nativeDisplay } = await import(fxUrl);
const nativeAccounts = Object.freeze([
  Object.freeze({ amount: '10000', currency: 'THB' }),
  Object.freeze({ amount: '300', currency: 'USD' }),
]);
const nativeStoredBytes = JSON.stringify(nativeAccounts);
for (const [rate, thbUsd, thbTotal, usdThb, usdTotal] of [
  ['33.53', '10059.00', '20059.00', '298.24', '598.24'],
  ['40', '12000.00', '22000.00', '250.00', '550.00'],
  ['28', '8400.00', '18400.00', '357.14', '657.14'],
]) {
  for (let toggle = 0; toggle < 3; toggle++) {
    assert.strictEqual(convertNativeMoney(nativeAccounts[0], 'THB', rate), nativeAccounts[0]);
    assert.strictEqual(convertNativeMoney(nativeAccounts[1], 'USD', rate), nativeAccounts[1]);
    assert.equal(decimal(convertNativeMoney(nativeAccounts[1], 'THB', rate).amount).toFixed(2), thbUsd);
    assert.equal(decimal(convertNativeMoney(nativeAccounts[0], 'USD', rate).amount).toFixed(2), usdThb);
    assert.equal(decimal(sumNativeMoney(nativeAccounts, 'THB', rate).amount).toFixed(2), thbTotal);
    assert.equal(decimal(sumNativeMoney(nativeAccounts, 'USD', rate).amount).toFixed(2), usdTotal);
    assert.notEqual(decimal(sumNativeMoney(nativeAccounts, 'THB', rate).amount).toFixed(2), '10300.00');
    assert.equal(JSON.stringify(nativeAccounts), nativeStoredBytes);
  }
}
assert.strictEqual(convertNativeMoney(nativeAccounts[0], 'THB', null), nativeAccounts[0]);
assert.equal(sumNativeMoney(nativeAccounts, 'USD', null), null);
assert.throws(() => convertNativeMoney({ amount: '10000' }, 'USD', '40'), /native currency/);
assert.throws(() => convertMoney('10000', undefined, 'USD', '40'), /native currency/);
assert.throws(() => sumNativeMoney([{ amount: '1', currency: 'EUR' }], 'USD', '40'), /native currency/);
assert.equal(decimal(sumNativeMoney([{ amount: '0.005', currency: 'USD' }, { amount: '0.005', currency: 'USD' }], 'USD', null).amount).toFixed(2), '0.01');
assert.deepEqual(nativeDisplay(nativeAccounts[1], 'THB', '40'), { amount: '12,000.00 THB', original: '300.00 USD', converted: true });
assert.deepEqual(nativeDisplay(nativeAccounts[0], 'THB', '40'), { amount: '10,000.00 THB', original: null, converted: false });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness(initial = {}) {
  let time = 1791800000000, visible = true, calls = 0, handler;
  const timers = new Set(), storage = new Map(Object.entries(initial));
  let fetcher = async () => ({ rate: '33.53', fetchedAt: time, source: 'frankfurter' });
  const store = createFxStore({ now: () => time, visible: () => visible,
    fetch: () => { calls++; return fetcher(); }, read: key => storage.get(key) || null, write: (key, value) => storage.set(key, value),
    every: (fn, ms) => { const timer = { fn, ms, next: time + ms }; timers.add(timer); return () => timers.delete(timer); },
    onVisibility: fn => { handler = fn; return () => { handler = null; }; },
  });
  return { store, storage, get calls() { return calls; }, get now() { return time; },
    setFetcher(fn) { fetcher = fn; },
    async visibility(v) { visible = v; handler?.(); await flush(); },
    async advance(ms) { const end = time + ms; while (true) { const due = [...timers].sort((a, b) => a.next - b.next)[0]; if (!due || due.next > end) break; time = due.next; due.next += due.ms; due.fn(); await flush(); } time = end; },
  };
}

for (const v of [0, -1, NaN, Infinity, null, {}, true, '', 'abc', 'NaN', 'Infinity', '0']) assert.equal(validRate(v), false);
assert.equal(formatAmount(convertUsd('100', 'THB', '33.53')), '3,353.00');
assert.equal(formatAmount(convertUsd('0.005', 'USD', null)), '0.01');
assert.equal(formatAmount(decimal('-178.375')), '-178.38');
assert.equal(formatAmount(decimal('178.375')), '178.38');
assert.equal(formatAmount(convertMoney('3353', 'THB', 'USD', '33.53')), '100.00');
assert.equal(convertUsd('100', 'THB', null), null);
assert.equal(decimal(1e-7).toFixed(8), '0.00000010');
assert.equal(decimal(1e21).toFixed(0), '1000000000000000000000');
assert.equal(formatHistoricalStock('178.375', 'TSLA', '40'), '178.38 USD');
assert.equal(formatHistoricalStock('10', 'PTT.BK', '33.53'), '335.30 THB');
assert.equal(formatHistoricalStock('10', 'PTT.BK', null), '— THB');
assert.equal(formatNativeTotals([{ amount: 100, signed: 100, cur: 'USD' }, { amount: 1000, signed: -1000, cur: 'THB' }], 'net'), '+100.00 USD · -1,000.00 THB');

// Full-precision portfolio accumulation, and native THB retained as native THB.
const items = [{ amount: '178.375', currency: 'USD', cost: '100', group: 'Dime', color: 'green' }, { amount: '178.375', currency: 'USD', cost: '100', group: 'Dime', color: 'green' }];
assert.equal(formatAmount(valuePortfolio(items, 'USD', null).total), '356.75');
assert.equal(formatAmount(valuePortfolio([{ amount: '1000', currency: 'THB', group: 'Bucket', color: 'gray' }], 'THB', '40').total), '1,000.00');

// The exact same ledger bytes and native USD financial presentation survive FX changes.
const events = [
  { type: 'BUY', id: 'b1', symbol: 'TSLA', date: '2026-01-01', price: '200', qty: '1' },
  { type: 'BUY', id: 'b2', symbol: 'TSLA', date: '2026-01-01', price: '250', qty: '1' },
  { type: 'SELL', id: 's1', symbol: 'TSLA', date: '2026-01-02', price: '380', qty: '0.25', method: 'SPECIFIC_LOT', selections: [{ lotId: 'b1', qty: '0.25' }] },
  { type: 'SELL', id: 's2', symbol: 'TSLA', date: '2026-01-03', price: '382.70', qty: '0.5', method: 'SPECIFIC_LOT', selections: [{ lotId: 'b1', qty: '0.5' }] },
];
const saved = JSON.stringify(events), position = replay(events);
let financialLabels;
for (const rate of ['33.53', '40', '28']) {
  const pnl = mark(position, '382.70');
  const labels = JSON.stringify([formatAmount(pnl.realized), formatAmount(pnl.unrealized), formatAmount(pnl.total), position.allocations.map(a => formatAmount(a.realizedPnl))]);
  financialLabels ??= labels; assert.equal(labels, financialLabels); assert.equal(JSON.stringify(events), saved);
  assert.ok(convertUsd(pnl.total, 'THB', rate));
}

const h = harness(); const stop = h.store.start(); await flush();
assert.equal(h.calls, 1); assert.equal(h.store.getSnapshot().mode, 'auto'); assert.equal(h.store.getSnapshot().rate, '33.53');
await h.advance(FX_REFRESH_MS); assert.equal(h.calls, 2);
await h.visibility(false); await h.advance(20 * 60_000); assert.equal(h.calls, 2);
await h.visibility(true); assert.equal(h.calls, 3);
h.store.setManual('40'); await h.advance(FX_REFRESH_MS * 2); assert.equal(h.calls, 3); assert.equal(h.store.getSnapshot().rate, '40');
await h.store.resetAuto(); assert.equal(h.calls, 4); assert.equal(h.store.getSnapshot().rate, '33.53');
stop(); await h.advance(FX_REFRESH_MS); assert.equal(h.calls, 4);
assert.deepEqual([...h.storage.keys()].sort(), [FX_CACHE_KEY, FX_SETTINGS_KEY].sort());

const failing = harness({ [FX_CACHE_KEY]: JSON.stringify({ rate: '33.53', fetchedAt: 1791800000000 - FX_STALE_MS - 1, source: 'frankfurter' }) });
failing.setFetcher(async () => { throw Error('offline'); }); const stopFail = failing.store.start(); await flush();
assert.equal(failing.store.getSnapshot().stale, true); assert.equal(failing.store.getSnapshot().rate, '33.53');
await failing.advance(9 * 60_000); assert.equal(failing.calls, 1);
await failing.visibility(false); await failing.visibility(true); assert.equal(failing.calls, 1, 'visibility must not bypass failure backoff');
await failing.advance(60_000); assert.equal(failing.calls, 2);
await failing.advance(19 * 60_000); assert.equal(failing.calls, 2); stopFail();

for (const rate of [0, -2, NaN, Infinity, 'not a rate']) {
  const bad = harness(); bad.setFetcher(async () => ({ rate, fetchedAt: bad.now, source: 'frankfurter' })); const close = bad.store.start(); await flush();
  assert.equal(bad.store.getSnapshot().rate, null); assert.equal(bad.storage.size, 0); close();
}
const empty = harness(); empty.setFetcher(async () => { throw Error('offline'); }); const close = empty.store.start(); await flush();
assert.equal(empty.store.getSnapshot().rate, null); assert.equal(formatAmount(convertUsd('100', 'THB', empty.store.getSnapshot().rate)), '—'); close();

const race = harness(); let resolve; race.setFetcher(() => new Promise(r => { resolve = r; })); const closeRace = race.store.start();
race.store.setManual('40'); resolve({ rate: '28', fetchedAt: race.now, source: 'frankfurter' }); await flush();
assert.equal(race.store.getSnapshot().rate, '40'); assert.equal(race.storage.has(FX_CACHE_KEY), false); closeRace();
const persisted = harness({ [FX_SETTINGS_KEY]: JSON.stringify({ mode: 'manual', manualRate: '40' }) }); const closePersisted = persisted.store.start(); await flush();
assert.equal(persisted.calls, 0); assert.equal(persisted.store.getSnapshot().rate, '40'); closePersisted();

// AppContext, Portfolio and Topbar share one store, one poller and one snapshot.
const shared = harness();
const stops = [shared.store.start(), shared.store.start(), shared.store.start()];
await flush();
assert.equal(shared.calls, 1);
const views = [null, null, null];
const unsub = views.map((_, i) => shared.store.subscribe(() => { views[i] = shared.store.getSnapshot(); }));
shared.store.setManual('40');
assert.ok(views.every(v => v === shared.store.getSnapshot() && v.rate === '40'));
shared.setFetcher(async () => ({ rate: '28', fetchedAt: shared.now, source: 'frankfurter' }));
await shared.store.resetAuto();
assert.ok(views.every(v => v === shared.store.getSnapshot() && v.rate === '28' && v.mode === 'auto'));
stops[1](); stops[2](); // Navigation must not stop the app-wide poller.
const previousCalls = shared.calls;
await shared.advance(FX_REFRESH_MS);
assert.equal(shared.calls, previousCalls + 1);
stops[0](); unsub.forEach(fn => fn());
const context = readFileSync(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8');
assert.match(context, /const fx = useFxRate\(\)/);
assert.ok(!context.includes("fetch('/api/exchange-rate')"));
assert.match(readFileSync(new URL('../src/components/TopBar.tsx', import.meta.url), 'utf8'), /const fx = useFxRate\(\)/);
assert.ok(!readFileSync(new URL('../src/app/(app)/portfolio/[symbol]/page.tsx', import.meta.url), 'utf8').includes('THB_RATE = 36.5'));

// Exercise the actual Next route with dependency injection, including provider fallback.
let routeCode = ts.transpileModule(readFileSync(new URL('../src/app/api/exchange-rate/valuation/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const providers = [];
let failPrimary = false, failAll = false;
const getRoute = () => {
  const exports = {};
  const cache = (fn, keys, options) => { providers.push({ keys, options }); return fn; };
  const require = name => name === 'next/server' ? { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } } : name === 'next/cache' ? { unstable_cache: cache } : { validRate };
  const mockFetch = async url => {
    if (failAll || (failPrimary && url.includes('frankfurter'))) throw Error('provider down');
    return { ok: true, json: async () => url.includes('frankfurter') ? { base: 'USD', quote: 'THB', rate: 33.559, date: '2026-10-12' } : { result: 'success', base_code: 'USD', rates: { THB: 33.53 }, time_last_update_utc: '2026-10-12' } };
  };
  new Function('require', 'exports', 'fetch', 'process', routeCode)(require, exports, mockFetch, {env:{}});
  return exports.GET;
};
assert.equal((await getRoute()()).body.source, 'frankfurter');
failPrimary = true; assert.equal((await getRoute()()).body.source, 'open.er-api.com');
failAll = true; const offlineRoute = getRoute(); assert.equal((await offlineRoute()).status, 503); assert.equal((await offlineRoute()).body.rate, undefined);
assert.ok(providers.some(p => p.options.revalidate === 600)); assert.ok(providers.some(p => p.options.revalidate === 3600));

const page = readFileSync(new URL('../src/app/(app)/portfolio/page.tsx', import.meta.url), 'utf8');
const summary = page.slice(page.indexOf('function SummaryCard'), page.indexOf('function AccountCard'));
assert.match(summary, /useFxRate\(\)/); assert.match(summary, /exactValue=\{total\}/);
assert.doesNotMatch(summary, /setAppExchangeRate|setRate\(|setDisplay\(|localStorage|addTrade/);
const settings = readFileSync(new URL('../src/app/(app)/settings/page.tsx', import.meta.url), 'utf8');
assert.ok(!settings.includes(FX_CACHE_KEY) && !settings.includes(FX_SETTINGS_KEY), 'FX cache must not be exported with ledger');
console.log('PASS FX: exact half-up, native currency, ledger invariant, auto timers/visibility, cache/stale/backoff, invalid rates, manual race/persistence/reset, unavailable state and card isolation.');
