"use client";

import React, { useMemo } from "react";
import { motion } from "motion/react";
import { useApp, Trade } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { TrendingUp, TrendingDown, Download, ChevronLeft, ChevronRight } from "lucide-react";
import Papa from "papaparse";
import { format } from "date-fns";

// Day names for each language (Thai and English only)
const dayNames: Record<string, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  th: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'],
};

// Locale mapping (Thai and English only)
const getLocale = (lang: string) => {
  const localeMap: Record<string, string> = {
    en: 'en-US',
    th: 'th-TH',
  };
  return localeMap[lang] || 'en-US';
};

export default function CalendarPage() {
  const { language, t, formatMoney, trades, currency, exchangeRates, assets } = useApp();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = React.useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // Calculate daily P/L (FX-based, stored in USD)
  const dailyStats = useMemo(() => {
    const stats: Record<string, { profit: number; count: number; trades: Trade[] }> = {};
    
    trades.forEach(trade => {
      if (!stats[trade.date]) {
        stats[trade.date] = { profit: 0, count: 0, trades: [] };
      }
      
      const currentRate = exchangeRates[currency] || 1;
      // FX gain in USD terms: difference in rates applied to USD amount, then back to USD
      const fxGainUSD = trade.amountUSD * (currentRate - trade.rateAtTime) / currentRate;
      
      stats[trade.date].profit += fxGainUSD;
      stats[trade.date].count += 1;
      stats[trade.date].trades.push(trade);
    });
    
    return stats;
  }, [trades, currency, exchangeRates]);

  // Calendar logic
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  
  const calendarDays = [];
  // Padding for start of month
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  // Days of month
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  const locale = getLocale(language);
  const monthName = currentMonth.toLocaleString(locale, { month: 'long' });
  const year = currentMonth.getFullYear();
  const currentDayNames = dayNames[language] || dayNames.en;

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  const selectedDayStats = selectedDate ? dailyStats[selectedDate] : null;

  // Computed Monthly Overview Stats
  const { monthlyWinRate, maxDrawdown, netFintrackProfit } = useMemo(() => {
     let winDays = 0;
     let totalTradeDays = 0;
     let netProfit = 0;
     let peak = 0;
     let maxDD = 0;
     let runningProfit = 0;
     
     const currentMonthPrefix = `${year}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
     
     Object.entries(dailyStats).forEach(([dateStr, stat]) => {
       if (dateStr.startsWith(currentMonthPrefix)) {
         totalTradeDays++;
         if (stat.profit >= 0) winDays++;
         netProfit += stat.profit;
         
         runningProfit += stat.profit;
         if (runningProfit > peak) peak = runningProfit;
         const drawdown = peak > 0 ? (peak - runningProfit) / peak * 100 : 0;
         if (drawdown > maxDD) maxDD = drawdown;
       }
     });

     return {
       monthlyWinRate: totalTradeDays > 0 ? (winDays / totalTradeDays) * 100 : 0,
       maxDrawdown: -maxDD,
       netFintrackProfit: netProfit
     };
  }, [dailyStats, currentMonth, year]);

  const handleExportCSV = () => {
    if (trades.length === 0) return;
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

  // Market Correlations (Dynamic metrics based on real data)
  const { macroAlignment, riskExposure } = useMemo(() => {
    const totalPortfolioUSD = assets.reduce((acc, a) => acc + a.valueUSD, 0);
    if (totalPortfolioUSD === 0) return { macroAlignment: 0, riskExposure: 0 };

    // Risk Exposure: % of portfolio NOT in stablecoins/cash
    const lowRiskSymbols = ["USDT", "USDC", "DAI", "BUSD", "CASH", "THB", "USD", "EUR"];
    const highRiskValue = assets.filter(a => !lowRiskSymbols.includes(a.symbol.toUpperCase())).reduce((acc, a) => acc + a.valueUSD, 0);
    const risk = (highRiskValue / totalPortfolioUSD) * 100;

    // Macro Alignment: % of assets currently in profit
    let profitCount = 0;
    assets.forEach(a => {
      // Basic heuristic: if the live chart is positive or change percent is >= 0
      if (a.change >= 0) profitCount++;
    });
    const alignment = (profitCount / Math.max(1, assets.length)) * 100;

    return { macroAlignment: alignment, riskExposure: risk };
  }, [assets]);


  return (
    <div className="p-6 lg:p-8 max-w-[1440px] mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-10">
        <div className="space-y-4">
          <h2 className="text-xs uppercase tracking-wide text-[#E9C349] font-black">{t("performanceAudit")}</h2>
          <div className="flex items-center bg-[#1C1B1B] border border-white/10 rounded-full p-1.5 shadow-xl max-w-fit">
            <button 
              onClick={prevMonth}
              className="p-2.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-[#ADC6FF] transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            
            <h1 className="text-xl font-black tracking-tighter text-white leading-none w-56 text-center select-none">
              {monthName} <span className="text-gray-400 ml-1">{year}</span>
            </h1>

            <button 
              onClick={nextMonth}
              className="p-2.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-[#ADC6FF] transition-all"
            >
              <ChevronRight size={20} />
            </button>

            <div className="w-[1px] h-8 bg-white/10 mx-2" />

            <button 
              onClick={() => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="px-6 py-2 mr-1 bg-white/5 hover:bg-white/10 rounded-full text-sm font-bold text-white transition-all select-none"
            >
              {t("today")}
            </button>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div className="bg-[#1C1B1B] p-4 rounded-xl border border-white/5 min-w-[140px] relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#4EDEA3]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="text-xs uppercase tracking-wide text-gray-500 font-bold block mb-2">{t("monthlyWinRate")}</span>
            <span className="text-2xl font-black text-[#4EDEA3] tracking-tighter">{monthlyWinRate.toFixed(1)}%</span>
          </div>
          <div className="bg-[#1C1B1B] p-4 rounded-xl border border-white/5 min-w-[140px] relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FFB4AB]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="text-xs uppercase tracking-wide text-gray-500 font-bold block mb-2">{t("maxDrawdown")}</span>
            <span className="text-2xl font-black text-[#FFB4AB] tracking-tighter">{maxDrawdown.toFixed(1)}%</span>
          </div>
          <div className="bg-[#2A2A2A] p-4 rounded-xl border-l-[4px] border-[#ADC6FF] min-w-[180px] shadow-xl">
            <span className="text-xs uppercase tracking-wide text-[#4EDEA3] font-bold block mb-2">{t("netFintrackProfit")}</span>
            <span className="text-2xl font-black text-white tracking-tighter">{netFintrackProfit >= 0 ? '+' : ''}{formatMoney(netFintrackProfit)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8 items-start">
        {/* Calendar Grid */}
        <div className="col-span-12 lg:col-span-8 bg-[#1C1B1B] rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
          <div className="grid grid-cols-7 border-b border-white/5">
            {currentDayNames.map((day, idx) => (
              <div key={idx} className="py-4 text-center text-xs uppercase tracking-wide text-gray-500 font-black border-r border-white/5 last:border-r-0"
              >
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="aspect-[4/3] border-r border-b border-white/5" />;
              }
              
              const dateStr = `${year}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const stats = dailyStats[dateStr];
              const isProfit = stats && stats.profit >= 0;
              const isLoss = stats && stats.profit < 0;

              const isBottomLeft = idx === Math.floor((calendarDays.length - 1) / 7) * 7;
              const isBottomRight = idx === calendarDays.length - 1 && idx % 7 === 6;

              return (
                <div 
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className={cn(
                    "aspect-[4/3] p-3 border-r border-b border-white/5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all group relative",
                    isBottomLeft && "rounded-bl-3xl",
                    isBottomRight && "rounded-br-3xl",
                    stats ? (isProfit ? "bg-[#4EDEA3]/10 hover:bg-[#4EDEA3]/20" : "bg-[#FFB4AB]/10 hover:bg-[#FFB4AB]/20") : "hover:bg-white/5",
                    selectedDate === dateStr && "ring-2 ring-inset ring-[#ADC6FF] z-10"
                  )}
                >
                  <span className="absolute top-2 left-3 text-xs font-bold text-gray-500">{day}</span>
                  {stats && (
                    <>
                      <span className={cn(
                        "text-sm font-black",
                        isProfit ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                      )}>
                        {isProfit ? "+" : ""}{formatMoney(stats.profit)}
                      </span>
                      <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wide"
                      >
                        {stats.count}{' '}
                        {t("tradesCount")}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Audit Detail Sidebar */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-[#1C1B1B] rounded-3xl p-6 border border-white/5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#4EDEA3]/5 blur-[60px] rounded-full -mr-16 -mt-16" />
            
            <div className="flex justify-between items-start mb-8 relative z-10">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-black">{t("auditDetail")}</p>
                <h3 className="text-2xl font-black text-white tracking-tighter"
                >
                  {selectedDate
                    ? new Date(selectedDate).toLocaleDateString(locale, {
                        month: 'short',
                        day: '2-digit',
                        year: 'numeric',
                      })
                    : t("selectDate")}
                </h3>
              </div>
              {selectedDayStats && (
                <div className="bg-[#4EDEA3]/10 border border-[#4EDEA3]/20 px-2 py-0.5 rounded-lg">
                  <span className="text-[#4EDEA3] text-xs font-black uppercase tracking-wider">{t("verified")}</span>
                </div>
              )}
            </div>

            <div className="space-y-3 relative z-10">
              {selectedDayStats ? (
                selectedDayStats.trades.map((trade, i) => (
                  <div key={trade.id} className="group flex justify-between items-center p-4 bg-[#0E0E0E] rounded-xl border border-white/5 hover:border-[#ADC6FF]/30 hover:bg-white/5 transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                        trade.type === "BUY" ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
                      )}>
                        {trade.type === "BUY" ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                      </div>
                      <div>
                        <p className="text-xs font-black text-white leading-tight">{trade.asset} {trade.type}</p>
                        <p className="text-xs text-gray-500 mt-1 font-bold uppercase tracking-wide">{t("spotTrade")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "text-sm font-black block",
                        trade.type === "BUY" ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                      )}>
                        {formatMoney(trade.amountUSD)}
                      </span>
                      <span className="text-xs text-gray-500 uppercase font-bold tracking-tighter">{t("finalized")}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-gray-500 text-xs font-medium"
                >
                  {t("noActivity")}
                </div>
              )}
            </div>

            <button 
              onClick={handleExportCSV}
              className="w-full mt-8 py-4 bg-[#ADC6FF] text-[#00285d] rounded-xl font-black text-xs uppercase tracking-wide hover:brightness-110 shadow-lg transition-all flex items-center justify-center gap-2"
            >
              {t("downloadFullLedger")}
              <Download size={16} />
            </button>
          </div>

          {/* Correlations */}
          <div className="bg-[#1C1B1B] rounded-3xl p-8 border border-white/5 shadow-xl">
            <h4 className="text-xs uppercase tracking-wide text-gray-500 font-black mb-8">{t("marketCorrelations")}</h4>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-black uppercase tracking-wide text-white">
                  <span>{t("macroAlignment")}</span>
                  <span>{macroAlignment.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${macroAlignment}%` }}
                    className="h-full bg-[#ADC6FF] rounded-full" 
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-black uppercase tracking-wide text-white">
                  <span>{t("riskExposure")}</span>
                  <span>{riskExposure.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${riskExposure}%` }}
                    className="h-full bg-[#E9C349] rounded-full" 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
