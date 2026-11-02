const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const sandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/ledger-transfer.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, sandbox);
const { canTransfer, bucketTransferRows } = sandbox.exports;
const bucket = { id: 'bucket-a', recordId: 'bucket-a', kind: 'bucket', name: 'Savings', currency: 'THB', balance: 1000 };
const other = { ...bucket, id: 'bucket-b', recordId: 'bucket-b', name: 'Travel' };
const broker = { id: 'broker:usd', recordId: 'usd', kind: 'broker', name: 'USD cash', currency: 'USD', balance: 10 };
assert.equal(canTransfer(bucket, bucket), false);
assert.equal(canTransfer(bucket, other), true);
assert.equal(canTransfer(bucket, { ...other, currency: 'USD' }), false, 'bucket writer only supports same-currency pairs');
assert.equal(canTransfer(bucket, broker), true);
assert.equal(canTransfer(broker, bucket), true);
assert.equal(canTransfer(broker, { ...broker, id: 'broker:fcd', recordId: 'fcd' }), false);
for (const currency of ['THB', 'USD']) {
  const rows = bucketTransferRows({ ...bucket, currency }, { ...other, currency }, 125.25, 33.4, '2026-11-02T12:00:00Z');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].type, 'WITHDRAW');
  assert.equal(rows[1].type, 'DEPOSIT');
  assert.equal(rows[0].bucketId, bucket.recordId);
  assert.equal(rows[1].bucketId, other.recordId);
  assert.equal(rows[0].date, rows[1].date);
  assert.equal(rows[0].amountUSD, rows[1].amountUSD);
  for (const row of rows) {
    assert.equal(row.isTransfer, true, 'internal transfers must not become income or expense');
    assert.equal(row.originalAmount, 125.25);
    assert.equal(row.currency, currency);
    assert.equal(row.rateAtTime, currency === 'THB' ? 33.4 : 1);
  }
}
for (const amount of [0, -1, NaN, Infinity, 1000.01]) assert.throws(() => bucketTransferRows(bucket, other, amount, 33.4, '2026-11-02'));
assert.throws(() => bucketTransferRows({ ...bucket, balance: NaN }, other, 1, 33.4, '2026-11-02'));
assert.throws(() => bucketTransferRows(bucket, bucket, 1, 33.4, '2026-11-02'));
assert.throws(() => bucketTransferRows(bucket, broker, 1, 33.4, '2026-11-02'));
assert.throws(() => bucketTransferRows(bucket, other, 1, 0, '2026-11-02'));
console.log('PASS Ledger transfer routes, paired native-currency records, and invalid/insufficient balance guards');
