"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Calculator, Target, Plus, Check, TrendingUp, AlertTriangle, Info, ShieldAlert, History, Trash2, ArrowRight } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/src/lib/utils';
import { useApp } from '@/src/context/AppContext';
import { supabase } from '@/src/lib/supabase';

export interface DcaEntry {
  id: number;
  price: number;
  amount: number;
  quantity: number;
  active: boolean;
}

export interface TradeSummary {
  id: string;
  symbol: string;
  entriesCount: number;
  avgPrice: number;
  totalQuantity: number;
  sellPrice: number;
  totalBuyFee: number;
  sellFee: number;
  netProfit: number;
  profitPercent: number;
  date: string;
}

interface Props {
  initialSymbol?: string;
  initialPrice?: number;
  marketCurrency?: string;
  signalData?: any;
}

export function DcaOrderSystem({ initialSymbol = '', initialPrice = 0, marketCurrency = 'USD', signalData = null }: Props) {
  const { formatMoney, addAsset, addTrade, currency, exchangeRates, addToast } = useApp();
  const formatVal = (val: number) => formatMoney(val, marketCurrency as any, 1);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [currentMarketPrice, setCurrentMarketPrice] = useState<number>(initialPrice);
  const [manualSellPrice, setManualSellPrice] = useState<string>('');
  
  const defaultEntries: DcaEntry[] = [
    { id: 1, price: 0, amount: 0, quantity: 0, active: true },
    { id: 2, price: 0, amount: 0, quantity: 0, active: false },
    { id: 3, price: 0, amount: 0, quantity: 0, active: false },
    { id: 4, price: 0, amount: 0, quantity: 0, active: false },
  ];

  const [entries, setEntries] = useState<DcaEntry[]>(defaultEntries);

  const [simulatedPrice, setSimulatedPrice] = useState<number>(initialPrice);
  const [journal, setJournal] = useState<TradeSummary[]>([]);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('topbar-price-portal'));
  }, []);

  // User isolation
  const currentSymbolRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(true); // Start true to block auto-save until first load
  const [userId, setUserId] = useState<string | null>(null);
  const [userReady, setUserReady] = useState(false);

  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
    if (initialPrice > 0) {
      setCurrentMarketPrice(initialPrice);
      setSimulatedPrice(initialPrice);
    }
  }, [initialSymbol, initialPrice]);

  // Get current user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getSession();
      setUserId(data?.session?.user?.id || null);
      setUserReady(true);
    };
    getUser();
  }, []);

  // Load drafts from Supabase (per user + symbol) — waits for userReady
  useEffect(() => {
    if (!userReady || !symbol) return;

    const loadDraft = async () => {
      isLoadingRef.current = true;
      currentSymbolRef.current = symbol;

      if (userId) {
        const { data } = await supabase
          .from('dca_drafts')
          .select('entries')
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .maybeSingle();

        if (data?.entries && Array.isArray(data.entries) && data.entries.length > 0) {
          setEntries(data.entries as DcaEntry[]);
        } else {
          setEntries([...defaultEntries]);
        }
      } else {
        const saved = localStorage.getItem(`dca_draft_${symbol}`);
        if (saved) {
          try { setEntries(JSON.parse(saved)); } catch { setEntries([...defaultEntries]); }
        } else {
          setEntries([...defaultEntries]);
        }
      }

      // Allow auto-save after a short delay to let React settle
      setTimeout(() => { isLoadingRef.current = false; }, 200);
    };

    loadDraft();
  }, [symbol, userReady]); // re-run when symbol changes OR user becomes ready

  // Debounced auto-save to Supabase whenever entries change + sync to Portfolio
  useEffect(() => {
    if (!symbol || !userReady || isLoadingRef.current) return;

    // Don't save if all entries are empty defaults
    const hasData = entries.some(e => e.price > 0 || e.amount > 0 || e.quantity > 0);
    if (!hasData) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      // 1. Save DCA draft
      if (userId) {
        await supabase
          .from('dca_drafts')
          .upsert(
            { user_id: userId, symbol, entries, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,symbol' }
          );
      } else {
        localStorage.setItem(`dca_draft_${symbol}`, JSON.stringify(entries));
      }

      // 2. Auto-sync active entries to Portfolio as a holding
      const filledEntries = entries.filter(e => e.active && e.price > 0 && e.quantity > 0);
      if (filledEntries.length > 0 && symbol) {
        const totalQty = filledEntries.reduce((s, e) => s + e.quantity, 0);
        const totalAmt = filledEntries.reduce((s, e) => s + e.amount, 0);
        const avgCost = totalQty > 0 ? totalAmt / totalQty : 0;
        const mktPrice = currentMarketPrice || avgCost;
        const isThaiAsset = symbol.toUpperCase().endsWith('.BK') || symbol.toUpperCase().endsWith('.TH');
        const CRYPTO = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'];
        const autoAllocation = CRYPTO.includes(symbol.toUpperCase()) ? 'Alternatives'
          : isThaiAsset ? 'Equities' : 'Equities';

        addAsset({
          name: symbol,
          symbol: symbol,
          valueUSD: mktPrice * totalQty,
          change: mktPrice > 0 && avgCost > 0 ? ((mktPrice - avgCost) / avgCost) * 100 : 0,
          allocation: autoAllocation,
          shares: totalQty,
          avgCost: avgCost,
          currentPrice: mktPrice,
        });
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [entries, symbol]);

  useEffect(() => {
    const fetchJournal = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        // Fallback to localStorage if not logged in
        const saved = localStorage.getItem('dca_journal');
        if (saved) { try { setJournal(JSON.parse(saved)); } catch (e) {} }
        return;
      }
      
      const { data, error } = await supabase
        .from('trade_journal')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'CLOSED')
        .order('closed_at', { ascending: false });
        
      if (data && data.length > 0) {
        setJournal(data.map(d => {
          const tQty = d.entries ? d.entries.reduce((acc: number, e: any) => acc + (e.quantity || 0), 0) : 0;
          const totalInv = d.avg_entry * tQty;
          return {
            id: d.id,
            symbol: d.symbol,
            entriesCount: d.entries ? d.entries.length : 0,
            avgPrice: d.avg_entry || 0,
            totalQuantity: tQty,
            sellPrice: d.take_profits && d.take_profits.length > 0 ? d.take_profits[0].price : 0,
            totalBuyFee: 0,
            sellFee: 0,
            netProfit: d.total_pnl,
            profitPercent: totalInv > 0 ? (d.total_pnl / totalInv) * 100 : 0,
            date: d.closed_at,
          };
        }));
      }
    };
    fetchJournal();
  }, []);

  const handleEntryChange = (id: number, field: 'price' | 'amount' | 'quantity', value: number) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const newEntry = { ...e, [field]: value };
      
      if (field === 'price') {
        if (newEntry.amount > 0) newEntry.quantity = value > 0 ? newEntry.amount / value : 0;
        else if (newEntry.quantity > 0) newEntry.amount = newEntry.quantity * value;
      } else if (field === 'amount') {
        newEntry.quantity = newEntry.price > 0 ? value / newEntry.price : 0;
      } else if (field === 'quantity') {
        newEntry.amount = value * newEntry.price;
      }
      return newEntry;
    }));
  };

  const toggleEntry = (id: number) => {
    setEntries(prev => {
      const isActivating = !prev.find(e => e.id === id)?.active;
      return prev.map(e => {
        if (e.id === id) {
          if (isActivating && e.price === 0 && prev[0].price > 0) {
             // Auto-suggest logic if activating empty entry
             const p1 = prev[0].price;
             const a1 = prev[0].amount;
             let newPrice = e.price;
             let newAmt = e.amount;
             if (id === 2) { newPrice = p1 * 0.98; newAmt = a1 * 1.5; }
             if (id === 3) { newPrice = p1 * 0.955; newAmt = a1 * 2; }
             if (id === 4) { newPrice = p1 * 0.925; newAmt = a1 * 3; }
             const newQty = newPrice > 0 ? newAmt / newPrice : 0;
             return { ...e, active: true, price: +newPrice.toFixed(4), amount: +newAmt.toFixed(2), quantity: +newQty.toFixed(5) };
          }
          return { ...e, active: !e.active };
        }
        return e;
      });
    });
  };

  const activeEntries = entries.filter(e => e.active && e.price > 0 && (e.amount > 0 || e.quantity > 0));
  const totalQuantity = activeEntries.reduce((sum, e) => sum + e.quantity, 0);
  const totalInvestment = activeEntries.reduce((sum, e) => sum + e.amount, 0);
  const totalBuyFee = 0; // Fee removed as requested
  const avgEntryPrice = totalQuantity > 0 ? totalInvestment / totalQuantity : 0;
  const breakEvenPrice = avgEntryPrice; // Fee removed

  // Live P&L based on current market price
  const effectiveSellPrice = manualSellPrice !== '' ? Number(manualSellPrice) : currentMarketPrice;

  const grossValue = effectiveSellPrice * totalQuantity;
  const currentSellFee = 0; // Fee removed
  const netPnL = grossValue - totalInvestment;
  const pnlPercent = totalInvestment > 0 ? (netPnL / totalInvestment) * 100 : 0;

  // Simulator P&L
  const simGrossValue = simulatedPrice * totalQuantity;
  const simSellFee = 0; // Fee removed
  const simNetPnL = simGrossValue - totalInvestment;
  const simPnlPercent = totalInvestment > 0 ? (simNetPnL / totalInvestment) * 100 : 0;

  const getAdvisoryMessage = () => {
    if (activeEntries.length === 0) return { text: "กรุณาระบุข้อมูลไม้ 1 เพื่อเริ่มคำนวณ", color: "text-gray-400" };
    if (pnlPercent > 0.2) return { text: "✅ ผ่าน break-even แล้ว กำลังทำกำไร พิจารณา take profit", color: "text-[#4EDEA3]" };
    if (pnlPercent > 0) return { text: "📊 ใกล้คืนทุน รออีกนิด ให้ผ่าน break-even ก่อนขาย", color: "text-[#E9C349]" };
    if (pnlPercent > -1) return { text: "💡 ราคาอ่อนตัว ถ้ามีแผน DCA พิจารณาเปิดไม้ 2", color: "text-[#ADC6FF]" };
    if (pnlPercent > -2) return { text: "💡 ราคาลงมาถึงโซนไม้ 2 เพิ่มไม้เพื่อลดต้นทุนเฉลี่ย", color: "text-[#ADC6FF]" };
    if (pnlPercent > -4) return { text: "💡 โซนไม้ 3 การเพิ่มไม้จะดึงราคาเฉลี่ยลงมาได้มาก", color: "text-[#FFB4AB]" };
    if (activeEntries.length === 4) return { text: "⏳ โซนไม้สุดท้ายแล้ว (ใช้เต็ม 4 ไม้) ถือไว้อย่างใจเย็น ราคาเฉลี่ยของคุณต่ำกว่าตลาดมาก", color: "text-purple-400" };
    return { text: "⏳ โซนไม้ 4 (ไม้สุดท้าย) เพิ่มน้ำหนักเพื่อลดเฉลี่ย รอราคากลับ", color: "text-[#FFB4AB]" };
  };

  const advisory = getAdvisoryMessage();

  const closeTrade = async () => {
    if (activeEntries.length === 0) return;
    
    let newTradeId = Math.random().toString(36).substr(2, 9);
    const sym = symbol || 'UNKNOWN';
    const now = new Date().toISOString();
    
    // 1. Save to trade_journal (Supabase)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (user) {
        const { data } = await supabase.from('trade_journal').insert({
          user_id: user.id,
          symbol: sym,
          market: sym.endsWith('.BK') || sym.endsWith('.TH') ? 'SET' : 'US',
          timeframe: 'DAY',
          status: 'CLOSED',
          entries: activeEntries.map(e => ({
            level: e.id, price: e.price, amount: e.amount, quantity: e.quantity, filled_at: now
          })),
          take_profits: [{ price: effectiveSellPrice, hit_at: now }],
          avg_entry: avgEntryPrice,
          total_pnl: netPnL,
          signal_data: signalData,
          notes: `Closed from DcaOrderSystem`,
          opened_at: now,
          closed_at: now,
        }).select().single();
        if (data) newTradeId = data.id;
      }
    } catch (e) {
      console.error('Failed to save to Supabase', e);
    }

    // 2. Record BUY trades per entry → Portfolio P/L tracking
    for (const entry of activeEntries) {
      addTrade({
        asset: sym,
        type: 'BUY',
        amountUSD: entry.amount,
        date: now,
        rateAtTime: exchangeRates[currency] || 1,
        currency: currency,
        shares: entry.quantity,
        pricePerUnit: entry.price,
      });
    }

    // 3. Record single SELL trade at market price
    addTrade({
      asset: sym,
      type: 'SELL',
      amountUSD: effectiveSellPrice * totalQuantity,
      date: now,
      rateAtTime: exchangeRates[currency] || 1,
      currency: currency,
      shares: totalQuantity,
      pricePerUnit: effectiveSellPrice,
    });
    
    const trade: TradeSummary = {
      id: newTradeId,
      symbol: sym,
      entriesCount: activeEntries.length,
      avgPrice: avgEntryPrice,
      totalQuantity,
      sellPrice: effectiveSellPrice,
      totalBuyFee,
      sellFee: currentSellFee,
      netProfit: netPnL,
      profitPercent: pnlPercent,
      date: now,
    };
    
    setJournal(prev => [trade, ...prev]);
    
    addToast(`บันทึกการขายเรียบร้อย! กำไรสุทธิ: ${netPnL >= 0 ? '+' : ''}${formatVal(netPnL)}`, netPnL >= 0 ? 'success' : 'warning');

    // 4. Clear saved draft from Supabase and reset
    if (userId && symbol) {
      supabase.from('dca_drafts').delete().eq('user_id', userId).eq('symbol', symbol).then(() => {});
    }
    localStorage.removeItem(`dca_draft_${symbol}`);
    
    // Reset entries — block auto-save during reset
    isLoadingRef.current = true;
    setEntries([...defaultEntries]);
    setTimeout(() => { isLoadingRef.current = false; }, 100);
  };

  const deleteJournal = async (id: string) => {
    setJournal(prev => prev.filter(j => j.id !== id));
    try {
      await supabase.from('trade_journal').delete().eq('id', id);
    } catch (e) {}
  };

  return (
    <div className="space-y-6">
      
      {/* TopBar Portal for Price */}
      {portalTarget ? createPortal(
        <div className="flex items-center gap-4 bg-white/5 border border-border rounded-full px-4 py-1.5 ml-2 hover:bg-white/10 transition-colors">
           <div className="flex items-center gap-2">
             <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest hidden sm:inline">Asset</span>
             <span className="text-xs font-black text-white">{symbol || "NO SYMBOL"}</span>
           </div>
           <div className="w-px h-3 bg-white/10"></div>
           <div className="flex items-center gap-2">
             <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest hidden sm:inline">MKT</span>
             <span className="text-xs font-black text-[#4EDEA3]">{formatVal(currentMarketPrice)}</span>
           </div>
        </div>,
        portalTarget
      ) : (
        <div className="bg-gradient-to-r from-[#1C1B1B] to-black rounded-3xl p-6 border border-border flex justify-between items-center sticky top-4 z-50 shadow-2xl shadow-black/50 backdrop-blur-xl">
           <div>
             <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Trading Asset</p>
             <h2 className="text-3xl font-black text-white tracking-tighter leading-none">{symbol || "NO SYMBOL"}</h2>
           </div>
           <div className="text-right">
             <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Current Market Price</p>
             <h2 className="text-3xl font-black text-[#4EDEA3] leading-none">{formatVal(currentMarketPrice)}</h2>
           </div>
        </div>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Col: Entries */}
        <div className="xl:col-span-1 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-white flex items-center gap-2"><Target size={18} className="text-[#ADC6FF]" /> ไม้เข้าซื้อ (DCA Entries)</h3>
            <span className="text-xs font-bold text-gray-500 bg-white/5 px-2 py-1 rounded">ใช้ไม้ไปแล้ว {activeEntries.length}/4</span>
          </div>
          
          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <div key={entry.id} className={cn(
                "rounded-2xl p-4 border transition-all",
                entry.active ? "bg-surface border-border" : "bg-black/20 border-dashed border-border opacity-50"
              )}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-black", 
                      entry.active ? "bg-[#ADC6FF] text-[#00285d]" : "bg-white/10 text-gray-500"
                    )}>
                      {entry.id}
                    </div>
                    <span className="font-bold text-sm text-white">ไม้ {entry.id} {idx === 0 ? '(แรก)' : '(ถัว)'}</span>
                  </div>
                  {idx > 0 && (
                    <button 
                      onClick={() => toggleEntry(entry.id)}
                      className="text-xs font-bold px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      {entry.active ? 'ยกเลิกไม้' : '+ เพิ่มไม้'}
                    </button>
                  )}
                </div>

                {entry.active && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">ราคา (Price)</label>
                      <input 
                        type="number" step="any"
                        value={entry.price || ''} onChange={e => handleEntryChange(entry.id, 'price', +e.target.value)}
                        className="w-full bg-black/40 border border-border rounded-lg px-3 py-2 text-white font-bold text-sm outline-none focus:border-[#ADC6FF]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">จำนวนหุ้น (Qty)</label>
                      <input 
                        type="number" step="any"
                        value={entry.quantity || ''} onChange={e => handleEntryChange(entry.id, 'quantity', +e.target.value)}
                        className="w-full bg-black/40 border border-border rounded-lg px-3 py-2 text-white font-bold text-sm outline-none focus:border-[#ADC6FF]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">จำนวนเงิน (Amount)</label>
                      <input 
                        type="number" step="any"
                        value={entry.amount || ''} onChange={e => handleEntryChange(entry.id, 'amount', +e.target.value)}
                        className="w-full bg-black/40 border border-border rounded-lg px-3 py-2 text-white font-bold text-sm outline-none focus:border-[#ADC6FF]"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Donut Chart */}
          {activeEntries.length > 0 && (
            <div className="bg-surface rounded-2xl p-5 border border-border mt-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-24 bg-[#4EDEA3]/5 rounded-full blur-[80px] pointer-events-none" />
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2 relative z-10">
                <Target size={12} className="text-[#ADC6FF]" /> สัดส่วนการลงทุน
              </h4>
              <div className="h-48 w-full relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={activeEntries}
                      dataKey="amount"
                      nameKey="id"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      stroke="none"
                      paddingAngle={5}
                    >
                      {activeEntries.map((entry, i) => {
                        const opacities = [1, 0.7, 0.4, 0.2];
                        return <Cell key={`cell-${i}`} fill="#ADC6FF" fillOpacity={opacities[i % opacities.length]} />;
                      })}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#131313', borderColor: '#ffffff10', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff', fontWeight: '900' }}
                      formatter={(value: any) => [formatVal(typeof value === 'number' ? value : 0), 'ลงทุนไป']}
                      labelFormatter={(label) => `ไม้ ${label}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Price Ladder + Summary */}
        <div className="xl:col-span-2 space-y-6">

          {/* Visual Price Ladder (#11) */}
          {activeEntries.length > 0 && currentMarketPrice > 0 && (
            <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-border relative overflow-hidden">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2 relative z-10">
                <Target size={12} className="text-[#ADC6FF]" /> Price Ladder
              </h4>
              <div className="relative h-48 sm:h-56">
                {(() => {
                  const prices = activeEntries.filter(e => e.price > 0).map(e => e.price);
                  if (prices.length === 0) return <div className="text-xs text-gray-600 text-center py-8">Set entry prices to see ladder</div>;
                  
                  const allPrices = [...prices, currentMarketPrice, avgEntryPrice, breakEvenPrice].filter(p => p > 0);
                  const maxP = Math.max(...allPrices) * 1.05;
                  const minP = Math.min(...allPrices) * 0.95;
                  const range = maxP - minP || 1;
                  const getY = (price: number) => ((maxP - price) / range) * 100;
                  
                  const mktY = getY(currentMarketPrice);
                  const pathString = `M0,${mktY+15} Q25,${mktY-10} 50,${mktY+5} T100,${mktY}`;

                  return (
                    <div className="relative w-full h-full">
                      {/* Color coded zones */}
                      {avgEntryPrice > 0 && (
                        <>
                          {/* Green zone above avg */}
                          <div className="absolute left-12 right-0 bg-gradient-to-b from-[#4EDEA3]/5 to-transparent z-0" style={{ top: 0, bottom: `${100 - getY(avgEntryPrice)}%` }}></div>
                          {/* Red zone below avg */}
                          <div className="absolute left-12 right-0 bg-gradient-to-t from-[#FFB4AB]/5 to-transparent z-0" style={{ top: `${getY(avgEntryPrice)}%`, bottom: 0 }}></div>
                        </>
                      )}

                      {/* Mini-chart background */}
                      <svg className="absolute left-12 right-0 w-[calc(100%-3rem)] h-full opacity-30 pointer-events-none z-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                        <defs>
                          <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4EDEA3" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#4EDEA3" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d={`${pathString} L100,100 L0,100 Z`} fill="url(#chart-grad)" />
                        <path d={pathString} fill="none" stroke="#4EDEA3" strokeWidth="0.5" strokeDasharray="4 2" />
                      </svg>

                      {/* Grid lines */}
                      {[0, 25, 50, 75, 100].map(pct => (
                        <div key={pct} className="absolute left-12 right-0 border-t border-border z-10" style={{ top: `${pct}%` }}>
                          <span className="absolute -left-12 -top-2 text-[8px] font-medium text-gray-500 w-10 text-right">
                            {formatVal(maxP - (pct / 100) * range)}
                          </span>
                        </div>
                      ))}

                      {/* Current market price line */}
                      <div className="absolute left-12 right-0 border-t-2 border-dashed border-[#4EDEA3]/50 z-20 flex items-center" style={{ top: `${getY(currentMarketPrice)}%` }}>
                        <div className="absolute -left-1.5 w-3 h-3 bg-[#4EDEA3] rounded-full animate-ping opacity-75"></div>
                        <div className="absolute -left-1 w-2 h-2 bg-[#4EDEA3] rounded-full shadow-[0_0_8px_#4EDEA3]"></div>
                        <span className="absolute right-0 top-0 -translate-y-1/2 text-[9px] font-black text-[#4EDEA3] bg-[#4EDEA3]/10 px-2 py-0.5 rounded-full backdrop-blur-sm shadow-sm border border-[#4EDEA3]/20">
                          MKT {formatVal(currentMarketPrice)}
                        </span>
                      </div>

                      {/* Average entry price line */}
                      {avgEntryPrice > 0 && (
                        <div className="absolute left-12 right-0 border-t border-dashed border-[#ADC6FF]/60 z-20" style={{ top: `${getY(avgEntryPrice)}%` }}>
                          <span className="absolute left-32 top-0 -translate-y-1/2 text-[9px] font-black text-[#ADC6FF] bg-[#ADC6FF]/10 px-2 py-0.5 rounded-full backdrop-blur-sm border border-[#ADC6FF]/20 shadow-sm">
                            AVG {formatVal(avgEntryPrice)}
                          </span>
                        </div>
                      )}

                      {/* Break-even line */}
                      {breakEvenPrice > 0 && breakEvenPrice !== avgEntryPrice && (
                        <div className="absolute left-12 right-0 border-t border-dotted border-[#E9C349]/60 z-20" style={{ top: `${getY(breakEvenPrice)}%` }}>
                          <span className="absolute left-48 top-0 -translate-y-1/2 text-[9px] font-black text-[#E9C349] bg-[#E9C349]/10 px-2 py-0.5 rounded-full backdrop-blur-sm border border-[#E9C349]/20 shadow-sm">
                            BE {formatVal(breakEvenPrice)}
                          </span>
                        </div>
                      )}

                      {/* Entry dots */}
                      {activeEntries.filter(e => e.price > 0).map((entry, i) => {
                        const yPos = getY(entry.price);
                        const color = '#ffffff'; // Unified color for all entries
                        return (
                          <div key={entry.id} className="absolute left-12 right-0 z-30" style={{ top: `${yPos}%` }}>
                            <div className="absolute -left-1.5 -top-2.5 flex items-center gap-2">
                              {/* Centered Circle */}
                              <div className="w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center text-[9px] font-black shadow-lg" style={{ borderColor: `${color}80`, color, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                                <span className="leading-none pt-[1px]">{entry.id}</span>
                              </div>
                              <div className="h-px flex-1 opacity-20" style={{ backgroundColor: color }} />
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm text-white bg-white/10 backdrop-blur-sm border border-white/20">
                                {formatVal(entry.price)} × {Number(entry.quantity).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          
          {/* Average Info Card */}
          <div className="bg-gradient-to-br from-[#1C1B1B] to-black rounded-3xl p-6 border border-border relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-[#ADC6FF]/5 rounded-full blur-[100px] pointer-events-none" />
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 relative z-10">
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">ราคาเฉลี่ย (Avg Cost)</p>
                <p className="text-2xl font-black text-white">{formatVal(avgEntryPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-[#4EDEA3] uppercase mb-1">Break-Even Point</p>
                <p className="text-2xl font-black text-[#4EDEA3]">{formatVal(breakEvenPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">ต้นทุนรวม (Total Cost)</p>
                <p className="text-xl font-bold text-white">{formatVal(totalInvestment)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">จำนวนรวม (Total Qty)</p>
                <p className="text-xl font-bold text-white">{totalQuantity.toLocaleString(undefined, { maximumFractionDigits: 5 })}</p>
              </div>
            </div>

            {/* Advisory */}
            <div className="bg-black/40 rounded-xl p-4 border border-border mb-6 flex items-start gap-3 relative z-10">
              <Info className={cn("shrink-0 mt-0.5", advisory.color)} size={18} />
              <div>
                <p className="text-xs font-black text-gray-400 mb-1">Day Trader Assistant:</p>
                <p className={cn("text-sm font-bold", advisory.color)}>{advisory.text}</p>
              </div>
            </div>

            {/* Live Status Card */}
            <div className={cn(
              "rounded-2xl p-6 border relative z-10 transition-colors duration-500",
              effectiveSellPrice > breakEvenPrice ? "bg-[#4EDEA3]/10 border-[#4EDEA3]/30" : 
              effectiveSellPrice > avgEntryPrice ? "bg-[#E9C349]/10 border-[#E9C349]/30" : 
              "bg-[#FFB4AB]/10 border-[#FFB4AB]/30"
            )}>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-black text-white">Live P&L สถานะปัจจุบัน</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400">MKT Price: {formatVal(currentMarketPrice)}</span>
                  {effectiveSellPrice > breakEvenPrice ? 
                    <span className="text-xs font-black bg-[#4EDEA3] text-black px-2 py-1 rounded-full flex items-center gap-1"><Check size={12}/> กำลังทำกำไร</span> :
                    effectiveSellPrice > avgEntryPrice ?
                    <span className="text-xs font-black bg-[#E9C349] text-black px-2 py-1 rounded-full">รอคืนทุนค่า Fee</span> :
                    <span className="text-xs font-black bg-[#FFB4AB] text-black px-2 py-1 rounded-full">ขาดทุนชั่วคราว</span>
                  }
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mb-4 items-end">
                <div className="w-full sm:w-1/2">
                  <label className="text-[10px] font-black text-gray-500 uppercase mb-1 block">ราคาที่ขายได้จริง (Manual Sell Price)</label>
                  <input 
                    type="number" step="any"
                    placeholder={currentMarketPrice.toString()}
                    value={manualSellPrice} 
                    onChange={e => setManualSellPrice(e.target.value)}
                    className="w-full bg-black/60 border border-[#ADC6FF]/30 rounded-xl px-4 py-3 text-white font-black text-xl outline-none focus:border-[#ADC6FF] transition-colors"
                  />
                </div>
                <div className="w-full sm:w-1/2">
                  <div className="flex items-baseline gap-3">
                    <span className={cn("text-4xl font-black", netPnL >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                      {netPnL >= 0 ? '+' : ''}{formatVal(netPnL)}
                    </span>
                    <span className={cn("text-lg font-bold", netPnL >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                      ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={closeTrade}
                disabled={activeEntries.length === 0}
                className="w-full py-3 rounded-xl bg-white text-black font-black uppercase text-xs hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg"
              >
                <Check size={16} /> ยืนยันปิดออเดอร์ทำกำไร
              </button>
            </div>
          </div>

          {/* Target Table */}
          <div className="bg-surface rounded-3xl p-6 border border-border">
            <h3 className="font-black text-white flex items-center gap-2 mb-4"><Calculator size={18} className="text-[#ADC6FF]" /> แผนทำกำไร (Targets by Avg Price)</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 text-[10px] font-black text-gray-500 uppercase">ระดับ (Level)</th>
                    <th className="p-3 text-[10px] font-black text-gray-500 uppercase">% จากทุนเฉลี่ย</th>
                    <th className="p-3 text-[10px] font-black text-gray-500 uppercase">ราคาเป้าหมาย</th>
                    <th className="p-3 text-[10px] font-black text-gray-500 uppercase text-right">กำไรสุทธิ</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Break-even (คืนทุน)', pct: 0.2, color: 'text-gray-400' },
                    { label: 'Scalp (สั้นๆ)', pct: 0.5, color: 'text-[#ADC6FF]' },
                    { label: 'เป้าหมาย 1 (Target 1)', pct: 1.0, color: 'text-[#4EDEA3]' },
                    { label: 'เป้าหมาย 2 (Target 2)', pct: 2.0, color: 'text-[#4EDEA3]' },
                    { label: 'เป้าหมาย 3 (Target 3)', pct: 3.0, color: 'text-[#4EDEA3]' },
                  ].map((t, i) => {
                    const targetPrice = avgEntryPrice * (1 + t.pct / 100);
                    const gross = targetPrice * totalQuantity;
                    const net = gross - totalInvestment;
                    return (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-white/5">
                        <td className="p-3 text-xs font-bold text-white">{t.label}</td>
                        <td className={cn("p-3 text-xs font-black", t.color)}>+{t.pct}%</td>
                        <td className="p-3 text-sm font-black text-white">{formatVal(targetPrice)}</td>
                        <td className={cn("p-3 text-sm font-black text-right", net > 0 ? "text-[#4EDEA3]" : "text-gray-500")}>
                          {net > 0 ? '+' : ''}{formatVal(net)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recovery Simulator */}
          <div className="bg-surface rounded-3xl p-6 border border-border">
             <h3 className="font-black text-white flex items-center gap-2 mb-4"><TrendingUp size={18} className="text-[#E9C349]" /> Recovery Simulator (จำลองกำไรหากราคากลับมา)</h3>
             
             <div className="flex flex-col sm:flex-row gap-4 items-center">
               <div className="flex-1 w-full">
                 <label className="text-[10px] font-black text-gray-500 uppercase mb-2 block">ระบุราคาเป้าหมายที่คาดว่าจะกลับไป</label>
                 <div className="relative">
                    <input 
                      type="number" step="any"
                      value={simulatedPrice || ''} onChange={e => setSimulatedPrice(+e.target.value)}
                      className="w-full bg-black/40 border border-border rounded-xl px-4 py-3 text-[#E9C349] font-black text-xl outline-none focus:border-[#E9C349]"
                   />
                 </div>
               </div>
               
               <ArrowRight className="hidden sm:block text-gray-600 rotate-90 sm:rotate-0" size={24} />

               <div className="flex-1 w-full bg-black/20 rounded-xl p-4 border border-border">
                  <div className="text-[10px] font-black text-gray-500 uppercase mb-1">ผลลัพธ์ (Net Profit)</div>
                  <div className={cn("text-2xl font-black", simNetPnL >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {simNetPnL >= 0 ? '+' : ''}{formatVal(simNetPnL)}
                  </div>
                  <div className="text-xs font-bold text-gray-400 mt-1">
                    คิดเป็น {simPnlPercent >= 0 ? '+' : ''}{simPnlPercent.toFixed(2)}% จากทุน {formatVal(totalInvestment)}
                  </div>
               </div>
             </div>

             {entries[0].price > 0 && avgEntryPrice < entries[0].price && (
               <div className="mt-4 p-3 rounded-lg bg-[#E9C349]/10 text-[#E9C349] border border-[#E9C349]/20 text-xs font-bold flex items-start gap-2">
                 <Info size={16} className="shrink-0" />
                 <p>ราคาเฉลี่ยของคุณ ({formatVal(avgEntryPrice)}) ต่ำกว่าไม้แรก ({formatVal(entries[0].price)}) อยู่ {((entries[0].price - avgEntryPrice)/entries[0].price * 100).toFixed(1)}% ดังนั้นแม้ราคายังไม่กลับไปจุดเดิม คุณก็สามารถทำกำไรได้เมื่อราคาผ่าน {formatVal(breakEvenPrice)}</p>
               </div>
             )}
          </div>

        </div>
      </div>

      {/* Trade Journal Section */}
      {journal.length > 0 && (
        <div className="space-y-6 mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Analytics Cards */}
            {(() => {
              const totalTrades = journal.length;
              const winningTrades = journal.filter(t => t.netProfit >= 0).length;
              const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
              const totalJournalPnL = journal.reduce((sum, t) => sum + t.netProfit, 0);
              return (
                <>
                  <div className="bg-gradient-to-br from-[#1C1B1B] to-black p-6 rounded-3xl border border-border relative overflow-hidden">
                     <p className="text-[10px] font-black text-gray-500 uppercase mb-2 relative z-10">Win Rate</p>
                     <p className="text-4xl font-black text-white relative z-10">{winRate.toFixed(0)}%</p>
                     <p className="text-xs text-gray-500 font-bold mt-2 relative z-10">ชนะ {winningTrades} จาก {totalTrades} เทรด</p>
                  </div>
                  <div className="bg-gradient-to-br from-[#1C1B1B] to-black p-6 rounded-3xl border border-border relative overflow-hidden">
                     <p className="text-[10px] font-black text-gray-500 uppercase mb-2 relative z-10">Total Net P&L</p>
                     <p className={cn("text-4xl font-black relative z-10", totalJournalPnL >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                       {totalJournalPnL >= 0 ? '+' : ''}{formatVal(totalJournalPnL)}
                     </p>
                  </div>
                  <div className="bg-gradient-to-br from-[#1C1B1B] to-black p-6 rounded-3xl border border-border relative overflow-hidden">
                     <p className="text-[10px] font-black text-gray-500 uppercase mb-2 relative z-10">Total Trades</p>
                     <p className="text-4xl font-black text-white relative z-10">{totalTrades}</p>
                     <p className="text-xs text-gray-500 font-bold mt-2 relative z-10">ออเดอร์ทั้งหมด</p>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="bg-surface rounded-3xl p-6 border border-border">
            <h3 className="font-black text-white flex items-center gap-2 mb-4"><History size={18} className="text-[#ADC6FF]" /> ประวัติการเทรด (Trade Journal)</h3>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] font-black text-gray-500 uppercase">
                  <th className="p-3">วันที่ (Date)</th>
                  <th className="p-3">Symbol</th>
                  <th className="p-3">จำนวนไม้</th>
                  <th className="p-3">ทุนเฉลี่ย</th>
                  <th className="p-3">ราคาขาย</th>
                  <th className="p-3 text-right">กำไรสุทธิ</th>
                  <th className="p-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {journal.map(trade => (
                  <tr key={trade.id} className="border-b border-border hover:bg-white/5">
                    <td className="p-3 text-xs text-gray-400">{new Date(trade.date).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="p-3 font-black text-white">{trade.symbol}</td>
                    <td className="p-3 text-xs font-bold text-gray-400">{trade.entriesCount}/4 ไม้</td>
                    <td className="p-3 text-xs font-bold text-white">{formatVal(trade.avgPrice)}</td>
                    <td className="p-3 text-xs font-bold text-white">{formatVal(trade.sellPrice)}</td>
                    <td className="p-3 text-right">
                      <div className={cn("text-sm font-black", trade.netProfit >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                        {trade.netProfit >= 0 ? '+' : ''}{formatVal(trade.netProfit)}
                      </div>
                      <div className="text-[10px] font-bold text-gray-500">
                        {trade.profitPercent >= 0 ? '+' : ''}{trade.profitPercent.toFixed(2)}%
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => deleteJournal(trade.id)} className="text-gray-500 hover:text-[#FFB4AB] transition-colors p-1">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

    </div>
  );
}
