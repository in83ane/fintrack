"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Target,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Clock,
  Activity,
  BarChart3,
  Loader2,
  Pencil,
  Check,
  GripVertical,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { useApp } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { VerticalTimeline, TimelineItem } from "@/src/components/VerticalTimeline";

type TimePeriod = "1d" | "5d" | "1m" | "6m" | "ytd" | "1y" | "5y";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PricePoint {
  time: number;
  price: number;
}

interface PeriodMeta {
  label: string;
  labelTh: string;
  interval: string;
  yahooInterval: string;
  yahooRange: string;
  changeLabel: string;
  changeLabelTh: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_PERIODS: TimePeriod[] = ["1d", "5d", "1m", "6m", "ytd", "1y", "5y"];

const PERIOD_CONFIG: Record<TimePeriod, PeriodMeta> = {
  "1d":  {
    label: "1D",
    labelTh: "1วัน",
    interval: "1min",
    yahooInterval: "1m",
    yahooRange: "1d",
    changeLabel: "Today",
    changeLabelTh: "วันนี้"
  },
  "5d":  {
    label: "5D",
    labelTh: "5วัน",
    interval: "15min",
    yahooInterval: "15m",
    yahooRange: "5d",
    changeLabel: "5 days",
    changeLabelTh: "5 วันย้อนหลัง"
  },
  "1m":  {
    label: "1M",
    labelTh: "1ด.",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "1mo",
    changeLabel: "1 month",
    changeLabelTh: "1 เดือนย้อนหลัง"
  },
  "6m":  {
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
  "1y":  {
    label: "1Y",
    labelTh: "1ปี",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "1y",
    changeLabel: "1 year",
    changeLabelTh: "1 ปีย้อนหลัง"
  },
  "5y":  {
    label: "5Y",
    labelTh: "5ปี",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "5y",
    changeLabel: "5 years",
    changeLabelTh: "5 ปีย้อนหลัง"
  },
};

const THB_RATE = 36.5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatEnglishDate(ts: number, period: TimePeriod): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (period === "1d") return `${hh}:${mm}`;
  if (period === "5d") return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
  if (period === "5y") return `${d.getFullYear()}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullEnglishDate(ts: number, period: TimePeriod): string {
  const d = new Date(ts);
  if (period === "1d" || period === "5d") {
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  assetName: string;
  assetSymbol: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ assetName, assetSymbol, onConfirm, onCancel }: DeleteConfirmModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const required = assetSymbol.toUpperCase();
  const isValid = confirmText.toUpperCase() === required;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="bg-[#1C1B1B] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-[#FFB4AB]">
            <AlertTriangle size={18} />
            <span className="font-bold text-sm uppercase tracking-wide">ลบ Asset</span>
          </div>
          <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <p className="text-white font-semibold mb-1">
          คุณแน่ใจว่าต้องการลบ <span className="text-[#FFB4AB]">{assetName}</span>?
        </p>
        <p className="text-gray-500 text-xs mb-5">
          การกระทำนี้ไม่สามารถย้อนกลับได้ กรุณาพิมพ์ <span className="font-mono text-white bg-white/10 px-1.5 py-0.5 rounded">{required}</span> เพื่อยืนยัน
        </p>

        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={`พิมพ์ ${required}`}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-gray-600 focus:outline-none focus:border-[#FFB4AB]/50 transition-colors mb-4"
          autoFocus
        />

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-400 text-sm font-bold hover:bg-white/10 transition-all"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            disabled={!isValid}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
              isValid
                ? "bg-[#FFB4AB]/20 border border-[#FFB4AB]/40 text-[#FFB4AB] hover:bg-[#FFB4AB]/30"
                : "bg-white/5 text-gray-600 cursor-not-allowed border border-transparent"
            )}
          >
            <Trash2 size={14} />
            ลบออก
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── SVG Chart Component ─────────────────────────────────────────────────────

interface ChartProps {
  data: PricePoint[];
  isPositive: boolean;
  period: TimePeriod;
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
  language: "en" | "th";
  symbol: string;
  t: (key: string) => string;
}

function SVGChart({ data, isPositive, period, hoveredIndex, onHover, language, symbol, t }: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  const W = dimensions.width;
  const H = dimensions.height;
  const PAD = { top: 20, right: 20, bottom: 40, left: 70 };

  useEffect(() => {
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

  const { yTicks, xTicks, pathD, areaD, cx, cy } = useMemo(() => {
    if (data.length < 2) return { prices: [], times: [], minP: 0, maxP: 0, rangeP: 1, yTicks: [], xTicks: [], pathD: "", areaD: "", cx: () => 0, cy: () => 0, cxTime: () => 0 };

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

    const yTickCount = 5;
    const yTicks = Array.from({ length: yTickCount }, (_, i) => adjustedMinP + (i / (yTickCount - 1)) * rangeP);

    const getTickCount = () => {
      switch (period) {
        case "1d": return 6;
        case "5d": return 5;
        default: return 6;
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

    return { prices, yTicks, xTicks, pathD, areaD, cx, cy };
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
    onHover(closest);
  }, [data.length, W, onHover]);

  const strokeColor = isPositive ? "#4EDEA3" : "#FFB4AB";
  const fillGradientId = `url(#gradient-${symbol}-${isPositive ? "pos" : "neg"})`;

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
        onMouseLeave={() => onHover(null)}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`gradient-${symbol}-pos`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4EDEA3" stopOpacity={0.4} />
            <stop offset="50%" stopColor="#4EDEA3" stopOpacity={0.1} />
            <stop offset="100%" stopColor="#4EDEA3" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`gradient-${symbol}-neg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFB4AB" stopOpacity={0.4} />
            <stop offset="50%" stopColor="#FFB4AB" stopOpacity={0.1} />
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

        {yTicks.map((v, i) => (
          <line key={`grid-${i}`} x1={PAD.left} y1={cy(v)} x2={W - PAD.right} y2={cy(v)}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1}
            strokeDasharray={i === 0 || i === yTicks.length - 1 ? "0" : "4,4"} />
        ))}
        {yTicks.map((v, i) => (
          <text key={`y-${i}`} x={PAD.left - 10} y={cy(v) + 4} textAnchor="end" fill="#6B7280" fontSize={11} fontWeight={500}>
            ${v >= 1000 ? v.toFixed(0) : v.toFixed(2)}
          </text>
        ))}
        {xTicks.map((d, i) => (
          <text key={`x-${i}`} x={cx(d.index)} y={H - 10} textAnchor="middle" fill="#6B7280" fontSize={11} fontWeight={500}>
            {period === "1d" || period === "5d"
              ? (language === "th" ? formatThaiDate(d.time, period) : formatEnglishDate(d.time, period))
              : new Date(d.time).toLocaleDateString(language === "th" ? "th-TH" : "en-US", { month: 'short' })}
          </text>
        ))}

        <path d={areaD} fill={fillGradientId} />
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round" filter="url(#glow)" />

        <AnimatePresence>
          {hov && hoveredIndex !== null && (
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <line x1={cx(hoveredIndex)} y1={PAD.top} x2={cx(hoveredIndex)} y2={H - PAD.bottom}
                stroke="rgba(173, 198, 255, 0.3)" strokeWidth={1} strokeDasharray="4,4" />
              <line x1={PAD.left} y1={cy(hov.price)} x2={W - PAD.right} y2={cy(hov.price)}
                stroke="rgba(173, 198, 255, 0.2)" strokeWidth={1} strokeDasharray="4,4" />
              <circle cx={cx(hoveredIndex)} cy={cy(hov.price)} r={8} fill={strokeColor} opacity={0.3} />
              <circle cx={cx(hoveredIndex)} cy={cy(hov.price)} r={5} fill={strokeColor} stroke="#1C1B1B" strokeWidth={2} />
              <g>
                <rect x={W - PAD.right + 5} y={cy(hov.price) - 12} width={60} height={24} rx={4} fill="#2A2A2A" stroke="rgba(255,255,255,0.1)" />
                <text x={W - PAD.right + 35} y={cy(hov.price) + 4} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={600}>
                  ${hov.price.toFixed(2)}
                </text>
              </g>
            </motion.g>
          )}
        </AnimatePresence>
      </svg>

      <AnimatePresence>
        {hov && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#2A2A2A]/95 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-2 shadow-2xl pointer-events-none z-10"
            style={{ minWidth: '200px' }}
          >
            <div className="text-xs text-gray-400 mb-1">
              {language === "th" ? formatFullThaiDate(hov.time, period) : formatFullEnglishDate(hov.time, period)}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white">${hov.price.toFixed(2)}</span>
              <span className="text-xs text-gray-400">USD</span>
            </div>
            {hoveredIndex !== null && hoveredIndex > 0 && (
              <div className={cn("text-xs mt-1 font-medium", hov.price >= data[0].price ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                {hov.price >= data[0].price ? "+" : ""}
                {((hov.price - data[0].price) / data[0].price * 100).toFixed(2)}%
                <span className="text-gray-500 ml-1">{t("fromStart")}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Data Fetching with retry & fallback ─────────────────────────────────────

const chartCache = new Map<string, { data: PricePoint[]; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

async function fetchChartData(symbol: string, period: TimePeriod, useCache = true): Promise<PricePoint[]> {
  const cacheKey = `${symbol}-${period}`;
  const cached = chartCache.get(cacheKey);

  // Return cached data if fresh
  if (useCache && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const { yahooInterval, yahooRange } = PERIOD_CONFIG[period];
  const url = `/api/chart?symbol=${encodeURIComponent(symbol)}&interval=${yahooInterval}&range=${yahooRange}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!res.ok) {
      if (cached) return cached.data; // Fallback to cache
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    let data: PricePoint[] = [];

    if (json?.chartData && Array.isArray(json.chartData)) {
      data = json.chartData.filter((dp: PricePoint) => dp.price > 0);
    } else if (json?.chart?.result?.[0]) {
      const result = json.chart.result[0];
      const timestamps: number[] = result.timestamp ?? [];
      const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
      data = timestamps
        .map((t: number, i: number) => ({ time: t * 1000, price: Number(closes[i]) || 0 }))
        .filter((dp: PricePoint) => dp.price > 0);
    }

    if (data.length > 0) {
      chartCache.set(cacheKey, { data, timestamp: Date.now() });
    }

    return data;
  } catch (err) {
    console.debug(`Chart fetch failed for ${symbol}, using fallback:`, err);
    if (cached) return cached.data;
    throw err;
  }
}

// ─── Timeline Generator ───────────────────────────────────────────────────────

function generateTimelineItems(asset: any, t: (key: string) => string, formatMoney: (amount: number, currency?: any) => string): TimelineItem[] {
  const items: TimelineItem[] = [];

  if (asset.avgCost) {
    items.push({
      id: 'initial',
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      label: t("initialPurchase"),
      description: t("boughtShares").replace("{shares}", (asset.shares || 0).toFixed(4)).replace("{price}", formatMoney(asset.avgCost)),
      value: asset.valueUSD,
      change: 0,
      status: 'completed',
      type: 'buy',
    });
  }

  const currentPrice = asset.shares ? asset.valueUSD / asset.shares : 0;
  const profitPercent = asset.avgCost ? ((currentPrice - asset.avgCost) / asset.avgCost) * 100 : 0;

  if (profitPercent > 10) {
    items.push({
      id: 'milestone1',
      date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      label: t("milestone10"),
      description: t("firstMilestone"),
      value: asset.valueUSD * 0.9,
      change: 10,
      status: 'completed',
      type: 'milestone',
    });
  }

  if (profitPercent > 25) {
    items.push({
      id: 'milestone2',
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      label: t("milestone25"),
      description: t("strongPerformance"),
      value: asset.valueUSD * 0.8,
      change: 25,
      status: 'completed',
      type: 'milestone',
    });
  }

  items.push({
    id: 'current',
    date: new Date().toISOString(),
    label: t("currentPosition"),
    description: t("holdingShares").replace("{shares}", (asset.shares || 0).toFixed(4)).replace("{value}", formatMoney(asset.valueUSD)),
    value: asset.valueUSD,
    change: profitPercent,
    status: 'current',
    type: 'hold',
  });

  const targetPrice = asset.avgCost ? asset.avgCost * 1.5 : currentPrice * 1.5;
  items.push({
    id: 'target',
    date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    label: t("target50"),
    description: t("targetPrice").replace("{price}", formatMoney(targetPrice)),
    value: asset.shares ? asset.shares * targetPrice : asset.valueUSD * 1.5,
    change: 50,
    status: 'target',
    type: 'milestone',
  });

  return items;
}

// ─── Asset Row (for drag-to-reorder edit mode) ────────────────────────────────

interface AssetRowProps {
  asset: any;
  isEditMode: boolean;
  onDeleteRequest: (asset: any) => void;
  formatMoney: (amount: number, currency?: any, rate?: number) => string;
  t: (key: string) => string;
  language: "en" | "th";
}

function AssetRow({ asset, isEditMode, onDeleteRequest, formatMoney, t, language }: AssetRowProps) {
  const isThaiAsset = asset.symbol.toUpperCase().endsWith('.BK') || asset.symbol.toUpperCase().endsWith('.TH');
  const shares = asset.shares || 0;
  const livePrice = shares > 0 ? (asset.valueUSD / shares) : 0;
  const avgCost = asset.avgCost || livePrice;
  const totalCost = avgCost * shares;
  const profit = asset.valueUSD - totalCost;
  const isProfit = profit >= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-all duration-200",
        isEditMode
          ? "bg-white/[0.03] border-white/10 cursor-grab active:cursor-grabbing"
          : "bg-transparent border-transparent hover:bg-white/5"
      )}
    >
      {/* Drag Handle */}
      <AnimatePresence>
        {isEditMode && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            className="text-gray-600 hover:text-gray-400 flex-shrink-0"
          >
            <GripVertical size={16} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logo */}
      <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 flex-shrink-0 overflow-hidden">
        <AssetLogo symbol={asset.symbol} name={asset.name} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white truncate">{asset.symbol}</span>
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
            isProfit ? "text-[#4EDEA3] bg-[#4EDEA3]/10" : "text-[#FFB4AB] bg-[#FFB4AB]/10"
          )}>
            {isProfit ? "+" : ""}{asset.change?.toFixed(2) ?? "0.00"}%
          </span>
        </div>
        <span className="text-[11px] text-gray-500 truncate block">{asset.name}</span>
      </div>

      {/* Value */}
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-bold text-white">
          {isThaiAsset ? formatMoney(asset.valueUSD, "THB", THB_RATE) : formatMoney(asset.valueUSD, "USD", 1)}
        </div>
        <div className={cn("text-[11px] font-semibold", isProfit ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
          {isProfit ? "+" : ""}{isThaiAsset ? formatMoney(profit, "THB", THB_RATE) : formatMoney(profit, "USD", 1)}
        </div>
      </div>

      {/* Delete button — only visible in edit mode, requires extra confirmation */}
      <AnimatePresence>
        {isEditMode && (
          <motion.button
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            onClick={() => onDeleteRequest(asset)}
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#FFB4AB]/10 border border-[#FFB4AB]/20 text-[#FFB4AB]/60 hover:text-[#FFB4AB] hover:bg-[#FFB4AB]/20 hover:border-[#FFB4AB]/40 transition-all flex items-center justify-center"
          >
            <Trash2 size={13} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AssetDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { assets, removeAsset, reorderAssets, t, formatMoney, language, currency } = useApp();

  const symbol = params.symbol as string;
  const assetIndex = assets.findIndex(a => a.symbol.toUpperCase() === symbol.toUpperCase());
  const asset = assets[assetIndex];

  const rawPeriod = searchParams.get("period") as TimePeriod;
  const initialPeriod: TimePeriod = VALID_PERIODS.includes(rawPeriod) ? rawPeriod : "1m";
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>(initialPeriod);

  const [chartData, setChartData] = useState<PricePoint[]>([]);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [fetchedLivePrice, setFetchedLivePrice] = useState<number | null>(null);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [orderedAssets, setOrderedAssets] = useState(assets);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Sync orderedAssets when assets change externally
  useEffect(() => {
    if (!isEditMode) setOrderedAssets(assets);
  }, [assets, isEditMode]);

  useEffect(() => {
    if (!symbol || !asset) return;

    const fetchData = async () => {
      // Don't clear existing data while loading - show old data until new data arrives
      setError(null);

      try {
        // Fetch 1d data first for live price (faster)
        if (selectedPeriod !== "1d") {
          fetchChartData(symbol, "1d", true).then((priceData) => {
            if (priceData.length > 0) {
              const last = priceData[priceData.length - 1].price;
              if (last > 0) setFetchedLivePrice(last);
            }
          }).catch(() => {});
        }

        // Fetch selected period data with cache
        const data = await fetchChartData(symbol, selectedPeriod, true);
        if (data.length > 0) {
          setChartData(data);
          const last = data[data.length - 1].price;
          if (last > 0) setFetchedLivePrice(prev => prev ?? last);
        }
      } catch (err: any) {
        console.debug("Chart fetch error (using cached):", err.message);
        // Don't show error if we have cached data
        if (chartData.length === 0) {
          setError(err.message);
        }
      }
    };

    fetchData();
  }, [symbol, selectedPeriod, asset]);

  // Fallback to asset's cached data if chartData is empty
  useEffect(() => {
    if (chartData.length === 0 && asset) {
      if (selectedPeriod === "1d" && asset.intradayData?.length) {
        setChartData(asset.intradayData);
      } else if (asset.chartData?.length) {
        setChartData(asset.chartData);
      }
    }
  }, [chartData.length, asset, selectedPeriod]);

  const canGoPrevious = assetIndex > 0;
  const canGoNext = assetIndex < assets.length - 1;

  const handlePreviousAsset = () => {
    if (canGoPrevious) {
      router.push(`/portfolio/${assets[assetIndex - 1].symbol}?period=${selectedPeriod}`);
    }
  };

  const handleNextAsset = () => {
    if (canGoNext) {
      router.push(`/portfolio/${assets[assetIndex + 1].symbol}?period=${selectedPeriod}`);
    }
  };

  const handleEditToggle = () => {
    if (isEditMode) {
      reorderAssets(orderedAssets);
      setIsEditMode(false);
    } else {
      setOrderedAssets([...assets]);
      setIsEditMode(true);
    }
  };

  const handleDeleteRequest = (targetAsset: any) => {
    setDeleteTarget(targetAsset);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    const newAssets = orderedAssets.filter(a => a.symbol !== deleteTarget.symbol);
    setOrderedAssets(newAssets);
    removeAsset(deleteTarget.symbol);
    setDeleteTarget(null);

    if (deleteTarget.symbol.toUpperCase() === symbol.toUpperCase()) {
      router.push("/portfolio");
    }
  };

  const periods: { key: TimePeriod; label: string; labelTh: string }[] = [
    { key: "1d",  label: "1D",  labelTh: "1วัน" },
    { key: "5d",  label: "5D",  labelTh: "5วัน" },
    { key: "1m",  label: "1M",  labelTh: "1ด."  },
    { key: "6m",  label: "6M",  labelTh: "6ด."  },
    { key: "ytd", label: "YTD", labelTh: "YTD"  },
    { key: "1y",  label: "1Y",  labelTh: "1ปี"  },
    { key: "5y",  label: "5Y",  labelTh: "5ปี"  },
  ];

  const dataToShow = chartData;
  const latestPoint = dataToShow[dataToShow.length - 1];
  const firstPoint = dataToShow[0];
  const hoveredPoint = hoveredIndex != null ? dataToShow[hoveredIndex] : null;
  const displayPoint = hoveredPoint ?? latestPoint;

  const currentPrice = displayPoint?.price ?? 0;
  const startPrice = firstPoint?.price ?? currentPrice;
  const priceChange = currentPrice - startPrice;
  const changePct = startPrice !== 0 ? (priceChange / startPrice) * 100 : 0;
  const isPositive = changePct >= 0;

  const shares = asset?.shares || 0;
  // Use freshly fetched price; fall back to chart latest, then context value
  const contextPrice = shares > 0 ? (asset!.valueUSD / shares) : 0;
  const livePrice = fetchedLivePrice ?? (currentPrice > 0 ? currentPrice : contextPrice);
  const avgCost = asset?.avgCost || livePrice;
  const totalCost = avgCost * shares;
  const totalValue = livePrice * shares;
  const profit = totalValue - totalCost;
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const isProfit = profit >= 0;

  const isThaiAsset = asset?.symbol.toUpperCase().endsWith('.BK') || asset?.symbol.toUpperCase().endsWith('.TH');

  const periodStats = useMemo(() => {
    if (dataToShow.length < 2) return null;
    const prices = dataToShow.map(d => d.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const start = prices[0];
    const end = prices[prices.length - 1];
    const periodReturn = ((end - start) / start) * 100;
    return { high, low, periodReturn };
  }, [dataToShow]);

  const timelineItems = useMemo(() => {
    if (!asset) return [];
    return generateTimelineItems(asset, t, formatMoney);
  }, [asset, t, formatMoney]);

  const dateLabel = displayPoint
    ? `${t("priceAsOf")}: ${language === "th" ? formatFullThaiDate(displayPoint.time, selectedPeriod) : formatFullEnglishDate(displayPoint.time, selectedPeriod)}`
    : "";

  // Show skeleton while Supabase is still loading assets (assets=[] on first render)
  if (!asset && assets.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto h-[calc(100vh-64px)] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-[#ADC6FF] animate-spin" />
        <span className="text-gray-500 text-sm">{language === "th" ? "กำลังโหลดข้อมูล..." : "Loading asset..."}</span>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold text-white mb-4">{t("assetNotFound")}</h1>
          <Link href="/portfolio" className="inline-flex items-center gap-2 px-6 py-3 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-sm hover:brightness-110 transition-all">
            <ArrowLeft size={16} />
            {t("backToPortfolio")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            assetName={deleteTarget.name}
            assetSymbol={deleteTarget.symbol}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>

      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto h-[calc(100vh-64px)] flex flex-col">
        {/* Header */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/portfolio" className="p-3 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all">
              <ArrowLeft size={20} />
            </Link>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousAsset}
                disabled={!canGoPrevious}
                className={cn("p-2 rounded-lg transition-all", canGoPrevious ? "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-600 cursor-not-allowed")}
              >
                <ChevronLeft size={20} />
              </button>

              <div className="flex items-center gap-3 px-4">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center relative overflow-hidden border border-white/5">
                  <AssetLogo symbol={asset.symbol} name={asset.name} />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-white">{asset.name}</h1>
                  <p className="text-gray-500 font-medium">{asset.symbol}</p>
                </div>
              </div>

              <button
                onClick={handleNextAsset}
                disabled={!canGoNext}
                className={cn("p-2 rounded-lg transition-all", canGoNext ? "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-600 cursor-not-allowed")}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          {/* Price Display */}
          <div className="flex flex-col items-end">
            <AnimatePresence mode="wait">
              <motion.div
                key={hoveredIndex ?? 'latest'}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-3"
              >
                <span className="text-4xl font-black text-white">
                  {isThaiAsset
                    ? formatMoney(hoveredIndex !== null ? currentPrice : livePrice, "THB", THB_RATE)
                    : formatMoney(hoveredIndex !== null ? currentPrice : livePrice, "USD", 1)}
                </span>
                <span className={cn("flex items-center gap-1 text-sm font-black px-3 py-1.5 rounded-full", isPositive ? "text-[#4EDEA3] bg-[#4EDEA3]/10" : "text-[#FFB4AB] bg-[#FFB4AB]/10")}>
                  {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {isPositive ? "+" : ""}{changePct.toFixed(2)}%
                </span>
              </motion.div>
            </AnimatePresence>
            {!isThaiAsset && currency === "THB" && (
              <span className="text-sm text-gray-500 mt-1 font-medium">{t("approx")} {formatMoney(livePrice, "THB", THB_RATE)}</span>
            )}
            {isThaiAsset && currency === "USD" && (
              <span className="text-sm text-gray-500 mt-1 font-medium">{t("approx")} {formatMoney(livePrice, "USD", 1 / THB_RATE)}</span>
            )}
            {dateLabel && <span className="text-xs text-gray-500 mt-0.5">{dateLabel}</span>}
          </div>
        </section>

        {/* Main Content */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
          {/* Left Side - Chart & Stats */}
          <div className="lg:col-span-2 space-y-6 overflow-y-auto">

            {/* ── 4-Card Stats Grid (separated) ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Price */}
              <StatCard
                label={t("livePrice")}
                icon={TrendingUp}
                isActive={hoveredIndex === null}
              >
                {fetchedLivePrice === null && isLoadingChart ? (
                  <div className="space-y-1.5 mt-1">
                    <div className="h-5 w-24 bg-white/10 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-white/5 rounded animate-pulse" />
                  </div>
                ) : (
                  <>
                    <div className="text-base font-black text-white truncate">
                      {isThaiAsset ? formatMoney(livePrice, "THB", THB_RATE) : formatMoney(livePrice, "USD", 1)}
                    </div>
                    {(!isThaiAsset && currency === "THB") && (
                      <div className="text-[11px] text-gray-500 mt-0.5">≈ {formatMoney(livePrice, "THB", THB_RATE)}</div>
                    )}
                    {(isThaiAsset && currency === "USD") && (
                      <div className="text-[11px] text-gray-500 mt-0.5">≈ {formatMoney(livePrice, "USD", 1 / THB_RATE)}</div>
                    )}
                    <div className={cn("text-[11px] font-bold mt-1", isPositive ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                      {isPositive ? "+" : ""}{changePct.toFixed(2)}%
                    </div>
                  </>
                )}
              </StatCard>

              {/* Avg Cost */}
              <StatCard label={t("avgCost")} icon={DollarSign}>
                <div className="text-base font-black text-white truncate">
                  {isThaiAsset ? formatMoney(avgCost, "THB", THB_RATE) : formatMoney(avgCost, "USD", 1)}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {shares.toLocaleString('en-US', { maximumFractionDigits: 4 })} {t("units") ?? "units"}
                </div>
                {(!isThaiAsset && currency === "THB") && (
                  <div className="text-[11px] text-gray-500">≈ {formatMoney(avgCost, "THB", THB_RATE)}</div>
                )}
              </StatCard>

              {/* Holdings */}
              <StatCard label={t("holdings")} icon={BarChart3}>
                <div className="text-base font-black text-white truncate">
                  {isThaiAsset ? formatMoney(totalValue, "THB", THB_RATE) : formatMoney(totalValue, "USD", 1)}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">{t("allocation")} {asset.allocation}</div>
                {(!isThaiAsset && currency === "THB") && (
                  <div className="text-[11px] text-gray-500 opacity-70">≈ {formatMoney(totalValue, "THB", THB_RATE)}</div>
                )}
                {(isThaiAsset && currency === "USD") && (
                  <div className="text-[11px] text-gray-500 opacity-70">≈ {formatMoney(totalValue, "USD", 1 / THB_RATE)}</div>
                )}
              </StatCard>

              {/* Unrealized P&L */}
              <StatCard
                label={t("totalReturn")}
                icon={isProfit ? ArrowUpRight : ArrowDownRight}
                isPositive={isProfit}
              >
                <div className={cn("text-base font-black truncate", isProfit ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                  {isProfit ? "+" : ""}
                  {isThaiAsset ? formatMoney(profit, "THB", THB_RATE) : formatMoney(profit, "USD", 1)}
                </div>
                <div className={cn("text-[11px] font-bold mt-0.5", isProfit ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                  {isProfit ? "+" : ""}{profitPercent.toFixed(2)}%
                </div>
                {(!isThaiAsset && currency === "THB") && (
                  <div className="text-[11px] text-gray-500 opacity-70">≈ {isProfit ? "+" : ""}{formatMoney(profit, "THB", THB_RATE)}</div>
                )}
                {(isThaiAsset && currency === "USD") && (
                  <div className="text-[11px] text-gray-500 opacity-70">≈ {isProfit ? "+" : ""}{formatMoney(profit, "USD", 1 / THB_RATE)}</div>
                )}
              </StatCard>
            </div>

            {/* Period Performance Stats */}
            {periodStats && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-4">
                <div className="bg-[#1C1B1B]/50 border border-white/5 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpRight size={14} className="text-[#4EDEA3]" />
                    <span className="text-xs text-gray-500">{t("periodHigh")}</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {isThaiAsset ? formatMoney(periodStats.high, "THB", THB_RATE) : formatMoney(periodStats.high, "USD", 1)}
                  </div>
                  {(!isThaiAsset && currency === "THB") && <div className="text-[10px] text-gray-500 mt-1">≈ {formatMoney(periodStats.high, "THB", THB_RATE)}</div>}
                </div>
                <div className="bg-[#1C1B1B]/50 border border-white/5 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDownRight size={14} className="text-[#FFB4AB]" />
                    <span className="text-xs text-gray-500">{t("periodLow")}</span>
                  </div>
                  <div className="text-lg font-bold text-white">
                    {isThaiAsset ? formatMoney(periodStats.low, "THB", THB_RATE) : formatMoney(periodStats.low, "USD", 1)}
                  </div>
                  {(!isThaiAsset && currency === "THB") && <div className="text-[10px] text-gray-500 mt-1">≈ {formatMoney(periodStats.low, "THB", THB_RATE)}</div>}
                </div>
                <div className="bg-[#1C1B1B]/50 border border-white/5 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity size={14} className="text-[#ADC6FF]" />
                    <span className="text-xs text-gray-500">{t("periodReturn")}</span>
                  </div>
                  <div className={cn("text-lg font-bold", periodStats.periodReturn >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {periodStats.periodReturn >= 0 ? "+" : ""}{periodStats.periodReturn.toFixed(2)}%
                  </div>
                </div>
              </motion.div>
            )}

            {/* Chart */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#1C1B1B] rounded-[1.5rem] border border-white/5 p-6">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                <p className="text-sm font-bold text-white">{t("performanceTitle")}</p>
                <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                  {periods.map((period) => (
                    <Link
                      key={period.key}
                      href={`/portfolio/${asset.symbol}?period=${period.key}`}
                      onClick={() => setSelectedPeriod(period.key)}
                      className={cn(
                        "px-2 py-1 text-[10px] font-black uppercase tracking-wide rounded-md transition-all",
                        selectedPeriod === period.key ? "bg-[#ADC6FF] text-[#00285d]" : "text-gray-400 hover:text-white"
                      )}
                    >
                      {t(`period${period.key.toLowerCase()}`)}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
                <Clock size={14} />
                <span>{language === "th" ? PERIOD_CONFIG[selectedPeriod].changeLabelTh : PERIOD_CONFIG[selectedPeriod].changeLabel}</span>
                {dataToShow.length > 0 && <span className="text-gray-600">• {dataToShow.length} {t("dataPoints")}</span>}
              </div>

              <div className="h-[400px] w-full relative">
                <AnimatePresence mode="wait">
                  {isLoadingChart ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-8 h-8 text-[#ADC6FF] animate-spin" />
                      <span className="text-gray-500 text-sm">{t("loadingChartData")}</span>
                    </motion.div>
                  ) : error ? (
                    <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col items-center justify-center text-center px-4">
                      <div className="text-[#FFB4AB] mb-2"><Activity size={32} /></div>
                      <p className="text-gray-400 text-sm mb-1">{t("failedToLoadData")}</p>
                      <p className="text-gray-600 text-xs">{error}</p>
                    </motion.div>
                  ) : dataToShow && dataToShow.length > 1 ? (
                    <motion.div key="chart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full">
                      <SVGChart
                        data={dataToShow} isPositive={isPositive} period={selectedPeriod}
                        hoveredIndex={hoveredIndex} onHover={setHoveredIndex}
                        language={language} symbol={asset.symbol} t={t}
                      />
                    </motion.div>
                  ) : (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                      <BarChart3 size={40} className="mb-2 opacity-30" />
                      <p className="text-lg font-medium">{t("noHistoricalData")}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#4EDEA3]" /><span>{t("uptrend")}</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#FFB4AB]" /><span>{t("downtrend")}</span></div>
                </div>
                <div className="text-xs text-gray-600">{t("hoverToSeePrice")}</div>
              </div>
            </motion.div>
          </div>

          {/* Right Side - Portfolio / Investment Journey */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-[#1C1B1B] rounded-[1.5rem] border border-white/5 flex flex-col overflow-hidden">
            {/* Panel Header */}
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Target className="text-[#ADC6FF]" size={20} />
                  {isEditMode ? (language === "th" ? "จัดการ Portfolio" : "Manage Portfolio") : t("investmentJourney")}
                </h2>

                {/* Edit / Done button */}
                <button
                  onClick={handleEditToggle}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
                    isEditMode
                      ? "bg-[#4EDEA3]/15 border border-[#4EDEA3]/30 text-[#4EDEA3] hover:bg-[#4EDEA3]/25"
                      : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
                  )}
                >
                  {isEditMode ? <><Check size={13} />{language === "th" ? "บันทึก" : "Done"}</> : <><Pencil size={13} />{language === "th" ? "แก้ไข" : "Edit"}</>}
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-1">
                {isEditMode
                  ? (language === "th" ? "ลากเพื่อเรียงลำดับ • กด 🗑 เพื่อลบ" : "Drag to reorder • tap 🗑 to remove")
                  : `${assets.length} ${t("assetsInPortfolio")}`
                }
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                {isEditMode ? (
                  /* Edit Mode: Drag-to-reorder list */
                  <motion.div
                    key="edit-mode"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Reorder.Group
                      axis="y"
                      values={orderedAssets}
                      onReorder={setOrderedAssets}
                      className="space-y-1"
                    >
                      {orderedAssets.map((a) => (
                        <Reorder.Item
                          key={a.symbol}
                          value={a}
                          className="list-none"
                        >
                          <AssetRow
                            asset={a}
                            isEditMode={true}
                            onDeleteRequest={handleDeleteRequest}
                            formatMoney={formatMoney}
                            t={t}
                            language={language}
                          />
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  </motion.div>
                ) : (
                  /* Normal Mode: Investment Journey */
                  <motion.div
                    key="journey-mode"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <VerticalTimeline
                      items={timelineItems}
                      formatMoney={(amount, currency) => formatMoney(amount, currency as any)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
}

// ─── Sub Components ──────────────────────────────────────────────────────────

const AssetLogo = ({ symbol, name, className }: { symbol: string; name: string; className?: string }) => {
  const [imgError, setImgError] = useState(false);
  const isCrypto = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP', 'BNB'].includes(symbol.toUpperCase());

  if (imgError) {
    return (
      <div className={cn("w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1C1B1B] to-[#2A2A2A] text-[#ADC6FF] font-black rounded-lg overflow-hidden text-xs", className)}>
        {symbol.slice(0, 3).toUpperCase()}
      </div>
    );
  }

  const src = isCrypto
    ? `https://cryptologos.cc/logos/${name.toLowerCase().replace(/\s+/g, '-')}-${symbol.toLowerCase()}-logo.png`
    : `https://eodhd.com/img/logos/US/${symbol.toUpperCase()}.png`;

  return (
    <img
      src={src}
      className={cn("w-full h-full object-contain p-1", className)}
      alt={symbol}
      onError={() => setImgError(true)}
    />
  );
};

// ─── StatCard (refactored to accept children) ─────────────────────────────────

interface StatCardProps {
  label: string;
  icon: React.ElementType;
  isPositive?: boolean;
  isActive?: boolean;
  children: React.ReactNode;
}

function StatCard({ label, icon: Icon, isPositive, isActive, children }: StatCardProps) {
  const positive = isPositive ?? true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-[#1C1B1B] p-4 rounded-2xl border transition-all duration-300",
        isActive ? "border-[#ADC6FF]/30 shadow-lg shadow-[#ADC6FF]/5" : "border-white/5 hover:border-white/10"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={cn("p-1.5 rounded-lg transition-colors", positive ? "bg-[#4EDEA3]/10" : "bg-white/5")}>
          <Icon size={14} className={positive ? "text-[#4EDEA3]" : "text-gray-400"} />
        </div>
      </div>
      {children}
    </motion.div>
  );
}