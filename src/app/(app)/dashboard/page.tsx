"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import { TrendingUp, TrendingDown, Plus, ArrowRight, Briefcase, Wallet, BarChart3, Sparkles, ArrowUpRight, ArrowDownLeft, Download, Upload } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import { AddAssetModal } from "@/src/components/AddAssetModal";
import { AddCashflowModal } from "@/src/components/AddCashflowModal";
import { AnimatedNumber } from "@/src/components/AnimatedNumber";
import { Modal } from "@/src/components/Modal";
import Papa from "papaparse";
import { formatPnL, getPnLColor, formatPercent } from "@/src/lib/format";
import { calcMaxDrawdown, calcProfitFactor } from "@/src/lib/finance";
import { useRouter } from "next/navigation";

// ─── Net Worth Sparkline ──────────────────────────────────────────────────────

interface NetWorthPoint {
  date: string;
  value: number;
}

function NetWorthSparkline({ data, formatMoney, t }: { data: NetWorthPoint[]; formatMoney: (n: number) => string; t: (k: string) => string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [dims, setDims] = React.useState({ width: 800, height: 160 });

  const W = dims.width;
  const H = dims.height;
  const PAD = { top: 8, right: 16, bottom: 24, left: 50 };

  React.useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDims({ width: rect.width, height: rect.height });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const { pathD, areaD, cx, cy, yTicks, xTicks, isPositive } = useMemo(() => {
    if (data.length < 2) return { pathD: "", areaD: "", cx: () => 0, cy: () => 0, yTicks: [], xTicks: [], isPositive: true };
    const values = data.map(d => d.value);
    const minP = Math.min(...values);
    const maxP = Math.max(...values);
    const padding = (maxP - minP) * 0.1;
    const adjMin = Math.max(0, minP - padding);
    const adjMax = maxP + padding;
    const range = adjMax - adjMin || 1;
    const n = data.length;

    const cx = (i: number) => PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
    const cy = (p: number) => PAD.top + (1 - (p - adjMin) / range) * (H - PAD.top - PAD.bottom);

    const yTicks = Array.from({ length: 3 }, (_, i) => adjMin + (i / 2) * range);
    const xCount = Math.min(5, n);
    const step = Math.floor((n - 1) / (xCount - 1)) || 1;
    const xTicks = Array.from({ length: xCount }, (_, i) => {
      const idx = Math.min(i * step, n - 1);
      return { ...data[idx], index: idx };
    });

    const points = data.map((d, i) => ({ x: cx(i), y: cy(d.value) }));
    let pathD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      pathD += ` C ${cpx.toFixed(1)} ${prev.y.toFixed(1)}, ${cpx.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(H - PAD.bottom).toFixed(1)} L ${points[0].x.toFixed(1)} ${(H - PAD.bottom).toFixed(1)} Z`;
    const isPositive = data[data.length - 1].value >= data[0].value;
    return { pathD, areaD, cx, cy, yTicks, xTicks, isPositive };
  }, [data, W, H]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const chartWidth = W - PAD.left - PAD.right;
    const relX = Math.max(0, Math.min(mouseX - PAD.left, chartWidth));
    const idx = Math.round((relX / chartWidth) * (data.length - 1));
    setHoveredIndex(Math.max(0, Math.min(idx, data.length - 1)));
  }, [data.length, W]);

  const color = isPositive ? "#4EDEA3" : "#FFB4AB";
  const hov = hoveredIndex != null ? data[hoveredIndex] : null;

  if (data.length < 2) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center">
        <span className="text-gray-500 text-sm">{t("noChartData")}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={cy(v)} x2={W - PAD.right} y2={cy(v)} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
            <text x={PAD.left - 6} y={cy(v) + 3} textAnchor="end" fill="#6B7280" fontSize={9} fontWeight={500}>
              {formatMoney(v).replace(/[฿$]\s*/, '')}
            </text>
          </g>
        ))}
        {xTicks.map((d, i) => (
          <text key={i} x={cx(d.index)} y={H - 6} textAnchor="middle" fill="#6B7280" fontSize={9} fontWeight={500}>
            {d.date}
          </text>
        ))}
        <path d={areaD} fill="url(#nw-grad)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hov && hoveredIndex !== null && (
          <g>
            <line x1={cx(hoveredIndex)} y1={PAD.top} x2={cx(hoveredIndex)} y2={H - PAD.bottom} stroke="rgba(173,198,255,0.25)" strokeWidth={1} strokeDasharray="3,3" />
            <circle cx={cx(hoveredIndex)} cy={cy(hov.value)} r={5} fill={color} opacity={0.3} />
            <circle cx={cx(hoveredIndex)} cy={cy(hov.value)} r={3.5} fill={color} stroke="#0f1115" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      <AnimatePresence>
        {hov && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-1 left-1/2 -translate-x-1/2 bg-[#1e1e1e]/95 backdrop-blur-sm border border-border rounded-xl px-3 py-1.5 shadow-xl pointer-events-none z-10"
          >
            <div className="text-[10px] text-gray-400">{hov.date}</div>
            <div className="text-sm font-bold text-white">{formatMoney(hov.value)}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGE — Essential Only
// ═══════════════════════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const {
    t, formatMoney, currency, exchangeRates, trades, assets, language,
    cashActivities, moneyBuckets, bucketActivities,
    totalInvested, totalUnrealizedPL, totalRealizedPL, totalDividends,
    fetchAssetMarketData, addAsset, addTrade,
    netWorthHistory, addToast,
  } = useApp();
  const router = useRouter();
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [isAddCashflowOpen, setIsAddCashflowOpen] = useState(false);
  const [isImportCSVOpen, setIsImportCSVOpen] = useState(false);
  const [csvImportStatus, setCsvImportStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          let count = 0;
          for (const row of results.data as any[]) {
            const symbol = (row.symbol || row.Symbol || '').toUpperCase().trim();
            const shares = parseFloat(row.shares || row.Shares || row.quantity || row.Quantity || '0');
            const avgCostVal = parseFloat(row.avgCost || row.AvgCost || row.avg_cost || row.cost || '0');
            if (!symbol || shares <= 0) continue;

            try {
              const liveData = await fetchAssetMarketData(symbol);
              const livePrice = liveData?.price || avgCostVal || 0;
              const CRYPTO = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'];
              const autoAllocation = CRYPTO.includes(symbol) ? 'Alternatives'
                : (symbol.endsWith('.BK') || symbol.endsWith('.TH')) ? 'Equities'
                : 'Equities';
              addAsset({
                name: liveData?.name || row.name || row.Name || symbol,
                symbol: symbol,
                valueUSD: livePrice * shares,
                change: liveData?.changePercent || 0,
                allocation: autoAllocation,
                shares: shares,
                avgCost: avgCostVal || livePrice,
                chartData: liveData?.chartData,
              });
              addTrade({
                asset: symbol,
                type: 'BUY' as const,
                amountUSD: avgCostVal * shares,
                date: new Date().toISOString(),
                rateAtTime: exchangeRates[currency],
                currency: currency,
                shares: shares,
                pricePerUnit: avgCostVal,
              });
              count++;
            } catch (err) {
              console.error(`Failed to import ${symbol}:`, err);
            }
          }
          if (count > 0) {
            setCsvImportStatus({ type: 'success', message: `${count} ${t("csvImportedAssets") || "assets imported"}` });
            addToast(`${count} ${t("csvImportedAssets") || "assets imported"}`, 'success');
            setTimeout(() => { setIsImportCSVOpen(false); setCsvImportStatus({ type: 'idle', message: '' }); }, 1500);
          } else {
            setCsvImportStatus({ type: 'error', message: t("noValidTradesFound") || "No valid trades found" });
          }
        } catch {
          setCsvImportStatus({ type: 'error', message: t("importError") || "Import error" });
        }
      },
      error: () => {
        setCsvImportStatus({ type: 'error', message: t("importError") || "Import error" });
      }
    });
    e.target.value = '';
  };

  // ─── Derived Data ──────────────────────────────────────────────────────
  const currentNetWorth = netWorthHistory[netWorthHistory.length - 1]?.value || 0;
  const totalProfit = totalUnrealizedPL + totalRealizedPL + totalDividends;
  const initialCapital = currentNetWorth - totalProfit;
  const netWorthReturnPct = initialCapital > 0 ? (totalProfit / initialCapital) * 100 : 0;
  const activePositions = assets.filter(a => a.is_active !== false).length;
  const totalBucketValue = moneyBuckets.reduce((s, b) => s + (b.currentAmount / (exchangeRates[b.currency || 'USD'] || 1)), 0);

  const getEntryAmount = (entry: { amountUSD?: number; amount?: number }) => entry.amountUSD ?? entry.amount ?? 0;
  const formatEntryMoney = (v: number) => formatMoney(Math.abs(v));

  // Monthly cashflow
  const now2 = new Date();
  const monthKey = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}`;
  const monthIncome = cashActivities.filter(a => a.date.startsWith(monthKey) && a.type === 'INCOME').reduce((s, a) => s + getEntryAmount(a), 0);
  const monthExpense = cashActivities.filter(a => a.date.startsWith(monthKey) && (a.type === 'EXPENSE' || a.type === 'WITHDRAW') && !a.isTransfer).reduce((s, a) => s + getEntryAmount(a), 0);
  const monthNet = monthIncome - monthExpense;

  // P/L metrics
  const { grossProfit, grossLoss } = useMemo(() => {
    let gp = 0, gl = 0;
    assets.forEach(a => {
      if (a.realizedPL && a.realizedPL > 0) gp += a.realizedPL;
      if (a.realizedPL && a.realizedPL < 0) gl += Math.abs(a.realizedPL);
      const unreal = a.valueUSD - (a.avgCost || 0) * (a.shares || 0);
      if (unreal > 0) gp += unreal;
      if (unreal < 0) gl += Math.abs(unreal);
    });
    return { grossProfit: gp, grossLoss: gl };
  }, [assets]);
  const profitFactor = calcProfitFactor(grossProfit, grossLoss);
  const maxDrawdown = calcMaxDrawdown(netWorthHistory.map(h => h.value));

  // Recent activities (merged cash + bucket)
  const recentActivities = useMemo(() => {
    const merged = [
      ...cashActivities.map(a => ({ id: a.id, type: a.type, amount: getEntryAmount(a), category: a.category || '', note: a.note || '', date: a.date, source: 'cash' as const })),
      ...bucketActivities.map(a => ({
        id: a.id,
        type: (a.type === 'deposit' || a.type === 'income_split' || a.type === 'profit_split') ? 'INCOME' : 'EXPENSE',
        amount: getEntryAmount(a),
        category: a.bucketName || a.type,
        note: a.note || '',
        date: a.date,
        source: 'bucket' as const,
      })),
    ];
    return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);
  }, [cashActivities, bucketActivities]);

  // Top movers
  const topMovers = useMemo(() => {
    return [...assets].filter(a => a.is_active !== false).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 4);
  }, [assets]);

  const isEmpty = assets.length === 0 && trades.length === 0;
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12
    ? (language === 'th' ? 'สวัสดีตอนเช้า' : 'Good Morning')
    : greetingHour < 18
      ? (language === 'th' ? 'สวัสดีตอนบ่าย' : 'Good Afternoon')
      : (language === 'th' ? 'สวัสดีตอนค่ำ' : 'Good Evening');

  // ─── FAB ──────────────────────────────────────────────────────────────
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-5 pb-24 sm:pb-8">

      {/* ─── Greeting ─────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          {greeting} <span className="text-[#ADC6FF]">👋</span>
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {language === 'th' ? 'สรุปภาพรวมการเงินของคุณวันนี้' : 'Your financial overview for today'}
        </p>
      </motion.div>

      {/* ─── Empty State ──────────────────────────────────────────────── */}
      {isEmpty && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-gradient-to-br from-[#1C1B1B] to-[#141414] rounded-3xl p-8 sm:p-12 border border-border text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#ADC6FF]/5 via-transparent to-[#4EDEA3]/5" />
          <div className="relative z-10">
            <div className="w-20 h-20 rounded-3xl bg-[#ADC6FF]/10 flex items-center justify-center mx-auto mb-6">
              <Sparkles size={36} className="text-[#ADC6FF]" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{language === 'th' ? 'ยินดีต้อนรับสู่ FinTrack' : 'Welcome to FinTrack'}</h2>
            <p className="text-sm text-gray-400 max-w-md mx-auto mb-8">{language === 'th' ? 'เริ่มต้นเพิ่มสินทรัพย์แรกของคุณ' : 'Add your first asset to start tracking'}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => setIsAddAssetOpen(true)} className="px-6 py-3 rounded-2xl bg-[#ADC6FF] text-[#00285d] font-bold text-sm hover:brightness-110 transition-all flex items-center justify-center gap-2">
                <Plus size={18} /> {language === 'th' ? 'เพิ่มสินทรัพย์แรก' : 'Add First Asset'}
              </button>
              <button onClick={() => router.push('/ledger')} className="px-6 py-3 rounded-2xl bg-white/5 text-white font-bold text-sm hover:bg-white/10 transition-all flex items-center justify-center gap-2 border border-border">
                {language === 'th' ? 'จดรายรับรายจ่าย' : 'Record Transaction'}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Quick Stats (4 cards) ─────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: language === 'th' ? 'สินทรัพย์' : 'Assets', value: activePositions.toString(), icon: <Briefcase size={16} />, color: '#ADC6FF', onClick: () => router.push('/portfolio') },
          { label: language === 'th' ? 'กำไร/ขาดทุน' : "P/L", value: `${totalUnrealizedPL >= 0 ? '+' : ''}${formatMoney(totalUnrealizedPL)}`, icon: <BarChart3 size={16} />, color: totalUnrealizedPL >= 0 ? '#4EDEA3' : '#FFB4AB', onClick: () => router.push('/portfolio') },
          { label: language === 'th' ? 'เงินในกระเป๋า' : 'Buckets', value: formatMoney(totalBucketValue), icon: <Wallet size={16} />, color: '#E9C349', onClick: () => router.push('/budget') },
          { label: language === 'th' ? 'เดือนนี้' : 'This Month', value: `${monthNet >= 0 ? '+' : ''}${formatEntryMoney(monthNet)}`, icon: <TrendingUp size={16} />, color: monthNet >= 0 ? '#4EDEA3' : '#FFB4AB', onClick: () => router.push('/cashflow') },
        ].map((stat, i) => (
          <motion.button key={i} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={stat.onClick}
            className="bg-surface/50 backdrop-blur-xl rounded-2xl p-4 border border-border text-left hover:border-white/10 transition-all group">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>{stat.icon}</div>
            </div>
            <div className="text-lg font-bold text-white tracking-tight truncate">{stat.value}</div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{stat.label}</div>
          </motion.button>
        ))}
      </motion.div>

      {/* ─── Net Worth Hero + Chart ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-surface/50 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 relative overflow-hidden border border-border shadow-xl"
      >
        <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4 relative z-10">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("totalNetWorth")}</span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tighter text-white leading-none">
              <AnimatedNumber value={currentNetWorth} formatter={(v) => formatMoney(v)} />
            </h1>
            <div className="flex items-center gap-2">
              <div className={cn("flex items-center gap-1", getPnLColor(netWorthReturnPct))}>
                {netWorthReturnPct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                <span className="text-xs sm:text-sm font-bold">{formatPercent(netWorthReturnPct, 1)}</span>
              </div>
              <span className="text-gray-500 text-[10px] font-medium uppercase">
                Rate: 1 USD = {exchangeRates[currency]} {currency}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsAddAssetOpen(true)}
              className="px-4 py-2 bg-white/5 text-[#ADC6FF] border border-[#ADC6FF]/30 rounded-xl font-black text-xs flex items-center gap-1.5 hover:bg-[#ADC6FF]/10 transition-all"
            >
              <Plus size={14} /> {t("addAsset") || "Add Asset"}
            </button>
            <button
              onClick={() => router.push('/terminal')}
              className="px-4 py-2 bg-[#4EDEA3]/10 text-[#4EDEA3] border border-[#4EDEA3]/30 rounded-xl font-black text-xs flex items-center gap-1.5 hover:bg-[#4EDEA3]/20 transition-all"
            >
              <TrendingUp size={14} /> {t("trade") || "Trade"}
            </button>
            <button
              onClick={() => router.push('/budget')}
              className="px-4 py-2 bg-[#E9C349]/10 text-[#E9C349] border border-[#E9C349]/30 rounded-xl font-black text-xs flex items-center gap-1.5 hover:bg-[#E9C349]/20 transition-all"
            >
              <Wallet size={14} /> {t("distribute") || "Distribute"}
            </button>
            <button
              onClick={() => setIsImportCSVOpen(true)}
              className="px-4 py-2 bg-white/5 text-gray-300 border border-border rounded-xl font-black text-xs flex items-center gap-1.5 hover:bg-white/10 transition-all"
            >
              <Download size={14} /> {t("importCsv") || "Import CSV"}
            </button>
          </div>
        </div>
        <div className="h-40 sm:h-44 min-w-0" style={{ minHeight: 160 }}>
          <NetWorthSparkline data={netWorthHistory} formatMoney={formatMoney} t={t} />
        </div>
      </motion.div>

      {/* ─── Main Grid: P/L Metrics + Cashflow + Top Movers ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* P/L Summary (compact 6 metrics) */}
        <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: t("totalInvested"), value: formatMoney(totalInvested), color: '#ADC6FF' },
            { label: t("unrealizedPL"), value: formatPnL(totalUnrealizedPL, formatMoney), color: totalUnrealizedPL >= 0 ? '#4EDEA3' : '#FFB4AB' },
            { label: t("realizedPL"), value: formatPnL(totalRealizedPL, formatMoney), color: totalRealizedPL >= 0 ? '#4EDEA3' : '#FFB4AB' },
            { label: t("dividends"), value: formatMoney(totalDividends), color: '#E9C349' },
            { label: 'Max DD', value: `-${maxDrawdown.toFixed(1)}%`, color: '#FFB4AB' },
            { label: 'PF', value: profitFactor === Number.POSITIVE_INFINITY ? '∞' : profitFactor.toFixed(2), color: profitFactor >= 1.5 ? '#4EDEA3' : '#9CA3AF' },
          ].map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.03 }}
              className="bg-surface/50 p-3 sm:p-4 rounded-2xl border border-border">
              <p className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: m.color }}>{m.label}</p>
              <h3 className="text-sm sm:text-lg font-bold text-white tracking-tight truncate">{m.value}</h3>
            </motion.div>
          ))}
        </div>

        {/* Cashflow + Recent */}
        <div className="lg:col-span-4 bg-surface/50 rounded-2xl border border-border p-4 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className="text-[10px] text-[#ADC6FF] uppercase tracking-wide font-bold">{t("cashflowOverview")}</span>
              <h3 className="text-sm font-bold text-white">{t("netCashflow")}</h3>
            </div>
            <button onClick={() => setIsAddCashflowOpen(true)}
              className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
              <Plus size={12} className="text-[#ADC6FF]" />
            </button>
          </div>

          <h2 className={cn("text-2xl font-bold tracking-tight mb-3", monthNet >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
            {monthNet >= 0 ? "+" : "-"}{formatEntryMoney(monthNet)}
          </h2>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-[#4EDEA3]" />
              <span className="text-[10px] text-gray-400 font-bold">{t("income")}</span>
              <span className="text-xs text-white font-bold ml-auto">{formatEntryMoney(monthIncome)}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-[#FFB4AB]" />
              <span className="text-[10px] text-gray-400 font-bold">{t("expense")}</span>
              <span className="text-xs text-white font-bold ml-auto">{formatEntryMoney(monthExpense)}</span>
            </div>
          </div>

          {/* Recent Activities */}
          <div className="flex-1 space-y-1.5 overflow-y-auto">
            {recentActivities.map((act, idx) => {
              const isIncome = act.type === 'INCOME';
              return (
                <div key={`${act.id}-${idx}`} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn("w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0",
                      isIncome ? "bg-[#4EDEA3]/10" : "bg-[#FFB4AB]/10"
                    )}>
                      {isIncome ? <ArrowDownLeft size={10} className="text-[#4EDEA3]" /> : <ArrowUpRight size={10} className="text-[#FFB4AB]" />}
                    </div>
                    <span className="text-white font-bold truncate">{act.category}</span>
                  </div>
                  <span className={cn("font-bold flex-shrink-0 ml-2", isIncome ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {isIncome ? "+" : "-"}{formatEntryMoney(act.amount)}
                  </span>
                </div>
              );
            })}
          </div>

          <button onClick={() => router.push('/ledger')}
            className="w-full mt-3 py-2 rounded-xl border border-border text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:bg-white/5 transition-all text-center">
            {language === 'th' ? 'ดูทั้งหมด' : 'View All'} →
          </button>
        </div>

        {/* Top Movers */}
        <div className="lg:col-span-3 bg-surface/50 rounded-2xl border border-border p-4 flex flex-col">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide font-bold mb-3">Top Movers</span>
          <div className="space-y-2 flex-1">
            {topMovers.length === 0 && (
              <div className="flex-1 flex items-center justify-center py-8 text-gray-600 text-xs">No active assets</div>
            )}
            {topMovers.map(a => (
              <button key={a.symbol} onClick={() => router.push(`/portfolio`)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] transition-all border border-transparent hover:border-border">
                <div>
                  <span className="text-xs font-bold text-white block">{a.symbol}</span>
                  <span className="text-[9px] text-gray-500 truncate block">{a.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-white block">{formatMoney(a.valueUSD)}</span>
                  <span className={cn("text-[10px] font-bold", a.change >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {a.change >= 0 ? '+' : ''}{a.change.toFixed(2)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => router.push('/portfolio')}
            className="w-full mt-3 py-2 rounded-xl border border-border text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:bg-white/5 transition-all text-center">
            {t("portfolio")} →
          </button>
        </div>
      </div>

      {/* ─── FAB ──────────────────────────────────────────────────── */}
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col gap-2 items-end"
            >
              {[
                { label: language === 'th' ? 'บันทึกรายได้' : 'Log Income', bg: '#4EDEA3', icon: '💰', onClick: () => { setIsAddCashflowOpen(true); setFabOpen(false); } },
                { label: language === 'th' ? 'บันทึกรายจ่าย' : 'Log Expense', bg: '#FFB4AB', icon: '💸', onClick: () => { setIsAddCashflowOpen(true); setFabOpen(false); } },
                { label: language === 'th' ? 'เพิ่มสินทรัพย์' : 'Add Asset', bg: '#ADC6FF', icon: '📈', onClick: () => { setIsAddAssetOpen(true); setFabOpen(false); } },
                { label: language === 'th' ? 'เทรด' : 'Trade', bg: '#E9C349', icon: '⚡', onClick: () => { router.push('/terminal'); setFabOpen(false); } },
              ].map((action, i) => (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={action.onClick}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-xl text-[#0E0E0E] text-xs font-bold tracking-wide hover:brightness-110 active:scale-95 transition-all"
                  style={{ backgroundColor: action.bg }}
                >
                  <span>{action.icon}</span>
                  <span>{action.label}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          onClick={() => setFabOpen(v => !v)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          className="w-14 h-14 rounded-full bg-[#ADC6FF] text-[#00285d] shadow-2xl shadow-[#ADC6FF]/30 flex items-center justify-center transition-all"
        >
          <motion.span animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ duration: 0.2 }} className="text-2xl font-bold leading-none">
            +
          </motion.span>
        </motion.button>
      </div>

      {/* ─── Modals ──────────────────────────────────────────────── */}
      <AddAssetModal isOpen={isAddAssetOpen} onClose={() => setIsAddAssetOpen(false)} />
            <AddCashflowModal isOpen={isAddCashflowOpen} onClose={() => setIsAddCashflowOpen(false)} />

      {/* CSV Import Modal */}
      <Modal isOpen={isImportCSVOpen} onClose={() => { setIsImportCSVOpen(false); setCsvImportStatus({ type: 'idle', message: '' }); }} title={t("importCsvPortfolio") || "Import CSV"}>
        <div className="space-y-6">
          <div className="p-4 bg-white/5 rounded-2xl border border-border">
            <p className="text-xs text-gray-400 font-medium mb-3">{t("csvImportInstructions") || "Format: symbol,shares,avgCost"}</p>
            <div className="bg-background p-3 rounded-xl font-mono text-[11px] text-gray-500 leading-relaxed">
              symbol,shares,avgCost<br/>
              AAPL,10,150.00<br/>
              BTC,0.5,42000.00<br/>
              PTT.BK,100,35.50
            </div>
          </div>

          <label className="flex flex-col items-center justify-center gap-3 py-8 border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-[#ADC6FF]/30 hover:bg-white/5 transition-all group">
            <Upload size={28} className="text-gray-600 group-hover:text-[#ADC6FF] transition-colors" />
            <span className="text-sm font-bold text-gray-500 group-hover:text-white transition-colors">
              {t("selectFile") || "Select File"}
            </span>
            <span className="text-[10px] text-gray-600">.csv</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
          </label>

          {csvImportStatus.type !== 'idle' && (
            <div className={cn(
              "px-4 py-3 rounded-xl text-xs font-bold",
              csvImportStatus.type === 'success' ? 'bg-[#4EDEA3]/10 text-[#4EDEA3] border border-[#4EDEA3]/20' : 'bg-[#FFB4AB]/10 text-[#FFB4AB] border border-[#FFB4AB]/20'
            )}>
              {csvImportStatus.message}
            </div>
          )}

          <button
            onClick={() => { setIsImportCSVOpen(false); setCsvImportStatus({ type: 'idle', message: '' }); }}
            className="w-full py-4 bg-white/5 border border-border text-white rounded-full font-black text-sm uppercase tracking-tight hover:bg-white/10 transition-all"
          >
            {t("close") || "Close"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
