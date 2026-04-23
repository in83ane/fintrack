"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import { TrendingUp, PlusCircle, MinusCircle, ArrowRight, Edit3, Info, History, Plus, Download, FileText, CheckCircle2, Trash2, Pencil, ArrowDownToLine, ArrowUpFromLine, PiggyBank } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import { Modal } from "@/src/components/Modal";
import { AddAssetModal } from "@/src/components/AddAssetModal";
import { AddCashflowModal } from "@/src/components/AddCashflowModal";
import Papa from "papaparse";

interface NetWorthPoint {
  date: string;
  value: number;
}

interface DashboardChartProps {
  data: NetWorthPoint[];
  currency: string;
  exchangeRates: Record<string, number>;
  formatMoney: (amount: number, originalCurrency?: any, originalRate?: number) => string;
  t: (key: string) => string;
}

function DashboardChart({ data, currency, exchangeRates, formatMoney, t }: DashboardChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 192 });

  const W = dimensions.width;
  const H = dimensions.height;
  const PAD = { top: 10, right: 20, bottom: 30, left: 60 };

  React.useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const { minP, maxP, yTicks, pathD, areaD, cx, cy, xTicks, isPositive } = useMemo(() => {
    if (data.length < 2) return { minP: 0, maxP: 0, yTicks: [], pathD: "", areaD: "", cx: () => 0, cy: () => 0, xTicks: [], isPositive: true };

    const values = data.map(d => d.value);
    const minP = Math.min(...values);
    const maxP = Math.max(...values);
    const paddingP = (maxP - minP) * 0.1;
    const adjustedMinP = Math.max(0, minP - paddingP);
    const adjustedMaxP = maxP + paddingP;
    const rangeP = adjustedMaxP - adjustedMinP || 1;

    const dataCount = data.length;
    const cx = (index: number) => PAD.left + (index / (dataCount - 1)) * (W - PAD.left - PAD.right);
    const cy = (p: number) => PAD.top + (1 - (p - adjustedMinP) / rangeP) * (H - PAD.top - PAD.bottom);

    // Y-axis ticks
    const yTickCount = 4;
    const yTicks = Array.from({ length: yTickCount }, (_, i) => adjustedMinP + (i / (yTickCount - 1)) * rangeP);

    // X-axis ticks
    const xTickCount = Math.min(6, dataCount);
    const indexStep = Math.floor((dataCount - 1) / (xTickCount - 1)) || 1;
    const xTicks = Array.from({ length: xTickCount }, (_, i) => {
      const index = Math.min(i * indexStep, dataCount - 1);
      return { ...data[index], index };
    });

    // Smooth line path
    const points = data.map((d, i) => ({ x: cx(i), y: cy(d.value), i }));
    let pathD = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      let cp1x, cp1y, cp2x, cp2y;

      if (i === 1) {
        cp1x = prev.x + (curr.x - prev.x) * 0.3;
        cp1y = prev.y;
      } else {
        const prev2 = points[i - 2];
        cp1x = prev.x + (curr.x - prev2.x) * 0.15;
        cp1y = prev.y + (curr.y - prev2.y) * 0.15;
      }

      if (i === points.length - 1) {
        cp2x = curr.x - (curr.x - prev.x) * 0.3;
        cp2y = curr.y;
      } else {
        cp2x = curr.x - (next.x - prev.x) * 0.15;
        cp2y = curr.y - (next.y - prev.y) * 0.15;
      }

      pathD += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
    }

    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(2)} ${(H - PAD.bottom).toFixed(2)} L ${points[0].x.toFixed(2)} ${(H - PAD.bottom).toFixed(2)} Z`;

    const isPositive = data[data.length - 1].value >= data[0].value;

    return { minP, maxP, yTicks, pathD, areaD, cx, cy, xTicks, isPositive };
  }, [data, W, H]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;

    const chartWidth = W - PAD.left - PAD.right;
    const relativeX = Math.max(0, Math.min(mouseX - PAD.left, chartWidth));
    const indexFloat = (relativeX / chartWidth) * (data.length - 1);
    const closest = Math.round(Math.max(0, Math.min(indexFloat, data.length - 1)));

    setHoveredIndex(closest);
  }, [data.length, W]);

  const strokeColor = isPositive ? "#4EDEA3" : "#FFB4AB";
  const fillGradientId = `dashboard-gradient-${isPositive ? "pos" : "neg"}`;

  if (data.length < 2) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center">
        <span className="text-gray-500 text-sm">{t("noChartData")}</span>
      </div>
    );
  }

  const hov = hoveredIndex != null ? data[hoveredIndex] : null;

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
          <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.4} />
            <stop offset="50%" stopColor={strokeColor} stopOpacity={0.1} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
          <filter id="dashboard-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <line
            key={`grid-${i}`}
            x1={PAD.left}
            y1={cy(v)}
            x2={W - PAD.right}
            y2={cy(v)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
            strokeDasharray={i === 0 || i === yTicks.length - 1 ? "0" : "4,4"}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((v, i) => (
          <text
            key={`y-${i}`}
            x={PAD.left - 8}
            y={cy(v) + 4}
            textAnchor="end"
            fill="#6B7280"
            fontSize={10}
            fontWeight={500}
          >
            {formatMoney(v).replace(/[฿$]\s*/, '')}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((d, i) => (
          <text
            key={`x-${i}`}
            x={cx(d.index)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fill="#6B7280"
            fontSize={10}
            fontWeight={500}
          >
            {d.date}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaD} fill={`url(#${fillGradientId})`} />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#dashboard-glow)"
        />

        {/* Hover crosshair */}
        <AnimatePresence>
          {hov && hoveredIndex !== null && (
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <line
                x1={cx(hoveredIndex)}
                y1={PAD.top}
                x2={cx(hoveredIndex)}
                y2={H - PAD.bottom}
                stroke="rgba(173, 198, 255, 0.3)"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
              <line
                x1={PAD.left}
                y1={cy(hov.value)}
                x2={W - PAD.right}
                y2={cy(hov.value)}
                stroke="rgba(173, 198, 255, 0.2)"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
              <circle
                cx={cx(hoveredIndex)}
                cy={cy(hov.value)}
                r={6}
                fill={strokeColor}
                opacity={0.3}
              />
              <circle
                cx={cx(hoveredIndex)}
                cy={cy(hov.value)}
                r={4}
                fill={strokeColor}
                stroke="#1C1B1B"
                strokeWidth={2}
              />
            </motion.g>
          )}
        </AnimatePresence>
      </svg>

      {/* Floating tooltip */}
      <AnimatePresence>
        {hov && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#2A2A2A]/95 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-1.5 shadow-2xl pointer-events-none z-10"
          >
            <div className="text-xs text-gray-400 mb-0.5">{hov.date}</div>
            <div className="text-sm font-bold text-white">
              {formatMoney(hov.value)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper to translate asset class labels
const assetClassKeyMap: Record<string, string> = {
  Equities: "equities",
  "Fixed Income": "fixedIncome",
  Alternatives: "alternatives",
  Cash: "cash",
};

export default function DashboardPage() {
  const { t, formatMoney, currency, exchangeRates, trades, addTrade, bulkAddTrades, allocations, updateAllocation, netWorthHistory, assets, addToast, addNotification, language, cashActivities, moneyBuckets } = useApp();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isCSVModalOpen, setIsCSVModalOpen] = React.useState(false);
  const [isAddAssetOpen, setIsAddAssetOpen] = React.useState(false);
  const [isAllocEditOpen, setIsAllocEditOpen] = React.useState(false);
  const [isAddCashflowOpen, setIsAddCashflowOpen] = React.useState(false);
  const [editAllocValues, setEditAllocValues] = React.useState<Record<string, number>>({});

  const translateLabel = (label: string) => {
    const key = assetClassKeyMap[label];
    return key ? t(key) : label;
  };
  const [newTrade, setNewTrade] = React.useState<{ asset: string; amountUSD: string; type: "BUY" | "SELL" }>({ asset: "", amountUSD: "", type: "BUY" });
  const [importStatus, setImportStatus] = React.useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrade.asset || !newTrade.amountUSD) return;

    addTrade({
      asset: newTrade.asset.toUpperCase(),
      type: newTrade.type,
      amountUSD: parseFloat(newTrade.amountUSD),
      date: new Date().toISOString().split("T")[0],
      rateAtTime: exchangeRates[currency],
      currency: currency,
    });

    setNewTrade({ asset: "", amountUSD: "", type: "BUY" });
    setIsModalOpen(false);
  };

  // Automated Rebalancing Engine Logic
  const totalPortfolioUSD = useMemo(() => assets.reduce((acc, a) => acc + a.valueUSD, 0), [assets]);

  const driftData = useMemo(() => {
    return allocations.map(item => {
      const categoryAssets = assets.filter(a => (a.allocation || "Other") === item.label);
      const categoryUSD = categoryAssets.reduce((acc, a) => acc + a.valueUSD, 0);
      const currentPct = totalPortfolioUSD > 0 ? (categoryUSD / totalPortfolioUSD) * 100 : 0;
      const targetPct = item.value;
      const delta = currentPct - targetPct;
      
      return {
        ...item,
        currentPct,
        targetPct,
        delta,
        categoryUSD,
        targetUSD: totalPortfolioUSD * (targetPct / 100),
        assets: categoryAssets
      };
    });
  }, [allocations, assets, totalPortfolioUSD]);

  const { suggestedTrades, totalImpact } = useMemo(() => {
    const trades: any[] = [];
    let impact = 0;

    driftData.forEach(d => {
      // Suggest trades if drift is > 2% absolute
      if (Math.abs(d.delta) > 2) {
        const diffUSD = Math.abs(d.categoryUSD - d.targetUSD);
        impact += diffUSD;
        
        let assetName = d.label;
        if (d.assets.length > 0) {
          const largestAsset = [...d.assets].sort((a,b) => b.valueUSD - a.valueUSD)[0];
          assetName = largestAsset.symbol;
        }

        trades.push({
           id: d.label,
           rawType: d.delta > 0 ? "SELL" : "BUY",
           type: d.delta > 0 ? t("sell") : t("buy"),
           asset: assetName,
           diffUSD: diffUSD,
           desc: d.delta > 0 ? t("reduceOverExposure") : t("increaseAllocation"),
           icon: d.delta > 0 ? MinusCircle : PlusCircle,
           color: d.delta > 0 ? "#FFB4AB" : "#4EDEA3"
        });
      }
    });
    
    return { suggestedTrades: trades, totalImpact: impact };
  }, [driftData, t]);

  const executeAllSuggestedTrades = () => {
    if (suggestedTrades.length === 0) return;
    
    const newTrades = suggestedTrades.map(trade => ({
      asset: trade.asset.toUpperCase(),
      type: trade.rawType as "BUY" | "SELL",
      amountUSD: trade.diffUSD,
      date: new Date().toISOString().split("T")[0],
      rateAtTime: exchangeRates[currency],
      currency: currency,
    }));

    bulkAddTrades(newTrades);
    addToast(t("importSuccess"), 'success');
    addNotification(
      t("executeAll"),
      `${suggestedTrades.length} ${t("tradesExecuted")} — ${formatMoney(totalImpact)}`,
      'trade'
    );
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const parsedTrades = results.data.map((row: any) => ({
            asset: (row.asset || row.Asset || "").toUpperCase(),
            type: (row.type || row.Type || "BUY").toUpperCase() as "BUY" | "SELL",
            amountUSD: parseFloat(row.amountUSD || row.AmountUSD || row.amount || "0"),
            date: row.date || row.Date || new Date().toISOString().split("T")[0],
            rateAtTime: parseFloat(row.rateAtTime || row.RateAtTime || exchangeRates[currency].toString()),
            currency: row.currency || row.Currency || currency,
          })).filter(t => t.asset && t.amountUSD > 0);

          if (parsedTrades.length > 0) {
            bulkAddTrades(parsedTrades);
            setImportStatus({ type: 'success', message: t("importSuccess") });
            setTimeout(() => {
              setIsCSVModalOpen(false);
              setImportStatus({ type: 'idle', message: '' });
            }, 600);
          } else {
            setImportStatus({ type: 'error', message: "No valid trades found in CSV." });
          }
        } catch (err) {
          setImportStatus({ type: 'error', message: "Error parsing CSV format." });
        }
      },
      error: () => {
        setImportStatus({ type: 'error', message: "Failed to read file." });
      }
    });
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Hero Section: Net Worth & Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-8 bg-[#1C1B1B] rounded-3xl p-8 relative overflow-hidden group shadow-xl border border-white/5"
        >
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div className="space-y-1">
              <span className="text-sm font-bold text-gray-400 uppercase tracking-wide">{t("totalNetWorth")}</span>
              <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-white leading-none">
                {formatMoney(netWorthHistory[netWorthHistory.length - 1].value)}
              </h1>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-[#4EDEA3]">
                  <TrendingUp size={14} />
                  <span className="text-sm font-bold">+14.2%</span>
                </div>
                <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">
                  Rate: 1 USD = {exchangeRates[currency]} {currency}
                </span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setIsAddAssetOpen(true)}
                className="px-4 py-3 bg-[#ADC6FF] text-[#00285d] rounded-2xl font-black text-xs tracking-tight flex items-center gap-2 hover:brightness-110 transition-all"
              >
                <Plus size={16} />
                {t("addAsset")}
              </button>
              <button 
                onClick={() => setIsCSVModalOpen(true)}
                className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-400 hover:text-white transition-all"
                title={t("importCsv")}
              >
                <Download size={20} />
              </button>
            </div>
          </div>

          {/* Dashboard Chart */}
          <div className="h-48 mt-4 min-w-0" style={{ minHeight: 192 }}>
            <DashboardChart
              data={netWorthHistory}
              currency={currency}
              exchangeRates={exchangeRates}
              formatMoney={formatMoney}
              t={t}
            />
          </div>
        </motion.div>

        {/* Top Movers / Quick Actions */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-4">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-base font-bold tracking-tight text-white">{t("quickActions")}</h2>
            <span className="text-xs font-black text-[#4EDEA3] uppercase tracking-wide">FinTrack OS</span>
          </div>
          
          <div className="space-y-3 flex-1">
            <motion.button 
              whileHover={{ x: 5 }}
              onClick={() => setIsModalOpen(true)}
              className="w-full p-5 bg-[#1C1B1B] border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/5 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#ADC6FF]/10 flex items-center justify-center text-[#ADC6FF]">
                  <Plus size={20} />
                </div>
                <div className="text-left">
                  <h4 className="font-black text-sm text-white leading-tight">{t("addTrade")}</h4>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{t("manualEntry")}</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-gray-600 group-hover:text-[#ADC6FF] transition-colors" />
            </motion.button>

            <motion.button 
              whileHover={{ x: 5 }}
              onClick={() => setIsCSVModalOpen(true)}
              className="w-full p-5 bg-[#1C1B1B] border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/5 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#E9C349]/10 flex items-center justify-center text-[#E9C349]">
                  <Download size={20} />
                </div>
                <div className="text-left">
                  <h4 className="font-black text-sm text-white leading-tight">{t("importCsv")}</h4>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{t("bulkImport")}</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-gray-600 group-hover:text-[#ADC6FF] transition-colors" />
            </motion.button>
          </div>

          <button className="w-full py-3.5 bg-gradient-to-r from-[#ADC6FF] to-[#4D8EFF] text-[#00285d] rounded-full font-black text-xs tracking-tight shadow-[0_10px_30px_rgba(173,198,255,0.2)]">
            {t("calculate")}
          </button>
        </div>
      </section>

      {/* Draggable Widgets Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Performance Chart Widget */}
        <div className="lg:col-span-2 bg-[#1C1B1B] rounded-3xl p-6 relative group shadow-lg border border-white/5">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="text-xs text-[#E9C349] uppercase tracking-wide font-black">{t("globalPerformance")}</span>
              <h3 className="text-lg font-bold text-white">{t("growthVelocity")}</h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
              <Edit3 size={14} className="text-gray-400" />
            </div>
          </div>
          <div className="w-full h-48 relative mt-4 min-w-0" style={{ minHeight: 192 }}>
            <DashboardChart
              data={netWorthHistory}
              currency={currency}
              exchangeRates={exchangeRates}
              formatMoney={formatMoney}
              t={t}
            />
          </div>
          <div className="flex justify-between mt-6 text-gray-500 text-xs font-black uppercase tracking-wide">
            <span>{t("chartMonthJan")}</span><span>{t("chartMonthFeb")}</span><span>{t("chartMonthMar")}</span><span>{t("chartMonthApr")}</span><span>{t("chartMonthMay")}</span><span>{t("chartMonthJun")}</span>
          </div>
        </div>

        {/* Vault Activity Widget */}
        <div className="bg-[#1C1B1B] rounded-3xl p-6 group relative overflow-hidden border border-white/5 shadow-lg">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="text-xs text-[#E9C349] uppercase tracking-wide font-black">{t("securityLogs")}</span>
              <h3 className="text-lg font-bold text-white">{t("vaultActivity")}</h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
              <Edit3 size={14} className="text-gray-400" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-1 bg-[#4EDEA3] rounded-full"></div>
              <div>
                <p className="text-xs font-bold text-white leading-tight">{t("stakeRewardClaimed")}</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide">{t("stakeRewardTime")}</p>
                <p className="text-xs text-[#4EDEA3] font-black mt-1">+0.42 ETH</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-1 bg-[#ADC6FF] rounded-full"></div>
              <div>
                <p className="text-xs font-bold text-white leading-tight">{t("btcLimitOrderFill")}</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide">{t("btcLimitOrderTime")}</p>
                <p className="text-xs text-[#ADC6FF] font-black mt-1">{t("executed")} $63,400</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-1 bg-[#E9C349] rounded-full"></div>
              <div>
                <p className="text-xs font-bold text-white leading-tight">{t("tierBonus")}</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide">{t("tierBonusTime")}</p>
                <p className="text-xs text-[#E9C349] font-black mt-1">2,500 SVN Points</p>
              </div>
            </div>
          </div>
          <button className="w-full mt-8 py-2.5 rounded-xl border border-white/10 text-xs font-black uppercase tracking-wide text-gray-400 hover:bg-white/5 transition-all">
            {t("viewFullAudit")}
          </button>
        </div>

        {/* Cashflow Widget */}
        <div className="bg-[#1C1B1B] rounded-3xl p-6 relative overflow-hidden border border-white/5 shadow-lg group flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-xs text-[#ADC6FF] uppercase tracking-wide font-black">{t("cashflowOverview")}</span>
                <h3 className="text-lg font-bold text-white">{t("netCashflow")}</h3>
              </div>
              <button onClick={() => setIsAddCashflowOpen(true)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                <PlusCircle size={14} className="text-[#ADC6FF]" />
              </button>
            </div>
            
            {(() => {
              const currentMonth = new Date().getMonth();
              const currentYear = new Date().getFullYear();
              const thisMonthActivities = cashActivities.filter(a => {
                const date = new Date(a.date);
                return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
              });
              const totalIncome = thisMonthActivities.filter(a => a.type === "INCOME").reduce((sum, a) => sum + a.amountUSD, 0);
              const totalExpenses = thisMonthActivities.filter(a => a.type === "EXPENSE").reduce((sum, a) => sum + a.amountUSD, 0);
              const net = totalIncome - totalExpenses;

              return (
                <div className="space-y-4">
                  <h2 className={cn("text-3xl font-black tracking-tighter mb-4", net >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {net >= 0 ? "+" : "-"}{formatMoney(Math.abs(net))}
                  </h2>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center bg-white/5 p-3 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#4EDEA3]" />
                        <span className="text-xs text-gray-400 font-bold">{t("income")}</span>
                      </div>
                      <span className="text-sm text-white font-black">{formatMoney(totalIncome)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-white/5 p-3 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#FFB4AB]" />
                        <span className="text-xs text-gray-400 font-bold">{t("expense")}</span>
                      </div>
                      <span className="text-sm text-white font-black">{formatMoney(totalExpenses)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column: Target Allocation */}
        <section className="md:col-span-4 space-y-6">
          <div className="bg-[#1C1B1B] p-6 rounded-3xl border border-white/5 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-base font-bold text-white">{t("targetAllocation")}</h3>
              <Edit3 size={16} className="text-gray-500 cursor-pointer hover:text-white transition-colors" onClick={() => {
                const vals: Record<string, number> = {};
                allocations.forEach(a => { vals[a.label] = a.value; });
                setEditAllocValues(vals);
                setIsAllocEditOpen(true);
              }} />
            </div>
            
            <div className="space-y-4">
              {allocations.map(item => (
                <AllocationItem key={item.label} label={translateLabel(item.label)} value={item.value} color={item.color} />
              ))}
            </div>

            <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-sm text-gray-400 leading-relaxed font-medium">
                {t("optimalRebalancingMsg")}
              </p>
            </div>
          </div>

          {/* Insight Card */}
          <div className="relative overflow-hidden rounded-3xl h-48 bg-[#1C1B1B] p-8 flex flex-col justify-end group border border-white/5">
            <div 
              className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-500 bg-cover bg-center" 
              style={{ backgroundImage: "url('https://picsum.photos/seed/market/600/400')" }}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Info size={12} className="text-[#E9C349]" />
                <span className="text-xs font-black uppercase text-[#E9C349] tracking-wide">{t("insights")}</span>
              </div>
              <h4 className="text-white font-bold leading-tight">
                {t("marketVolatilityMsg")}
              </h4>
            </div>
          </div>
        </section>

        {/* Right Column: Drift Table & Suggested Trades */}
        <section className="md:col-span-8 space-y-6">
          <div className="bg-[#1C1B1B] rounded-3xl border border-white/5 overflow-hidden shadow-xl">
            <div className="p-6 pb-2">
              <h3 className="text-base font-bold text-white">{t("currentVsTarget")}</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-wide text-gray-500 border-b border-white/5">
                    <th className="px-6 py-3">{t("assetClass")}</th>
                    <th className="px-6 py-3">{t("current")}</th>
                    <th className="px-6 py-3">{t("target")}</th>
                    <th className="px-6 py-3 text-right">{t("delta")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {driftData.map(item => (
                      <DriftRow 
                        key={item.label}
                        label={translateLabel(item.label)} 
                        current={`${item.currentPct.toFixed(1)}%`} 
                        target={`${Number(item.targetPct).toFixed(1)}%`} 
                        delta={`${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}%`} 
                        type={Math.abs(item.delta) > 2 ? "negative" : "positive"} 
                        color={item.color} 
                      />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Suggested Trades */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wide text-gray-500 mb-6">{t("suggestedTrades")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {suggestedTrades.length > 0 ? (
                <>
                  {suggestedTrades.map(trade => (
                    <TradeCard 
                      key={trade.id}
                      type={trade.type} 
                      asset={trade.asset} 
                      desc={`${trade.desc} ${formatMoney(trade.diffUSD)}`} 
                      icon={trade.icon} 
                      color={trade.color} 
                    />
                  ))}
                  
                  <div className="bg-[#ADC6FF]/5 p-6 rounded-3xl border border-[#ADC6FF]/20 flex flex-col justify-center">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xs font-black text-[#ADC6FF] uppercase tracking-wide">{t("totalImpact")}</span>
                      <span className="text-xl font-black text-white">{formatMoney(totalImpact)}</span>
                    </div>
                    <button 
                      onClick={executeAllSuggestedTrades}
                      className="w-full py-3 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-xs uppercase tracking-wide hover:brightness-110 transition-all active:scale-95"
                    >
                      {t("executeAll")}
                    </button>
                  </div>
                </>
              ) : (
                <div className="col-span-1 sm:col-span-2 py-10 bg-[#1C1B1B] rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                  <CheckCircle2 size={32} className="text-[#4EDEA3] mb-3 opacity-60" />
                  <span className="text-sm font-bold text-gray-400">
                    {t("portfolioBalanced")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Money Buckets Quick Link */}
      <section>
        <a href="/budget" className="block">
          <motion.div 
            whileHover={{ x: 5 }}
            className="bg-[#1C1B1B] rounded-3xl border border-white/5 p-6 flex items-center justify-between group hover:bg-white/[0.03] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#E9C349]/10 flex items-center justify-center text-[#E9C349]">
                <PiggyBank size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{t("budgetPage")}</h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">{t("moneyBucketsDesc")}</p>
                <div className="flex items-center gap-3 mt-2">
                  {moneyBuckets.slice(0, 4).map(b => (
                    <div key={b.id} className="flex items-center gap-1">
                      <span className="text-sm">{b.icon}</span>
                      <span className="text-[10px] font-bold text-gray-400">{formatMoney(b.currentAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <ArrowRight size={18} className="text-gray-600 group-hover:text-[#E9C349] transition-colors" />
          </motion.div>
        </a>
      </section>

      {/* Transaction History Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <History size={18} className="text-[#ADC6FF]" />
          <h3 className="text-base font-bold text-white">{t("history")}</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {trades.map((trade) => {
            // Find matching asset for live price data
            const matchedAsset = assets.find(a => a.symbol.toUpperCase() === trade.asset.toUpperCase());
            const totalShares = matchedAsset?.shares || 0;
            const totalAvgCost = matchedAsset?.avgCost || 0;
            const livePrice = (matchedAsset && totalShares > 0) ? matchedAsset.valueUSD / totalShares : 0;
            
            // Calculate per-trade performance
            const tradePrice = trade.pricePerUnit || (totalAvgCost > 0 ? totalAvgCost : 0);
            const tradeShares = trade.shares || (tradePrice > 0 ? trade.amountUSD / tradePrice : 0);
            const holdingValueUSD = tradeShares * livePrice;
            const profitUSD = holdingValueUSD - trade.amountUSD;
            const profitPercent = trade.amountUSD > 0 && holdingValueUSD > 0 ? (profitUSD / trade.amountUSD) * 100 : 0;
            const isProfit = profitUSD >= 0;
            const hasData = livePrice > 0 && (tradePrice > 0 || totalAvgCost > 0);

            return (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                key={trade.id} 
                className="bg-[#1C1B1B] p-6 rounded-3xl border border-white/5 shadow-lg flex flex-col justify-between"
              >
                <div>
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{trade.date}</span>
                      <h4 className="text-lg font-black text-white mt-1">{trade.asset}</h4>
                    </div>
                    <div className={cn(
                      "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide",
                      trade.type === "BUY" ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
                    )}>
                      {trade.type === "BUY" ? t("buy") : t("sell")}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5 space-y-2.5">
                    {/* เงินลงทุน */}
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-500">{t("investedAmount")}</span>
                      <span className="text-sm font-black text-white">{formatMoney(trade.amountUSD)}</span>
                    </div>
                    
                    {/* ราคาเทรด */}
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-500">
                        {t("tradePrice")}
                      </span>
                      <span className="text-sm font-bold text-gray-300">
                        {hasData ? `${formatMoney(tradePrice, "USD", 1)}/${trade.asset}` : "—"}
                      </span>
                    </div>
                    
                    {/* จำนวนที่ได้จากเทรดนี้ */}
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-500">
                        {t("sharesFromTrade")}
                      </span>
                      <span className="text-sm font-bold text-gray-300">
                        {hasData ? `${tradeShares.toFixed(6)} ${trade.asset}` : "—"}
                      </span>
                    </div>

                    {/* จำนวนทั้งหมดและต้นทุนเฉลี่ยในพอร์ต */}
                    {(totalShares > 0 || totalAvgCost > 0) && (
                      <div className="mt-2 p-3 bg-white/5 rounded-xl border border-white/10 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">
                            {t("currentPortfolioShares")}
                          </span>
                          <span className="text-[10px] font-black text-[#ADC6FF]">{totalShares.toFixed(6)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">
                            {t("overallAvgCost")}
                          </span>
                          <span className="text-[10px] font-black text-[#ADC6FF]">{formatMoney(totalAvgCost, "USD", 1)} /{trade.asset}</span>
                        </div>
                      </div>
                    )}
                    
                    {/* เส้นแบ่ง */}
                    <div className="border-t border-white/5 pt-2.5 space-y-2.5 mt-2">
                      {/* ราคาตอนนี้ */}
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500">{t("currentPrice")}</span>
                        <span className="text-sm font-bold text-gray-300">
                          {livePrice > 0 ? `${formatMoney(livePrice, "USD", 1)}/${trade.asset}` : "—"}
                        </span>
                      </div>
                    
                      {/* มูลค่าของเทรดนี้ */}
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500">
                          {t("currentValueThisTrade")}
                        </span>
                        <span className="text-sm font-black text-white">
                          {hasData ? formatMoney(holdingValueUSD) : "—"}
                        </span>
                      </div>
                      
                      {/* กำไร/ขาดทุน ของเทรดนี้ */}
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500">{t("profitLoss")}</span>
                        {hasData ? (
                          <div className="text-right">
                            <span className={cn(
                              "text-sm font-black",
                              isProfit ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                            )}>
                              {isProfit ? "+" : ""}{formatMoney(profitUSD)}
                            </span>
                            <span className={cn(
                              "text-[10px] font-bold ml-1.5",
                              isProfit ? "text-[#4EDEA3]/60" : "text-[#FFB4AB]/60"
                            )}>
                              ({isProfit ? "+" : ""}{profitPercent.toFixed(1)}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* ข้อความเตือนถ้ายังไม่มีข้อมูล live */}
                {!hasData && (
                  <div className="text-[10px] text-[#ADC6FF]/60 font-medium pt-3 text-center mt-auto">
                    {t("noLiveData")}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Add Trade Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t("addTrade")}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-500 uppercase tracking-wide">{t("assetName")}</label>
            <input 
              autoFocus
              type="text" 
              placeholder="e.g. AAPL, BTC"
              value={newTrade.asset}
              onChange={(e) => setNewTrade({ ...newTrade, asset: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-[#ADC6FF]/50 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-500 uppercase tracking-wide">{t("amountUsd")}</label>
            <input 
              type="number" 
              placeholder="0.00"
              value={newTrade.amountUSD}
              onChange={(e) => setNewTrade({ ...newTrade, amountUSD: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-[#ADC6FF]/50 transition-all"
            />
          </div>
          <div className="flex gap-4">
            <button 
              type="button"
              onClick={() => setNewTrade({ ...newTrade, type: "BUY" })}
              className={cn(
                "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-wide transition-all",
                newTrade.type === "BUY" ? "bg-[#4EDEA3] text-[#00285d]" : "bg-white/5 text-gray-500"
              )}
            >
              {t("buy")}
            </button>
            <button 
              type="button"
              onClick={() => setNewTrade({ ...newTrade, type: "SELL" })}
              className={cn(
                "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-wide transition-all",
                newTrade.type === "SELL" ? "bg-[#FFB4AB] text-[#00285d]" : "bg-white/5 text-gray-500"
              )}
            >
              {t("sell")}
            </button>
          </div>
          <div className="flex gap-4 pt-4">
            <button 
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors"
            >
              {t("cancel")}
            </button>
            <button 
              type="submit"
              className="flex-1 py-4 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all"
            >
              {t("confirm")}
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal isOpen={isCSVModalOpen} onClose={() => setIsCSVModalOpen(false)} title={t("importCsv")}>
        <div className="space-y-8 py-4">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-[#ADC6FF]/10 rounded-3xl flex items-center justify-center mx-auto text-[#ADC6FF]">
              <FileText size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">{t("importCsv")}</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                {t("uploadCsvDesc")}
              </p>
            </div>
          </div>

          <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-12 text-center relative group hover:border-[#ADC6FF]/50 transition-all">
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleCSVUpload}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <div className="space-y-4">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto text-gray-400 group-hover:text-[#ADC6FF] transition-colors">
                <Download size={24} />
              </div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-500 group-hover:text-white transition-colors">
                {t("selectFile")}
              </p>
            </div>
          </div>

          <div className="bg-[#1C1B1B] p-6 rounded-2xl border border-white/5">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-4">{t("csvFormatExample")}</h4>
            <code className="text-xs text-[#ADC6FF] block font-mono bg-black/30 p-4 rounded-xl">
              asset,type,amountUSD,date,rateAtTime,currency<br/>
              BTC,BUY,5000,2024-01-15,34.5,THB<br/>
              ETH,BUY,3000,2024-02-10,35.2,THB
            </code>
          </div>

          <AnimatePresence>
            {importStatus.type !== 'idle' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={cn(
                  "p-4 rounded-2xl flex items-center gap-3",
                  importStatus.type === 'success' ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
                )}
              >
                {importStatus.type === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}
                <span className="text-xs font-bold">{importStatus.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => setIsCSVModalOpen(false)}
            className="w-full py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors"
          >
            {t("cancel")}
          </button>
        </div>
      </Modal>

      {/* Add Asset Modal (shared component) */}
      <AddAssetModal isOpen={isAddAssetOpen} onClose={() => setIsAddAssetOpen(false)} />

      {/* Add Cashflow Modal */}
      <AddCashflowModal isOpen={isAddCashflowOpen} onClose={() => setIsAddCashflowOpen(false)} />



      {/* Allocation Editor Modal */}
      <Modal isOpen={isAllocEditOpen} onClose={() => setIsAllocEditOpen(false)} title={t("editAllocation")}>
        <div className="space-y-5">
          <p className="text-xs text-gray-400 font-medium">{t("editAllocationDesc")}</p>
          
          {allocations.map(item => {
            const val = editAllocValues[item.label] ?? item.value;
            return (
              <div key={item.label} className="space-y-2">
                <div className="flex justify-between items-center text-xs font-black uppercase tracking-wide text-gray-400">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{translateLabel(item.label)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={val}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                        setEditAllocValues(prev => ({ ...prev, [item.label]: v }));
                      }}
                      className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-right text-white text-sm font-black outline-none focus:border-[#ADC6FF]/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-white text-sm font-black">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={val}
                  onChange={(e) => setEditAllocValues(prev => ({ ...prev, [item.label]: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: item.color,
                    background: `linear-gradient(to right, ${item.color} 0%, ${item.color} ${val}%, rgba(255,255,255,0.1) ${val}%, rgba(255,255,255,0.1) 100%)`
                  }}
                />
              </div>
            );
          })}

          {(() => {
            const total = Object.values(editAllocValues).reduce((s, v) => s + v, 0);
            const isValid = total === 100;
            return (
              <>
                <div className={cn(
                  "flex justify-between items-center p-4 rounded-2xl border",
                  isValid ? "bg-[#4EDEA3]/5 border-[#4EDEA3]/20" : "bg-[#FFB4AB]/5 border-[#FFB4AB]/20"
                )}>
                  <span className="text-xs font-black uppercase tracking-wide text-gray-400">{t("total")}</span>
                  <span className={cn("text-lg font-black", isValid ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {total}%
                  </span>
                </div>
                {!isValid && (
                  <p className="text-xs text-[#FFB4AB] font-bold text-center">
                    {t("totalMustBe100")} ({t("remaining")}: {100 - total > 0 ? "+" : ""}{100 - total}%)
                  </p>
                )}
                <div className="flex gap-4 pt-2">
                  <button
                    onClick={() => setIsAllocEditOpen(false)}
                    className="flex-1 py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    disabled={!isValid}
                    onClick={() => {
                      Object.entries(editAllocValues).forEach(([label, value]) => {
                        updateAllocation(label, value);
                      });
                      setIsAllocEditOpen(false);
                      addToast(t("allocationSaved"), 'success');
                      addNotification(
                        t("targetAllocation"),
                        allocations.map(a => `${translateLabel(a.label)}: ${editAllocValues[a.label]}%`).join(', '),
                        'rebalance'
                      );
                    }}
                    className={cn(
                      "flex-1 py-4 rounded-full font-black text-sm uppercase tracking-tight transition-all",
                      isValid
                        ? "bg-[#ADC6FF] text-[#00285d] hover:brightness-110 active:scale-95"
                        : "bg-white/5 text-gray-600 cursor-not-allowed"
                    )}
                  >
                    {t("confirm")}
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </Modal>
    </div>
  );
}

function AllocationItem({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="group">
      <div className="flex justify-between text-xs font-black uppercase tracking-wide text-gray-400 mb-2">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full rounded-full" 
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function DriftRow({ label, current, target, delta, type, color }: any) {
  return (
    <tr className="hover:bg-white/5 transition-colors group">
      <td className="px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-bold text-sm text-white">{label}</span>
        </div>
      </td>
      <td className="px-8 py-6 text-sm text-gray-400">{current}</td>
      <td className="px-8 py-6 text-sm text-gray-400">{target}</td>
      <td className={cn(
        "px-8 py-6 text-right text-sm font-black",
        type === "negative" ? "text-[#FFB4AB]" : "text-[#4EDEA3]"
      )}>
        {delta}
      </td>
    </tr>
  );
}

function TradeCard({ type, asset, desc, icon: Icon, color }: any) {
  return (
    <div className="bg-[#1C1B1B] p-6 rounded-3xl flex items-center justify-between group hover:bg-[#262626] transition-all border border-white/5 cursor-pointer">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${color}10`, color }}>
          <Icon size={24} />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wide" style={{ color }}>{type}</div>
          <div className="text-white font-bold text-sm">{asset}</div>
          <div className="text-xs text-gray-400 font-medium">{desc}</div>
        </div>
      </div>
      <ArrowRight size={18} className="text-gray-600 group-hover:text-[#ADC6FF] transition-colors" />
    </div>
  );
}
