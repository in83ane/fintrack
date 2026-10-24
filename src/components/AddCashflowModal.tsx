"use client";
import { bucketNativeAmount } from '@/src/lib/native-money';
import { requireCurrency } from '@/src/lib/fx';

import { FinanceIcon } from "@/src/components/FinanceIcon";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { X, Wallet, ChevronDown, Loader2, Sparkles, TrendingUp, TrendingDown, Tag, Plus } from "lucide-react";
import { Modal } from "@/src/components/Modal";
import { useApp } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { CustomSelect } from "@/src/components/CustomSelect";
import { createPortal } from "react-dom";
import { AnimatedNumber } from "@/src/components/AnimatedNumber";
import { getLocalDateKey, localDateKeyToIso } from "@/src/lib/local-date";

function SuccessConfetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<any[]>([]);

  useEffect(() => {
    if (active) {
      setParticles(
        Array.from({ length: 60 }).map((_, i) => ({
          id: i,
          x: Math.random() * window.innerWidth,
          color: ['#4EDEA3', '#E9C349', '#FFB4AB', '#ADC6FF', '#ffffff'][Math.floor(Math.random() * 5)],
          size: Math.random() * 8 + 6,
          delay: Math.random() * 0.2,
          rotation: Math.random() * 360,
        }))
      );
    } else {
      setParticles([]);
    }
  }, [active]);

  if (!active || typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -50, x: p.x, opacity: 1, scale: 0, rotate: p.rotation }}
          animate={{
            y: window.innerHeight + 50,
            x: p.x + (Math.random() - 0.5) * 200,
            opacity: [1, 1, 0],
            scale: 1,
            rotate: p.rotation + 360 * (Math.random() > 0.5 ? 1 : -1)
          }}
          transition={{ duration: 1.5 + Math.random(), delay: p.delay, ease: "easeOut" }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            boxShadow: `0 0 10px ${p.color}80`
          }}
        />
      ))}
    </div>,
    document.body
  );
}

interface AddCashflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  presetType?: "INCOME" | "EXPENSE" | "DEPOSIT" | "WITHDRAW";
  presetBucketId?: string;
}

export function AddCashflowModal({ isOpen, onClose, presetType, presetBucketId }: AddCashflowModalProps) {
  const { t, addCashActivity, moneyBuckets, updateMoneyBucket, addBucketActivity, formatMoney, language, addToast, currency, cashActivities, exchangeRates } = useApp();

  const [type, setType] = useState<"INCOME" | "EXPENSE" | "DEPOSIT" | "WITHDRAW">("INCOME");
  const [selectedBucketId, setSelectedBucketId] = useState<string>("<auto-distribute>");
  const prevOpenRef = useRef(false);

  // Sync with preset values when modal opens (only when presetType is provided)
  useEffect(() => {
    if (isOpen && presetType && !prevOpenRef.current) {
      setType(presetType);
      // For EXPENSE/WITHDRAW, select first bucket by default; for INCOME/DEPOSIT, use auto-distribute
      const defaultBucket = presetBucketId
        || (presetType === "DEPOSIT" || presetType === "INCOME" ? "<auto-distribute>" : (moneyBuckets[0]?.id || "<no-bucket>"));
      setSelectedBucketId(defaultBucket);
      setCategory(presetType === "DEPOSIT" || presetType === "INCOME" ? "salary" : "food");
      prevOpenRef.current = true;
    } else if (!isOpen) {
      prevOpenRef.current = false;
    }
  }, [isOpen, presetType, presetBucketId, moneyBuckets]);

  const [amount, setAmount] = useState("");
  const [inputCurrency, setInputCurrency] = useState<"USD" | "THB">(currency === "THB" ? "THB" : "USD");
  const [category, setCategory] = useState("salary");
  const [date, setDate] = useState(getLocalDateKey);
  const [note, setNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [autoSuggested, setAutoSuggested] = useState(false);
  const convertCurrency = (amount: number, from: "USD" | "THB", to: "USD" | "THB") => {
    const usd = amount / (exchangeRates[from] || 1);
    return usd * (exchangeRates[to] || 1);
  };
  const bucketCurrency = (bucket: { currency?: string }) => { requireCurrency(bucket.currency); return bucket.currency; };

  // Calculate current month's net cashflow for preview
  const currentNetCashflow = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthCash = cashActivities.filter(a => a.date.startsWith(key));

    const getEntryAmount = (a: any) => a.amountUSD ?? a.amount ?? 0;

    const income = thisMonthCash.filter(a => (a.type === 'INCOME' || a.type === 'DEPOSIT') && !a.isTransfer).reduce((s, a) => s + getEntryAmount(a), 0);
    const expense = thisMonthCash.filter(a => (a.type === 'EXPENSE' || a.type === 'WITHDRAW') && !a.isTransfer).reduce((s, a) => s + getEntryAmount(a), 0);
    return income - expense;
  }, [cashActivities]);

  const projectedNetCashflow = useMemo(() => {
    const amt = Number(amount) || 0;

    if (amt === 0) return currentNetCashflow;
    if (type === "INCOME" || type === "DEPOSIT") return currentNetCashflow + amt;
    return currentNetCashflow - amt;
  }, [currentNetCashflow, amount, type]);

  // Auto-categorization based on note
  useEffect(() => {
    if (!note || note.trim().length < 3) {
      setAutoSuggested(false);
      return;
    }

    const lowerNote = note.toLowerCase();

    // Keywords mapping
    const categoryMap: Record<string, { type: "INCOME"| "EXPENSE", cat: string }> = {
      // Income
      'salary': { type: "INCOME", cat: "salary" },
      'wage': { type: "INCOME", cat: "salary" },
      'paycheck': { type: "INCOME", cat: "salary" },
      'freelance': { type: "INCOME", cat: "salary" },
      'เงินเดือน': { type: "INCOME", cat: "salary" },
      'dividend': { type: "INCOME", cat: "investment" },

      // Expense - Food
      'lunch': { type: "EXPENSE", cat: "food" },
      'dinner': { type: "EXPENSE", cat: "food" },
      'breakfast': { type: "EXPENSE", cat: "food" },
      'coffee': { type: "EXPENSE", cat: "food" },
      'starbucks': { type: "EXPENSE", cat: "food" },
      'grocery': { type: "EXPENSE", cat: "food" },
      'อาหาร': { type: "EXPENSE", cat: "food" },
      'กาแฟ': { type: "EXPENSE", cat: "food" },

      // Expense - Transport
      'uber': { type: "EXPENSE", cat: "transport" },
      'grab': { type: "EXPENSE", cat: "transport" },
      'taxi': { type: "EXPENSE", cat: "transport" },
      'gas': { type: "EXPENSE", cat: "transport" },
      'fuel': { type: "EXPENSE", cat: "transport" },
      'train': { type: "EXPENSE", cat: "transport" },
      'เดินทาง': { type: "EXPENSE", cat: "transport" },

      // Expense - Utilities
      'rent': { type: "EXPENSE", cat: "utilities" },
      'electric': { type: "EXPENSE", cat: "utilities" },
      'water': { type: "EXPENSE", cat: "utilities" },
      'internet': { type: "EXPENSE", cat: "utilities" },
      'phone': { type: "EXPENSE", cat: "utilities" },
      'ค่าเช่า': { type: "EXPENSE", cat: "utilities" },

      // Expense - Entertainment
      'movie': { type: "EXPENSE", cat: "entertainment" },
      'netflix': { type: "EXPENSE", cat: "entertainment" },
      'spotify': { type: "EXPENSE", cat: "entertainment" },
      'game': { type: "EXPENSE", cat: "entertainment" },
      'shopping': { type: "EXPENSE", cat: "entertainment" },
      'บันเทิง': { type: "EXPENSE", cat: "entertainment" },

      // Investment
      'stock': { type: "EXPENSE", cat: "investment" },
      'shares': { type: "EXPENSE", cat: "investment" },
      'crypto': { type: "EXPENSE", cat: "investment" },
      'btc': { type: "EXPENSE", cat: "investment" },
      'dca': { type: "EXPENSE", cat: "investment" },
      'หุ้น': { type: "EXPENSE", cat: "investment" },
      'ลงทุน': { type: "EXPENSE", cat: "investment" }
    };

    for (const [keyword, suggestion] of Object.entries(categoryMap)) {
      if (lowerNote.includes(keyword)) {
        if (type !== suggestion.type && (type === "INCOME" || type === "EXPENSE")) {
          setType(suggestion.type);
        }
        setCategory(suggestion.cat);
        setAutoSuggested(true);
        return;
      }
    }

    setAutoSuggested(false);
  }, [note, type]);

  // Get buckets that are linked to expenses
  const linkedBuckets = useMemo(() => {
    return moneyBuckets.filter(b => b.linkedToExpenses);
  }, [moneyBuckets]);

  // All categories (preset + any previously used custom ones)
  const incomePresets = ["salary", "investment", "freelance", "dividend", "gift", "rental", "other"];
  const expensePresets = ["food", "transport", "utilities", "entertainment", "shopping", "health", "education", "investment", "other"];
  const depositPresets = ["salary", "investment", "other"];
  const withdrawPresets = ["food", "transport", "utilities", "entertainment", "investment", "other"];

  const currentPresets = type === "INCOME" ? incomePresets
    : type === "EXPENSE" ? expensePresets
    : type === "DEPOSIT" ? depositPresets
    : withdrawPresets;

  const [showCustomCatInput, setShowCustomCatInput] = useState(false);
  const [customCatDraft, setCustomCatDraft] = useState("");
  const isCustomCategory = !currentPresets.includes(category);

  const handleTypeChange = (newType: "INCOME" | "EXPENSE" | "DEPOSIT" | "WITHDRAW") => {
    setType(newType);
    setCategory(newType === "INCOME" || newType === "DEPOSIT" ? "salary" : "food");
    setShowCustomCatInput(false);
    setCustomCatDraft("");
    // For EXPENSE/WITHDRAW, select first bucket; for INCOME/DEPOSIT, use auto-distribute
    setSelectedBucketId(
      newType === "INCOME" || newType === "DEPOSIT" ? "<auto-distribute>" : (moneyBuckets[0]?.id || "<no-bucket>")
    );
    setAutoSuggested(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    const rawAmount = Number(amount);
    try {
      const targets = selectedBucketId === '<auto-distribute>' ? moneyBuckets : moneyBuckets.filter(b => b.id === selectedBucketId);
      targets.forEach(b => bucketNativeAmount({ original_amount: rawAmount, currency: inputCurrency }, b.currency));
    } catch (error) { addToast(String(error), 'error'); return; }
    const THB_RATE = exchangeRates.THB;
    const amountNum = inputCurrency === 'THB' ? rawAmount / THB_RATE : rawAmount;
    if (!Number.isFinite(amountNum)) { addToast('ยังไม่มีข้อมูลเรท USD/THB กรุณารอข้อมูลก่อนบันทึก', 'error'); return; }

    // Validate bucket deduction
    if ((type === "EXPENSE" || type === "WITHDRAW") && selectedBucketId !== "<no-bucket>") {
      const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
      if (bucket && bucket.currentAmount < bucketNativeAmount({ original_amount: rawAmount, currency: inputCurrency }, bucket.currency)) {
        addToast(
          t("insufficientBucketBalance").replace("{bucket}", t(bucket.name) || bucket.name),
          "error"
        );
        return;
      }
    }

    setIsAdding(true);

    let detailedNote = note;
    if ((type === "EXPENSE" || type === "WITHDRAW") && selectedBucketId !== "<no-bucket>") {
      const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
      if (bucket) {
        detailedNote = `${note ? note + " | " : ""}Paid from: ${t(bucket.name) || bucket.name}`;
      }
    } else if (type === "INCOME" || type === "DEPOSIT") {
      if (selectedBucketId === "<auto-distribute>") {
        detailedNote = `${note ? note + " | " : ""}Auto-distributed to buckets`;
      } else if (selectedBucketId !== "<no-bucket>") {
        const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
        if (bucket) {
          detailedNote = `${note ? note + " | " : ""}Deposited to: ${t(bucket.name) || bucket.name}`;
        }
      }
    }

    try {
      // Get current time for the activity
      const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const activityDate = date === getLocalDateKey() ? new Date().toISOString() : localDateKeyToIso(date);

      console.log("Adding CashActivity:", {
        type,
        amountUSD: amountNum,
        category,
        date: activityDate,
        time: type === "DEPOSIT" || type === "WITHDRAW" ? currentTime : undefined,
        note: detailedNote,
        bucketId: selectedBucketId !== "<no-bucket>" && selectedBucketId !== "<auto-distribute>" ? selectedBucketId : undefined
      });

      const savedActivity = await addCashActivity({
        type,
        amountUSD: amountNum,
        category: category,
        date: activityDate,
        time: type === "DEPOSIT" || type === "WITHDRAW" ? currentTime : undefined,
        note: detailedNote,
        bucketId: selectedBucketId !== "<no-bucket>" && selectedBucketId !== "<auto-distribute>" ? selectedBucketId : undefined,
        currency: inputCurrency,
        rateAtTime: exchangeRates[inputCurrency] || 1,
        originalAmount: rawAmount
      });
      if (!savedActivity) return;

      // Deduct from bucket if EXPENSE or WITHDRAW
      if ((type === "EXPENSE" || type === "WITHDRAW") && selectedBucketId !== "<no-bucket>") {
        const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
        if (bucket) {
          const bucketAmount = bucketNativeAmount({ original_amount: savedActivity.originalAmount, currency: savedActivity.currency }, bucket.currency);
          const newAmount = Math.max(0, bucket.currentAmount - bucketAmount);
          updateMoneyBucket(bucket.id, { currentAmount: newAmount });
          addBucketActivity({
            bucketId: bucket.id,
            bucketName: bucket.name,
            type: "withdraw",
            amount: bucketAmount,
            date: new Date().toISOString(),
            note: `${t("deductFromBucket")}: ${t(category) || category}${note ? ` - ${note}` : ""}`,
            currency: bucketCurrency(bucket),
            rateAtTime: exchangeRates[bucketCurrency(bucket)] || 1,
            originalAmount: bucketAmount,
          });
        }
      }

      // Handle INCOME or DEPOSIT Bucket logic
      if ((type === "INCOME" || type === "DEPOSIT") && moneyBuckets.length > 0) {
        if (selectedBucketId === "<auto-distribute>") {
          const totalAllocated = moneyBuckets.reduce((acc, b) => acc + (b.targetPercent || 0), 0);
          if (totalAllocated > 0) {
            for (const bucket of moneyBuckets) {
              const pct = bucket.targetPercent || 0;
              const originalShare = (pct / totalAllocated) * rawAmount;
              const share = bucketNativeAmount({ original_amount: originalShare, currency: inputCurrency }, bucket.currency);
              if (share > 0) {
                const savedShare = await addCashActivity({
                  type: 'DEPOSIT', amountUSD: share / (exchangeRates[inputCurrency] || 1),
                  originalAmount: share, currency: inputCurrency, rateAtTime: exchangeRates[inputCurrency],
                  bucketId: bucket.id, date: activityDate, category, isTransfer: true,
                  note: `Income distribution - ${bucket.name}`,
                });
                if (!savedShare) throw Error('บันทึก native leg ไม่สำเร็จ');
                updateMoneyBucket(bucket.id, { currentAmount: bucket.currentAmount + share });
                addBucketActivity({
                  bucketId: bucket.id,
                  bucketName: bucket.name,
                  type: "deposit",
                  amount: share,
                  date: new Date().toISOString(),
                  note: `${type === "DEPOSIT" ? t("deposit") : t("income")}: ${t(category) || category}${note ? ` - ${note}` : ""}`,
                  currency: bucketCurrency(bucket),
                  rateAtTime: exchangeRates[bucketCurrency(bucket)] || 1,
                  originalAmount: share,
                });
              }
            }
          }
        } else if (selectedBucketId !== "<no-bucket>") {
          // Deposit entirely into one specific bucket
          const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
          if (bucket) {
            const bucketAmount = bucketNativeAmount({ original_amount: savedActivity.originalAmount, currency: savedActivity.currency }, bucket.currency);
            updateMoneyBucket(bucket.id, { currentAmount: bucket.currentAmount + bucketAmount });
            addBucketActivity({
              bucketId: bucket.id,
              bucketName: bucket.name,
              type: "deposit",
              amount: bucketAmount,
              date: new Date().toISOString(),
              note: `${type === "DEPOSIT" ? t("deposit") : t("income")}: ${t(category) || category}${note ? ` - ${note}` : ""}`,
              currency: bucketCurrency(bucket),
              rateAtTime: exchangeRates[bucketCurrency(bucket)] || 1,
              originalAmount: bucketAmount,
            });
          }
        }
      }

      addToast(t("recordSaved"), "success");

      if (type === "INCOME" || type === "DEPOSIT") {
        setShowConfetti(true);
        setTimeout(() => {
          setShowConfetti(false);
          resetState();
          onClose();
        }, 1800);
      } else {
        resetState();
        onClose();
      }
    } catch (err) {
      console.error("Failed to add cashflow activity", err);
    } finally {
      setIsAdding(false);
    }
  };

  const resetState = () => {
    setType("INCOME");
    setAmount("");
    setCategory("salary");
    setDate(getLocalDateKey());
    setNote("");
    setSelectedBucketId("<auto-distribute>");
    setAutoSuggested(false);
  };

  // Get default bucket for EXPENSE/WITHDRAW
  const defaultBucketId = moneyBuckets[0]?.id || "<no-bucket>";

  const handleClose = () => {
    resetState();
    onClose();
  };

  return (
    <>
      <SuccessConfetti active={showConfetti} />
      <Modal isOpen={isOpen} onClose={handleClose} title={t("logIncomeExpense")} footer={<>
        {/* Buttons */}
        <div className="flex gap-4 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-3 text-gray-500 font-bold text-sm hover:text-foreground transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            type="submit" form="cashflow-entry"
            disabled={isAdding || !amount || Number(amount) <= 0}
            className={cn(
              "flex-1 py-3 rounded-full font-black text-sm uppercase tracking-tight transition-all flex items-center justify-center gap-2",
              isAdding || !amount || Number(amount) <= 0
                ? "bg-foreground/5 text-gray-600 opacity-60 cursor-not-allowed"
                : type === "INCOME" || type === "DEPOSIT"
                  ? "bg-primary text-primary-foreground hover:brightness-110 shadow-sm"
                  : "bg-loss text-primary-foreground hover:brightness-110 shadow-sm"
            )}
          >
            {isAdding && <Loader2 size={16} className="animate-spin" />}
            {t("saveRecord")}
          </button>
        </div>

</>}>
        <form id="cashflow-entry" onSubmit={handleSubmit} className="space-y-3">

        {/* Note (Moved up for auto-categorization) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {t("note")} / Description
          </label>
          <div className="relative">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Lunch at Starbucks, Salary..."
              className="w-full px-4 py-3 bg-foreground/5 border border-border rounded-2xl text-foreground text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-primary/50 transition-colors pr-10"
            />
            <AnimatePresence>
              {autoSuggested && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warning"
                  title="Auto-categorized based on description"
                >
                  <Sparkles size={16} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Type Toggle */}
        <div className="grid grid-cols-4 gap-1 bg-foreground/5 p-1 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => handleTypeChange("INCOME")}
            className={cn(
              "py-3 text-xs font-black uppercase tracking-wide rounded-xl transition-all",
              type === "INCOME"
                ? "bg-primary text-primary-foreground shadow-lg"
                : "text-gray-400 hover:text-foreground"
            )}
          >
            {t("income")}
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange("EXPENSE")}
            className={cn(
              "py-3 text-xs font-black uppercase tracking-wide rounded-xl transition-all",
              type === "EXPENSE"
                ? "bg-loss text-primary-foreground shadow-lg"
                : "text-gray-400 hover:text-foreground"
            )}
          >
            {t("expense")}
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange("DEPOSIT")}
            className={cn(
              "py-3 text-xs font-black uppercase tracking-wide rounded-xl transition-all",
              type === "DEPOSIT"
                ? "bg-primary text-primary-foreground shadow-lg"
                : "text-gray-400 hover:text-foreground"
            )}
          >
            {t("deposit")}
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange("WITHDRAW")}
            className={cn(
              "py-3 text-xs font-black uppercase tracking-wide rounded-xl transition-all",
              type === "WITHDRAW"
                ? "bg-loss text-primary-foreground shadow-lg"
                : "text-gray-400 hover:text-foreground"
            )}
          >
            {t("withdraw")}
          </button>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
              {t("amount")}
            </label>
            {/* Projected Net Balance */}
            <div className="flex items-center gap-1.5 text-xs bg-foreground/5 px-2 py-1 rounded-lg">
              <span className="text-gray-500 uppercase font-bold">New Net:</span>
              <span className={cn(
                "font-black flex items-center gap-0.5",
                projectedNetCashflow >= 0 ? "text-gain" : "text-loss"
              )}>
                {projectedNetCashflow >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {formatMoney(Math.abs(projectedNetCashflow))}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-2 mb-2">
            <label className="text-xs text-gray-500 uppercase tracking-wide"></label>
            <div className="flex gap-1 p-0.5 bg-foreground/5 rounded-lg border border-border">
              {(['USD', 'THB'] as const).map(cur => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setInputCurrency(cur)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wide transition-all',
                    inputCurrency === cur
                      ? cur === 'THB'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-primary text-primary-foreground'
                      : 'text-gray-500 hover:text-gray-300'
                  )}
                >
                  {cur === 'THB' ? '฿ THB' : '$ USD'}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <input
              autoFocus
              aria-label={t("amount")}
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 bg-foreground/5 border border-border rounded-2xl text-foreground text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-primary/50 transition-colors pr-12"
              required
            />
            <span className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs uppercase opacity-90",
              inputCurrency === 'THB' ? 'text-warning' : 'text-info'
            )}>
              {inputCurrency === 'THB' ? '฿' : '$'}
            </span>
          </div>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
              {t("category")}
            </label>
            <AnimatePresence>
              {autoSuggested && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
                >
                  Auto-selected
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-2">
            {currentPresets.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => { setCategory(cat); setAutoSuggested(false); setShowCustomCatInput(false); }}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-xl border transition-all",
                  category === cat && !isCustomCategory
                    ? "bg-foreground/10 border-foreground/25 text-foreground"
                    : "bg-transparent border-foreground/8 text-gray-500 hover:text-gray-300 hover:border-foreground/15"
                )}
              >
                {t(cat)}
              </button>
            ))}

            {/* Show active custom category chip */}
            {isCustomCategory && category && !showCustomCatInput && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-foreground/25 bg-foreground/10 text-foreground text-xs font-bold">
                <Tag size={10} />
                {category}
                <button
                  type="button"
                  onClick={() => { setCategory("other"); setShowCustomCatInput(false); }}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <FinanceIcon name="close" size={16} />
                </button>
              </div>
            )}

            {/* + Custom button */}
            <button
              type="button"
              onClick={() => { setShowCustomCatInput(true); setTimeout(() => document.getElementById('custom-cat-input')?.focus(), 60); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-dashed border-foreground/20 text-gray-500 hover:text-foreground hover:border-foreground/35 text-xs font-bold transition-all"
            >
              <Plus size={10} />
              Custom
            </button>
          </div>

          {/* Custom category text input */}
          <AnimatePresence>
            {showCustomCatInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex gap-2 mt-1">
                  <input
                    id="custom-cat-input"
                    type="text"
                    value={customCatDraft}
                    onChange={(e) => setCustomCatDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (customCatDraft.trim()) { setCategory(customCatDraft.trim()); setShowCustomCatInput(false); setCustomCatDraft(""); }
                      }
                      if (e.key === "Escape") setShowCustomCatInput(false);
                    }}
                    placeholder="Type your category name..."
                    className="flex-1 px-3 py-2 bg-foreground/5 border border-foreground/15 rounded-xl text-foreground text-sm placeholder-gray-600 focus:outline-none focus:border-foreground/30 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => { if (customCatDraft.trim()) { setCategory(customCatDraft.trim()); setShowCustomCatInput(false); setCustomCatDraft(""); } }}
                    className="px-4 py-2 bg-foreground/10 text-foreground rounded-xl text-xs font-bold hover:bg-foreground/15 transition-all"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomCatInput(false)}
                    className="p-2 text-gray-500 hover:text-foreground transition-colors"
                  >
                    <FinanceIcon name="close" size={16} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bucket Selection - Always visible if buckets exist */}
        {moneyBuckets.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <Wallet size={12} className={type === "INCOME" || type === "DEPOSIT" ? "text-gain" : "text-loss"} />
              {type === "INCOME" || type === "DEPOSIT"
                ? t("selectBucket") || "Deposit to Bucket"
                : t("deductFromBucket")}
            </label>
            <CustomSelect
              value={selectedBucketId}
              onChange={(val) => setSelectedBucketId(val)}
              items={
                type === "INCOME" || type === "DEPOSIT"
                  ? [
                      { value: "<auto-distribute>", label: "Auto-distribute (Target Plan)" },
                      ...moneyBuckets.map(bucket => ({
                        value: bucket.id,
                        label: `${t(bucket.name) || bucket.name} (${formatMoney(bucket.currentAmount / (exchangeRates[bucket.currency || 'USD'] || 1), bucket.currency as any, undefined, bucket.currentAmount)})`,
                      })),
                    ]
                  : [
                      ...moneyBuckets.map(bucket => ({
                        value: bucket.id,
                        label: `${t(bucket.name) || bucket.name} (${formatMoney(bucket.currentAmount / (exchangeRates[bucket.currency || 'USD'] || 1), bucket.currency as any, undefined, bucket.currentAmount)})`,
                      })),
                      { value: "<no-bucket>", label: t("none") || "None (General Cashflow)" },
                    ]
              }
            />
          </div>
        )}

        {/* Date */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {t("date")}
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-4 py-3 bg-foreground/5 border border-border rounded-2xl text-foreground text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-primary/50 transition-colors"
            required
          />
        </div>

      </form>
      </Modal>
    </>
  );
}
