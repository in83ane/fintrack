"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Pencil,
  Trash2,
  TrendingUp,
  Lightbulb,
  History,
  DollarSign,
  Rocket,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Info,
  Wallet,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Banknote,
  PiggyBank,
  Check,
  X,
  CreditCard,
  Target,
  ArrowRightLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import { Modal } from "@/src/components/Modal";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { TransactionDetailModal } from "@/src/components/TransactionDetailModal";

export default function BudgetPage() {
  // Hide number input spinners (arrows) via inline style injection
  const hideSpinnerStyle = `
    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    input[type=number] {
      -moz-appearance: textfield;
    }
  `;
  const {
    t,
    formatMoney,
    language,
    currency,
    exchangeRates,
    moneyBuckets,
    addMoneyBucket,
    updateMoneyBucket,
    removeMoneyBucket,
    bucketActivities,
    addBucketActivity,
    addCashActivity,
    addToast,
  } = useApp();

  const convertCurrency = (amount: number, from: "USD" | "THB", to: "USD" | "THB") => {
    const usd = amount / (exchangeRates[from] || 1);
    return usd * (exchangeRates[to] || 1);
  };
  const toUSD = (displayAmount: number, from: "USD" | "THB" = currency as "USD" | "THB") => convertCurrency(displayAmount, from, "USD");

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
  const currencySymbol = formatDisplay(0).replace(/[0-9,.\s-]/g, "");
  const bucketCurrency = (bucket: { currency?: string }) => (bucket.currency === "THB" ? "THB" : "USD");
  const formatBucketAmount = (bucket: { currency?: string }, amount: number) => {
    const bCur = bucketCurrency(bucket) as "USD" | "THB";
    const targetCur = currency as "USD" | "THB";
    
    if (bCur === targetCur) {
      return formatDisplay(amount, targetCur);
    } else {
      const converted = convertCurrency(amount, bCur, targetCur);
      return formatDisplay(converted, targetCur);
    }
  };

  const [inputCurrency, setInputCurrency] = useState<"USD" | "THB">(currency === "THB" ? "THB" : "USD");

  const handleCurrencyChange = (newCur: "USD" | "THB") => {
    if (newCur === inputCurrency) return;
    const THB_RATE = exchangeRates["THB"] || 36.5;
    
    // Convert existing form values to new currency display
    if (bucketForm.targetAmount) {
      const currentTarget = parseFloat(bucketForm.targetAmount) || 0;
      setBucketForm(prev => ({ ...prev, targetAmount: (newCur === "THB" ? currentTarget * THB_RATE : currentTarget / THB_RATE).toFixed(2) }));
    }
    if (bucketForm.currentAmount) {
      const currentAmount = parseFloat(bucketForm.currentAmount) || 0;
      setBucketForm(prev => ({ ...prev, currentAmount: (newCur === "THB" ? currentAmount * THB_RATE : currentAmount / THB_RATE).toFixed(2) }));
    }
    
    setInputCurrency(newCur);
  };

  const [incomeAmount, setIncomeAmount] = useState("");
  const [showIncomePreview, setShowIncomePreview] = useState(false);
  const [profitAmount, setProfitAmount] = useState("");
  const [showProfitSuggestion, setShowProfitSuggestion] = useState(false);
  const [investModal, setInvestModal] = useState<{ sourceBucketId: string } | null>(null);
  const [investAmountValue, setInvestAmountValue] = useState("");
  const [transferModal, setTransferModal] = useState<{ sourceBucketId: string; destinationBucketId: string; amount: string; currency: "USD" | "THB"; note: string } | null>(null);
  const [transferDropdownOpen, setTransferDropdownOpen] = useState(false);
  const [actionModal, setActionModal] = useState<{ id: string; type: "deposit" | "withdraw" } | null>(null);
  const [actionAmount, setActionAmount] = useState("");
  const [actionCurrency, setActionCurrency] = useState<"USD" | "THB">(currency as "USD" | "THB");
  const [actionNote, setActionNote] = useState("");
  const [isBucketModalOpen, setIsBucketModalOpen] = useState(false);
  const [bucketToDelete, setBucketToDelete] = useState<string | null>(null);
  const [editingBucket, setEditingBucket] = useState<string | null>(null);
  
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  const handleViewDetails = (activity: any) => {
    setSelectedActivity({
      id: activity.id,
      activityType: activity.type,
      amountUSD: activity.amount,
      date: activity.date,
      bucketName: activity.bucketName,
      note: activity.note,
    });
    setShowDetailModal(true);
  };

  const [bucketForm, setBucketForm] = useState({
    name: "",
    targetPercent: "",
    targetAmount: "",
    currentAmount: "",
    color: "#4EDEA3",
    icon: "💰",
    linkedToExpenses: false,
  });

  const usedColors = useMemo(() => {
    if (editingBucket) {
      return moneyBuckets.filter(b => b.id !== editingBucket).map(b => b.color);
    }
    return moneyBuckets.map(b => b.color);
  }, [moneyBuckets, editingBucket]);

  const hexToHsl = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { h: 0, s: 0, l: 0 };
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  };


  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isCarouselHovered, setIsCarouselHovered] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);

  const updateScrollState = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, moneyBuckets]);

  const totalAllocated = useMemo(() => moneyBuckets.reduce((s, b) => s + (b.currentAmount / (exchangeRates[b.currency || 'USD'] || 1)), 0), [moneyBuckets, exchangeRates]);
  const totalTargetPercent = useMemo(() => moneyBuckets.reduce((s, b) => s + b.targetPercent, 0), [moneyBuckets]);

  const canAddMoreBuckets = totalTargetPercent < 100;
  const remainingPercent = Math.max(0, 100 - totalTargetPercent);

  const scrollCarousel = (direction: "left" | "right") => {
    if (carouselRef.current) {
      const scrollAmount = 400;
      carouselRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const incomeNum = parseFloat(incomeAmount) || 0;
  const incomePreview = moneyBuckets.map((b) => ({
    ...b,
    split: totalTargetPercent > 0 ? (incomeNum * b.targetPercent) / totalTargetPercent : 0,
  }));

  const handleDistributeIncome = () => {
    if (incomeNum <= 0) return;
    const now = new Date().toISOString();
    moneyBuckets.forEach((b) => {
      const splitDisplay = totalTargetPercent > 0 ? (incomeNum * b.targetPercent) / totalTargetPercent : 0;
      const targetCurrency = bucketCurrency(b);
      const splitBucketAmount = convertCurrency(splitDisplay, inputCurrency, targetCurrency);
      const splitUSD = toUSD(splitDisplay, inputCurrency);
      if (splitBucketAmount > 0) {
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
        // Add cash activity for Cashflow page
        addCashActivity({
          type: "DEPOSIT",
          amountUSD: splitUSD,
          category: t(b.name) || b.name,
          date: now,
          bucketId: b.id,
          note: `Income distribution ${b.targetPercent}% - ${t(b.name) || b.name}`,
          currency: inputCurrency,
          rateAtTime: exchangeRates[inputCurrency] || 1,
          originalAmount: splitDisplay,
        });
      }
    });
    addToast(`${t("distributed")} ${formatDisplay(incomeNum)}`, "success");
    setIncomeAmount("");
    setShowIncomePreview(false);
  };

  const profitNum = parseFloat(profitAmount) || 0;
  const emergencyBucket = moneyBuckets.find((b) => b.name === 'Emergency Fund (Low Risk)' || b.name.toLowerCase().includes('emergency'));
  const investBucket = moneyBuckets.find((b) => b.name === 'Investment (High Risk)' || b.name.toLowerCase().includes('invest'));

  const handleApplyProfitSuggestion = () => {
    if (profitNum <= 0) return;
    const halfADisplay = Math.floor(profitNum * 100 / 2) / 100;
    const halfBDisplay = Math.round((profitNum - halfADisplay) * 100) / 100;
    const halfAUSD = toUSD(halfADisplay, inputCurrency);
    const halfBUSD = toUSD(halfBDisplay, inputCurrency);
    const now = new Date().toISOString();
    if (emergencyBucket) {
      updateMoneyBucket(emergencyBucket.id, { currentAmount: emergencyBucket.currentAmount + halfAUSD });
      addBucketActivity({
        bucketId: emergencyBucket.id,
        bucketName: emergencyBucket.name,
        type: "profit_split",
        amount: halfAUSD,
        date: now,
        note: `${t("suggestSafeHaven")} — 50%`,
        currency: inputCurrency,
        rateAtTime: exchangeRates[inputCurrency] || 1,
      });
      // Add cash activity for Cashflow page
      addCashActivity({
        type: "DEPOSIT",
        amountUSD: halfAUSD,
        category: t(emergencyBucket.name) || emergencyBucket.name,
        date: now,
        bucketId: emergencyBucket.id,
        note: `Profit split 50% - ${t(emergencyBucket.name) || emergencyBucket.name}`,
        currency: inputCurrency,
        rateAtTime: exchangeRates[inputCurrency] || 1,
      });
    }
    if (investBucket) {
      updateMoneyBucket(investBucket.id, { currentAmount: investBucket.currentAmount + halfBUSD });
      addBucketActivity({
        bucketId: investBucket.id,
        bucketName: investBucket.name,
        type: "profit_split",
        amount: halfBUSD,
        date: now,
        note: `${t("suggestReinvest")} — 50%`,
        currency: inputCurrency,
        rateAtTime: exchangeRates[inputCurrency] || 1,
      });
      // Add cash activity for Cashflow page
      addCashActivity({
        type: "DEPOSIT",
        amountUSD: halfBUSD,
        category: t(investBucket.name) || investBucket.name,
        date: now,
        bucketId: investBucket.id,
        note: `Profit split 50% - ${t(investBucket.name) || investBucket.name}`,
        currency: inputCurrency,
        rateAtTime: exchangeRates[inputCurrency] || 1,
      });
    }
    addToast(`${t("profitAdded")} ${formatDisplay(profitNum)}`, "success");
    setProfitAmount("");
    setShowProfitSuggestion(false);
  };

  const handleInvest = () => {
    const displayAmt = parseFloat(investAmountValue);
    if (displayAmt < 0) {
      addToast(t("invalidAmount") || "Invalid amount", "error");
      return;
    }
    if (!displayAmt || displayAmt <= 0 || !investModal) return;
    const bucket = moneyBuckets.find((b) => b.id === investModal.sourceBucketId);
    if (!bucket) return;
    const amtUSD = toUSD(displayAmt, inputCurrency);
    if (amtUSD <= 0) return;

    if (displayAmt > bucket.currentAmount) {
      addToast(t("amountExceedsBalance"), "error");
      return;
    }

    const bCur = bucketCurrency(bucket) as "USD" | "THB";
    const convertedAmount = convertCurrency(displayAmt, inputCurrency, bCur);
    updateMoneyBucket(bucket.id, {
      currentAmount: Math.max(0, bucket.currentAmount - convertedAmount)
    });

    const now = new Date().toISOString();
    addBucketActivity({
      bucketId: bucket.id,
      bucketName: bucket.name,
      type: "withdraw",
      amount: displayAmt,
      date: now,
      note: t("noteInvest") || "Move to Portfolio (Invest)",
      currency: inputCurrency,
      rateAtTime: exchangeRates[inputCurrency] || 1,
      originalAmount: displayAmt,
    });
    addCashActivity({
      type: "WITHDRAW",
      amountUSD: amtUSD,
      category: "invest",
      date: now,
      bucketId: bucket.id,
      note: t("noteInvest") || "Move to Portfolio (Invest)",
      currency: inputCurrency,
      rateAtTime: exchangeRates[inputCurrency] || 1,
      originalAmount: displayAmt,
    });
    addToast(`${t("movedToPortfolio")}: ${formatDisplay(displayAmt)}`, "success");
    setInvestModal(null);
    setInvestAmountValue("");
  };

  const handleTransfer = () => {
    if (!transferModal) return;
    const { sourceBucketId, destinationBucketId, amount, currency: inputCur, note } = transferModal;
    const transferAmount = parseFloat(amount);
    
    if (transferAmount <= 0 || isNaN(transferAmount)) return;
    if (sourceBucketId === destinationBucketId) {
      addToast(t("errorOccurred") || "Source and destination cannot be the same", "error");
      return;
    }

    const sourceBucket = moneyBuckets.find(b => b.id === sourceBucketId);
    const destBucket = moneyBuckets.find(b => b.id === destinationBucketId);
    
    if (!sourceBucket || !destBucket) return;

    const sourceCurrency = bucketCurrency(sourceBucket) as "USD" | "THB";
    const destCurrency = bucketCurrency(destBucket) as "USD" | "THB";

    const convertedToSourceCur = convertCurrency(transferAmount, inputCur, sourceCurrency);

    if (convertedToSourceCur > sourceBucket.currentAmount) {
      addToast(t("amountExceedsBalance"), "error");
      return;
    }

    const amountUSD = toUSD(transferAmount, inputCur);
    const destAmount = convertCurrency(transferAmount, inputCur, destCurrency);
    const now = new Date().toISOString();

    // Withdraw from Source
    updateMoneyBucket(sourceBucket.id, { currentAmount: sourceBucket.currentAmount - convertedToSourceCur });
    addBucketActivity({
      bucketId: sourceBucket.id,
      bucketName: sourceBucket.name,
      type: "withdraw",
      amount: convertedToSourceCur,
      date: now,
      note: note || `Transfer to ${t(destBucket.name) || destBucket.name}`,
      currency: sourceCurrency,
      rateAtTime: exchangeRates[sourceCurrency] || 1,
      originalAmount: convertedToSourceCur,
    });
    addCashActivity({
      type: "WITHDRAW",
      amountUSD: amountUSD,
      category: t(sourceBucket.name) || sourceBucket.name,
      date: now,
      bucketId: sourceBucket.id,
      note: note || `Transfer to ${t(destBucket.name) || destBucket.name}`,
      currency: inputCur,
      rateAtTime: exchangeRates[inputCur] || 1,
      originalAmount: transferAmount,
      isTransfer: true,
    });

    // Deposit to Destination
    updateMoneyBucket(destBucket.id, { currentAmount: destBucket.currentAmount + destAmount });
    addBucketActivity({
      bucketId: destBucket.id,
      bucketName: destBucket.name,
      type: "deposit",
      amount: destAmount,
      date: now,
      note: note || `Transfer from ${t(sourceBucket.name) || sourceBucket.name}`,
      currency: destCurrency,
      rateAtTime: exchangeRates[destCurrency] || 1,
      originalAmount: destAmount,
    });
    addCashActivity({
      type: "DEPOSIT",
      amountUSD: amountUSD,
      category: t(destBucket.name) || destBucket.name,
      date: now,
      bucketId: destBucket.id,
      note: note || `Transfer from ${t(sourceBucket.name) || sourceBucket.name}`,
      currency: inputCur,
      rateAtTime: exchangeRates[inputCur] || 1,
      originalAmount: transferAmount,
      isTransfer: true,
    });

    addToast(`${t("transfer")} ${formatDisplay(transferAmount)} ${inputCur === "THB" ? "฿" : "$"}`, "success");
    setTransferModal(null);
  };

  const handleSaveBucket = () => {
    if (!bucketForm.name.trim()) return;
    const otherBucketsPercent = totalTargetPercent - (editingBucket ? (moneyBuckets.find(b => b.id === editingBucket)?.targetPercent || 0) : 0);
    const maxAllowed = Math.max(1, 100 - otherBucketsPercent);
    const safePercent = Math.min(Math.max(1, Number(bucketForm.targetPercent) || 1), maxAllowed);
    
    const targetAmount = Number(bucketForm.targetAmount) || 0;
    const currentAmount = Number(bucketForm.currentAmount) || 0;

    if (editingBucket) {
      updateMoneyBucket(editingBucket, {
        name: bucketForm.name,
        targetPercent: safePercent,
        targetAmount,
        currentAmount,
        currency: inputCurrency,
        color: bucketForm.color,
        icon: bucketForm.icon,
        linkedToExpenses: bucketForm.linkedToExpenses,
      });
    } else {
      addMoneyBucket({
        name: bucketForm.name,
        targetPercent: safePercent,
        targetAmount,
        currentAmount,
        currency: inputCurrency,
        color: bucketForm.color,
        icon: bucketForm.icon,
        linkedToExpenses: bucketForm.linkedToExpenses,
      });
    }
    addToast(t("bucketSaved"), "success");
    setIsBucketModalOpen(false);
  };

  const handleActionSubmit = () => {
    const displayVal = Number(actionAmount);
    if (!displayVal || displayVal <= 0 || !actionModal) return;
    const bucket = moneyBuckets.find((b) => b.id === actionModal.id);
    if (!bucket) return;
    
    const targetCurrency = bucketCurrency(bucket) as "USD" | "THB";
    const bucketAmount = convertCurrency(displayVal, actionCurrency, targetCurrency);
    
    if (actionModal.type === "withdraw" && bucketAmount > bucket.currentAmount) {
      addToast(t("amountExceedsBalance"), "error");
      return;
    }
    
    const newAmount =
      actionModal.type === "deposit"
        ? bucket.currentAmount + bucketAmount
        : Math.max(0, bucket.currentAmount - bucketAmount);
        
    const now = new Date().toISOString();
    updateMoneyBucket(bucket.id, { currentAmount: newAmount });
    
    addBucketActivity({
      bucketId: bucket.id,
      bucketName: bucket.name,
      type: actionModal.type,
      amount: bucketAmount,
      date: now,
      note: actionNote || (`${actionModal.type === "deposit" ? "+" : "-"}${formatDisplay(displayVal)} ${actionCurrency}`),
      currency: actionCurrency,
      rateAtTime: exchangeRates[actionCurrency] || 1,
      originalAmount: displayVal,
    });
    
    // Add cash activity so Ledger acts as the Single Source of Truth
    const amtUSD = toUSD(displayVal, actionCurrency);
    addCashActivity({
      type: actionModal.type === "deposit" ? "DEPOSIT" : "WITHDRAW",
      amountUSD: amtUSD,
      category: t(bucket.name) || bucket.name,
      date: now,
      bucketId: bucket.id,
      note: actionNote || (`${actionModal.type === "deposit" ? "Add to" : "Withdraw from"} ${t(bucket.name) || bucket.name}`),
      currency: actionCurrency,
      rateAtTime: exchangeRates[actionCurrency] || 1,
      originalAmount: displayVal,
    });
    
    addToast(`${actionModal.type === "deposit" ? t("deposit") : t("withdraw")} ${formatDisplay(displayVal)} ${actionCurrency}`, "success");
    setActionModal(null);
    setActionAmount("");
    setActionNote("");
  };

  const activityIcon = (type: string) => {
    switch (type) {
      case "income_split": return <DollarSign size={14} />;
      case "invest": return <Rocket size={14} />;
      case "profit_split": return <TrendingUp size={14} />;
      case "deposit": return <ArrowDownToLine size={14} />;
      case "withdraw": return <ArrowUpFromLine size={14} />;
      default: return <Zap size={14} />;
    }
  };

  const activityColor = (type: string) => {
    switch (type) {
      case "income_split": return "#ADC6FF";
      case "invest": return "#FF8B9A";
      case "profit_split": return "#4EDEA3";
      case "deposit": return "#4EDEA3";
      case "withdraw": return "#FFB4AB";
      default: return "#E9C349";
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <style>{hideSpinnerStyle}</style>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <span className="text-[#E9C349] uppercase tracking-wide text-xs font-black mb-1 block">
            {t("moneyManagement")}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tighter mb-1">{t("budgetPage")}</h1>
          <p className="text-gray-500 font-medium text-xs uppercase tracking-wide">{t("moneyBucketsDesc")}</p>
        </motion.div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              setEditingBucket(null);
              const presetColors = ["#4EDEA3", "#ADC6FF", "#E9C349", "#FF8B9A", "#FFB4AB", "#A78BFA", "#60A5FA", "#F97316"];
              const usedColorsList = moneyBuckets.map(b => b.color);
              const unusedColor = presetColors.find(c => !usedColorsList.includes(c)) || "#4EDEA3";
              const initialCurr = currency === "THB" ? "THB" : "USD";
              setInputCurrency(initialCurr);
              setBucketForm({ name: "", targetPercent: "", targetAmount: "", currentAmount: "", color: unusedColor, icon: "💰", linkedToExpenses: false });
              setIsBucketModalOpen(true);
            }}
            disabled={!canAddMoreBuckets}
            className={cn(
              "px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wide transition-all flex items-center gap-2",
              canAddMoreBuckets
                ? "bg-[#E9C349] text-[#241a00] hover:brightness-110"
                : "bg-gray-600 text-gray-400 cursor-not-allowed"
            )}
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t("addBucket")}</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Total Net Worth Card with Ring Chart */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-[#1C1B1B] to-[#141414] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-border relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#E9C349]/5 blur-3xl rounded-full" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between relative z-10 gap-4">
          <div className="flex-1">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t("bucketTotal")}</span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tighter">{formatMoney(totalAllocated)}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-bold text-gray-500">{moneyBuckets.length} {t("buckets")}</span>
              <span className={cn("text-xs font-bold", totalTargetPercent === 100 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                {totalTargetPercent}% {t("total")}
              </span>
            </div>
          </div>
          {/* Ring Chart (#15) */}
          {moneyBuckets.length > 0 && (
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 100 100" className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0">
                {(() => {
                  let cumPct = 0;
                  const R = 38, r = 26, C = 50;
                  return moneyBuckets.map((b, i) => {
                    let pct = totalAllocated > 0 ? Math.max((b.currentAmount / totalAllocated) * 100, 0.5) : (100 / moneyBuckets.length);
                    if (pct >= 100) pct = 99.99;
                    const startAngle = cumPct * 3.6;
                    cumPct += pct;
                    const endAngle = cumPct * 3.6;
                    const largeArc = pct > 50 ? 1 : 0;
                    const startRad = ((startAngle - 90) * Math.PI) / 180;
                    const endRad = ((endAngle - 90) * Math.PI) / 180;
                    const x1 = C + R * Math.cos(startRad);
                    const y1 = C + R * Math.sin(startRad);
                    const x2 = C + R * Math.cos(endRad);
                    const y2 = C + R * Math.sin(endRad);
                    return (
                      <path
                        key={i}
                        d={`M ${C} ${C} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`}
                        fill={b.color}
                        stroke="#0f1115"
                        strokeWidth={1}
                        opacity={0.85}
                      />
                    );
                  });
                })()}
                <circle cx={50} cy={50} r={22} fill="#0f1115" />
                <text x={50} y={48} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="bold">
                  {moneyBuckets.length}
                </text>
                <text x={50} y={60} textAnchor="middle" dominantBaseline="middle" fill="#6B7280" fontSize="6" fontWeight="bold">
                  {language === 'th' ? 'กระเป๋า' : 'buckets'}
                </text>
              </svg>
            </div>
          )}
        </div>
        <div className="h-2.5 sm:h-3 bg-white/5 rounded-full overflow-hidden flex mt-4">
          {moneyBuckets.map((b) => (
            <motion.div
              key={b.id}
              initial={{ width: 0 }}
              animate={{ width: `${totalTargetPercent > 0 ? (b.targetPercent / totalTargetPercent) * 100 : 0}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ backgroundColor: b.color }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 sm:gap-4 mt-3">
          {moneyBuckets.map((b) => (
            <div key={b.id} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
              <span className="text-[10px] font-bold text-gray-400">{t(b.name) || b.name} {b.targetPercent}%</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Account Cards Carousel - Luxury Glass Design */}
      <div
        className="mb-6 sm:mb-8 relative"
        onMouseEnter={() => setIsCarouselHovered(true)}
        onMouseLeave={() => setIsCarouselHovered(false)}
      >
        {/* Edge fade shadows — only show when there's content hidden in that direction */}
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-r from-black/40 to-transparent hidden sm:block" />
        )}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-l from-black/40 to-transparent hidden sm:block" />
        )}

        <div
          ref={carouselRef}
          className="flex gap-4 sm:gap-6 overflow-x-auto py-3 px-1 pb-5 scrollbar-none snap-x snap-mandatory"
        >
          {moneyBuckets.map((bucket) => {
            const actualPct = (bucket.targetAmount && bucket.targetAmount > 0) 
              ? (bucket.currentAmount / bucket.targetAmount) * 100 
              : (totalAllocated > 0 ? (bucket.currentAmount / totalAllocated) * 100 : 0);
            return (
              <motion.div
                key={bucket.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative flex-shrink-0 snap-start group min-w-[280px] sm:min-w-[340px] min-h-[16rem] h-auto"
                style={{ willChange: "transform" }}
              >
                {/* Wrapper that scales — keeps glow clipped inside radius */}
                <div className="absolute inset-0 rounded-xl sm:rounded-2xl overflow-hidden pointer-events-none">
                  <div className="absolute -right-4 -top-4 w-24 h-24 blur-2xl rounded-full opacity-20" style={{ backgroundColor: bucket.color }} />
                </div>
                {/* Card surface — scales on hover */}
                <div
                  className="relative h-full bg-[#353534]/40 backdrop-blur-xl p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-[#424754]/5 shadow-xl flex flex-col justify-between group-hover:scale-[1.02] transition-all duration-200"
                >
                <div className="flex justify-between items-start relative z-10">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-base sm:text-lg" style={{ backgroundColor: `${bucket.color}15` }}>
                      {bucket.icon}
                    </div>
                    <div>
                      <h3 className="font-bold text-white tracking-tight text-sm sm:text-base">{t(bucket.name) || bucket.name}</h3>
                      <p className="text-[0.55rem] sm:text-[0.6rem] text-[#8c909f] uppercase tracking-widest">{bucket.targetPercent}% {t("incomeSplit") || "Income Split"}</p>
                    </div>
                  </div>
                  <div className="flex gap-0.5 sm:gap-1 opacity-0 group-hover:opacity-100 transition-opacity relative z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBucket(bucket.id);
                        const initialCurr = bucketCurrency(bucket);
                        setInputCurrency(initialCurr);
                        const targetVal = bucket.targetAmount || 0;
                        const currentVal = bucket.currentAmount;
                        setBucketForm({ 
                          name: bucket.name, 
                          targetPercent: bucket.targetPercent.toString(), 
                          targetAmount: targetVal > 0 ? targetVal.toFixed(2) : "",
                          currentAmount: currentVal > 0 ? currentVal.toFixed(2) : "0", 
                          color: bucket.color, 
                          icon: bucket.icon, 
                          linkedToExpenses: bucket.linkedToExpenses || false 
                        });
                        setIsBucketModalOpen(true);
                      }}
                      className="p-1 sm:p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setBucketToDelete(bucket.id); }}
                      className="p-1 sm:p-1.5 rounded-lg text-gray-500 hover:text-[#FFB4AB] hover:bg-[#FFB4AB]/10 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="relative z-10 flex-1 flex flex-col justify-center">
                  <span className="text-[0.6rem] sm:text-[0.6875rem] text-[#8c909f] uppercase font-bold tracking-[0.15em] mb-1">
                    {bucket.targetAmount && bucket.targetAmount > 0 ? t("savings") : t("currentAmount")}
                  </span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-[#8c909f] font-light text-lg sm:text-xl">{formatBucketAmount(bucket, 0).replace(/[0-9,.\s-]/g, "")}</span>
                    <span className="text-3xl sm:text-4xl font-black tracking-[-0.04em] text-white">
                      {formatBucketAmount(bucket, bucket.currentAmount).replace(/[^0-9,.]/g, "")}
                    </span>
                    {bucket.targetAmount && bucket.targetAmount > 0 ? (
                      <span className="text-sm sm:text-base font-bold text-[#8c909f]/60 ml-1 tracking-tight">
                        / {formatBucketAmount(bucket, bucket.targetAmount).replace(/[^0-9,.]/g, "")}
                      </span>
                    ) : null}
                  </div>
                  {(bucket.targetAmount && bucket.targetAmount > 0 && bucket.currentAmount > bucket.targetAmount) ? (
                    <div 
                      className="mt-3 text-[10px] sm:text-xs text-[#E9C349] font-bold bg-[#E9C349]/10 border border-[#E9C349]/20 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer hover:bg-[#E9C349]/20 transition-colors max-w-fit"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInvestModal({ sourceBucketId: bucket.id });
                      }}
                    >
                      💡 {t("suggestionInvest")} {formatBucketAmount(bucket, bucket.currentAmount - bucket.targetAmount)}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5 sm:space-y-2 relative z-10">
                  <div className="flex justify-between items-end text-[0.6rem] sm:text-[0.6875rem] uppercase tracking-widest font-bold">
                    <span className="text-[#8c909f]">{t("progress")}</span>
                    <span className="text-[#4EDEA3]">{actualPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 sm:h-2 w-full bg-background rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#4EDEA3] to-[#ADC6FF] rounded-full transition-all duration-500" style={{ width: `${Math.min(actualPct, 100)}%` }} />
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4">
                  {actionModal?.id === bucket.id ? (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2 bg-background/50 p-2 sm:p-3 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn("text-xs font-black uppercase tracking-wide", actionModal.type === 'deposit' ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]')}>
                          {actionModal.type === 'deposit' ? t("deposit") : t("withdraw")}
                        </span>
                        <button onClick={() => setActionModal(null)} className="text-gray-500 hover:text-white transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="Amount"
                          value={actionAmount}
                          onChange={(e) => setActionAmount(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#ADC6FF]"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleActionSubmit();
                            }
                          }}
                        />
                        <button
                          onClick={handleActionSubmit}
                          disabled={!actionAmount || parseFloat(actionAmount) <= 0}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all",
                            actionAmount && parseFloat(actionAmount) > 0
                              ? "bg-white text-black"
                              : "bg-white/10 text-gray-500 cursor-not-allowed"
                          )}
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionModal({ id: bucket.id, type: "deposit" });
                          setActionAmount("");
                          setActionNote("");
                        }}
                        className="flex-1 py-2 sm:py-2.5 rounded-xl font-black text-[10px] sm:text-xs uppercase bg-[#4EDEA3]/10 text-[#4EDEA3] border border-[#4EDEA3]/20 hover:bg-[#4EDEA3]/20 transition-all flex items-center justify-center gap-1.5"
                      >
                        <ArrowDownToLine size={12} className="sm:w-3.5 sm:h-3.5" />
                        {t("deposit")}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionModal({ id: bucket.id, type: "withdraw" });
                          setActionAmount("");
                          setActionNote("");
                        }}
                        className="flex-1 py-2 sm:py-2.5 rounded-xl font-black text-[10px] sm:text-xs uppercase bg-[#FFB4AB]/10 text-[#FFB4AB] border border-[#FFB4AB]/20 hover:bg-[#FFB4AB]/20 transition-all flex items-center justify-center gap-1.5"
                      >
                        <ArrowUpFromLine size={12} className="sm:w-3.5 sm:h-3.5" />
                        {t("withdraw")}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTransferModal({ sourceBucketId: bucket.id, destinationBucketId: "", amount: "", currency: currency as "USD" | "THB", note: "" });
                        }}
                        className="flex-[0.5] py-2 sm:py-2.5 rounded-xl font-black text-[10px] sm:text-xs uppercase bg-[#ADC6FF]/10 text-[#ADC6FF] border border-[#ADC6FF]/20 hover:bg-[#ADC6FF]/20 transition-all flex items-center justify-center gap-1.5"
                        title={t("transfer") || "Transfer"}
                      >
                        <ArrowRightLeft size={12} className="sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                </div>{/* end card surface */}
              </motion.div>
            );
          })}
          {/* Add Bucket Placeholder */}
          <div
            onClick={() => {
              if (!canAddMoreBuckets) return;
              setEditingBucket(null);
              const presetColors = ["#4EDEA3", "#ADC6FF", "#E9C349", "#FF8B9A", "#FFB4AB", "#A78BFA", "#60A5FA", "#F97316"];
              const usedColorsList = moneyBuckets.map(b => b.color);
              const unusedColor = presetColors.find(c => !usedColorsList.includes(c)) || "#4EDEA3";
              const initialCurr = currency === "THB" ? "THB" : "USD";
              setInputCurrency(initialCurr);
              setBucketForm({ name: "", targetPercent: "", targetAmount: "", currentAmount: "", color: unusedColor, icon: "💰", linkedToExpenses: false });
              setIsBucketModalOpen(true);
            }}
            className={cn(
              "bg-background/50 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-dashed flex flex-col items-center justify-center min-h-[16rem] h-auto min-w-[240px] sm:min-w-[280px] flex-shrink-0 snap-start transition-all",
              canAddMoreBuckets
                ? "border-[#424754]/20 cursor-pointer group hover:border-[#ADC6FF]/40"
                : "border-gray-700 cursor-not-allowed opacity-50"
            )}
          >
            <Plus className={cn("text-3xl sm:text-4xl mb-3 sm:mb-4 transition-colors", canAddMoreBuckets ? "text-[#8c909f]/30 group-hover:text-[#ADC6FF]/40" : "text-gray-700")} size={40} />
            <span className={cn("text-[10px] sm:text-xs font-bold uppercase tracking-widest", canAddMoreBuckets ? "text-[#8c909f]" : "text-gray-600")}>
              {canAddMoreBuckets ? t("addBucket") : `${t("target")} 100%`}
            </span>
          </div>
        </div>
        {/* Scroll Buttons — Spotify style: float on sides, only appear on hover, only when scrollable */}
        <AnimatePresence>
          {canScrollLeft && (
            <motion.button
              key="scroll-left"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: isCarouselHovered ? 1 : 0, scale: isCarouselHovered ? 1 : 0.8 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.18 }}
              onClick={() => scrollCarousel("left")}
              className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full items-center justify-center bg-[#1a1a1a]/95 border border-white/20 text-white shadow-xl hover:bg-white/20 hover:scale-110 active:scale-95 transition-all"
            >
              <ChevronLeft size={18} />
            </motion.button>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {canScrollRight && (
            <motion.button
              key="scroll-right"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: isCarouselHovered ? 1 : 0, scale: isCarouselHovered ? 1 : 0.8 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.18 }}
              onClick={() => scrollCarousel("right")}
              className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full items-center justify-center bg-[#1a1a1a]/95 border border-white/20 text-white shadow-xl hover:bg-white/20 hover:scale-110 active:scale-95 transition-all"
            >
              <ChevronRight size={18} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input Panels Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Income Distribution Panel */}
        <div className="bg-surface rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-border">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#ADC6FF]/10 flex items-center justify-center text-[#ADC6FF]">
              <DollarSign size={16} />
            </div>
            <h3 className="text-sm font-bold text-white">{t("incomeDistribution")}</h3>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                placeholder={t("enterIncome")}
                value={incomeAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes('-')) return;
                  setIncomeAmount(val);
                  setShowIncomePreview(!!val && parseFloat(val) > 0);
                }}
                className="w-full bg-white/5 border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-3 pr-20 text-white text-sm outline-none focus:border-[#ADC6FF]/50 transition-all placeholder:text-gray-600"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 p-0.5 bg-white/5 rounded-lg border border-border">
                {(['USD', 'THB'] as const).map(cur => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => handleCurrencyChange(cur)}
                    className={cn(
                      'px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                      inputCurrency === cur
                        ? cur === 'THB'
                          ? 'bg-[#E9C349] text-[#241a00]'
                          : 'bg-[#ADC6FF] text-[#00285d]'
                        : 'text-gray-500 hover:text-gray-300'
                    )}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>
            <AnimatePresence>
              {showIncomePreview && incomeNum > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-white/5 rounded-2xl p-3 space-y-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t("previewDistribution")}</span>
                    {incomePreview.map((b) => (
                      <div key={b.id} className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{b.icon}</span>
                          <span className="text-xs font-bold text-gray-400">{t(b.name) || b.name}</span>
                        </div>
                        <span className="text-xs font-black text-white">+{formatDisplay(b.split)}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={handleDistributeIncome}
              disabled={incomeNum <= 0}
              className={cn(
                "w-full py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs uppercase tracking-wide transition-all",
                incomeNum > 0 ? "bg-[#ADC6FF] text-[#00285d] hover:brightness-110 active:scale-95" : "bg-white/5 text-gray-600 cursor-not-allowed"
              )}
            >
              {t("distributeNow")}
            </button>
          </div>
        </div>

        {/* Add Profit Panel */}
        <div className="bg-surface rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-border">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#4EDEA3]/10 flex items-center justify-center text-[#4EDEA3]">
              <TrendingUp size={16} />
            </div>
            <h3 className="text-sm font-bold text-white">{t("addProfit")}</h3>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                placeholder={t("profitAmount")}
                value={profitAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes('-')) return;
                  setProfitAmount(val);
                  setShowProfitSuggestion(!!val && parseFloat(val) > 0);
                }}
                className="w-full bg-white/5 border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-3 pr-20 text-white text-sm outline-none focus:border-[#4EDEA3]/50 transition-all placeholder:text-gray-600"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 p-0.5 bg-white/5 rounded-lg border border-border">
                {(['USD', 'THB'] as const).map(cur => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => handleCurrencyChange(cur)}
                    className={cn(
                      'px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                      inputCurrency === cur
                        ? cur === 'THB'
                          ? 'bg-[#E9C349] text-[#241a00]'
                          : 'bg-[#ADC6FF] text-[#00285d]'
                        : 'text-gray-500 hover:text-gray-300'
                    )}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>
            <AnimatePresence>
              {showProfitSuggestion && profitNum > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-[#4EDEA3]/5 rounded-2xl p-4 border border-[#4EDEA3]/10 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb size={14} className="text-[#E9C349]" />
                      <span className="text-xs font-black text-[#E9C349] uppercase tracking-wide">{t("smartSuggestion")}</span>
                    </div>
                    <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl">
                      <ShieldCheck size={16} className="text-[#4EDEA3] shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-400">{t("suggestSafeHaven")}</p>
                        <p className="text-sm font-black text-[#4EDEA3]">+{formatDisplay(Math.floor(profitNum * 100 / 2) / 100)}</p>
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">50%</span>
                    </div>
                    <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl">
                      <Rocket size={16} className="text-[#FF8B9A] shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-400">{t("suggestReinvest")}</p>
                        <p className="text-sm font-black text-[#FF8B9A]">+{formatDisplay(profitNum - Math.floor(profitNum * 100 / 2) / 100)}</p>
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">50%</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={handleApplyProfitSuggestion}
              disabled={profitNum <= 0}
              className={cn(
                "w-full py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs uppercase tracking-wide transition-all",
                profitNum > 0 ? "bg-[#4EDEA3] text-[#00285d] hover:brightness-110 active:scale-95" : "bg-white/5 text-gray-600 cursor-not-allowed"
              )}
            >
              {t("applyAdvice")}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Row: Action Log + Financial Advice */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Action Log */}
        <div className="lg:col-span-8 bg-surface rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-border">
          <div className="flex items-center gap-2 mb-4 sm:mb-5">
            <History size={14} className="text-[#ADC6FF]" />
            <h3 className="text-sm font-bold text-white">{t("actionLog")}</h3>
          </div>
          {bucketActivities.length === 0 ? (
            <div className="py-8 sm:py-12 flex flex-col items-center gap-3 opacity-30">
              <History size={24} className="text-white" />
              <p className="text-xs text-white font-bold uppercase tracking-wide">{t("noActivityYet")}</p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3 max-h-64 sm:max-h-80 overflow-y-auto pr-1 custom-scrollbar">
              {bucketActivities.slice(0, 30).map((act, idx) => (
                <motion.div
                  key={`${act.id}-${idx}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-white/[0.02] rounded-xl sm:rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer"
                  onClick={() => { setSelectedActivity(act); setShowDetailModal(true); }}
                >
                  <div
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${activityColor(act.type)}10`, color: activityColor(act.type) }}
                  >
                    {activityIcon(act.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{act.note || t(act.type)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {new Date(act.date).toLocaleDateString(language === "th" ? "th-TH" : "en-US", {
                        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="text-xs sm:text-sm font-black shrink-0" style={{ color: activityColor(act.type) }}>
                    {act.type === "withdraw" || act.type === "invest" ? "-" : "+"}
                    {act.currency && act.rateAtTime
                      ? formatMoney(act.amount / (act.rateAtTime || 1), act.currency as any, act.rateAtTime, act.originalAmount ?? act.amount)
                      : formatMoney(act.amount)}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Financial Advice Panel */}
        <div className="lg:col-span-4 bg-surface rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-border flex flex-col">
          <div className="flex items-center gap-2 mb-3 sm:mb-5">
            <Lightbulb size={14} className="text-[#E9C349]" />
            <h3 className="text-sm font-bold text-white">{t("adviceTitle")}</h3>
          </div>
          <div className="space-y-2 sm:space-y-3 flex-1">
            <div className="flex gap-2 sm:gap-3 p-2.5 sm:p-3 bg-[#ADC6FF]/5 rounded-xl sm:rounded-2xl border border-[#ADC6FF]/10">
              <Info size={12} className="text-[#ADC6FF] shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400 leading-relaxed">{t("adviceDebt")}</p>
            </div>
            <div className="flex gap-2 sm:gap-3 p-2.5 sm:p-3 bg-[#4EDEA3]/5 rounded-xl sm:rounded-2xl border border-[#4EDEA3]/10">
              <CheckCircle2 size={12} className="text-[#4EDEA3] shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400 leading-relaxed">{t("advicePostDebt")}</p>
            </div>
            <div className="flex gap-2 sm:gap-3 p-2.5 sm:p-3 bg-[#FFB4AB]/5 rounded-xl sm:rounded-2xl border border-[#FFB4AB]/10">
              <ShieldCheck size={12} className="text-[#FFB4AB] shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400 leading-relaxed">{t("adviceRisk")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* =========== MODALS =========== */}

      {/* Bucket Add/Edit Modal */}
      <Modal isOpen={isBucketModalOpen} onClose={() => setIsBucketModalOpen(false)} title={editingBucket ? t("editBucket") : t("addBucket")}>
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t("bucketName")}</label>
            <input
              type="text"
              value={bucketForm.name}
              onChange={(e) => setBucketForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t("bucketName")}
              className="w-full bg-white/5 border border-border rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-[#E9C349]/50 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {["💰", "🏦", "🛡️", "📊", "🚀", "🎯", "💎", "🏠", "🎓", "✈️", "🏥", "🎁", "🛒"].map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setBucketForm((prev) => ({ ...prev, icon }))}
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-lg border transition-all",
                    bucketForm.icon === icon ? "bg-white/10 border-[#E9C349]/50 scale-110" : "bg-white/5 border-border hover:border-border"
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Color</label>
            <div className="flex gap-2 flex-wrap pt-1">
              {["#4EDEA3", "#ADC6FF", "#E9C349", "#FF8B9A", "#FFB4AB", "#A78BFA", "#60A5FA", "#F97316"].map((color) => {
                const isUsed = usedColors.includes(color);
                const isSelected = bucketForm.color === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => !isUsed && setBucketForm((prev) => ({ ...prev, color }))}
                    disabled={isUsed && !isSelected}
                    className={cn(
                      "w-8 h-8 rounded-lg transition-all relative",
                      isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-[#1C1B1B] scale-110" : isUsed ? "opacity-30 cursor-not-allowed" : "hover:scale-110 hover:opacity-80"
                    )}
                    style={{ backgroundColor: color }}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-border rounded-2xl">
              <div className="w-10 h-10 rounded-xl border-2 border-white/20 shrink-0 shadow-inner" style={{ backgroundColor: bucketForm.color }} />
              <div className="flex-1 flex items-center gap-2">
                <span className="text-gray-500 text-sm">#</span>
                <input
                  type="text"
                  value={bucketForm.color.replace("#", "")}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    if (/^[0-9A-F]{0,6}$/.test(val)) {
                      const newColor = `#${val}`;
                      const isColorUsed = usedColors.includes(newColor) && bucketForm.color !== newColor;
                      if (!isColorUsed) setBucketForm((prev) => ({ ...prev, color: newColor }));
                    }
                  }}
                  placeholder="4EDEA3"
                  maxLength={6}
                  className={cn(
                    "flex-1 bg-transparent text-sm font-mono uppercase focus:outline-none",
                    usedColors.includes(bucketForm.color) && (editingBucket ? moneyBuckets.find(b => b.id === editingBucket)?.color !== bucketForm.color : true) ? "text-red-400" : "text-white"
                  )}
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Income Split %</label>
              <span className="text-[10px] font-bold text-gray-500">
                {t("currentTotal")}: {totalTargetPercent}%
                {editingBucket && (
                  <span className="text-[#4EDEA3]">{' '}({totalTargetPercent - (moneyBuckets.find(b => b.id === editingBucket)?.targetPercent || 0)}% / 100%)</span>
                )}
              </span>
            </div>
            {(() => {
              const otherBucketsPercent = totalTargetPercent - (editingBucket ? (moneyBuckets.find(b => b.id === editingBucket)?.targetPercent || 0) : 0);
              const maxAllowed = Math.max(1, 100 - otherBucketsPercent);
              const currentNum = Number(bucketForm.targetPercent) || 0;
              const clampedValue = Math.min(currentNum, maxAllowed);
              return (
                <>
                  <div className="flex items-center gap-3 relative">
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden relative cursor-pointer">
                      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-150" style={{ width: `${(clampedValue / maxAllowed) * 100}%`, backgroundColor: bucketForm.color }} />
                      <input
                        type="range"
                        min={1}
                        max={maxAllowed}
                        value={clampedValue}
                        onChange={(e) => setBucketForm((prev) => ({ ...prev, targetPercent: e.target.value }))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={maxAllowed}
                      value={clampedValue > 0 ? clampedValue : ""}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(maxAllowed, Number(e.target.value) || 0));
                        setBucketForm((prev) => ({ ...prev, targetPercent: val.toString() }));
                      }}
                      onBlur={(e) => {
                        const val = Math.max(1, Math.min(maxAllowed, Number(e.target.value) || 1));
                        setBucketForm((prev) => ({ ...prev, targetPercent: val.toString() }));
                      }}
                      placeholder="25"
                      className="w-20 px-2 py-1.5 bg-white/5 border border-border rounded-lg text-white text-sm font-bold text-center focus:outline-none focus:border-[#ADC6FF]/50 placeholder:text-gray-600"
                    />
                    <span className="text-sm font-bold text-gray-500">%</span>
                  </div>
                  {maxAllowed <= 0 && (
                    <p className="text-[10px] text-[#FFB4AB] font-bold">⚠ {t("exceeds100")} - {t("noRemainingPercent")}</p>
                  )}
                </>
              );
            })()}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t("targetAmount")}</label>
              <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg border border-border">
                {(['USD', 'THB'] as const).map(cur => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => handleCurrencyChange(cur)}
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
                min="0"
                value={bucketForm.targetAmount}
                onKeyDown={(e) => {
                  if (e.key === "-" || e.key === "e") e.preventDefault();
                }}
                onChange={(e) => setBucketForm((prev) => ({ ...prev, targetAmount: e.target.value }))}
                placeholder="0.00"
                className="w-full bg-white/5 border border-border rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-[#E9C349]/50 transition-all pr-12"
              />
              <span className={cn(
                "absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs uppercase opacity-90",
                inputCurrency === 'THB' ? 'text-[#E9C349]' : 'text-[#ADC6FF]'
              )}>
                {inputCurrency === 'THB' ? '฿' : '$'}
              </span>
            </div>
          </div>
          {!editingBucket && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t("currentAmount")}</label>
                <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg border border-border opacity-50 pointer-events-none">
                  {(['USD', 'THB'] as const).map(cur => (
                    <button
                      key={cur}
                      type="button"
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide transition-all',
                        inputCurrency === cur
                          ? cur === 'THB'
                            ? 'bg-[#E9C349] text-[#241a00]'
                            : 'bg-[#ADC6FF] text-[#00285d]'
                          : 'text-gray-500'
                      )}
                    >
                      {cur === 'THB' ? '฿' : '$'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={bucketForm.currentAmount}
                  onChange={(e) => setBucketForm((prev) => ({ ...prev, currentAmount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-border rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-[#E9C349]/50 transition-all pr-12"
                />
                <span className={cn(
                  "absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs uppercase opacity-90",
                  inputCurrency === 'THB' ? 'text-[#E9C349]' : 'text-[#ADC6FF]'
                )}>
                  {inputCurrency === 'THB' ? '฿' : '$'}
                </span>
              </div>
            </div>
          )}
          <div className="flex gap-4 pt-2">
            <button onClick={() => setIsBucketModalOpen(false)} className="flex-1 py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors">
              {t("cancel")}
            </button>
            <button
              onClick={handleSaveBucket}
              className="flex-1 py-4 bg-[#E9C349] text-[#241a00] rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all active:scale-95"
            >
              {t("confirm")}
            </button>
          </div>
        </div>
      </Modal>


      {/* Invest Modal */}
      <Modal isOpen={!!investModal} onClose={() => setInvestModal(null)} title={t("investFromBucket")}>
        <div className="space-y-5">
          {investModal && (() => {
            const bucket = moneyBuckets.find(b => b.id === investModal.sourceBucketId);
            return bucket ? (
              <div className="bg-white/5 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-xl">{bucket.icon}</span>
                <div>
                  <p className="text-xs font-bold text-white">{t(bucket.name) || bucket.name}</p>
                  <p className="text-xs text-gray-500">{t("currentAmount")}: {formatBucketAmount(bucket, bucket.currentAmount)}</p>
                </div>
              </div>
            ) : null;
          })()}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t("investAmount")}</label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                value={investAmountValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes('-')) return;
                  setInvestAmountValue(val);
                }}
                placeholder="0.00"
                autoFocus
                className="w-full bg-white/5 border border-border rounded-2xl px-4 py-4 pr-24 text-white text-lg font-black outline-none focus:border-[#FF8B9A]/50 transition-all text-center"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 p-0.5 bg-white/5 rounded-lg border border-border">
                {(['USD', 'THB'] as const).map(cur => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => handleCurrencyChange(cur)}
                    className={cn(
                      'px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wide transition-all',
                      inputCurrency === cur
                        ? cur === 'THB'
                          ? 'bg-[#E9C349] text-[#241a00]'
                          : 'bg-[#ADC6FF] text-[#00285d]'
                        : 'text-gray-500 hover:text-gray-300'
                    )}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setInvestModal(null)} className="flex-1 py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors">
              {t("cancel")}
            </button>
            <button
              onClick={handleInvest}
              className="flex-1 py-4 bg-gradient-to-r from-[#FF8B9A] to-[#FF6B81] text-white rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all active:scale-95"
            >
              {t("investFromBucket")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Transfer Modal */}
      <Modal isOpen={!!transferModal} onClose={() => { setTransferModal(null); setTransferDropdownOpen(false); }} title={t("transfer") || "Transfer Funds"}>
        <div className="space-y-5">
          {transferModal && (() => {
            const sourceBucket = moneyBuckets.find(b => b.id === transferModal.sourceBucketId);
            return sourceBucket ? (
              <>
                <div className="bg-white/5 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-bold mb-1 uppercase tracking-wider">{t("sourceBucket") || "From"}</p>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ backgroundColor: `${sourceBucket.color}20` }}>
                        {sourceBucket.icon}
                      </div>
                      <span className="font-bold text-sm text-white">{t(sourceBucket.name) || sourceBucket.name}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 font-bold mb-1 uppercase tracking-wider">{t("balance") || "Balance"}</p>
                    <span className="font-bold text-[#E9C349] text-sm">
                      {formatBucketAmount(sourceBucket, sourceBucket.currentAmount)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 relative">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest pl-1">{t("destinationBucket") || "To Destination"}</label>
                  <div className="relative">
                    <button
                      onClick={() => setTransferDropdownOpen(!transferDropdownOpen)}
                      className="w-full bg-[#1a1a1a] border border-[#333] hover:border-[#4EDEA3] text-sm font-medium text-white px-4 py-3.5 rounded-xl outline-none transition-colors text-left flex justify-between items-center"
                    >
                      {transferModal.destinationBucketId 
                        ? (() => {
                            const db = moneyBuckets.find(b => b.id === transferModal.destinationBucketId);
                            return db ? (
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: `${db.color}20` }}>
                                  {db.icon}
                                </div>
                                <span>{t(db.name) || db.name}</span>
                              </div>
                            ) : t("selectBucket") || "Select Bucket";
                          })()
                        : <span className="text-gray-400">{t("selectBucket") || "Select Bucket"}</span>
                      }
                      <span className="text-gray-500 text-[10px]">▼</span>
                    </button>
                    
                    {transferDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 w-full bg-[#1a1a1a] border border-[#333] rounded-xl overflow-hidden z-[60] shadow-2xl">
                        <div className="max-h-60 overflow-y-auto custom-scrollbar">
                          {moneyBuckets.filter(b => b.id !== sourceBucket.id).map(b => (
                            <button
                              key={b.id}
                              onClick={() => {
                                const currentDest = transferModal.destinationBucketId ? moneyBuckets.find(bk => bk.id === transferModal.destinationBucketId) : null;
                                const defaultOldNote = currentDest ? `Transfer to ${t(currentDest.name) || currentDest.name}` : "";
                                const newNote = (!transferModal.note || transferModal.note === defaultOldNote) 
                                  ? `Transfer to ${t(b.name) || b.name}` 
                                  : transferModal.note;
                                
                                setTransferModal({ ...transferModal, destinationBucketId: b.id, note: newNote });
                                setTransferDropdownOpen(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-[#333] text-sm font-medium text-white transition-colors flex items-center gap-2"
                            >
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: `${b.color}20` }}>
                                {b.icon}
                              </div>
                              {t(b.name) || b.name}
                            </button>
                          ))}
                          {moneyBuckets.filter(b => b.id !== sourceBucket.id).length === 0 && (
                            <div className="px-4 py-3 text-sm text-gray-500 italic">
                              No other buckets available
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest pl-1">{t("amount") || "Amount"}</label>
                  <div className="relative flex gap-2">
                    <button
                      onClick={() => setTransferModal({ ...transferModal, currency: transferModal.currency === "USD" ? "THB" : "USD" })}
                      className="shrink-0 bg-[#1a1a1a] border border-[#333] hover:border-[#4EDEA3] hover:text-[#4EDEA3] text-gray-400 font-bold px-4 py-3.5 rounded-xl transition-colors flex items-center justify-center min-w-[70px]"
                    >
                      {transferModal.currency === "THB" ? "฿ THB" : "$ USD"}
                    </button>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={transferModal.amount}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.includes('-')) return;
                          setTransferModal({ ...transferModal, amount: val });
                        }}
                        placeholder="0.00"
                        className="w-full bg-[#1a1a1a] border border-[#333] text-xl font-black text-white px-4 py-3.5 rounded-xl outline-none focus:border-[#4EDEA3] transition-colors"
                      />
                      <button
                        onClick={() => {
                          const maxAmount = transferModal.currency === bucketCurrency(sourceBucket) 
                            ? sourceBucket.currentAmount 
                            : convertCurrency(sourceBucket.currentAmount, bucketCurrency(sourceBucket) as "USD" | "THB", transferModal.currency);
                          setTransferModal({ ...transferModal, amount: maxAmount.toString() });
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-wider text-[#4EDEA3] bg-[#4EDEA3]/10 hover:bg-[#4EDEA3]/20 px-2 py-1 rounded-md transition-colors"
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest pl-1">{t("note") || "Note (Optional)"}</label>
                  <input
                    type="text"
                    value={transferModal.note}
                    onChange={(e) => setTransferModal({ ...transferModal, note: e.target.value })}
                    placeholder={t("notePlaceholder") || "e.g. Savings"}
                    className="w-full bg-[#1a1a1a] border border-[#333] text-sm font-medium text-white px-4 py-3.5 rounded-xl outline-none focus:border-[#4EDEA3] transition-colors"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setTransferModal(null)} className="flex-1 py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors">
                    {t("cancel")}
                  </button>
                  <button 
                    onClick={handleTransfer}
                    disabled={!transferModal.destinationBucketId || !transferModal.amount || parseFloat(transferModal.amount) <= 0 || parseFloat(transferModal.amount) > sourceBucket.currentAmount}
                    className="flex-[2] bg-[#4EDEA3] text-[#00285d] font-black text-sm uppercase tracking-wider py-4 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {t("transfer") || "Transfer Now"}
                  </button>
                </div>
              </>
            ) : null;
          })()}
        </div>
      </Modal>

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSelectedActivity(null); }}
        transaction={selectedActivity}
      />
    </div>
  );
}
