"use client";
import {useEffect,useMemo,useState} from 'react';
import {validateStockSplit,type StockSplit} from '@/src/lib/stock-splits';

export type SplitReviewValue={splits:StockSplit[];basisDate?:string;ready:boolean};
const todayLocal=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

/** Discovery is read-only. Applying an event always requires an explicit review. */
export function StockSplitReview({symbols,language,importing=false,disabled=false,onChange}:{symbols:{symbol:string;from:string}[];language:'en'|'th';importing?:boolean;disabled?:boolean;onChange:(value:SplitReviewValue)=>void}) {
  const th=language==='th';
  const key=JSON.stringify(symbols);
  const [loading,setLoading]=useState(true),[found,setFound]=useState<StockSplit[]>([]),[unavailable,setUnavailable]=useState<string[]>([]);
  const [excluded,setExcluded]=useState<string[]>([]),[confirmed,setConfirmed]=useState(false),[acknowledged,setAcknowledged]=useState(false);
  const [adjusted,setAdjusted]=useState(false),[basisDate,setBasisDate]=useState(todayLocal);
  const [manual,setManual]=useState(false),[symbol,setSymbol]=useState(''),[date,setDate]=useState(''),[num,setNum]=useState(''),[den,setDen]=useState('1'),[error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    const input=JSON.parse(key) as typeof symbols;
    setLoading(true);setFound([]);setUnavailable([]);setExcluded([]);setConfirmed(false);setAcknowledged(false);setAdjusted(false);
    async function discover() {
      const results:StockSplit[]=[],missing:string[]=[];
      for(let i=0;i<input.length;i+=40) {
        const batch=input.slice(i,i+40);
        try {
          const response=await fetch(`/api/stock-splits?symbols=${encodeURIComponent(batch.map(s=>s.symbol).join(','))}&from=${batch.map(s=>s.from).sort()[0]}`);
          if(!response.ok) throw Error();
          const data=await response.json();
          if(!Array.isArray(data.splits)||!Array.isArray(data.unavailable)) throw Error();
          results.push(...data.splits.filter((s:StockSplit)=>validateStockSplit(s,todayLocal())&&input.some(x=>x.symbol===s.symbol&&s.date>x.from)));
          missing.push(...data.unavailable);
        } catch { missing.push(...batch.map(s=>s.symbol)); }
      }
      if(!cancelled){setFound(results);setUnavailable(missing);setLoading(false);}
    }
    void discover();return()=>{cancelled=true;};
  },[key]);
  const selected=useMemo(()=>found.filter(s=>!excluded.includes(`${s.symbol}:${s.date}`)),[found,excluded]);
  const validBasis=!adjusted || (/^\d{4}-\d{2}-\d{2}$/.test(basisDate)&&basisDate<=todayLocal()&&symbols.every(s=>s.from<=basisDate));
  useEffect(()=>onChange({splits:selected,basisDate:adjusted?basisDate:undefined,ready:!loading&&validBasis&&(!selected.length||confirmed)&&(!unavailable.length||acknowledged)}),[selected,adjusted,basisDate,loading,validBasis,confirmed,unavailable.length,acknowledged,onChange]);
  const add=()=>{
    const split={symbol:symbol.trim().toUpperCase(),date,numerator:Number(num),denominator:Number(den),source:'User confirmed against broker corporate-action notice'};
    if(!validateStockSplit(split,todayLocal())||!symbols.some(s=>s.symbol===split.symbol&&s.from<split.date)||found.some(s=>s.symbol===split.symbol&&s.date===date)){setError(th?'ตรวจสัญลักษณ์ วันที่ และอัตราส่วน หรือรายการนี้มีอยู่แล้ว':'Check symbol, date and ratio; duplicate dates cannot be added.');return;}
    setFound(previous=>[...previous,split]);setConfirmed(false);setManual(false);setError('');
  };
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-border p-3 text-xs text-gray-300">
    <legend className="px-1 font-semibold text-white">{th?'หุ้นแตกพาร์ / รวมพาร์':'Stock splits / reverse splits'}</legend>
    {loading?<p role="status">{th?'กำลังตรวจประวัติแตกพาร์…':'Checking split history…'}</p>:<p>{found.length?(th?'ตรวจวันที่และอัตราส่วนเทียบใบแจ้งโบรกเกอร์ก่อนบันทึก':'Check dates and ratios against your broker notice before applying.'):(th?'ไม่พบเหตุการณ์จากแหล่งราคาที่ตรวจได้ เพิ่มเองได้หากมีใบแจ้งจากโบรกเกอร์':'No events found in available market history. Add an event if your broker reports one.')}</p>}
    {found.map(s=><label key={`${s.symbol}:${s.date}`} className="flex items-start gap-2">
      <input type="checkbox" checked={!excluded.includes(`${s.symbol}:${s.date}`)} onChange={e=>{setExcluded(previous=>e.target.checked?previous.filter(x=>x!==`${s.symbol}:${s.date}`):[...previous,`${s.symbol}:${s.date}`]);setConfirmed(false);}} />
      <span><strong>{s.symbol}</strong> · {s.date} · {s.numerator}:{s.denominator}<span className="block text-gray-400">{th?`${s.denominator} หุ้นเดิม → ${s.numerator} หุ้นใหม่`:`${s.denominator} old shares → ${s.numerator} new shares`}</span></span>
    </label>)}
    {unavailable.length>0&&<label className="flex items-start gap-2 text-amber-200"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)} /><span>{th?`ตรวจประวัติไม่ได้: ${unavailable.join(', ')} — ฉันจะตรวจจากโบรกเกอร์และเพิ่มเหตุการณ์เองหากมี`:`History unavailable: ${unavailable.join(', ')} — I will verify with my broker and add any missing events.`}</span></label>}
    {importing&&<div className="space-y-2"><label className="flex items-start gap-2"><input type="checkbox" checked={adjusted} onChange={e=>{setAdjusted(e.target.checked);setConfirmed(false);}} /><span>{th?'จำนวนและราคาในไฟล์ปรับแตกพาร์มาแล้ว':'The file already contains split-adjusted quantities and prices'}</span></label>{adjusted&&<label className="flex flex-wrap items-center gap-2">{th?'ปรับถึงวันที่':'Adjusted through'}<input aria-label={th?'วันที่ฐานจำนวนหุ้น':'Share basis date'} type="date" max={todayLocal()} value={basisDate} onChange={e=>setBasisDate(e.target.value)} className="rounded border border-border bg-background p-2" /></label>}</div>}
    {selected.length>0&&<label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /><span>{th?'ยืนยันปรับไม้เดิมและรายการขายตามเหตุการณ์ที่เลือก ต้นทุนรวมและเงินสดไม่เปลี่ยน เหตุการณ์ที่เคยบันทึกแล้วจะไม่ทำซ้ำ':'Apply selected events to existing lots and sales. Total invested cost and cash stay unchanged; previously recorded events are skipped.'}</span></label>}
    <button type="button" onClick={()=>setManual(!manual)} className="min-h-9 font-semibold text-primary underline underline-offset-4">{th?'เพิ่มเหตุการณ์จากโบรกเกอร์':'Add broker event'}</button>
    {manual&&<div className="space-y-2"><div className="grid grid-cols-2 gap-2">
      <label>{th?'สัญลักษณ์':'Symbol'}<select value={symbol} onChange={e=>setSymbol(e.target.value)} className="mt-1 w-full rounded border border-border bg-background p-2"><option value="">—</option>{symbols.map(s=><option key={s.symbol}>{s.symbol}</option>)}</select></label>
      <label>{th?'วันที่มีผล':'Effective date'}<input type="date" max={todayLocal()} value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded border border-border bg-background p-2" /></label>
      <label>{th?'หุ้นใหม่':'New shares'}<input type="number" min="1" step="1" value={num} onChange={e=>setNum(e.target.value)} className="mt-1 w-full rounded border border-border bg-background p-2" /></label>
      <label>{th?'หุ้นเดิม':'Old shares'}<input type="number" min="1" step="1" value={den} onChange={e=>setDen(e.target.value)} className="mt-1 w-full rounded border border-border bg-background p-2" /></label>
    </div>{error&&<p role="alert" className="text-red-300">{error}</p>}<button type="button" onClick={add} className="min-h-9 rounded border border-border px-3">{th?'เพิ่ม':'Add'}</button></div>}
  </fieldset>;
}
