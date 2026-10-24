"use client";
import { formatLedgerAmount } from "@/src/lib/ledger-display";
import { bucketNativeAmount } from '@/src/lib/native-money';

import { Modal } from "@/src/components/Modal";
import { LedgerTable, LedgerRow } from "@/src/components/LedgerTable";
import { DensityToggle } from "@/src/components/InterfaceControls";
import { FinanceIcon } from "@/src/components/FinanceIcon";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "motion/react";
import {
  Search,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Check,
  Tag,
  X,
  CalendarDays,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  TrendingDown,
  Loader2,
  ReceiptText,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { createPortal } from "react-dom";
import { AnimatedNumber } from "@/src/components/AnimatedNumber";
import { DateRangeBar, DateRangeState, getDateBounds, isInRange, toLocalDateKey } from "@/src/components/DateRangeBar";
import { BrokerLedgerView } from "@/src/components/BrokerLedgerView";
import { getLocalDateKey, localDateKeyToIso } from "@/src/lib/local-date";

const INCOME_PRESET_KEYS = [
  { icon: "wallet", key: "salary" },
  { icon: "laptop", key: "freelance" },
  { icon: "investment", key: "investment" },
  { icon: "coins", key: "dividend" },
  { icon: "gift", key: "gift" },
  { icon: "home", key: "rental" },
];

const EXPENSE_PRESET_KEYS = [
  { icon: "food", key: "food" },
  { icon: "transport", key: "transport" },
  { icon: "utilities", key: "utilities" },
  { icon: "entertainment", key: "entertainment" },
  { icon: "shopping", key: "shopping" },
  { icon: "health", key: "health" },
  { icon: "education", key: "education" },
  { icon: "coffee", key: "coffee" },
  { icon: "travel", key: "travel" },
];

function SuccessConfetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<any[]>([]);
  useEffect(() => {
    if (active) {
      setParticles(
        Array.from({ length: 50 }).map((_, i) => ({
          id: i,
          x: Math.random() * window.innerWidth,
          color: ["#4EDEA3", "#E9C349", "#ADC6FF", "#ffffff"][Math.floor(Math.random() * 4)],
          size: Math.random() * 8 + 5,
          delay: Math.random() * 0.25,
        }))
      );
    } else setParticles([]);
  }, [active]);
  if (!active || typeof window === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -40, x: p.x, opacity: 1, scale: 0 }}
          animate={{ y: window.innerHeight + 40, x: p.x + (Math.random() - 0.5) * 180, opacity: [1, 1, 0], scale: 1 }}
          transition={{ duration: 1.4 + Math.random() * 0.6, delay: p.delay, ease: "easeOut" }}
          style={{ position: "absolute", width: p.size, height: p.size, backgroundColor: p.color, borderRadius: "50%" }}
        />
      ))}
    </div>,
    document.body
  );
}

function getCategoryIcon(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("food") || c.includes("อาหาร") || c.includes("lunch") || c.includes("dinner")) return "food";
  if (c.includes("coffee") || c.includes("กาแฟ")) return "coffee";
  if (c.includes("transport") || c.includes("taxi") || c.includes("grab") || c.includes("เดินทาง")) return "transport";
  if (c.includes("travel") || c.includes("flight") || c.includes("ท่องเที่ยว")) return "travel";
  if (c.includes("util") || c.includes("electric") || c.includes("internet") || c.includes("สาธารณ")) return "utilities";
  if (c.includes("entertainment") || c.includes("บันเทิง") || c.includes("movie")) return "entertainment";
  if (c.includes("shopping") || c.includes("ช้อปปิ้ง")) return "shopping";
  if (c.includes("health") || c.includes("สุขภาพ") || c.includes("medical")) return "health";
  if (c.includes("education") || c.includes("การศึกษา") || c.includes("book")) return "education";
  if (c.includes("salary") || c.includes("เงินเดือน")) return "wallet";
  if (c.includes("freelance") || c.includes("ฟรีแลนซ์")) return "laptop";
  if (c.includes("invest") || c.includes("ลงทุน")) return "investment";
  if (c.includes("dividend") || c.includes("ปันผล")) return "coins";
  if (c.includes("gift") || c.includes("ของขวัญ")) return "gift";
  if (c.includes("rental") || c.includes("rent") || c.includes("ค่าเช่า")) return "home";
  return "card";
}

function formatDateGroup(dateStr: string, todayLabel: string, yesterdayLabel: string, language: string): string {
  // Parse as local date (dateStr is a YYYY-MM-DD group key, already local)
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const locale = language === "th" ? "th-TH" : "en-US";
  const dateSuffix = d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  if (d.toDateString() === today.toDateString()) return `${todayLabel} (${dateSuffix})`;
  if (d.toDateString() === yesterday.toDateString()) return `${yesterdayLabel} (${dateSuffix})`;

  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) {
    const weekday = d.toLocaleDateString(locale, { weekday: "long" });
    return `${weekday} (${dateSuffix})`;
  }
  return d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function LedgerPage() {
  const {
    t, formatMoney, cashActivities, bucketActivities, trades, moneyBuckets, removeCashActivity, removeBucketActivity, language, currency, exchangeRates,
    addCashActivity, updateCashActivity, updateMoneyBucket, addBucketActivity, addToast,
    customCategories, addCustomCategory, removeCustomCategory,
    activePortfolio, allBrokerageAccounts, brokerageAccounts, portfolios,
  } = useApp();

  const [activePanel, setActivePanel] = useState<"INCOME" | "EXPENSE" | null>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [editingRow, setEditingRow] = useState<LedgerRow|null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string, source: 'cash' | 'bucket' | 'trade' } | null>(null);
  const [activityFilter, setActivityFilter] = useState<"all" | "cash" | "transfer" | "trade">("all");
  // Swipe-to-delete (mobile): which row is currently swiped open, plus refs to detect outside taps.
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [actionCurrency, setActionCurrency] = useState<"USD" | "THB">(currency as "USD" | "THB");
  const [depositTo, setDepositTo] = useState<string>("auto_split");
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [isDepositToOpen, setIsDepositToOpen] = useState(false);
  const [recordDate, setRecordDate] = useState(getLocalDateKey);

  // Wallet Selection
  const [selectedWalletId, setSelectedWalletId] = useState<string>("all");

  // Date selection defaults to the current month, with All and Custom ranges available.
  const [dateRange, setDateRange] = useState<DateRangeState>(() => ({
    mode: "month",
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  }));
  const inputRef = useRef<HTMLInputElement>(null);

  // Only enable the swipe gesture below the sm breakpoint (matches Tailwind's `sm:` cutoff).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Close an open swipe row when the user taps elsewhere or scrolls, so the delete
  // button never stays exposed longer than the deliberate swipe gesture.
  useEffect(() => {
    if (!swipedId) return;
    const closeIfOutside = (e: Event) => {
      const el = rowRefs.current[swipedId];
      if (el && !el.contains(e.target as Node)) setSwipedId(null);
    };
    const closeOnScroll = () => setSwipedId(null);
    document.addEventListener("pointerdown", closeIfOutside);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [swipedId]);

  const formatDisplay = (displayAmount: number, displayCurrency: "USD" | "THB" = currency as "USD" | "THB") => {
    const formatter = new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
      style: "currency",
      currency: displayCurrency,
      minimumFractionDigits: 2,
      currencyDisplay: "narrowSymbol",
    });
    let formatted = formatter.format(displayAmount);
    if (language === "th" && displayCurrency === "USD") formatted = formatted.replace("US$", "$");
    formatted = formatted.replace("THB", "฿").replace("฿ ", "฿");
    return formatted;
  };

  const bucketCurrency = (bucket: { currency?: string }) => (bucket.currency === "THB" ? "THB" : "USD");

  const bucketsById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; icon?: string }>();
    moneyBuckets.forEach(b => map.set(b.id, b));
    return map;
  }, [moneyBuckets]);

  // Ledger totals must always be added in one currency. `cash_activities.amount`
  // is stored in USD, while `bucket_activities.amount` is stored in that
  // bucket's own currency. Adding their original amounts together caused THB
  // and USD values to be treated as if they were the same unit.
  const formatBucketAmount = (bucket: { currency?: string }, amount: number) => {
    const bCur = bucketCurrency(bucket) as "USD" | "THB";
    const targetCur = currency as "USD" | "THB";
    if (bCur === targetCur) {
      return formatDisplay(amount, targetCur);
    } else {
      const usd = amount / (exchangeRates[bCur] || 1);
      const converted = usd * (exchangeRates[targetCur] || 1);
      return formatDisplay(converted, targetCur);
    }
  };


  const allMergedActivities = useMemo(() => {
    // 1. Cash Activities (Income/Expense and Transfers)
    // cashActivities already contains ALL bucket deposits/withdrawals/transfers as well as regular income/expenses.
    const cash = cashActivities.map(a => {
      const isTransfer = a.type === 'DEPOSIT' || a.type === 'WITHDRAW' || a.isTransfer;
      return {
        id: a.id,
        type: (a.type === "INCOME" || a.type === "DEPOSIT") ? "INCOME" : "EXPENSE" as const,
        amountUSD: a.amountUSD ?? 0,
        originalAmount: a.originalAmount ?? a.amount ?? 0,
        originalCurrency: (a.currency || currency) as string,
        category: a.category,
        date: a.date,
        note: a.note,
        source: 'cash' as const,
        bucketId: a.bucketId || 'unassigned',
        walletLabel: undefined as string | undefined,
        filterType: isTransfer ? 'transfer' as const : 'cash' as const
      };
    });

    // 2. Trades (Investments)
    const tradesList = trades.filter(trade => trade.type !== 'IMPORT').map(trade => {
      const account = allBrokerageAccounts.find(item => item.id === trade.brokerageAccountId)
        || brokerageAccounts.find(item => item.id === trade.brokerageAccountId);
      const broker = portfolios.find(item => item.id === (account?.portfolioId || trade.portfolioId));
      const walletLabel = trade.brokerageAccountId
        ? `${broker?.name || 'Broker'} · ${account?.name || 'เงินสดโบรก'} (${account?.currency || trade.currency})`
        : undefined;
      const isCashIn = trade.type === 'SELL' || trade.type === 'DIVIDEND' || trade.type === 'SHORT';
      const tCurrency = trade.currency || 'USD';
      const amt = trade.originalAmount ?? trade.amountUSD;
      return {
        id: `trade-${trade.id}`,
        type: isCashIn ? "INCOME" : "EXPENSE" as const,
        amountUSD: trade.amountUSD,
        originalAmount: amt,
        originalCurrency: trade.originalAmount ? tCurrency : 'USD',
        category: `${trade.type} ${trade.asset}`,
        date: trade.date,
        note: trade.tag || `Asset Trade (${trade.type})`,
        source: 'trade' as const,
        bucketId: trade.brokerageAccountId ? `broker:${trade.brokerageAccountId}` : trade.sourceBucketId || 'unassigned',
        walletLabel,
        filterType: 'trade' as const,
        portfolioId: trade.portfolioId,
        tradeDbId: trade.dbId,
      };
    });

    return [...cash, ...tradesList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cashActivities, trades, currency, allBrokerageAccounts, brokerageAccounts, portfolios]);

  const dateBounds = getDateBounds(dateRange);

  const periodLabel = useMemo(() => {
    if (dateRange.mode === "all") return language === "th" ? "ทั้งหมด" : "All time";
    if (dateRange.mode === "month") {
      return new Date(dateRange.year, dateRange.month, 1).toLocaleDateString(
        language === "th" ? "th-TH" : "en-US",
        { month: "short", year: "numeric" }
      );
    }
    if (dateRange.mode === "custom") return `${dateRange.from} – ${dateRange.to}`;
    return dateRange.mode.toUpperCase();
  }, [dateRange, language]);

  const records = useMemo(() => {
    return allMergedActivities
      .filter(a => isInRange(a.date, dateBounds))
      .filter(a => selectedWalletId === 'all' ? true : a.bucketId === selectedWalletId)
      .filter(a => activityFilter === 'all' ? true : a.filterType === activityFilter)
      .filter(a => `${a.category} ${a.note || ''} ${a.walletLabel || ''}`.toLowerCase().includes(query.toLowerCase()));
  }, [allMergedActivities, dateBounds, selectedWalletId, activityFilter, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof records> = {};
    records.forEach(r => {
      // Use local date key (not UTC) to group correctly for UTC+7 users
      const key = toLocalDateKey(r.date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [records]);

  const periodStats = useMemo(() => {
    const inc = records.filter(a => a.type === "INCOME").reduce((s, a) => s + a.amountUSD, 0);
    const exp = records.filter(a => a.type === "EXPENSE").reduce((s, a) => s + a.amountUSD, 0);
    return { inc, exp, net: inc - exp };
  }, [records]);

  const handleOpenPanel = (type: "INCOME" | "EXPENSE") => {
    setActivePanel(type);
    setAmount("");
    setCategory("");
    setNote("");
    setIsCustomCategory(false);
    setCustomCategory("");
    setRecordDate(getLocalDateKey());
    setActionCurrency(currency as "USD" | "THB");
    if (selectedWalletId === 'all') {
      setDepositTo(type === 'INCOME' ? 'auto_split' : 'unassigned');
    } else {
      setDepositTo(selectedWalletId);
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = isCustomCategory ? customCategory : category;
    if (!amount || Number(amount) <= 0 || !finalCategory) return;
    setIsAdding(true);
    try {
      const raw = Number(amount);
      const isToday = recordDate === getLocalDateKey();
      const now = isToday ? new Date().toISOString() : localDateKeyToIso(recordDate);
      const usdAmt = raw / (exchangeRates[actionCurrency] || 1);

      if (activePanel === 'INCOME' && depositTo === 'auto_split') {
        moneyBuckets.forEach(b => bucketNativeAmount({ original_amount: raw, currency: actionCurrency }, b.currency));
        const totalTargetPercent = moneyBuckets.reduce((s, b) => s + b.targetPercent, 0);
        if (totalTargetPercent > 0) {
          // One source record for the income; generated deposits below are
          // balance transfers and are deliberately excluded from the ledger.
          await addCashActivity({
            type: "INCOME",
            amountUSD: usdAmt,
            category: finalCategory,
            date: now,
            note: t("distributed"),
            currency: actionCurrency,
            rateAtTime: exchangeRates[actionCurrency] || 1,
            originalAmount: raw,
          });

          moneyBuckets.forEach((b) => {
            const splitPercent = b.targetPercent / totalTargetPercent;
            const splitAmount = raw * splitPercent;
            if (splitAmount > 0) {
              const targetCurrency = bucketCurrency(b);
              let usd = splitAmount / (exchangeRates[actionCurrency] || 1);
              const splitBucketAmount = bucketNativeAmount({ original_amount: splitAmount, currency: actionCurrency }, b.currency);

              updateMoneyBucket(b.id, { currentAmount: b.currentAmount + splitBucketAmount });
              addBucketActivity({
                bucketId: b.id,
                bucketName: b.name,
                type: "income_split",
                amount: splitBucketAmount,
                date: now,
                note: `${t("distributed")} ${b.targetPercent}% → ${t(b.name) || b.name}`,
                currency: targetCurrency,
                rateAtTime: exchangeRates[targetCurrency] || 1,
                originalAmount: splitBucketAmount,
              });
              addCashActivity({
                type: "DEPOSIT",
                amountUSD: usd,
                category: finalCategory,
                date: now,
                bucketId: b.id,
                note: `Income distribution ${b.targetPercent}% - ${t(b.name) || b.name}`,
                currency: actionCurrency,
                rateAtTime: exchangeRates[actionCurrency] || 1,
                originalAmount: splitAmount,
                isTransfer: true,
              });
            }
          });
        }
      } else if (depositTo === 'unassigned') {
        await addCashActivity({
          type: activePanel!,
          amountUSD: usdAmt,
          category: finalCategory,
          date: now,
          note: note || undefined,
          currency: actionCurrency as any,
          rateAtTime: exchangeRates[actionCurrency] || 1,
          originalAmount: raw,
        });
      } else {
        const bucket = moneyBuckets.find(b => b.id === depositTo);
        if (bucket) {
          const targetCurrency = bucketCurrency(bucket);
          const bucketAmount = bucketNativeAmount({ original_amount: raw, currency: actionCurrency }, bucket.currency);
          const type = activePanel === 'INCOME' ? 'deposit' : 'withdraw';

          await addBucketActivity({
            bucketId: bucket.id,
            bucketName: bucket.name,
            type,
            amount: bucketAmount,
            date: now,
            note: note || undefined,
            currency: targetCurrency,
            rateAtTime: exchangeRates[targetCurrency] || 1,
            originalAmount: bucketAmount,
          });
          const newAmount = activePanel === 'INCOME' ? bucket.currentAmount + bucketAmount : Math.max(0, bucket.currentAmount - bucketAmount);
          await updateMoneyBucket(bucket.id, { currentAmount: newAmount });

          await addCashActivity({
            type: activePanel!,
            amountUSD: usdAmt,
            category: finalCategory,
            date: now,
            bucketId: bucket.id,
            note: note || undefined,
            currency: actionCurrency as any,
            rateAtTime: exchangeRates[actionCurrency] || 1,
            originalAmount: raw,
          });
        }
      }

      if (isCustomCategory && customCategory.trim()) {
        const trimmed = customCategory.trim();
        const alreadySaved = customCategories.some(
          c => c.type === activePanel && c.label.toLowerCase() === trimmed.toLowerCase()
        );
        if (!alreadySaved) {
          await addCustomCategory(activePanel!, trimmed);
        }
      }

      if (activePanel === "INCOME") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 1700);
      }

      const recordD = new Date(now);
      const isCurrentlyViewingRecordMonth = dateRange.mode === "month" && dateRange.year === recordD.getFullYear() && dateRange.month === recordD.getMonth();

      if (dateRange.mode !== "all" && !isCurrentlyViewingRecordMonth) {
        setDateRange({ mode: "month", year: recordD.getFullYear(), month: recordD.getMonth() });
      }

      setActivePanel(null);
    } catch (err) {
      addToast(t("errorOccurred"), "error");
    } finally {
      setIsAdding(false);
    }
  };

  // Saves a new custom category to the user's list right away (Supabase, via AppContext),
  // independent of the amount/transaction form. This is how a category gets added without
  // ever creating a $0 or placeholder record in the ledger.
  const handleAddCustomCategory = async () => {
    const trimmed = customCategory.trim();
    if (!trimmed || !activePanel) return;
    const alreadySaved = customCategories.some(
      c => c.type === activePanel && c.label.toLowerCase() === trimmed.toLowerCase()
    );
    if (!alreadySaved) {
      await addCustomCategory(activePanel, trimmed);
    }
    // Select it immediately so the user can go straight to entering an amount.
    setCategory(trimmed);
    setIsCustomCategory(false);
    setCustomCategory("");
  };

  const handleDelete = async (item: { id: string, source: 'cash' | 'bucket' | 'trade' }) => {
    if (item.source === 'trade') {
      addToast(t("cannotDeleteTradeFromLedger") || "Cannot delete trades from Ledger", "error");
      setToDelete(null);
      return;
    }
    if (item.source === 'cash') {
      await removeCashActivity(item.id);
    } else {
      await removeBucketActivity(item.id);
    }
    setToDelete(null);
  };

  // UI calculations
  const totalUnassignedUSD = cashActivities
    .filter(act => !act.bucketId && (act.type === 'INCOME' || act.type === 'EXPENSE'))
    .reduce((acc, act) => acc + (act.type === 'INCOME' ? (act.amountUSD || 0) : -(act.amountUSD || 0)), 0);

  // Total balance across all money buckets (converted to display currency)
  const totalAllWallets = useMemo(() => {
    return moneyBuckets.reduce((acc, b) => {
      const bCur = bucketCurrency(b) as "USD" | "THB";
      const targetCur = currency as "USD" | "THB";
      let amountInTarget: number;
      if (bCur === targetCur) {
        amountInTarget = b.currentAmount;
      } else {
        const usd = b.currentAmount / (exchangeRates[bCur] || 1);
        amountInTarget = usd * (exchangeRates[targetCur] || 1);
      }
      return acc + amountInTarget;
    }, 0);
  }, [moneyBuckets, currency, exchangeRates]);

  // Trading (broker) portfolios, e.g. Webull, get their own ledger: cash wallets inside the
  // broker, bucket→broker transfers, and buy/sell/dividend history.
  // Must stay below every hook above, so hook order never changes.
  if (activePortfolio?.kind === "trading") {
    return (
      <BrokerLedgerView
        portfolio={activePortfolio}
        dateRange={dateRange}
        setDateRange={setDateRange}
      />
    );
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col pb-24 lg:pb-8">
      <div className="ft-ledger-content w-full">
        <div className="ft-ledger-toolbar">
          <h1 className="text-2xl font-semibold">{language==='th'?'สมุดรายการ':'Ledger'}</h1>
          <label className="ft-ledger-search"><Search size={16}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} aria-label={language==='th'?'ค้นหารายการ':'Search transactions'} placeholder={language==='th'?'ค้นหารายการ':'Search transactions'}/></label>
          <DensityToggle />
          <button className="ft-button ft-secondary" aria-pressed={selectMode} onClick={()=>setSelectMode(!selectMode)}>{language==='th'?'เลือก':'Select'}</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <button className="ft-button ft-secondary" aria-expanded={filtersOpen} aria-controls="ledger-filters" onClick={()=>setFiltersOpen(!filtersOpen)}><CalendarDays size={15}/>{periodLabel}<ChevronDown size={14} className={filtersOpen?'rotate-180':''}/></button>
          <div className="flex gap-2"><button className="ft-button border border-gain text-gain hover:bg-gain/10" onClick={()=>handleOpenPanel('INCOME')}><ArrowDownLeft size={16}/>{t('income')}</button><button className="ft-button border border-loss text-loss hover:bg-loss/10" onClick={()=>handleOpenPanel('EXPENSE')}><ArrowUpRight size={16}/>{t('expense')}</button></div>
        </div>
        <div id="ledger-filters" hidden={!filtersOpen} className="mt-3 space-y-3">
          <DateRangeBar value={dateRange} onChange={setDateRange}/>
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('wallet')}>
            {Array.from(new Map([['all',t('allWallets')],['unassigned',t('unassigned')],...moneyBuckets.map(b=>[b.id,b.name] as [string,string]),...Array.from(new Map(allMergedActivities.filter(item=>item.walletLabel).map(item=>[item.bucketId,item.walletLabel!])).entries())]).entries()).map(([id,label])=><button key={id} aria-pressed={selectedWalletId===id} onClick={()=>setSelectedWalletId(id)} className={`ft-chip ${selectedWalletId===id?'is-selected':''}`}>{label}</button>)}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">{([['all','all'],['cash','incomeExpense'],['transfer','transfers'],['trade','investments']] as const).map(([id,label])=><button key={id} aria-pressed={activityFilter===id} onClick={()=>setActivityFilter(id)} className={`ft-chip ${activityFilter===id?'is-selected':''}`}>{t(label)}</button>)}</div>
        </div>
        <div className="ft-ledger-summary my-4" aria-label={periodLabel}>
          <div><span>{language==='th'?'เข้า':'IN'}</span><strong className="text-gain">+{formatMoney(periodStats.inc)}</strong></div>
          <div><span>{language==='th'?'ออก':'OUT'}</span><strong className="text-loss">−{formatMoney(periodStats.exp)}</strong></div>
          <div><span>{language==='th'?'สุทธิ':'NET'}</span><strong className={periodStats.net>=0?'text-gain':'text-loss'}>{periodStats.net>=0?'+':''}{formatMoney(periodStats.net)}</strong></div>
        </div>
        {records.length ? <LedgerTable rows={records} selectMode={selectMode} onBulkDelete={async items=>{for(const item of items)await handleDelete(item);}} onEdit={item=>{setEditingRow(item);setEditCategory(item.category);setEditNote(item.note||'');setEditDate(toLocalDateKey(item.date));}} onDuplicate={item=>{handleOpenPanel(item.type as 'INCOME'|'EXPENSE');setAmount(String(item.originalAmount??''));setActionCurrency(item.originalCurrency as 'USD'|'THB');setCategory(item.category);setNote(item.note||'');setDepositTo(item.bucketId);}} onDelete={item=>setToDelete({id:item.id,source:item.source})} categoryIcon={getCategoryIcon} walletName={item=>item.walletLabel||bucketsById.get(item.bucketId)?.name||t('unassigned')} dateLabel={day=>formatDateGroup(day,t('today'),t('yesterday'),language)}/> : <div className="py-16 text-center"><ReceiptText size={28} className="mx-auto mb-3 text-muted"/><h2 className="font-semibold">{language==='th'?'ไม่พบรายการในช่วงนี้':'No transactions in this period'}</h2><p className="mt-2 text-sm text-muted">{language==='th'?'เปลี่ยนตัวกรองหรือบันทึกรายการแรก':'Change your filters or record your first transaction.'}</p></div>}
      </div>

      {/* ─── 1-Tap Entry Modal & Mobile Buttons ───────────────────────────── */}
      <Modal isOpen={!!activePanel} onClose={()=>setActivePanel(null)} title={activePanel==='INCOME'?t('addIncomeTitle'):t('addExpenseTitle')} initialFocusRef={inputRef} footer={<button type="submit" form="ledger-entry" disabled={isAdding || !amount || (!isCustomCategory && !category) || (isCustomCategory && !customCategory)} className="ft-button ft-primary w-full disabled:opacity-50">{isAdding?<Loader2 size={18} className="animate-spin"/>:<Check size={18}/>} {t('saveRecord')}</button>}>
              <form id="ledger-entry" onSubmit={handleQuickSubmit}>
                <div className="space-y-3">
                  {/* Deposit To / Pay From Selector */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsDepositToOpen(!isDepositToOpen)}
                      className="w-full bg-foreground/5 hover:bg-foreground/10 border border-foreground/5 rounded-xl px-4 py-3 flex items-center justify-between transition-colors"
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-xs text-gray-500 uppercase font-black tracking-wider">
                          {activePanel === "INCOME" ? "Deposit To" : "Pay From"}
                        </span>
                        <span className="text-sm font-bold text-foreground mt-0.5">
                          {depositTo === 'auto_split' ? 'Auto-split' :
                            depositTo === 'unassigned' ? t('unassigned') :
                              (moneyBuckets.find(b => b.id === depositTo)?.name || 'Select Wallet')}
                        </span>
                      </div>
                      <ChevronDown size={16} className={cn("text-gray-400 transition-transform", isDepositToOpen && "rotate-180")} />
                    </button>

                    <AnimatePresence>
                      {isDepositToOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2 bg-surface-2 border border-foreground/10 rounded-xl shadow-2xl flex flex-col">
                            {activePanel === "INCOME" && (
                              <button
                                type="button"
                                onClick={() => { setDepositTo("auto_split"); setIsDepositToOpen(false); }}
                                className="text-left px-4 py-3 hover:bg-foreground/5 transition-colors border-b border-foreground/5 flex items-center gap-2"
                              >
                                <FinanceIcon name="transfer" size={16} />
                                <span className="text-sm font-bold text-foreground">Auto-split</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setDepositTo("unassigned"); setIsDepositToOpen(false); }}
                              className="text-left px-4 py-3 hover:bg-foreground/5 transition-colors border-b border-foreground/5 flex items-center gap-2"
                            >
                              <ReceiptText size={14} className="text-gray-400" />
                              <span className="text-sm font-bold text-foreground">{t("unassigned")}</span>
                            </button>
                            {moneyBuckets.map(b => (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => { setDepositTo(b.id); setIsDepositToOpen(false); }}
                                className="text-left px-4 py-3 hover:bg-foreground/5 transition-colors flex items-center gap-2"
                              >
                                <span><FinanceIcon name={b.icon} /></span>
                                <span className="text-sm font-bold text-foreground">{b.name}</span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div>
                    <div className="relative group flex items-center">
                      <button
                        type="button"
                        aria-label={language==='th'?'เปลี่ยนสกุลเงิน':'Switch entry currency'}
                        onClick={() => setActionCurrency(prev => prev === "USD" ? "THB" : "USD")}
                        className="absolute left-3 z-10 w-8 h-8 rounded-full bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center text-sm font-black text-foreground transition-colors"
                      >
                        {actionCurrency === "THB" ? "฿" : "$"}
                      </button>
                      <input
                        ref={inputRef}
                        autoFocus
                        aria-label={t("amount")}
                        type="number"
                        step="any"
                        required
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="ft-amount-input w-full bg-background border border-border rounded-xl py-3 pl-14 pr-4 text-3xl font-semibold text-foreground placeholder:text-muted"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto py-1">
                    {(activePanel === "INCOME" ? INCOME_PRESET_KEYS : EXPENSE_PRESET_KEYS).map((p) => {
                      const isSelected = !isCustomCategory && category === (t(p.key) || p.key);
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => {
                            setIsCustomCategory(false);
                            setCategory(t(p.key) || p.key);
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-2 rounded-xl border flex-shrink-0 transition-all text-xs font-bold",
                            isSelected
                              ? (activePanel === "INCOME" ? "bg-primary/20 border-primary text-primary" : "bg-loss/20 border-loss text-loss")
                              : "bg-foreground/5 border-transparent text-gray-400 hover:bg-foreground/10 hover:text-foreground"
                          )}
                        >
                          <span><FinanceIcon name={p.icon} size={16} /></span>
                          <span>{t(p.key) || p.key}</span>
                        </button>
                      );
                    })}
                    {/* Custom categories the user has saved before (from Supabase via AppContext),
                        so they can be tapped directly next time instead of retyping them. */}
                    {activePanel && customCategories
                      .filter(c => c.type === activePanel)
                      .filter(c => !(activePanel === "INCOME" ? INCOME_PRESET_KEYS : EXPENSE_PRESET_KEYS)
                        .some(p => (t(p.key) || p.key).toLowerCase() === c.label.toLowerCase()))
                      .map((c) => {
                        const isSelected = !isCustomCategory && category === c.label;
                        return (
                          <div key={c.id} className="inline-flex items-center gap-1 rounded-xl border border-border">
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomCategory(false);
                              setCategory(c.label);
                            }}
                            className={cn(
                              "group/chip flex items-center gap-1.5 px-3 py-2 rounded-xl border flex-shrink-0 transition-all text-xs font-bold",
                              isSelected
                                ? (activePanel === "INCOME" ? "bg-primary/20 border-primary text-primary" : "bg-loss/20 border-loss text-loss")
                                : "bg-foreground/5 border-transparent text-gray-400 hover:bg-foreground/10 hover:text-foreground"
                            )}
                          >
                            <span><FinanceIcon name={c.icon || "tag"} size={16} /></span>
                            <span>{c.label}</span>
                          </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCustomCategory(c.id);
                                if (category === c.label) {
                                  setCategory("");
                                }
                              }}
                              className="ft-icon-button"
                              aria-label={t("delete") || "Remove"}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        );
                      })}
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCategory(true);
                        setCategory("");
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-xl border flex-shrink-0 transition-all text-xs font-bold",
                        isCustomCategory
                          ? (activePanel === "INCOME" ? "bg-primary/20 border-primary text-primary" : "bg-loss/20 border-loss text-loss")
                          : "bg-foreground/5 border-transparent text-gray-400 hover:bg-foreground/10 hover:text-foreground"
                      )}
                    >
                      <Tag size={12} />
                      <span>+ Custom</span>
                    </button>
                  </div>

                  <AnimatePresence>
                    {isCustomCategory && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customCategory}
                            onChange={e => setCustomCategory(e.target.value)}
                            placeholder={t("ledgerTypeCategory") || "Type your category name..."}
                            className="flex-1 min-w-0 bg-background border border-foreground/5 focus:border-foreground/20 rounded-xl px-4 py-3 text-sm font-medium text-foreground placeholder-gray-500 outline-none transition-colors"
                          />
                          {/* Saves the category to the user's list right away (no amount needed), so it
                              never creates a fake $0 transaction in the ledger. The main Save Record
                              button below still records the real transaction as usual. */}
                          <button
                            type="button"
                            onClick={handleAddCustomCategory}
                            disabled={!customCategory.trim()}
                            className={cn(
                              "px-4 rounded-xl text-sm font-black flex-shrink-0 transition-all",
                              customCategory.trim()
                                ? (activePanel === "INCOME" ? "bg-primary text-primary-foreground hover:brightness-110" : "bg-loss text-primary-foreground hover:brightness-110")
                                : "bg-foreground/5 text-gray-600 cursor-not-allowed"
                            )}
                          >
                            {t("ledgerAddCategory") || "Add"}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      aria-label={t("noteOptional")}
                      type="text"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder={t("noteOptional") || "Note (Optional)"}
                      className="w-full bg-background border border-foreground/5 focus:border-foreground/20 rounded-xl px-4 py-3 text-sm font-medium text-foreground placeholder-gray-500 outline-none transition-colors mb-2"
                    />
                    <input
                      type="date"
                      aria-label={t("date")}
                      value={recordDate}
                      onChange={e => setRecordDate(e.target.value)}
                      className="w-full bg-background border border-foreground/5 focus:border-foreground/20 rounded-xl px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

              </form>
      </Modal>

      <Modal isOpen={!!editingRow} onClose={()=>setEditingRow(null)} title={language==='th'?'แก้ไขรายละเอียด':'Edit details'} footer={<button form="ledger-edit" type="submit" className="ft-button ft-primary" disabled={!editCategory.trim()}>{t('saveRecord')}</button>}>
        <form id="ledger-edit" className="space-y-4" onSubmit={async event=>{event.preventDefault();if(!editingRow)return;await updateCashActivity(editingRow.id,{category:editCategory.trim(),note:editNote,date:editDate===toLocalDateKey(editingRow.date)?editingRow.date:localDateKeyToIso(editDate)});setEditingRow(null);}}>
          <p className="tabular-nums font-semibold">{editingRow&&formatLedgerAmount(editingRow,currency,exchangeRates,language)}</p><p className="text-xs text-muted">{language==='th'?'แก้ไขหมวดหมู่ บันทึก และวันที่ ยอดเงินและบัญชีคงเดิม':'Edit category, note and date. Amount and account stay as recorded.'}</p>
          <label className="block text-sm">{t('category')}<input autoFocus className="mt-1 w-full rounded-lg border border-border bg-background p-3" value={editCategory} onChange={e=>setEditCategory(e.target.value)} required/></label>
          <label className="block text-sm">{t('noteOptional')}<input className="mt-1 w-full rounded-lg border border-border bg-background p-3" value={editNote} onChange={e=>setEditNote(e.target.value)}/></label>
          <label className="block text-sm">{t('date')}<input type="date" className="mt-1 w-full rounded-lg border border-border bg-background p-3" value={editDate} onChange={e=>setEditDate(e.target.value)} required/></label>
        </form>
      </Modal>
      <ConfirmModal
        isOpen={!!toDelete}
        title={t("confirmDeleteRecord") || "Delete Record?"}
        message={(()=>{const row=records.find(item=>item.id===toDelete?.id&&item.source===toDelete?.source);if(!row)return t('confirmDeleteRecordDesc');const amount=formatLedgerAmount(row,currency,exchangeRates,language);const date=new Date(row.date).toLocaleDateString(language==='th'?'th-TH':'en-GB',{day:'numeric',month:'short'});return language==='th'?`ลบ ${t(row.category)} ${amount} วันที่ ${date}? ไม่สามารถยกเลิกหลังลบได้`:`Delete ${t(row.category)} ${amount} on ${date}? This cannot be undone.`;})()}
        confirmText={t('delete')} cancelText={t('cancel')}
        onConfirm={() => toDelete && handleDelete(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
