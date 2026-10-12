export type TransferCurrency = 'USD' | 'THB';

export interface TransferQuoteInput {
  sourceCurrency: TransferCurrency;
  destinationCurrency: TransferCurrency;
  sourceAmount: number;
  fee: number;
  mode: 'rate' | 'received';
  rate: number; // Always THB per USD, in either transfer direction.
  receivedAmount: number;
}

const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

// sourceAmount is the total debit, including a fee paid in the source currency.
// Both accounts keep their original denomination; only this transfer has an FX rate.
export function quoteInvestmentTransfer(input: TransferQuoteInput) {
  const { sourceCurrency, destinationCurrency, mode } = input;
  if (![input.sourceAmount, input.fee].every(Number.isFinite) || input.sourceAmount <= 0 || input.fee < 0) return null;
  const sourceAmount = cents(input.sourceAmount);
  const fee = cents(input.fee);
  const principal = cents(sourceAmount - fee);
  if (principal <= 0) return null;

  const isExchange = sourceCurrency !== destinationCurrency;
  let receivedAmount = principal;
  let rate: number | null = null;
  if (isExchange) {
    if (mode === 'received') {
      if (!Number.isFinite(input.receivedAmount) || input.receivedAmount <= 0) return null;
      receivedAmount = cents(input.receivedAmount);
      rate = sourceCurrency === 'THB' ? principal / receivedAmount : receivedAmount / principal;
    } else {
      if (!Number.isFinite(input.rate) || input.rate <= 0) return null;
      rate = input.rate;
      receivedAmount = cents(sourceCurrency === 'THB' ? principal / rate : principal * rate);
    }
  }
  if (!Number.isFinite(receivedAmount) || receivedAmount <= 0 || (rate !== null && (!Number.isFinite(rate) || rate <= 0))) return null;
  return { sourceAmount, fee, principal, receivedAmount, rate, isExchange };
}
