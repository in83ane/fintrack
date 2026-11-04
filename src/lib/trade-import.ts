export type TradeHistoryRow = {
  row: number; symbol: string; date: string; type: 'BUY' | 'SELL' | 'DIVIDEND';
  shares: number; price: number; fees: number; currency: 'USD' | 'THB'; broker?: string; grossAmount?: number;
};

/** Treat spreadsheet dates as calendar days, independent of browser timezone. */
export function importCalendarDate(value: unknown): string | null {
  let day: string;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Math.round((Math.floor(value) - 25569) * 86400000));
    if (!Number.isFinite(date.getTime())) return null;
    day = date.toISOString().slice(0, 10);
  } else if (value instanceof Date && Number.isFinite(value.getTime())) {
    day = `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  } else {
    const text = String(value ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)) return null;
    day = text.slice(0, 10);
  }
  const parsed = new Date(day+'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === day ? day : null;
}

export function tradeHistoryPayload(rows: TradeHistoryRow[], thbRate: number, basisDate?: string) {
  return rows.map(row => {
    const date = importCalendarDate(row.date);
    const rate = row.currency === 'THB' ? thbRate : 1;
    if (!date || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(row.price) || row.price <= 0
      || !Number.isFinite(row.fees) || row.fees < 0 || !Number.isFinite(row.shares)
      || (row.grossAmount !== undefined && (!Number.isFinite(row.grossAmount) || row.grossAmount <= 0))
      || (row.type === 'DIVIDEND' ? row.shares !== 0 : row.shares <= 0)) {
      throw new Error(`Invalid trade or exchange rate at row ${row.row}`);
    }
    return { row: row.row, symbol: row.symbol, date, type: row.type, quantity: String(row.shares),
      price: String(row.price), fees: String(row.fees), currency: row.currency, rate: String(rate), ...(basisDate ? {basisDate} : {}), ...(row.grossAmount !== undefined ? {gross: String(row.grossAmount)} : {}) };
  });
}
