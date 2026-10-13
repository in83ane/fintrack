import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { orderHoldings, moveHoldingBefore, dailyMove, toggleHoldingSort, filterHoldings } = await import(`data:text/javascript;base64,${Buffer.from(compile(read('../src/lib/holding-order.ts'))).toString('base64')}`);
const rows = [
  { id: 'b', brokerId: 'p', symbol: 'B', shares: 2, price: 110, avgCost: 100, dayChangePercent: -2, sortOrder: 0 },
  { id: 'a', brokerId: 'p', symbol: 'A', shares: 1, price: 150, avgCost: 100, dayChangePercent: 5, isFavorite: true, sortOrder: 2 },
  { id: 'c', brokerId: 'p', symbol: 'C', shares: 1, price: 300, avgCost: 100, dayChangePercent: null, sortOrder: 1 },
];
const original = JSON.stringify(rows);
for (const [mode, expected] of Object.entries({
  custom: 'bca', 'name-asc': 'abc', 'name-desc': 'cba', 'value-desc': 'cba', 'value-asc': 'abc',
  'return-desc': 'cab', 'return-asc': 'bac', 'day-desc': 'abc', 'day-asc': 'bac', 'unrealized-desc': 'cab', 'unrealized-asc': 'bac',
})) assert.equal(orderHoldings(rows, mode, false).map(h => h.id).join(''), expected, mode);
assert.equal(orderHoldings(rows, 'value-desc', true).map(h => h.id).join(''), 'acb');
assert.equal(orderHoldings(rows.map(h => ({ ...h, dayChangePercent: NaN })), 'day-desc', false)[0].id, 'a');
assert.equal(moveHoldingBefore(rows, 'a', 'b').map(h => h.id).join(''), 'abc');
assert.equal(moveHoldingBefore(rows, 'b', 'a').map(h => h.id).join(''), 'cba');
assert.equal(moveHoldingBefore(rows, 'a', 'a'), null);
assert.equal(moveHoldingBefore(rows, 'missing', 'b'), null);
assert.equal(moveHoldingBefore([...rows, { ...rows[0], id: 'other', brokerId: 'q' }], 'other', 'a'), null);
assert.equal(JSON.stringify(rows), original);
for (const field of ['name', 'value', 'return', 'day', 'unrealized']) {
  assert.equal(toggleHoldingSort(`${field}-asc`, field), `${field}-desc`);
  assert.equal(toggleHoldingSort(`${field}-desc`, field), `${field}-asc`);
  assert.equal(toggleHoldingSort('custom', field), `${field}-${field === 'name' ? 'asc' : 'desc'}`);
}
assert.deepEqual(filterHoldings(rows, ' b ').map(h => h.id), ['b']);
assert.equal(filterHoldings([{ symbol: 'NVDA', name: 'NVIDIA Corporation' }], 'nvidia').length, 1);
assert.equal(filterHoldings(rows, 'unknown').length, 0);
assert.equal(filterHoldings(rows, '  ').length, 3);
assert.equal(JSON.stringify(rows), original);
assert.deepEqual(dailyMove(105, { chartPreviousClose: 50 }, { chartPreviousClose: 100 }), { previousClose: 100, dayChange: 5, dayChangePercent: 5 });
assert.deepEqual(dailyMove(95, {}, { previousClose: 100 }), { previousClose: 100, dayChange: -5, dayChangePercent: -5 });
assert.equal(dailyMove(100, {}, { previousClose: 100 }).dayChange, 0);
assert.equal(dailyMove(105, { chartPreviousClose: 50 }).dayChange, null, 'never use a month baseline as daily close');
assert.equal(dailyMove(105, { regularMarketPreviousClose: 100 }).dayChange, 5);
assert.equal(dailyMove(NaN, {}, { previousClose: 100 }).dayChange, null);

// Exercise the actual preference writer with a fake DB; no live DB/localStorage is accessed.
const source = read('../src/context/AppContext.tsx');
const start = source.indexOf('  const saveAssetPreferences = async');
const end = source.indexOf('\n  const reorderAssets', start);
assert.ok(start > 0 && end > start);
let assets = [{ portfolioId: 'p', symbol: 'A', valueUSD: 50 }, { portfolioId: 'q', symbol: 'A', valueUSD: 80 }];
const queries = [], toasts = [];
let fail = false;
const supabase = { from(table) {
  const record = { table, filters: [] }; queries.push(record);
  const query = { update(payload) { record.payload = payload; return query; }, eq(...filter) { record.filters.push(filter); return query; }, async select() { return fail ? { data: [], error: {} } : { data: [{ id: 'a' }], error: null }; } };
  return query;
} };
const save = new Function('portfolios', 'user', 'supabase', 'setAssets', 'addToast', compile(source.slice(start, end)) + '\nreturn saveAssetPreferences;')(
  [{ id: 'p', kind: 'trading' }, { id: 'q', kind: 'trading' }], { id: 'test-user' }, supabase,
  updater => { assets = updater(assets); }, (...args) => toasts.push(args),
);
assert.equal(await save('p', 'A', { isFavorite: true }), true);
assert.deepEqual(queries[0], { table: 'assets', filters: [['user_id', 'test-user'], ['portfolio_id', 'p'], ['symbol', 'A']], payload: { is_favorite: true } });
assert.equal(assets[0].isFavorite, true);
assert.equal(assets[1].isFavorite, undefined, 'same symbol in another broker is unchanged');
assert.equal(assets[0].valueUSD, 50);
assert.equal(await save('p', 'A', { sortOrder: 2 }), true);
assert.deepEqual(queries[1].payload, { sort_order: 2 });
const snapshot = JSON.stringify(assets), count = queries.length;
for (const [portfolio, prefs] of [['other', { isFavorite: true }], ['p', {}], ['p', { sortOrder: -1 }], ['p', { sortOrder: 0.5 }], ['p', { isFavorite: 'yes' }]]) assert.equal(await save(portfolio, 'A', prefs), false);
assert.equal(queries.length, count);
fail = true;
assert.equal(await save('p', 'A', { isFavorite: false }), false);
assert.equal(JSON.stringify(assets), snapshot, 'failed write must not change UI state');
assert.equal(toasts.length, 1);
fail = false;
assets = [{ symbol: 'A', valueUSD: 130, portfolioPreferences: { p: { isFavorite: false, sortOrder: 2 }, q: { isFavorite: true, sortOrder: 1 } }, isFavorite: true }];
assert.equal(await save('p', 'A', { isFavorite: true }), true);
assert.equal(assets[0].portfolioPreferences.p.isFavorite, true);
assert.equal(await save('q', 'A', { isFavorite: false }), true);
assert.equal(assets[0].isFavorite, true, 'aggregate remains favorite while another broker is starred');
assert.equal(await save('p', 'A', { isFavorite: false }), true);
assert.equal(assets[0].isFavorite, false);
assert.equal(assets[0].portfolioPreferences.q.sortOrder, 1);
assert.equal(assets[0].valueUSD, 130);
const portfolio = read('../src/app/(app)/portfolio/page.tsx');
assert.ok(!portfolio.includes('lg:row-span-2'), 'sidebar must not hold the table below a tall grid row');
assert.ok(!portfolio.includes('<HoldingTray'), 'removed right-hand asset tray must not render');
assert.ok(!portfolio.includes('<LedgerCard entries='), 'removed right-hand recent transfers must not render');
assert.ok(!portfolio.includes('lg:grid-cols-[minmax(0,1fr)_300px]'), 'holdings must use the available width');
assert.ok(portfolio.includes('flex min-w-0 flex-col gap-6'));
assert.ok(portfolio.includes('application/x-fintrack-order'));
const dashboard = read('../src/app/(app)/dashboard/page.tsx');
assert.ok(dashboard.includes('rows.filter(a => a.isFavorite)'));
assert.ok(dashboard.includes('dayChangePercent'));
console.log('PASS holdings: 9 sorts, favorites, custom moves, broker isolation, null quotes, daily close not monthly baseline, mocked scoped preference persistence, failure safety, layout and Dashboard wiring.');
