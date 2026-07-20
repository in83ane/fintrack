"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// TERMINAL PAGE — Advanced Algorithmic Trading Analytics
// ═══════════════════════════════════════════════════════════════════════════════
// A dedicated dark-mode workspace for professional market analysis featuring:
// • Interactive Candlestick / Heikin Ashi chart (SVG) with toggle
// • Automated Support/Resistance detection overlay
// • Dynamic Fibonacci Retracement overlay
// • Multi-Factor Algorithmic Alert Feed
// • EMA 9/21 overlays + Volume subplot
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { computeHeikinAshi, type OHLCV } from "@/src/lib/finance";
import {
  analyzeTerminal,
  type TerminalAnalysis,
  type SRLevel,
  type TerminalAlert,
  type FibResult,
} from "./actions";
import {
  Search, ToggleLeft, ToggleRight, TrendingUp, TrendingDown,
  AlertTriangle, ArrowUpCircle, ArrowDownCircle, Activity,
  Loader2, RefreshCcw, Monitor,
} from "lucide-react";

// ─── Color Palette ────────────────────────────────────────────────────────────
const COLORS = {
  bullish: "#4EDEA3",
  bearish: "#FFB4AB",
  ema9: "#ADC6FF",
  ema21: "#E9C349",
  support: "#4D8EFF",
  resistance: "#FF6B6B",
  fib: {
    "0": "#6B7280",
    "0.236": "#A78BFA",
    "0.382": "#4D8EFF",
    "0.5": "#ADC6FF",
    "0.618": "#E9C349",
    "0.786": "#FF6B6B",
    "1": "#6B7280",
  } as Record<string, string>,
  volume: "rgba(173, 198, 255, 0.3)",
  grid: "rgba(255,255,255,0.04)",
  cardBg: "#1C1B1B",
  bg: "#141414",
};

// ─── Period Config ────────────────────────────────────────────────────────────
const PERIODS = [
  { label: "1W", range: "5d", interval: "15m" },
  { label: "1M", range: "1mo", interval: "1d" },
  { label: "3M", range: "3mo", interval: "1d" },
  { label: "6M", range: "6mo", interval: "1d" },
  { label: "1Y", range: "1y", interval: "1d" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CANDLESTICK CHART COMPONENT (SVG)
// ═══════════════════════════════════════════════════════════════════════════════

interface CandlestickChartProps {
  data: OHLCV[];
  supports: SRLevel[];
  resistances: SRLevel[];
  fibonacci: FibResult | null;
  ema9: number[];
  ema21: number[];
  showHeikinAshi: boolean;
  width: number;
  height: number;
}

function CandlestickChart({
  data, supports, resistances, fibonacci,
  ema9, ema21, showHeikinAshi, width, height,
}: CandlestickChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const displayData = useMemo(
    () => (showHeikinAshi ? computeHeikinAshi(data) : data),
    [data, showHeikinAshi]
  );

  // Chart layout constants
  const PAD = { top: 20, right: 80, bottom: 60, left: 60 };
  const chartH = height * 0.75; // Main chart takes 75%, volume takes 25%
  const volH = height * 0.18;
  const volTop = chartH + 10;

  const chartMetrics = useMemo(() => {
    if (displayData.length < 2) return null;

    const allHighs = displayData.map(d => d.high);
    const allLows = displayData.map(d => d.low);

    // Include S/R + Fib levels in the price range for proper rendering
    const extraPrices = [
      ...supports.map(s => s.price),
      ...resistances.map(r => r.price),
      ...(fibonacci?.levels.map(l => l.price) || []),
    ];
    const allPrices = [...allHighs, ...allLows, ...extraPrices.filter(p => p > 0)];

    let minP = Math.min(...allPrices);
    let maxP = Math.max(...allPrices);
    const padding = (maxP - minP) * 0.05;
    minP -= padding;
    maxP += padding;
    const rangeP = maxP - minP || 1;

    const maxVol = Math.max(...displayData.map(d => d.volume), 1);
    const candleW = Math.max(1, (width - PAD.left - PAD.right) / displayData.length * 0.7);
    const gapW = (width - PAD.left - PAD.right) / displayData.length;

    const cx = (i: number) => PAD.left + i * gapW + gapW / 2;
    const cy = (price: number) => PAD.top + (1 - (price - minP) / rangeP) * (chartH - PAD.top - 10);
    const vy = (vol: number) => volTop + volH - (vol / maxVol) * volH;

    // Y-axis ticks
    const yTickCount = 6;
    const yTicks = Array.from({ length: yTickCount }, (_, i) =>
      minP + (i / (yTickCount - 1)) * rangeP
    );

    // X-axis ticks (every ~20% of data)
    const xStep = Math.max(1, Math.floor(displayData.length / 5));
    const xTicks = Array.from(
      { length: Math.min(6, displayData.length) },
      (_, i) => Math.min(i * xStep, displayData.length - 1)
    );

    return { minP, maxP, rangeP, maxVol, candleW, gapW, cx, cy, vy, yTicks, xTicks };
  }, [displayData, supports, resistances, fibonacci, width, height]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!chartMetrics || displayData.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width * width;
    const relX = mouseX - PAD.left;
    const idx = Math.round(relX / chartMetrics.gapW);
    setHoveredIndex(Math.max(0, Math.min(idx, displayData.length - 1)));
  }, [chartMetrics, displayData.length, width]);

  if (!chartMetrics || displayData.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <span className="text-gray-500 text-sm">No chart data available</span>
      </div>
    );
  }

  const { cx, cy, vy, candleW, yTicks, xTicks } = chartMetrics;
  const hov = hoveredIndex != null ? displayData[hoveredIndex] : null;

  // Format date for x-axis
  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
        style={{ overflow: 'visible' }}
      >
        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={PAD.left} y1={cy(v)}
              x2={width - PAD.right} y2={cy(v)}
              stroke={COLORS.grid} strokeWidth={1}
            />
            <text
              x={PAD.left - 8} y={cy(v) + 3}
              textAnchor="end" fill="#6B7280" fontSize={9} fontFamily="monospace"
            >
              {v >= 1000 ? v.toFixed(0) : v.toFixed(2)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xTicks.map(idx => (
          <text
            key={`x-${idx}`}
            x={cx(idx)} y={height - 5}
            textAnchor="middle" fill="#6B7280" fontSize={9}
          >
            {formatDate(displayData[idx].time)}
          </text>
        ))}

        {/* ─── Fibonacci Overlay ─────────────────────────────────────────── */}
        {fibonacci && fibonacci.levels.map((level, i) => {
          const y = cy(level.price);
          const color = COLORS.fib[String(level.ratio)] || "#6B7280";
          return (
            <g key={`fib-${i}`}>
              <line
                x1={PAD.left} y1={y}
                x2={width - PAD.right} y2={y}
                stroke={color} strokeWidth={1} strokeDasharray="6,4" opacity={0.6}
              />
              <rect
                x={width - PAD.right + 4} y={y - 8}
                width={72} height={16}
                rx={4} fill={color} opacity={0.15}
              />
              <text
                x={width - PAD.right + 8} y={y + 4}
                fill={color} fontSize={9} fontWeight="bold" fontFamily="monospace"
              >
                {level.label} {level.price >= 1000 ? level.price.toFixed(0) : level.price.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* ─── Support Lines ────────────────────────────────────────────── */}
        {supports.map((s, i) => {
          const y = cy(s.price);
          return (
            <g key={`sup-${i}`}>
              <line
                x1={PAD.left} y1={y}
                x2={width - PAD.right} y2={y}
                stroke={COLORS.support} strokeWidth={1.5}
                strokeDasharray="8,4" opacity={0.7}
              />
              <text
                x={PAD.left + 4} y={y - 4}
                fill={COLORS.support} fontSize={8} fontWeight="bold"
              >
                S{i + 1} ${s.price >= 1000 ? s.price.toFixed(0) : s.price.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* ─── Resistance Lines ─────────────────────────────────────────── */}
        {resistances.map((r, i) => {
          const y = cy(r.price);
          return (
            <g key={`res-${i}`}>
              <line
                x1={PAD.left} y1={y}
                x2={width - PAD.right} y2={y}
                stroke={COLORS.resistance} strokeWidth={1.5}
                strokeDasharray="8,4" opacity={0.7}
              />
              <text
                x={PAD.left + 4} y={y - 4}
                fill={COLORS.resistance} fontSize={8} fontWeight="bold"
              >
                R{i + 1} ${r.price >= 1000 ? r.price.toFixed(0) : r.price.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* ─── EMA Lines ────────────────────────────────────────────────── */}
        {ema9.length > 1 && (
          <path
            d={ema9.map((v, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)} ${cy(v).toFixed(1)}`).join(' ')}
            fill="none" stroke={COLORS.ema9} strokeWidth={1.2} opacity={0.8}
          />
        )}
        {ema21.length > 1 && (
          <path
            d={ema21.map((v, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)} ${cy(v).toFixed(1)}`).join(' ')}
            fill="none" stroke={COLORS.ema21} strokeWidth={1.2} opacity={0.8}
          />
        )}

        {/* ─── Candlesticks ─────────────────────────────────────────────── */}
        {displayData.map((candle, i) => {
          const isBullish = candle.close >= candle.open;
          const color = isBullish ? COLORS.bullish : COLORS.bearish;
          const bodyTop = cy(Math.max(candle.open, candle.close));
          const bodyBottom = cy(Math.min(candle.open, candle.close));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);
          const x = cx(i);

          return (
            <g key={`candle-${i}`}>
              {/* Wick */}
              <line
                x1={x} y1={cy(candle.high)}
                x2={x} y2={cy(candle.low)}
                stroke={color} strokeWidth={1}
              />
              {/* Body */}
              <rect
                x={x - candleW / 2} y={bodyTop}
                width={candleW} height={bodyHeight}
                fill={isBullish ? color : color}
                stroke={color} strokeWidth={0.5}
                opacity={hoveredIndex === i ? 1 : 0.9}
                rx={0.5}
              />
            </g>
          );
        })}

        {/* ─── Volume Bars ──────────────────────────────────────────────── */}
        {displayData.map((candle, i) => {
          const isBullish = candle.close >= candle.open;
          const barH = volH - (vy(candle.volume) - volTop);
          return (
            <rect
              key={`vol-${i}`}
              x={cx(i) - candleW / 2}
              y={volTop + volH - barH}
              width={candleW}
              height={Math.max(0, barH)}
              fill={isBullish ? COLORS.bullish : COLORS.bearish}
              opacity={0.25}
              rx={0.5}
            />
          );
        })}

        {/* Volume label */}
        <text x={PAD.left} y={volTop - 2} fill="#6B7280" fontSize={8} fontWeight="bold">
          VOLUME
        </text>

        {/* ─── Crosshair ────────────────────────────────────────────────── */}
        {hov && hoveredIndex != null && (
          <g>
            <line
              x1={cx(hoveredIndex)} y1={PAD.top}
              x2={cx(hoveredIndex)} y2={chartH}
              stroke="rgba(173,198,255,0.3)" strokeWidth={1} strokeDasharray="4,4"
            />
            <line
              x1={PAD.left} y1={cy(hov.close)}
              x2={width - PAD.right} y2={cy(hov.close)}
              stroke="rgba(173,198,255,0.3)" strokeWidth={1} strokeDasharray="4,4"
            />
            {/* Price label on Y axis */}
            <rect
              x={width - PAD.right + 2} y={cy(hov.close) - 9}
              width={76} height={18} rx={4}
              fill={hov.close >= hov.open ? "#4EDEA3" : "#FFB4AB"} opacity={0.95}
            />
            <text
              x={width - PAD.right + 6} y={cy(hov.close) + 4}
              fill="#0E0E0E" fontSize={10} fontWeight="bold" fontFamily="monospace"
            >
              {hov.close >= 1000 ? hov.close.toFixed(0) : hov.close.toFixed(2)}
            </text>
            {/* X-axis date pill */}
            <rect
              x={cx(hoveredIndex) - 32} y={chartH + 2}
              width={64} height={16} rx={4}
              fill="#2A2A2A" stroke="rgba(173,198,255,0.2)" strokeWidth={0.5}
            />
            <text
              x={cx(hoveredIndex)} y={chartH + 13.5}
              textAnchor="middle" fill="#ADC6FF" fontSize={8} fontWeight="bold"
            >
              {formatDate(hov.time)}
            </text>
          </g>
        )}
      </svg>

      {/* Tooltip — follows cursor via translate3d */}
      {hov && hoveredIndex != null && (() => {
        const el = containerRef.current;
        const svg = svgRef.current;
        if (!el || !svg) return null;
        const svgRect = svg.getBoundingClientRect();
        const containerRect = el.getBoundingClientRect();
        const scale = svgRect.width / width;
        const dotX = cx(hoveredIndex) * scale + (svgRect.left - containerRect.left);
        const dotY = cy(hov.close) * scale + (svgRect.top - containerRect.top);
        const flipX = dotX > containerRect.width * 0.65;
        const tX = flipX ? dotX - 180 : dotX + 18;
        const tY = Math.max(8, Math.min(dotY - 30, containerRect.height - 80));
        return (
          <div
            className="absolute top-0 left-0 bg-[#2A2A2A]/95 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-2.5 pointer-events-none z-10 shadow-xl shadow-black/30"
            style={{
              transform: `translate3d(${tX}px, ${tY}px, 0)`,
              willChange: 'transform',
            }}
          >
            <div className="text-[10px] text-gray-400 mb-1">
              {new Date(hov.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="grid grid-cols-4 gap-x-4 gap-y-0.5 text-xs font-mono">
              <span className="text-gray-500">O</span>
              <span className="text-white font-bold">{hov.open.toFixed(2)}</span>
              <span className="text-gray-500">H</span>
              <span className="text-white font-bold">{hov.high.toFixed(2)}</span>
              <span className="text-gray-500">L</span>
              <span className="text-white font-bold">{hov.low.toFixed(2)}</span>
              <span className="text-gray-500">C</span>
              <span className={cn("font-bold", hov.close >= hov.open ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                {hov.close.toFixed(2)}
              </span>
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              Vol: {hov.volume >= 1_000_000 ? (hov.volume / 1_000_000).toFixed(1) + 'M' : (hov.volume / 1000).toFixed(0) + 'K'}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function AlertCard({ alert }: { alert: TerminalAlert }) {
  const isBuy = alert.type === 'BUY';
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "rounded-xl border p-3 transition-all",
        isBuy
          ? "bg-[#4EDEA3]/5 border-[#4EDEA3]/20"
          : "bg-[#FFB4AB]/5 border-[#FFB4AB]/20"
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        {isBuy
          ? <ArrowUpCircle size={16} className="text-[#4EDEA3]" />
          : <ArrowDownCircle size={16} className="text-[#FFB4AB]" />}
        <span className={cn("text-xs font-black tracking-wide", isBuy ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
          {alert.type}
        </span>
        <span className="text-xs text-gray-400 font-bold">{alert.symbol}</span>
        <span className="ml-auto text-[10px] text-gray-500 font-mono">
          {alert.confidence}%
        </span>
      </div>
      <div className="text-xs text-gray-400 font-medium">
        ${alert.price.toFixed(2)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {alert.reasons.map((reason, i) => (
          <span
            key={i}
            className={cn(
              "text-[9px] px-2 py-0.5 rounded-full font-bold",
              isBuy ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
            )}
          >
            {reason}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TERMINAL PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function TerminalPage() {
  const { t, language } = useApp();

  // ─── State ──────────────────────────────────────────────────────────────
  const [symbol, setSymbol] = useState("AAPL");
  const [searchInput, setSearchInput] = useState("AAPL");
  const [analysis, setAnalysis] = useState<TerminalAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHeikinAshi, setShowHeikinAshi] = useState(false);
  const [activePeriod, setActivePeriod] = useState(2); // Default: 3M
  const [chartWidth, setChartWidth] = useState(900);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // ─── EMA computation (client-side from OHLCV data) ─────────────────────
  const { ema9, ema21 } = useMemo(() => {
    if (!analysis?.ohlcv) return { ema9: [], ema21: [] };
    const closes = analysis.ohlcv.map(c => c.close);

    const computeEMA = (data: number[], period: number): number[] => {
      if (data.length === 0) return [];
      const k = 2 / (period + 1);
      const ema = [data[0]];
      for (let i = 1; i < data.length; i++) {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
      }
      return ema;
    };

    return {
      ema9: computeEMA(closes, 9),
      ema21: computeEMA(closes, 21),
    };
  }, [analysis?.ohlcv]);

  // ─── Responsive chart width ────────────────────────────────────────────
  useEffect(() => {
    const updateWidth = () => {
      if (chartContainerRef.current) {
        setChartWidth(chartContainerRef.current.getBoundingClientRect().width);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // ─── Fetch analysis ────────────────────────────────────────────────────
  const runAnalysis = useCallback(async (sym: string, periodIdx: number) => {
    setLoading(true);
    setError(null);
    try {
      const period = PERIODS[periodIdx];
      const result = await analyzeTerminal(sym, period.range, period.interval);
      setAnalysis(result);
      setSymbol(sym.toUpperCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    runAnalysis(symbol, activePeriod);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      runAnalysis(searchInput.trim(), activePeriod);
    }
  };

  const handlePeriodChange = (idx: number) => {
    setActivePeriod(idx);
    runAnalysis(symbol, idx);
  };

  return (
    <div className="min-h-screen bg-[#141414] pb-20 sm:pb-6">
      {/* ─── Header Bar ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#141414]/95 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-[#ADC6FF] to-[#4D8EFF] rounded-lg flex items-center justify-center">
                <Monitor size={16} className="text-[#00285d]" />
              </div>
              <h1 className="text-base font-black text-white tracking-wide hidden sm:block">
                Terminal
              </h1>
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 max-w-xs">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  id="terminal-search"
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value.toUpperCase())}
                  placeholder="Search symbol..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 focus:ring-1 focus:ring-[#ADC6FF]/20 font-mono font-bold transition-all"
                />
              </div>
            </form>

            {/* Symbol Badge */}
            {analysis && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-black text-sm">{analysis.symbol}</span>
                    <span className="text-[10px] text-gray-500 font-bold bg-white/5 px-2 py-0.5 rounded-md">
                      {analysis.market}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-lg">
                      {analysis.currency === 'THB' ? '฿' : '$'}{analysis.currentPrice.toFixed(2)}
                    </span>
                    <span className={cn(
                      "text-xs font-black",
                      analysis.changePct >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                    )}>
                      {analysis.changePct >= 0 ? '+' : ''}{analysis.changePct.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Heikin Ashi Toggle */}
            <button
              id="ha-toggle"
              onClick={() => setShowHeikinAshi(!showHeikinAshi)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black transition-all border ml-auto",
                showHeikinAshi
                  ? "bg-[#E9C349]/10 border-[#E9C349]/30 text-[#E9C349]"
                  : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
              )}
            >
              {showHeikinAshi ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              <span className="hidden sm:inline">Heikin Ashi</span>
              <span className="sm:hidden">HA</span>
            </button>

            {/* Refresh */}
            <button
              onClick={() => runAnalysis(symbol, activePeriod)}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
              disabled={loading}
            >
              <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Period Selector */}
          <div className="flex gap-1 mt-2 bg-white/5 rounded-lg p-1 w-fit">
            {PERIODS.map((period, idx) => (
              <button
                key={period.label}
                onClick={() => handlePeriodChange(idx)}
                className={cn(
                  "px-3 py-1 text-[10px] font-black uppercase tracking-wide rounded-md transition-all",
                  activePeriod === idx
                    ? "bg-[#ADC6FF] text-[#00285d]"
                    : "text-gray-400 hover:text-white"
                )}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Main Content ────────────────────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 mt-4">
        {loading && !analysis ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 size={32} className="text-[#ADC6FF] animate-spin" />
            <p className="text-gray-500 text-sm font-bold">Analyzing {searchInput}...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <AlertTriangle size={32} className="text-[#FFB4AB]" />
            <p className="text-[#FFB4AB] text-sm font-bold">{error}</p>
            <button
              onClick={() => runAnalysis(symbol, activePeriod)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white font-bold hover:bg-white/10 transition-all"
            >
              Retry
            </button>
          </div>
        ) : analysis ? (
          <div className="space-y-4">
            {/* ─── Chart Card ──────────────────────────────────────────── */}
            <div
              ref={chartContainerRef}
              className="bg-[#1C1B1B] rounded-2xl border border-white/5 p-3 sm:p-4 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-xs font-black text-gray-400 uppercase tracking-wider">
                    {showHeikinAshi ? "Heikin Ashi" : "Candlestick"} Chart
                  </h2>
                  {/* EMA legend */}
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: COLORS.ema9 }} />
                      <span className="text-gray-500 font-bold">EMA 9</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: COLORS.ema21 }} />
                      <span className="text-gray-500 font-bold">EMA 21</span>
                    </span>
                  </div>
                </div>
                {loading && <Loader2 size={14} className="text-[#ADC6FF] animate-spin" />}
              </div>

              <CandlestickChart
                data={analysis.ohlcv}
                supports={analysis.supports}
                resistances={analysis.resistances}
                fibonacci={analysis.fibonacci}
                ema9={ema9}
                ema21={ema21}
                showHeikinAshi={showHeikinAshi}
                width={chartWidth - 32}
                height={420}
              />
            </div>

            {/* ─── Analysis Panels Grid ────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Support / Resistance Panel */}
              <div className="bg-[#1C1B1B] rounded-2xl border border-white/5 p-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Activity size={14} className="text-[#ADC6FF]" />
                  Support & Resistance
                </h3>

                {analysis.resistances.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-[#FF6B6B] font-black mb-1.5 uppercase tracking-wider">Resistance</div>
                    <div className="space-y-1">
                      {analysis.resistances.map((r, i) => (
                        <div key={`r-${i}`} className="flex items-center justify-between py-1 px-2 rounded-lg bg-[#FF6B6B]/5">
                          <span className="text-xs text-white font-mono font-bold">
                            {analysis.currency === 'THB' ? '฿' : '$'}{r.price.toFixed(2)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-500">{r.touches} touches</span>
                            <div className="flex gap-0.5">
                              {Array.from({ length: r.strength }, (_, j) => (
                                <div key={j} className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B]" />
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.supports.length > 0 && (
                  <div>
                    <div className="text-[10px] text-[#4D8EFF] font-black mb-1.5 uppercase tracking-wider">Support</div>
                    <div className="space-y-1">
                      {analysis.supports.map((s, i) => (
                        <div key={`s-${i}`} className="flex items-center justify-between py-1 px-2 rounded-lg bg-[#4D8EFF]/5">
                          <span className="text-xs text-white font-mono font-bold">
                            {analysis.currency === 'THB' ? '฿' : '$'}{s.price.toFixed(2)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-500">{s.touches} touches</span>
                            <div className="flex gap-0.5">
                              {Array.from({ length: s.strength }, (_, j) => (
                                <div key={j} className="w-1.5 h-1.5 rounded-full bg-[#4D8EFF]" />
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.supports.length === 0 && analysis.resistances.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-4">No significant levels detected</p>
                )}
              </div>

              {/* Fibonacci Panel */}
              <div className="bg-[#1C1B1B] rounded-2xl border border-white/5 p-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <TrendingUp size={14} className="text-[#E9C349]" />
                  Fibonacci Retracement
                </h3>

                <div className="flex items-center gap-2 mb-3">
                  <span className={cn(
                    "text-[10px] font-black px-2 py-0.5 rounded-full",
                    analysis.fibonacci.trendDirection === 'up'
                      ? "bg-[#4EDEA3]/10 text-[#4EDEA3]"
                      : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
                  )}>
                    {analysis.fibonacci.trendDirection === 'up' ? '↑ UPTREND' : '↓ DOWNTREND'}
                  </span>
                </div>

                <div className="space-y-1">
                  {analysis.fibonacci.levels.map((level, i) => {
                    const color = COLORS.fib[String(level.ratio)] || "#6B7280";
                    const isNearPrice = Math.abs(level.price - analysis.currentPrice) / analysis.currentPrice < 0.015;
                    return (
                      <div
                        key={`fib-${i}`}
                        className={cn(
                          "flex items-center justify-between py-1.5 px-2 rounded-lg transition-all",
                          isNearPrice ? "bg-white/5 ring-1 ring-white/10" : ""
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-xs font-black" style={{ color }}>
                            {level.label}
                          </span>
                        </div>
                        <span className="text-xs text-white font-mono font-bold">
                          {analysis.currency === 'THB' ? '฿' : '$'}{level.price >= 1000 ? level.price.toFixed(0) : level.price.toFixed(2)}
                        </span>
                        {isNearPrice && (
                          <span className="text-[9px] text-[#E9C349] font-black animate-pulse">← PRICE</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-gray-500">Impulse High</span>
                    <div className="text-white font-mono font-bold">{analysis.fibonacci.impulseHigh}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Impulse Low</span>
                    <div className="text-white font-mono font-bold">{analysis.fibonacci.impulseLow}</div>
                  </div>
                </div>
              </div>

              {/* Alert Feed Panel */}
              <div className="bg-[#1C1B1B] rounded-2xl border border-white/5 p-4">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-[#A78BFA]" />
                  Multi-Factor Alerts
                </h3>

                {/* MACD indicator summary */}
                <div className="mb-3 p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="text-[10px] text-gray-500 font-black uppercase mb-1">MACD Status</div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <span className="text-gray-500">MACD</span>
                      <div className={cn("font-mono font-bold",
                        analysis.macd.macd > 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                      )}>
                        {analysis.macd.macd.toFixed(3)}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Signal</span>
                      <div className="text-white font-mono font-bold">{analysis.macd.signal.toFixed(3)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Hist</span>
                      <div className={cn("font-mono font-bold",
                        analysis.macd.histogram > 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                      )}>
                        {analysis.macd.histogram.toFixed(3)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* EMA summary */}
                <div className="mb-3 p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="text-[10px] text-gray-500 font-black uppercase mb-1">EMA Cross</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <span className="text-gray-500">EMA 9</span>
                      <div className="text-[#ADC6FF] font-mono font-bold">{analysis.ema9.toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">EMA 21</span>
                      <div className="text-[#E9C349] font-mono font-bold">{analysis.ema21.toFixed(2)}</div>
                    </div>
                  </div>
                  <div className={cn(
                    "mt-1.5 text-[10px] font-black",
                    analysis.ema9 > analysis.ema21 ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                  )}>
                    {analysis.ema9 > analysis.ema21 ? "✅ EMA 9 > EMA 21 (Bullish)" : "⚠️ EMA 9 < EMA 21 (Bearish)"}
                  </div>
                </div>

                {/* Alerts */}
                <div className="space-y-2">
                  <AnimatePresence>
                    {analysis.alerts.length > 0 ? (
                      analysis.alerts.map(alert => (
                        <AlertCard key={alert.id} alert={alert} />
                      ))
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-4"
                      >
                        <div className="text-gray-600 text-xs font-bold">No converging signals</div>
                        <div className="text-gray-700 text-[10px] mt-1">
                          Alerts fire when MACD crossover + S/R or Fibonacci conditions align
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
