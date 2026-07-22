"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
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

// โ”€โ”€ Preset category keys (translated at render time via t()) โ”€โ”€โ”€โ”€โ”€โ”€
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

// ── Confetti ──โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
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

// ── Category Picker ──โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
function CategoryPicker({
  value,
  onChange,
  type,
}: {
  value: string;
  onChange: (v: string) => void;
  type: "INCOME" | "EXPENSE";
}) {
  const { t, customCategories, addCustomCategory, removeCustomCategory } = useApp();
  const [showCustom, setShowCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const presetKeys = type === "INCOME" ? INCOME_PRESET_KEYS : EXPENSE_PRESET_KEYS;

  // User's saved custom categories for this type
  const savedCustoms = customCategories.filter((c) => c.type === type);

  // A value is "custom" if it doesn't match any preset key or translation
  const isUnsavedCustom =
    !presetKeys.some(
      (p) =>
        p.key.toLowerCase() === value.toLowerCase() ||
        t(p.key).toLowerCase() === value.toLowerCase()
    ) &&
    !savedCustoms.some((c) => c.label.toLowerCase() === value.toLowerCase());

  useEffect(() => {
    if (showCustom) setTimeout(() => inputRef.current?.focus(), 60);
  }, [showCustom]);

  const handleCustomSubmit = async () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    await addCustomCategory(type, trimmed, "🏷️");
    onChange(trimmed);
    setShowCustom(false);
    setCustomInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {/* Preset chips */}
        {presetKeys.map((p) => {
          const label = t(p.key);
          const active =
            value.toLowerCase() === p.key.toLowerCase() ||
            value.toLowerCase() === label.toLowerCase();
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => { onChange(p.key); setShowCustom(false); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                active
                  ? type === "INCOME"
                    ? "bg-[#4EDEA3]/15 border-[#4EDEA3]/40 text-[#4EDEA3]"
                    : "bg-[#FFB4AB]/15 border-[#FFB4AB]/40 text-[#FFB4AB]"
                  : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20"
              )}
            >
              <span style={{ fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif" }}>{p.icon}</span>
              {label}
              {active && <Check size={10} />}
            </button>
          );
        })}

        {/* Saved custom category chips - persistent */}
        {savedCustoms.map((c) => {
          const active = value.toLowerCase() === c.label.toLowerCase();
          return (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                active
                  ? type === "INCOME"
                    ? "bg-[#4EDEA3]/15 border-[#4EDEA3]/40 text-[#4EDEA3]"
                    : "bg-[#FFB4AB]/15 border-[#FFB4AB]/40 text-[#FFB4AB]"
                  : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20"
              )}
            >
              <button
                type="button"
                onClick={() => { onChange(c.label); setShowCustom(false); }}
                className="flex items-center gap-1.5"
              >
                <span style={{ fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif" }}>{c.icon}</span>
                {c.label}
                {active && <Check size={10} />}
              </button>
              {/* x delete - shows only on hover */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeCustomCategory(c.id); if (active) onChange(""); }}
                className="ml-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                title="Remove"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}


        {/* Transient unsaved custom chip (shows before user saves) */}
        {isUnsavedCustom && value && !showCustom && (
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border",
            type === "INCOME"
              ? "bg-[#4EDEA3]/15 border-[#4EDEA3]/40 text-[#4EDEA3]"
              : "bg-[#FFB4AB]/15 border-[#FFB4AB]/40 text-[#FFB4AB]"
          )}>
            <Tag size={10} />
            {value}
            <button type="button" onClick={() => onChange("")} className="ml-0.5 opacity-60 hover:opacity-100">
              <X size={10} />
            </button>
          </div>
        )}

        {/* + Custom button */}
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border border-dashed border-white/20 text-gray-500 hover:text-white hover:border-white/40 transition-all"
        >
          <Plus size={10} />
          {t("ledgerCustomCategory")}
        </button>
      </div>

      {/* Custom input */}
      <AnimatePresence>
        {showCustom && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 mt-1">
              <input
                ref={inputRef}
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleCustomSubmit(); }
                  if (e.key === "Escape") setShowCustom(false);
                }}
                placeholder={t("ledgerTypeCategory")}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                type="button"
                onClick={handleCustomSubmit}
                className="px-4 py-2 bg-white/10 text-white rounded-xl text-xs font-bold hover:bg-white/15 transition-all"
              >
                {t("ledgerAddCategory")}
              </button>
              <button type="button" onClick={() => setShowCustom(false)} className="p-2 text-gray-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ── Quick Add Panel ──โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
function QuickAddPanel({
  type,
  defaultBucketId,
  onTypeChange,
  onClose,
  onSuccess,
}: {
  type: "INCOME" | "EXPENSE";
  defaultBucketId?: string;
  onTypeChange: (t: "INCOME" | "EXPENSE") => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    t, addCashActivity, moneyBuckets, updateMoneyBucket, addBucketActivity,
    formatMoney, currency, exchangeRates, cashActivities, addToast,
  } = useApp();

  const [amount, setAmount] = useState("");
  const [inputCurrency, setInputCurrency] = useState<"USD" | "THB">(currency === "THB" ? "THB" : "USD");
  const [category, setCategory] = useState(type === "INCOME" ? "salary" : "food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedBucketId, setSelectedBucketId] = useState(
    defaultBucketId ? defaultBucketId : (type === "INCOME" ? "<auto-distribute>" : (moneyBuckets[0]?.id || "<no-bucket>"))
  );
  const [isAdding, setIsAdding] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Sync category/bucket when type prop changes
  useEffect(() => {
    setCategory(type === "INCOME" ? "salary" : "food");
    setSelectedBucketId(
      defaultBucketId ? defaultBucketId : (type === "INCOME" ? "<auto-distribute>" : (moneyBuckets[0]?.id || "<no-bucket>"))
    );
  }, [type, defaultBucketId, moneyBuckets]);

  // Net preview
  const currentNet = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const m = cashActivities.filter((a) => a.date.startsWith(key));
    const getEntryAmount = (a: any) => a.amountUSD ?? a.amount ?? 0;
    const inc = m.filter((a) => a.type === "INCOME" || a.type === "DEPOSIT").reduce((s, a) => s + getEntryAmount(a), 0);
    const exp = m.filter((a) => (a.type === "EXPENSE" || a.type === "WITHDRAW") && !a.isTransfer).reduce((s, a) => s + getEntryAmount(a), 0);
    return inc - exp;
  }, [cashActivities]);

  const projected = useMemo(() => {
    const n = Number(amount) || 0;
    if (n === 0) return currentNet;
    const rate = exchangeRates[inputCurrency] || 1;
    const nUSD = n / rate;
    return type === "INCOME" ? currentNet + nUSD : currentNet - nUSD;
  }, [currentNet, amount, type, inputCurrency, exchangeRates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setIsAdding(true);
    try {
      const raw = Number(amount);
      const rate = exchangeRates[inputCurrency] || 1;
      const amountNum = raw / rate;
      const now = new Date().toISOString();

      if (type === "EXPENSE" && selectedBucketId !== "<no-bucket>") {
        const bucket = moneyBuckets.find((b) => b.id === selectedBucketId);
        if (bucket && bucket.currentAmount < amountNum) {
          addToast(t("insufficientBucketBalance").replace("{bucket}", bucket.name), "error");
          return;
        }
      }

      const savedActivity = await addCashActivity({
        type,
        amountUSD: amountNum,
        category,
        date: date === new Date().toISOString().split("T")[0] ? now : new Date(date).toISOString(),
        note: note || undefined,
        bucketId: selectedBucketId !== "<no-bucket>" && selectedBucketId !== "<auto-distribute>" ? selectedBucketId : undefined,
        currency: inputCurrency,
        rateAtTime: rate,
        originalAmount: raw,
      });
      if (!savedActivity) return;

      // Bucket logic
      if (type === "EXPENSE" && selectedBucketId !== "<no-bucket>") {
        const bucket = moneyBuckets.find((b) => b.id === selectedBucketId);
        if (bucket) {
          const bCur = bucket.currency === "THB" ? "THB" : "USD";
          const bRate = exchangeRates[bCur] || 1;
          const bucketAmount = amountNum * bRate;
          updateMoneyBucket(bucket.id, { currentAmount: Math.max(0, bucket.currentAmount - bucketAmount) });
          addBucketActivity({ bucketId: bucket.id, bucketName: bucket.name, type: "withdraw", amount: bucketAmount, date: now, note: t(category) || category, currency: inputCurrency, rateAtTime: rate, originalAmount: raw });
        }
      } else if (type === "INCOME" && moneyBuckets.length > 0 && selectedBucketId === "<auto-distribute>") {
        const total = moneyBuckets.reduce((s, b) => s + (b.targetPercent || 0), 0);
        if (total > 0) {
          for (const b of moneyBuckets) {
            const shareUSD = ((b.targetPercent || 0) / total) * amountNum;
            if (shareUSD > 0) {
              const bCur = b.currency === "THB" ? "THB" : "USD";
              const bRate = exchangeRates[bCur] || 1;
              const shareBucketCur = shareUSD * bRate;
              updateMoneyBucket(b.id, { currentAmount: b.currentAmount + shareBucketCur });
              const originalShare = ((b.targetPercent || 0) / total) * raw;
              addBucketActivity({ bucketId: b.id, bucketName: b.name, type: "deposit", amount: shareBucketCur, date: now, note: t(category) || category, currency: inputCurrency, rateAtTime: rate, originalAmount: originalShare });
            }
          }
        }
      } else if (type === "INCOME" && selectedBucketId !== "<no-bucket>" && selectedBucketId !== "<auto-distribute>") {
        const bucket = moneyBuckets.find((b) => b.id === selectedBucketId);
        if (bucket) {
          const bCur = bucket.currency === "THB" ? "THB" : "USD";
          const bRate = exchangeRates[bCur] || 1;
          const bucketAmount = amountNum * bRate;
          updateMoneyBucket(bucket.id, { currentAmount: bucket.currentAmount + bucketAmount });
          addBucketActivity({ bucketId: bucket.id, bucketName: bucket.name, type: "deposit", amount: bucketAmount, date: now, note: t(category) || category, currency: inputCurrency, rateAtTime: rate, originalAmount: raw });
        }
      }

      if (type === "INCOME") {
        setShowConfetti(true);
        setTimeout(() => { setShowConfetti(false); onSuccess(); }, 1700);
      } else {
        onSuccess();
      }
    } catch (err) {
      addToast(t("errorOccurred"), "error");
    } finally {
      setIsAdding(false);
    }
  };

  const isIncome = type === "INCOME";
  const accentColor = isIncome ? "#4EDEA3" : "#FFB4AB";

  return (
    <>
      <SuccessConfetti active={showConfetti} />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="bg-[#141414] border border-white/8 rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}60, ${accentColor}20)` }} />

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Type switcher โ€” inline, no remount */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 bg-white/5 rounded-2xl border border-white/8">
              {(["INCOME", "EXPENSE"] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => onTypeChange(tp)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all",
                    type === tp
                      ? tp === "INCOME"
                        ? "bg-[#4EDEA3] text-[#001a0e] shadow-md"
                        : "bg-[#FFB4AB] text-[#2a0000] shadow-md"
                      : "text-gray-500 hover:text-white"
                  )}
                >
                  {tp === "INCOME" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {tp === "INCOME" ? t("addIncomeTitle") : t("addExpenseTitle")}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="p-2 text-gray-600 hover:text-white transition-colors rounded-xl hover:bg-white/5">
              <X size={16} />
            </button>
          </div>

          {/* Amount + currency */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t("amount")}</label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600">{t("ledgerNewNet")}</span>
                <span className={cn("text-[10px] font-black", projected >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                  {projected >= 0 ? "+" : "-"}{formatMoney(Math.abs(projected))}
                </span>
              </div>
            </div>

            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace("-", ""))}
                placeholder="0.00"
                autoFocus
                className="w-full px-5 py-5 bg-white/5 border border-white/10 rounded-2xl text-white text-2xl font-black placeholder-gray-700 focus:outline-none transition-colors pr-32"
                style={{ borderColor: amount && Number(amount) > 0 ? `${accentColor}40` : undefined }}
                required
              />
              {/* Currency toggle inline */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1 p-0.5 bg-white/8 rounded-xl border border-white/10">
                {(["THB", "USD"] as const).map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setInputCurrency(cur)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                      inputCurrency === cur
                        ? cur === "THB" ? "bg-[#E9C349] text-[#241a00]" : "bg-[#ADC6FF] text-[#00285d]"
                        : "text-gray-500 hover:text-gray-300"
                    )}
                  >
                    {cur === "THB" ? "฿" : "$"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">
              {t("ledgerDescription")}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isIncome ? t("ledgerDescPlaceholderIncome") : t("ledgerDescPlaceholderExpense")}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-white/25 transition-colors"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">
              {t("ledgerCategoryHint")}
            </label>
            <CategoryPicker value={category} onChange={setCategory} type={type} />
          </div>

          {/* Date + Bucket */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <CalendarDays size={10} /> {t("date")}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-white/25 transition-colors"
              />
            </div>

            {moneyBuckets.length > 0 && (
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <Wallet size={10} /> {isIncome ? t("ledgerDepositTo") : t("ledgerDeductFrom")}
                </label>
                <div className="relative">
                  <select
                    value={selectedBucketId}
                    onChange={(e) => setSelectedBucketId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs appearance-none focus:outline-none focus:border-white/25 transition-colors pr-7"
                  >
                    {isIncome ? (
                      <>
                        <option value="<auto-distribute>" className="bg-[#141414]">⚡ {t("ledgerAutoSplit")}</option>
                        {moneyBuckets.map((b) => (
                          <option key={b.id} value={b.id} className="bg-[#141414]">{b.icon} {b.name}</option>
                        ))}
                      </>
                    ) : (
                      <>
                        {moneyBuckets.map((b) => (
                          <option key={b.id} value={b.id} className="bg-[#141414]">{b.icon} {b.name}</option>
                        ))}
                        <option value="<no-bucket>" className="bg-[#141414]">{t("none") || "None"}</option>
                      </>
                    )}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isAdding || !amount || Number(amount) <= 0 || !category}
            className={cn(
              "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2",
              isAdding || !amount || Number(amount) <= 0
                ? "bg-white/5 text-gray-600 cursor-not-allowed"
                : isIncome
                  ? "bg-[#4EDEA3] text-[#001a0e] hover:brightness-110 shadow-[0_0_24px_rgba(78,222,163,0.25)]"
                  : "bg-[#FFB4AB] text-[#2a0000] hover:brightness-110 shadow-[0_0_24px_rgba(255,180,171,0.25)]"
            )}
          >
            {isAdding ? <Loader2 size={16} className="animate-spin" /> : isIncome ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {isIncome ? t("ledgerSaveIncome") : t("ledgerSaveExpense")}
          </button>
        </form>
      </motion.div>
    </>
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

  if (d.toDateString() === today.toDateString()) return todayLabel;
  if (d.toDateString() === yesterday.toDateString()) return yesterdayLabel;

  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
  const locale = language === "th" ? "th-TH" : "en-US";
  if (diffDays < 7) return d.toLocaleDateString(locale, { weekday: "long" });
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}


function MonthNavigator({
  value,
  onChange,
  availableMonths,
  language,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  availableMonths: string[];
  language: string;
  t: (k: string) => string;
}) {
  const locale = language === "th" ? "th-TH" : "en-US";
  const recentMonths = [...availableMonths].slice(-12).reverse();

  const formatMonth = (key: string) => {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(locale, { month: "short", year: "2-digit" });
  };

  const idx = availableMonths.indexOf(value);
  const canPrev = value !== "all" && idx > 0;
  const canNext = value !== "all" && idx < availableMonths.length - 1;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => canPrev && onChange(availableMonths[idx - 1])}
        disabled={!canPrev}
        className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/8 text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all flex-shrink-0"
      >
        <ChevronLeft size={14} />
      </button>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-none flex-1 py-0.5">
        <button
          onClick={() => onChange("all")}
          className={cn(
            "flex-shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all border",
            value === "all"
              ? "bg-white/15 border-white/25 text-white"
              : "bg-white/4 border-white/8 text-gray-500 hover:text-white hover:bg-white/8"
          )}
        >
          {t("ledgerFilterAll")}
        </button>

        {recentMonths.map((m) => (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all border",
              value === m
                ? "bg-[#ADC6FF]/20 border-[#ADC6FF]/40 text-[#ADC6FF]"
                : "bg-white/4 border-white/8 text-gray-500 hover:text-white hover:bg-white/8"
            )}
          >
            {formatMonth(m)}
          </button>
        ))}
      </div>

      <button
        onClick={() => canNext && onChange(availableMonths[idx + 1])}
        disabled={!canNext}
        className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/8 text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all flex-shrink-0"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}


export default function LedgerPage() {
  const {
    t, formatMoney, cashActivities, moneyBuckets, removeCashActivity, language, currency, exchangeRates
  } = useApp();

  const [activePanel, setActivePanel] = useState<"INCOME" | "EXPENSE" | null>(null);
  const [panelType, setPanelType] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "INCOME" | "EXPENSE">("all");
  const [selectedBucket, setSelectedBucket] = useState<string>("all");
  const [toDelete, setToDelete] = useState<string | null>(null);

  const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(todayKey);

  // All unique months that have records
  const availableMonths = useMemo(() => {
    const keys = new Set<string>();
    cashActivities
      .filter((a) => a.type === "INCOME" || a.type === "EXPENSE")
      .forEach((a) => keys.add(a.date.slice(0, 7)));
    keys.add(todayKey);
    return [...keys].sort();
  }, [cashActivities]);

  // Records filtered by month + type + search + bucket
  const records = useMemo(() => {
    return cashActivities
      .filter((a) => a.type === "INCOME" || a.type === "EXPENSE")
      .filter((a) => selectedMonth === "all" || a.date.startsWith(selectedMonth))
      .filter((a) => filterType === "all" || a.type === filterType)
      .filter((a) => selectedBucket === "all" || (selectedBucket === "unassigned" ? !a.bucketId : a.bucketId === selectedBucket))
      .filter((a) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          a.category.toLowerCase().includes(q) ||
          (a.note && a.note.toLowerCase().includes(q)) ||
          t(a.category).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cashActivities, selectedMonth, search, filterType, language, selectedBucket]);

  // Stats for selected period
  const periodStats = useMemo(() => {
    const base = cashActivities
      .filter((a) => a.type === "INCOME" || a.type === "EXPENSE")
      .filter((a) => selectedMonth === "all" || a.date.startsWith(selectedMonth))
      .filter((a) => selectedBucket === "all" || (selectedBucket === "unassigned" ? !a.bucketId : a.bucketId === selectedBucket));
    const getEntryAmount = (a: any) => a.amountUSD ?? a.amount ?? 0;
    const inc = base.filter((a) => a.type === "INCOME").reduce((s, a) => s + getEntryAmount(a), 0);
    const exp = base.filter((a) => a.type === "EXPENSE").reduce((s, a) => s + getEntryAmount(a), 0);
    return { inc, exp, net: inc - exp };
  }, [cashActivities, selectedMonth, currency, exchangeRates, selectedBucket]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, typeof records> = {};
    records.forEach((r) => {
      const key = r.date.split("T")[0];
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [records]);

  const handleSuccess = () => setActivePanel(null);

  const handlePanelButton = (type: "INCOME" | "EXPENSE") => {
    if (activePanel !== null) {
      setPanelType(type);
    } else {
      setPanelType(type);
      setActivePanel(type);
    }
  };

  const locale = language === "th" ? "th-TH" : "en-US";
  const periodLabel = selectedMonth === "all"
    ? t("ledgerFilterAll")
    : new Date(selectedMonth + "-01").toLocaleDateString(locale, { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0E0E0E] via-[#111] to-[#0E0E0E] border-b border-white/5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-80 h-80 bg-[#4EDEA3]/4 blur-[120px] rounded-full" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#FFB4AB]/4 blur-[120px] rounded-full" />
        </div>
        <div className="relative p-5 sm:p-8 max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <ReceiptText size={14} className="text-[#ADC6FF]" />
            <span className="text-[#ADC6FF] uppercase tracking-widest text-[10px] font-black">{t("income")} &amp; {t("expense")}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tighter mb-1">{t("ledger")}</h1>
          <p className="text-gray-500 text-sm">{t("ledgerSubtitle")}</p>

          {/* Month Picker */}
          <div className="mt-4">
            <MonthNavigator
              value={selectedMonth}
              onChange={setSelectedMonth}
              availableMonths={availableMonths}
              language={language}
              t={t}
            />
          </div>

          {/* Bucket Picker */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button
              onClick={() => setSelectedBucket("all")}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all",
                selectedBucket === "all" ? "bg-white text-black" : "bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white"
              )}
            >
              {t("allWallets") || "All Wallets"}
            </button>
            <button
              onClick={() => setSelectedBucket("unassigned")}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2",
                selectedBucket === "unassigned" ? "bg-white text-black" : "bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white"
              )}
            >
              <Wallet size={12} />
              {t("unassigned") || "Unassigned"}
            </button>
            {moneyBuckets.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBucket(b.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2",
                  selectedBucket === b.id ? "bg-white text-black" : "bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white"
                )}
              >
                <span>{b.icon}</span>
                {t(b.name) || b.name}
              </button>
            ))}
          </div>

          {/* Stats for selected period */}
          <div className="flex gap-3 mt-4">
            <div className="flex-1 bg-white/4 border border-white/6 rounded-2xl p-3.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1 truncate">
                {t("ledgerFilterIn")} • {periodLabel}
              </p>
              <AnimatedNumber value={periodStats.inc} formatter={(v) => formatMoney(v)} className="text-lg font-black text-[#4EDEA3] tracking-tighter" />
            </div>
            <div className="flex-1 bg-white/4 border border-white/6 rounded-2xl p-3.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1 truncate">
                {t("ledgerFilterOut")} • {periodLabel}
              </p>
              <AnimatedNumber value={periodStats.exp} formatter={(v) => formatMoney(v)} className="text-lg font-black text-[#FFB4AB] tracking-tighter" />
            </div>
            <div className="flex-1 bg-white/4 border border-white/6 rounded-2xl p-3.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">{t("ledgerNet")}</p>
              <AnimatedNumber
                value={periodStats.net}
                formatter={(v) => `${v >= 0 ? "+" : ""}${formatMoney(Math.abs(v))}`}
                className={cn("text-lg font-black tracking-tighter", periodStats.net >= 0 ? "text-white" : "text-[#FFB4AB]")}
              />
            </div>
          </div>

          {/* CTA buttons */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => handlePanelButton("INCOME")}
              className={cn(
                "flex items-center justify-center gap-2.5 py-4 rounded-2xl font-black text-base uppercase tracking-wide transition-all",
                activePanel !== null && panelType === "INCOME"
                  ? "bg-[#4EDEA3] text-[#001a0e] shadow-[0_0_30px_rgba(78,222,163,0.3)]"
                  : "bg-[#4EDEA3]/10 border border-[#4EDEA3]/25 text-[#4EDEA3] hover:bg-[#4EDEA3]/15"
              )}
            >
              <TrendingUp size={18} />
              {t("addIncome")}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => handlePanelButton("EXPENSE")}
              className={cn(
                "flex items-center justify-center gap-2.5 py-4 rounded-2xl font-black text-base uppercase tracking-wide transition-all",
                activePanel !== null && panelType === "EXPENSE"
                  ? "bg-[#FFB4AB] text-[#2a0000] shadow-[0_0_30px_rgba(255,180,171,0.3)]"
                  : "bg-[#FFB4AB]/10 border border-[#FFB4AB]/25 text-[#FFB4AB] hover:bg-[#FFB4AB]/15"
              )}
            >
              <TrendingDown size={18} />
              {t("addExpense")}
            </motion.button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Quick Add Panel */}
        <AnimatePresence>
          {activePanel !== null && (
            <QuickAddPanel
              type={panelType}
              defaultBucketId={selectedBucket !== "all" && selectedBucket !== "unassigned" ? selectedBucket : undefined}
              onTypeChange={setPanelType}
              onClose={() => setActivePanel(null)}
              onSuccess={handleSuccess}
            />
          )}
        </AnimatePresence>

        {/* Search + filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("ledgerSearchPlaceholder")}
              className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/8 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-white/20 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex gap-1 p-1 bg-white/5 border border-white/8 rounded-xl">
            {(["all", "INCOME", "EXPENSE"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all",
                  filterType === f
                    ? f === "INCOME" ? "bg-[#4EDEA3] text-[#001a0e]"
                      : f === "EXPENSE" ? "bg-[#FFB4AB] text-[#2a0000]"
                        : "bg-white/15 text-white"
                    : "text-gray-500 hover:text-white"
                )}
              >
                {f === "all" ? t("ledgerFilterAll") : f === "INCOME" ? t("ledgerFilterIn") : t("ledgerFilterOut")}
              </button>
            ))}
          </div>
        </div>

        {/* History */}
        {grouped.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="emoji-text w-16 h-16 bg-white/4 rounded-3xl flex items-center justify-center mb-4 text-2xl">📋</div>
            <p className="text-white font-bold text-lg mb-1">{t("ledgerNoRecords")}</p>
            <p className="text-gray-500 text-sm">{t("ledgerNoRecordsHint")}</p>
          </motion.div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([dateKey, txns]) => {
              const dayTotal = txns.reduce((s, tx) => {
                const getEntryAmount = (a: any) => a.amountUSD ?? a.amount ?? 0;
                const val = getEntryAmount(tx);
                return tx.type === "INCOME" ? s + val : s - val;
              }, 0);
              return (
                <div key={dateKey}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={12} className="text-gray-600" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        {formatDateGroup(dateKey, t("ledgerToday"), t("ledgerYesterday"), language)}
                      </span>
                    </div>
                    <div className={cn("text-xs font-black tracking-tighter", dayTotal >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                      {dayTotal >= 0 ? "+" : ""}{formatMoney(Math.abs(dayTotal))}
                    </div>
                  </div>

                  <div className="bg-[#141414] border border-white/6 rounded-2xl overflow-hidden divide-y divide-white/4">
                    {txns.map((txn, i) => {
                      const isIncome = txn.type === "INCOME";
                      const displayCategory = t(txn.category) !== txn.category ? t(txn.category) : txn.category;
                      return (
                        <motion.div
                          key={txn.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className="flex items-center gap-3 px-4 py-3.5 group hover:bg-white/3 transition-colors"
                        >
                          <div
                            className="emoji-text w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
                            style={{ background: isIncome ? "rgba(78,222,163,0.08)" : "rgba(255,180,171,0.08)", fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif" }}
                          >
                            {getCategoryIcon(txn.category)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white truncate">{displayCategory}</span>
                              {isIncome
                                ? <ArrowUpRight size={12} className="text-[#4EDEA3] flex-shrink-0" />
                                : <ArrowDownLeft size={12} className="text-[#FFB4AB] flex-shrink-0" />
                              }
                            </div>
                            {txn.note && (
                              <p className="text-[11px] text-gray-500 truncate mt-0.5">{txn.note}</p>
                            )}
                          </div>

                          <div className="text-right flex-shrink-0">
                            <span className={cn("text-sm font-black tracking-tighter", isIncome ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}
                            >
                              {isIncome ? "+" : "-"}
                              {formatMoney(txn.amountUSD ?? txn.amount ?? 0, txn.currency as any, txn.rateAtTime ?? 1, txn.originalAmount)}
                            </span>
                            <p className="text-[10px] text-gray-600 mt-0.5">
                              {new Date(txn.date).toLocaleTimeString(language === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>

                          <button
                            onClick={() => setToDelete(txn.id)}
                            className="p-1.5 text-gray-700 hover:text-[#FFB4AB] hover:bg-[#FFB4AB]/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => { if (toDelete) { removeCashActivity(toDelete); setToDelete(null); } }}
        title={t("ledgerDeleteTitle")}
        message={t("ledgerDeleteMessage")}
        confirmText={t("delete")}
        isDanger={true}
      />
    </div>
  );
}
