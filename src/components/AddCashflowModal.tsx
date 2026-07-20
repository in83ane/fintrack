"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { X, Wallet, ChevronDown, Loader2, Sparkles, TrendingUp, TrendingDown, Tag, Plus } from "lucide-react";
import { Modal } from "@/src/components/Modal";
import { useApp } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { AnimatedNumber } from "@/src/components/AnimatedNumber";

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
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [autoSuggested, setAutoSuggested] = useState(false);

  // Calculate current month's net cashflow for preview
  const currentNetCashflow = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthCash = cashActivities.filter(a => a.date.startsWith(key));
    
    const income = thisMonthCash.filter(a => (a.type === 'INCOME' || a.type === 'DEPOSIT') && !a.isTransfer).reduce((s, a) => s + a.amountUSD, 0);
    const expense = thisMonthCash.filter(a => (a.type === 'EXPENSE' || a.type === 'WITHDRAW') && !a.isTransfer).reduce((s, a) => s + a.amountUSD, 0);
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
    const THB_RATE = exchangeRates['THB'] || 36.5;
    const amountNum = inputCurrency === 'THB' ? rawAmount / THB_RATE : rawAmount;

    // Validate bucket deduction
    if ((type === "EXPENSE" || type === "WITHDRAW") && selectedBucketId !== "<no-bucket>") {
      const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
      if (bucket && bucket.currentAmount < amountNum) {
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

      console.log("Adding CashActivity:", {
        type,
        amountUSD: amountNum,
        category,
        date: date === new Date().toISOString().split("T")[0] ? new Date().toISOString() : new Date(date).toISOString(),
        time: type === "DEPOSIT" || type === "WITHDRAW" ? currentTime : undefined,
        note: detailedNote,
        bucketId: selectedBucketId !== "<no-bucket>" && selectedBucketId !== "<auto-distribute>" ? selectedBucketId : undefined
      });

      addCashActivity({
        type,
        amountUSD: amountNum,
        category: category,
        date: date === new Date().toISOString().split("T")[0] ? new Date().toISOString() : new Date(date).toISOString(),
        time: type === "DEPOSIT" || type === "WITHDRAW" ? currentTime : undefined,
        note: detailedNote,
        bucketId: selectedBucketId !== "<no-bucket>" && selectedBucketId !== "<auto-distribute>" ? selectedBucketId : undefined,
        currency: inputCurrency,
        rateAtTime: exchangeRates[inputCurrency] || 1
      });

      // Deduct from bucket if EXPENSE or WITHDRAW
      if ((type === "EXPENSE" || type === "WITHDRAW") && selectedBucketId !== "<no-bucket>") {
        const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
        if (bucket) {
          const newAmount = Math.max(0, bucket.currentAmount - amountNum);
          updateMoneyBucket(bucket.id, { currentAmount: newAmount });
          addBucketActivity({
            bucketId: bucket.id,
            bucketName: bucket.name,
            type: "withdraw",
            amount: amountNum,
            date: new Date().toISOString(),
            note: `${t("deductFromBucket")}: ${t(category) || category}${note ? ` - ${note}` : ""}`,
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
              const share = (pct / totalAllocated) * amountNum;
              if (share > 0) {
                updateMoneyBucket(bucket.id, { currentAmount: bucket.currentAmount + share });
                addBucketActivity({
                  bucketId: bucket.id,
                  bucketName: bucket.name,
                  type: "deposit",
                  amount: share,
                  date: new Date().toISOString(),
                  note: `${type === "DEPOSIT" ? t("deposit") : t("income")}: ${t(category) || category}${note ? ` - ${note}` : ""}`,
                });
              }
            }
          }
        } else if (selectedBucketId !== "<no-bucket>") {
          // Deposit entirely into one specific bucket
          const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
          if (bucket) {
            updateMoneyBucket(bucket.id, { currentAmount: bucket.currentAmount + amountNum });
            addBucketActivity({
              bucketId: bucket.id,
              bucketName: bucket.name,
              type: "deposit",
              amount: amountNum,
              date: new Date().toISOString(),
              note: `${type === "DEPOSIT" ? t("deposit") : t("income")}: ${t(category) || category}${note ? ` - ${note}` : ""}`,
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
    setDate(new Date().toISOString().split("T")[0]);
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
      <Modal isOpen={isOpen} onClose={handleClose} title={t("logIncomeExpense")}>
        <form onSubmit={handleSubmit} className="space-y-6">
        
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
              className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors pr-10"
              autoFocus
            />
            <AnimatePresence>
              {autoSuggested && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#E9C349]"
                  title="Auto-categorized based on description"
                >
                  <Sparkles size={16} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Type Toggle */}
        <div className="grid grid-cols-4 gap-1 bg-white/5 p-1 rounded-2xl border border-white/10">
          <button
            type="button"
            onClick={() => handleTypeChange("INCOME")}
            className={cn(
              "py-3 text-xs font-black uppercase tracking-wide rounded-xl transition-all",
              type === "INCOME"
                ? "bg-[#4EDEA3] text-[#00285d] shadow-lg"
                : "text-gray-400 hover:text-white"
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
                ? "bg-[#FFB4AB] text-[#00285d] shadow-lg"
                : "text-gray-400 hover:text-white"
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
                ? "bg-[#4EDEA3] text-[#00285d] shadow-lg"
                : "text-gray-400 hover:text-white"
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
                ? "bg-[#FFB4AB] text-[#00285d] shadow-lg"
                : "text-gray-400 hover:text-white"
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
            <div className="flex items-center gap-1.5 text-[10px] bg-white/5 px-2 py-1 rounded-lg">
              <span className="text-gray-500 uppercase font-bold">New Net:</span>
              <span className={cn(
                "font-black flex items-center gap-0.5",
                projectedNetCashflow >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
              )}>
                {projectedNetCashflow >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {formatMoney(projectedNetCashflow)}
              </span>
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-2 mb-2">
            <label className="text-[10px] text-gray-500 uppercase tracking-wide"></label>
            <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg border border-white/10">
              {(['USD', 'THB'] as const).map(cur => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setInputCurrency(cur)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide transition-all',
                    inputCurrency === cur
                      ? cur === 'THB'
                        ? 'bg-[#E9C349] text-[#241a00]'
                        : 'bg-[#ADC6FF] text-[#00285d]'
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
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors pr-12"
              required
            />
            <span className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs uppercase opacity-90",
              inputCurrency === 'THB' ? 'text-[#E9C349]' : 'text-[#ADC6FF]'
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
                  className="text-[9px] bg-[#E9C349]/20 text-[#E9C349] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
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
                    ? "bg-white/10 border-white/25 text-white"
                    : "bg-transparent border-white/8 text-gray-500 hover:text-gray-300 hover:border-white/15"
                )}
              >
                {t(cat)}
              </button>
            ))}

            {/* Show active custom category chip */}
            {isCustomCategory && category && !showCustomCatInput && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/25 bg-white/10 text-white text-xs font-bold">
                <Tag size={10} />
                {category}
                <button
                  type="button"
                  onClick={() => { setCategory("other"); setShowCustomCatInput(false); }}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            )}

            {/* + Custom button */}
            <button
              type="button"
              onClick={() => { setShowCustomCatInput(true); setTimeout(() => document.getElementById('custom-cat-input')?.focus(), 60); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-dashed border-white/20 text-gray-500 hover:text-white hover:border-white/35 text-xs font-bold transition-all"
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
                    className="flex-1 px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => { if (customCatDraft.trim()) { setCategory(customCatDraft.trim()); setShowCustomCatInput(false); setCustomCatDraft(""); } }}
                    className="px-4 py-2 bg-white/10 text-white rounded-xl text-xs font-bold hover:bg-white/15 transition-all"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomCatInput(false)}
                    className="p-2 text-gray-500 hover:text-white transition-colors"
                  >
                    ✕
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
              <Wallet size={12} className={type === "INCOME" || type === "DEPOSIT" ? "text-[#4EDEA3]" : "text-[#FFB4AB]"} />
              {type === "INCOME" || type === "DEPOSIT"
                ? t("selectBucket") || "Deposit to Bucket"
                : t("deductFromBucket")}
            </label>
            <div className="relative">
              <select
                value={selectedBucketId}
                onChange={(e) => setSelectedBucketId(e.target.value)}
                className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium appearance-none focus:outline-none focus:border-[#ADC6FF]/50 transition-colors"
              >
                {type === "INCOME" || type === "DEPOSIT" ? (
                  <>
                    <option value="<auto-distribute>" className="bg-[#1C1B1B]">
                      ⚡ Auto-distribute (Target Plan)
                    </option>
                    {moneyBuckets.map(bucket => (
                      <option key={bucket.id} value={bucket.id} className="bg-[#1C1B1B]">
                        {bucket.icon} {t(bucket.name) || bucket.name} ({formatMoney(bucket.currentAmount)})
                      </option>
                    ))}
                  </>
                ) : (
                  <>
                    {moneyBuckets.map(bucket => (
                      <option key={bucket.id} value={bucket.id} className="bg-[#1C1B1B]">
                        {bucket.icon} {t(bucket.name) || bucket.name} ({formatMoney(bucket.currentAmount)})
                      </option>
                    ))}
                    <option value="<no-bucket>" className="bg-[#1C1B1B]">
                      {t("none") || "None (General Cashflow)"}
                    </option>
                  </>
                )}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                <ChevronDown size={16} />
              </div>
            </div>
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
            className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors"
            required
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-4 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={isAdding || !amount || Number(amount) <= 0}
            className={cn(
              "flex-1 py-4 rounded-full font-black text-sm uppercase tracking-tight transition-all flex items-center justify-center gap-2",
              isAdding || !amount || Number(amount) <= 0
                ? "bg-white/5 text-gray-600 opacity-60 cursor-not-allowed"
                : type === "INCOME" || type === "DEPOSIT"
                  ? "bg-[#4EDEA3] text-[#00285d] hover:brightness-110 shadow-[0_0_20px_rgba(78,222,163,0.3)]" 
                  : "bg-[#FFB4AB] text-[#00285d] hover:brightness-110 shadow-[0_0_20px_rgba(255,180,171,0.3)]"
            )}
          >
            {isAdding && <Loader2 size={16} className="animate-spin" />}
            {t("addRecord")}
          </button>
        </div>
      </form>
      </Modal>
    </>
  );
}
