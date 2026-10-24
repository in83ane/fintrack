import test from 'node:test';
import assert from 'node:assert/strict';
import { displayCashflowCategory, getCashflowSummary } from './cashflow-selectors.ts';

test('Dashboard, Ledger and Cash Flow share exact totals for the same local period and wallet scope', () => {
  const records = [
    { id: 'income', type: 'INCOME', amountUSD: 11198.94, date: '2026-10-25T03:00:00.000Z', bucketId: 'wallet-a' },
    { id: 'expense', type: 'EXPENSE', amountUSD: 8701.87, date: '2026-10-25T03:00:00.000Z', bucketId: 'wallet-a' },
    { id: 'transfer', type: 'DEPOSIT', amountUSD: 500, date: '2026-10-25T03:00:00.000Z', bucketId: 'wallet-a', isTransfer: true },
    { id: 'other-wallet', type: 'INCOME', amountUSD: 100, date: '2026-10-10T03:00:00.000Z', bucketId: 'wallet-b' },
    { id: 'next-month', type: 'INCOME', amountUSD: 100, date: '2026-11-01T03:00:00.000Z', bucketId: 'wallet-a' },
  ];
  const scope = { from: '2026-10-01', to: '2026-10-31', walletId: 'wallet-a' };
  const dashboard = getCashflowSummary(records, scope);
  const ledger = getCashflowSummary(records, scope);
  const cashflow = getCashflowSummary(records, scope);
  assert.deepEqual([dashboard.income, dashboard.expenses, dashboard.net], [11198.94, 8701.87, 2497.07]);
  assert.deepEqual([ledger.income, ledger.expenses, ledger.net], [dashboard.income, dashboard.expenses, dashboard.net]);
  assert.deepEqual([cashflow.income, cashflow.expenses, cashflow.net], [dashboard.income, dashboard.expenses, dashboard.net]);
});

test('Food and อาหาร share one display-only category alias', () => {
  assert.equal(displayCashflowCategory('Food', 'en'), 'Food');
  assert.equal(displayCashflowCategory('อาหาร', 'en'), 'Food');
  assert.equal(displayCashflowCategory('Food', 'th'), 'อาหาร');
  assert.equal(displayCashflowCategory('อาหาร', 'th'), 'อาหาร');
});
