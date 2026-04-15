"use client";

import React, { useMemo } from "react";
import { motion } from "motion/react";
import { useApp, Trade } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { TrendingUp, TrendingDown, Download, ChevronLeft, ChevronRight } from "lucide-react";

// Day names for each language
const dayNames: Record<string, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  th: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'],
  jp: ['日', '月', '火', '水', '木', '金', '土'],
  eu: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
};

// Locale mapping
const getLocale = (lang: string) => {
  const localeMap: Record<string, string> = {
    en: 'en-US',
    th: 'th-TH',
    jp: 'ja-JP',
    eu: 'es-ES',
    fr: 'fr-FR',
  };
  return localeMap[lang] || 'en-US';
};

export default function CalendarPage() {
  const { language, t, formatMoney, trades, currency, exchangeRates } = useApp();
  const [currentMonth, setCurrentMonth] = React.useState(new Date(2024, 8, 1)); // September 2024 as per snippet

  // Calculate daily P/L
  const dailyStats = useMemo(() => {
    const stats: Record<string, { profit: number; count: number; trades: Trade[] }> = {};
    
    trades.forEach(trade => {
      if (!stats[trade.date]) {
        stats[trade.date] = { profit: 0, count: 0, trades: [] };
      }
      
      const currentRate = exchangeRates[currency as any] || 1;
      const historicalValue = trade.amountUSD * trade.rateAtTime;
      const currentValue = trade.amountUSD * currentRate;
      const pnl = currentValue - historicalValue;
      
      stats[trade.date].profit += pnl;
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

  return (
    <div className="p-6 lg:p-8 max-w-[1440px] mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-10">
        <div className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-[#E9C349] font-black">{t("performance_audit")}</h2>
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-black tracking-tighter text-white leading-none">
              {monthName} <span className="text-gray-500">{year}</span>
            </h1>
            <div className="flex gap-1.5">
              <button 
                onClick={prevMonth}
                className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={nextMonth}
                className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div className="bg-[#1C1B1B] p-4 rounded-xl border border-white/5 min-w-[140px] relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#4EDEA3]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="text-xs uppercase tracking-wide text-gray-500 font-bold block mb-2">{t("monthly_win_rate")}</span>
            <span className="text-2xl font-black text-[#4EDEA3] tracking-tighter">68.4%</span>
          </div>
          <div className="bg-[#1C1B1B] p-4 rounded-xl border border-white/5 min-w-[140px] relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FFB4AB]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="text-xs uppercase tracking-wide text-gray-500 font-bold block mb-2">{t("max_drawdown")}</span>
            <span className="text-2xl font-black text-[#FFB4AB] tracking-tighter">-4.2%</span>
          </div>
          <div className="bg-[#2A2A2A] p-4 rounded-xl border-l-[4px] border-[#ADC6FF] min-w-[180px] shadow-xl">
            <span className="text-xs uppercase tracking-wide text-[#4EDEA3] font-bold block mb-2">{t("net_fintrack_profit")}</span>
            <span className="text-2xl font-black text-white tracking-tighter">+$12,482.00</span>
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
                return <div key={`empty-${idx}`} className="aspect-[4/3] border-r border-b border-white/5 last:border-r-0" />;
              }
              
              const dateStr = `${year}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const stats = dailyStats[dateStr];
              const isProfit = stats && stats.profit >= 0;
              const isLoss = stats && stats.profit < 0;

              return (
                <div 
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className={cn(
                    "aspect-[4/3] p-3 border-r border-b border-white/5 last:border-r-0 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all group relative",
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
                        {isProfit ? "+" : ""}{formatMoney(stats.profit / (exchangeRates[currency as any] || 1))}
                      </span>
                      <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wide"
                      >
                        {stats.count}{' '}
                        {t("trades_count")}
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
                <p className="text-xs uppercase tracking-wide text-gray-500 font-black">{t("audit_detail")}</p>
                <h3 className="text-2xl font-black text-white tracking-tighter"
                >
                  {selectedDate
                    ? new Date(selectedDate).toLocaleDateString(locale, {
                        month: 'short',
                        day: '2-digit',
                        year: 'numeric',
                      })
                    : t("select_date")}
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
                        <p className="text-xs text-gray-500 mt-1 font-bold uppercase tracking-wide">{t("spot_trade")}</p>
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
                  {t("no_activity")}
                </div>
              )}
            </div>

            <button className="w-full mt-8 py-4 bg-[#ADC6FF] text-[#00285d] rounded-xl font-black text-xs uppercase tracking-wide hover:brightness-110 shadow-lg transition-all flex items-center justify-center gap-2">
              {t("download_full_ledger")}
              <Download size={16} />
            </button>
          </div>

          {/* Correlations */}
          <div className="bg-[#1C1B1B] rounded-3xl p-8 border border-white/5 shadow-xl">
            <h4 className="text-xs uppercase tracking-wide text-gray-500 font-black mb-8">{t("market_correlations")}</h4>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-black uppercase tracking-wide text-white">
                  <span>{t("macro_alignment")}</span>
                  <span>75%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: "75%" }}
                    className="h-full bg-[#ADC6FF] rounded-full" 
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-black uppercase tracking-wide text-white">
                  <span>{t("risk_exposure")}</span>
                  <span>42%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: "42%" }}
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
