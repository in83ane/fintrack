import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { validateAssetFunding } = await import(`data:text/javascript;base64,${Buffer.from(compile(read('../src/lib/asset-funding.ts'))).toString('base64')}`);
const source = read('../src/context/AppContext.tsx');
const body = source.slice(source.indexOf('  const addTrade = async'), source.indexOf('  const refreshBrokerageLedger = async'));
let balances, trades, entries, writes, messages;
const account = { id: 'dime-usd', portfolioId: 'dime', kind: 'cash', name: 'USD wallet', currency: 'USD' };
function setup(activePortfolioId) {
  balances = [{ accountId: account.id, balance: 1000 }]; trades = []; entries = []; writes = []; messages = [];
  const deps = {
    validateAssetFunding, activePortfolioId, user: null, language: 'th',
    portfolios: [{ id: 'other', kind: 'trading' }, { id: 'dime', kind: 'trading' }],
    allBrokerageAccounts: [account], brokerageAccounts: [], brokerageCashBalances: balances, trades,
    addToast: message => messages.push(message),
    setTrades: value => { trades = typeof value === 'function' ? value(trades) : value; },
    setBrokerageCashBalances: update => { balances = update(balances); },
    setBrokerageCashEntries: update => { entries = update(entries); },
    localStorage: { setItem: (...args) => writes.push(args) },
  };
  return new Function(...Object.keys(deps), compile(body) + '\nreturn addTrade;')(...Object.values(deps));
}
const buy = { type: 'BUY', asset: 'NVDA', portfolioId: 'dime', currency: 'USD', originalAmount: 111, amountUSD: 111, shares: 1, pricePerUnit: 111, brokerageAccountId: account.id, date: '2026-10-13T00:00:00Z' };
for (const globalBroker of [null, 'other', 'dime']) {
  let save = setup(globalBroker);
  assert.equal(await save(buy), true);
  assert.equal(trades[0].portfolioId, 'dime');
  assert.equal(balances[0].balance, 889);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].amount, 111);
  save = setup(globalBroker);
  assert.equal(await save({ ...buy, type: 'IMPORT', brokerageAccountId: undefined }), true);
  assert.equal(trades[0].type, 'IMPORT');
  assert.equal(balances[0].balance, 1000);
  assert.equal(entries.length, 0);
}
for (const invalid of [
  { brokerageAccountId: undefined }, { brokerageAccountId: 'unknown' },
  { currency: 'THB' }, { portfolioId: 'other' }, { portfolioId: 'missing' },
  { originalAmount: 1001 }, { originalAmount: NaN }, { originalAmount: -1 },
  { originalAmount: undefined }, { currency: undefined }, { type: 'IMPORT' },
]) {
  const save = setup(null);
  assert.equal(await save({ ...buy, ...invalid }), false, JSON.stringify(invalid));
  assert.equal(writes.length, 0); assert.equal(trades.length, 0);
  assert.equal(entries.length, 0); assert.equal(balances[0].balance, 1000);
  assert.ok(messages.length);
}
// Render-path regression checks: all manual entry surfaces use the same picker.
for (const file of ['../src/components/AddAssetModal.tsx', '../src/components/DcaOrderSystem.tsx', '../src/app/(app)/portfolio/page.tsx']) {
  assert.ok(read(file).includes('<AssetFundingFields'));
}
const modal = read('../src/components/AddAssetModal.tsx');
assert.ok(!modal.includes('selectPortfolio('));
assert.ok(!modal.includes('addTradeFromBucket('));
assert.ok(!modal.includes('await addAsset('));
assert.ok(modal.includes('if (!saved) return;'));
assert.ok(modal.includes('if (saved) onClose();'));
assert.ok(source.includes('getBalances(user.id, null)'));
const pickerSource = read('../src/components/AssetFundingFields.tsx').replace(/^import .*;$/gm, '').replace('export function AssetFundingFields', 'function AssetFundingFields');
const pickerCompiled = ts.transpileModule(pickerSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText.replace('export {};', '');
const Picker = new Function('React', 'useApp', 'CustomSelect', 'cn', pickerCompiled + '\nreturn AssetFundingFields;')(
  React,
  () => ({ allBrokerageAccounts: [account, { ...account, id: 'other-wallet', portfolioId: 'other', name: 'HIDDEN_OTHER' }, { ...account, id: 'thb', currency: 'THB', name: 'HIDDEN_THB' }], brokerageAccounts: [], brokerageCashBalances: [{ accountId: account.id, balance: 1000 }] }),
  ({ items, placeholder }) => React.createElement('select', null, React.createElement('option', null, placeholder), ...items.map(item => React.createElement('option', { key: item.value }, item.label))),
  (...values) => values.filter(Boolean).join(' '),
);
const render = mode => renderToStaticMarkup(React.createElement(Picker, { portfolioId: 'dime', currency: 'USD', mode, onModeChange() {}, accountId: '', onAccountChange() {} }));
assert.ok(render('IMPORT').includes('ไม่ตัดเงินจากกระเป๋า'));
assert.ok(!render('IMPORT').includes('<select'));
assert.ok(render('BUY').includes('USD wallet'));
assert.ok(!render('BUY').includes('HIDDEN_'));
console.log('PASS: 6 broker/mode executions; 11 rejection/no-write cases; shared form regressions. All storage and cash writes mocked.');
