"use client";

import { Layers3 } from "lucide-react";

type Level = { price: number; label: string; color: string };
export function PriceLadder({ entries, market, average, analysis, format, rate }: {
  entries: { id: number; price: number; quantity: number }[]; market: number; average: number;
  analysis?: { supports?: { price: number }[]; resistances?: { price: number }[]; ath?: number; ohlcv?: { high: number }[] };
  format: (value: number) => string; rate: number;
}) {
  const levels: Level[] = entries.map((entry, index) => ({ price: entry.price, label: `ไม้ ${index + 1} · ${entry.quantity} หน่วย`, color: '#E2E2E8' }));
  levels.push({ price: market, label: 'MKT', color: '#4EDEA3' }, { price: average, label: 'AVG', color: '#ADC6FF' });
  analysis?.supports?.forEach((level, i) => levels.push({ price: level.price / rate, label: `แนวรับ S${i + 1}`, color: '#4EDEA3' }));
  analysis?.resistances?.forEach((level, i) => levels.push({ price: level.price / rate, label: `แนวต้าน R${i + 1}`, color: '#FFB4AB' }));
  const ath = Number(analysis?.ath);
  const periodHigh = Math.max(0, ...(analysis?.ohlcv || []).map(c => Number(c.high) || 0));
  if (ath > 0) levels.push({ price: ath / rate, label: 'ATH', color: '#E9C349' });
  else if (periodHigh > 0) levels.push({ price: periodHigh / rate, label: 'สูงสุดในช่วงข้อมูล (ไม่ใช่ ATH)', color: '#E9C349' });
  const sorted = levels.filter(l => Number.isFinite(l.price) && l.price > 0).sort((a, b) => b.price - a.price);
  if (!sorted.length) return null;
  const max = sorted[0].price, min = sorted[sorted.length - 1].price;
  const span = Math.max(max - min, max * .02);
  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#182322] via-[#171a1f] to-[#151619]">
    <div className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="flex items-center gap-2"><span className="rounded-lg bg-[#ADC6FF]/10 p-2 text-[#ADC6FF]"><Layers3 size={15} /></span><span><span className="block text-xs font-bold text-white">Price Ladder</span><span className="text-[10px] text-gray-500">{sorted.length} ระดับ · ทุกไม้ / AVG / แนวรับ–ต้าน</span></span></span>
    </div>
    <div className="border-t border-white/5 px-4 py-2" role="list" aria-label="ระดับราคา เรียงจากสูงไปต่ำ">
      {sorted.map((level, index) => {
        const position = Math.max(0, Math.min(100, (level.price - min) / span * 100));
        return <div key={`${level.label}-${index}`} role="listitem" className="grid min-h-8 grid-cols-[minmax(100px,1fr)_minmax(40px,1.2fr)_auto] items-center gap-3 border-b border-white/[0.035] last:border-0">
          <span className="flex items-center gap-2 text-[11px]" style={{ color: level.color }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: level.color }} />{level.label}</span>
          <div className="relative h-1 rounded-full bg-white/5"><div className="h-1 rounded-full opacity-40" style={{ width: `${Math.max(2, position)}%`, background: level.color }} /><span className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${position}%`, background: level.color }} /></div>
          <span className="min-w-[76px] text-right text-xs font-bold tabular-nums" style={{ color: level.color }}>{format(level.price)}</span>
        </div>;
      })}
    </div>
    <p className="px-4 py-2 text-[10px] text-gray-500">{!ath ? 'ยังไม่มี ATH · ใช้จุดสูงสุดในช่วงข้อมูล' : 'ATH ตามประวัติผู้ให้บริการ'} · แถบแสดงตำแหน่งราคา ไม่ใช่กราฟย้อนหลัง</p>
  </section>;
}
