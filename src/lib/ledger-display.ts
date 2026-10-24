export interface LedgerMoney {
  amountUSD: number;
  originalAmount?: number;
  originalCurrency?: string;
}

/** Display only: never round or mutate the persisted native leg or USD valuation. */
export function ledgerDisplayAmount(row: LedgerMoney, currency: string, rates: Record<string, number>): number {
  if (row.originalCurrency === currency && row.originalAmount !== undefined && Number.isFinite(row.originalAmount)) {
    return row.originalAmount;
  }
  // Preserve the existing AppContext display conversion for a different currency.
  return row.amountUSD * rates[currency];
}

export function formatLedgerAmount(row: LedgerMoney, currency: string, rates: Record<string, number>, language = 'en'): string {
  const amount = ledgerDisplayAmount(row, currency, rates);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(currency === 'THB' ? 'en-US' : language === 'th' ? 'th-TH' : 'en-US', {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount).replace('US$', '$');
}
