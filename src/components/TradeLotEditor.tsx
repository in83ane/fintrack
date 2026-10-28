"use client";
import { CustomSelect } from "@/src/components/CustomSelect";

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/src/context/AppContext';
import { projectTradeLots } from '@/src/lib/trade-lots';
import { Modal } from './Modal';
import { supabase } from '@/src/lib/supabase';
import { Decimal } from '@/src/lib/cost-basis-ledger';

export function TradeLotEditor({ symbol, portfolioId, initialTradeId, onClose }: {
  symbol: string; portfolioId: string; initialTradeId?: number; onClose: () => void;
}) {
  const { trades, updateTrade, removeTrade, addToast } = useApp();
  const lots = useMemo(() => projectTradeLots(trades, portfolioId, symbol), [trades, portfolioId, symbol]);
  const [selectedId, setSelectedId] = useState(initialTradeId);
  const selected = lots.find(lot => lot.trade.id === selectedId) || lots[0];
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [correction, setCorrection] = useState<any>(null);
  const trade = selected?.trade;
  const rate = trade?.currency === 'USD' ? 1 : trade?.rateAtTime || 1;
  useEffect(() => { setCorrection(null); }, [price, quantity, trade?.dbId]);
  useEffect(() => {
    setQuantity(String(selected?.quantity || 0));
    setPrice(String(trade ? (trade.pricePerUnit || (selected?.quantity ? trade.amountUSD / selected.quantity : 0)) * rate : 0));
  }, [trade, selected?.quantity, rate]);
  const save = async () => {
    if (!trade || !selected) return;
    const qty = Number(quantity), amount = Number(price);
    if (!Number.isFinite(qty) || !Number.isFinite(amount) || qty <= 0 || amount <= 0) {
      addToast('ระบุจำนวนและราคามากกว่า 0', 'warning'); return;
    }
    if (qty < selected.quantity - selected.remaining) {
      addToast('จำนวนซื้อต้องไม่น้อยกว่าจำนวนที่ขายไปแล้ว กรุณาแก้รายการขายก่อน', 'warning'); return;
    }
    if (selected.remaining < selected.quantity) {
      if(qty !== selected.quantity) { addToast('จำนวนซื้อเดิมเปลี่ยนไม่ได้หลังมีรายการขาย', 'warning'); return; }
      if(!trade.dbId) { addToast('ต้องมีรายการต้นฉบับในฐานข้อมูลก่อน replay', 'error'); return; }
      setBusy(true);
      try { const request = {p_id:trade.dbId,p_price:Decimal.from(price).div(Decimal.from(String(rate))).toFixed(24),p_fee:String(trade.fees||0)}; const {data,error}=await supabase.rpc('cost_basis_correct_buy',request); if(error)throw error; setCorrection({...data,request}); }
      catch(e){addToast((e as Error).message,'error');}finally{setBusy(false);} return;
    }
    setBusy(true);
    try {
      if (await updateTrade(trade.id, { shares: qty, pricePerUnit: amount / rate, amountUSD: qty * amount / rate, originalAmount: qty * amount })) {
        addToast('แก้ไขไม้แล้ว · Portfolio, Trade และ Ledger อัปเดตจากรายการเดียวกัน', 'success');
      }
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!trade || !selected) return;
    if (selected.remaining < selected.quantity) { addToast('ไม้นี้มีประวัติขายแล้ว จึงลบไม่ได้ ใช้การแก้ราคาและ replay เพื่อรักษาประวัติ', 'warning'); return; }
    if (!window.confirm('ลบรายการซื้อไม้นี้และย้อนผลเงินสดที่เกี่ยวข้องหรือไม่?')) return;
    setBusy(true);
    try { await removeTrade(trade.id); } finally { setBusy(false); }
  };
  const input = 'w-full rounded-xl border border-foreground/10 bg-foreground/5 px-3 py-3 text-sm text-foreground outline-none ';
  return <Modal isOpen onClose={() => !busy && onClose()} title={`จัดการไม้ ${symbol}`}>
    {!selected ? <p className="text-sm text-gray-400">ไม่มีรายการซื้อของสินทรัพย์นี้แล้ว</p> : <div className="space-y-5">
      <label className="block space-y-2"><span className="text-xs text-gray-400">เลือกไม้ที่ต้องการแก้ไข</span><CustomSelect aria-label="เลือกไม้ที่ต้องการแก้ไข" disabled={busy} value={String(trade!.id)} onChange={value=>setSelectedId(Number(value))} items={lots.map((lot,index)=>({value:String(lot.trade.id),label:`ไม้ ${index+1} · ${new Date(lot.trade.date).toLocaleDateString('th-TH')} · ซื้อ ${lot.quantity} หน่วย · เหลือ ${lot.remaining}`}))}/></label>
      <p className="text-xs leading-relaxed text-gray-400">แก้ข้อมูลการซื้อเฉพาะไม้นี้ ยอดถือครองและต้นทุนเฉลี่ยรวมจะคำนวณใหม่อัตโนมัติ</p>
      <p className="text-xs text-gray-400">ค่าธรรมเนียมที่บันทึก {((trade?.fees || 0) * rate).toLocaleString()} {trade?.currency} · {trade?.fxRateTHB ? `1 USD = ${trade.fxRateTHB} THB` : 'ไม่ระบุเรท USD/THB'} (คงค่าเดิมเมื่อแก้จำนวน/ราคา)</p>
      <label className="block space-y-2"><span className="text-xs text-gray-400">จำนวนหน่วยที่ซื้อในไม้นี้ (ล็อกเมื่อมีประวัติขาย)</span><input disabled={busy || selected.remaining < selected.quantity} type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} className={input} /></label>
      <label className="block space-y-2"><span className="text-xs text-gray-400">ราคาซื้อต่อหน่วย ({trade!.currency})</span><input disabled={busy} type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} className={input} /></label>
      <p className="text-xs text-gray-500">ขายไปแล้ว {selected.quantity - selected.remaining} หน่วย · คงเหลือ {selected.remaining} หน่วย</p>
      {correction && <div className="rounded-xl border border-warning/40 p-3 text-xs text-gray-300"><p>Replay จะปรับกำไรขายแล้วจาก ${correction.before.realized} เป็น ${correction.after.realized}</p><p>รายการขายที่ได้รับผลกระทบ: {correction.affectedSales.join(', ') || 'ไม่มี'}</p><button disabled={busy} className="mt-3 rounded bg-primary p-2 font-bold text-black" onClick={async()=>{
        setBusy(true);try{const {error}=await supabase.rpc('cost_basis_correct_buy',{...correction.request,p_commit:true,p_fingerprint:correction.before.fingerprint});if(error)throw error;setCorrection(null);window.dispatchEvent(new Event('fintrack:financial-change'));onClose();}catch(e){addToast((e as Error).message,'error');}finally{setBusy(false);}
      }}>ยืนยันแก้ราคาและ replay ประวัติ</button></div>}
      <div className="flex gap-3"><button disabled={busy} onClick={remove} className="rounded-xl border border-foreground/10 px-4 py-3 text-sm text-loss disabled:opacity-40">ลบไม้นี้</button><button disabled={busy} onClick={save} className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-black disabled:opacity-40">{busy ? 'กำลังบันทึก…' : 'บันทึกไม้นี้'}</button></div>
    </div>}
  </Modal>;
}
