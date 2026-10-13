import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/trade-lots.ts', import.meta.url), 'utf8');
const engine = ts.transpileModule(readFileSync(new URL('../src/lib/cost-basis-ledger.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace("'./cost-basis-ledger'", JSON.stringify(`data:text/javascript;base64,${Buffer.from(engine).toString('base64')}`));
const { projectTradeLots, projectLotPosition } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const buy = (id, shares, price, tag) => ({ id, portfolioId: 'p1', asset: 'NVDA', type: 'BUY', shares, pricePerUnit: price, amountUSD: shares * price, tag, date: '2026-10-12T00:00:00Z' });
const first = buy(1, 2, 100, 'DCA entry 1');
const second = buy(2, 3, 200, 'DCA entry 2');
const sell = { ...buy(3, 1, 250), type: 'SELL', tag: 'DCA partial exit from entry 2' };
const project = trades => projectTradeLots(trades, 'p1', 'NVDA');
assert.deepEqual(project([first, second, sell]).map(l => l.remaining), [2, 2], 'tagged SELL consumes only its lot');
assert.deepEqual(project([first, second]).map(l => l.remaining), [2, 3], 'deleting SELL restores original quantity');
assert.deepEqual(project([first, second, { ...sell, shares: 2 }]).map(l => l.remaining), [2, 1], 'editing SELL recomputes remaining');
assert.deepEqual(project([buy(1, 4, 150, 'DCA entry 1'), second]).map(l => [l.quantity, l.price]), [[4, 150], [3, 200]], 'editing BUY is reflected');
assert.deepEqual(project([second]).map(l => l.trade.id), [2], 'deleted BUY cannot reappear');
assert.throws(()=>project([first, second, { ...sell, tag: undefined, shares: 3 }]), /NEEDS_REVIEW/, 'untagged sales require confirmation instead of guessed allocation');
assert.equal(project([first, { ...second, portfolioId: 'other' }]).length, 1, 'portfolios isolated');
assert.equal(project([first, { ...second, asset: 'TSLA' }]).length, 1, 'symbols isolated');
assert.equal(project([first, { ...sell, tag: 'DCA partial exit from entry 1', shares: 2 }])[0].remaining, 0, 'closed lots retained for editing');
assert.deepEqual(projectLotPosition([first, second, sell], 'p1', 'NVDA'), { shares: 4, cost: 600, invested: 800, realized: 50 }, 'shared cost and profit reflect the selected sold lot');
assert.deepEqual(projectLotPosition([first, second], 'p1', 'NVDA'), { shares: 5, cost: 800, invested: 800, realized: 0 }, 'deleting sale reverses profit and restores cost');
const portfolioBuy = buy(10, 2, 120, 'Added from Portfolio');
const portfolioSell = { ...buy(11, 1, 230), type: 'SELL', tag: 'DCA partial exit from entry -10' };
assert.deepEqual(project([first, portfolioBuy, portfolioSell]).map(l => l.remaining), [2, 1], 'Portfolio sale consumes selected lot');
assert.deepEqual(project([first, portfolioBuy]).map(l => l.remaining), [2, 2], 'deleting Portfolio sale restores lot');
const halfBuy = buy(20, 1, 200, 'DCA entry 20');
const halfSell = { ...buy(21, 0.5, 382.7), type: 'SELL', tag: 'DCA partial exit from entry 20' };
const halfLot = project([halfBuy, halfSell])[0];
assert.equal(halfLot.remaining, 0.5);
assert.ok(Math.abs(halfLot.realized - 91.35) < 1e-8, 'partial sale realized profit');
assert.ok(Math.abs((382.7 - halfLot.price) * halfLot.remaining - 91.35) < 1e-8, 'remaining unrealized profit');
assert.equal(halfLot.sales.length, 1, 'partial exit appears immediately');
assert.equal(project([halfBuy])[0].sales.length, 0, 'deleted exit disappears');
assert.ok(Math.abs(project([{ ...halfBuy, fees: 2 }, { ...halfSell, fees: 1 }])[0].realized - 89.35) < 1e-8, 'allocated buy and sale fees included');
console.log('Trade lot regression tests passed (including partial-sale history and fee-adjusted P/L).');
const proportionalSale={...buy(3,.5,382.7),type:'SELL',costMethod:'SPECIFIC_LOT',closeMode:'PROPORTIONAL',lotSelections:[{lotId:'1',qty:'0.25'},{lotId:'2',qty:'0.25'}]};
const proportionalPosition=projectLotPosition([buy(1,1,200),buy(2,1,250),proportionalSale],'p1','NVDA');
assert.equal(proportionalPosition.cost,337.5);
assert.equal(proportionalPosition.invested,450);
assert.ok(Math.abs(proportionalPosition.realized-78.85)<1e-8);
console.log('Proportional allocation Portfolio projection passed.');
for (const qty of [39.279381, 8.230735, 10.553298, 1.116084]) {
  for (const type of ['BUY', 'IMPORT']) {
    const trade = { ...buy(80, qty, 116.48), type, amountUSD: 4575.2637, fees: 0.013 };
    assert.equal(projectLotPosition([trade], 'p1', 'NVDA').realized, 0, 'no sale means exactly zero, even for fractional lots/fees');
  }
}
