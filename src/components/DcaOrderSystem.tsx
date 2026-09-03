"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Calculator, Target, Plus, Check, TrendingUp, AlertTriangle, Info, ShieldAlert, History, Trash2, ArrowRight, X, CircleDollarSign } from 'lucide-react';
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
  /** The input the trader supplied directly; the other value is calculated. */
  calculationBasis?: 'amount' | 'quantity';
}

const createDefaultEntries = (): DcaEntry[] => [
  { id: 1, price: 0, amount: 0, quantity: 0, active: true },
];

const normalizeDcaEntries = (rawEntries: unknown): DcaEntry[] => {
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) return createDefaultEntries();

  const entries = rawEntries.map((entry: any, index) => ({
    id: Number.isFinite(Number(entry?.id)) ? Number(entry.id) : index + 1,
    price: Number(entry?.price) || 0,
    amount: Number(entry?.amount) || 0,
    quantity: Number(entry?.quantity) || 0,
    active: entry?.active !== false,
    calculationBasis: entry?.calculationBasis === 'amount' || entry?.calculationBasis === 'quantity'
      ? entry.calculationBasis
      : undefined,
  }));

  // Older drafts could retain only closed lots after a completed order.  Such a
  // draft must not leave the first DCA card without Price / Qty / Amount inputs.
  return entries.some(entry => entry.active) ? entries : createDefaultEntries();
};

interface PartialExit {
  id: string;
  entryId: number;
  quantity: number;
  price: number;
  pnl: number;
  closedAt: string;
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
  compact?: boolean;
  onClose?: () => void;
}

export function DcaOrderSystem({ initialSymbol = '', initialPrice = 0, marketCurrency = 'USD', signalData = null, compact = false, onClose }: Props) {
  const { formatMoney, addTrade, currency, exchangeRates, addToast, assets, trades, updateAsset, syncDcaPosition, activePortfolioId } = useApp();
  const formatVal = (val: number) => formatMoney(val, marketCurrency as any, 1);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [currentMarketPrice, setCurrentMarketPrice] = useState<number>(initialPrice);
  const [manualSellPrice, setManualSellPrice] = useState<string>('');
  
  const [entries, setEntries] = useState<DcaEntry[]>(createDefaultEntries);

  const [simulatedPrice, setSimulatedPrice] = useState<number>(initialPrice);
  const [journal, setJournal] = useState<TradeSummary[]>([]);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [portfolioBudget, setPortfolioBudget] = useState(0);
  const [partialExits, setPartialExits] = useState<PartialExit[]>([]);
  const [exitQuantities, setExitQuantities] = useState<Record<number, string>>({});

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const updateTarget = () => {
      setPortalTarget(media.matches ? document.getElementById('topbar-price-portal') : null);
    };
    updateTarget();
    media.addEventListener('change', updateTarget);
    return () => media.removeEventListener('change', updateTarget);
  }, []);

  // User isolation
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(true); // Start true to block auto-save until first load
  const [userId, setUserId] = useState<string | null>(null);
  const [userReady, setUserReady] = useState(false);

  // Publish the open lots immediately.  This avoids Portfolio having to wait
  // for the debounced Supabase draft write before it can recalculate Avg Cost.
  useEffect(() => {
    if (!activePortfolioId || !symbol || isLoadingRef.current) return;
    syncDcaPosition(symbol, { entries });
  }, [activePortfolioId, entries, symbol, syncDcaPosition]);

  useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
    if (initialPrice > 0) {
      setCurrentMarketPrice(initialPrice);
      setSimulatedPrice(initialPrice);
    }
  }, [initialSymbol, initialPrice]);

  // Keep Live P&L tied to the Terminal's selected symbol.
  useEffect(() => {
    if (!symbol) return;
    const controller = new AbortController();
    const loadPrice = async () => {
      try {
        const response = await fetch(`/api/market/analysis?symbol=${encodeURIComponent(symbol)}&interval=60`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const result = response.ok ? await response.json() : null;
        if (!controller.signal.aborted && result?.data?.symbol === symbol.toUpperCase()) {
          const price = Number(result.data.currentPrice);
          if (price > 0) {
            setCurrentMarketPrice(price);
            setSimulatedPrice(current => current > 0 ? current : price);
          }
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') console.error('Failed to load DCA market price', error);
      }
    };
    loadPrice();
    const refreshTimer = window.setInterval(loadPrice, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(refreshTimer);
    };
  }, [symbol]);

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
    if (!activePortfolioId || !userReady || !symbol || (userId && !activePortfolioId)) return;
    let cancelled = false;
    let resetTimer: number | undefined;

    const loadDraft = async () => {
      isLoadingRef.current = true;
      let loadedEntries = createDefaultEntries();
      if (userId) {
        let query = supabase
          .from('dca_drafts')
          .select('entries')
          .eq('user_id', userId)
          .eq('symbol', symbol);
        if (activePortfolioId) query = query.eq('portfolio_id', activePortfolioId);
        const { data } = await query.maybeSingle();

        if (cancelled) return;
        const draft = data?.entries;
        if (Array.isArray(draft) && draft.length > 0) {
          loadedEntries = normalizeDcaEntries(draft);
          setEntries(loadedEntries);
          setPortfolioBudget(0);
          setPartialExits([]);
        } else if (draft?.entries && Array.isArray(draft.entries)) {
          loadedEntries = normalizeDcaEntries(draft.entries);
          setEntries(loadedEntries);
          setPortfolioBudget(Number(draft.portfolioBudget) || 0);
          setPartialExits(Array.isArray(draft.partialExits) ? draft.partialExits : []);
        } else {
          setEntries(loadedEntries);
          setPortfolioBudget(0);
          setPartialExits([]);
        }
      } else {
        if (cancelled) return;
        const saved = localStorage.getItem(`dca_draft_${activePortfolioId || 'local-main'}_${symbol}`);
        if (saved) {
          try {
            const draft = JSON.parse(saved);
            if (Array.isArray(draft)) {
              loadedEntries = normalizeDcaEntries(draft);
              setEntries(loadedEntries);
            }
            else {
              loadedEntries = normalizeDcaEntries(draft.entries);
              setEntries(loadedEntries);
              setPortfolioBudget(Number(draft.portfolioBudget) || 0);
              setPartialExits(Array.isArray(draft.partialExits) ? draft.partialExits : []);
            }
          } catch { setEntries(loadedEntries); }
        } else {
          setEntries(loadedEntries);
          setPortfolioBudget(0);
          setPartialExits([]);
        }
      }

      // Allow auto-save after a short delay to let React settle
      resetTimer = window.setTimeout(() => {
        if (cancelled) return;
        isLoadingRef.current = false;
        syncDcaPosition(symbol, { entries: loadedEntries });
      }, 200);
    };

    void loadDraft();
    return () => {
      cancelled = true;
      if (resetTimer) window.clearTimeout(resetTimer);
    };
  }, [activePortfolioId, symbol, userReady, userId, syncDcaPosition]);

  // Debounced persistence, scoped by user and terminal symbol.
  useEffect(() => {
    if (!activePortfolioId || !symbol || !userReady || isLoadingRef.current || (userId && !activePortfolioId)) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const draftPayload = { entries, portfolioBudget, partialExits };
      // 1. Save DCA draft
      if (userId) {
        await supabase
          .from('dca_drafts')
          .upsert(
            { user_id: userId, portfolio_id: activePortfolioId, symbol, entries: draftPayload, updated_at: new Date().toISOString() },
            { onConflict: activePortfolioId ? 'user_id,portfolio_id,symbol' : 'user_id,symbol' }
          );
      }
      // Keep a local, current-session snapshot even for signed-in users. It
      // prevents a Portfolio refresh from ever waiting on a remote draft read.
      localStorage.setItem(`dca_draft_${activePortfolioId || 'local-main'}_${symbol}`, JSON.stringify(draftPayload));

      // Portfolio derives open DCA holdings from this persisted draft.
      window.dispatchEvent(new CustomEvent('dca-drafts-changed', { detail: { symbol, entries: draftPayload, portfolioId: activePortfolioId } }));

    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [activePortfolioId, entries, portfolioBudget, partialExits, symbol, userReady, userId]);

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
      
      let query = supabase
        .from('trade_journal')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'CLOSED');
      if (activePortfolioId) query = query.eq('portfolio_id', activePortfolioId);
      const { data, error } = await query.order('closed_at', { ascending: false });
        
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
  }, [activePortfolioId]);

  const handleEntryChange = (id: number, field: 'price' | 'amount' | 'quantity', value: number) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const newEntry = { ...e, [field]: value };

      // Price, quantity and amount may be entered in any order.  Only derive
      // the third value after the user has explicitly chosen quantity or amount
      // as their basis, so typing a price never fills an unexpected quantity.
      if (field === 'amount') {
        newEntry.calculationBasis = 'amount';
        newEntry.quantity = newEntry.price > 0 ? value / newEntry.price : 0;
      } else if (field === 'quantity') {
        newEntry.calculationBasis = 'quantity';
        newEntry.amount = value * newEntry.price;
      } else if (newEntry.calculationBasis === 'amount' && newEntry.amount > 0) {
        newEntry.quantity = value > 0 ? newEntry.amount / value : 0;
      } else if (newEntry.calculationBasis === 'quantity' && newEntry.quantity > 0) {
        newEntry.amount = value * newEntry.quantity;
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

  const addEntry = () => {
    setEntries(prev => {
      return [...prev, {
        id: Math.max(0, ...prev.map(entry => entry.id)) + 1,
        price: 0,
        amount: 0,
        quantity: 0,
        active: true,
      }];
    });
  };

  const removeEntry = (id: number) => {
    setEntries(prev => prev.length === 1 ? prev : prev.filter(entry => entry.id !== id));
    setExitQuantities(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const activeEntries = entries.filter(e => e.active && e.price > 0 && (e.amount > 0 || e.quantity > 0));
  const portfolioBase = useMemo(() => {
    const position = { quantity: 0, cost: 0 };
    if (!symbol) return position;

    // DCA lots are represented by the draft, not by completed trade rows.
    // This is the same moving-average calculation used by Portfolio for the
    // trader's normal BUY / SELL history.
    [...trades]
      .filter(trade => trade.asset.toUpperCase() === symbol.toUpperCase() && !trade.tag?.startsWith('DCA '))
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(trade => {
        const quantity = trade.shares || (trade.pricePerUnit ? trade.amountUSD / trade.pricePerUnit : 0);
        if (trade.type === 'BUY' || trade.type === 'IMPORT') {
          position.quantity += quantity;
          position.cost += trade.amountUSD + (trade.fees || 0);
        } else if (trade.type === 'SELL' && position.quantity > 0) {
          const costOfSoldShares = (Math.min(quantity, position.quantity) / position.quantity) * position.cost;
          position.quantity = Math.max(0, position.quantity - quantity);
          position.cost = Math.max(0, position.cost - costOfSoldShares);
        } else if (trade.type === 'SHORT') {
          position.quantity -= quantity;
          position.cost += trade.amountUSD - (trade.fees || 0);
        } else if (trade.type === 'COVER' && position.quantity < 0) {
          const costOfCoveredShares = (quantity / Math.abs(position.quantity)) * position.cost;
          position.quantity += quantity;
          position.cost -= costOfCoveredShares;
        }
      });
    return position;
  }, [symbol, trades]);
  const dcaTotalQuantity = activeEntries.reduce((sum, e) => sum + e.quantity, 0);
  const dcaTotalInvestment = activeEntries.reduce((sum, e) => sum + e.amount, 0);
  const dcaAvgEntryPrice = dcaTotalQuantity > 0 ? dcaTotalInvestment / dcaTotalQuantity : 0;
  const totalQuantity = portfolioBase.quantity + dcaTotalQuantity;
  const totalInvestment = portfolioBase.cost + dcaTotalInvestment;
  const totalBuyFee = 0; // Fee removed as requested
  const avgEntryPrice = totalQuantity > 0 ? totalInvestment / totalQuantity : 0;
  const breakEvenPrice = avgEntryPrice; // Fee removed
  const realizedPartialPnl = partialExits.reduce((sum, exit) => sum + exit.pnl, 0);
  const realizedPartialCost = partialExits.reduce((sum, exit) => sum + (exit.price * exit.quantity - exit.pnl), 0);

  // Live P&L based on current market price
  const effectiveSellPrice = manualSellPrice !== '' ? Number(manualSellPrice) : currentMarketPrice;

  const grossValue = effectiveSellPrice * totalQuantity;
  const currentSellFee = 0; // Fee removed
  const netPnL = grossValue - totalInvestment;
  const pnlPercent = totalInvestment > 0 ? (netPnL / totalInvestment) * 100 : 0;
  const dcaNetPnL = effectiveSellPrice * dcaTotalQuantity - dcaTotalInvestment;

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
    return { text: "⏳ ราคาอยู่ต่ำกว่าทุนเฉลี่ย — พิจารณาเพิ่มไม้ตามแผนและความเสี่ยงที่ตั้งไว้", color: "text-[#FFB4AB]" };
  };

  const advisory = getAdvisoryMessage();

  const closeEntry = async (entryId: number, requestedQuantity: number, silent = false) => {
    if (!activePortfolioId) {
      if (!silent) addToast('เลือกพอร์ตเดี่ยวก่อนปิดไม้', 'warning');
      return;
    }
    const entry = entries.find(item => item.id === entryId && item.active);
    const sellPrice = effectiveSellPrice;
    const quantity = Number(requestedQuantity);
    if (!entry || !Number.isFinite(quantity) || quantity <= 0 || quantity > entry.quantity || sellPrice <= 0) {
      if (!silent) addToast('ระบุจำนวนที่จะปิดให้มากกว่า 0 และไม่เกินจำนวนที่ถืออยู่', 'error');
      return;
    }

    const now = new Date().toISOString();
    const pnl = (sellPrice - entry.price) * quantity;
    const exit: PartialExit = {
      id: crypto.randomUUID(),
      entryId,
      quantity,
      price: sellPrice,
      pnl,
      closedAt: now,
    };

    // A closed lot is recorded as a matched BUY/SELL pair, retaining an
    // accurate realised P&L while the remaining lots stay open in the draft.
    await addTrade({
      asset: symbol,
      type: 'BUY',
      amountUSD: entry.price * quantity,
      date: now,
      rateAtTime: exchangeRates[currency] || 1,
      currency,
      shares: quantity,
      pricePerUnit: entry.price,
      tag: `DCA entry ${entry.id}`,
    });
    await addTrade({
      asset: symbol,
      type: 'SELL',
      amountUSD: sellPrice * quantity,
      date: now,
      rateAtTime: exchangeRates[currency] || 1,
      currency,
      shares: quantity,
      pricePerUnit: sellPrice,
      tag: `DCA partial exit from entry ${entry.id}`,
    });

    setEntries(prev => prev.map(item => {
      if (item.id !== entryId) return item;
      const remainingQuantity = Math.max(0, item.quantity - quantity);
      return {
        ...item,
        quantity: remainingQuantity,
        amount: remainingQuantity * item.price,
        active: remainingQuantity > 0,
      };
    }));
    setPartialExits(prev => [exit, ...prev]);
    setExitQuantities(prev => ({ ...prev, [entryId]: '' }));
    if (!silent) {
      addToast(`ปิดไม้ ${entryId} จำนวน ${quantity.toLocaleString()} แล้ว · ${pnl >= 0 ? 'กำไร' : 'ขาดทุน'} ${formatVal(Math.abs(pnl))}`, pnl >= 0 ? 'success' : 'warning');
    }
  };

  const archiveLegacyDcaAsset = async (expectedQuantity: number, expectedAveragePrice: number) => {
    const sym = symbol.toUpperCase();
    const asset = assets.find(item => item.symbol.toUpperCase() === sym);
    const hasManualTrades = trades.some(trade =>
      trade.asset.toUpperCase() === sym && !trade.tag?.startsWith('DCA ')
    );
    const quantityTolerance = Math.max(0.000001, expectedQuantity * 0.000001);
    const priceTolerance = Math.max(0.0001, expectedAveragePrice * 0.000001);
    const matchesLegacyDcaPosition = asset
      && Math.abs((asset.shares || 0) - expectedQuantity) <= quantityTolerance
      && Math.abs((asset.avgCost || 0) - expectedAveragePrice) <= priceTolerance;

    // Previous versions mirrored a DCA draft into Portfolio without creating
    // source trades.  Archive only that exact, unlinked position after it has
    // been closed; real portfolio holdings and their trade history stay intact.
    if (matchesLegacyDcaPosition && !hasManualTrades) {
      await updateAsset(sym, { is_active: false });
    }
  };

  const closeTrade = async () => {
    if (!activePortfolioId) {
      addToast('เลือกพอร์ตเดี่ยวก่อนปิดออเดอร์', 'warning');
      return;
    }
    if (activeEntries.length === 0) return;

    let newTradeId = Math.random().toString(36).substr(2, 9);
    const sym = symbol || 'UNKNOWN';
    const now = new Date().toISOString();
    const finalNetPnl = dcaNetPnL + realizedPartialPnl;
    const allCost = dcaTotalInvestment + realizedPartialCost;
    const finalPnlPercent = allCost > 0 ? (finalNetPnl / allCost) * 100 : 0;
    const allExits = [
      ...partialExits.map(exit => ({ entry_id: exit.entryId, quantity: exit.quantity, price: exit.price, pnl: exit.pnl, hit_at: exit.closedAt })),
      ...activeEntries.map(entry => ({ entry_id: entry.id, quantity: entry.quantity, price: effectiveSellPrice, pnl: (effectiveSellPrice - entry.price) * entry.quantity, hit_at: now })),
    ];

    // Persist a journal snapshot before clearing the remaining position.
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (user) {
        const { data } = await supabase.from('trade_journal').insert({
          user_id: user.id,
          portfolio_id: activePortfolioId,
          symbol: sym,
          market: sym.endsWith('.BK') || sym.endsWith('.TH') ? 'SET' : 'US',
          timeframe: 'DAY',
          status: 'CLOSED',
          entries: activeEntries.map(e => ({
            level: e.id, price: e.price, amount: e.amount, quantity: e.quantity, filled_at: now
          })),
          take_profits: allExits,
          avg_entry: dcaAvgEntryPrice,
          total_pnl: finalNetPnl,
          signal_data: signalData,
          notes: `Closed from DCA assistant — ${partialExits.length} prior partial exit(s)`,
          opened_at: now,
          closed_at: now,
        }).select().single();
        if (data) newTradeId = data.id;
      }
    } catch (e) {
      console.error('Failed to save to Supabase', e);
    }

    // Close each entry as its own lot, preserving entry-level realised P&L.
    for (const entry of activeEntries) {
      await closeEntry(entry.id, entry.quantity, true);
    }
    await archiveLegacyDcaAsset(dcaTotalQuantity, dcaAvgEntryPrice);
    
    const trade: TradeSummary = {
      id: newTradeId,
      symbol: sym,
      entriesCount: activeEntries.length,
      avgPrice: dcaAvgEntryPrice,
      totalQuantity: dcaTotalQuantity,
      sellPrice: effectiveSellPrice,
      totalBuyFee,
      sellFee: currentSellFee,
      netProfit: finalNetPnl,
      profitPercent: finalPnlPercent,
      date: now,
    };
    
    setJournal(prev => [trade, ...prev]);
    
    addToast(`บันทึกการปิดออเดอร์แล้ว · กำไรสุทธิ: ${finalNetPnl >= 0 ? '+' : ''}${formatVal(finalNetPnl)}`, finalNetPnl >= 0 ? 'success' : 'warning');

    // Clear the persisted draft after a complete close.
    if (userId && symbol) {
      let query = supabase.from('dca_drafts').delete().eq('user_id', userId).eq('symbol', symbol);
      if (activePortfolioId) query = query.eq('portfolio_id', activePortfolioId);
      await query;
    }
    localStorage.removeItem(`dca_draft_${activePortfolioId || 'local-main'}_${symbol}`);
    syncDcaPosition(symbol, { entries: [] });
    window.dispatchEvent(new CustomEvent('dca-drafts-changed', { detail: { symbol, entries: { entries: [] }, portfolioId: activePortfolioId } }));
    
    // Reset entries — block auto-save during reset
    isLoadingRef.current = true;
    setEntries(createDefaultEntries());
    setPortfolioBudget(0);
    setPartialExits([]);
    setTimeout(() => { isLoadingRef.current = false; }, 100);
  };

  const deleteJournal = async (id: string) => {
    if (!activePortfolioId) {
      addToast('เลือกพอร์ตเดี่ยวก่อนลบประวัติ', 'warning');
      return;
    }
    setJournal(prev => prev.filter(j => j.id !== id));
    try {
      await supabase.from('trade_journal').delete().eq('id', id);
    } catch (e) {}
  };

  return (
    <div className="space-y-6">
      
      {/* Standalone page header; the Terminal modal supplies its own header. */}
      {!compact && (portalTarget ? createPortal(
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
      ))}

      {compact && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">DCA Trade Assistant</p>
            <h2 className="text-lg font-black text-white">{symbol || 'NO SYMBOL'}</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-gray-500">MKT Price</p>
              <p className="text-sm font-black text-[#4EDEA3]">{formatVal(currentMarketPrice)}</p>
            </div>
            {onClose && <button onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-white/5 hover:text-white"><X size={18} /></button>}
          </div>
        </div>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Col: Entries */}
        <div className="xl:col-span-1 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-white flex items-center gap-2"><Target size={18} className="text-[#ADC6FF]" /> ไม้เข้าซื้อ (DCA Entries)</h3>
            <span className="text-xs font-bold text-gray-500 bg-white/5 px-2 py-1 rounded">ใช้ไม้ไปแล้ว {activeEntries.length} ไม้</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#ADC6FF]/20 bg-[#ADC6FF]/5 px-3 py-2">
            <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">สินทรัพย์ที่กำลังซื้อ (Symbol)</span>
            <span className="text-xs font-black text-[#ADC6FF]">{symbol || 'เลือก Symbol ใน Terminal'}</span>
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
                  {entries.length > 1 && (
                    <button 
                      onClick={() => removeEntry(entry.id)}
                      className="text-xs font-bold px-2 py-1 rounded-lg text-[#FFB4AB] bg-[#FFB4AB]/5 hover:bg-[#FFB4AB]/10 transition-colors"
                    >
                      ลบไม้
                    </button>
                  )}
                </div>

                {entry.active && (
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <label className="mb-1 flex min-h-7 flex-col justify-end text-[9px] font-black uppercase leading-3 text-gray-500">
                        <span>ราคา</span><span>(Price)</span>
                      </label>
                      <input 
                        type="number" step="any"
                        value={entry.price || ''} onChange={e => handleEntryChange(entry.id, 'price', +e.target.value)}
                        className="h-10 min-w-0 w-full rounded-lg border border-border bg-black/40 px-2 text-sm font-bold text-white outline-none focus:border-[#ADC6FF] sm:px-3"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 flex min-h-7 flex-col justify-end text-[9px] font-black uppercase leading-3 text-gray-500">
                        <span>จำนวนหุ้น</span><span>(Qty)</span>
                      </label>
                      <input 
                        type="number" step="any"
                        value={entry.quantity || ''} onChange={e => handleEntryChange(entry.id, 'quantity', +e.target.value)}
                        className="h-10 min-w-0 w-full rounded-lg border border-border bg-black/40 px-2 text-sm font-bold text-white outline-none focus:border-[#ADC6FF] sm:px-3"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 flex min-h-7 flex-col justify-end text-[9px] font-black uppercase leading-3 text-gray-500">
                        <span>จำนวนเงิน</span><span>(Amount)</span>
                      </label>
                      <input 
                        type="number" step="any"
                        value={entry.amount || ''} onChange={e => handleEntryChange(entry.id, 'amount', +e.target.value)}
                        className="h-10 min-w-0 w-full rounded-lg border border-border bg-black/40 px-2 text-sm font-bold text-white outline-none focus:border-[#ADC6FF] sm:px-3"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addEntry}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#ADC6FF]/40 py-3 text-xs font-black text-[#ADC6FF] transition-colors hover:bg-[#ADC6FF]/10"
          >
            <Plus size={15} /> เพิ่มไม้ DCA
          </button>

          <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
            <label className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-gray-500"><CircleDollarSign size={12} /> เงินทุนแผนนี้ (Portfolio Budget)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={portfolioBudget || ''}
              onChange={event => setPortfolioBudget(Number(event.target.value) || 0)}
              placeholder="0.00"
              className="w-full rounded-xl border border-border bg-black/40 px-3 py-2 text-sm font-black text-white outline-none focus:border-[#ADC6FF]"
            />
            <p className="mt-2 text-[10px] font-bold text-gray-500">ใช้ DCA แล้ว {formatVal(dcaTotalInvestment)}{portfolioBudget > 0 ? ` · คงเหลือ ${formatVal(Math.max(0, portfolioBudget - dcaTotalInvestment))}` : ''}</p>
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
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">ราคาเฉลี่ยพอร์ต (Portfolio Avg)</p>
                <p className="text-2xl font-black text-white">{formatVal(avgEntryPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-[#4EDEA3] uppercase mb-1">Break-Even Point</p>
                <p className="text-2xl font-black text-[#4EDEA3]">{formatVal(breakEvenPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">ต้นทุนรวมพอร์ต (Total Cost)</p>
                <p className="text-xl font-bold text-white">{formatVal(totalInvestment)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase mb-1">จำนวนรวม (Total Qty)</p>
                <p className="text-xl font-bold text-white">{totalQuantity.toLocaleString(undefined, { maximumFractionDigits: 5 })}</p>
              </div>
            </div>

            {portfolioBase.quantity > 0 && (
              <p className="-mt-3 mb-5 rounded-lg border border-[#ADC6FF]/15 bg-[#ADC6FF]/5 px-3 py-2 text-[10px] font-bold text-[#ADC6FF] relative z-10">
                รวมหุ้นเดิมใน Portfolio {portfolioBase.quantity.toLocaleString(undefined, { maximumFractionDigits: 5 })} หน่วย · ต้นทุน {formatVal(portfolioBase.cost)} เข้ากับไม้ DCA แล้ว
              </p>
            )}

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

              <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">ปิดบางส่วน / ตัดกำไรตามไม้</span>
                  <span className="text-[10px] text-gray-500">ใช้ราคาขายด้านบน</span>
                </div>
                <div className="space-y-2">
                  {activeEntries.map(entry => {
                    const exitQuantity = Number(exitQuantities[entry.id]);
                    const canCloseEntry = Number.isFinite(exitQuantity) && exitQuantity > 0 && exitQuantity <= entry.quantity;

                    return (
                      <div key={entry.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-white/[0.03] p-2">
                        <span className="text-xs font-black text-[#ADC6FF]">ไม้ {entry.id}</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max={entry.quantity}
                            step="any"
                            value={exitQuantities[entry.id] ?? ''}
                            onChange={event => setExitQuantities(prev => ({ ...prev, [entry.id]: event.target.value }))}
                            placeholder={`สูงสุด ${entry.quantity.toLocaleString(undefined, { maximumFractionDigits: 5 })}`}
                            className="min-w-0 flex-1 rounded-lg border border-border bg-black/40 px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-[#E9C349]"
                          />
                          <span className="hidden text-[10px] text-gray-500 sm:inline">/{entry.quantity.toLocaleString(undefined, { maximumFractionDigits: 5 })}</span>
                        </div>
                        <button
                          onClick={() => closeEntry(entry.id, exitQuantity)}
                          disabled={!canCloseEntry}
                          title={canCloseEntry ? 'ปิดไม้ตามจำนวนที่ระบุ' : 'กรุณาระบุจำนวนที่มากกว่า 0 และไม่เกินจำนวนที่ถืออยู่'}
                          className="rounded-lg bg-[#E9C349] px-2.5 py-1.5 text-[10px] font-black text-[#2a2200] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ปิดไม้
                        </button>
                      </div>
                    );
                  })}
                </div>
                {partialExits.length > 0 && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-gray-500">ปิดไปแล้ว</p>
                    <div className="space-y-1">
                      {partialExits.slice(0, 4).map(exit => (
                        <div key={exit.id} className="flex items-center justify-between text-[10px] font-bold text-gray-400">
                          <span>ไม้ {exit.entryId} · {exit.quantity.toLocaleString(undefined, { maximumFractionDigits: 5 })} @ {formatVal(exit.price)}</span>
                          <span className={exit.pnl >= 0 ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]'}>{exit.pnl >= 0 ? '+' : ''}{formatVal(exit.pnl)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <button 
                onClick={closeTrade}
                disabled={activeEntries.length === 0}
                className="w-full py-3 rounded-xl bg-white text-black font-black uppercase text-xs hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg"
              >
                <Check size={16} /> ปิดไม้ DCA ที่เหลือทั้งหมด
              </button>
              {portfolioBase.quantity > 0 && <p className="mt-2 text-center text-[10px] font-bold text-gray-500">คำสั่งนี้ปิดเฉพาะไม้ DCA — หุ้นเดิมใน Portfolio จะไม่ถูกขาย</p>}
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
