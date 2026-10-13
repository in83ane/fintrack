type Account = { id: string; portfolioId: string; kind: string; currency: string };
/** Validate native settlement before any write. IMPORT never has a funding leg. */
export function validateAssetFunding(input: {
  type: string; portfolioId: string; currency?: string; amount?: number;
  accountId?: string; accounts: Account[]; balances: { accountId: string; balance: number }[];
}): string | null {
  if (input.type !== 'BUY' && input.type !== 'IMPORT') return null;
  if (!input.currency || !Number.isFinite(input.amount) || input.amount! <= 0) return 'กรุณาระบุยอดและสกุลเงินของรายการให้ถูกต้อง';
  if (input.type === 'IMPORT') return input.accountId ? 'รายการนำเข้าจากภายนอกต้องไม่ผูกกระเป๋าตัดเงิน' : null;
  const account = input.accounts.find(a => a.id === input.accountId);
  if (!account || account.kind !== 'cash' || account.portfolioId !== input.portfolioId) return 'เลือกกระเป๋าเงินสดของโบรกเกอร์ในฟอร์มก่อนบันทึกซื้อ';
  if (account.currency !== input.currency) return 'สกุลเงินของรายการไม่ตรงกับกระเป๋า กรุณาเลือกกระเป๋าสกุลเดียวกัน';
  const balance = input.balances.find(b => b.accountId === account.id)?.balance;
  if (!Number.isFinite(balance) || input.amount! > balance! + 0.000001) return 'เงินในกระเป๋าไม่พอสำหรับรายการนี้ กรุณาเติมเงินก่อนซื้อ';
  return null;
}
