"use client";

import { useApp } from "@/src/context/AppContext";
import { CustomSelect } from "@/src/components/CustomSelect";
import { cn } from "@/src/lib/utils";

export type AssetEntryMode = 'IMPORT' | 'BUY';

/** Shared by every manual asset-entry form; changing broker never changes global filters. */
export function AssetFundingFields({ portfolioId, currency, mode, onModeChange, accountId, onAccountChange }: {
  portfolioId: string; currency: string; mode: AssetEntryMode;
  onModeChange: (mode: AssetEntryMode) => void;
  accountId: string; onAccountChange: (id: string) => void;
}) {
  const { allBrokerageAccounts, brokerageAccounts, brokerageCashBalances } = useApp();
  const accounts = [...new Map([...brokerageAccounts, ...allBrokerageAccounts].map(a => [a.id, a])).values()]
    .filter(a => a.portfolioId === portfolioId && a.kind === 'cash' && a.currency === currency);
  return <div className="space-y-3">
    <div className="flex gap-2 rounded-xl border border-white/10 bg-white/5 p-1" role="group" aria-label="วิธีเพิ่มสินทรัพย์">
      {(['IMPORT', 'BUY'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value}
        onClick={() => onModeChange(value)}
        className={cn('flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors', mode === value ? 'bg-[#ADC6FF]/20 text-[#ADC6FF]' : 'text-gray-400 hover:text-white')}>
        {value === 'IMPORT' ? 'นำเข้าจากภายนอก' : 'ซื้อ · ตัดเงินจากกระเป๋า'}
      </button>)}
    </div>
    {mode === 'IMPORT' ? <p className="text-xs text-gray-400">สินทรัพย์ที่ถืออยู่แล้ว · บันทึกต้นทุนและจำนวน · ไม่ตัดเงินจากกระเป๋า</p> : <>
      <label className="block text-xs font-bold text-gray-400">กระเป๋าเงินสดของโบรกเกอร์ ({currency})</label>
      <CustomSelect value={accounts.some(a => a.id === accountId) ? accountId : ''} onChange={onAccountChange}
        placeholder="เลือกกระเป๋าที่ต้องการตัดเงิน"
        items={accounts.map(a => ({ value: a.id, label: `${a.name} · ${(brokerageCashBalances.find(b => b.accountId === a.id)?.balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${a.currency}` }))} />
      {!accounts.length && <p className="text-xs text-[#FFB4AB]">ยังไม่มีกระเป๋า {currency} ของโบรกนี้ กรุณาสร้างและเติมเงินในหน้า Portfolio ก่อนซื้อ</p>}
      <p className="text-[11px] text-gray-500">ตัดเฉพาะกระเป๋าสกุลเดียวกัน หากเงินอยู่ใน Bucket ให้โอนเข้าโบรกก่อน</p>
    </>}
  </div>;
}
