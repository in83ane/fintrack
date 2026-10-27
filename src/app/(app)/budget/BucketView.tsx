"use client";
// แก้ layout หน้านี้ ต้องแก้ BucketSkeleton ด้วย
import { useAllocationMotion } from '@/src/hooks/useAllocationMotion';
import { Sk } from '@/src/components/skeleton';
import { layout } from './skeleton-layout';

import { BUCKET_ICON_OPTIONS, resolveFinanceIcon } from "@/src/lib/finance-icons";
import { FinanceIcon } from "@/src/components/FinanceIcon";
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
  ArrowDownUp,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import { Modal } from "@/src/components/Modal";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { TransactionDetailModal } from "@/src/components/TransactionDetailModal";
import { InvestmentTransferModal } from "@/src/components/InvestmentTransferModal";
import { splitBucketMoney } from '@/src/lib/bucket-command';
import { bucketNativeAmount, nativeBucketBalance } from '@/src/lib/native-money';
import { convertMoney, isFxCurrency, requireCurrency, sumNativeMoney, decimal, formatMoney as nativeFormat } from '@/src/lib/fx';

export default function BucketView({loading:forceLoading=false}:{loading?:boolean}) {
  const {isDataLoaded:appDataLoaded}=useApp();
  const loading=forceLoading||!appDataLoaded;
  const allocationRoot = React.useRef<HTMLDivElement>(null);
  useAllocationMotion(allocationRoot, !loading, 'bucket-allocation');
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
    allMoneyBuckets,
    addMoneyBucket,
    updateMoneyBucket,
    removeMoneyBucket,
    bucketActivities,
    addCashActivities,
    addToast,
  } = useApp();

  const convertCurrency = (amount: number, from: "USD" | "THB", to: "USD" | "THB") => {
    const value = convertMoney(amount, from, to, String(exchangeRates.THB));
    return value ? Number(value.toFixed(12)) : Number.NaN;
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
  const bucketCurrency = (bucket: { currency?: string }) => { requireCurrency(bucket.currency); return bucket.currency; };
  const validateNativeBuckets = (buckets: { currency?: string }[], cur: string) => {
    try { buckets.forEach(b => bucketNativeAmount({ original_amount: 0, currency: cur }, b.currency)); return true; }
    catch (error) { addToast(String(error), 'error'); return false; }
  };
  const formatBucketAmount = (bucket: { currency?: string }, amount: number) => {
    if (!isFxCurrency(bucket.currency) || !Number.isFinite(amount)) return 'unresolved';
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
    if (editingBucket) { addToast('เปลี่ยนสกุล Bucket เดิมไม่ได้ ต้องบันทึกการแลกเงินจริง', 'error'); return; }
    setBucketForm(prev => ({ ...prev, targetAmount: '', currentAmount: '' }));

    setInputCurrency(newCur);
  };

  const [incomeAmount, setIncomeAmount] = useState("");
  const [showIncomePreview, setShowIncomePreview] = useState(false);
  const [profitAmount, setProfitAmount] = useState("");
  const [showProfitSuggestion, setShowProfitSuggestion] = useState(false);
  const [investModal, setInvestModal] = useState<{ sourceBucketId: string } | null>(null);
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
    icon: "wallet",
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
    // Reset scroll to start so the first (leftmost) card is visible on mount
    el.scrollLeft = 0;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, moneyBuckets]);

  const nativeTotal = useMemo(() => {
    try { return sumNativeMoney(moneyBuckets.map(b => ({ amount: b.currentAmount, currency: bucketCurrency(b) })), currency === 'THB' ? 'THB' : 'USD', String(exchangeRates.THB)); }
    catch { return null; }
  }, [moneyBuckets, currency, exchangeRates]);
  const totalAllocated = useMemo(() => moneyBuckets.reduce((s, b) => s + (isFxCurrency(b.currency) ? convertCurrency(b.currentAmount, b.currency, 'USD') : Number.NaN), 0), [moneyBuckets, exchangeRates]);
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

  const moneyWriteBusy=useRef(false);
  const runMoneyWrite=async(action:()=>Promise<void>)=>{if(moneyWriteBusy.current)return;moneyWriteBusy.current=true;try{await action();}catch{addToast(language==='th'?'ตรวจจำนวนเงินและสัดส่วนก่อนบันทึก':'Check the amount and allocation before saving','error');}finally{moneyWriteBusy.current=false;}};
  const cashLeg=(type:'INCOME'|'DEPOSIT'|'EXPENSE'|'WITHDRAW',amount:number,bucketId:string,cur:'USD'|'THB',note:string)=>({type,amountUSD:toUSD(amount,cur),originalAmount:amount,currency:cur,rateAtTime:exchangeRates[cur]||1,bucketId,date:new Date().toISOString(),category:allMoneyBuckets.find(b=>b.id===bucketId)?.name||'Other',note});
  const handleDistributeIncome = () => runMoneyWrite(async()=>{
    if(incomeNum<=0||!validateNativeBuckets(moneyBuckets,inputCurrency))return;
    const shares=splitBucketMoney(incomeAmount,moneyBuckets.map(b=>b.targetPercent||0));
    const rows=moneyBuckets.map((b,i)=>cashLeg('DEPOSIT',shares[i],b.id,inputCurrency,`Income distribution - ${b.name}`)).filter(r=>r.originalAmount>0);
    if(!await addCashActivities(rows,'distribute'))return;
    addToast(`${t('distributed')} ${formatDisplay(incomeNum)}`,'success');setIncomeAmount('');setShowIncomePreview(false);
  });

  const profitNum = parseFloat(profitAmount) || 0;
  const emergencyBucket = moneyBuckets.find((b) => b.name === 'Emergency Fund (Low Risk)' || b.name.toLowerCase().includes('emergency'));
  const investBucket = moneyBuckets.find((b) => b.name === 'Investment (High Risk)' || b.name.toLowerCase().includes('invest'));

  const handleApplyProfitSuggestion = () => runMoneyWrite(async()=>{
    if(profitNum<=0||!emergencyBucket||!investBucket)return;
    if(!validateNativeBuckets([emergencyBucket,investBucket],inputCurrency))return;
    const shares=splitBucketMoney(profitAmount,[1,1]);
    const rows=[emergencyBucket,investBucket].map((b,i)=>cashLeg('DEPOSIT',shares[i],b.id,inputCurrency,`Profit split - ${b.name}`)).filter(r=>r.originalAmount>0);
    if(!await addCashActivities(rows,'distribute'))return;
    addToast(`${t('profitAdded')} ${formatDisplay(profitNum)}`,'success');setProfitAmount('');setShowProfitSuggestion(false);
  });

  const openInvestmentTransfer = (bucketId: string) => {
    setInvestModal({ sourceBucketId: bucketId });
  };

  const handleTransfer = () => runMoneyWrite(async()=>{
    if(!transferModal)return;
    const {sourceBucketId,destinationBucketId,amount,currency:cur,note}=transferModal;
    const value=Number(amount),source=moneyBuckets.find(b=>b.id===sourceBucketId),dest=allMoneyBuckets.find(b=>b.id===destinationBucketId);
    if(!source||!dest||source.id===dest.id||value<=0||!validateNativeBuckets([source,dest],cur))return;
    const date=new Date().toISOString();
    const rows=[{...cashLeg('WITHDRAW',value,source.id,cur,note||`Transfer to ${dest.name}`),date,isTransfer:true},{...cashLeg('DEPOSIT',value,dest.id,cur,note||`Transfer from ${source.name}`),date,isTransfer:true}];
    if(!await addCashActivities(rows,'transfer'))return;
    addToast(`${t('transfer')} ${formatDisplay(value)}`,'success');setTransferModal(null);
  });

  const handleSaveBucket = () => runMoneyWrite(async()=>{
    if (!bucketForm.name.trim()) return;
    const otherBucketsPercent = totalTargetPercent - (editingBucket ? (moneyBuckets.find(b => b.id === editingBucket)?.targetPercent || 0) : 0);
    const maxAllowed = Math.max(1, 100 - otherBucketsPercent);
    const safePercent = Math.min(Math.max(1, Number(bucketForm.targetPercent) || 1), maxAllowed);

    const targetAmount = Number(bucketForm.targetAmount) || 0;
    const currentAmount = Number(bucketForm.currentAmount) || 0;

    if (editingBucket) {
      if(!await updateMoneyBucket(editingBucket, {
        name: bucketForm.name,
        targetPercent: safePercent,
        targetAmount,
        color: bucketForm.color,
        icon: bucketForm.icon,
        linkedToExpenses: bucketForm.linkedToExpenses,
      }))return;
    } else {
      if(!await addMoneyBucket({
        name: bucketForm.name,
        targetPercent: safePercent,
        targetAmount,
        currentAmount,
        currency: inputCurrency,
        color: bucketForm.color,
        icon: bucketForm.icon,
        linkedToExpenses: bucketForm.linkedToExpenses,
      }))return;
    }
    addToast(t("bucketSaved"), "success");
    setIsBucketModalOpen(false);
  });

  const handleActionSubmit = () => runMoneyWrite(async()=>{
    const value=Number(actionAmount);if(value<=0||!actionModal)return;
    const bucket=moneyBuckets.find(b=>b.id===actionModal.id);if(!bucket||!validateNativeBuckets([bucket],actionCurrency))return;
    if(!await addCashActivities([cashLeg(actionModal.type==='deposit'?'DEPOSIT':'WITHDRAW',value,bucket.id,actionCurrency,actionNote||actionModal.type)],'create'))return;
    addToast(`${actionModal.type==='deposit'?t('deposit'):t('withdraw')} ${formatDisplay(value)}`,'success');setActionModal(null);setActionAmount('');setActionNote('');
  });
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
    <div ref={allocationRoot} data-chart-owned className={`${layout.root} sk-root`} aria-busy={loading} data-skeleton={loading?"budget":undefined}>{loading&&<span role="status" className="sr-only">Loading…</span>}
      {/* Header */}
      <style>{hideSpinnerStyle}</style>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <motion.div initial={false} animate={{ opacity: 1, x: 0 }}>
          <span className="text-[#E9C349] uppercase tracking-wide text-xs font-black mb-1 block">
            {t("moneyManagement")}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tighter mb-1">{t("budgetPage")}</h1>
          <p className="text-gray-500 font-medium text-xs tracking-wide">ธนาคารกลางของคุณ · ใช้เงินจาก Bucket โอนเข้าบัญชีเงินสดของทุกพอร์ตลงทุนได้</p>
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
              setBucketForm({ name: "", targetPercent: "", targetAmount: "", currentAmount: "", color: unusedColor, icon: "wallet", linkedToExpenses: false });
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
      <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className={layout.total}>
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#E9C349]/5 blur-3xl rounded-full" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between relative z-10 gap-4">
          <div className="flex-1">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t("bucketTotal")}</span>
            <h2 data-loading-data className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tighter">{loading?<Sk.Line height="1.25em" width={110}/>:(nativeTotal ? nativeFormat(decimal(nativeTotal.amount), nativeTotal.currency) : 'unresolved')}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-bold text-gray-500">{moneyBuckets.length} {t("buckets")}</span>
              <span className={cn("text-xs font-bold", totalTargetPercent === 100 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                {loading?<Sk.Line height="1.25em" width={110}/>:(totalTargetPercent)}% {t("total")}
              </span>
            </div>
          </div>
          {/* Ring Chart (#15) */}
          {loading?<Sk.Donut width={96}/>:moneyBuckets.length > 0 && (
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 100 100" className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0">
                <g data-allocation-donut>{(() => {
                  let cumPct = 0;
                  const R = 38, r = 26, C = 50;
                  return moneyBuckets.map((b, i) => {
                    const bAmountUSD = b.currentAmount / (exchangeRates[b.currency || 'USD'] || 1);
                    let pct = totalAllocated > 0 ? Math.max((bAmountUSD / totalAllocated) * 100, 0.5) : (100 / moneyBuckets.length);
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
                })()}</g>
                <circle cx={50} cy={50} r={22} fill="#0f1115" />
                <text data-allocation-label x={50} y={48} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="bold">
                  {moneyBuckets.length}
                </text>
                <text data-allocation-label x={50} y={60} textAnchor="middle" dominantBaseline="middle" fill="#6B7280" fontSize="6" fontWeight="bold">
                  {language === 'th' ? 'กระเป๋า' : 'buckets'}
                </text>
              </svg>
            </div>
          )}
        </div>
        <div className="h-2.5 sm:h-3 bg-white/5 rounded-full overflow-hidden mt-4"><div data-allocation-bar className="flex h-full w-full">
          {!loading && moneyBuckets.map((b) => (
            <div
              key={b.id}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ backgroundColor: b.color, width: `${totalTargetPercent > 0 ? (b.targetPercent / totalTargetPercent) * 100 : 0}%` }}
            />
          ))}
        </div></div>
        <div className="flex flex-wrap gap-3 sm:gap-4 mt-3">
          {!loading && moneyBuckets.map((b) => (
            <div data-allocation-label key={b.id} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
              <span className="text-[10px] font-bold text-gray-400">{t(b.name) || b.name} {b.targetPercent}%</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Account Cards - Grouped Layout */}
      <div
        className="relative mb-6 max-w-full sm:mb-8"
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
          className="flex max-w-full gap-4 overflow-x-auto overscroll-x-contain px-1 py-3 pb-5 scrollbar-none snap-x snap-mandatory sm:gap-6"
        >
          {loading?[0,1,2].map(i=><Sk.Card key={i} className="min-h-[19rem] min-w-[280px] flex-1 space-y-5 rounded-3xl border border-border bg-surface p-5"><Sk.Tile/><Sk.Line width="60%"/><Sk.Line height={32} width="80%"/><Sk.Block height={8}/><Sk.Line width="40%"/></Sk.Card>):moneyBuckets.map((bucket) => {
            const actualPct = (bucket.targetAmount && bucket.targetAmount > 0)
              ? (bucket.currentAmount / bucket.targetAmount) * 100
              : (totalAllocated > 0 ? ((bucket.currentAmount / (exchangeRates[bucket.currency || 'USD'] || 1)) / totalAllocated) * 100 : 0);

            const textColor = '#f3f4f6';
            const textColorMuted = '#a5adba';
            if (!isFxCurrency(bucket.currency) || !Number.isFinite(bucket.currentAmount)) return <div key={bucket.id} className="rounded-2xl border border-white/10 p-5 text-gray-400">{bucket.name} · unresolved</div>;
            const denomination = bucket.currency;

            return (
              <motion.div
                key={bucket.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative flex-shrink-0 snap-start w-[calc(100vw-2rem)] max-w-[20rem] sm:w-[19rem] sm:max-w-none"
                style={{ willChange: "transform", minHeight: '19rem' }}
              >
                {/* ===== CREDIT CARD FACE ===== */}
                <div
                  className="relative w-full h-full min-h-[19rem] rounded-2xl sm:rounded-[1.5rem] border border-white/10 overflow-hidden shadow-xl transition-all duration-300"
                  style={{
                    background: `linear-gradient(145deg, ${bucket.color}30, #181b21 65%)`,
                  }}
                >
                  {/* Decorative blobs */}
                  <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full opacity-20 blur-2xl" style={{ backgroundColor: 'white' }} />
                  <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full opacity-10 blur-xl" style={{ backgroundColor: 'white' }} />
                  {/* Subtle grid pattern */}
                  <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                      backgroundImage: `repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)`,
                      backgroundSize: '10px 10px',
                    }}
                  />

                  {/* Card content */}
                  <div className="relative z-10 min-h-[19rem] h-full flex flex-col justify-between gap-4 p-4 sm:p-5">
                    {/* Top: name + icon badge */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[0.6rem] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: textColorMuted }}>
                          {bucket.targetPercent}% {language === "th" ? "จัดสรรรายได้" : "Income split"}
                        </p>
                        <h3 className="font-black text-sm sm:text-base tracking-tight leading-tight" style={{ color: textColor }}>
                          {t(bucket.name) || bucket.name}
                        </h3>
                      </div>
                      <div
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xl shadow-lg flex-shrink-0"
                        style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
                      >
                        <FinanceIcon name={bucket.icon} />
                      </div>
                    </div>



                    {/* Middle: amount + progress */}
                    <div className="space-y-1.5 mb-auto mt-2 sm:mt-4">
                      <p className="text-[0.55rem] font-black uppercase tracking-[0.18em]" style={{ color: textColorMuted }}>
                        {bucket.targetAmount && bucket.targetAmount > 0 ? t("savings") : t("currentAmount")}
                      </p>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span data-loading-data className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums" style={{ color: textColor }}>{formatBucketAmount(bucket, bucket.currentAmount)}</span>
                        {denomination !== currency && <span className="text-xs font-bold" style={{ color: textColorMuted }}>{nativeFormat(decimal(bucket.currentAmount), denomination)}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: textColorMuted }}>
                        <span>{bucket.targetAmount && bucket.targetAmount > 0 ? `เป้าหมาย ${formatDisplay(bucket.targetAmount, denomination)}` : 'สัดส่วนเงินใน Bucket'}</span>
                        <span className="shrink-0 font-bold">{actualPct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                        <div
                          data-allocation-progress
                          className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                          style={{ width: `${Math.max(0, Math.min(actualPct, 100))}%`, backgroundColor: bucket.color }}
                        />
                      </div>
                    </div>

                    {/* Action buttons inside card */}
                    <div className="mt-auto pt-3 border-t border-white/10 space-y-2.5">
                      {(bucket.targetAmount && bucket.targetAmount > 0 && bucket.currentAmount > bucket.targetAmount) ? (
                        <div
                          className="text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded-lg inline-flex items-center gap-1 cursor-pointer transition-colors"
                          style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: textColor }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openInvestmentTransfer(bucket.id);
                          }}
                        >
                          {t("suggestionInvest")} {formatBucketAmount(bucket, bucket.currentAmount - bucket.targetAmount)}
                        </div>
                      ) : null}

                        <div className="flex gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionModal({ id: bucket.id, type: "deposit" });
                              setActionAmount("");
                              setActionNote("");
                            }}
                            className="flex-1 min-h-10 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: textColor }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.22)')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)')}
                          >
                            <ArrowDownToLine size={11} />
                            {t("deposit")}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionModal({ id: bucket.id, type: "withdraw" });
                              setActionAmount("");
                              setActionNote("");
                            }}
                            className="flex-1 min-h-10 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: textColor }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.22)')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)')}
                          >
                            <ArrowUpFromLine size={11} />
                            {t("withdraw")}
                          </button>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openInvestmentTransfer(bucket.id);
                            }}
                            className="flex-1 min-h-10 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: textColor }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.22)')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)')}
                          >
                            <Rocket size={11} />
                            โอนไปพอร์ต
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTransferModal({ sourceBucketId: bucket.id, destinationBucketId: "", amount: "", currency: currency as "USD" | "THB", note: "" });
                            }}
                            className="min-h-10 min-w-10 rounded-xl font-bold text-xs transition-all flex items-center justify-center"
                            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: textColor }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.22)')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)')}
                            title="โอนระหว่าง Bucket"
                            aria-label="โอนระหว่าง Bucket"
                          >
                            <ArrowRightLeft size={11} />
                          </button>
                        </div>
                    </div>

                    {/* Deposit/Withdraw overlay */}
                    <AnimatePresence>
                      {actionModal?.id === bucket.id && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl sm:rounded-[1.5rem] p-5"
                          style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="w-full max-w-[16rem] space-y-3">
                            <div className="flex items-center justify-between">
                              <span className={cn("text-xs font-black uppercase tracking-widest", actionModal.type === 'deposit' ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]')}>
                                {actionModal.type === 'deposit' ? t("deposit") : t("withdraw")}
                              </span>
                              <button onClick={() => setActionModal(null)} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                                <X size={14} />
                              </button>
                            </div>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="Amount"
                              value={actionAmount}
                              onChange={(e) => setActionAmount(e.target.value)}
                              className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white   placeholder:text-white/30 transition-colors"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleActionSubmit(); }
                                if (e.key === 'Escape') { setActionModal(null); }
                              }}
                            />
                            <button
                              onClick={handleActionSubmit}
                              disabled={!actionAmount || parseFloat(actionAmount) <= 0}
                              className={cn(
                                "w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all",
                                actionAmount && parseFloat(actionAmount) > 0
                                  ? actionModal.type === 'deposit'
                                    ? "bg-[#4EDEA3] text-[#0E0E0E] hover:brightness-110 shadow-lg shadow-[#4EDEA3]/20"
                                    : "bg-[#FFB4AB] text-[#0E0E0E] hover:brightness-110 shadow-lg shadow-[#FFB4AB]/20"
                                  : "bg-white/10 text-white/30 cursor-not-allowed"
                              )}
                            >
                              <Check size={14} className="inline mr-1" />
                              {actionModal.type === 'deposit' ? t("deposit") : t("withdraw")}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Hover edit/delete overlay */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
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
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 transition-all"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setBucketToDelete(bucket.id); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-black/30 backdrop-blur-sm text-white hover:bg-[#FFB4AB]/60 transition-all"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
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
              setBucketForm({ name: "", targetPercent: "", targetAmount: "", currentAmount: "", color: unusedColor, icon: "wallet", linkedToExpenses: false });
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
                className="w-full bg-white/5 border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-3 pr-20 text-white text-sm outline-none  transition-all placeholder:text-gray-600"
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
                          <span className="text-sm"><FinanceIcon name={b.icon} /></span>
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
                className="w-full bg-white/5 border border-border rounded-xl sm:rounded-2xl px-3 sm:px-4 py-3 pr-20 text-white text-sm outline-none  transition-all placeholder:text-gray-600"
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
              {loading?[0,1,2,3].map(i=><Sk.Row key={i} index={i} className="flex items-center gap-3 py-3"/>):bucketActivities.slice(0, 30).map((act, idx) => (
                <motion.div
                  key={`${act.id}-${idx}`}
                  initial={false}
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
              className="w-full bg-white/5 border border-border rounded-2xl px-4 py-3 text-white text-sm outline-none  transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {BUCKET_ICON_OPTIONS.map(({ name: icon, label }) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setBucketForm((prev) => ({ ...prev, icon }))}
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-lg border transition-all",
                    resolveFinanceIcon(bucketForm.icon) === icon ? "bg-white/10 border-[#E9C349]/50 scale-110" : "bg-white/5 border-border hover:border-border"
                  )}
                >
                  <FinanceIcon name={icon} size={20} />
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
                    "flex-1 bg-transparent text-sm font-mono uppercase ",
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
                {t("currentTotal")}: {loading?<Sk.Line height="1.25em" width={110}/>:(totalTargetPercent)}%
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
                      className="w-20 px-2 py-1.5 bg-white/5 border border-border rounded-lg text-white text-sm font-bold text-center   placeholder:text-gray-600"
                    />
                    <span className="text-sm font-bold text-gray-500">%</span>
                  </div>
                  {maxAllowed <= 0 && (
                    <p className="text-[10px] text-[#FFB4AB] font-bold">{t("exceeds100")} - {t("noRemainingPercent")}</p>
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
                className="w-full bg-white/5 border border-border rounded-2xl px-4 py-3 text-white text-sm outline-none  transition-all pr-12"
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
                  className="w-full bg-white/5 border border-border rounded-2xl px-4 py-3 text-white text-sm outline-none  transition-all pr-12"
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


      {investModal && (() => {
        const bucket = moneyBuckets.find(item => item.id === investModal.sourceBucketId);
        return bucket ? <InvestmentTransferModal key={bucket.id} bucket={bucket} onClose={() => setInvestModal(null)} /> : null;
      })()}

      {/* Transfer Modal */}
      <Modal isOpen={!!transferModal} onClose={() => { setTransferModal(null); setTransferDropdownOpen(false); }} title={t("transfer") || "Transfer Funds"}>
        <div className="space-y-5">
          {transferModal && (() => {
            const sourceBucket = allMoneyBuckets.find(b => b.id === transferModal.sourceBucketId);
            return sourceBucket ? (
              <>
                <div className="bg-white/5 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-bold mb-1 uppercase tracking-wider">{t("sourceBucket") || "From"}</p>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ backgroundColor: `${sourceBucket.color}20` }}>
                        <FinanceIcon name={sourceBucket.icon} />
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

                <div className="flex justify-center -my-3 relative z-10">
                  <button
                    onClick={() => {
                      if (!transferModal.destinationBucketId) return;
                      setTransferModal({
                        ...transferModal,
                        sourceBucketId: transferModal.destinationBucketId,
                        destinationBucketId: transferModal.sourceBucketId
                      });
                    }}
                    className={"w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center transition-colors "}
                    disabled={!transferModal.destinationBucketId}
                    title="Swap Source and Destination"
                  >
                    <ArrowDownUp size={14} />
                  </button>
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
                            const db = allMoneyBuckets.find(b => b.id === transferModal.destinationBucketId);
                            return db ? (
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: `${db.color}20` }}>
                                  <FinanceIcon name={db.icon} />
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
                          {allMoneyBuckets.filter(b => b.id !== sourceBucket.id).map(b => (
                            <button
                              key={b.id}
                              onClick={() => {
                                setTransferModal({ ...transferModal, destinationBucketId: b.id });
                                setTransferDropdownOpen(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-[#333] text-sm font-medium text-white transition-colors flex items-center gap-2"
                            >
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: `${b.color}20` }}>
                                <FinanceIcon name={b.icon} />
                              </div>
                              {t(b.name) || b.name}
                            </button>
                          ))}
                          {allMoneyBuckets.filter(b => b.id !== sourceBucket.id).length === 0 && (
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
                        className="w-full bg-[#1a1a1a] border border-[#333] text-xl font-black text-white px-4 py-3.5 rounded-xl outline-none  transition-colors"
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
                    className="w-full bg-[#1a1a1a] border border-[#333] text-sm font-medium text-white px-4 py-3.5 rounded-xl outline-none  transition-colors"
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
