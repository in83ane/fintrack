import type { Trade } from '../context/AppContext';

/** Mirrors the currently deployed guard. Do not imply that every buy was allocated. */
export function tradeDeletionReason(trade: Trade, trades: Trade[], language: string): string | null {
  if (trade.type === 'SELL') return language === 'th'
    ? 'รายการขายนี้เป็นประวัติบัญชีที่ห้ามลบโดยตรง ต้องใช้การปรับปรุง ledger'
    : 'Posted sales cannot be deleted directly; a ledger correction is required.';
  if ((trade.type === 'BUY' || trade.type === 'IMPORT') && trades.some(t => t.type === 'SELL' && t.portfolioId === trade.portfolioId && t.asset.toUpperCase() === trade.asset.toUpperCase())) return language === 'th'
    ? 'ฐานข้อมูลล็อกการลบรายการซื้อของหุ้นนี้ เพราะมีประวัติขายในพอร์ตเดียวกัน'
    : 'Purchase deletion is locked because this symbol has sales in the same portfolio.';
  return null;
}

export function tradeDeleteError(error: unknown, language: string): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (message.includes('append-only')) return language === 'th' ? 'รายการขายนี้ห้ามลบโดยตรง ต้องใช้การปรับปรุง ledger' : 'Posted sales require a ledger correction, not direct deletion.';
  if (message.includes('Lot has sales')) return language === 'th' ? 'หุ้นนี้มีประวัติขายแล้ว ฐานข้อมูลจึงล็อกการลบรายการซื้อไว้' : 'This symbol has sale history; the database has locked purchase deletion.';
  return language === 'th' ? `ลบรายการโบรกไม่สำเร็จ${message ? `: ${message}` : ''}` : `Could not delete the brokerage entry${message ? `: ${message}` : '.'}`;
}
