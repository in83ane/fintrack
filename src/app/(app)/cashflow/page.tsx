"use client";

import React, { useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Download, 
  Upload, 
  Trash2, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft,
  FileText,
  CheckCircle2,
  AlertCircle,
  PieChart,
  Wallet,
  TrendingUp,
  TrendingDown,
  LayoutList,
  Clock,
  Gauge,
  ArrowUp,
  ArrowDown,
  Sparkles
} from "lucide-react";
import { format } from "date-fns";
import Papa from "papaparse";
import { useApp, CashActivity, BucketActivity } from "@/src/context/AppContext";
import { AddCashflowModal } from "@/src/components/AddCashflowModal";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { TransactionDetailModal } from "@/src/components/TransactionDetailModal";
import { AIFinancialAdvisor } from "@/src/components/AIFinancialAdvisor";
import { AnimatedNumber } from "@/src/components/AnimatedNumber";
import { cn } from "@/src/lib/utils";
import { DateRangeBar, DateRangeState, getDateBounds, isInRange } from "@/src/components/DateRangeBar";


// Extend CashActivity locally to include source
type CashActivityWithSource = CashActivity & { source: 'cash' | 'bucket' | 'trade' };

export default function CashflowPage() {
  const { t, formatMoney, cashActivities, bucketActivities, trades, removeCashActivity, removeBucketActivity, currency, exchangeRates, moneyBuckets, netWorthHistory, assets, netWorthSettings } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangeState>({ mode: "all" });
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [cashflowToDelete, setCashflowToDelete] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');
  
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const getEntryAmount = (entry: { amountUSD?: number; amount?: number; originalAmount?: number }) => {
    return entry.amountUSD ?? entry.amount ?? 0;
  };
  const formatEntryMoney = (value: number) => {
    return formatMoney(Math.abs(value));
  };

  // Add source property to cash activities
  const cashActivitiesWithSource: CashActivityWithSource[] = cashActivities.map(ca => ({
    ...ca,
    source: 'cash' as const
  }));

  // Convert bucket activities to cashflow format
  const bucketActivitiesAsCashflow: CashActivityWithSource[] = bucketActivities.map(ba => {
    const bucket = moneyBuckets.find(b => b.id === ba.bucketId);
    // Map bucket activity types to cash activity types
    let type: "INCOME" | "EXPENSE" | "DEPOSIT" | "WITHDRAW" = "DEPOSIT";
    if (ba.type === 'withdraw' || ba.type === 'invest') {
      type = "WITHDRAW";
    } else if (ba.type === 'income_split' || ba.type === 'profit_split') {
      type = "DEPOSIT";
    } else if (ba.type === 'deposit') {
      type = "DEPOSIT";
    }

    return {
      id: ba.id,
      type,
      amountUSD: ba.amount,
      category: ba.bucketName || ba.type,
      date: ba.date,
      time: undefined,
      note: ba.note || `${ba.type} - ${ba.bucketName}`,
      bucketId: ba.bucketId,
      isTransfer: ba.type === 'invest' || ba.type === 'withdraw',
      source: 'bucket' as const,
      currency: ba.currency,
      rateAtTime: ba.rateAtTime,
      originalAmount: ba.originalAmount,
    };
  });

  // Convert trades to cashflow format
  const tradesAsCashflow: CashActivityWithSource[] = trades.map(trade => {
    // BUY = money goes out = WITHDRAW
    // SELL/DIVIDEND = money comes in = DEPOSIT
    const isCashIn = trade.type === 'SELL' || trade.type === 'DIVIDEND' || trade.type === 'SHORT';
    return {
      id: `trade-${trade.id}`,
      type: isCashIn ? "DEPOSIT" : "WITHDRAW",
      amountUSD: trade.amountUSD,
      category: `${trade.type} ${trade.asset}`,
      date: trade.date,
      time: undefined,
      note: trade.tag || `Asset Trade (${trade.type})`,
      isTransfer: false, // If included in cashflow, it counts as actual cashflow
      source: 'trade' as const
    };
  });

  // Combine cash, bucket, and trade activities based on settings, sort by date (newest first)
  const allCashflowActivities: CashActivityWithSource[] = [
    ...(netWorthSettings.cashflowIncludeCash !== false ? cashActivitiesWithSource : []),
    ...(netWorthSettings.cashflowIncludeBuckets !== false ? bucketActivitiesAsCashflow : []),
    ...(netWorthSettings.cashflowIncludeAssets === true ? tradesAsCashflow : [])
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleViewDetails = (activity: CashActivityWithSource) => {
    if (activity.source === 'trade') return; // Trades are viewed from the ledger/portfolio

    const isBucketActivity = activity.source === 'bucket';
    setSelectedTransaction({
      id: activity.id,
      type: activity.type,
      category: activity.category,
      amountUSD: activity.amountUSD,
      originalAmount: activity.originalAmount,
      date: activity.date,
      time: activity.time,
      note: activity.note,
      sourceBucketId: activity.bucketId,
      currency: currency,
      isTransfer: activity.isTransfer,
      isBucketActivity,
    });
    setShowDetailModal(true);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteCashflow = (id: string) => {
    setCashflowToDelete(id);
  };

  const confirmDeleteCashflow = () => {
    if (!cashflowToDelete) return;
    if (cashflowToDelete.startsWith('trade-')) {
      showNotification("Cannot delete trades from cashflow view.", "error");
      setCashflowToDelete(null);
      return;
    }
    
    // Check if it's a bucket activity or cash activity
    const isBucketActivity = bucketActivities.some(ba => ba.id === cashflowToDelete);
    if (isBucketActivity) {
      removeBucketActivity(cashflowToDelete);
    } else {
      removeCashActivity(cashflowToDelete);
    }
    showNotification(t("recordSaved"), 'success');
    setCashflowToDelete(null);
  };

  const handleExportCSV = () => {
    const csv = Papa.unparse(allCashflowActivities.map(c => ({
      type: c.type,
      amount: getEntryAmount(c),
      category: c.category,
      date: c.date,
      note: c.note || ""
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `fintrack_cashflow_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          let count = 0;
          results.data.forEach((row: any) => {
            const type = (row.type || "INCOME").toUpperCase();
            const amount = parseFloat(row.amount || row.amountUSD || "0");
            if (amount > 0 && (type === "INCOME" || type === "EXPENSE")) {
              count++;
            }
          });
          showNotification(`${t("importedTransactions")} ${count}`, count > 0 ? 'success' : 'error');
        } catch (error: any) {
          showNotification(t("importError"), 'error');
        }
      }
    });
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const bounds = getDateBounds(dateRange);
  const filteredCashflow = allCashflowActivities.filter(c => {
    const matchesSearch = t(c.category).toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.note && c.note.toLowerCase().includes(searchTerm.toLowerCase()));
    // Case-insensitive: filterType is lowercase ("income"), c.type is uppercase ("INCOME")
    const matchesFilter = filterType === "all" || c.type.toLowerCase() === filterType.toLowerCase();
    const matchesDate = isInRange(c.date, bounds);
    return matchesSearch && matchesFilter && matchesDate;
  });


  const getFlowLabel = (type: string) => {
    if (type === "DEPOSIT") return t("deposit");
    if (type === "WITHDRAW") return t("withdraw");
    if (type === "INCOME") return t("income");
    if (type === "EXPENSE") return t("expense");
    return t(type.toLowerCase());
  };

  // Calculate stats (exclude transfers - they're just moving money, not income/expense)
  const totalIncome = filteredCashflow.filter(c => (c.type === 'INCOME' || c.type === 'DEPOSIT') && !c.isTransfer).reduce((acc, c) => acc + getEntryAmount(c), 0);
  const totalExpenses = filteredCashflow.filter(c => (c.type === 'EXPENSE' || c.type === 'WITHDRAW') && !c.isTransfer).reduce((acc, c) => acc + getEntryAmount(c), 0);
  const netCashflow = totalIncome - totalExpenses;

  const savingsRate = totalIncome > 0 ? Math.max(0, (netCashflow / totalIncome) * 100) : 0;
  const totalInvestedFlow = filteredCashflow
    .filter(c => c.isTransfer && (c.category?.toLowerCase().includes('invest') || c.note?.toLowerCase().includes('invest')))
    .reduce((acc, c) => acc + getEntryAmount(c), 0) + 
    bucketActivities.filter(ba => ba.type === 'invest').reduce((acc, ba) => {
      // Need to apply dateRange filtering to bucketActivities here too for investment ratio?
      // Since filteredCashflow already contains bucketActivities (as cashflow), let's just use filteredCashflow for both.
      return acc;
    }, 0);
  
  // Actually, filteredCashflow includes bucket activities with source 'bucket', so let's simplify totalInvestedFlow
  const simpleTotalInvestedFlow = filteredCashflow.filter(c => 
    (c.isTransfer && (c.category?.toLowerCase().includes('invest') || c.note?.toLowerCase().includes('invest'))) || 
    (c.source === 'bucket' && (c as any).type === 'WITHDRAW' && (c.category?.toLowerCase().includes('invest') || c.note?.toLowerCase().includes('invest')))
  ).reduce((acc, c) => acc + getEntryAmount(c), 0);

  const investmentRatio = totalIncome > 0 ? (simpleTotalInvestedFlow / totalIncome) * 100 : 0;

  // Previous month comparison
  const prevMonthStats = useMemo(() => {
    const now = new Date();
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevCash = cashActivities.filter(a => a.date.startsWith(prevKey));
    const prevIncome = prevCash.filter(a => a.type === 'INCOME' || a.type === 'DEPOSIT').reduce((s, a) => s + getEntryAmount(a), 0);
    const prevExpense = prevCash.filter(a => (a.type === 'EXPENSE' || a.type === 'WITHDRAW') && !a.isTransfer).reduce((s, a) => s + getEntryAmount(a), 0);
    return { income: prevIncome, expense: prevExpense, net: prevIncome - prevExpense };
  }, [cashActivities]);

  // This month stats
  const thisMonthStats = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthCash = cashActivities.filter(a => a.date.startsWith(key));
    const income = monthCash.filter(a => a.type === 'INCOME' || a.type === 'DEPOSIT').reduce((s, a) => s + getEntryAmount(a), 0);
    const expense = monthCash.filter(a => (a.type === 'EXPENSE' || a.type === 'WITHDRAW') && !a.isTransfer).reduce((s, a) => s + getEntryAmount(a), 0);
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyAvg = dayOfMonth > 0 ? expense / dayOfMonth : 0;
    const dailyIncomeAvg = dayOfMonth > 0 ? income / dayOfMonth : 0;
    return { income, expense, net: income - expense, dayOfMonth, daysInMonth, dailyAvg, dailyIncomeAvg };
  }, [cashActivities]);

  // Category icons mapping (#18)
  const getCategoryIcon = (category: string): string => {
    const cat = category.toLowerCase();
    if (cat.includes('food') || cat.includes('อาหาร')) return '🍔';
    if (cat.includes('transport') || cat.includes('เดินทาง')) return '🚗';
    if (cat.includes('housing') || cat.includes('บ้าน') || cat.includes('rent')) return '🏠';
    if (cat.includes('invest') || cat.includes('ลงทุน')) return '📈';
    if (cat.includes('health') || cat.includes('สุขภาพ')) return '🏥';
    if (cat.includes('entertainment') || cat.includes('บันเทิง')) return '🎬';
    if (cat.includes('shopping') || cat.includes('ช้อปปิ้ง')) return '🛍️';
    if (cat.includes('education') || cat.includes('การศึกษา')) return '📚';
    if (cat.includes('salary') || cat.includes('เงินเดือน')) return '💰';
    if (cat.includes('freelance') || cat.includes('ฟรีแลนซ์')) return '💻';
    if (cat.includes('dividend') || cat.includes('ปันผล')) return '🪙';
    if (cat.includes('emergency') || cat.includes('ฉุกเฉิน')) return '🛡️';
    if (cat.includes('saving') || cat.includes('ออม')) return '🏦';
    if (cat.includes('profit') || cat.includes('กำไร')) return '📊';
    if (cat.includes('income') || cat.includes('รายได้')) return '💵';
    if (cat.includes('transfer')) return '🔄';
    return '💳';
  };

  // Monthly bar chart data (#19)
  const monthlyChartData = React.useMemo(() => {
    const months: Record<string, { income: number; expense: number; label: string }> = {};
    allCashflowActivities.forEach(a => {
      const d = new Date(a.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) months[key] = { income: 0, expense: 0, label: format(d, 'MMM yy') };
      if ((a.type === 'INCOME' || a.type === 'DEPOSIT') && !a.isTransfer) months[key].income += getEntryAmount(a);
      if ((a.type === 'EXPENSE' || a.type === 'WITHDRAW') && !a.isTransfer) months[key].expense += getEntryAmount(a);
    });
    return Object.values(months).slice(-6); // Last 6 months
  }, [allCashflowActivities]);

  const chartMax = Math.max(...monthlyChartData.map(m => Math.max(m.income, m.expense)), 1);

  // Group cashflow by date for timeline view (#17)
  const groupedByDate = React.useMemo(() => {
    const groups: Record<string, CashActivityWithSource[]> = {};
    filteredCashflow.forEach(txn => {
      const dateKey = format(new Date(txn.date), 'yyyy-MM-dd');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(txn);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredCashflow]);

  // Running balance for timeline
  const runningBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    let running = 0;
    const sorted = [...allCashflowActivities].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    sorted.forEach(txn => {
      if ((txn.type === 'INCOME' || txn.type === 'DEPOSIT') && !txn.isTransfer) {
        running += getEntryAmount(txn);
      } else if ((txn.type === 'EXPENSE' || txn.type === 'WITHDRAW') && !txn.isTransfer) {
        running -= getEntryAmount(txn);
      }
      const dateKey = format(new Date(txn.date), 'yyyy-MM-dd');
      balances[dateKey] = running;
    });
    return balances;
  }, [allCashflowActivities]);

  // Net worth
  const latestNW = netWorthHistory.length > 0 ? netWorthHistory[netWorthHistory.length - 1].value : 0;
  const portfolioValue = assets.reduce((s, a) => s + a.valueUSD, 0);
  const liquidity = moneyBuckets.reduce((s, b) => s + (b.currentAmount / (exchangeRates[b.currency || 'USD'] || 1)), 0);

  // Budget health
  const budgetUsed = useMemo(() => {
    const totalBudget = moneyBuckets.reduce((s, b) => s + ((b.targetAmount || 0) / (exchangeRates[b.currency || 'USD'] || 1)), 0);
    if (totalBudget === 0 && thisMonthStats.income > 0) return (thisMonthStats.expense / thisMonthStats.income) * 100;
    if (totalBudget > 0) return (thisMonthStats.expense / totalBudget) * 100;
    return 0;
  }, [moneyBuckets, thisMonthStats]);

  // Trend helpers
  const getTrend = (current: number, previous: number) => {
    if (previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return { direction: change >= 0 ? 'up' : 'down', pct: Math.abs(change) };
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <span className="text-[#ADC6FF] uppercase tracking-wide text-xs font-black mb-1 block">{t("cashflowOverview")}</span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tighter mb-1">{t("cashflowOverview")}</h1>
          <p className="text-gray-500 font-medium uppercase tracking-wide text-xs">{t("auditDetail")}</p>
        </motion.div>

      </div>

      {/* Date Range Bar */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <DateRangeBar value={dateRange} onChange={setDateRange} />
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-[#1C1B1B] text-white rounded-xl font-bold text-xs uppercase tracking-wide border border-white/5 hover:bg-white/5 transition-all"
          >
            <Download size={14} className="text-[#4EDEA3]" />
            <span className="hidden sm:inline">{t("importCsv")}</span>
            <span className="sm:hidden">Import</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportCSV}
            accept=".csv"
            className="hidden"
          />

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-[#1C1B1B] text-white rounded-xl font-bold text-xs uppercase tracking-wide border border-white/5 hover:bg-white/5 transition-all"
          >
            <Upload size={14} className="text-[#ADC6FF]" />
            <span className="hidden sm:inline">{t("exportCsv")}</span>
            <span className="sm:hidden">Export</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-[#4EDEA3] text-[#0E0E0E] rounded-xl font-black text-xs uppercase tracking-wide hover:brightness-110 transition-all shadow-lg shadow-[#4EDEA3]/10"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t("addRecord")}</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </motion.div>

      {/* ─── Financial Pulse Banner ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative bg-gradient-to-r from-[#1a1f35] via-[#1C1B1B] to-[#1a2520] rounded-3xl border border-white/5 p-5 sm:p-6 overflow-hidden"
      >
        {/* Decorative background elements */}
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-[#4EDEA3]/5 blur-[80px] rounded-full" />
        <div className="absolute -left-12 -bottom-12 w-40 h-40 bg-[#ADC6FF]/5 blur-[60px] rounded-full" />
        
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
          {/* Net Worth */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={10} className="text-[#E9C349]" />
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Net Worth</p>
            </div>
            <AnimatedNumber
              value={latestNW || (portfolioValue + liquidity)}
              formatter={(v) => formatMoney(v)}
              className="text-2xl sm:text-3xl font-black text-white tracking-tighter"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-gray-500">
                Portfolio {formatMoney(portfolioValue)} · Cash {formatMoney(liquidity)}
              </span>
            </div>
          </div>

          {/* Monthly Surplus/Deficit */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              {thisMonthStats.net >= 0
                ? <ArrowUpRight size={10} className="text-[#4EDEA3]" />
                : <ArrowDownLeft size={10} className="text-[#FFB4AB]" />
              }
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Monthly Surplus</p>
            </div>
            <AnimatedNumber
              value={thisMonthStats.net}
              formatter={(v) => `${v >= 0 ? "+" : "-"}${formatEntryMoney(v)}`}
              className={cn("text-xl sm:text-2xl font-black tracking-tighter", thisMonthStats.net >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}
            />
            {/* Mini sparkline approximation */}
            <div className="flex items-center gap-1 mt-1.5">
              {monthlyChartData.slice(-4).map((m, i) => {
                const net = m.income - m.expense;
                return (
                  <div key={i} className="flex flex-col items-center">
                    <div
                      className={cn("w-4 rounded-sm", net >= 0 ? "bg-[#4EDEA3]/40" : "bg-[#FFB4AB]/40")}
                      style={{ height: `${Math.max(2, Math.min(16, Math.abs(net) / Math.max(chartMax, 1) * 16))}px` }}
                    />
                    <span className="text-[7px] text-gray-600 mt-0.5">{m.label.slice(0, 3)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Budget Health */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Gauge size={10} className={budgetUsed > 90 ? "text-[#FFB4AB]" : budgetUsed > 70 ? "text-[#E9C349]" : "text-[#4EDEA3]"} />
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Budget Health</p>
            </div>
            <div className="flex items-baseline gap-1">
              <AnimatedNumber
                value={Math.min(100, budgetUsed)}
                decimals={0}
                suffix="%"
                className={cn("text-xl sm:text-2xl font-black tracking-tighter", budgetUsed > 90 ? "text-[#FFB4AB]" : budgetUsed > 70 ? "text-[#E9C349]" : "text-[#4EDEA3]")}
              />
              <span className="text-[10px] text-gray-500">used</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-2 w-full">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, budgetUsed)}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={cn("h-full rounded-full", budgetUsed > 90 ? "bg-[#FFB4AB]" : budgetUsed > 70 ? "bg-[#E9C349]" : "bg-[#4EDEA3]")}
              />
            </div>
          </div>

          {/* Daily Average */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Clock size={10} className="text-[#ADC6FF]" />
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Daily Average</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ArrowUp size={10} className="text-[#4EDEA3]" />
                <AnimatedNumber
                  value={thisMonthStats.dailyIncomeAvg}
                  formatter={(v) => formatEntryMoney(v)}
                  className="text-sm font-black text-[#4EDEA3]"
                />
                <span className="text-[9px] text-gray-600">/day in</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowDown size={10} className="text-[#FFB4AB]" />
                <AnimatedNumber
                  value={thisMonthStats.dailyAvg}
                  formatter={(v) => formatEntryMoney(v)}
                  className="text-sm font-black text-[#FFB4AB]"
                />
                <span className="text-[9px] text-gray-600">/day out</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ─── AI Financial Intelligence Hub ────────────────────────────────── */}
      <AIFinancialAdvisor />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-[#1C1B1B] to-[#0E0E0E] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-[#ADC6FF]/10 blur-3xl rounded-full" />
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wide">{t("netCashflow")}</p>
            {(() => {
              const trend = getTrend(netCashflow, prevMonthStats.net);
              if (!trend) return null;
              return (
                <span className={cn("text-[9px] font-black flex items-center gap-0.5", trend.direction === 'up' ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                  {trend.direction === 'up' ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                  {trend.pct.toFixed(0)}%
                </span>
              );
            })()}
          </div>
          <AnimatedNumber
            value={netCashflow}
            formatter={(v) => `${v >= 0 ? "+" : "-"}${formatEntryMoney(v)}`}
            className={cn("text-xl sm:text-2xl font-bold tracking-tighter", netCashflow >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}
          />
        </div>
        <div className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] sm:text-xs font-bold text-[#4EDEA3] uppercase tracking-wide">{t("totalIncome")}</p>
            {(() => {
              const trend = getTrend(totalIncome, prevMonthStats.income);
              if (!trend) return null;
              return (
                <span className={cn("text-[9px] font-black flex items-center gap-0.5", trend.direction === 'up' ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                  {trend.direction === 'up' ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                  {trend.pct.toFixed(0)}%
                </span>
              );
            })()}
          </div>
          <AnimatedNumber value={totalIncome} formatter={(v) => formatEntryMoney(v)} className="text-xl sm:text-2xl font-bold text-white tracking-tighter" />
        </div>
        <div className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] sm:text-xs font-bold text-[#FFB4AB] uppercase tracking-wide">{t("totalExpenses")}</p>
            {(() => {
              const trend = getTrend(totalExpenses, prevMonthStats.expense);
              if (!trend) return null;
              return (
                <span className={cn("text-[9px] font-black flex items-center gap-0.5", trend.direction === 'up' ? "text-[#FFB4AB]" : "text-[#4EDEA3]")}>
                  {trend.direction === 'up' ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                  {trend.pct.toFixed(0)}%
                </span>
              );
            })()}
          </div>
          <AnimatedNumber value={totalExpenses} formatter={(v) => formatEntryMoney(v)} className="text-xl sm:text-2xl font-bold text-white tracking-tighter" />
        </div>
        <div className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
          <p className="text-[10px] sm:text-xs font-bold text-[#ADC6FF] uppercase tracking-wide mb-1">Savings Rate</p>
          <AnimatedNumber value={savingsRate} decimals={1} suffix="%" className="text-xl sm:text-2xl font-bold text-white tracking-tighter" />
        </div>
        <div className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
          <p className="text-[10px] sm:text-xs font-bold text-[#E9C349] uppercase tracking-wide mb-1">Investment Ratio</p>
          <AnimatedNumber value={investmentRatio} decimals={1} suffix="%" className="text-xl sm:text-2xl font-bold text-white tracking-tighter" />
        </div>
        {/* Monthly Bar Chart Mini (#19) - Enhanced */}
        <div className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
          <p className="text-[10px] sm:text-xs font-bold text-[#E9C349] uppercase tracking-wide mb-2">{t("monthlyOverview") || "Monthly"}</p>
          {monthlyChartData.length > 0 ? (
            <div className="flex items-end gap-1 h-12">
              {monthlyChartData.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full flex gap-px items-end" style={{ height: '32px' }}>
                    <div className="flex-1 rounded-t bg-[#4EDEA3]/60 transition-all" style={{ height: `${Math.max(2, (m.income / chartMax) * 32)}px` }} />
                    <div className="flex-1 rounded-t bg-[#FFB4AB]/60 transition-all" style={{ height: `${Math.max(2, (m.expense / chartMax) * 32)}px` }} />
                  </div>
                  <span className="text-[7px] text-gray-600">{m.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-gray-600 text-center py-3">No data</div>
          )}
        </div>
      </div>

      {/* Spending Velocity Tracker */}
      {prevMonthStats.expense > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Gauge size={14} className="text-[#E9C349]" />
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Spending Velocity</h3>
            <span className="text-[9px] text-gray-600 ml-auto">
              Day {thisMonthStats.dayOfMonth} / {thisMonthStats.daysInMonth}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Progress Bar */}
            <div className="sm:col-span-2">
              <div className="flex justify-between text-[10px] mb-1.5">
                <span className="text-gray-400">
                  Spent: <span className="text-white font-bold">{formatEntryMoney(thisMonthStats.expense)}</span>
                </span>
                <span className="text-gray-400">
                  Last month: <span className="text-white font-bold">{formatEntryMoney(prevMonthStats.expense)}</span>
                </span>
              </div>
              <div className="h-3 bg-white/5 rounded-full overflow-hidden relative">
                {/* Time progress marker */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-white/20 z-10"
                  style={{ left: `${(thisMonthStats.dayOfMonth / thisMonthStats.daysInMonth) * 100}%` }}
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (thisMonthStats.expense / prevMonthStats.expense) * 100)}%` }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className={cn(
                    "h-full rounded-full relative",
                    thisMonthStats.expense > prevMonthStats.expense * (thisMonthStats.dayOfMonth / thisMonthStats.daysInMonth) * 1.15
                      ? "bg-gradient-to-r from-[#E9C349] to-[#FFB4AB]"
                      : "bg-gradient-to-r from-[#4EDEA3] to-[#4EDEA3]/70"
                  )}
                />
              </div>
              <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                <span>0%</span>
                <span className="text-gray-500">
                  {(thisMonthStats.expense / prevMonthStats.expense * 100).toFixed(0)}% of last month
                </span>
                <span>100%</span>
              </div>
            </div>
            {/* Projection */}
            <div className="flex flex-col justify-center">
              {(() => {
                const projected = thisMonthStats.dayOfMonth > 0
                  ? (thisMonthStats.expense / thisMonthStats.dayOfMonth) * thisMonthStats.daysInMonth
                  : 0;
                const projectedChange = prevMonthStats.expense > 0
                  ? ((projected - prevMonthStats.expense) / prevMonthStats.expense) * 100
                  : 0;
                return (
                  <>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Projected</p>
                    <p className="text-lg font-black text-white tracking-tighter">{formatEntryMoney(projected)}</p>
                    <p className={cn(
                      "text-[10px] font-bold flex items-center gap-1",
                      projectedChange > 0 ? "text-[#FFB4AB]" : "text-[#4EDEA3]"
                    )}>
                      {projectedChange > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                      {Math.abs(projectedChange).toFixed(0)}% vs last month
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </motion.div>
      )}

      {/* Category Breakdown Charts */}
      {allCashflowActivities.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Income by Category */}
          <div className="bg-[#1C1B1B] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <PieChart size={14} className="text-[#4EDEA3]" />
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t("incomeByCategory") || "Income by Category"}</h3>
            </div>
            <div className="space-y-3">
              {(() => {
                const incomes = allCashflowActivities.filter(c => c.type === 'INCOME' || c.type === 'DEPOSIT');
                const categories = [...new Set(incomes.map(c => c.category))];
                const colors = ['#4EDEA3', '#ADC6FF', '#E9C349', '#FF8B9A', '#A78BFA'];
                return categories.map((cat, i) => {
                  const total = incomes.filter(c => c.category === cat).reduce((s, c) => s + getEntryAmount(c), 0);
                  const pct = totalIncome > 0 ? (total / totalIncome) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-400 flex items-center gap-1.5">
                          <span style={{ fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif" }}>{getCategoryIcon(cat)}</span> {t(cat)}
                        </span>
                        <span className="text-white">{formatEntryMoney(total)} <span className="text-gray-500">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: colors[i % colors.length] }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Expense by Category */}
          <div className="bg-[#1C1B1B] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={14} className="text-[#FFB4AB]" />
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t("expenseByCategory") || "Expense by Category"}</h3>
            </div>
            <div className="space-y-3">
              {(() => {
                const expenses = allCashflowActivities.filter(c => c.type === 'EXPENSE' || c.type === 'WITHDRAW');
                const categories = [...new Set(expenses.map(c => c.category))];
                const colors = ['#FFB4AB', '#E9C349', '#ADC6FF', '#A78BFA', '#4EDEA3'];
                return categories.map((cat, i) => {
                  const total = expenses.filter(c => c.category === cat).reduce((s, c) => s + getEntryAmount(c), 0);
                  const pct = totalExpenses > 0 ? (total / totalExpenses) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-400 flex items-center gap-1.5">
                          <span style={{ fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif" }}>{getCategoryIcon(cat)}</span> {t(cat)}
                        </span>
                        <span className="text-white">{formatEntryMoney(total)} <span className="text-gray-500">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: colors[i % colors.length] }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 sm:gap-4 items-stretch sm:items-center bg-[#1C1B1B] p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-white/5">
        <div className="flex gap-2 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              placeholder={t("searchTransactions") || "Search..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0E0E0E] border-none rounded-xl sm:rounded-2xl py-2.5 sm:py-3 pl-10 sm:pl-12 pr-4 text-sm text-white focus:ring-2 focus:ring-[#4EDEA3]/20 transition-all"
            />
          </div>
          {/* View mode toggle */}
          <div className="flex bg-[#0E0E0E] rounded-xl border border-white/5 overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                "px-3 py-2 transition-all",
                viewMode === 'table' ? "bg-[#ADC6FF]/20 text-[#ADC6FF]" : "text-gray-500 hover:text-white"
              )}
              title="Table view"
            >
              <LayoutList size={16} />
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={cn(
                "px-3 py-2 transition-all",
                viewMode === 'timeline' ? "bg-[#ADC6FF]/20 text-[#ADC6FF]" : "text-gray-500 hover:text-white"
              )}
              title="Timeline view"
            >
              <Clock size={16} />
            </button>
          </div>
        </div>
        <div className="flex gap-2 w-full">
          {(['all', 'income', 'expense', 'deposit', 'withdraw'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex-1 sm:flex-none px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-xs font-bold uppercase tracking-wide transition-all ${
                filterType === type
                  ? type === 'income' || type === 'deposit'
                    ? "bg-[#4EDEA3] text-[#0E0E0E]"
                    : type === 'expense' || type === 'withdraw'
                      ? "bg-[#FFB4AB] text-[#0E0E0E]"
                      : "bg-[#ADC6FF] text-[#0E0E0E]"
                  : "bg-[#0E0E0E] text-gray-500 hover:text-white"
              }`}
            >
              {type === 'all' ? t('all') : getFlowLabel(type)}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Timeline View ────────────────────────────────────────────────── */}
      {viewMode === 'timeline' && (
        <div className="space-y-4">
          {groupedByDate.length === 0 ? (
            <div className="bg-[#1C1B1B] rounded-2xl border border-white/5 p-12 text-center">
              <FileText size={32} className="text-white opacity-20 mx-auto mb-3" />
              <p className="text-xs text-white font-bold uppercase tracking-wide opacity-20">{t("noTransactionsFound") || "No records found"}</p>
            </div>
          ) : (
            groupedByDate.map(([dateKey, txns]) => {
              const dayIncome = txns.filter(t => (t.type === 'INCOME' || t.type === 'DEPOSIT') && !t.isTransfer).reduce((s, t) => s + getEntryAmount(t), 0);
              const dayExpense = txns.filter(t => (t.type === 'EXPENSE' || t.type === 'WITHDRAW') && !t.isTransfer).reduce((s, t) => s + getEntryAmount(t), 0);
              const dayNet = dayIncome - dayExpense;
              const balance = runningBalances[dateKey] || 0;

              return (
                <motion.div
                  key={dateKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#1C1B1B] rounded-2xl sm:rounded-3xl border border-white/5 overflow-hidden"
                >
                  {/* Date Header */}
                  <div className="px-4 sm:px-6 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#ADC6FF]/10 rounded-xl flex items-center justify-center">
                        <span className="text-lg font-black text-[#ADC6FF]">{format(new Date(dateKey), 'dd')}</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{format(new Date(dateKey), 'EEEE')}</p>
                        <p className="text-[10px] text-gray-500">{format(new Date(dateKey), 'MMMM yyyy')} · {txns.length} transaction{txns.length > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-black tracking-tighter", dayNet >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                        {dayNet >= 0 ? "+" : "-"}{formatEntryMoney(dayNet)}
                      </p>
                      <p className="text-[9px] text-gray-600 font-bold">Balance: {formatEntryMoney(balance)}</p>
                    </div>
                  </div>
                  {/* Transactions */}
                  <div className="divide-y divide-white/5">
                    {txns.map(txn => {
                      const sourceBucket = txn.bucketId ? moneyBuckets.find(b => b.id === txn.bucketId) : null;
                      return (
                        <div
                          key={txn.id}
                          className="px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors cursor-pointer group"
                          onClick={() => handleViewDetails(txn)}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            txn.isTransfer
                              ? 'bg-[#ADC6FF]/10 text-[#ADC6FF]'
                              : txn.type === 'EXPENSE' || txn.type === 'WITHDRAW'
                                ? 'bg-[#FFB4AB]/10 text-[#FFB4AB]'
                                : 'bg-[#4EDEA3]/10 text-[#4EDEA3]'
                          }`}>
                            {txn.isTransfer
                              ? <Wallet size={14} />
                              : txn.type === 'EXPENSE' || txn.type === 'WITHDRAW'
                                ? <ArrowDownLeft size={14} />
                                : <ArrowUpRight size={14} />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">
                                <span style={{ fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif" }}>{getCategoryIcon(txn.category)}</span> {t(txn.category)}
                              </span>
                              {sourceBucket && (
                                <span className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded-full text-gray-500">
                                  <span style={{ fontFamily: "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif" }}>{sourceBucket.icon}</span> {t(sourceBucket.name) || sourceBucket.name}
                                </span>
                              )}
                            </div>
                            {txn.note && <p className="text-[10px] text-gray-500 truncate">{txn.note}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={cn(
                              "text-sm font-black tracking-tighter",
                              txn.isTransfer ? "text-[#ADC6FF]"
                                : txn.type === 'INCOME' || txn.type === 'DEPOSIT' ? "text-[#4EDEA3]"
                                : "text-[#FFB4AB]"
                            )}>
                              {txn.type === 'INCOME' || txn.type === 'DEPOSIT' ? "+" : "-"}
                              {formatEntryMoney(getEntryAmount(txn))}
                            </span>
                            <p className="text-[9px] text-gray-600">
                              {txn.time || format(new Date(txn.date), 'HH:mm')}
                            </p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteCashflow(txn.id); }}
                            className="p-1.5 text-gray-500 hover:text-[#FFB4AB] hover:bg-[#FFB4AB]/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* ─── Table View ───────────────────────────────────────────────────── */}
      {viewMode === 'table' && (
        <div className="bg-[#1C1B1B] rounded-2xl sm:rounded-[2rem] border border-white/5 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide">{t("date")}</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide">{t("category")}</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide">{t("type")}</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide hidden sm:table-cell">{t("sourceBucket")}</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide">{t("amount")}</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredCashflow.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 sm:px-6 py-12 sm:py-16 text-center">
                      <div className="flex flex-col items-center gap-3 sm:gap-4 opacity-20">
                        <FileText size={32} className="text-white" />
                        <p className="text-xs text-white font-bold uppercase tracking-wide">{t("noTransactionsFound") || "No records found"}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCashflow.map((txn) => {
                    const sourceBucket = txn.bucketId ? moneyBuckets.find(b => b.id === txn.bucketId) : null;
                    return (
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      key={txn.id}
                      className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => handleViewDetails(txn)}
                    >
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] sm:text-xs text-gray-400 font-medium">
                            {format(new Date(txn.date), 'MMM dd, yyyy')}
                          </span>
                          <span className="text-[9px] text-gray-600">
                            {txn.time ? txn.time : format(new Date(txn.date), 'HH:mm')}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center ${
                            txn.isTransfer
                              ? 'bg-[#ADC6FF]/10 text-[#ADC6FF]'
                              : txn.type === 'EXPENSE' || txn.type === 'WITHDRAW'
                                ? 'bg-[#FFB4AB]/10 text-[#FFB4AB]'
                                : 'bg-[#4EDEA3]/10 text-[#4EDEA3]'
                          }`}>
                            {txn.isTransfer
                              ? <Wallet size={12} />
                              : txn.type === 'EXPENSE' || txn.type === 'WITHDRAW'
                                ? <ArrowDownLeft size={12} />
                                : <ArrowUpRight size={12} />
                            }
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white block">{t(txn.category)}</span>
                            {txn.note && <span className="text-[10px] text-gray-500">{txn.note}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wide",
                          txn.isTransfer
                            ? "bg-[#ADC6FF]/10 text-[#ADC6FF]"
                            : txn.type === 'INCOME' || txn.type === 'DEPOSIT'
                              ? "bg-[#4EDEA3]/10 text-[#4EDEA3]"
                              : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
                        )}>
                          {txn.isTransfer ? 'Transfer' : getFlowLabel(txn.type)}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell">
                        {sourceBucket ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{sourceBucket.icon}</span>
                            <span className="text-xs font-bold text-gray-300">{t(sourceBucket.name) || sourceBucket.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span className={`text-sm sm:text-base font-black tracking-tighter ${
                          txn.isTransfer
                            ? 'text-[#ADC6FF]'
                            : txn.type === 'INCOME' || txn.type === 'DEPOSIT'
                              ? 'text-[#4EDEA3]'
                              : 'text-[#FFB4AB]'
                        }`}>
                          {txn.type === 'INCOME' || txn.type === 'DEPOSIT'
                            ? `+${formatEntryMoney(getEntryAmount(txn))}`
                            : `-${formatEntryMoney(getEntryAmount(txn))}`
                          }
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleViewDetails(txn); }}
                            className="p-1.5 sm:p-2 text-gray-500 hover:text-[#ADC6FF] hover:bg-[#ADC6FF]/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            title={t("transactionDetails") || "View Details"}
                          >
                            <FileText size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteCashflow(txn.id); }}
                            className="p-1.5 sm:p-2 text-gray-500 hover:text-[#FFB4AB] hover:bg-[#FFB4AB]/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );})
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Cashflow Modal */}
      <AddCashflowModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSelectedTransaction(null); }}
        transaction={selectedTransaction}
      />

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className={`fixed bottom-8 right-8 z-[100] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border ${
              notification.type === 'success' 
                ? "bg-[#0E0E0E] border-[#4EDEA3]/20 text-[#4EDEA3]" 
                : "bg-[#0E0E0E] border-[#FFB4AB]/20 text-[#FFB4AB]"
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="text-xs font-bold uppercase tracking-wide">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={cashflowToDelete !== null}
        onClose={() => setCashflowToDelete(null)}
        onConfirm={confirmDeleteCashflow}
        title={t("confirmDelete")}
        message={t("confirmDelete") || "Are you sure you want to delete this entry?"}
        confirmText={t("confirm")}
        cancelText={t("cancel")}
        isDanger={true}
      />
    </div>
  );
}
