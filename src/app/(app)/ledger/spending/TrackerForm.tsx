"use client";
import { useState } from 'react';
import { Modal } from '@/src/components/Modal';
import { CustomSelect } from '@/src/components/CustomSelect';
import { useApp } from '@/src/context/AppContext';
import { formatCashflowMoney } from '@/src/lib/cashflow-selectors';
import { parseKeywords, summarizeTracker, type ExpenseTracker } from '@/src/lib/expense-tracking';

export function TrackerForm({ initial, categories, trackers, onSave, onClose }: {
  initial: ExpenseTracker; categories: string[]; trackers: ExpenseTracker[];
  onSave: (tracker: ExpenseTracker) => Promise<void>; onClose: () => void;
}) {
  const { language, t, cashActivities,exchangeRates } = useApp();
  const txt = (en:string,th:string) => language === 'th' ? th : en;
  const [name,setName] = useState(initial.name), [category,setCategory] = useState(initial.category);
  const [whole,setWhole] = useState(initial.keywords.length === 0 && !!initial.name);
  const [terms,setTerms] = useState(initial.keywords.join(', '));
  const [opening,setOpening] = useState(String(initial.opening_amount)), [currency,setCurrency] = useState(initial.currency);
  const [saving,setSaving] = useState(false), [error,setError] = useState('');
  const keywords = whole ? [] : parseKeywords(terms);
  const draft = { ...initial,name:name.trim(),category,keywords,currency,opening_amount:Number(opening),
    opening_fx: currency === initial.currency && Number(opening) === initial.opening_amount ? initial.opening_fx : exchangeRates.THB };
  const valid = draft.name && (whole || keywords.length > 0) && keywords.length <= 20 && Number.isFinite(draft.opening_amount) && draft.opening_amount >= 0 && draft.opening_amount < 1e12 && draft.opening_fx > 0;
  const preview = valid ? summarizeTracker(draft,cashActivities,trackers,exchangeRates) : null;
  return <Modal isOpen title={initial.name ? txt('Edit tracker','แก้ไขหัวข้อ') : txt('New spending tracker','สร้างหัวข้อติดตาม')} onClose={() => {if (!saving) onClose();}} contentClassName="p-5 sm:p-7">
    <form className="space-y-4" onSubmit={async e => {e.preventDefault();if (!valid || saving) return;setSaving(true);setError('');
      try {await onSave(draft);onClose();} catch (e) {setError(e instanceof Error ? e.message : txt('Could not save','บันทึกไม่สำเร็จ'));setSaving(false);}}}>
      <label className="block text-sm">{txt('Tracker name','ชื่อหัวข้อ')}<input className="ledger-input mt-1" autoFocus required maxLength={100} value={name} placeholder={txt('e.g. PUBG top-ups','เช่น เติม PUBG')} onChange={e=>setName(e.target.value)}/></label>
      <div className="space-y-1 text-sm"><span>{t('category')}</span><CustomSelect aria-label={t('category')} items={categories.map(value=>({value,label:t(value)}))} value={category} onChange={setCategory}/></div>
      <fieldset><legend className="mb-2 text-sm">{txt('Ledger entries to include','รายการที่จะดึงจาก Ledger')}</legend>
        <div className="flex flex-wrap gap-4 text-sm">{[false,true].map(all=><label key={String(all)} className="flex items-center gap-2"><input type="radio" name="match" checked={whole===all} onChange={()=>setWhole(all)}/>{all?txt('Entire category','ทั้งหมวดหมู่'):txt('Match a comment','เจาะจงคอมเมนต์')}</label>)}</div></fieldset>
      {!whole && <label className="block text-sm">{txt('Words in the comment','คำที่อยู่ในคอมเมนต์')}<input className="ledger-input mt-1" placeholder="PUBG" required maxLength={350} value={terms} onChange={e=>setTerms(e.target.value)}/>
        <span className="mt-1 block text-xs text-muted">{txt('Matches any comma-separated term, ignoring case. Review other entries yourself.','ใส่หลายคำโดยคั่นด้วยจุลภาค ตรงคำใดก็รวมให้โดยไม่แยกตัวพิมพ์ใหญ่–เล็ก รายการอื่นเลือกเพิ่มเองได้')}</span></label>}
      <div className="grid grid-cols-[1fr_6rem] items-end gap-3"><label className="min-w-0 text-sm">{txt('Spending before Ledger','ยอดเก่าที่ยังไม่เคยลง Ledger')}<input className="ledger-input mt-1" required type="number" inputMode="decimal" min="0" max="999999999999.99" step="0.01" value={opening} onChange={e=>setOpening(e.target.value)}/></label>
        <CustomSelect aria-label={t('currency')} items={['THB','USD'].map(value=>({value,label:value}))} value={currency} onChange={v=>setCurrency(v as ExpenseTracker['currency'])}/></div>
      {whole && <p className="text-xs text-muted">{txt('Item opening balances in this category are included automatically. Enter only the remaining unrecorded amount.','ยอดเก่าของหัวข้อย่อยในหมวดนี้จะถูกรวมให้แล้ว ช่องนี้ใส่เฉพาะยอดเก่าส่วนที่เหลือ')}</p>}
      {preview && <p className="rounded-lg bg-surface px-3 py-2 text-sm" aria-live="polite">{txt('Total with existing Ledger entries','ยอดรวมเมื่อรวมประวัติ Ledger')} <strong>{formatCashflowMoney(preview.totalMinor,currency)}</strong> · {preview.rows.length} {txt('entries','รายการ')}</p>}
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="ledger-control" onClick={onClose} disabled={saving}>{t('cancel')}</button><button className="ledger-control primary" disabled={!valid || saving}>{saving?txt('Saving…','กำลังบันทึก…'):txt('Save tracker','บันทึกหัวข้อ')}</button></div>
    </form>
  </Modal>;
}
