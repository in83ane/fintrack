import { decimal, requireCurrency, type FxCurrency } from './fx';

export type NativeRow = { original_amount?: unknown; currency?: unknown };
/** Only persisted native fields are evidence. Legacy amount/amountUSD are never read. */
export function getNativeLeg(row: NativeRow): { amount: number; currency: FxCurrency } {
  requireCurrency(row.currency);
  const value = row.original_amount;
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value))
    || !Number.isFinite(Number(value)) || Number(value) < 0) {
    throw Error('unresolved: missing or invalid original_amount');
  }
  return { amount: Number(value), currency: row.currency };
}

export function bucketNativeAmount(row: NativeRow, bucketCurrency: unknown): number {
  requireCurrency(bucketCurrency);
  const leg = getNativeLeg(row);
  if (leg.currency !== bucketCurrency) {
    throw Error('สกุลรายการไม่ตรงกับ Bucket — ต้องระบุรายการแลกเงินจริง ห้ามแปลงด้วยเรทปัจจุบัน');
  }
  return leg.amount;
}

export function nativeBucketBalance(balance: number, row: NativeRow, currency: unknown, direction: 1 | -1): number {
  const amount = bucketNativeAmount(row, currency);
  const next = direction === 1 ? decimal(balance).add(decimal(amount)) : decimal(balance).sub(decimal(amount));
  if (next.cmp(decimal('0')) < 0) throw Error('เงินใน Bucket ไม่เพียงพอ');
  return Number(next.toFixed(12));
}
