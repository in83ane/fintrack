"use client";

import React, { useMemo } from "react";
import { useApp, WidgetType, Asset } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Eye, PieChart, Calendar, Wallet, Zap, DollarSign, ArrowRight
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

// ─── Equity Curve Widget ───────────────────────────────────────────────────────
function EquityCurveWidget() {
  const { t, formatMoney, netWorthHistory } = useApp();

  if (netWorthHistory.length < 2) {
    return <EmptyWidget label={t("equityCurve")} />;
  }

  const values = netWorthHistory.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 280;
  const H = 100;
  const PAD = 4;

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  const areaD = `${pathD} L ${(PAD + (W - PAD * 2)).toFixed(1)},${H} L ${PAD},${H} Z`;
  const isPositive = values[values.length - 1] >= values[0];
  const color = isPositive ? "#4EDEA3" : "#FFB4AB";

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide">{t("equityCurve")}</span>
        <span className={cn("text-xs font-black", isPositive ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
          {formatMoney(values[values.length - 1])}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#eq-grad)" />
          <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

// ─── Allocation Pie Widget ─────────────────────────────────────────────────────
function AllocationPieWidget() {
  const { t, assets, formatMoney, allocations } = useApp();
  const totalValue = assets.reduce((acc, a) => acc + a.valueUSD, 0);

  const segments = useMemo(() => {
    if (totalValue === 0) {
      return allocations.map(a => ({ label: a.label, value: a.value, color: a.color }));
    }
    // Group by allocation category
    const cats: Record<string, { value: number; color: string }> = {};
    allocations.forEach(a => { cats[a.label] = { value: 0, color: a.color }; });
    assets.forEach(a => {
      const cat = a.allocation || "Other";
      if (cats[cat]) cats[cat].value += a.valueUSD;
      else cats[cat] = { value: a.valueUSD, color: "#6B7280" };
    });
    return Object.entries(cats).map(([label, { value, color }]) => ({
      label, value: totalValue > 0 ? (value / totalValue) * 100 : 0, color
    }));
  }, [assets, allocations, totalValue]);

  const R = 40;
  const C = 50;
  let cumulativePercent = 0;

  return (
    <div className="h-full flex flex-col">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide mb-2">{t("widgetAllocationPie")}</span>
      <div className="flex-1 flex items-center gap-3 min-h-0">
        <svg viewBox="0 0 100 100" className="w-20 h-20 flex-shrink-0">
          {segments.map((seg, i) => {
            const pct = Math.max(seg.value, 0.5);
            const startAngle = cumulativePercent * 3.6;
            cumulativePercent += pct;
            const endAngle = cumulativePercent * 3.6;
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
                d={`M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={seg.color}
                stroke="#0E0E0E"
                strokeWidth={1}
                suppressHydrationWarning
              />
            );
          })}
          <circle cx={C} cy={C} r={22} fill="#0E0E0E" />
          <text x={C} y={C + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="bold">
            {assets.length}
          </text>
        </svg>
        <div className="space-y-1 overflow-y-auto max-h-full">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-[10px] text-gray-400 font-medium truncate">{seg.label} {seg.value.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Monthly Summary Widget ────────────────────────────────────────────────────
function MonthlySummaryWidget() {
  const { t, formatMoney, cashActivities } = useApp();
  const now = new Date();
  const thisMonth = cashActivities.filter(a => {
    const d = new Date(a.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const income = thisMonth.filter(a => a.type === "INCOME").reduce((s, a) => s + a.amountUSD, 0);
  const expense = thisMonth.filter(a => a.type === "EXPENSE").reduce((s, a) => s + a.amountUSD, 0);
  const net = income - expense;

  return (
    <div className="h-full flex flex-col">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide mb-3">{t("widgetMonthlySummary")}</span>
      <div className="flex-1 flex flex-col justify-center space-y-3">
        <div className={cn("text-2xl font-black tracking-tighter", net >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
          {net >= 0 ? "+" : ""}{formatMoney(net)}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-xl">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#4EDEA3]" />
              <span className="text-[10px] text-gray-400 font-bold">{t("income")}</span>
            </div>
            <span className="text-xs font-black text-white">{formatMoney(income)}</span>
          </div>
          <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-xl">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#FFB4AB]" />
              <span className="text-[10px] text-gray-400 font-bold">{t("expense")}</span>
            </div>
            <span className="text-xs font-black text-white">{formatMoney(expense)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Watchlist Widget ──────────────────────────────────────────────────────────
function WatchlistWidget() {
  const { t, assets, formatMoney } = useApp();

  return (
    <div className="h-full flex flex-col">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide mb-2">{t("widgetWatchlist")}</span>
      <div className="flex-1 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
        {assets.length === 0 ? (
          <EmptyWidget label={t("noDataYet")} />
        ) : (
          assets.slice(0, 8).map((asset, i) => {
            const isUp = asset.change >= 0;
            const shares = asset.shares || 0;
            const livePrice = shares > 0 ? asset.valueUSD / shares : 0;
            return (
              <div key={`${asset.symbol}-${asset.id || i}`} className="flex items-center justify-between p-2 bg-white/[0.02] rounded-xl hover:bg-white/[0.05] transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-[9px] font-black text-[#ADC6FF] flex-shrink-0">
                    {asset.symbol.slice(0, 3)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white truncate">{asset.symbol}</div>
                    <div className="text-[9px] text-gray-500">{formatMoney(livePrice, "USD", 1)}</div>
                  </div>
                </div>
                <div className={cn("flex items-center gap-0.5 text-[10px] font-black", isUp ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                  {isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                  {Math.abs(asset.change).toFixed(2)}%
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Daily Journal Widget ──────────────────────────────────────────────────────
function DailyJournalWidget() {
  const { t, trades, formatMoney } = useApp();
  const today = new Date().toISOString().split("T")[0];
  const todayTrades = trades.filter(tr => tr.date === today);
  const recentTrades = todayTrades.length > 0 ? todayTrades : trades.slice(0, 5);

  return (
    <div className="h-full flex flex-col">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide mb-2">{t("widgetDailyJournal")}</span>
      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
        {recentTrades.length === 0 ? (
          <EmptyWidget label={t("noDataYet")} />
        ) : (
          recentTrades.map((trade) => (
            <div key={trade.id} className="flex items-center justify-between p-2 bg-white/[0.02] rounded-xl">
              <div className="flex items-center gap-2">
                <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center",
                  trade.type === "BUY" || trade.type === "IMPORT" ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
                )}>
                  {trade.type === "BUY" || trade.type === "IMPORT" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-white">{trade.asset}</div>
                  <div className="text-[9px] text-gray-500">{trade.date}</div>
                </div>
              </div>
              <span className={cn("text-[11px] font-black", trade.type === "BUY" || trade.type === "IMPORT" ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                {trade.type === "BUY" || trade.type === "IMPORT" ? "+" : "-"}{formatMoney(trade.amountUSD)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Bucket Overview Widget ────────────────────────────────────────────────────
function BucketOverviewWidget() {
  const { t, moneyBuckets, formatMoney } = useApp();
  const total = moneyBuckets.reduce((s, b) => s + b.currentAmount, 0);

  return (
    <div className="h-full flex flex-col">
      <Link href="/budget" className="flex justify-between items-center mb-2 group cursor-pointer hover:bg-white/5 p-1 -mx-1 rounded-lg transition-colors">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide group-hover:text-white transition-colors flex items-center gap-1">
          {t("widgetBucketOverview")}
          <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
        <span className="text-xs font-black text-white">{formatMoney(total)}</span>
      </Link>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
        {moneyBuckets.map((b) => {
          const pct = total > 0 ? (b.currentAmount / total) * 100 : 0;
          return (
            <div key={b.id} className="space-y-1">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{b.icon}</span>
                  <span className="text-[10px] font-bold text-gray-400">{t(b.name) || b.name}</span>
                </div>
                <span className="text-[10px] font-black text-white">{formatMoney(b.currentAmount)}</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: b.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── P/L Calendar Mini Widget ──────────────────────────────────────────────────
function PLCalendarMiniWidget() {
  const { t, trades, formatMoney, exchangeRates, currency } = useApp();
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();

  // Daily P/L
  const dailyPL: Record<number, number> = {};
  trades.forEach(trade => {
    const d = new Date(trade.date);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      const day = d.getDate();
      if (!dailyPL[day]) dailyPL[day] = 0;
      const rate = exchangeRates[currency] || 1;
      dailyPL[day] += trade.amountUSD * (rate - trade.rateAtTime) / rate;
    }
  });

  return (
    <div className="h-full flex flex-col">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide mb-2">{t("widgetPLCalendar")}</span>
      <div className="flex-1 min-h-0">
        <div className="grid grid-cols-7 gap-[2px]">
          {Array.from({ length: firstDay }, (_, i) => (
            <div key={`e-${i}`} className="aspect-square" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const pl = dailyPL[day];
            const hasData = pl !== undefined;
            return (
              <div
                key={day}
                className={cn(
                  "aspect-square rounded-sm flex items-center justify-center text-[7px] font-bold",
                  hasData
                    ? pl >= 0 ? "bg-[#4EDEA3]/20 text-[#4EDEA3]" : "bg-[#FFB4AB]/20 text-[#FFB4AB]"
                    : "bg-white/[0.02] text-gray-600"
                )}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Top Movers Widget ─────────────────────────────────────────────────────────
function TopMoversWidget() {
  const { t, assets, formatMoney } = useApp();
  const sorted = useMemo(() => [...assets].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5), [assets]);

  return (
    <div className="h-full flex flex-col">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-wide mb-2">{t("widgetTopMovers")}</span>
      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
        {sorted.length === 0 ? (
          <EmptyWidget label={t("noDataYet")} />
        ) : (
          sorted.map((asset, i) => {
            const isUp = asset.change >= 0;
            return (
              <div key={`${asset.symbol}-${asset.id || i}`} className="flex items-center justify-between p-2 bg-white/[0.02] rounded-xl">
                <div className="flex items-center gap-2">
                  <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center",
                    isUp ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
                  )}>
                    {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  </div>
                  <span className="text-[11px] font-bold text-white">{asset.symbol}</span>
                </div>
                <span className={cn("text-[11px] font-black", isUp ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                  {isUp ? "+" : ""}{asset.change.toFixed(2)}%
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Empty Widget Placeholder ──────────────────────────────────────────────────
function EmptyWidget({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <span className="text-[10px] text-gray-500 font-medium">{label}</span>
    </div>
  );
}

// ─── Widget Name Map ───────────────────────────────────────────────────────────
export const WIDGET_META: Record<WidgetType, { icon: React.ReactNode; labelKey: string }> = {
  watchlist: { icon: <Eye size={14} />, labelKey: "widgetWatchlist" },
  monthly_summary: { icon: <DollarSign size={14} />, labelKey: "widgetMonthlySummary" },
  allocation_pie: { icon: <PieChart size={14} />, labelKey: "widgetAllocationPie" },
  daily_journal: { icon: <Zap size={14} />, labelKey: "widgetDailyJournal" },
  equity_curve: { icon: <TrendingUp size={14} />, labelKey: "widgetEquityCurve" },
  bucket_overview: { icon: <Wallet size={14} />, labelKey: "widgetBucketOverview" },
  pl_calendar_mini: { icon: <Calendar size={14} />, labelKey: "widgetPLCalendar" },
  top_movers: { icon: <ArrowUpRight size={14} />, labelKey: "widgetTopMovers" },
};

// ─── Widget Renderer ───────────────────────────────────────────────────────────
export function WidgetContent({ type }: { type: WidgetType }) {
  switch (type) {
    case "equity_curve": return <EquityCurveWidget />;
    case "allocation_pie": return <AllocationPieWidget />;
    case "monthly_summary": return <MonthlySummaryWidget />;
    case "watchlist": return <WatchlistWidget />;
    case "daily_journal": return <DailyJournalWidget />;
    case "bucket_overview": return <BucketOverviewWidget />;
    case "pl_calendar_mini": return <PLCalendarMiniWidget />;
    case "top_movers": return <TopMoversWidget />;
    default: return <EmptyWidget label="Unknown widget" />;
  }
}
