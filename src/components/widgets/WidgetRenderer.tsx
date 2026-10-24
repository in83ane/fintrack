"use client";

import { FinanceIcon } from "@/src/components/FinanceIcon";
import React, { useMemo } from "react";
import { useApp, WidgetType, Asset } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Eye, PieChart, Calendar, Wallet, Zap, DollarSign, ArrowRight
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { calcExpectancy, calcStreak } from "@/src/lib/finance";
import { getNativeLeg } from '@/src/lib/native-money';
import { decimal, sumNativeMoney, isFxCurrency, formatMoney as formatNativeMoney, nativeDisplay } from '@/src/lib/fx';

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
  const color = "var(--ft-accent)";

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{t("equityCurve")}</span>
        <span className={cn("text-xs font-black", isPositive ? "text-gain" : "text-loss")}>
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

  if (assets.some(a => !isFxCurrency(a.currency))) return <EmptyWidget label="unresolved: asset currency" />;

  return (
    <div className="h-full flex flex-col">
      <span className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">{t("widgetAllocationPie")}</span>
      <div className="flex-1 flex items-center gap-3 min-h-0">
        <svg viewBox="0 0 100 100" className="w-20 h-20 flex-shrink-0">
          {segments.map((seg, i) => {
            let pct = Math.max(seg.value, 0.5);
            if (pct >= 100) pct = 99.99;
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
                stroke="#0f1115"
                strokeWidth={1}
                suppressHydrationWarning
              />
            );
          })}
          <circle cx={C} cy={C} r={22} fill="#0f1115" />
          <text x={C} y={C + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="bold">
            {assets.length}
          </text>
        </svg>
        <div className="space-y-1 overflow-y-auto max-h-full">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-xs text-gray-400 font-medium truncate">{seg.label} {seg.value.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Monthly Summary Widget ────────────────────────────────────────────────────
function MonthlySummaryWidget() {
  const { t, cashActivities, currency, exchangeRates } = useApp();
  const now = new Date();
  const thisMonth = cashActivities.filter(a => {
    const d = new Date(a.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const target = currency === 'THB' ? 'THB' : 'USD';
  const sum = (type: string) => {
    try { return sumNativeMoney(thisMonth.filter(a => a.type === type).map(a => getNativeLeg({ original_amount: a.originalAmount, currency: a.currency })), target, String(exchangeRates.THB)); }
    catch { return null; }
  };
  const income = sum('INCOME'), expense = sum('EXPENSE');
  const net = income && expense ? decimal(income.amount).sub(decimal(expense.amount)) : null;
  const positive = net ? net.cmp(decimal('0')) >= 0 : true;

  return (
    <div className="h-full flex flex-col">
      <span className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">{t("widgetMonthlySummary")}</span>
      <div className="flex-1 flex flex-col justify-center space-y-3">
        <div className={cn("text-2xl font-black tracking-tighter", positive ? "text-gain" : "text-loss")}>
          {net ? formatNativeMoney(net, target, true) : 'unresolved'}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center bg-foreground/5 p-2.5 rounded-xl">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-gain" />
              <span className="text-xs text-gray-400 font-bold">{t("income")}</span>
            </div>
            <span className="text-xs font-black text-foreground">{income ? formatNativeMoney(decimal(income.amount), target) : 'unresolved'}</span>
          </div>
          <div className="flex justify-between items-center bg-foreground/5 p-2.5 rounded-xl">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-loss" />
              <span className="text-xs text-gray-400 font-bold">{t("expense")}</span>
            </div>
            <span className="text-xs font-black text-foreground">{expense ? formatNativeMoney(decimal(expense.amount), target) : 'unresolved'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Watchlist Widget ──────────────────────────────────────────────────────────
function WatchlistWidget() {
  const { t, assets, formatMoney } = useApp();

  if (assets.some(a => !isFxCurrency(a.currency))) return <EmptyWidget label="unresolved: asset currency" />;

  return (
    <div className="h-full flex flex-col">
      <span className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">{t("widgetWatchlist")}</span>
      <div className="flex-1 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
        {assets.length === 0 ? (
          <EmptyWidget label={t("noDataYet")} />
        ) : (
          assets.slice(0, 8).map((asset, i) => {
            const isUp = asset.change >= 0;
            const shares = asset.shares || 0;
            const livePrice = shares > 0 ? asset.valueUSD / shares : 0;
            return (
              <div key={`${asset.symbol}-${asset.id || i}`} className="flex items-center justify-between p-2 bg-foreground/[0.02] rounded-xl hover:bg-foreground/[0.05] transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-foreground/5 flex items-center justify-center text-xs font-black text-info flex-shrink-0">
                    {asset.symbol.slice(0, 3)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-foreground truncate">{asset.symbol}</div>
                    <div className="text-xs text-gray-500">{formatMoney(livePrice, "USD", 1)}</div>
                  </div>
                </div>
                <div className={cn("flex items-center gap-0.5 text-xs font-black", isUp ? "text-gain" : "text-loss")}>
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
  const { t, trades, formatMoney, assets } = useApp();
  const today = new Date().toISOString().split("T")[0];
  const todayTrades = trades.filter(tr => tr.date === today);
  const recentTrades = todayTrades.length > 0 ? todayTrades : trades.slice(0, 5);

  // Approximate metrics since trades don't have PnL yet
  const tradePnLs = assets.map(a => a.realizedPL || 0).filter(p => p !== 0);
  const wins = tradePnLs.filter(p => p > 0);
  const losses = tradePnLs.filter(p => p < 0);
  const winRate = tradePnLs.length > 0 ? wins.length / tradePnLs.length : 0;
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  
  const expectancy = calcExpectancy(winRate, avgWin, avgLoss);
  const { currentStreak, maxWinStreak, maxLossStreak } = calcStreak(tradePnLs);

  return (
    <div className="h-full flex flex-col">
      <span className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">{t("widgetDailyJournal")}</span>
      
      {tradePnLs.length > 0 && (
        <div className="flex items-center justify-between mb-3 bg-foreground/5 p-2 rounded-xl">
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase font-black">Expectancy</div>
            <div className={cn("text-xs font-black", expectancy >= 0 ? "text-gain" : "text-loss")}>{formatMoney(expectancy)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase font-black">Win Streak</div>
            <div className="text-xs font-black text-gain">{maxWinStreak}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase font-black">Loss Streak</div>
            <div className="text-xs font-black text-loss">{maxLossStreak}</div>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
        {recentTrades.length === 0 ? (
          <EmptyWidget label={t("noDataYet")} />
        ) : (
          recentTrades.map((trade) => (
            <div key={trade.id} className="flex items-center justify-between p-2 bg-foreground/[0.02] rounded-xl">
              <div className="flex items-center gap-2">
                <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center",
                  trade.type === "BUY" || trade.type === "IMPORT" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"
                )}>
                  {trade.type === "BUY" || trade.type === "IMPORT" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">{trade.asset}</div>
                  <div className="text-xs text-gray-500">{trade.date}</div>
                </div>
              </div>
              <span className={cn("text-xs font-black", trade.type === "BUY" || trade.type === "IMPORT" ? "text-gain" : "text-loss")}>
                {trade.type === "BUY" || trade.type === "IMPORT" ? "+" : "-"}{formatMoney(trade.amountUSD, trade.currency as any, trade.rateAtTime, trade.originalAmount)}
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
  const { t, moneyBuckets, currency, exchangeRates } = useApp();
  const target = currency === 'THB' ? 'THB' : 'USD';
  let total = null;
  try { total = sumNativeMoney(moneyBuckets.map(b => getNativeLeg({ original_amount: b.currentAmount, currency: b.currency })), target, String(exchangeRates.THB)); } catch { /* unresolved */ }

  return (
    <div className="h-full flex flex-col">
      <Link href="/budget" className="flex justify-between items-center mb-2 group cursor-pointer hover:bg-foreground/5 p-1 -mx-1 rounded-lg transition-colors">
        <span className="text-xs font-black text-gray-500 uppercase tracking-wide group-hover:text-foreground transition-colors flex items-center gap-1">
          {t("widgetBucketOverview")}
          <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
        <span className="text-xs font-black text-foreground">{total ? formatNativeMoney(decimal(total.amount), target) : 'unresolved'}</span>
      </Link>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
        {moneyBuckets.map((b) => {
          const valid = isFxCurrency(b.currency) && Number.isFinite(b.currentAmount);
          const display = valid ? nativeDisplay({ amount: b.currentAmount, currency: b.currency as 'USD' | 'THB' }, target, String(exchangeRates.THB)) : null;
          const converted = valid ? sumNativeMoney([{ amount: b.currentAmount, currency: b.currency as 'USD' | 'THB' }], target, String(exchangeRates.THB)) : null;
          const pct = total && converted && decimal(total.amount).cmp(decimal('0')) > 0 ? Number(decimal(converted.amount).div(decimal(total.amount)).mul(decimal('100')).toFixed(6)) : 0;
          return (
            <div key={b.id} className="space-y-1">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm"><FinanceIcon name={b.icon} /></span>
                  <span className="text-xs font-bold text-gray-400">{t(b.name) || b.name}</span>
                </div>
                <span className="text-xs font-black text-foreground">{display?.original && <span className="mr-2 text-gray-500">{display.original}</span>}{display?.amount || 'unresolved'}</span>
              </div>
              <div className="h-1 bg-foreground/5 rounded-full overflow-hidden">
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
      <span className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">{t("widgetPLCalendar")}</span>
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
                    ? pl >= 0 ? "bg-gain/20 text-gain" : "bg-loss/20 text-loss"
                    : "bg-foreground/[0.02] text-gray-600"
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

  if (assets.some(a => !isFxCurrency(a.currency))) return <EmptyWidget label="unresolved: asset currency" />;

  return (
    <div className="h-full flex flex-col">
      <span className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">{t("widgetTopMovers")}</span>
      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
        {sorted.length === 0 ? (
          <EmptyWidget label={t("noDataYet")} />
        ) : (
          sorted.map((asset, i) => {
            const isUp = asset.change >= 0;
            return (
              <div key={`${asset.symbol}-${asset.id || i}`} className="flex items-center justify-between p-2 bg-foreground/[0.02] rounded-xl">
                <div className="flex items-center gap-2">
                  <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center",
                    isUp ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"
                  )}>
                    {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  </div>
                  <span className="text-xs font-bold text-foreground">{asset.symbol}</span>
                </div>
                <span className={cn("text-xs font-black", isUp ? "text-gain" : "text-loss")}>
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
      <span className="text-xs text-gray-500 font-medium">{label}</span>
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
