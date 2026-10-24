import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/ledger-display.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { ledgerDisplayAmount, formatLedgerAmount } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
for (const native of [126, 20, 110, 0, 126.75]) {
  const row = Object.freeze({ originalAmount: native, originalCurrency: 'THB', amountUSD: native / 35.2 });
  for (const rate of [33.709, 28, 40]) {
    const rates = { USD: 1, THB: rate };
    assert.equal(ledgerDisplayAmount(row, 'THB', rates), native);
    assert.equal(formatLedgerAmount(row, 'THB', rates), `฿${native.toFixed(2)}`);
    assert.equal(ledgerDisplayAmount(row, 'USD', rates), row.amountUSD);
    assert.equal(formatLedgerAmount(row, 'THB', rates), `฿${native.toFixed(2)}`, 'switching back derives from immutable native data');
  }
}
const usd = Object.freeze({ originalAmount: 20, originalCurrency: 'USD', amountUSD: 20 });
assert.equal(formatLedgerAmount(usd, 'USD', {USD:1,THB:33.709}), '$20.00');
assert.equal(formatLedgerAmount(usd, 'THB', {USD:1,THB:33.709}), '฿674.18');
assert.equal(formatLedgerAmount(usd, 'USD', {USD:1,THB:40}), '$20.00');
console.log('PASS Ledger native display: THB identity, two decimals, cross-currency legacy valuation, repeated USD/THB switching, immutable fixtures.');
