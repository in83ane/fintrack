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
  BarChart3,
  TrendingUp,
  Activity
} from "lucide-react";
import { format } from "date-fns";
import Papa from "papaparse";
import { useApp, Trade, BucketActivity, CashActivity } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { AddAssetModal } from "@/src/components/AddAssetModal";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { TransactionDetailModal } from "@/src/components/TransactionDetailModal";
import { calcExpectancy, calcStreak } from "@/src/lib/finance";
import { DateRangeBar, DateRangeState, getDateBounds, isInRange } from "@/src/components/DateRangeBar";

interface UnifiedTransaction {
  id: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'IMPORT' | 'SHORT' | 'COVER';
  category: 'trade' | 'bucket' | 'cash';
  asset: string;
  amount: number;
  date: string;
  shares?: number;
  pricePerUnit?: number;
  bucketName?: string;
  bucketIcon?: string;
  bucketActivityType?: BucketActivity['type'];
  cashActivityType?: CashActivity['type'];
  rateAtTime?: number;
  currency?: string;
  originalAmount?: number;
}

export default function TransactionsPage() {
  const { t, formatMoney, trades, removeTrade, bulkAddTrades, currency, exchangeRates, moneyBuckets, bucketActivities, cashActivities, assets } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangeState>({ mode: "all" });
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [tradeToDelete, setTradeToDelete] = useState<number | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedHeatmapMonth, setSelectedHeatmapMonth] = useState(0); // 0 = current

  // Calculate trade metrics
  const tradePnLs = assets.map(a => a.realizedPL || 0).filter(p => p !== 0);
  const wins = tradePnLs.filter(p => p > 0);
  const losses = tradePnLs.filter(p => p < 0);
  const winRate = tradePnLs.length > 0 ? wins.length / tradePnLs.length : 0;
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const expectancy = calcExpectancy(winRate, avgWin, avgLoss);
  const { maxWinStreak, maxLossStreak } = calcStreak(tradePnLs);

  // Daily activity for Heatmap (shows transaction density)
  const now = new Date();
  const heatmapDate = new Date(now.getFullYear(), now.getMonth() - selectedHeatmapMonth, 1);
  const daysInMonth = new Date(heatmapDate.getFullYear(), heatmapDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(heatmapDate.getFullYear(), heatmapDate.getMonth(), 1).getDay();
  const heatmapMonthKey = `${heatmapDate.getFullYear()}-${String(heatmapDate.getMonth() + 1).padStart(2, '0')}`;

  // Daily P/L from cash activities (actual income/expense)
  const dailyPL: Record<number, number> = {};
  const dailyCount: Record<number, number> = {};
  cashActivities.forEach(ca => {
    if (ca.date.startsWith(heatmapMonthKey)) {
      const d = new Date(ca.date);
      const day = d.getDate();
      if (!dailyPL[day]) dailyPL[day] = 0;
      if (!dailyCount[day]) dailyCount[day] = 0;
      if (ca.type === 'INCOME' || ca.type === 'DEPOSIT') dailyPL[day] += ca.amountUSD;
      else if (!ca.isTransfer) dailyPL[day] -= ca.amountUSD;
      dailyCount[day]++;
    }
  });
  trades.forEach(trade => {
    if (trade.date.startsWith(heatmapMonthKey)) {
      const d = new Date(trade.date);
      const day = d.getDate();
      if (!dailyCount[day]) dailyCount[day] = 0;
      dailyCount[day]++;
    }
  });

  // 6-month category spending trends
  const categoryTrends = useMemo(() => {
    const cats: Record<string, number[]> = {};
    const monthLabels: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthLabels.push(format(d, 'MMM'));
      const monthExpenses = cashActivities.filter(a =>
        a.date.startsWith(key) && (a.type === 'EXPENSE' || a.type === 'WITHDRAW') && !a.isTransfer
      );
      const catTotals: Record<string, number> = {};
      monthExpenses.forEach(a => {
        catTotals[a.category] = (catTotals[a.category] || 0) + a.amountUSD;
      });
      for (const [cat, amt] of Object.entries(catTotals)) {
        if (!cats[cat]) cats[cat] = Array(6).fill(0);
        cats[cat][5 - i] = amt;
      }
    }
    const topCats = Object.entries(cats)
      .sort(([, a], [, b]) => b.reduce((s, v) => s + v, 0) - a.reduce((s, v) => s + v, 0))
      .slice(0, 5);
    const catColors = ['#FFB4AB', '#E9C349', '#ADC6FF', '#4EDEA3', '#A78BFA'];
    return { months: monthLabels, categories: topCats.map(([cat, vals], i) => ({ cat, vals, color: catColors[i % catColors.length] })) };
  }, [cashActivities]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleViewDetails = (trade: Trade) => {
    setSelectedTransaction({
      id: trade.id,
      type: trade.type,
      asset: trade.asset,
      amountUSD: trade.amountUSD,
      date: trade.date,
      shares: trade.shares,
      pricePerUnit: trade.pricePerUnit,
      sourceBucketId: trade.sourceBucketId,
      tag: trade.tag,
      rateAtTime: trade.rateAtTime,
      currency: trade.currency,
    });
    setShowDetailModal(true);
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteTrade = (id: number) => {
    setTradeToDelete(id);
  };

  const confirmDeleteTrade = () => {
    if (tradeToDelete === null) return;
    try {
      removeTrade(tradeToDelete);
      showNotification(t("transactionDeleted"), 'success');
    } catch (error: any) {
      showNotification(t("errorOccurred"), 'error');
    }
    setTradeToDelete(null);
  };

  const handleExportCSV = () => {
    const csv = Papa.unparse(trades);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `fintrack_ledger_${format(new Date(), 'yyyy-MM-dd')}.csv`);
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
          const importedData = results.data.map((row: any) => ({
            type: (row.type || row.Type || 'BUY').toUpperCase() as 'BUY' | 'SELL',
            asset: (row.asset || row.Asset || 'UNKNOWN').toUpperCase(),
            amountUSD: parseFloat(row.amountUSD || row.AmountUSD || row.amount || "0"),
            date: row.date || row.Date || format(new Date(), 'yyyy-MM-dd'),
            rateAtTime: parseFloat(row.rateAtTime || row.RateAtTime || exchangeRates[currency].toString()),
            currency: row.currency || row.Currency || currency
          })).filter(t => t.asset && t.amountUSD > 0);

          if (importedData.length > 0) {
            bulkAddTrades(importedData);
            showNotification(`${t("importedTransactions")} ${importedData.length}`, 'success');
          } else {
            showNotification(t("noValidTradesFound"), 'error');
          }
        } catch (error: any) {
          showNotification(t("importError"), 'error');
        }
      }
    });
  };

  // Combine all transactions (trades, bucket activities, cash activities) into unified ledger
  const allTransactions = React.useMemo(() => {
    const tradeItems = trades.map((t): UnifiedTransaction => {
      const sourceBucket = t.sourceBucketId ? moneyBuckets.find(b => b.id === t.sourceBucketId) : null;
      return {
        id: `trade-${t.id}`,
        type: t.type,
        category: 'trade',
        asset: t.asset,
        amount: t.amountUSD,
        date: t.date,
        shares: t.shares,
        pricePerUnit: t.pricePerUnit,
        bucketName: sourceBucket?.name || undefined,
        bucketIcon: sourceBucket?.icon || undefined,
        rateAtTime: t.rateAtTime,
        currency: t.currency,
        originalAmount: t.originalAmount,
      };
    });

    const bucketItems = bucketActivities.map((ba): UnifiedTransaction => {
      const bucket = moneyBuckets.find(b => b.id === ba.bucketId);
      return {
        id: `bucket-${ba.id}`,
        type: ba.type === 'deposit' || ba.type === 'income_split' || ba.type === 'profit_split' ? 'BUY' :
              ba.type === 'withdraw' ? 'SELL' : 'BUY',
        category: 'bucket',
        asset: bucket?.name || ba.bucketName,
        amount: ba.amount,
        date: ba.date,
        bucketName: ba.bucketName,
        bucketIcon: bucket?.icon || undefined,
        bucketActivityType: ba.type,
        currency: ba.currency,
        rateAtTime: ba.rateAtTime,
        originalAmount: ba.originalAmount,
      };
    });

    const cashItems = cashActivities.map((ca): UnifiedTransaction => ({
      id: `cash-${ca.id}`,
      type: ca.type === 'INCOME' ? 'BUY' : 'SELL',
      category: 'cash',
      asset: ca.category,
      amount: ca.amountUSD,
      date: ca.date,
      cashActivityType: ca.type,
      currency: ca.currency,
      rateAtTime: ca.rateAtTime,
      originalAmount: ca.originalAmount,
    }));

    return [...tradeItems, ...bucketItems].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [trades, bucketActivities, moneyBuckets]);

  const txnBounds = getDateBounds(dateRange);
  const filteredTransactions = allTransactions.filter(txn => {
    const matchesSearch = txn.asset.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (txn.bucketName && txn.bucketName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterType === "all" || txn.category === filterType;
    const matchesDate = isInRange(txn.date, txnBounds);
    return matchesSearch && matchesFilter && matchesDate;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tighter mb-1">{t("transactions") || "Ledger"}</h1>
          <p className="text-gray-500 font-medium uppercase tracking-wide text-xs">{t("auditDetail")}</p>
        </div>

      </div>

      {/* Date Range Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
            <span className="hidden sm:inline">{t("addTrade")}</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
          <p className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide mb-1">{t("totalBalance")}</p>
          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tighter">
            {formatMoney(filteredTransactions.reduce((acc, t) => {
              const isInflow = t.type === 'BUY' ||
                               (t.category === 'cash' && t.cashActivityType === 'INCOME') ||
                               (t.category === 'bucket' && (t.bucketActivityType === 'deposit' || t.bucketActivityType === 'income_split' || t.bucketActivityType === 'profit_split'));
              const isOutflow = t.type === 'SELL' ||
                                (t.category === 'cash' && t.cashActivityType === 'EXPENSE') ||
                                (t.category === 'bucket' && (t.bucketActivityType === 'withdraw' || t.bucketActivityType === 'invest'));
              if (isInflow) return acc + t.amount;
              if (isOutflow) return acc - t.amount;
              return acc;
            }, 0))}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
          <p className="text-[10px] sm:text-xs font-black text-[#4EDEA3] uppercase tracking-wide mb-1">{t("buyVolume")}</p>
          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tighter">
            {formatMoney(filteredTransactions.filter(t =>
              t.type === 'BUY' ||
              (t.category === 'cash' && t.cashActivityType === 'INCOME') ||
              (t.category === 'bucket' && (t.bucketActivityType === 'deposit' || t.bucketActivityType === 'income_split' || t.bucketActivityType === 'profit_split'))
            ).reduce((acc, t) => acc + t.amount, 0))}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
          <p className="text-[10px] sm:text-xs font-black text-[#FFB4AB] uppercase tracking-wide mb-1">{t("sellVolume")}</p>
          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tighter">
            {formatMoney(filteredTransactions.filter(t =>
              t.type === 'SELL' ||
              (t.category === 'cash' && t.cashActivityType === 'EXPENSE') ||
              (t.category === 'bucket' && (t.bucketActivityType === 'withdraw' || t.bucketActivityType === 'invest'))
            ).reduce((acc, t) => acc + t.amount, 0))}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5">
          <p className="text-[10px] sm:text-xs font-black text-[#ADC6FF] uppercase tracking-wide mb-1">Expectancy</p>
          <h3 className={`text-xl sm:text-2xl font-black tracking-tighter ${expectancy >= 0 ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]'}`}>
            {formatMoney(expectancy)}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5 flex flex-col justify-between">
          <p className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide mb-1">Max Streaks</p>
          <div className="flex gap-4">
            <div>
              <p className="text-[9px] text-gray-500 font-bold uppercase">WIN</p>
              <h3 className="text-lg font-black text-[#4EDEA3]">{maxWinStreak}</h3>
            </div>
            <div>
              <p className="text-[9px] text-gray-500 font-bold uppercase">LOSS</p>
              <h3 className="text-lg font-black text-[#FFB4AB]">{maxLossStreak}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap Section */}
      <div className="bg-[#1C1B1B] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-[#ADC6FF]" />
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Activity Heat Map</h3>
            <span className="text-[9px] text-gray-600 bg-white/5 px-2 py-0.5 rounded-full font-bold">
              {format(heatmapDate, 'MMM yyyy')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {[3, 2, 1, 0].map(offset => {
              const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
              return (
                <button
                  key={offset}
                  onClick={() => setSelectedHeatmapMonth(offset)}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[10px] font-bold transition-all",
                    selectedHeatmapMonth === offset
                      ? "bg-[#ADC6FF]/20 text-[#ADC6FF]"
                      : "text-gray-600 hover:text-gray-400"
                  )}
                >
                  {format(d, 'MMM')}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-[9px] sm:text-xs font-bold text-gray-500 uppercase">{d}</div>
          ))}
          {Array.from({ length: firstDay }, (_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const pl = dailyPL[day];
            const count = dailyCount[day] || 0;
            const hasData = pl !== undefined || count > 0;
            const isProfit = (pl || 0) > 0;
            const isLoss = (pl || 0) < 0;
            const intensity = Math.min(1, count / 5);
            
            return (
              <div 
                key={day} 
                className={cn(
                  "aspect-square rounded-lg flex flex-col items-center justify-center relative group transition-all cursor-default",
                  !hasData ? 'bg-white/[0.02]' :
                  isProfit ? 'bg-[#4EDEA3]/20 text-[#4EDEA3]' :
                  isLoss ? 'bg-[#FFB4AB]/20 text-[#FFB4AB]' :
                  'bg-[#ADC6FF]/20 text-[#ADC6FF]'
                )}
                style={count > 0 ? { opacity: 0.4 + intensity * 0.6 } : {}}
              >
                <span className="text-[9px] sm:text-xs font-bold opacity-60">{day}</span>
                {hasData && (
                  <span className="text-[7px] sm:text-[9px] font-black hidden sm:block">
                    {pl !== undefined ? `${(pl || 0) > 0 ? '+' : ''}${Math.abs(pl || 0) >= 1000 ? `${((pl || 0)/1000).toFixed(1)}k` : (pl || 0).toFixed(0)}` : `${count}tx`}
                  </span>
                )}
                {hasData && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-0 group-hover:opacity-100 bg-[#1C1B1B] border border-white/10 text-white text-[10px] px-2.5 py-1.5 rounded-xl whitespace-nowrap z-20 transition-opacity pointer-events-none shadow-xl">
                    <p className="font-bold">{format(new Date(heatmapDate.getFullYear(), heatmapDate.getMonth(), day), 'MMM d')}</p>
                    {pl !== undefined && <p className={cn("font-black", (pl || 0) >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>{(pl || 0) >= 0 ? '+' : ''}{formatMoney(pl || 0)}</p>}
                    {count > 0 && <p className="text-gray-400">{count} transaction{count > 1 ? 's' : ''}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#4EDEA3]/40" /><span className="text-[9px] text-gray-500 font-bold">Positive</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#FFB4AB]/40" /><span className="text-[9px] text-gray-500 font-bold">Negative</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#ADC6FF]/40" /><span className="text-[9px] text-gray-500 font-bold">Neutral/Trade</span></div>
        </div>
      </div>

      {/* 6-Month Category Spending Trends */}
      {categoryTrends.categories.length > 0 && (
        <div className="bg-[#1C1B1B] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-[#E9C349]" />
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">6-Month Expense Trends by Category</h3>
          </div>
          <div className="space-y-4">
            {categoryTrends.categories.map(({ cat, vals, color }) => {
              const max = Math.max(...vals, 1);
              const total = vals.reduce((s, v) => s + v, 0);
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{cat}</span>
                    <span className="text-[10px] font-black text-white">{formatMoney(total)} total</span>
                  </div>
                  <div className="flex items-end gap-1 h-10">
                    {vals.map((v, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${Math.max(2, (v / max) * 36)}px` }}
                          transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }}
                          className="w-full rounded-t"
                          style={{ backgroundColor: v > 0 ? color : 'rgba(255,255,255,0.05)' }}
                        />
                        <span className="text-[7px] text-gray-600 font-bold">{categoryTrends.months[i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Category total breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 pt-3 border-t border-white/5">
            {categoryTrends.categories.map(({ cat, vals, color }) => (
              <div key={cat} className="p-2 rounded-xl" style={{ backgroundColor: `${color}10` }}>
                <div className="flex items-center gap-1 mb-0.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[9px] font-black text-gray-400 uppercase truncate">{cat}</span>
                </div>
                <p className="text-xs font-black text-white">{formatMoney(vals.reduce((s, v) => s + v, 0))}</p>
                <p className="text-[8px] text-gray-600">
                  Avg {formatMoney(vals.filter(v => v > 0).length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.filter(v => v > 0).length : 0)}/mo
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 sm:gap-4 items-stretch sm:items-center bg-[#1C1B1B] p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-white/5">
        <div className="relative w-full">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            placeholder={t("searchTransactions") || "Search Ledger..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0E0E0E] border-none rounded-xl sm:rounded-2xl py-2.5 sm:py-3 pl-10 sm:pl-12 pr-4 text-sm text-white focus:ring-2 focus:ring-[#4EDEA3]/20 transition-all"
          />
        </div>
        <div className="flex gap-2 w-full">
          {(['all', 'trade', 'bucket'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex-1 px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-xs font-bold uppercase tracking-wide transition-all ${
                filterType === type
                  ? type === 'trade'
                    ? "bg-[#4EDEA3] text-[#0E0E0E]"
                    : type === 'bucket'
                      ? "bg-[#ADC6FF] text-[#0E0E0E]"
                      : "bg-[#1C1B1B] text-white border border-white/10"
                  : "bg-[#0E0E0E] text-gray-500 hover:text-white"
              }`}
            >
              {type === 'all' ? t('all') : type === 'trade' ? 'Trades' : 'Buckets'}
            </button>
          ))}
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-[#1C1B1B] rounded-2xl sm:rounded-[2rem] border border-white/5 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide">{t("date")}</th>
                <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide">{t("asset")}</th>
                <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide">{t("flow")}</th>
                <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide hidden sm:table-cell">{t("sourceBucket")}</th>
                <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide">{t("amount")}</th>
                <th className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wide text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 sm:px-6 py-12 sm:py-16 text-center">
                    <div className="flex flex-col items-center gap-3 sm:gap-4 opacity-20">
                      <FileText size={32} className="text-white" />
                      <p className="text-xs text-white font-bold uppercase tracking-wide">{t("noTransactionsFound") || "No Ledgers Found"}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((txn) => (
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={txn.id}
                    className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    onClick={() => {
                      if (txn.category === 'trade') {
                        const trade = trades.find(t => `trade-${t.id}` === txn.id);
                        if (trade) handleViewDetails(trade);
                      }
                    }}
                  >
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] sm:text-xs text-gray-400 font-medium">
                          {format(new Date(txn.date), 'MMM dd, yyyy')}
                        </span>
                        <span className="text-[9px] text-gray-600">
                          {format(new Date(txn.date), 'HH:mm')}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center ${
                          txn.category === 'bucket' ? 'bg-[#ADC6FF]/10 text-[#ADC6FF]' :
                          txn.category === 'cash' ? 'bg-[#E9C349]/10 text-[#E9C349]' :
                          txn.type === 'SELL' ? 'bg-[#FFB4AB]/10 text-[#FFB4AB]' : 'bg-[#4EDEA3]/10 text-[#4EDEA3]'
                        }`}>
                          {txn.category === 'bucket' ? <FileText size={12} /> :
                           txn.category === 'cash' ? <AlertCircle size={12} /> :
                           txn.type === 'SELL' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white">{txn.asset}</span>
                          <span className="text-[9px] text-gray-500 uppercase">
                            {txn.category === 'trade' ? 'Trade' : txn.category === 'bucket' ? 'Bucket' : 'Cash'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wide ${
                        txn.category === 'bucket' ? 'bg-[#ADC6FF]/10 text-[#ADC6FF]' :
                        txn.category === 'cash' && txn.cashActivityType === 'INCOME' ? 'bg-[#4EDEA3]/10 text-[#4EDEA3]' :
                        txn.category === 'cash' ? 'bg-[#FFB4AB]/10 text-[#FFB4AB]' :
                        txn.type === 'BUY' ? 'bg-[#4EDEA3]/10 text-[#4EDEA3]' :
                        txn.type === 'SELL' ? 'bg-[#FFB4AB]/10 text-[#FFB4AB]' :
                        txn.type === 'IMPORT' ? 'bg-[#ADC6FF]/10 text-[#ADC6FF]' :
                        'bg-white/10 text-white'
                      }`}>
                        {txn.bucketActivityType || txn.cashActivityType || txn.type}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 hidden sm:table-cell">
                      {txn.bucketIcon ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{txn.bucketIcon}</span>
                          <span className="text-xs font-bold text-gray-300">{t(txn.bucketName || '') || txn.bucketName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <span className={`text-sm sm:text-base font-black tracking-tighter ${
                        txn.category === 'cash' && txn.cashActivityType === 'INCOME' ? 'text-[#4EDEA3]' :
                        txn.category === 'cash' ? 'text-[#FFB4AB]' :
                        txn.type === 'BUY' ? 'text-[#4EDEA3]' :
                        txn.type === 'SELL' ? 'text-[#FFB4AB]' :
                        'text-[#ADC6FF]'
                      }`}>
                        {txn.type === 'BUY' || (txn.category === 'cash' && txn.cashActivityType === 'INCOME') ? '+' : '-'}
                        {formatMoney(txn.amount, txn.currency as any, txn.rateAtTime, txn.originalAmount)}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (txn.category === 'trade') {
                              const trade = trades.find(t => `trade-${t.id}` === txn.id);
                              if (trade) handleViewDetails(trade);
                            }
                          }}
                          className="p-1.5 sm:p-2 text-gray-500 hover:text-[#ADC6FF] hover:bg-[#ADC6FF]/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title={t("transactionDetails") || "View Details"}
                        >
                          <FileText size={14} />
                        </button>
                        {txn.category === 'trade' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const trade = trades.find(t => `trade-${t.id}` === txn.id);
                              if (trade) handleDeleteTrade(trade.id);
                            }}
                            className="p-1.5 sm:p-2 text-gray-500 hover:text-[#FFB4AB] hover:bg-[#FFB4AB]/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Asset / Trade Modal */}
      <AddAssetModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />

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
        isOpen={tradeToDelete !== null}
        onClose={() => setTradeToDelete(null)}
        onConfirm={confirmDeleteTrade}
        title={t("confirmDelete")}
        message={t("confirmDeleteLedgerEntry")}
        confirmText={t("confirm")}
        cancelText={t("cancel")}
        isDanger={true}
      />
    </div>
  );
}
