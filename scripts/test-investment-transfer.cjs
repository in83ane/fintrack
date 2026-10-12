const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/investment-transfer.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(compiled, sandbox);
const quote = sandbox.exports.quoteInvestmentTransfer;
const base = { sourceCurrency: 'THB', destinationCurrency: 'USD', sourceAmount: 3360, fee: 10, mode: 'rate', rate: 33.5, receivedAmount: 0 };
let count = 0;
function check(name, run) { run(); count++; console.log(`PASS ${name}`); }

check('THB to USD: total debit includes fee', () => {
  const result = quote(base);
  assert.equal(result.sourceAmount, 3360);
  assert.equal(result.principal, 3350);
  assert.equal(result.receivedAmount, 100);
});
check('USD to THB: same THB-per-USD rate is multiplied', () => {
  const result = quote({ ...base, sourceCurrency: 'USD', destinationCurrency: 'THB', sourceAmount: 101, fee: 1 });
  assert.equal(result.receivedAmount, 3350);
  assert.equal(result.rate, 33.5);
});
check('Exact received USD amount derives execution rate after fee', () => {
  const result = quote({ ...base, mode: 'received', receivedAmount: 100, rate: NaN });
  assert.equal(result.rate, 33.5);
  assert.equal(result.receivedAmount, 100);
});
check('Exact received THB amount derives the same rate convention', () => {
  const result = quote({ ...base, sourceCurrency: 'USD', destinationCurrency: 'THB', sourceAmount: 101, fee: 1, mode: 'received', receivedAmount: 3350 });
  assert.equal(result.rate, 33.5);
});
check('Same-currency transfer never applies an FX rate', () => {
  for (const currency of ['THB', 'USD']) {
    const result = quote({ ...base, sourceCurrency: currency, destinationCurrency: currency, mode: 'received', receivedAmount: 999, rate: NaN });
    assert.equal(result.receivedAmount, 3350);
    assert.equal(result.rate, null);
  }
});
check('Fractional FX result rounds to the posted wallet cents', () => {
  assert.equal(quote({ ...base, sourceAmount: 1000, fee: 0, rate: 33.42 }).receivedAmount, 29.92);
});
check('Empty, zero, non-finite, negative, and fee-only amounts cannot post', () => {
  for (const value of [NaN, Infinity, -1, 0]) assert.equal(quote({ ...base, sourceAmount: value }), null);
  for (const value of [NaN, Infinity, -1, 3360, 4000]) assert.equal(quote({ ...base, fee: value }), null);
  for (const value of [NaN, Infinity, -1, 0]) assert.equal(quote({ ...base, rate: value }), null);
  for (const value of [NaN, Infinity, -1, 0, 0.001]) assert.equal(quote({ ...base, mode: 'received', receivedAmount: value }), null);
  assert.equal(quote({ ...base, sourceAmount: 0.01, fee: 0, rate: 100 }), null);
});
check('Actual received amount is stable when reference market rates change', () => {
  const first = quote({ ...base, mode: 'received', receivedAmount: 100, rate: 30 });
  const later = quote({ ...base, mode: 'received', receivedAmount: 100, rate: 40 });
  assert.equal(first.rate, later.rate);
  assert.equal(first.receivedAmount, later.receivedAmount);
});
console.log(`${count} transfer checks passed.`);
