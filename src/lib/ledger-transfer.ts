import type { TransferCurrency } from './investment-transfer';

export type TransferWallet = {
  id: string;
  recordId: string;
  kind: 'bucket' | 'broker';
  name: string;
  currency: TransferCurrency;
  balance: number;
};

/** Only expose routes supported by the existing atomic ledger writers. */
export function canTransfer(source: TransferWallet, destination: TransferWallet) {
  if (source.id === destination.id) return false;
  if (source.kind === 'broker' && destination.kind === 'broker') return false;
  return source.kind !== destination.kind || source.currency === destination.currency;
}

export function bucketTransferRows(source: TransferWallet, destination: TransferWallet, amount: number, thbPerUsd: number, date: string) {
  if (source.kind !== 'bucket' || destination.kind !== 'bucket' || !canTransfer(source, destination)
    || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(source.balance) || amount > source.balance
    || !Number.isFinite(thbPerUsd) || thbPerUsd <= 0) throw Error('Invalid bucket transfer');
  const rate = source.currency === 'USD' ? 1 : thbPerUsd;
  return ([['WITHDRAW', source, `Transfer to ${destination.name}`], ['DEPOSIT', destination, `Transfer from ${source.name}`]] as const).map(([type, wallet, note]) => ({
    type, bucketId: wallet.recordId, category: wallet.name, note, date, isTransfer: true,
    currency: wallet.currency, originalAmount: amount, amountUSD: amount / rate, rateAtTime: rate,
  }));
}
