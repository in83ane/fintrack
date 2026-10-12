"use client";
import { useEffect, useRef, useState } from 'react';
import { useExecutionFxInput } from '@/src/hooks/useExecutionFxInput';
import { Decimal as D, proportionalCuts } from '@/src/lib/cost-basis-ledger';
import { supabase } from '@/src/lib/supabase';
import { useApp } from '@/src/context/AppContext';
import { Modal } from './Modal';
import { formatShareQuantity, matchesSaleSymbol, saleConfirmation } from '@/src/lib/sale-confirmation';
import { ShieldAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

type Lot = { id: string; date: string; qty: string; remaining: string; cost: string; originalCost: string };
type Allocation = { sellId: string; lotId: string; date: string; qtyClosed: string; costPerShare: string; sellPrice: string; realizedPnl: string };
type Snapshot = { lots: Lot[]; allocations: Allocation[]; invested: string; realized: string; fingerprint: string };
const z = () => D.from('0');
const sum = (values: string[]) => values.reduce((a,b) => a.add(D.from(b)),z());
const money = (v: D | string) => `$${(typeof v === 'string' ? D.from(v) : v).toFixed(2)}`;
const inputClass = 'w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white';
export function CostBasisPanel({ symbol, portfolioId, market }: { symbol: string; portfolioId: string; market: number }) {
 const { trades, brokerageAccounts, exchangeRates } = useApp();
 const reduceMotion=useReducedMotion();
 const [snapshot,setSnapshot] = useState<Snapshot | null>(null);
 const [mode,setMode] = useState<'SPECIFIC_LOT'|'PROPORTIONAL'>('SPECIFIC_LOT');
 const [quantity,setQuantity] = useState('');
 // null follows the quote until first edit; an empty string is an intentional edit.
 const [price,setPrice] = useState<string | null>(null);
 const [fee,setFee] = useState('0'); const [fx,setFx] = useExecutionFxInput();
 const [selection,setSelection] = useState<Record<string,string>>({}); const [account,setAccount] = useState('');
 const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
 const [preview,setPreview] = useState<{ before: Snapshot; after: Snapshot; sale: any } | null>(null);
 const [confirmation,setConfirmation] = useState(''); const lock=useRef(false);
 const accounts=brokerageAccounts.filter(a=>a.portfolioId===portfolioId && a.kind==='cash');
 const effectivePrice=price ?? String(market > 0 ? market : '');
 const reload=async()=>{ const {data,error}=await supabase.rpc('cost_basis_preview',{p_port:portfolioId,p_symbol:symbol}); if(error) throw error; setSnapshot(data as Snapshot); };
 // Context reloads can replace the trades array without changing this position.
 // Refresh only for actual ledger changes, and retain the visible card while fetching.
 const ledgerRevision=JSON.stringify(trades.filter(t=>t.portfolioId===portfolioId&&t.asset.toUpperCase()===symbol.toUpperCase()));
 useEffect(()=>{ let cancelled=false;
  supabase.rpc('cost_basis_preview',{p_port:portfolioId,p_symbol:symbol}).then(s=>{ if(cancelled)return; if(s.error){setError(s.error.message);return;} setSnapshot(s.data); }, (e:unknown)=>{if(!cancelled)setError(e instanceof Error?e.message:'โหลดข้อมูลไม่สำเร็จ');});
  return()=>{cancelled=true;};
 },[portfolioId,symbol,ledgerRevision]);
 const held=snapshot?.lots.filter(l=>D.from(l.remaining).cmp(z())>0)||[];
 const heldQty=sum(held.map(l=>l.remaining)), cost=sum(held.map(l=>l.cost));
 const realized=D.from(snapshot?.realized || '0'), invested=D.from(snapshot?.invested || '0');
 const unrealized=D.from(String(market > 0 ? market : 0)).mul(heldQty).sub(cost), total=realized.add(unrealized);
 const chosenAccount=accounts.find(a=>a.id===account) || accounts[0];
 const totalSelected=sum(Object.values(selection).filter(v=>/^\d+(\.\d+)?$/.test(v)));
 const fillProportional=(value:string)=>{
  setQuantity(value);setSelection({});setError('');
  if(!value)return;
  try{setSelection(Object.fromEntries(proportionalCuts(held,value).map(c=>[c.lotId,c.qty])));}
  catch(e){setError((e as Error).message);}
 };
 const review=async(all=false,lotId?:string)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   if(!/^\d+(\.\d+)?$/.test(effectivePrice)||D.from(effectivePrice).cmp(z())<=0)throw Error('กรุณาระบุราคาขายมากกว่า 0');
   if(Object.values(selection).some(q=>q && D.from(q).cmp(z())<0))throw Error('จำนวนที่ปิดต้องไม่ติดลบ');
   const selections=all?held.map(l=>({lotId:l.id,qty:l.remaining})):mode==='PROPORTIONAL'?proportionalCuts(held,quantity):Object.entries(selection).filter(([id,q])=>(!lotId||id===lotId)&&q && D.from(q).cmp(z())>0).map(([lotId,qty])=>({lotId,qty}));
   const qty=all?heldQty.toFixed(6):sum(selections.map(s=>s.qty)).toFixed(6);
   if(selections.some(s=>D.from(s.qty).cmp(D.from(D.from(s.qty).toFixed(6)))))throw Error('จำนวนหุ้นรองรับทศนิยมไม่เกิน 6 ตำแหน่ง');
   if(!chosenAccount)throw Error('เลือกบัญชีเงินสดสำหรับรับเงิน');
   // Both modes post explicit lot allocations. No per-symbol accounting setting.
   const sale={id:crypto.randomUUID(),quantity:qty,price_at_execution:effectivePrice,fees:fee,fx,method:'SPECIFIC_LOT',closeMode:mode,selections,accountId:chosenAccount.id};
   const {data,error}=await supabase.rpc('cost_basis_preview',{p_port:portfolioId,p_symbol:symbol,p_sale:sale});if(error)throw error;
   setPreview({...data,sale});setConfirmation('');
  }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 };
 const commit=async()=>{
  if(!preview||!matchesSaleSymbol(confirmation,symbol)||lock.current)return;lock.current=true;setBusy(true);
  try{const {data,error}=await supabase.rpc('cost_basis_sell',{p_port:portfolioId,p_symbol:symbol,p_sale:preview.sale,p_fingerprint:preview.before.fingerprint});if(error)throw error;
   setSnapshot(data);setPreview(null);setSelection({});setQuantity('');window.dispatchEvent(new Event('fintrack:financial-change'));await reload();
  }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 };
 const signed=(v:D)=>`${v.cmp(z())>=0?'+':'-'}$${(v.cmp(z())<0?z().sub(v):v).toFixed(2)}`;
 const qtyText=formatShareQuantity;
 const confirmationSummary=preview?saleConfirmation(preview.before,preview.after):null;
 const canConfirm=matchesSaleSymbol(confirmation,symbol);
 const percent=(v:D,base:D)=>base.cmp(z())?v.div(base).mul(D.from('100')).toFixed(2):'0.00';
 const pnlColor=(v:D)=>v.cmp(z())>=0?'text-[#4EDEA3]':'text-[#FFB4AB]';
 const rowInput="flex-1 min-w-0 rounded-lg border border-border bg-black/40 px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-[#E9C349]";
 const previewAverage=(()=>{try{if(mode!=='PROPORTIONAL'||!quantity||!snapshot)return null;const cuts=proportionalCuts(held,quantity);const soldCost=sum(cuts.map(c=>{const l=held.find(l=>l.id===c.lotId)!;return D.from(l.cost).div(D.from(l.remaining)).mul(D.from(c.qty)).toFixed(24);}));const q=D.from(quantity),left=heldQty.sub(q);return {pnl:D.from(effectivePrice).mul(q).sub(soldCost).sub(D.from(fee)),left,avg:left.cmp(z())?cost.sub(soldCost).div(left):z()};}catch{return null;}})();
 return <div aria-busy={!snapshot&&!error} className="bg-[#4EDEA3]/5 border border-[#4EDEA3]/30 rounded-2xl p-4 space-y-4 min-h-[380px] sm:min-h-[340px]">
  <div className="flex justify-between items-center"><h3 className="text-sm font-black text-white">Live P&L สถานะปัจจุบัน</h3><div className="flex items-center gap-2"><span className="text-[10px] font-bold text-gray-400">MKT Price: {money(String(market))}</span><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${unrealized.cmp(z())>=0?'bg-[#4EDEA3] text-black':'bg-[#FFB4AB] text-black'}`}>{!snapshot?'กำลังโหลด':held.length===0?'ยังไม่มีหุ้น':unrealized.cmp(z())>=0?'✓ กำลังทำกำไร':'กำลังขาดทุน'}</span></div></div>
  {error&&<p role="alert" className="text-xs text-[#FFB4AB]">{error}</p>}
  {!snapshot?<div role="status" className="space-y-4 min-h-[300px] sm:min-h-[260px]">
    <p className="text-xs text-gray-500">{error?'ยังโหลดข้อมูลไม่สำเร็จ':'กำลังตรวจสอบ ledger…'}</p>
    <div aria-hidden="true" className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4"><div className="h-14 flex-1 rounded-xl border border-white/10 bg-black/20"/><div className="h-14 flex-1 rounded-xl bg-white/[0.03]"/></div>
      <div className="h-3 w-3/4 rounded bg-white/[0.03]"/>
      <div className="h-24 rounded-xl border border-white/10 bg-black/20"/>
      <div className="h-11 rounded-xl border border-white/10 bg-black/20"/>
    </div>
  </div>:<motion.div initial={{opacity:reduceMotion?1:0}} animate={{opacity:1}} transition={{duration:reduceMotion?0:0.18}} className="space-y-4">
  <div className="flex flex-col sm:flex-row gap-4 sm:items-center"><div className="flex-1"><label className="block text-[10px] font-bold text-gray-500 mb-1">ราคาที่ขายได้จริง (Manual Sell Price)</label><input className="w-full bg-black/40 border border-[#ADC6FF]/30 rounded-xl px-4 py-3 text-lg font-black text-white outline-none focus:border-[#4EDEA3]" value={effectivePrice} onChange={e=>setPrice(e.target.value)} placeholder={market>0?String(market):'รอราคาตลาด'} onBlur={()=>{if(price!==null&&!price.trim())setPrice(null);}} /></div><div className="flex-1"><div className={`text-4xl font-black ${pnlColor(unrealized)}`}>{market>0?signed(unrealized):'—'} <span className="text-lg">({unrealized.cmp(z())>=0?'+':''}{percent(unrealized,cost)}%)</span></div><p className="text-[10px] text-gray-500 mt-1">กำไรหุ้นที่ถืออยู่ · % ของต้นทุนที่เหลือ {money(cost)}</p></div></div>
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500"><span>Realized <span className={pnlColor(realized)}>{signed(realized)}</span></span><span>Total <span className={pnlColor(total)}>{signed(total)}</span> ({percent(total,invested)}% ของเงินลงทุน {money(invested)})</span><span>ถืออยู่ {qtyText(heldQty.toFixed(6))||'0'} หุ้น · avg {heldQty.cmp(z())?money(cost.div(heldQty)):'$0.00'}</span></div>
  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
   <div className="flex items-center justify-between gap-2 mb-2"><span className="text-[10px] font-bold text-gray-400">ปิดบางส่วน / ตัดกำไรตามไม้</span><div role="group" aria-label="เลือกโหมดปิดไม้" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E9C349]/30 bg-black/40 p-1">{(['SPECIFIC_LOT','PROPORTIONAL'] as const).map(m=><button key={m} disabled={busy} aria-pressed={mode===m} className={`min-h-8 rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E9C349] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50 ${mode===m?'bg-[#E9C349] text-black shadow-sm':'text-gray-300 hover:bg-white/10 hover:text-white'}`} onClick={()=>{setMode(m);if(m==='PROPORTIONAL')fillProportional(quantity);}}>{m==='SPECIFIC_LOT'?'เลือกไม้เอง':'เฉลี่ย'}</button>)}</div><span className="text-[10px] text-gray-500">ใช้ราคาขายด้านบน</span></div>
   {mode==='PROPORTIONAL'&&<><div className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2 mb-2"><span className="text-xs font-bold text-[#ADC6FF]">ขายรวม</span><input className={rowInput} placeholder={`สูงสุด ${qtyText(heldQty.toFixed(6))}`} value={quantity} onChange={e=>fillProportional(e.target.value)} /><span className="text-[10px] text-gray-500">/{qtyText(heldQty.toFixed(6))}</span><button disabled={busy||!previewAverage} className="rounded-lg bg-[#E9C349] px-3 py-2 text-[10px] font-bold text-black disabled:opacity-40" onClick={()=>void review()}>ปิดเฉลี่ย</button></div>{previewAverage&&<p className="text-[10px] text-gray-500 mb-2">avg cost {money(cost.div(heldQty))} · realized {signed(previewAverage.pnl)} · เหลือ {qtyText(previewAverage.left.toFixed(6))||'0'} หุ้น @ {money(previewAverage.avg)}</p>}</>}
   <div className="space-y-2">{snapshot.lots.map((l,i)=><div key={l.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] p-2"><span className="text-xs font-bold text-[#ADC6FF]">ไม้ {i+1}</span><input disabled={busy||D.from(l.remaining).cmp(z())===0} className={rowInput+(mode==='PROPORTIONAL'?' text-opacity-50':'')} placeholder={`สูงสุด ${qtyText(l.remaining)||'0'}`} value={selection[l.id]||''} onChange={e=>{setMode('SPECIFIC_LOT');setSelection({...selection,[l.id]:e.target.value});setError('');}} /><span className="text-[10px] text-gray-500">/{qtyText(l.remaining)||'0'}</span><button disabled={busy||mode==='PROPORTIONAL'||!selection[l.id]||D.from(l.remaining).cmp(z())===0} onClick={()=>void review(false,l.id)} className="rounded-lg bg-[#E9C349] px-3 py-2 text-[10px] font-bold text-black disabled:opacity-40">{D.from(l.remaining).cmp(z())===0?'ปิดครบ':'ปิดไม้'}</button></div>)}</div>
   {snapshot.allocations.length>0&&<div className="mt-3 pt-3 border-t border-white/10"><p className="text-[10px] font-bold text-gray-500 mb-2">ปิดไปแล้ว</p>{snapshot.allocations.map(a=><details key={`${a.sellId}:${a.lotId}`} className="text-[10px] font-bold text-gray-400 mb-2"><summary className="flex justify-between cursor-pointer list-none" title={`${new Date(a.date).toLocaleString('th-TH')} · ต้นทุน/หุ้น ${money(a.costPerShare)}`}><span>ไม้ {snapshot.lots.findIndex(l=>l.id===a.lotId)+1}{trades.find(t=>t.dbId===a.sellId)?.closeMode==='PROPORTIONAL'?' · เฉลี่ย':''} · {qtyText(a.qtyClosed)} @ {money(a.sellPrice)}</span><span className={pnlColor(D.from(a.realizedPnl))}>{signed(D.from(a.realizedPnl))}</span></summary><p className="mt-1 text-gray-500">{new Date(a.date).toLocaleString('th-TH')} · ต้นทุนต่อหุ้น {money(a.costPerShare)} · {trades.find(t=>t.dbId===a.sellId)?.closeMode==='PROPORTIONAL'?'เฉลี่ย':'เลือกไม้เอง'}</p></details>)}</div>}
  </div>
  <button disabled={busy||!held.length} onClick={()=>void review(true)} className="w-full py-3 rounded-xl border border-[#FFB4AB]/30 bg-[#FFB4AB]/5 text-[#FFB4AB] font-black text-xs disabled:opacity-40 flex justify-center items-center gap-2"><ShieldAlert size={16}/> ปิด/ทำกำไรทั้งหมด {market>0?signed(unrealized):''}</button>
  <p className="text-center text-[10px] font-bold text-gray-500">คำสั่งนี้ขายทุกไม้ที่ถืออยู่ของหุ้นนี้ในพอร์ตที่เลือก</p>
  </motion.div>}
  {preview&&confirmationSummary&&<Modal isOpen title={`ยืนยันขาย ${symbol}`} onClose={()=>!busy&&setPreview(null)}>
   <div className="space-y-4 text-sm text-gray-300">
    <p>โหมด: {confirmationSummary.closedAll?'ปิดทุกไม้':preview.sale.closeMode==='PROPORTIONAL'?'เฉลี่ยทุกไม้':'เลือกไม้เอง'} · ขาย {qtyText(preview.sale.quantity)} หุ้น<br/>ราคา {money(preview.sale.price_at_execution)} · ค่าธรรมเนียม {money(preview.sale.fees)}</p>
    <div className="flex justify-between gap-3"><span>Proceeds สุทธิ</span><span className="text-right tabular-nums">{money(D.from(preview.sale.quantity).mul(D.from(preview.sale.price_at_execution)).sub(D.from(preview.sale.fees)))}</span></div>
    <div className="flex justify-between gap-3"><span>Realized P&L ครั้งนี้</span><span className={`text-right tabular-nums ${pnlColor(confirmationSummary.current)}`}>{signed(confirmationSummary.current)}</span></div>
    {preview.after.allocations.filter(a=>a.sellId===preview.sale.id).map(a=><div key={a.lotId} className="flex justify-between gap-3"><span>ไม้ {snapshot!.lots.findIndex(l=>l.id===a.lotId)+1}: {qtyText(a.qtyClosed)} หุ้น · ต้นทุน/หุ้น {money(a.costPerShare)}</span><span className={`text-right tabular-nums shrink-0 ${pnlColor(D.from(a.realizedPnl))}`}>P&L {signed(D.from(a.realizedPnl))}</span></div>)}
    <div className="flex flex-wrap justify-between gap-2"><span>Realized สะสมของ {symbol} หลังขาย:</span><span className={`ml-auto text-right tabular-nums ${pnlColor(confirmationSummary.cumulative)}`}>{signed(confirmationSummary.cumulative)} ({confirmationSummary.returnPercent ? `${confirmationSummary.returnPercent.cmp(z())>=0?'+':''}${confirmationSummary.returnPercent.toFixed(2)}%` : '—'} ของเงินลงทุน {money(confirmationSummary.invested)})</span></div>
    <p>ต้นทุนเฉลี่ยของหุ้นที่เลือกขาย {money(preview.after.allocations.filter(a=>a.sellId===preview.sale.id).reduce((n,a)=>n.add(D.from(a.costPerShare).mul(D.from(a.qtyClosed))),z()).div(D.from(preview.sale.quantity)))}<br/>{confirmationSummary.closedAll?'ปิดครบทุกไม้':`หลังขาย: เหลือ ${qtyText(confirmationSummary.remaining.toFixed(6))} หุ้น · avg cost ${money(confirmationSummary.average)}`}</p>
    {error&&<p role="alert" className="text-[#FFB4AB]">{error}</p>}
    <label className="block">พิมพ์ {symbol} เพื่อยืนยัน<input className={inputClass} value={confirmation} onChange={e=>setConfirmation(e.target.value)} /></label>
    <button disabled={busy||!canConfirm} onClick={()=>void commit()} className={`w-full rounded p-3 font-bold text-black disabled:opacity-40 ${canConfirm&&!busy?'bg-[#E9C349]':'bg-[#FFB4AB]'}`}>{busy?'กำลังบันทึก…':'ยืนยันบันทึกการขาย'}</button>
   </div>
  </Modal>}
 </div>;
}
