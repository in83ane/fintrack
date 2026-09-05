"use client";

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
import { DateRangeBar, DateRangeState, getDateBounds, isInRange } from "@/src/components/DateRangeBar";

const INCOME_PRESET_KEYS = [
  { icon: "💰", key: "salary" },
  { icon: "💻", key: "freelance" },
  { icon: "📈", key: "investment" },
  { icon: "🪙", key: "dividend" },
  { icon: "🎁", key: "gift" },
  { icon: "🏠", key: "rental" },
];

const EXPENSE_PRESET_KEYS = [
  { icon: "🍔", key: "food" },
  { icon: "🚗", key: "transport" },
  { icon: "💡", key: "utilities" },
  { icon: "🎬", key: "entertainment" },
  { icon: "🛍️", key: "shopping" },
  { icon: "🏥", key: "health" },
  { icon: "📚", key: "education" },
  { icon: "☕", key: "coffee" },
  { icon: "✈️", key: "travel" },
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
  if (c.includes("food") || c.includes("อาหาร") || c.includes("lunch") || c.includes("dinner")) return "🍔";
  if (c.includes("coffee") || c.includes("กาแฟ")) return "☕";
  if (c.includes("transport") || c.includes("taxi") || c.includes("grab") || c.includes("เดินทาง")) return "🚗";
  if (c.includes("travel") || c.includes("flight") || c.includes("ท่องเที่ยว")) return "✈️";
  if (c.includes("util") || c.includes("electric") || c.includes("internet") || c.includes("สาธารณ")) return "💡";
  if (c.includes("entertainment") || c.includes("บันเทิง") || c.includes("movie")) return "🎬";
  if (c.includes("shopping") || c.includes("ช้อปปิ้ง")) return "🛍️";
  if (c.includes("health") || c.includes("สุขภาพ") || c.includes("medical")) return "🏥";
  if (c.includes("education") || c.includes("การศึกษา") || c.includes("book")) return "📚";
  if (c.includes("salary") || c.includes("เงินเดือน")) return "💰";
  if (c.includes("freelance") || c.includes("ฟรีแลนซ์")) return "💻";
  if (c.includes("invest") || c.includes("ลงทุน")) return "📈";
  if (c.includes("dividend") || c.includes("ปันผล")) return "🪙";
  if (c.includes("gift") || c.includes("ของขวัญ")) return "🎁";
  if (c.includes("rental") || c.includes("rent") || c.includes("ค่าเช่า")) return "🏠";
  return "💳";
}

function formatDateGroup(dateStr: string, todayLabel: string, yesterdayLabel: string, language: string): string {
  const d = new Date(dateStr);
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
    t, formatMoney, cashActivities, bucketActivities, moneyBuckets, removeCashActivity, removeBucketActivity, language, currency, exchangeRates,
    addCashActivity, updateMoneyBucket, addBucketActivity, addToast,
    customCategories, addCustomCategory, removeCustomCategory,
  } = useApp();

  const [activePanel, setActivePanel] = useState<"INCOME" | "EXPENSE" | null>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [toDelete, setToDelete] = useState<{id: string, source: 'cash' | 'bucket'} | null>(null);
  // Swipe-to-delete (mobile): which row is currently swiped open, plus refs to detect outside taps.
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [actionCurrency, setActionCurrency] = useState<"USD" | "THB">(currency as "USD" | "THB");
  const [depositTo, setDepositTo] = useState<string>("auto_split");
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [isDepositToOpen, setIsDepositToOpen] = useState(false);
  
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


  // Cash activities are the user-facing financial records. Bucket activities
  // are an internal audit trail used to maintain wallet balances, so rendering
  // both would show every income/expense twice (for example, `Food` and
  // `NEXT · Food`).
  const allMergedActivities = useMemo(() => {
    const cash = cashActivities
      .filter(a => !a.isTransfer)
      .map(a => ({
      id: a.id,
      type: (a.type === "INCOME" || a.type === "DEPOSIT") ? "INCOME" : "EXPENSE" as const,
      amountUSD: a.amountUSD ?? 0,
      originalAmount: a.originalAmount ?? a.amount ?? 0,
      originalCurrency: (a.currency || currency) as string,
      category: a.category,
      date: a.date,
      note: a.note,
      source: 'cash' as const,
      bucketId: a.bucketId || 'unassigned'
    }));

    return cash.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cashActivities, currency]);

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
      .filter(a => selectedWalletId === 'all' ? true : a.bucketId === selectedWalletId);
  }, [allMergedActivities, dateBounds, selectedWalletId]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof records> = {};
    records.forEach(r => {
      const key = r.date.split("T")[0];
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
      const now = new Date().toISOString();
      const usdAmt = raw / (exchangeRates[actionCurrency] || 1);

      if (activePanel === 'INCOME' && depositTo === 'auto_split') {
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
              const splitBucketAmount = usd * (exchangeRates[targetCurrency] || 1);
              
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
          const bucketAmount = usdAmt * (exchangeRates[targetCurrency] || 1);
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
          addCustomCategory(activePanel!, trimmed);
        }
      }

      if (activePanel === "INCOME") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 1700);
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

  const handleDelete = (item: {id: string, source: 'cash' | 'bucket'}) => {
    if (item.source === 'cash') {
      removeCashActivity(item.id);
    } else {
      removeBucketActivity(item.id);
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

  return (
    <div className="flex min-h-screen min-w-0 flex-col pb-24 lg:pb-8">
      <SuccessConfetti active={showConfetti} />

      {/* ─── Header & Wallets ────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-[#1C1B1B] to-background border-b border-border sticky top-16 z-40">
        
        {/* Date Range Selector & Desktop Actions */}
        <div className="flex min-w-0 items-center justify-between p-3 sm:p-4">
          <DateRangeBar value={dateRange} onChange={setDateRange} className="min-w-0 flex-1" />
          
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0 ml-4">
            <button 
              onClick={() => handleOpenPanel("INCOME")} 
              className="px-4 py-2 bg-[#4EDEA3]/10 hover:bg-[#4EDEA3]/20 text-[#4EDEA3] rounded-xl font-bold text-xs uppercase tracking-wide flex items-center gap-2 transition-all"
            >
              <ArrowDownLeft size={16} /> INCOME
            </button>
            <button 
              onClick={() => handleOpenPanel("EXPENSE")} 
              className="px-4 py-2 bg-[#FFB4AB]/10 hover:bg-[#FFB4AB]/20 text-[#FFB4AB] rounded-xl font-bold text-xs uppercase tracking-wide flex items-center gap-2 transition-all"
            >
              <ArrowUpRight size={16} /> EXPENSE
            </button>
          </div>
        </div>

        {/* Wallets Selector */}
        <div className="px-3 sm:px-4 pb-4">
          <div className="flex max-w-full items-center gap-2 overflow-x-auto overscroll-x-contain no-scrollbar pb-2">
            <button
              onClick={() => setSelectedWalletId('all')}
              className={cn(
                "flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-all",
                selectedWalletId === 'all' ? "bg-white text-background font-black border-white" : "bg-surface/50 border-white/5 text-gray-400 font-bold hover:bg-white/5"
              )}
            >
              <div className="flex flex-col text-left">
                <span className="text-sm">allWallets</span>
                <span className={cn("text-[10px] leading-none mt-1", selectedWalletId === 'all' ? "opacity-60 text-background" : "opacity-50")}>
                  {formatDisplay(totalAllWallets, currency as "USD" | "THB")}
                </span>
              </div>
            </button>
            <button
              onClick={() => setSelectedWalletId('unassigned')}
              className={cn(
                "flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-all",
                selectedWalletId === 'unassigned' ? "bg-white text-background font-black border-white" : "bg-surface/50 border-white/5 text-gray-400 font-bold hover:bg-white/5"
              )}
            >
              <ReceiptText size={14} className={selectedWalletId === 'unassigned' ? "text-background" : "text-gray-500"} />
              <div className="flex flex-col text-left">
                <span className="text-sm">unassigned</span>
              </div>
            </button>
            {moneyBuckets.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedWalletId(b.id)}
                className={cn(
                  "flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-all",
                  selectedWalletId === b.id ? "bg-white text-background font-black border-white" : "bg-surface/50 border-white/5 text-gray-400 font-bold hover:bg-white/5"
                )}
              >
                <span className={selectedWalletId === b.id ? "text-background" : "opacity-80"}>{b.icon}</span>
                <div className="flex flex-col text-left">
                  <span className="text-xs leading-none">{b.name}</span>
                  {selectedWalletId === b.id && <span className="text-[10px] leading-none mt-1 opacity-70">{formatBucketAmount(b, b.currentAmount)}</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Stats for selected period & wallet */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-3">
            <div className="min-w-0 bg-surface/50 border border-border rounded-xl px-2.5 py-3 sm:px-4 sm:py-4">
              <p className="min-h-4 text-[8px] sm:text-[10px] text-gray-500 uppercase font-bold leading-4 tracking-wide truncate">
                IN <span className="opacity-50">•</span> {periodLabel}
              </p>
              <div className="mt-1.5 whitespace-nowrap text-sm sm:text-xl font-black leading-none tabular-nums text-[#4EDEA3]">{formatMoney(periodStats.inc)}</div>
            </div>
            <div className="min-w-0 bg-surface/50 border border-border rounded-xl px-2.5 py-3 sm:px-4 sm:py-4">
              <p className="min-h-4 text-[8px] sm:text-[10px] text-gray-500 uppercase font-bold leading-4 tracking-wide truncate">
                OUT <span className="opacity-50">•</span> {periodLabel}
              </p>
              <div className="mt-1.5 whitespace-nowrap text-sm sm:text-xl font-black leading-none tabular-nums text-[#FFB4AB]">{formatMoney(periodStats.exp)}</div>
            </div>
            <div className="min-w-0 bg-surface/50 border border-border rounded-xl px-2.5 py-3 sm:px-4 sm:py-4">
              <p className="min-h-4 text-[8px] sm:text-[10px] text-gray-500 uppercase font-bold leading-4 tracking-wide truncate">NET</p>
              <div className={cn("mt-1.5 whitespace-nowrap text-sm sm:text-xl font-black leading-none tabular-nums", periodStats.net >= 0 ? "text-white" : "text-[#FFB4AB]")}>
                {periodStats.net >= 0 ? "+" : ""}{formatMoney(periodStats.net)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Record List ────────────────────────────────────────────── */}
      <div className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 text-3xl">
              📝
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{t("noTransactions") || "No transactions"}</h3>
            <p className="text-sm text-gray-500 max-w-[250px]">{t("addTransactionToSee") || "Record a transaction to see it appear here."}</p>
          </div>
        ) : (
          grouped.map(([dateKey, items]) => {
            const dayNetUSD = items.reduce((total, item) => total + (item.type === "INCOME" ? item.amountUSD : -item.amountUSD), 0);
            const dateLabel = formatDateGroup(dateKey, t("today") || "Today", t("yesterday") || "Yesterday", language);

            return (
            <div key={dateKey}>
              <div className="flex items-center justify-between gap-4 mb-3 pl-1">
                <h3 className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wider">
                  {dateLabel}
                </h3>
                <span className={cn("text-xs font-black tabular-nums", dayNetUSD >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                  {dayNetUSD > 0 ? "+" : ""}{formatMoney(dayNetUSD)}
                </span>
              </div>
              <div className="bg-surface/50 border border-border rounded-2xl overflow-hidden">
                {items.map((item, idx) => {
                  const isIncome = item.type === "INCOME";
                  const itemTime = new Date(item.date).toLocaleTimeString(language === "th" ? "th-TH" : "en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div
                      key={item.id}
                      ref={(el) => { rowRefs.current[item.id] = el; }}
                      className={cn("relative overflow-hidden", idx !== items.length - 1 && "border-b border-border/50")}
                    >
                      <motion.div
                        drag={isMobile ? "x" : false}
                        dragDirectionLock
                        dragConstraints={{ left: -80, right: 0 }}
                        dragElastic={{ left: 0.15, right: 0 }}
                        animate={{ x: isMobile && swipedId === item.id ? -80 : 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        onDragEnd={(_, info: PanInfo) => {
                          if (info.offset.x < -40 || info.velocity.x < -400) {
                            setSwipedId(item.id);
                          } else {
                            setSwipedId(null);
                          }
                        }}
                        onTap={() => {
                          if (swipedId === item.id) setSwipedId(null);
                        }}
                        className="flex touch-pan-y"
                      >
                        {/* Row content: always the full row width and never shrinks, so the delete
                            cell after it stays outside the visible area (clipped by the wrapper's
                            overflow-hidden) until the row is actually dragged left. This doesn't rely
                            on any background opacity to hide the delete button — it's structurally
                            off-screen. */}
                        <div className="w-full flex-shrink-0 bg-surface/50 p-3 sm:p-4 flex items-center justify-between group">
                          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                            <div className={cn(
                              "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-lg sm:text-xl flex-shrink-0 transition-transform group-hover:scale-105",
                              isIncome ? "bg-[#4EDEA3]/10" : "bg-white/5"
                            )}>
                              {getCategoryIcon(item.category)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm sm:text-base font-bold text-white truncate">{t(item.category) || item.category}</h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.note && <span className="text-xs text-gray-500 truncate max-w-[120px] sm:max-w-[200px]">{item.note}</span>}
                                {item.note && <span className="text-gray-700 text-[10px]">•</span>}
                                <span className="text-[10px] text-gray-500 uppercase font-black inline-flex items-center gap-1">
                                  {item.bucketId === 'unassigned' ? (
                                    <>
                                      <ReceiptText size={10} />
                                      {t("unassigned") || "Unassigned"}
                                    </>
                                  ) : (
                                    <>
                                      <span className="normal-case">{bucketsById.get(item.bucketId)?.icon || "💳"}</span>
                                      {bucketsById.get(item.bucketId)?.name || (t("wallet") || "Wallet")}
                                    </>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 sm:gap-4 pl-3">
                            <div className="text-right">
                              <span className={cn(
                                "block text-sm sm:text-base font-black tabular-nums tracking-tight whitespace-nowrap",
                                isIncome ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                              )}>
                                {isIncome ? "+" : "-"}{formatDisplay(item.originalAmount, item.originalCurrency as "USD" | "THB")}
                              </span>
                              <span className="block text-[10px] text-gray-500 whitespace-nowrap">{itemTime}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setToDelete({ id: item.id, source: item.source });
                              }}
                              className="hidden sm:flex w-8 h-8 rounded-xl bg-red-500/10 text-red-400 items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/20 flex-shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Delete cell: sits right after the full-width row above, so it only ever
                            enters the visible area once the row is swiped left. Mobile only. */}
                        <div className="w-20 flex-shrink-0 sm:hidden bg-surface/50 flex items-center justify-center">
                          <button
                            onClick={() => {
                              setToDelete({ id: item.id, source: item.source });
                              setSwipedId(null);
                            }}
                            className="w-11 h-11 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center active:bg-red-500/20 transition-colors"
                            aria-label={t("delete") || "Delete"}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            </div>
          )})
        )}
      </div>

      {/* ─── 1-Tap Entry Modal & Mobile Buttons ───────────────────────────── */}
      <AnimatePresence>
        {activePanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 sm:backdrop-blur-sm pointer-events-auto"
            onClick={() => setActivePanel(null)}
          >
            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 50, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", bounce: 0.4, duration: 0.6 }}
              className="bg-surface/95 backdrop-blur-3xl border border-white/10 rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-sm sm:max-w-md max-h-[88vh] sm:max-h-[85vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-5 pb-4 shrink-0">
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider",
                  activePanel === "INCOME" ? "bg-[#4EDEA3]/20 text-[#4EDEA3]" : "bg-[#FFB4AB]/20 text-[#FFB4AB]"
                )}>
                  {activePanel === "INCOME" ? (t("addIncome") || "Add Income") : (t("addExpense") || "Add Expense")}
                </span>
                <button onClick={() => setActivePanel(null)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleQuickSubmit} className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-2 space-y-4">
                  {/* Deposit To / Pay From Selector */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsDepositToOpen(!isDepositToOpen)}
                      className="w-full bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between transition-colors"
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-[10px] text-gray-500 uppercase font-black tracking-wider">
                          {activePanel === "INCOME" ? "Deposit To" : "Pay From"}
                        </span>
                        <span className="text-sm font-bold text-white mt-0.5">
                          {depositTo === 'auto_split' ? '✨ Auto-split' : 
                           depositTo === 'unassigned' ? 'Unassigned' : 
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
                          <div className="mt-2 bg-[#1C1C1E] border border-white/10 rounded-xl shadow-2xl flex flex-col">
                            {activePanel === "INCOME" && (
                              <button
                                type="button"
                                onClick={() => { setDepositTo("auto_split"); setIsDepositToOpen(false); }}
                                className="text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 flex items-center gap-2"
                              >
                                <span>✨</span>
                                <span className="text-sm font-bold text-white">Auto-split</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setDepositTo("unassigned"); setIsDepositToOpen(false); }}
                              className="text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 flex items-center gap-2"
                            >
                              <ReceiptText size={14} className="text-gray-400" />
                              <span className="text-sm font-bold text-white">Unassigned</span>
                            </button>
                            {moneyBuckets.map(b => (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => { setDepositTo(b.id); setIsDepositToOpen(false); }}
                                className="text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center gap-2"
                              >
                                <span>{b.icon}</span>
                                <span className="text-sm font-bold text-white">{b.name}</span>
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
                        onClick={() => setActionCurrency(prev => prev === "USD" ? "THB" : "USD")}
                        className="absolute left-3 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm font-black text-white transition-colors"
                      >
                        {actionCurrency === "THB" ? "฿" : "$"}
                      </button>
                      <input
                        ref={inputRef}
                        type="number"
                        step="any"
                        required
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-background border-2 border-white/5 focus:border-white/20 rounded-[1.5rem] py-4 pl-14 pr-4 text-3xl font-black text-white placeholder-gray-600 outline-none transition-colors shadow-inner"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 overflow-x-auto sm:overflow-x-visible sm:flex-wrap no-scrollbar pb-2">
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
                              ? (activePanel === "INCOME" ? "bg-[#4EDEA3]/20 border-[#4EDEA3] text-[#4EDEA3]" : "bg-[#FFB4AB]/20 border-[#FFB4AB] text-[#FFB4AB]")
                              : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <span>{p.icon}</span>
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
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setIsCustomCategory(false);
                              setCategory(c.label);
                            }}
                            className={cn(
                              "group/chip flex items-center gap-1.5 px-3 py-2 rounded-xl border flex-shrink-0 transition-all text-xs font-bold",
                              isSelected
                                ? (activePanel === "INCOME" ? "bg-[#4EDEA3]/20 border-[#4EDEA3] text-[#4EDEA3]" : "bg-[#FFB4AB]/20 border-[#FFB4AB] text-[#FFB4AB]")
                                : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white"
                            )}
                          >
                            <span>{c.icon || "🏷️"}</span>
                            <span>{c.label}</span>
                            <span
                              role="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCustomCategory(c.id);
                                if (category === c.label) {
                                  setCategory("");
                                }
                              }}
                              className="ml-0.5 opacity-40 hover:opacity-100 transition-opacity"
                              aria-label={t("delete") || "Remove"}
                            >
                              <X size={11} />
                            </span>
                          </button>
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
                          ? (activePanel === "INCOME" ? "bg-[#4EDEA3]/20 border-[#4EDEA3] text-[#4EDEA3]" : "bg-[#FFB4AB]/20 border-[#FFB4AB] text-[#FFB4AB]")
                          : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white"
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
                            className="flex-1 min-w-0 bg-background border border-white/5 focus:border-white/20 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder-gray-500 outline-none transition-colors"
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
                                ? (activePanel === "INCOME" ? "bg-[#4EDEA3] text-[#00285d] hover:brightness-110" : "bg-[#FFB4AB] text-[#5d0000] hover:brightness-110")
                                : "bg-white/5 text-gray-600 cursor-not-allowed"
                            )}
                          >
                            {t("ledgerAddCategory") || "Add"}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <input
                      type="text"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder={t("noteOptional") || "Note (Optional)"}
                      className="w-full bg-background border border-white/5 focus:border-white/20 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder-gray-500 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="shrink-0 px-5 pt-3 pb-24 sm:pb-5 border-t border-white/5">
                  <button
                    disabled={isAdding || !amount || (!isCustomCategory && !category) || (isCustomCategory && !customCategory)}
                    className={cn(
                      "w-full py-4 rounded-[1.25rem] font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl",
                      activePanel === "INCOME"
                        ? "bg-[#4EDEA3] text-[#00285d] shadow-[#4EDEA3]/20 hover:brightness-110 active:scale-95"
                        : "bg-[#FFB4AB] text-[#5d0000] shadow-[#FFB4AB]/20 hover:brightness-110 active:scale-95",
                      (isAdding || !amount || (!isCustomCategory && !category) || (isCustomCategory && !customCategory)) && "opacity-50 cursor-not-allowed active:scale-100 shadow-none"
                    )}
                  >
                    {isAdding ? <Loader2 size={18} className="animate-spin" /> : <Check size={20} />}
                    {t("saveRecord") || "Save"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sm:hidden fixed bottom-[80px] left-1/2 -translate-x-1/2 z-40 w-full px-4 max-w-sm pointer-events-none">
        <AnimatePresence>
          {!activePanel && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="flex justify-center pointer-events-auto"
            >
              <div className="bg-surface/90 backdrop-blur-xl border border-white/10 rounded-full p-2 flex items-center gap-2 shadow-2xl w-full max-w-xs">
                <button
                  onClick={() => handleOpenPanel("INCOME")}
                  className="flex-1 py-3 bg-white/5 hover:bg-[#4EDEA3]/10 text-white hover:text-[#4EDEA3] rounded-full flex items-center justify-center gap-2 font-black text-xs uppercase tracking-wide transition-all"
                >
                  <ArrowDownLeft size={16} className="text-[#4EDEA3]" />
                  INCOME
                </button>
                <div className="w-[1px] h-8 bg-white/10" />
                <button
                  onClick={() => handleOpenPanel("EXPENSE")}
                  className="flex-1 py-3 bg-white/5 hover:bg-[#FFB4AB]/10 text-white hover:text-[#FFB4AB] rounded-full flex items-center justify-center gap-2 font-black text-xs uppercase tracking-wide transition-all"
                >
                  <ArrowUpRight size={16} className="text-[#FFB4AB]" />
                  EXPENSE
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmModal
        isOpen={!!toDelete}
        title={t("confirmDeleteRecord") || "Delete Record?"}
        message={t("confirmDeleteRecordDesc") || "Are you sure you want to delete this transaction?"}
        onConfirm={() => toDelete && handleDelete(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}