"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Brain, Send, Sparkles, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, BarChart3, PieChart, Target, Zap, RefreshCcw,
  ChevronDown, ChevronUp, Lightbulb, Shield, DollarSign, Activity,
  Wallet, Gauge, ArrowUpRight, ArrowDownRight, Clock
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
  data?: InsightData;
}

interface InsightData {
  type: "monthly_summary" | "health_score" | "advice" | "transaction_ack" | "alert" | "budget_check" | "net_worth" | "expense_breakdown" | "velocity_alert";
  payload?: any;
}

// ─── Transaction Parser ────────────────────────────────────────────────────────
// Parses natural language like "Salary 50k", "Lunch 150", "NVDA shares 5000"
function parseTransaction(text: string): {
  type: "INCOME" | "EXPENSE" | "INVEST";
  amount: number;
  category: string;
  note: string;
} | null {
  const lower = text.toLowerCase().trim();

  // Amount patterns: "50k", "5000", "50,000", "$5000"
  const amountMatch = lower.match(/[\$]?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?/i);
  if (!amountMatch) return null;

  let amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  if (amountMatch[2]?.toLowerCase() === "k") amount *= 1000;
  if (amountMatch[2]?.toLowerCase() === "m") amount *= 1000000;
  if (amount <= 0 || isNaN(amount)) return null;

  // Income keywords
  const incomeKeywords = ["salary", "wage", "pay", "paycheck", "bonus", "freelance", "dividend", "interest", "refund", "received", "earned", "เงินเดือน", "โบนัส", "รายได้"];
  // Investment keywords
  const investKeywords = ["shares", "stock", "crypto", "btc", "eth", "nvda", "aapl", "tsla", "invest", "buy shares", "dca", "หุ้น", "ลงทุน", "คริปโต"];
  // Expense keywords
  const expenseKeywords = ["lunch", "dinner", "breakfast", "food", "grocery", "gas", "fuel", "rent", "bill", "utility", "shopping", "coffee", "transport", "taxi", "uber", "subscription", "insurance", "phone", "internet", "electricity", "water", "อาหาร", "ค่าเช่า", "ค่าน้ำ", "ค่าไฟ"];

  // Category detection
  const categoryMap: Record<string, string> = {
    salary: "salary", wage: "salary", pay: "salary", paycheck: "salary", เงินเดือน: "salary",
    bonus: "salary", freelance: "salary", ฟรีแลนซ์: "salary",
    dividend: "investment", interest: "investment", ปันผล: "investment",
    lunch: "food", dinner: "food", breakfast: "food", food: "food", grocery: "food", coffee: "food", อาหาร: "food", กาแฟ: "food",
    gas: "transport", fuel: "transport", taxi: "transport", uber: "transport", transport: "transport", เดินทาง: "transport",
    rent: "utilities", bill: "utilities", utility: "utilities", electricity: "utilities", water: "utilities", internet: "utilities", phone: "utilities", ค่าเช่า: "utilities", ค่าน้ำ: "utilities", ค่าไฟ: "utilities",
    shopping: "entertainment", subscription: "entertainment", ช้อปปิ้ง: "entertainment",
    insurance: "other",
    shares: "investment", stock: "investment", crypto: "investment", invest: "investment", dca: "investment", หุ้น: "investment", ลงทุน: "investment",
  };

  let detectedType: "INCOME" | "EXPENSE" | "INVEST" = "EXPENSE";
  let detectedCategory = "other";

  // Check for investment first (most specific)
  for (const kw of investKeywords) {
    if (lower.includes(kw)) {
      detectedType = "INVEST";
      detectedCategory = "investment";
      break;
    }
  }

  // Check for income
  if (detectedType !== "INVEST") {
    for (const kw of incomeKeywords) {
      if (lower.includes(kw)) {
        detectedType = "INCOME";
        break;
      }
    }
  }

  // Detect category from keywords
  for (const [kw, cat] of Object.entries(categoryMap)) {
    if (lower.includes(kw)) {
      detectedCategory = cat;
      break;
    }
  }

  // Clean the note
  const note = text.replace(/[\$]?\s*[\d,]+(?:\.\d+)?\s*(k|m)?/i, "").trim() || text;

  return { type: detectedType, amount, category: detectedCategory, note };
}

// ─── Bar Chart Component ────────────────────────────────────────────────────────
function AsciiBarChart({ income, expenses, investments, savings }: {
  income: number; expenses: number; investments: number; savings: number;
}) {
  const max = Math.max(income, expenses, investments, savings, 1);
  const BAR_MAX = 20;
  const bar = (v: number, color: string) => {
    const filled = Math.round((v / max) * BAR_MAX);
    const empty = BAR_MAX - filled;
    return (
      <span>
        <span style={{ color }}>{Array(filled).fill("█").join("")}</span>
        <span className="text-gray-700">{Array(empty).fill("░").join("")}</span>
      </span>
    );
  };
  const pct = (v: number) => income > 0 ? `${((v / income) * 100).toFixed(0)}%` : "—";
  const rows = [
    { label: "Income     ", v: income, color: "#4EDEA3" },
    { label: "Expenses   ", v: expenses, color: "#FFB4AB" },
    { label: "Investments", v: investments, color: "#ADC6FF" },
    { label: "Savings    ", v: savings, color: "#E9C349" },
  ];
  return (
    <div className="font-mono text-[11px] space-y-1.5 bg-black/30 rounded-xl p-3 border border-border">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-gray-400 w-28 flex-shrink-0">{r.label}</span>
          {bar(r.v, r.color)}
          <span style={{ color: r.color }} className="ml-1 font-bold">({pct(r.v)})</span>
        </div>
      ))}
    </div>
  );
}

// ─── Health Score Ring ──────────────────────────────────────────────────────────
function HealthScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#4EDEA3" : score >= 60 ? "#E9C349" : score >= 40 ? "#ADC6FF" : "#FFB4AB";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Attention";
  const dashArr = `${score} ${100 - score}`;
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-14 h-14 flex-shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={dashArr} strokeLinecap="round"
            className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-black text-white">{score}</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-black text-white">{label}</p>
        <p className="text-[10px] text-gray-500">Financial Health</p>
      </div>
    </div>
  );
}

// ─── Monthly Trend Chart (SVG) ─────────────────────────────────────────────────
function MonthlyTrendChart({ data }: {
  data: { label: string; income: number; expense: number }[];
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => Math.max(d.income, d.expense)), 1);
  const W = 280; const H = 72;
  const bW = Math.max(4, (W / data.length) * 0.32);
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full">
      {data.map((d, i) => {
        const slotW = W / data.length;
        const x = i * slotW + slotW * 0.12;
        const incH = (d.income / max) * H;
        const expH = (d.expense / max) * H;
        return (
          <g key={i}>
            <rect x={x} y={H - incH} width={bW} height={incH} fill="#4EDEA3" opacity={0.8} rx={2} />
            <rect x={x + bW + 1} y={H - expH} width={bW} height={expH} fill="#FFB4AB" opacity={0.8} rx={2} />
            <text x={x + bW} y={H + 13} textAnchor="middle" fill="#6B7280" fontSize={7}>{d.label}</text>
          </g>
        );
      })}
      <line x1={0} y1={H} x2={W} y2={H} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
    </svg>
  );
}

// ─── Insight Card ───────────────────────────────────────────────────────────────
function InsightCard({ icon: Icon, title, desc, color, priority }: {
  icon: React.ElementType; title: string; desc: string; color: string; priority?: "HIGH" | "MEDIUM" | "LOW";
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-xl border",
      color === "#4EDEA3" ? "bg-[#4EDEA3]/5 border-[#4EDEA3]/20" :
      color === "#FFB4AB" ? "bg-[#FFB4AB]/5 border-[#FFB4AB]/20" :
      color === "#E9C349" ? "bg-[#E9C349]/5 border-[#E9C349]/20" :
      "bg-[#ADC6FF]/5 border-[#ADC6FF]/20"
    )}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}20` }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-xs font-black text-white">{title}</p>
          {priority && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ color, backgroundColor: `${color}20` }}>
              {priority}
            </span>
          )}
        </div>
        <p className="text-[10px] text-gray-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ─── Expense Velocity Widget ────────────────────────────────────────────────────
function ExpenseVelocityWidget({ currentMonthExpenses, lastMonthExpenses, dayOfMonth, daysInMonth }: {
  currentMonthExpenses: number; lastMonthExpenses: number; dayOfMonth: number; daysInMonth: number;
}) {
  const pace = dayOfMonth > 0 ? (currentMonthExpenses / dayOfMonth) * daysInMonth : 0;
  const projectedOverspend = lastMonthExpenses > 0 ? ((pace - lastMonthExpenses) / lastMonthExpenses) * 100 : 0;
  const pctUsed = lastMonthExpenses > 0 ? (currentMonthExpenses / lastMonthExpenses) * 100 : 0;
  const isOverPace = projectedOverspend > 10;

  return (
    <div className={cn(
      "p-3 rounded-xl border",
      isOverPace ? "bg-[#FFB4AB]/5 border-[#FFB4AB]/20" : "bg-[#4EDEA3]/5 border-[#4EDEA3]/20"
    )}>
      <div className="flex items-center gap-2 mb-2">
        <Gauge size={12} className={isOverPace ? "text-[#FFB4AB]" : "text-[#4EDEA3]"} />
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Spending Velocity</span>
      </div>
      <div className="flex items-end gap-2 mb-2">
        <span className={cn("text-lg font-black", isOverPace ? "text-[#FFB4AB]" : "text-[#4EDEA3]")}>
          {pctUsed.toFixed(0)}%
        </span>
        <span className="text-[10px] text-gray-500 mb-0.5">of last month with {daysInMonth - dayOfMonth} days left</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, pctUsed)}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={cn("h-full rounded-full", isOverPace ? "bg-[#FFB4AB]" : "bg-[#4EDEA3]")}
        />
      </div>
      {isOverPace && (
        <p className="text-[10px] text-[#FFB4AB] mt-1.5 font-bold">
          ⚠️ On pace to exceed last month by {projectedOverspend.toFixed(0)}%
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AI FINANCIAL ADVISOR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export function AIFinancialAdvisor() {
  const {
    formatMoney, language,
    cashActivities, bucketActivities,
    assets, trades, totalInvested, totalUnrealizedPL, totalRealizedPL, totalDividends,
    moneyBuckets, netWorthHistory,
    addCashActivity, addToast, t, exchangeRates,
  } = useApp();

  const isTh = language === "th";
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showInsights, setShowInsights] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasInit = useRef(false);

  // ─── Compute cross-module financial snapshot ──────────────────────────────
  const snapshot = useMemo(() => {
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Previous month key
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const thisMonthCash = cashActivities.filter(a => a.date.startsWith(thisMonthKey));
    const prevMonthCash = cashActivities.filter(a => a.date.startsWith(prevMonthKey));
    const getEntryAmount = (entry: { amountUSD?: number; amount?: number; originalAmount?: number }) => {
      return entry.amountUSD ?? entry.amount ?? 0;
    };

    const monthIncome = thisMonthCash
      .filter(a => a.type === "INCOME" || a.type === "DEPOSIT")
      .reduce((s, a) => s + getEntryAmount(a), 0);
    const monthExpenses = thisMonthCash
      .filter(a => (a.type === "EXPENSE" || a.type === "WITHDRAW") && !a.isTransfer)
      .reduce((s, a) => s + getEntryAmount(a), 0);
    const monthNet = monthIncome - monthExpenses;
    const savingsRate = monthIncome > 0 ? Math.max(0, (monthNet / monthIncome) * 100) : 0;

    // Previous month stats
    const prevMonthIncome = prevMonthCash
      .filter(a => a.type === "INCOME" || a.type === "DEPOSIT")
      .reduce((s, a) => s + getEntryAmount(a), 0);
    const prevMonthExpenses = prevMonthCash
      .filter(a => (a.type === "EXPENSE" || a.type === "WITHDRAW") && !a.isTransfer)
      .reduce((s, a) => s + getEntryAmount(a), 0);
    const prevMonthNet = prevMonthIncome - prevMonthExpenses;

    const monthInvested = bucketActivities
      .filter(ba => ba.type === "invest" && ba.date.startsWith(thisMonthKey))
      .reduce((s, ba) => s + getEntryAmount(ba), 0);
    const investRatio = monthIncome > 0 ? (monthInvested / monthIncome) * 100 : 0;

    const expenseByCategory: Record<string, number> = {};
    thisMonthCash
      .filter(a => a.type === "EXPENSE" || a.type === "WITHDRAW")
      .forEach(a => {
        expenseByCategory[a.category] = (expenseByCategory[a.category] || 0) + getEntryAmount(a);
      });

    const totalPortfolioValue = assets.reduce((s, a) => s + a.valueUSD, 0);
    const portfolioReturn = totalInvested > 0 ? ((totalPortfolioValue - totalInvested) / totalInvested) * 100 : 0;
    const latestNW = netWorthHistory.length > 0 ? netWorthHistory[netWorthHistory.length - 1].value : 0;

    // Health score
    let score = 50;
    if (savingsRate >= 20) score += 15; else if (savingsRate >= 10) score += 8;
    if (investRatio >= 15) score += 15; else if (investRatio >= 5) score += 8;
    if (monthExpenses <= monthIncome * 0.5) score += 10;
    if (portfolioReturn >= 10) score += 10; else if (portfolioReturn >= 0) score += 5;
    if (moneyBuckets.length > 0) score += 5;
    if (totalRealizedPL > 0) score += 5;
    score = Math.min(100, Math.max(0, score));

    // Monthly trend (last 6 months)
    const monthlyTrend: { label: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short" });
      const inc = cashActivities
        .filter(a => a.date.startsWith(key) && (a.type === "INCOME" || a.type === "DEPOSIT"))
        .reduce((s, a) => s + getEntryAmount(a), 0);
      const exp = cashActivities
        .filter(a => a.date.startsWith(key) && (a.type === "EXPENSE" || a.type === "WITHDRAW") && !a.isTransfer)
        .reduce((s, a) => s + getEntryAmount(a), 0);
      if (inc > 0 || exp > 0) monthlyTrend.push({ label, income: inc, expense: exp });
    }

    const topExpenses = Object.entries(expenseByCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const liquidity = moneyBuckets.reduce((s, b) => s + (b.currentAmount / (exchangeRates[b.currency || 'USD'] || 1)), 0);

    // Budget health per bucket
    const bucketHealth = moneyBuckets.map(b => {
      const bucketExpenses = thisMonthCash
        .filter(a => (a.type === "EXPENSE" || a.type === "WITHDRAW") && a.bucketId === b.id)
        .reduce((s, a) => s + getEntryAmount(a), 0);
      const targetAmount = b.targetAmount || (b.targetPercent > 0 && monthIncome > 0 ? (b.targetPercent / 100) * monthIncome : 0);
      return {
        name: b.name,
        icon: b.icon,
        spent: bucketExpenses,
        target: targetAmount,
        current: b.currentAmount,
        currency: b.currency || 'USD',
        pctUsed: targetAmount > 0 ? (bucketExpenses / targetAmount) * 100 : 0,
        isOverBudget: targetAmount > 0 && bucketExpenses > targetAmount,
      };
    });

    // Top performing and worst performing assets
    const sortedAssets = [...assets].sort((a, b) => b.change - a.change);
    const topAssets = sortedAssets.slice(0, 3);
    const worstAssets = sortedAssets.slice(-3).reverse();

    // Expense velocity
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    // All-time income & expenses
    const allTimeIncome = cashActivities
      .filter(a => a.type === "INCOME" || a.type === "DEPOSIT")
      .reduce((s, a) => s + getEntryAmount(a), 0);
    const allTimeExpenses = cashActivities
      .filter(a => (a.type === "EXPENSE" || a.type === "WITHDRAW") && !a.isTransfer)
      .reduce((s, a) => s + getEntryAmount(a), 0);

    return {
      monthIncome, monthExpenses, monthNet, savingsRate,
      prevMonthIncome, prevMonthExpenses, prevMonthNet,
      monthInvested, investRatio,
      totalPortfolioValue, portfolioReturn,
      latestNW, healthScore: score,
      monthlyTrend, topExpenses, expenseByCategory,
      liquidity, totalInvested, totalUnrealizedPL, totalRealizedPL, totalDividends,
      assetCount: assets.length, tradeCount: trades.length,
      bucketHealth, topAssets, worstAssets,
      dayOfMonth, daysInMonth,
      allTimeIncome, allTimeExpenses,
    };
  }, [cashActivities, bucketActivities, assets, trades, totalInvested,
      totalUnrealizedPL, totalRealizedPL, totalDividends, moneyBuckets, netWorthHistory]);

  // ─── Generate insights ────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const list: { icon: React.ElementType; title: string; desc: string; color: string; priority?: "HIGH" | "MEDIUM" | "LOW" }[] = [];

    if (snapshot.savingsRate < 10 && snapshot.monthIncome > 0) {
      list.push({ icon: AlertTriangle, title: "Low Savings Rate", desc: `Your savings rate is ${snapshot.savingsRate.toFixed(1)}%. Target ≥ 20% to build wealth. Reduce variable expenses.`, color: "#FFB4AB", priority: "HIGH" });
    } else if (snapshot.savingsRate >= 20) {
      list.push({ icon: CheckCircle2, title: "Healthy Savings", desc: `${snapshot.savingsRate.toFixed(1)}% savings rate is excellent! Consider routing ${formatMoney(snapshot.monthNet * 0.1)} to your investment portfolio.`, color: "#4EDEA3" });
    }
    if (snapshot.investRatio < 5 && snapshot.monthIncome > 0) {
      list.push({ icon: TrendingUp, title: "Increase Investment Allocation", desc: `Only ${snapshot.investRatio.toFixed(1)}% of income invested. Target 10–15% through systematic DCA.`, color: "#ADC6FF", priority: "MEDIUM" });
    }
    if (snapshot.monthExpenses > snapshot.monthIncome * 0.7 && snapshot.monthIncome > 0) {
      list.push({ icon: Shield, title: "High Expense Ratio", desc: `Expenses at ${((snapshot.monthExpenses / snapshot.monthIncome) * 100).toFixed(0)}% of income. Review variable spending.`, color: "#E9C349", priority: "HIGH" });
    }
    if (snapshot.portfolioReturn > 15) {
      list.push({ icon: Target, title: "Portfolio Outperforming", desc: `Portfolio up ${snapshot.portfolioReturn.toFixed(1)}%. Consider taking partial profits or rebalancing.`, color: "#4EDEA3" });
    } else if (snapshot.portfolioReturn < -10 && snapshot.totalInvested > 0) {
      list.push({ icon: Activity, title: "Portfolio Drawdown", desc: `Portfolio down ${Math.abs(snapshot.portfolioReturn).toFixed(1)}%. Review positions for averaging down opportunities.`, color: "#FFB4AB", priority: "HIGH" });
    }
    if (snapshot.liquidity > 0 && snapshot.totalPortfolioValue > 0) {
      const lRatio = (snapshot.liquidity / snapshot.totalPortfolioValue) * 100;
      if (lRatio > 30) {
        list.push({ icon: Lightbulb, title: "Excess Cash Detected", desc: `${lRatio.toFixed(0)}% in cash buckets. Deploy ${formatMoney(snapshot.liquidity * 0.4)} into diversified assets.`, color: "#E9C349", priority: "MEDIUM" });
      }
    }
    if (snapshot.totalDividends > 0) {
      list.push({ icon: DollarSign, title: "Dividend Income", desc: `You've earned ${formatMoney(snapshot.totalDividends)} in dividends. Reinvesting compounds returns significantly.`, color: "#ADC6FF" });
    }

    // Expense velocity alert
    if (snapshot.prevMonthExpenses > 0 && snapshot.dayOfMonth >= 10) {
      const pace = (snapshot.monthExpenses / snapshot.dayOfMonth) * snapshot.daysInMonth;
      const projectedOverspend = ((pace - snapshot.prevMonthExpenses) / snapshot.prevMonthExpenses) * 100;
      if (projectedOverspend > 15) {
        list.push({
          icon: Gauge,
          title: "Spending Pace Alert",
          desc: `At current rate, you'll spend ${formatMoney(pace)} this month — ${projectedOverspend.toFixed(0)}% more than last month (${formatMoney(snapshot.prevMonthExpenses)}).`,
          color: "#FFB4AB",
          priority: "HIGH"
        });
      }
    }

    // Budget bucket alerts
    snapshot.bucketHealth.forEach(b => {
      if (b.isOverBudget) {
        list.push({
          icon: Wallet,
          title: `${b.icon} ${b.name} Over Budget`,
          desc: `Spent ${formatMoney(b.spent)} vs target ${formatMoney(b.target)}. ${((b.spent / b.target) * 100).toFixed(0)}% of allocation used.`,
          color: "#FFB4AB",
          priority: "HIGH"
        });
      }
    });

    // MoM change alerts
    if (snapshot.prevMonthIncome > 0 && snapshot.monthIncome > 0) {
      const incomeChange = ((snapshot.monthIncome - snapshot.prevMonthIncome) / snapshot.prevMonthIncome) * 100;
      if (incomeChange < -20) {
        list.push({
          icon: TrendingDown,
          title: "Income Decline",
          desc: `Income dropped ${Math.abs(incomeChange).toFixed(0)}% month-over-month. Review income sources.`,
          color: "#E9C349",
          priority: "MEDIUM"
        });
      }
    }

    return list;
  }, [snapshot, formatMoney]);

  // ─── Init greeting ────────────────────────────────────────────────────────
  useEffect(() => {
    if (hasInit.current) return;
    hasInit.current = true;
    setMessages([{
      id: "init",
      role: "assistant",
      content: "",
      timestamp: new Date(),
      data: { type: "health_score", payload: { score: snapshot.healthScore } }
    }]);
  }, [snapshot.healthScore]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── AI Processing ────────────────────────────────────────────────────────
  const processInput = async (text: string) => {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: "user", content: text, timestamp: new Date() }]);
    setInput("");
    setIsThinking(true);
    await new Promise(r => setTimeout(r, 700 + Math.random() * 500));

    const lower = text.toLowerCase();
    let content = "";
    let data: InsightData | undefined;

    // ─── TRANSACTION PARSING ────────────────────────────────────────────────
    const parsed = parseTransaction(text);
    if (parsed && !lower.includes("summary") && !lower.includes("health") && !lower.includes("advice") && !lower.includes("budget") && !lower.includes("net worth") && !lower.includes("breakdown")) {
      const typeLabel = parsed.type === "INCOME" ? "💰 Income" : parsed.type === "INVEST" ? "📈 Investment" : "💸 Expense";
      const cashType = parsed.type === "INCOME" ? "INCOME" : "EXPENSE";

      // Actually add the transaction
      addCashActivity({
        type: cashType,
        amountUSD: parsed.amount,
        category: parsed.category,
        date: new Date().toISOString(),
        note: parsed.note,
      });

      const newNet = snapshot.monthNet + (parsed.type === "INCOME" ? parsed.amount : -parsed.amount);

      content = `**✅ Transaction Logged**\n\n• Type: ${typeLabel}\n• Amount: ${formatMoney(parsed.amount)}\n• Category: ${parsed.category.charAt(0).toUpperCase() + parsed.category.slice(1)}\n• Note: "${parsed.note}"\n\n**Updated Net Balance:** ${newNet >= 0 ? "+" : ""}${formatMoney(newNet)}\n\n${parsed.type === "EXPENSE" && snapshot.monthExpenses + parsed.amount > snapshot.monthIncome * 0.7 ? "⚠️ Warning: Expenses approaching 70% of income threshold." : parsed.type === "INCOME" ? `💡 Consider allocating ${formatMoney(parsed.amount * 0.2)} (20%) to investments.` : `📊 Investment allocation: ${formatMoney(snapshot.monthInvested + (parsed.type === "INVEST" ? parsed.amount : 0))} this month.`}`;
      data = { type: "transaction_ack" };

      addToast(t("recordSaved") || "Transaction saved", "success");
    }
    // ─── MONTHLY SUMMARY ────────────────────────────────────────────────────
    else if (lower.includes("summary") || lower.includes("monthly") || lower.includes("สรุป") || lower.includes("เดือน")) {
      const incomeChange = snapshot.prevMonthIncome > 0 ? ((snapshot.monthIncome - snapshot.prevMonthIncome) / snapshot.prevMonthIncome * 100) : 0;
      const expenseChange = snapshot.prevMonthExpenses > 0 ? ((snapshot.monthExpenses - snapshot.prevMonthExpenses) / snapshot.prevMonthExpenses * 100) : 0;

      content = `**📊 Monthly Financial Summary**\n\n• Income: ${formatMoney(snapshot.monthIncome)} ${incomeChange !== 0 ? `(${incomeChange > 0 ? "↑" : "↓"}${Math.abs(incomeChange).toFixed(0)}% MoM)` : ""}\n• Expenses: ${formatMoney(snapshot.monthExpenses)} (${snapshot.monthIncome > 0 ? ((snapshot.monthExpenses / snapshot.monthIncome) * 100).toFixed(0) : 0}% of income) ${expenseChange !== 0 ? `(${expenseChange > 0 ? "↑" : "↓"}${Math.abs(expenseChange).toFixed(0)}% MoM)` : ""}\n• Net Cash: ${snapshot.monthNet >= 0 ? "+" : ""}${formatMoney(snapshot.monthNet)}\n• Invested: ${formatMoney(snapshot.monthInvested)}\n• Savings Rate: ${snapshot.savingsRate.toFixed(1)}%\n\n${snapshot.savingsRate >= 20 ? "✅ Excellent savings discipline." : snapshot.savingsRate >= 10 ? "⚠️ Moderate — room to improve." : "🚨 Below 10% — action needed."}\n\n${snapshot.topExpenses.length > 0 ? `**Top Expense Categories:**\n${snapshot.topExpenses.map(([cat, amt]) => `• ${cat}: ${formatMoney(amt as number)} (${snapshot.monthIncome > 0 ? ((amt as number / snapshot.monthIncome) * 100).toFixed(0) : 0}% of income)`).join("\n")}` : ""}\n\n${snapshot.prevMonthNet !== 0 ? `**vs Last Month:** Net ${snapshot.monthNet > snapshot.prevMonthNet ? "improved" : "declined"} by ${formatMoney(Math.abs(snapshot.monthNet - snapshot.prevMonthNet))}` : ""}`;
      data = { type: "monthly_summary" };
    }
    // ─── HEALTH SCORE ───────────────────────────────────────────────────────
    else if (lower.includes("health") || lower.includes("score") || lower.includes("สุขภาพ")) {
      const score = snapshot.healthScore;
      content = `**Financial Health Score: ${score}/100** ${score >= 80 ? "🏆 Excellent" : score >= 60 ? "✅ Good" : score >= 40 ? "⚠️ Fair" : "🚨 Needs Attention"}\n\n• Savings Rate (${snapshot.savingsRate.toFixed(0)}%): ${snapshot.savingsRate >= 20 ? "+15" : snapshot.savingsRate >= 10 ? "+8" : "0"} pts\n• Investment Ratio (${snapshot.investRatio.toFixed(0)}%): ${snapshot.investRatio >= 15 ? "+15" : snapshot.investRatio >= 5 ? "+8" : "0"} pts\n• Expense Control: ${snapshot.monthExpenses <= snapshot.monthIncome * 0.5 ? "+10" : "0"} pts\n• Portfolio Return (${snapshot.portfolioReturn.toFixed(1)}%): ${snapshot.portfolioReturn >= 10 ? "+10" : snapshot.portfolioReturn >= 0 ? "+5" : "0"} pts\n• Budget System: ${moneyBuckets.length > 0 ? "+5" : "0"} pts\n• Realized Profits: ${snapshot.totalRealizedPL > 0 ? "+5" : "0"} pts`;
      data = { type: "health_score" };
    }
    // ─── BUDGET CHECK ───────────────────────────────────────────────────────
    else if (lower.includes("budget") || lower.includes("bucket") || lower.includes("งบ")) {
      if (snapshot.bucketHealth.length === 0) {
        content = `**💼 Budget Status**\n\nNo money buckets configured yet. Set up budget buckets in the Budget page to enable:\n• Auto-distribution of income\n• Per-category spending limits\n• Budget vs actual tracking\n\n💡 Recommended buckets: Emergency Fund (20%), Investments (20%), Living Expenses (50%), Fun Money (10%)`;
      } else {
        const overBudget = snapshot.bucketHealth.filter(b => b.isOverBudget);
        const bucketLines = snapshot.bucketHealth.map(b => {
          const status = b.isOverBudget ? "🔴" : b.pctUsed > 80 ? "🟡" : "🟢";
          return `${status} ${b.icon} **${b.name}**: ${formatMoney(b.current / (exchangeRates[b.currency] || 1), b.currency as any, undefined, b.current)} balance${b.target > 0 ? ` | ${b.pctUsed.toFixed(0)}% of budget used` : ""}`;
        }).join("\n");

        content = `**💼 Budget Health Check**\n\n${bucketLines}\n\n${overBudget.length > 0 ? `⚠️ ${overBudget.length} bucket(s) over budget! Review: ${overBudget.map(b => b.name).join(", ")}` : "✅ All buckets within budget."}\n\n• Total Liquidity: ${formatMoney(snapshot.liquidity)}\n• Day ${snapshot.dayOfMonth}/${snapshot.daysInMonth} of month`;
      }
      data = { type: "budget_check" };
    }
    // ─── NET WORTH ──────────────────────────────────────────────────────────
    else if (lower.includes("net worth") || lower.includes("wealth") || lower.includes("มูลค่า") || lower.includes("ทรัพย์สิน")) {
      const totalNW = snapshot.latestNW || (snapshot.totalPortfolioValue + snapshot.liquidity);
      const portfolioPct = totalNW > 0 ? (snapshot.totalPortfolioValue / totalNW * 100) : 0;
      const cashPct = totalNW > 0 ? (snapshot.liquidity / totalNW * 100) : 0;

      content = `**💎 Net Worth Overview**\n\n• Total Net Worth: **${formatMoney(totalNW)}**\n• Portfolio Value: ${formatMoney(snapshot.totalPortfolioValue)} (${portfolioPct.toFixed(0)}%)\n• Cash & Buckets: ${formatMoney(snapshot.liquidity)} (${cashPct.toFixed(0)}%)\n• Unrealized P/L: ${snapshot.totalUnrealizedPL >= 0 ? "+" : ""}${formatMoney(snapshot.totalUnrealizedPL)}\n• Realized P/L: ${snapshot.totalRealizedPL >= 0 ? "+" : ""}${formatMoney(snapshot.totalRealizedPL)}\n• Dividends: ${formatMoney(snapshot.totalDividends)}\n\n${snapshot.topAssets.length > 0 ? `**Top Performers:**\n${snapshot.topAssets.map(a => `• ${a.symbol}: ${a.change >= 0 ? "+" : ""}${a.change.toFixed(2)}% (${formatMoney(a.valueUSD)})`).join("\n")}` : ""}\n\n${snapshot.worstAssets.length > 0 && snapshot.worstAssets[0].change < 0 ? `**Underperformers:**\n${snapshot.worstAssets.filter(a => a.change < 0).map(a => `• ${a.symbol}: ${a.change.toFixed(2)}% (${formatMoney(a.valueUSD)})`).join("\n")}` : ""}`;
      data = { type: "net_worth" };
    }
    // ─── EXPENSE BREAKDOWN ──────────────────────────────────────────────────
    else if (lower.includes("breakdown") || lower.includes("expense") || lower.includes("spending") || lower.includes("ค่าใช้จ่าย") || lower.includes("รายจ่าย")) {
      const categories = Object.entries(snapshot.expenseByCategory)
        .sort(([, a], [, b]) => (b as number) - (a as number));

      if (categories.length === 0) {
        content = `**📋 Expense Breakdown**\n\nNo expenses recorded this month yet. Start logging transactions to see your spending patterns.`;
      } else {
        const catLines = categories.map(([cat, amt], i) => {
          const pct = snapshot.monthExpenses > 0 ? ((amt as number) / snapshot.monthExpenses * 100) : 0;
          const barLen = Math.round(pct / 5);
          const bar = "█".repeat(barLen) + "░".repeat(Math.max(0, 20 - barLen));
          return `${i + 1}. **${cat}**: ${formatMoney(amt as number)} (${pct.toFixed(0)}%)\n   ${bar}`;
        }).join("\n");

        const fixedCategories = ["utilities", "rent", "insurance"];
        const fixedTotal = categories
          .filter(([cat]) => fixedCategories.some(fc => cat.toLowerCase().includes(fc)))
          .reduce((s, [, amt]) => s + (amt as number), 0);
        const variableTotal = snapshot.monthExpenses - fixedTotal;

        content = `**📋 Expense Breakdown — This Month**\n\n${catLines}\n\n• Fixed Expenses: ~${formatMoney(fixedTotal)} (${snapshot.monthExpenses > 0 ? (fixedTotal / snapshot.monthExpenses * 100).toFixed(0) : 0}%)\n• Variable Expenses: ~${formatMoney(variableTotal)} (${snapshot.monthExpenses > 0 ? (variableTotal / snapshot.monthExpenses * 100).toFixed(0) : 0}%)\n\n${variableTotal > fixedTotal * 1.5 ? "💡 Variable spending is significantly higher than fixed costs. Look for recurring subscriptions or dining expenses to optimize." : "✅ Spending mix looks balanced."}`;
      }
      data = { type: "expense_breakdown" };
    }
    // ─── PORTFOLIO ──────────────────────────────────────────────────────────
    else if (lower.includes("portfolio") || lower.includes("invest") || lower.includes("stock") || lower.includes("หุ้น")) {
      const assetDetails = snapshot.topAssets.length > 0
        ? `\n\n**Your Top Positions:**\n${snapshot.topAssets.map(a => {
            const pctOfPortfolio = snapshot.totalPortfolioValue > 0 ? (a.valueUSD / snapshot.totalPortfolioValue * 100) : 0;
            return `• **${a.symbol}**: ${formatMoney(a.valueUSD)} (${a.change >= 0 ? "+" : ""}${a.change.toFixed(2)}%) — ${pctOfPortfolio.toFixed(1)}% of portfolio${pctOfPortfolio > 30 ? " ⚠️ Concentrated" : ""}`;
          }).join("\n")}`
        : "";

      content = `**📈 Portfolio Intelligence**\n\n• Total Value: ${formatMoney(snapshot.totalPortfolioValue)}\n• Invested: ${formatMoney(snapshot.totalInvested)}\n• Unrealized P/L: ${formatMoney(snapshot.totalUnrealizedPL)} (${snapshot.portfolioReturn.toFixed(2)}%)\n• Realized P/L: ${formatMoney(snapshot.totalRealizedPL)}\n• Dividends: ${formatMoney(snapshot.totalDividends)}\n• Assets: ${snapshot.assetCount} positions · ${snapshot.tradeCount} trades${assetDetails}\n\n${snapshot.portfolioReturn > 10 ? "💡 Outperforming — consider rebalancing if any position > 30%." : snapshot.portfolioReturn < 0 ? "💡 Underwater — review quality positions for DCA opportunities." : "💡 Performing steadily — maintain your DCA discipline."}`;
    }
    // ─── LIQUIDITY ──────────────────────────────────────────────────────────
    else if (lower.includes("cash") || lower.includes("liquid") || lower.includes("เงินสด")) {
      const lRatio = snapshot.totalPortfolioValue > 0 ? ((snapshot.liquidity / snapshot.totalPortfolioValue) * 100).toFixed(1) : "—";
      content = `**💵 Liquidity Analysis**\n\n• Available Liquidity: ${formatMoney(snapshot.liquidity)}\n• Liquidity vs Portfolio: ${lRatio}%\n\n${snapshot.liquidity > snapshot.totalPortfolioValue * 0.3 ? `⚠️ Over-liquid. Consider deploying ${formatMoney(snapshot.liquidity * 0.4)} — split 50/50 between defensive (gold/bonds) and growth assets.` : snapshot.liquidity < 1000 ? "🚨 Low liquidity. Build 3–6 months emergency reserves first." : "✅ Balanced liquidity position."}`;
    }
    // ─── ADVICE ─────────────────────────────────────────────────────────────
    else if (lower.includes("advice") || lower.includes("recommend") || lower.includes("แนะนำ") || lower.includes("tip")) {
      // Portfolio-specific advice
      const portfolioAdvice = snapshot.topAssets.length > 0
        ? snapshot.topAssets.filter(a => a.change > 30).map(a =>
            `• Consider trimming **${a.symbol}** (up ${a.change.toFixed(1)}%) — take 10-15% partial profit`
          ).join("\n")
        : "";
      const dcaAdvice = snapshot.worstAssets.length > 0
        ? snapshot.worstAssets.filter(a => a.change < -15 && a.change > -50).map(a =>
            `• **${a.symbol}** is down ${Math.abs(a.change).toFixed(1)}% — evaluate for DCA if fundamentals intact`
          ).join("\n")
        : "";

      content = `**🎯 Personalized Recommendations**\n\n${snapshot.savingsRate < 20 && snapshot.monthIncome > 0 ? `1. **Boost Savings** — From ${snapshot.savingsRate.toFixed(1)}% to 20%. Save ${formatMoney(snapshot.monthIncome * 0.2)}/month.\n` : "1. ✅ Savings on track.\n"}${snapshot.investRatio < 10 && snapshot.monthIncome > 0 ? `2. **Deploy Capital** — Only ${snapshot.investRatio.toFixed(1)}% invested. Set up ${formatMoney(snapshot.monthIncome * 0.1)}/month recurring investment.\n` : "2. ✅ Investment allocation balanced.\n"}${snapshot.portfolioReturn < 0 ? `3. **DCA on Dips** — Portfolio down ${Math.abs(snapshot.portfolioReturn).toFixed(1)}% — review quality positions.\n` : `3. **Protect Profits** — Consider ${Math.min(25, snapshot.portfolioReturn / 2).toFixed(0)}% partial profit on top performers.\n`}4. **Emergency Fund** — Maintain ${formatMoney(Math.max(snapshot.monthExpenses * 6, 5000))} liquid.\n5. **Review Buckets** — ${snapshot.liquidity > 0 ? `${formatMoney(snapshot.liquidity)} available. Allocate based on risk tolerance.` : "Set up money buckets for better cash flow control."}\n\n${portfolioAdvice ? `\n**Portfolio-Specific Actions:**\n${portfolioAdvice}` : ""}${dcaAdvice ? `\n${dcaAdvice}` : ""}`;
    }
    // ─── VELOCITY ───────────────────────────────────────────────────────────
    else if (lower.includes("velocity") || lower.includes("pace") || lower.includes("rate")) {
      const pace = snapshot.dayOfMonth > 0 ? (snapshot.monthExpenses / snapshot.dayOfMonth) * snapshot.daysInMonth : 0;
      const dailyAvg = snapshot.dayOfMonth > 0 ? snapshot.monthExpenses / snapshot.dayOfMonth : 0;
      const dailyIncome = snapshot.dayOfMonth > 0 ? snapshot.monthIncome / snapshot.dayOfMonth : 0;
      const projectedOverspend = snapshot.prevMonthExpenses > 0 ? ((pace - snapshot.prevMonthExpenses) / snapshot.prevMonthExpenses * 100) : 0;

      content = `**⚡ Spending Velocity Report**\n\n• Daily Avg Spend: ${formatMoney(dailyAvg)}/day\n• Daily Avg Income: ${formatMoney(dailyIncome)}/day\n• Net Daily Flow: ${dailyIncome - dailyAvg >= 0 ? "+" : ""}${formatMoney(dailyIncome - dailyAvg)}/day\n\n• Projected Month-End: ${formatMoney(pace)}\n• Last Month Total: ${formatMoney(snapshot.prevMonthExpenses)}\n• Projected Change: ${projectedOverspend >= 0 ? "+" : ""}${projectedOverspend.toFixed(0)}%\n\n• Progress: Day ${snapshot.dayOfMonth} of ${snapshot.daysInMonth} (${(snapshot.dayOfMonth / snapshot.daysInMonth * 100).toFixed(0)}% through month)\n• Budget Used: ${snapshot.prevMonthExpenses > 0 ? (snapshot.monthExpenses / snapshot.prevMonthExpenses * 100).toFixed(0) : "—"}%\n\n${projectedOverspend > 15 ? "🚨 You're on pace to significantly overspend. Consider a spending freeze on variable categories." : projectedOverspend > 0 ? "⚠️ Slightly above last month's pace. Monitor closely." : "✅ Spending pace is under control."}`;
      data = { type: "velocity_alert" };
    }
    // ─── FALLBACK ───────────────────────────────────────────────────────────
    else {
      content = `Noted: *"${text}"*\n\nYour snapshot:\n• Net Worth: ${formatMoney(snapshot.latestNW || (snapshot.totalPortfolioValue + snapshot.liquidity))}\n• This Month: ${formatMoney(snapshot.monthIncome)} in / ${formatMoney(snapshot.monthExpenses)} out\n• Portfolio: ${formatMoney(snapshot.totalPortfolioValue)} (${snapshot.portfolioReturn >= 0 ? "+" : ""}${snapshot.portfolioReturn.toFixed(2)}%)\n\n💡 **Try these commands:**\n• *Monthly summary* · *Health score* · *Portfolio*\n• *Budget check* · *Net worth* · *Expense breakdown*\n• *Advice* · *Liquidity* · *Spending velocity*\n• Or log a transaction: *\"Salary 50k\"* · *\"Lunch 150\"*`;
    }

    setIsThinking(false);
    setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", content, timestamp: new Date(), data: data || { type: "advice" } }]);
  };

  const quickPrompts = [
    { label: "Monthly Summary", icon: BarChart3 },
    { label: "Health Score", icon: Activity },
    { label: "Budget Check", icon: Wallet },
    { label: "Net Worth", icon: DollarSign },
    { label: "Expense Breakdown", icon: PieChart },
    { label: "Portfolio", icon: TrendingUp },
    { label: "Advice", icon: Lightbulb },
    { label: "Velocity", icon: Gauge },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-gradient-to-br from-[#1C1B1B] via-[#161616] to-[#0E0E0E] rounded-3xl border border-border overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#A78BFA] to-[#ADC6FF] rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20 flex-shrink-0">
              <Brain size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                AI Financial Advisor
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#4EDEA3]/10 text-[#4EDEA3] text-[9px] font-black rounded-full border border-[#4EDEA3]/20">
                  <span className="w-1.5 h-1.5 bg-[#4EDEA3] rounded-full animate-pulse" />
                  LIVE
                </span>
              </h3>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Integrating Portfolio · {snapshot.assetCount} Assets · {snapshot.tradeCount} Trades · {moneyBuckets.length} Buckets · Cashflow
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Key Stats Row */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="col-span-2 sm:col-span-1 flex items-center gap-3 p-3 bg-white/[0.03] rounded-2xl border border-border">
            <HealthScoreRing score={snapshot.healthScore} />
          </div>
          {[
            {
              label: "Monthly Net",
              value: `${snapshot.monthNet >= 0 ? "+" : ""}${formatMoney(snapshot.monthNet)}`,
              color: snapshot.monthNet >= 0 ? "#4EDEA3" : "#FFB4AB",
              icon: DollarSign,
              trend: snapshot.prevMonthNet !== 0 ? (snapshot.monthNet > snapshot.prevMonthNet ? "up" : "down") : null,
            },
            {
              label: "Savings Rate",
              value: `${snapshot.savingsRate.toFixed(1)}%`,
              color: snapshot.savingsRate >= 20 ? "#4EDEA3" : snapshot.savingsRate >= 10 ? "#E9C349" : "#FFB4AB",
              icon: PieChart,
              trend: null,
            },
            {
              label: "Portfolio P/L",
              value: `${snapshot.portfolioReturn >= 0 ? "+" : ""}${snapshot.portfolioReturn.toFixed(1)}%`,
              color: snapshot.portfolioReturn >= 0 ? "#4EDEA3" : "#FFB4AB",
              icon: TrendingUp,
              trend: null,
            },
            {
              label: "Day Pace",
              value: `${snapshot.dayOfMonth}/${snapshot.daysInMonth}`,
              color: "#ADC6FF",
              icon: Clock,
              trend: null,
              subtitle: `${(snapshot.dayOfMonth / snapshot.daysInMonth * 100).toFixed(0)}% through`,
            },
          ].map(stat => (
            <div key={stat.label} className="p-3 bg-white/[0.03] rounded-2xl border border-border">
              <div className="flex items-center gap-1.5 mb-1.5">
                <stat.icon size={10} style={{ color: stat.color }} />
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">{stat.label}</span>
                {stat.trend && (
                  <span className="ml-auto">
                    {stat.trend === "up"
                      ? <ArrowUpRight size={10} className="text-[#4EDEA3]" />
                      : <ArrowDownRight size={10} className="text-[#FFB4AB]" />
                    }
                  </span>
                )}
              </div>
              <span className="text-sm font-black" style={{ color: stat.color }}>{stat.value}</span>
              {(stat as any).subtitle && (
                <p className="text-[9px] text-gray-600 mt-0.5">{(stat as any).subtitle}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            {/* Monthly Trend Chart + Expense Velocity Side by Side */}
            <div className="px-4 sm:px-5 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Monthly Trend Chart */}
              {snapshot.monthlyTrend.length > 0 && (
                <div className="bg-white/[0.03] rounded-2xl border border-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={12} className="text-[#ADC6FF]" />
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">6-Month Trend</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#4EDEA3] rounded-full" /><span className="text-[9px] text-gray-500">Income</span></div>
                      <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#FFB4AB] rounded-full" /><span className="text-[9px] text-gray-500">Expenses</span></div>
                    </div>
                  </div>
                  <MonthlyTrendChart data={snapshot.monthlyTrend} />
                </div>
              )}

              {/* Expense Velocity */}
              {snapshot.prevMonthExpenses > 0 && (
                <ExpenseVelocityWidget
                  currentMonthExpenses={snapshot.monthExpenses}
                  lastMonthExpenses={snapshot.prevMonthExpenses}
                  dayOfMonth={snapshot.dayOfMonth}
                  daysInMonth={snapshot.daysInMonth}
                />
              )}
            </div>

            {/* ASCII Bar Chart */}
            {snapshot.monthIncome > 0 && (
              <div className="px-4 sm:px-5 pt-3">
                <div className="bg-white/[0.03] rounded-2xl border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={12} className="text-[#E9C349]" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Current Month Breakdown</span>
                  </div>
                  <AsciiBarChart
                    income={snapshot.monthIncome}
                    expenses={snapshot.monthExpenses}
                    investments={snapshot.monthInvested}
                    savings={Math.max(0, snapshot.monthNet - snapshot.monthInvested)}
                  />
                </div>
              </div>
            )}

            {/* Smart Insights */}
            {insights.length > 0 && (
              <div className="px-4 sm:px-5 pt-3">
                <button onClick={() => setShowInsights(!showInsights)} className="flex items-center gap-2 w-full mb-2">
                  <Zap size={12} className="text-[#E9C349]" />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Smart Insights ({insights.length})</span>
                  <span className="ml-auto text-[9px] text-gray-600 font-bold">{showInsights ? "Hide ▲" : "Show ▼"}</span>
                </button>
                <AnimatePresence>
                  {showInsights && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-2"
                      style={{ overflow: "hidden" }}
                    >
                      {insights.map((ins, i) => <InsightCard key={i} {...ins} />)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Chat Interface */}
            <div className="px-4 sm:px-5 pt-3 pb-4">
              <div className="bg-white/[0.03] rounded-2xl border border-border overflow-hidden">
                {/* Messages */}
                <div className="h-56 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: "none" }}>
                  {messages.map(msg => (
                    <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                      {msg.role === "assistant" && (
                        <div className="w-6 h-6 bg-gradient-to-br from-[#A78BFA] to-[#ADC6FF] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Brain size={11} className="text-white" />
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[88%] rounded-2xl px-3 py-2.5 text-[11px] leading-relaxed",
                        msg.role === "user"
                          ? "bg-[#ADC6FF]/20 text-[#ADC6FF] rounded-tr-sm"
                          : "bg-white/[0.06] text-gray-300 rounded-tl-sm"
                      )}>
                        {msg.content ? (
                          <div className="whitespace-pre-wrap">
                            {msg.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                              part.startsWith("**") && part.endsWith("**")
                                ? <strong key={i} className="text-white font-black">{part.slice(2, -2)}</strong>
                                : <span key={i}>{part}</span>
                            )}
                          </div>
                        ) : msg.data?.type === "health_score" && (
                          <div className="space-y-1.5">
                            <p className="text-white font-black">👋 Financial Intelligence Hub Active</p>
                            <p className="text-gray-400">I&apos;m monitoring <strong className="text-white">{snapshot.assetCount} assets</strong>, <strong className="text-white">{snapshot.tradeCount} trades</strong>, <strong className="text-white">{moneyBuckets.length} budget buckets</strong>, and your complete cashflow in real-time.</p>
                            <p className="text-gray-400">Financial health: <strong className="text-white">{snapshot.healthScore}/100</strong>. What would you like to analyse?</p>
                            <p className="text-gray-500 text-[10px] mt-1">💡 Log transactions directly: type <strong className="text-[#ADC6FF]">&quot;Salary 50k&quot;</strong> or <strong className="text-[#ADC6FF]">&quot;Lunch 150&quot;</strong></p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isThinking && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 bg-gradient-to-br from-[#A78BFA] to-[#ADC6FF] rounded-full flex items-center justify-center flex-shrink-0">
                        <Brain size={11} className="text-white" />
                      </div>
                      <div className="bg-white/[0.06] rounded-2xl rounded-tl-sm px-3 py-2.5 flex items-center gap-1.5">
                        {[0, 0.15, 0.3].map((delay, i) => (
                          <motion.div
                            key={i}
                            className="w-1.5 h-1.5 bg-[#ADC6FF] rounded-full"
                            animate={{ y: [0, -4, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Prompts */}
                <div className="px-3 pt-2 pb-1 flex gap-1.5 flex-wrap border-t border-border">
                  {quickPrompts.map(qp => (
                    <button
                      key={qp.label}
                      onClick={() => processInput(qp.label)}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-border rounded-full text-[10px] text-gray-400 hover:text-white transition-all font-bold"
                    >
                      <qp.icon size={9} />
                      {qp.label}
                    </button>
                  ))}
                </div>

                {/* Input */}
                <div className="border-t border-border px-3 py-2">
                  <form onSubmit={e => { e.preventDefault(); processInput(input); }} className="flex gap-2 items-center">
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      placeholder={isTh ? "ถามเกี่ยวกับการเงิน หรือบันทึก เช่น 'เงินเดือน 50k'…" : "Ask about finances or log: 'Salary 50k', 'Lunch 150'…"}
                      className="flex-1 bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || isThinking}
                      className="w-7 h-7 bg-gradient-to-br from-[#A78BFA] to-[#ADC6FF] hover:opacity-90 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 flex-shrink-0"
                    >
                      {isThinking
                        ? <RefreshCcw size={11} className="text-white animate-spin" />
                        : <Send size={11} className="text-white" />
                      }
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
