export type CashflowRecord = {
  amountUSD?: number;
  amount?: number;
  category?: string;
  type: string;
  date: string;
  isTransfer?: boolean;
  bucketId?: string;
};

export type CashflowScope = { from?: string; to?: string; walletId?: string };

/** Display-only category aliases. Stored transaction categories remain untouched. */
export const CASHFLOW_CATEGORY_ALIASES: Record<string, { en: string; th: string }> = {
  food: { en: 'Food', th: 'อาหาร' },
  'อาหาร': { en: 'Food', th: 'อาหาร' },
};

export function cashflowCategoryKey(category?: string) {
  return String(category || 'Other').trim().toLocaleLowerCase('en-US') || 'other';
}

export function displayCashflowCategory(category?: string, language: 'en' | 'th' = 'en') {
  const key = cashflowCategoryKey(category);
  return CASHFLOW_CATEGORY_ALIASES[key]?.[language] || String(category || 'Other').trim() || 'Other';
}

/** Canonical cash-only period selector shared by Dashboard, Ledger and Cash Flow.
 * Dates are compared as local calendar days so UTC timestamps keep their entered day.
 */
export function selectCashflowRecords<T extends CashflowRecord>(records: readonly T[], scope: CashflowScope = {}): T[] {
  return records.filter(record => {
    const value = String(record.date);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return (!scope.from || day >= scope.from)
      && (!scope.to || day <= scope.to)
      && (!scope.walletId || scope.walletId === 'all' || record.bucketId === scope.walletId);
  });
}

export function getCashflowSummary(records: readonly CashflowRecord[], scope: CashflowScope = {}) {
  const selected = selectCashflowRecords(records, scope);
  const external = selected.filter(record => !record.isTransfer);
  const incomeCents = external.filter(record => record.type === 'INCOME' || record.type === 'DEPOSIT').reduce((sum, row) => sum + Math.round((row.amountUSD ?? row.amount ?? 0) * 100), 0);
  const expenseCents = external.filter(record => record.type === 'EXPENSE' || record.type === 'WITHDRAW').reduce((sum, row) => sum + Math.round((row.amountUSD ?? row.amount ?? 0) * 100), 0);
  const income = incomeCents / 100;
  const expenses = expenseCents / 100;
  return { records: selected, income, expenses, net: (incomeCents - expenseCents) / 100 };
}

