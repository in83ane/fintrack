"use client";
import {useState} from 'react';
import {Modal} from '@/src/components/Modal';
import {StockSplitReview,type SplitReviewValue} from '@/src/components/StockSplitReview';
import {supabase} from '@/src/lib/supabase';

export function StockSplitButton({symbol,portfolioId,from,language}:{symbol:string;portfolioId:string;from:string;language:'en'|'th'}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [review,setReview]=useState<SplitReviewValue>({splits:[],ready:false});
  const th=language==='th';
  async function apply() {
    if(busy||!review.ready||!review.splits.length)return;
    setBusy(true);setMessage('');
    try {
      const {data,error}=await supabase.rpc('apply_stock_splits',{p_port:portfolioId,p_splits:review.splits});
      if(error)throw error;
      window.dispatchEvent(new Event('fintrack:financial-change'));
      setMessage(th?`บันทึก ${data.applied} เหตุการณ์ · ข้าม ${data.skipped} เหตุการณ์ที่มีแล้ว`:`Applied ${data.applied} · skipped ${data.skipped} existing events`);
    } catch(error){setMessage((error as Error).message);} finally {setBusy(false);}
  }
  return <>
    <button type="button" onClick={()=>{setOpen(true);setMessage('');setReview({splits:[],ready:false});}} className="min-h-9 text-xs font-semibold text-primary underline underline-offset-4">{th?'ตรวจหุ้นแตกพาร์':'Review stock splits'}</button>
    <Modal isOpen={open} onClose={()=>{if(!busy)setOpen(false);}} title={th?`หุ้นแตกพาร์ · ${symbol}`:`Stock splits · ${symbol}`}>
      {open&&<div className="space-y-4">
        <p className="text-sm text-gray-300">{th?'ตรวจให้แน่ใจว่าไม้เดิมยังไม่ได้ปรับจำนวนเอง ระบบเก็บข้อมูลก่อนแก้และคำนวณกำไรจากการขายใหม่ตามจำนวนหุ้นที่ปรับแล้ว':'Verify that existing lots have not already been manually adjusted. Original records are retained and sale profit is recalculated using the adjusted units.'}</p>
        <StockSplitReview symbols={[{symbol,from}]} language={language} disabled={busy} onChange={setReview} />
        {message&&<p role="status" className="text-sm text-gray-200">{message}</p>}
        <button type="button" disabled={busy||!review.ready||!review.splits.length} onClick={apply} className="min-h-11 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-background disabled:cursor-not-allowed disabled:opacity-40">{busy?(th?'กำลังบันทึก…':'Applying…'):(th?'บันทึกเหตุการณ์ที่เลือก':'Apply selected events')}</button>
      </div>}
    </Modal>
  </>;
}
