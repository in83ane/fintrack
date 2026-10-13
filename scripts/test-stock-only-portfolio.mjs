import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const ledgerUrl = url(compile(read('../src/lib/cost-basis-ledger.ts')));
const resolve = path => url(compile(read(path)).replaceAll("'./cost-basis-ledger'", JSON.stringify(ledgerUrl)));
const { projectLotPosition } = await import(resolve('../src/lib/trade-lots.ts'));
const { valuePortfolio } = await import(resolve('../src/lib/fx.ts'));
const source = read('../src/app/(app)/portfolio/page.tsx');
const start = source.indexOf('  const appHoldings = useMemo(');
const end = source.indexOf('\n  useEffect(', start);
assert.ok(start > 0 && end > start);
const project = new Function('useMemo', 'assets', 'trades', 'activePortfolio', 'marketQuotes', 'sidebarBrokers', 'projectLotPosition', compile(source.slice(start, end)) + '\nreturn appHoldings;');
const assets = [{ id: 'one', portfolioId: 'p', symbol: 'OPAQUE', name: 'Holding', shares: 2, avgCost: 100, currentPrice: 150, valueUSD: 300, allocation: 'Equities' }];
const trades = [{ id: 1, portfolioId: 'p', type: 'IMPORT', asset: 'OPAQUE', shares: 2, pricePerUnit: 100, amountUSD: 200, currency: 'USD', originalAmount: 200, date: '2026-10-13' }];
const before = JSON.stringify({ assets, trades });
for (const active of [undefined, { id: 'p' }]) {
  for (const history of [[], trades]) {
    const holdings = project(f => f(), assets, history, active, {}, [{ id: 'p' }], projectLotPosition);
    assert.equal(holdings.length, 1);
    assert.equal(holdings[0].currency, 'USD');
    assert.equal(holdings[0].price, 150);
    const items = holdings.map(h => ({ amount: String(h.shares * h.price), cost: String(h.shares * h.avgCost), currency: h.currency, group: 'Stocks', color: '#fff' }));
    // No cash accounts or Buckets are needed. Value matches the Dashboard's USD projection.
    for (const rate of ['33.53', '40', '28']) {
      const thb = valuePortfolio(items, 'THB', rate);
      assert.equal(Number(thb.total.toFixed(2)), assets[0].valueUSD * Number(rate));
      assert.equal(Number(thb.cost.toFixed(2)), 200 * Number(rate));
      assert.equal(Number(thb.profit.toFixed(2)), 100 * Number(rate));
      assert.equal(valuePortfolio(items, 'USD', rate).total.toFixed(2), '300.00');
    }
    assert.equal(valuePortfolio(items, 'USD', null).total.toFixed(2), '300.00');
    assert.equal(valuePortfolio(items, 'THB', null).total, null);
  }
}
assert.equal(JSON.stringify({ assets, trades }), before);
assert.equal(valuePortfolio([{ amount: '100', currency: 'unresolved', group: 'Unknown', color: '' }], 'USD', '40').total, null, 'Truly unknown denominations must still be rejected');
console.log('PASS stock-only Portfolio: actual projection, import and legacy holdings, all/single broker, 3 FX rates, no cash/Buckets, no native inference or writes.');
