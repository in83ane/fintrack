"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";

export type TimePeriod = "1d" | "5d" | "1w" | "1m" | "6m" | "ytd" | "1y" | "5y";

export interface PricePoint {
  time: number;
  price: number;
}

export interface PeriodMeta {
  label: string;
  labelTh: string;
  interval: string;
  yahooInterval: string;
  yahooRange: string;
  changeLabel: string;
  changeLabelTh: string;
}

export const PERIOD_CONFIG: Record<TimePeriod, PeriodMeta> = {
  "1d": {
    label: "1D",
    labelTh: "1วัน",
    interval: "1min",
    yahooInterval: "1m",
    yahooRange: "1d",
    changeLabel: "Today",
    changeLabelTh: "วันนี้"
  },
  "5d": {
    label: "5D",
    labelTh: "5วัน",
    interval: "15min",
    yahooInterval: "15m",
    yahooRange: "5d",
    changeLabel: "5 days",
    changeLabelTh: "5 วันย้อนหลัง"
  },
  "1w": {
    label: "1W",
    labelTh: "1สด.",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "1wk",
    changeLabel: "1 week",
    changeLabelTh: "1 สัปดาห์ย้อนหลัง"
  },
  "1m": {
    label: "1M",
    labelTh: "1ด.",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "1mo",
    changeLabel: "1 month",
    changeLabelTh: "1 เดือนย้อนหลัง"
  },
  "6m": {
    label: "6M",
    labelTh: "6ด.",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "6mo",
    changeLabel: "6 months",
    changeLabelTh: "6 เดือนย้อนหลัง"
  },
  "ytd": {
    label: "YTD",
    labelTh: "YTD",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "ytd",
    changeLabel: "Year to date",
    changeLabelTh: "ตั้งแต่ต้นปี"
  },
  "1y": {
    label: "1Y",
    labelTh: "1ปี",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "1y",
    changeLabel: "1 year",
    changeLabelTh: "1 ปีย้อนหลัง"
  },
  "5y": {
    label: "5Y",
    labelTh: "5ปี",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "5y",
    changeLabel: "5 years",
    changeLabelTh: "5 ปีย้อนหลัง"
  },
};

// ─── Helper Functions ────────────────────────────────────────────────────────

function formatThaiDate(ts: number, period: TimePeriod): string {
  const d = new Date(ts);
  const buddhistYear = d.getFullYear() + 543;
  const shortYear = buddhistYear % 100;
  const thaiMonths = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const month = thaiMonths[d.getMonth()];
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (period === "1d") return `${hh}:${mm}`;
  if (period === "5d") return `${day} ${month} ${hh}:${mm}`;
  if (period === "5y") return `${buddhistYear}`;
  return `${day} ${month} ${shortYear}`;
}

function formatEnglishDate(ts: number, period: TimePeriod): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (period === "1d") return `${hh}:${mm}`;
  if (period === "5d") return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
  if (period === "5y") return `${d.getFullYear()}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullThaiDate(ts: number, period: TimePeriod): string {
  const d = new Date(ts);
  const buddhistYear = d.getFullYear() + 543;
  const thaiMonths = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const month = thaiMonths[d.getMonth()];
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  if (period === "1d" || period === "5d") {
    return `${day} ${month} ${buddhistYear} ${hh}:${mm}:${ss} น.`;
  }
  return `${day} ${month} ${buddhistYear}`;
}

function formatFullEnglishDate(ts: number, period: TimePeriod): string {
  const d = new Date(ts);
  if (period === "1d" || period === "5d") {
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function fetchChartData(symbol: string, period: TimePeriod): Promise<PricePoint[]> {
  const { yahooInterval, yahooRange } = PERIOD_CONFIG[period];

  const url = `/api/chart?symbol=${encodeURIComponent(symbol)}&interval=${yahooInterval}&range=${yahooRange}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  if (json?.chartData && Array.isArray(json.chartData)) {
    return json.chartData.filter((dp: PricePoint) => dp.price > 0);
  }

  // Fallback to direct Yahoo Finance if API returns different format
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No data");

  const timestamps: number[] = result.timestamp ?? [];
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .map((t: number, i: number) => ({
      time: t * 1000,
      price: Number(closes[i]) || 0
    }))
    .filter((dp: PricePoint) => dp.price > 0);
}

// ─── Props Interface ───────────────────────────────────────────────────────────

interface StockChartProps {
  data: PricePoint[];
  isPositive: boolean;
  period: TimePeriod;
  symbol: string;
  language?: "en" | "th";
  height?: number;
  showGrid?: boolean;
  showTooltip?: boolean;
  className?: string;
}

// ─── SVG Chart Component ───────────────────────────────────────────────────────

export function StockChart({
  data,
  isPositive,
  period,
  symbol,
  language = "en",
  height = 180,
  showGrid = true,
  showTooltip = true,
  className,
}: StockChartProps) {
  const { t } = useApp();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const W = dimensions.width;
  const H = height;
  const PAD = { top: 10, right: 20, bottom: 30, left: 50 };

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [height]);

  const { yTicks, xTicks, pathD, areaD, cx, cy } = useMemo(() => {
    if (data.length < 2) return { yTicks: [], xTicks: [], pathD: "", areaD: "", cx: () => 0, cy: () => 0 };

    const prices = data.map(d => d.price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const paddingP = (maxP - minP) * 0.1;
    const adjustedMinP = Math.max(0, minP - paddingP);
    const adjustedMaxP = maxP + paddingP;
    const rangeP = adjustedMaxP - adjustedMinP || 1;

    const dataCount = data.length;
    const cx = (index: number) => PAD.left + (index / (dataCount - 1)) * (W - PAD.left - PAD.right);
    const cy = (p: number) => PAD.top + (1 - (p - adjustedMinP) / rangeP) * (H - PAD.top - PAD.bottom);

    const yTickCount = 4;
    const yTicks = Array.from({ length: yTickCount }, (_, i) => adjustedMinP + (i / (yTickCount - 1)) * rangeP);

    const getTickCount = () => {
      switch (period) {
        case "1d": return 4;
        case "5d": return 4;
        case "1m": return 4;
        case "6m": return 4;
        case "ytd": return 4;
        case "1y": return 4;
        case "5y": return 4;
        default: return 4;
      }
    };

    const xTickCount = getTickCount();
    const indexStep = Math.floor((dataCount - 1) / (xTickCount - 1));
    const xTicks = Array.from({ length: xTickCount }, (_, i) => {
      const index = Math.min(i * indexStep, dataCount - 1);
      return { ...data[index], index };
    });

    const points = data.map((d, i) => ({ x: cx(i), y: cy(d.price), i }));
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
    return { yTicks, xTicks, pathD, areaD, cx, cy };
  }, [data, W, H, period]);

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

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  const strokeColor = isPositive ? "#4EDEA3" : "#FFB4AB";
  const fillGradientId = `gradient-${symbol}-${isPositive ? "pos" : "neg"}`;

  if (data.length < 2) {
    return (
      <div ref={containerRef} className={cn("w-full flex items-center justify-center", className)} style={{ height }}>
        <span className="text-gray-500 text-sm">{t("noChartData")}</span>
      </div>
    );
  }

  const hov = hoveredIndex != null ? data[hoveredIndex] : null;

  return (
    <div ref={containerRef} className={cn("w-full relative", className)} style={{ height }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`gradient-${symbol}-pos`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4EDEA3" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#4EDEA3" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`gradient-${symbol}-neg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFB4AB" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#FFB4AB" stopOpacity={0} />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {showGrid && yTicks.map((v, i) => (
          <line
            key={`grid-${i}`}
            x1={PAD.left}
            y1={cy(v)}
            x2={W - PAD.right}
            y2={cy(v)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
        ))}

        {yTicks.map((v, i) => (
          <text
            key={`y-${i}`}
            x={PAD.left - 8}
            y={cy(v) + 3}
            textAnchor="end"
            fill="#6B7280"
            fontSize={9}
          >
            ${v >= 1000 ? v.toFixed(0) : v.toFixed(1)}
          </text>
        ))}

        {xTicks.map((d, i) => (
          <text
            key={`x-${i}`}
            x={cx(d.index)}
            y={H - 8}
            textAnchor="middle"
            fill="#6B7280"
            fontSize={9}
          >
            {period === "1d" || period === "5d" || period === "1w"
              ? (language === "th" ? formatThaiDate(d.time, period) : formatEnglishDate(d.time, period))
              : new Date(d.time).toLocaleDateString(language === "th" ? "th-TH" : "en-US", { month: 'short' })}
          </text>
        ))}

        <path d={areaD} fill={`url(${fillGradientId})`} />
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" filter="url(#glow)" />

        <AnimatePresence>
          {hov && hoveredIndex !== null && showTooltip && (
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
              <circle cx={cx(hoveredIndex)} cy={cy(hov.price)} r={4} fill={strokeColor} stroke="#1C1B1B" strokeWidth={2} />
            </motion.g>
          )}
        </AnimatePresence>
      </svg>

      {showTooltip && hov && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          className="absolute top-2 left-4 bg-[#2A2A2A]/90 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-1.5 pointer-events-none z-10"
        >
          <div className="text-xs text-gray-400">
            {period === "1d" || period === "5d" || period === "1w"
              ? (language === "th" ? formatFullThaiDate(hov.time, period) : formatFullEnglishDate(hov.time, period))
              : new Date(hov.time).toLocaleDateString(language === "th" ? "th-TH" : "en-US", { month: 'short', day: 'numeric' })}
          </div>
          <div className="text-sm font-bold text-white">${hov.price.toFixed(2)}</div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Period Selector Component ─────────────────────────────────────────────────

interface PeriodSelectorProps {
  selectedPeriod: TimePeriod;
  onChange: (period: TimePeriod) => void;
  language?: "en" | "th";
  size?: "sm" | "md";
}

const PERIODS: { key: TimePeriod; labelEn: string; labelTh: string }[] = [
  { key: "1d", labelEn: "1D", labelTh: "1วัน" },
  { key: "5d", labelEn: "5D", labelTh: "5วัน" },
  { key: "1w", labelEn: "1W", labelTh: "1สด." },
  { key: "1m", labelEn: "1M", labelTh: "1ด." },
  { key: "6m", labelEn: "6M", labelTh: "6ด." },
  { key: "ytd", labelEn: "YTD", labelTh: "YTD" },
  { key: "1y", labelEn: "1Y", labelTh: "1ปี" },
  { key: "5y", labelEn: "5Y", labelTh: "5ปี" },
];

export function PeriodSelector({ selectedPeriod, onChange, language = "en", size = "sm" }: PeriodSelectorProps) {
  const { t } = useApp();
  return (
    <div className={cn(
      "flex gap-1 bg-white/5 rounded-lg p-1",
      size === "md" && "p-1.5"
    )}>
      {PERIODS.map((period) => (
        <button
          key={period.key}
          onClick={() => onChange(period.key)}
          className={cn(
            "px-2 py-1 font-black uppercase tracking-wide rounded-md transition-all",
            size === "sm" && "text-[10px]",
            size === "md" && "text-xs px-3 py-1.5",
            selectedPeriod === period.key
              ? "bg-[#ADC6FF] text-[#00285d]"
              : "text-gray-400 hover:text-white"
          )}
        >
          {t(`period${period.key}`)}
        </button>
      ))}
    </div>
  );
}

export default StockChart;
