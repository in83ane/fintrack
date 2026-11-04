"use client";
import { CustomSelect } from './CustomSelect';
import { COST_PRESETS, type ImportCostPolicy, type ImportCostMethod } from '@/src/lib/import-cost-policy';

export function ImportCostPolicyPicker({ name, value, existing, onChange, language, disabled }: {
  name: string; value?: ImportCostPolicy; existing?: ImportCostPolicy;
  onChange: (value: ImportCostPolicy) => void; language: string; disabled: boolean;
}) {
  const th = language === 'th';
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-border p-4">
    <legend className="px-1 text-sm font-semibold">{name} · {th ? 'วิธีคิดต้นทุน' : 'Cost method'}</legend>
    <CustomSelect aria-label={`${name} ${th ? 'รูปแบบบัญชี' : 'Account convention'}`} disabled={disabled}
      value={!value ? '' : value.method === 'COMPRESSED_FIFO' && !value.includeFees ? 'DIME' : value.method === 'PROPORTIONAL' && !value.includeFees ? 'WEBULL_AVERAGE' : 'CUSTOM'}
      placeholder={th ? 'เลือกรูปแบบที่ตรงกับบัญชีของคุณ' : 'Choose your account convention'}
      items={[
        { value: 'DIME', label: 'Dime US · Compressed FIFO' },
        { value: 'WEBULL_AVERAGE', label: 'Webull · Average Cost' },
        { value: 'CUSTOM', label: th ? 'กำหนดเอง / โบรกเกอร์อื่น' : 'Custom / another broker' },
        ...(existing ? [{ value: 'EXISTING', label: th ? 'ใช้วิธีที่บันทึกไว้ในพอร์ตนี้' : 'Use this portfolio’s saved policy' }] : []),
      ]} onChange={preset => onChange(preset === 'EXISTING' && existing ? existing : COST_PRESETS[preset] || { method: 'PROPORTIONAL', includeFees: true })}/>
    {value && <>
      <CustomSelect aria-label={`${name} ${th ? 'วิธีตัดหุ้นเมื่อขาย' : 'Sale allocation'}`} disabled={disabled} value={value.method}
        items={[
          { value: 'COMPRESSED_FIFO', label: th ? 'รวมไม้รายวัน แล้วตัดวันเก่าออกก่อน' : 'Compressed FIFO · oldest purchase day first' },
          { value: 'FIFO', label: th ? 'FIFO · ตัดไม้เก่าออกก่อน' : 'FIFO · oldest individual lot first' },
          { value: 'PROPORTIONAL', label: th ? 'ต้นทุนเฉลี่ย · แบ่งขายตามสัดส่วนทุกไม้' : 'Average cost · proportional across held lots' },
        ]} onChange={method => onChange({ ...value, method: method as ImportCostMethod })}/>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={value.includeFees} onChange={e => onChange({ ...value, includeFees: e.target.checked })} className="mt-1"/>
        {th ? 'รวมค่าธรรมเนียมในการคำนวณต้นทุนและกำไร/ขาดทุน' : 'Include fees in cost and profit/loss'}</label>
      <p className="text-xs leading-5 text-muted">{th
        ? 'Dime US ใช้ Compressed FIFO ส่วน Webull ให้เลือกตามการตั้งค่าบัญชี: ตัวเลือกนี้รองรับ Average Cost ไม่ใช่ Diluted Cost ค่าธรรมเนียมยังเก็บในประวัติ และรายการซื้อแต่ละไม้ยังเลือกขายได้'
        : 'Dime US uses Compressed FIFO. For Webull, match your account setting: this preset supports Average Cost, not Diluted Cost. Fees stay in history and individual purchases remain selectable.'}</p>
      {existing && (existing.method !== value.method || existing.includeFees !== value.includeFees) && <p role="status" className="text-xs text-loss">{th ? 'ต่างจากวิธีเดิมของพอร์ต หากมีประวัติแล้ว ต้องตรวจปรับประวัติก่อนเปลี่ยน หรือเลือกพอร์ตใหม่' : 'This differs from the saved policy. Existing history needs reconciliation before changing it, or choose a new portfolio.'}</p>}
    </>}
  </fieldset>;
}
