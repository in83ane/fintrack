"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useExecutionFxInput } from '@/src/hooks/useExecutionFxInput';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Calculator, Target, Plus, Check, TrendingUp, AlertTriangle, Info, ShieldAlert, History, Trash2, ArrowRight, X, CircleDollarSign, ChevronDown } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/src/lib/utils';
import { useApp } from '@/src/context/AppContext';
import { AssetFundingFields, type AssetEntryMode } from '@/src/components/AssetFundingFields';
import { supabase } from '@/src/lib/supabase';
import { CustomSelect } from '@/src/components/CustomSelect';
import { PriceLadder } from '@/src/components/PriceLadder';
import { TradeLotEditor } from '@/src/components/TradeLotEditor';
import { CostBasisPanel } from '@/src/components/CostBasisPanel';
import { projectTradeLots, tradeLotEntryId } from '@/src/lib/trade-lots';

export interface DcaEntry {
  id: number;
  price: number;
  amount: number;
  quantity: number;
  active: boolean;
  /** The input the trader supplied directly; the other value is calculated. */
  calculationBasis?: 'amount' | 'quantity';
  executed?: boolean;
  /** Cash account used for a filled DCA lot; required to return proceeds on SELL. */
  brokerageAccountId?: string;
}

const createDefaultEntries = (): DcaEntry[] => [
  { id: 1, price: 0, amount: 0, quantity: 0, active: true, executed: false },
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
    executed: !!entry?.executed,
    brokerageAccountId: typeof entry?.brokerageAccountId === 'string' ? entry.brokerageAccountId : undefined,
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
  onMarketPriceStatusChange?: (status: 'loading' | 'available' | 'not_found' | 'unavailable') => void;
}

export function DcaOrderSystem({ initialSymbol = '', initialPrice = 0, marketCurrency = 'USD', signalData = null, compact = false, onClose, onMarketPriceStatusChange }: Props) {
  const { formatMoney, addTrade, removeTrade, isDataLoaded, brokerageAccounts, brokerageCashBalances, currency, exchangeRates, addToast, assets, trades, updateAsset, syncDcaPosition, activePortfolioId, activePortfolio, portfolios, selectPortfolio } = useApp();
  const { deleteTradeJournalTransactions } = useApp();
  const [editingLot, setEditingLot] = useState<number | null>(null);
  const cashAccounts = brokerageAccounts.filter(account => account.kind === 'cash');
  const tradingPortfolios = portfolios.filter(portfolio => portfolio.kind === 'trading');
  const formatVal = (val: number) => formatMoney(val, marketCurrency as any, 1);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [currentMarketPrice, setCurrentMarketPrice] = useState<number>(initialPrice);
  const [isMarketPriceLoading, setIsMarketPriceLoading] = useState(Boolean(initialSymbol) && initialPrice <= 0);
  const [isMarketPriceUnavailable, setIsMarketPriceUnavailable] = useState(false);
  const [manualSellPrice, setManualSellPrice] = useState<string>('');
  
  const [entries, setEntries] = useState<DcaEntry[]>(createDefaultEntries);

  const [simulatedPrice, setSimulatedPrice] = useState<number>(initialPrice);
  const [journal, setJournal] = useState<TradeSummary[]>([]);
  const openJournalLots = useMemo(() => {
    if (!activePortfolioId) return [];
    const symbols = [...new Set(trades.filter(t => t.portfolioId === activePortfolioId).map(t => t.asset))];
    return symbols.flatMap(ticker => projectTradeLots(trades, activePortfolioId, ticker));
  }, [trades, activePortfolioId]);
  const [historyLot, setHistoryLot] = useState<{ symbol: string; id: number } | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const closingAllRef = useRef(false);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [portfolioBudget, setPortfolioBudget] = useState(0);
  const [partialExits, setPartialExits] = useState<PartialExit[]>([]);
  const [exitQuantities, setExitQuantities] = useState<Record<number, string>>({});
  const [executeModal, setExecuteModal] = useState<{ entryId: number; brokerageAccountId: string } | null>(null);
  const [executionFee, setExecutionFee] = useState('0');
  const [entryMode, setEntryMode] = useState<AssetEntryMode>('BUY');
  const executionPending = useRef(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionFx, setExecutionFx] = useExecutionFxInput();
  const [confirmRemoveEntryId, setConfirmRemoveEntryId] = useState<number | null>(null);



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

  // Keep the displayed market price scoped to the chosen asset.  A loading
  // state is clearer than briefly showing a misleading zero while the quote is
  // requested.
  useEffect(() => {
    if (!symbol) {
      setIsMarketPriceLoading(false);
      setIsMarketPriceUnavailable(false);
      return;
    }
    const controller = new AbortController();
    // The Trade page already validated the first quote.  Keep that validated
    // value visible while this background refresh runs instead of flashing a
    // second loading state.
    const needsInitialQuote = initialPrice <= 0;
    setIsMarketPriceLoading(needsInitialQuote);
    setIsMarketPriceUnavailable(false);
    if (needsInitialQuote) onMarketPriceStatusChange?.('loading');
    const loadPrice = async (isInitialLoad = false) => {
      try {
        const response = await fetch(`/api/market/analysis?symbol=${encodeURIComponent(symbol)}&interval=60`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) {
          if (!controller.signal.aborted) {
            setIsMarketPriceUnavailable(true);
            onMarketPriceStatusChange?.(response.status === 404 ? 'not_found' : 'unavailable');
          }
          return;
        }
        const result = await response.json();
        if (!controller.signal.aborted && result?.data?.symbol === symbol.toUpperCase()) {
          const price = Number(result.data.currentPrice);
          if (price > 0) {
            setCurrentMarketPrice(price);
            setSimulatedPrice(current => current > 0 ? current : price);
            setIsMarketPriceUnavailable(false);
            onMarketPriceStatusChange?.('available');
          } else {
            setIsMarketPriceUnavailable(true);
            onMarketPriceStatusChange?.('not_found');
          }
        } else if (!controller.signal.aborted) {
          setIsMarketPriceUnavailable(true);
          onMarketPriceStatusChange?.('not_found');
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Failed to load DCA market price', error);
          if (!controller.signal.aborted) {
            setIsMarketPriceUnavailable(true);
            onMarketPriceStatusChange?.('unavailable');
          }
        }
      } finally {
        if (isInitialLoad && !controller.signal.aborted) setIsMarketPriceLoading(false);
      }
    };
    loadPrice(true);
    const refreshTimer = window.setInterval(() => loadPrice(false), 30_000);
    return () => {
      controller.abort();
      window.clearInterval(refreshTimer);
    };
  }, [onMarketPriceStatusChange, symbol]);

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
      const reconcilePostedEntries = (candidate: DcaEntry[]) => candidate.filter((entry) => {
        if (!entry.executed) return true;
        const posted = trades.some((trade) =>
          (trade.portfolioId || activePortfolioId) === activePortfolioId
          && trade.asset.toUpperCase() === symbol.toUpperCase()
          && trade.type === 'BUY'
          && trade.tag === `DCA entry ${entry.id}`
        );
        // Never present a saved plan as an executed buy if its transaction is
        // missing. This repairs older drafts that were marked filled even
        // when the server rejected their trade.
        return posted;
      });
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
          loadedEntries = reconcilePostedEntries(normalizeDcaEntries(draft));
          setEntries(loadedEntries);
          setPortfolioBudget(0);
          setPartialExits([]);
        } else if (draft?.entries && Array.isArray(draft.entries)) {
          loadedEntries = reconcilePostedEntries(normalizeDcaEntries(draft.entries));
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
              loadedEntries = reconcilePostedEntries(normalizeDcaEntries(draft));
              setEntries(loadedEntries);
            }
            else {
              loadedEntries = reconcilePostedEntries(normalizeDcaEntries(draft.entries));
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
        // Loading intentionally blocks autosave. Emit one shallow state update
        // after it is unblocked so a repaired stale `executed` flag is written
        // back to the draft instead of returning on every page visit.
        setEntries(current => [...current]);
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
        const { error } = await supabase
          .from('dca_drafts')
          .upsert(
            { user_id: userId, portfolio_id: activePortfolioId, symbol, entries: draftPayload, updated_at: new Date().toISOString() },
            { onConflict: activePortfolioId ? 'user_id,portfolio_id,symbol' : 'user_id,symbol' }
          );
        if (error) {
          console.error('Failed to save DCA draft', error);
          addToast('บันทึกแผน DCA ไม่สำเร็จ กรุณาลองใหม่', 'error');
        }
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
        
      if (data && !error) {
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
        id: Math.max(Date.now(), ...prev.map(entry => entry.id + 1)),
        price: 0,
        amount: 0,
        quantity: 0,
        active: true,
      }];
    });
  };

  const removeEntry = (id: number) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    // If executed, ask for confirmation first
    if (entry.executed) {
      setConfirmRemoveEntryId(id);
      return;
    }

    if (entries.length <= 1) {
      setEntries(createDefaultEntries());
      addToast('ล้างข้อมูลไม้แล้ว', 'success');
      return;
    }

    // Not executed — just remove from draft
    setEntries(prev => prev.filter(e => e.id !== id));
    setExitQuantities(prev => { const next = { ...prev }; delete next[id]; return next; });
    addToast('ลบไม้เรียบร้อย', 'success');
  };

  const confirmRemoveEntry = async () => {
    const id = confirmRemoveEntryId;
    if (id === null) return;
    setConfirmRemoveEntryId(null);

    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    if (entry.executed) {
      const lot = postedLots.find(item => tradeLotEntryId(item.trade) === id);
      if (!lot) return;
      if (lot.remaining < lot.quantity) {
        addToast('ไม้นี้มีรายการขาย กรุณาลบรายการขายใน Ledger ก่อน', 'warning');
        return;
      }
      if (await removeTrade(lot.trade.id)) {
        setEntries(prev => prev.filter(item => item.id !== id));
        setExitQuantities(prev => { const next = { ...prev }; delete next[id]; return next; });
      }
      return;
    }

    setEntries(prev => prev.filter(e => e.id !== id));
    setExitQuantities(prev => { const next = { ...prev }; delete next[id]; return next; });
    addToast(`ลบไม้ ${id} เรียบร้อย`, 'success');
  };

  const postedLots = useMemo(() => projectTradeLots(trades, activePortfolioId || '', symbol), [trades, activePortfolioId, symbol]);

  // Executed rows are projections of the ledger. Draft storage owns only
  // unexecuted plans; deleting a SELL automatically restores the bought lot.
  useEffect(() => {
    if (!isDataLoaded || isLoadingRef.current || !activePortfolioId) return;
    const posted = postedLots;
    const ids = new Set(posted.map(lot => tradeLotEntryId(lot.trade)!));
    const drafts = entries.filter(entry => !entry.executed && !ids.has(entry.id));
    const executed: DcaEntry[] = posted.map(lot => ({
      id: tradeLotEntryId(lot.trade)!, price: lot.price, quantity: lot.remaining,
      amount: lot.remaining * lot.price, active: lot.remaining > 0, executed: true,
      brokerageAccountId: lot.trade.brokerageAccountId,
    }));
    const reconciled = [...executed, ...drafts];
    // Deleting the last posted purchase can leave no rows. Keep a blank plan
    // available, but never recreate an executed transaction from draft data.
    const next = reconciled.length ? reconciled : createDefaultEntries();
    if (JSON.stringify(next) !== JSON.stringify(entries)) setEntries(next);
    const exits: PartialExit[] = trades.filter(trade => trade.portfolioId === activePortfolioId && trade.asset.toUpperCase() === symbol.toUpperCase() && trade.type === 'SELL' && /^DCA partial exit from entry -?\d+$/.test(trade.tag || '')).map(trade => {
      const entryId = Number(trade.tag!.split(' ').at(-1));
      const buy = posted.find(lot => tradeLotEntryId(lot.trade) === entryId);
      const quantity = Number(trade.shares) || 0;
      return { id: trade.dbId || String(trade.id), entryId, quantity, price: trade.pricePerUnit || 0, pnl: trade.amountUSD - (trade.fees || 0) - quantity * (buy?.price || 0), closedAt: trade.date };
    });
    setPartialExits(previous => JSON.stringify(previous) === JSON.stringify(exits) ? previous : exits);
  }, [activePortfolioId, entries, isDataLoaded, postedLots, symbol, trades]);

  const activeEntries = entries.filter(e => e.active && e.price > 0 && (e.amount > 0 || e.quantity > 0));
  const heldEntries = activeEntries.filter(entry => entry.executed);
  const firstHeldPrice = heldEntries[0]?.price ?? 0;
  const dcaTotalQuantity = heldEntries.reduce((sum, e) => sum + e.quantity, 0);
  const dcaTotalInvestment = heldEntries.reduce((sum, e) => sum + e.amount, 0);
  const dcaAvgEntryPrice = dcaTotalQuantity > 0 ? dcaTotalInvestment / dcaTotalQuantity : 0;
  const totalQuantity = dcaTotalQuantity;
  const totalInvestment = dcaTotalInvestment;
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
    if (pnlPercent > 0.2) return { text: "ผ่าน break-even แล้ว กำลังทำกำไร พิจารณา take profit", color: "text-[#4EDEA3]" };
    if (pnlPercent > 0) return { text: "ใกล้คืนทุน รออีกนิด ให้ผ่าน break-even ก่อนขาย", color: "text-[#E9C349]" };
    if (pnlPercent > -1) return { text: "ราคาอ่อนตัว ถ้ามีแผน DCA พิจารณาเปิดไม้ 2", color: "text-[#ADC6FF]" };
    if (pnlPercent > -2) return { text: "ราคาลงมาถึงโซนไม้ 2 เพิ่มไม้เพื่อลดต้นทุนเฉลี่ย", color: "text-[#ADC6FF]" };
    if (pnlPercent > -4) return { text: "โซนไม้ 3 การเพิ่มไม้จะดึงราคาเฉลี่ยลงมาได้มาก", color: "text-[#FFB4AB]" };
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

    // A draft is only a plan. It cannot be sold until its BUY was posted and
    // linked to a cash account, otherwise Trade and Portfolio would diverge.
    if (!entry.executed) {
      if (!silent) addToast('ยืนยันซื้อไม้นี้ก่อน จึงจะบันทึกการขายได้', 'warning');
      return;
    }

    const settlementAccount = cashAccounts.find(account => account.id === entry.brokerageAccountId) || cashAccounts.find(account => account.currency === marketCurrency);
    if (!settlementAccount) { addToast('เลือกบัญชีเงินสดสำหรับรับเงินขายก่อน', 'error'); return; }
    const sellSaved = await addTrade({
      asset: symbol,
      type: 'SELL',
      amountUSD: sellPrice * quantity,
      date: now,
      rateAtTime: exchangeRates[(settlementAccount.currency) as keyof typeof exchangeRates] || 1,
      currency: settlementAccount.currency,
      originalAmount: sellPrice * quantity * (exchangeRates[(settlementAccount.currency) as keyof typeof exchangeRates] || 1),
      shares: quantity,
      pricePerUnit: sellPrice,
      brokerageAccountId: settlementAccount.id,
      tag: `DCA partial exit from entry ${entry.id}`,
    });
    if (!sellSaved) return;

    // Quantities and realised results are rebuilt from the saved SELL above.
    setExitQuantities(prev => ({ ...prev, [entryId]: '' }));
    if (!silent) {
      addToast(`ปิดไม้ ${entryId} จำนวน ${quantity.toLocaleString()} แล้ว · ${pnl >= 0 ? 'กำไร' : 'ขาดทุน'} ${formatVal(Math.abs(pnl))}`, pnl >= 0 ? 'success' : 'warning');
    }
    return true;
  };

  const archiveLegacyDcaAsset = async (expectedQuantity: number, expectedAveragePrice: number) => {
    const sym = symbol.toUpperCase();
    const asset = assets.find(item => item.portfolioId === activePortfolioId && item.symbol.toUpperCase() === sym);
    const hasManualTrades = trades.some(trade =>
      trade.portfolioId === activePortfolioId && trade.asset.toUpperCase() === sym && !trade.tag?.startsWith('DCA ')
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

  const executeEntry = async (entryId: number, brokerageAccountId: string) => {
    if (executionPending.current) return;
    const entry = entries.find(item => item.id === entryId && item.active);
    if (!entry || entry.price <= 0 || entry.quantity <= 0) {
      addToast('ระบุราคาและจำนวนให้ครบก่อนยืนยันการซื้อ', 'error');
      return;
    }
    
    const now = new Date().toISOString();
    const sourceAccount = cashAccounts.find(account => account.id === brokerageAccountId);
    if (entryMode === 'BUY' && !sourceAccount) {
      addToast('เลือกบัญชีเงินสดสำหรับชำระเงินก่อนยืนยันซื้อ', 'error');
      return;
    }
    const settlementCurrency = marketCurrency as keyof typeof exchangeRates;
    // `amountUSD` stays canonical for P/L.  `originalAmount` is the exact
    // amount deducted from the wallet selected in the confirmation step.
    const fee = Number(executionFee);
    const fx = Number(executionFx);
    if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(fx) || fx <= 0) { addToast('ตรวจค่าธรรมเนียมและเรทแลกเปลี่ยน', 'error'); return; }
    const settlementRate = settlementCurrency === 'THB' ? fx : 1;
    const settlementAmount = settlementCurrency === 'USD'
      ? entry.amount
      : entry.amount * settlementRate;
    const availableCash = brokerageCashBalances.find(balance => balance.accountId === sourceAccount?.id)?.balance || 0;
    if (entryMode === 'BUY' && settlementAmount + fee > availableCash + 0.000001) {
      addToast(`เงินใน ${sourceAccount?.name} ไม่พอสำหรับไม้ ${entry.id}`, 'error');
      return;
    }
    const tradeData = {
      asset: symbol,
      type: entryMode,
      portfolioId: activePortfolioId || undefined,
      amountUSD: entry.amount,
      date: now,
      rateAtTime: settlementRate,
      currency: settlementCurrency,
      originalAmount: settlementAmount + fee,
      fees: fee / settlementRate,
      fxRateTHB: fx,
      shares: entry.quantity,
      pricePerUnit: entry.price,
      brokerageAccountId: entryMode === 'BUY' ? brokerageAccountId : undefined,
      tag: `DCA entry ${entry.id}`,
    };

    executionPending.current = true;
    setIsExecuting(true);
    let saved = false;
    try { saved = await addTrade(tradeData); }
    finally { executionPending.current = false; setIsExecuting(false); }
    if (!saved) return;

    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, executed: true, brokerageAccountId } : e));
    setExecuteModal(null);
    setExecutionFee('0');
    addToast(`ไม้ที่ ${entry.id} เข้าพอร์ตเรียบร้อยแล้ว`, 'success');
  };

  const closeTrade = async () => {
    if (closingAllRef.current) return;
    const qty = entries.filter(e => e.active && e.executed && e.quantity > 0).reduce((sum, e) => sum + e.quantity, 0);
    if (qty <= 0 || !(effectiveSellPrice > 0)) return;
    const answer = window.prompt(`ขายทุกไม้ของ ${symbol} ในพอร์ต ${activePortfolio?.name || ''}\nจำนวน ${qty} หน่วย · ราคาขาย ${formatVal(effectiveSellPrice)} ต่อหน่วย\nตรวจจำนวนและราคา แล้วพิมพ์ ${symbol} เพื่อยืนยัน (ยกเลิกได้)`);
    if (answer?.trim().toUpperCase() !== symbol.toUpperCase()) return;
    closingAllRef.current = true;
    setClosingAll(true);
    try { await executeCloseAll(); } finally { closingAllRef.current = false; setClosingAll(false); }
  };

  const executeCloseAll = async () => {
    if (!activePortfolioId) {
      addToast('เลือกพอร์ตเดี่ยวก่อนปิดออเดอร์', 'warning');
      return;
    }
    const activeEntries = entries.filter(entry => entry.active && entry.executed && entry.quantity > 0);
    if (!activeEntries.length) return;

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

    // Do not record a successful close if any underlying SELL failed.
    for (const entry of activeEntries) {
      if (!await closeEntry(entry.id, entry.quantity, true)) {
        addToast('ปิดไม้ไม่ครบ กรุณาตรวจรายการที่เหลือก่อนลองใหม่', 'error');
        return;
      }
    }

    // Journal is a snapshot; holdings always come from posted transactions.
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
          entries: postedLots.filter(lot => allExits.some(exit => exit.entry_id === tradeLotEntryId(lot.trade))).map(lot => ({
            level: tradeLotEntryId(lot.trade), trade_id: lot.trade.dbId, price: lot.price, amount: lot.price * lot.quantity, quantity: lot.quantity, filled_at: lot.trade.date
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
    setTimeout(() => { isLoadingRef.current = false; setEntries(current => [...current]); }, 100);
  };

  const deleteJournal = async (id: string) => {
    if (!activePortfolioId) {
      addToast('เลือกพอร์ตเดี่ยวก่อนลบประวัติ', 'warning');
      return;
    }
    if (!window.confirm('ลบประวัตินี้พร้อมรายการซื้อและขายของไม้ที่เกี่ยวข้อง และย้อนเงินสดในโบรกหรือไม่?')) return;
    if (await deleteTradeJournalTransactions(id)) setJournal(prev => prev.filter(j => j.id !== id));
  };

  if (!activePortfolioId || activePortfolioId === 'all' || activePortfolio?.kind !== 'trading') {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-surface rounded-3xl border border-border mt-4 h-full">
        <AlertTriangle size={48} className="text-[#FFB4AB] mb-4" />
        <h3 className="text-lg font-black text-[#FFB4AB] mb-2">Trade ใช้กับพอร์ตลงทุนเท่านั้น</h3>
        <p className="text-gray-500 text-sm text-center mb-6">เลือกพอร์ตลงทุนที่จะใช้วางแผนและบันทึกการเทรด โดย Bucket จะยังเป็นพื้นที่สำหรับจัดการเงินสด</p>
        {tradingPortfolios.length > 0 ? (
          <CustomSelect
            value={activePortfolioId || ''}
            onChange={(val) => selectPortfolio(val)}
            className="w-56"
            placeholder="เลือกพอร์ตลงทุน"
            items={tradingPortfolios.map(p => ({
              value: p.id,
              label: p.name,
            }))}
          />
        ) : (
          <p className="rounded-xl border border-border bg-black/20 px-4 py-3 text-center text-xs font-bold text-gray-400">ยังไม่มีพอร์ตลงทุน สร้างพอร์ตจากหน้า Portfolio ก่อนเริ่ม Trade</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {editingLot !== null && activePortfolioId && <TradeLotEditor symbol={symbol} portfolioId={activePortfolioId} initialTradeId={editingLot} onClose={() => setEditingLot(null)} />}
      {historyLot && activePortfolioId && <TradeLotEditor symbol={historyLot.symbol} portfolioId={activePortfolioId} initialTradeId={historyLot.id} onClose={() => setHistoryLot(null)} />}
      
      {/* The Trade page supplies the primary heading; this shows live plan context. */}
      {!compact && (portalTarget ? createPortal(
        <div className="flex items-center gap-4 bg-white/5 border border-border rounded-full px-4 py-1.5 ml-2 hover:bg-white/10 transition-colors">
           <div className="flex items-center gap-2">
             <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest hidden sm:inline">Asset</span>
             <span className="text-xs font-black text-white">{symbol || "NO SYMBOL"}</span>
           </div>
           <div className="w-px h-3 bg-white/10"></div>
           <div className="flex items-center gap-2">
             <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest hidden sm:inline">MKT</span>
             {isMarketPriceLoading ? (
               <span className="h-3 w-12 animate-pulse rounded bg-white/10" aria-label="Loading market price" />
             ) : (
               <span className={cn("text-xs font-black", currentMarketPrice > 0 ? "text-[#4EDEA3]" : "text-gray-500")}>
                 {currentMarketPrice > 0 ? formatVal(currentMarketPrice) : "—"}
               </span>
             )}
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
             {isMarketPriceLoading ? <div className="ml-auto h-8 w-28 animate-pulse rounded-lg bg-white/10" /> : <h2 className="text-3xl font-black text-[#4EDEA3] leading-none">{currentMarketPrice > 0 ? formatVal(currentMarketPrice) : "—"}</h2>}
           </div>
        </div>
      ))}

      {compact && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Trade plan</p>
            <h2 className="text-lg font-black text-white">{symbol || 'NO SYMBOL'}</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-gray-500">MKT Price</p>
              {isMarketPriceLoading ? <span className="ml-auto mt-1 block h-3 w-14 animate-pulse rounded bg-white/10" /> : <p className="text-sm font-black text-[#4EDEA3]">{currentMarketPrice > 0 ? formatVal(currentMarketPrice) : "—"}</p>}
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
            <span className="text-xs font-bold text-gray-500 bg-white/5 px-2 py-1 rounded">มี {activeEntries.length} ไม้</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-white/5 px-3 py-2">
            <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">พอร์ตลงทุน (Portfolio)</span>
            <CustomSelect
              value={activePortfolioId || ''}
              onChange={(val) => selectPortfolio(val)}
              className="w-32"
              dropdownAlign="right"
              items={portfolios.filter(p => p.kind === 'trading').map(p => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </div>
          
          <div className="flex items-center justify-between rounded-xl border border-[#ADC6FF]/20 bg-[#ADC6FF]/5 px-3 py-2">
            <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">สินทรัพย์ที่กำลังซื้อ (Symbol)</span>
            <span className="text-xs font-black text-[#ADC6FF]">{symbol || 'เลือกสัญลักษณ์ด้านบน'}</span>
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
                      {idx + 1}
                    </div>
                    <span className="font-bold text-sm text-white">ไม้ {idx + 1} {idx === 0 ? '(แรก)' : '(ถัว)'}</span>
                  </div>
                  {(entries.length > 1 || entry.executed) && (
                    <>
                      {confirmRemoveEntryId === entry.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[#FFB4AB] font-bold">{entry.executed ? 'ลบรายการซื้อและคืนเงิน?' : 'ลบไม้?'}</span>
                          <button onClick={confirmRemoveEntry} className="text-[10px] font-black px-2 py-1 rounded-lg bg-[#FFB4AB] text-black hover:opacity-80 transition-opacity">ยืนยัน</button>
                          <button onClick={() => setConfirmRemoveEntryId(null)} className="text-[10px] font-bold px-2 py-1 rounded-lg text-gray-400 hover:text-white transition-colors">ยกเลิก</button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => removeEntry(entry.id)}
                          disabled={postedLots.some(l=>tradeLotEntryId(l.trade)===entry.id && l.remaining<l.quantity)}
                          title="มีประวัติปิดแล้ว ลบไม่ได้"
                          style={postedLots.some(l=>tradeLotEntryId(l.trade)===entry.id && l.remaining<l.quantity)?{opacity:0.4}:undefined}
                          className="text-xs font-bold px-2 py-1 rounded-lg text-[#FFB4AB] bg-[#FFB4AB]/5 hover:bg-[#FFB4AB]/10 transition-colors"
                        >
                          ลบไม้
                        </button>
                      )}
                    </>
                  )}
                </div>

                {(entry.active || entry.executed) && (
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <label className="mb-1 flex min-h-7 flex-col justify-end text-[9px] font-black uppercase leading-3 text-gray-500">
                        <span>ราคา</span><span>(Price)</span>
                      </label>
                      <input 
                        type="number" step="any" disabled={entry.executed}
                        value={(entry.executed ? postedLots.find(l=>tradeLotEntryId(l.trade)===entry.id)?.trade.pricePerUnit : entry.price) || ''} onChange={e => handleEntryChange(entry.id, 'price', +e.target.value)}
                        className={cn("h-10 min-w-0 w-full rounded-lg border border-border bg-black/40 px-2 text-sm font-bold text-white outline-none focus:border-[#ADC6FF] sm:px-3", entry.executed && "opacity-50 cursor-not-allowed")}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 flex min-h-7 flex-col justify-end text-[9px] font-black uppercase leading-3 text-gray-500">
                        <span>จำนวนหุ้น</span><span>(Qty)</span>
                      </label>
                      <input 
                        type="number" step="any" disabled={entry.executed}
                        value={(entry.executed ? postedLots.find(l=>tradeLotEntryId(l.trade)===entry.id)?.quantity : entry.quantity) || ''} onChange={e => handleEntryChange(entry.id, 'quantity', +e.target.value)}
                        className={cn("h-10 min-w-0 w-full rounded-lg border border-border bg-black/40 px-2 text-sm font-bold text-white outline-none focus:border-[#ADC6FF] sm:px-3", entry.executed && "opacity-50 cursor-not-allowed")}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 flex min-h-7 flex-col justify-end text-[9px] font-black uppercase leading-3 text-gray-500">
                        <span>จำนวนเงิน</span><span>(Amount)</span>
                      </label>
                      <input 
                        type="number" step="any" disabled={entry.executed}
                        value={(entry.executed ? postedLots.find(l=>tradeLotEntryId(l.trade)===entry.id)?.trade.amountUSD : entry.amount) || ''} onChange={e => handleEntryChange(entry.id, 'amount', +e.target.value)}
                        className={cn("h-10 min-w-0 w-full rounded-lg border border-border bg-black/40 px-2 text-sm font-bold text-white outline-none focus:border-[#ADC6FF] sm:px-3", entry.executed && "opacity-50 cursor-not-allowed")}
                      />
                    </div>
                  </div>
                )}
                
                {entry.active && !entry.executed && executeModal?.entryId !== entry.id && (
                  <div className="mt-3 flex justify-end">
                    <button 
                      onClick={() => {
                        setEntryMode('BUY');
                        setExecuteModal({ entryId: entry.id, brokerageAccountId: '' });
                      }}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-[#ADC6FF] text-[#00285d] hover:opacity-80 transition-opacity flex items-center gap-1"
                    >
                      <Check size={12} /> ยืนยันการซื้อ (Execute)
                    </button>
                  </div>
                )}
                {entry.executed && (
                  <div className="mt-3 flex justify-end">
                    <span className="mr-auto text-[10px] text-gray-500 self-center">{(() => {const l=postedLots.find(l=>tradeLotEntryId(l.trade)===entry.id);return l&&l.remaining<l.quantity?(l.remaining===0?'ปิดครบแล้ว':`ปิดแล้ว ${l.quantity-l.remaining} · เหลือ ${l.remaining}`):'';})()}</span>
                    <button className="mr-3 text-xs text-[#ADC6FF]" onClick={() => {
                      const lot = postedLots.find(item => tradeLotEntryId(item.trade) === entry.id);
                      if (lot) setEditingLot(lot.trade.id);
                    }}>แก้ไขไม้นี้</button>
                    <span className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-[#4EDEA3]/10 text-[#4EDEA3] flex items-center gap-1">
                      <Check size={12} /> ซื้อเข้าพอร์ตแล้ว
                    </span>
                  </div>
                )}

                {executeModal?.entryId === entry.id && (
                  <div className="mt-3 p-3 rounded-xl bg-black/40 border border-[#333]">
                     <div className="mb-3"><AssetFundingFields portfolioId={activePortfolioId || ''} currency={marketCurrency} mode={entryMode} onModeChange={setEntryMode} accountId={executeModal.brokerageAccountId} onAccountChange={id => setExecuteModal({ ...executeModal, brokerageAccountId: id })} /></div>
                     <div className="flex gap-2 justify-end">
                       <div className="flex-1 space-y-2 text-xs text-gray-400">
                         <label className="block">ค่าธรรมเนียม ({marketCurrency})<input aria-label="ค่าธรรมเนียมซื้อ" className="mt-1 w-full rounded border border-white/10 bg-black/20 p-2" type="number" min="0" step="any" value={executionFee} onChange={e => setExecutionFee(e.target.value)} /></label>
                         <label className="block">1 USD = กี่ THB ณ วันซื้อ<input className="mt-1 w-full rounded border border-white/10 bg-black/20 p-2" type="number" min="0" step="any" value={executionFx} onChange={e => setExecutionFx(e.target.value)} /></label>
                       </div>
                       <button onClick={() => setExecuteModal(null)} className="px-3 py-1.5 text-[10px] font-bold text-gray-400 hover:text-white transition-colors">ยกเลิก</button>
                       <button disabled={isExecuting} onClick={() => executeEntry(entry.id, executeModal.brokerageAccountId)} className="px-3 py-1.5 text-[10px] font-black bg-[#ADC6FF] text-[#00285d] rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40">
                         ยืนยันรายการ
                       </button>
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

          <div className="mt-6 flex flex-col gap-3">
            {/* Analytics Cards */}
            {(() => {
              const totalTrades = journal.length;
              const winningTrades = journal.filter(t => t.netProfit >= 0).length;
              const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
              const totalJournalPnL = journal.reduce((sum, t) => sum + t.netProfit, 0);
              return (
                <>
                  <div className="bg-gradient-to-br from-[#1C1B1B] to-black p-5 rounded-2xl border border-border relative overflow-hidden">
                     <p className="text-[10px] font-black text-gray-500 uppercase mb-2 relative z-10">Win Rate</p>
                     <p className="text-3xl font-black text-white relative z-10">{winRate.toFixed(0)}%</p>
                     <p className="text-xs text-gray-500 font-bold mt-2 relative z-10">ชนะ {winningTrades} จาก {totalTrades} เทรด</p>
                  </div>
                  <div className="bg-gradient-to-br from-[#1C1B1B] to-black p-5 rounded-2xl border border-border relative overflow-hidden">
                     <p className="text-[10px] font-black text-gray-500 uppercase mb-2 relative z-10">Total Net P&L</p>
                     <p className={cn("text-3xl font-black relative z-10", totalJournalPnL >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                       {totalJournalPnL >= 0 ? '+' : ''}{formatVal(totalJournalPnL)}
                     </p>
                  </div>
                  <div className="bg-gradient-to-br from-[#1C1B1B] to-black p-5 rounded-2xl border border-border relative overflow-hidden">
                     <p className="text-[10px] font-black text-gray-500 uppercase mb-2 relative z-10">Total Trades</p>
                     <p className="text-3xl font-black text-white relative z-10">{totalTrades}</p>
                     <p className="text-xs text-gray-500 font-bold mt-2 relative z-10">ออเดอร์ทั้งหมด</p>
                  </div>
                </>
              );
            })()}
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

          
          {/* Average Info Card */}
          <div className="bg-gradient-to-br from-[#1C1B1B] to-black rounded-3xl p-4 sm:p-5 border border-border relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-[#ADC6FF]/5 rounded-full blur-[100px] pointer-events-none" />
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 relative z-10">
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



            {/* Advisory */}
            <div className="bg-black/40 rounded-xl p-3 border border-border mb-4 flex items-start gap-3 relative z-10">
              <Info className={cn("shrink-0 mt-0.5", advisory.color)} size={18} />
              <div>
                <p className="text-xs font-black text-gray-400 mb-1">Day Trader Assistant:</p>
                <p className={cn("text-sm font-bold", advisory.color)}>{advisory.text}</p>
              </div>
            </div>

            {activePortfolioId && <CostBasisPanel key={`${activePortfolioId}:${symbol}`} symbol={symbol} portfolioId={activePortfolioId} market={currentMarketPrice} />}
          </div>

          <PriceLadder entries={activeEntries} market={currentMarketPrice} average={avgEntryPrice} analysis={signalData} format={formatVal} rate={marketCurrency === 'USD' ? 1 : exchangeRates[marketCurrency as keyof typeof exchangeRates] || 1} />

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

             {firstHeldPrice > 0 && avgEntryPrice > 0 && avgEntryPrice < firstHeldPrice && (
               <div className="mt-4 p-3 rounded-lg bg-[#E9C349]/10 text-[#E9C349] border border-[#E9C349]/20 text-xs font-bold flex items-start gap-2">
                 <Info size={16} className="shrink-0" />
                 <p>ราคาเฉลี่ยของคุณ ({formatVal(avgEntryPrice)}) ต่ำกว่าไม้แรกที่ยังถืออยู่ ({formatVal(firstHeldPrice)}) อยู่ {((firstHeldPrice - avgEntryPrice)/firstHeldPrice * 100).toFixed(1)}% ดังนั้นแม้ราคายังไม่กลับไปจุดเดิม คุณก็สามารถทำกำไรได้เมื่อราคาผ่าน {formatVal(breakEvenPrice)}</p>
               </div>
             )}
          </div>

        </div>
      </div>

      {/* Trade Journal Section */}
        <div className="space-y-6 mt-6">

          <div className="bg-surface rounded-3xl p-6 border border-border">
            <h3 className="font-black text-white flex items-center gap-2 mb-4"><History size={18} className="text-[#ADC6FF]" /> ประวัติการเทรด (Trade Journal)</h3>
            <p className="mb-4 text-xs text-gray-400">ทุกสัญลักษณ์ในพอร์ตที่เลือก · ไม้ที่ถืออยู่และสรุปเทรดที่ปิดแล้ว · สถิติด้านบนนับเฉพาะสรุปที่ปิดแล้ว</p>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] font-black text-gray-500 uppercase">
                  <th className="p-3">วันที่ (Date)</th>
                  <th className="p-3">Symbol</th>
                  <th className="p-3">จำนวนไม้</th>
                  <th className="p-3">ทุนเฉลี่ย</th>
                  <th className="p-3">ราคาขาย</th>
                  <th className="p-3 text-right">กำไรขายแล้ว / ยังไม่ขาย</th>
                  <th className="p-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {journal.length === 0 && openJournalLots.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-sm text-gray-400">ยังไม่มีรายการเทรดในพอร์ตนี้</td></tr>}
                {openJournalLots.map(lot => {
                  const quote = lot.trade.asset.toUpperCase() === symbol.toUpperCase() ? currentMarketPrice : assets.find(a => a.symbol.toUpperCase() === lot.trade.asset.toUpperCase())?.currentPrice;
                  const unrealized = lot.remaining === 0 ? 0 : quote && quote > 0 ? (quote - lot.price) * lot.remaining : null;
                  return <tr key={`open-${lot.trade.id}`} className="border-b border-border text-xs">
                  <td className="p-3 text-gray-400">{new Date(lot.trade.date).toLocaleString('th-TH')}</td>
                  <td className="p-3 font-bold">{lot.trade.asset}<span className="block text-[#4EDEA3]">{lot.remaining > 0 ? `ถืออยู่ ${lot.remaining} หน่วย` : 'ปิดครบแล้ว'}</span><span className="block text-gray-400">ขายแล้ว {lot.quantity - lot.remaining} หน่วย</span></td>
                  <td className="p-3">1 ไม้</td><td className="p-3">{formatVal(lot.price)}<span className="block text-gray-500">ค่าธรรมเนียม {formatVal(lot.trade.fees || 0)}<br />{lot.trade.fxRateTHB ? `1 USD = ${lot.trade.fxRateTHB} THB` : 'ไม่ระบุเรท USD/THB'}</span></td>
                  <td className="p-3">{lot.sales.length ? lot.sales.map(sale => <div key={sale.trade.id} className="mb-2"><span>{new Date(sale.trade.date).toLocaleString('th-TH')}</span><br />{sale.quantity} หน่วย @ {formatVal(sale.trade.pricePerUnit || 0)}<br /><span className={sale.pnl >= 0 ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]'}>กำไรสุทธิ {formatVal(sale.pnl)}</span></div>) : 'ยังไม่มีรายการขาย'}</td>
                  <td className="p-3 text-right"><div className={lot.realized >= 0 ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]'}>ขายแล้ว {formatVal(lot.realized)}</div><div className="mt-2 text-gray-400">ยังไม่ขาย {unrealized === null ? 'รอราคาตลาด' : formatVal(unrealized)}</div><span className="text-[10px] text-gray-500">ยังไม่หักค่าธรรมเนียมขายในอนาคต</span></td>
                  <td className="p-3 text-center"><button onClick={() => setHistoryLot({ symbol: lot.trade.asset, id: lot.trade.id })} className="text-[#ADC6FF]">แก้ไข / ลบไม้</button></td>
                </tr>; })}
                {journal.map(trade => (
                  <tr key={trade.id} className="border-b border-border hover:bg-white/5">
                    <td className="p-3 text-xs text-gray-400">{new Date(trade.date).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="p-3 font-black text-white">{trade.symbol}</td>
                    <td className="p-3 text-xs font-bold text-gray-400">{trade.entriesCount} ไม้</td>
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

    </div>
  );
}






