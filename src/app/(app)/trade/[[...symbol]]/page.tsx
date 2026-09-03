"use client";
import React, { useState, useCallback, useEffect } from "react";
import { Search, TrendingUp, Shield, Target, Activity, BarChart3, Zap, Eye, XCircle, Loader2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import { analyzeTradeSignal, scanMarketSignals, computePyramidLevels, PyramidPlan, searchSymbols } from "../actions";

type SearchResult = Awaited<ReturnType<typeof searchSymbols>>[number];

interface SignalData {
  symbol: string; market: string; name: string; price: number; changePct: number;
  confidence: number; label: string; buyCount: number; currency: string;
  signals: {
    rsi: { value: number; buy: boolean };
    macd: { macd: number; signal: number; histogram: number; crossover: boolean; buy: boolean };
    ema: { ema9: number; ema21: number; crossover: boolean; above: boolean; buy: boolean };
    volume: { current: number; avg10: number; ratio: number; buy: boolean };
    vwap: { value: number; position: string; buy: boolean };
    adx: { value: number; trend: boolean; buy: boolean };
  };
  trade: { entry: number; tp: number; tpPct: number; sl: number; slPct: number; rr: number };
  chartData: { time: number; price: number }[];
  stoch: { k: number; d: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; crossover: boolean };
  ma: Record<number, number>;
  trendlines: { uptrend: any; downtrend: any; currentTrend: 'UP' | 'DOWN' | 'SIDEWAYS'; trendStrength: number; };
  priceAction: { patterns: Array<{ name: string; type: 'BULLISH' | 'BEARISH'; index: number; strength: number }>; latestBullish: string | null; latestBearish: string | null; };
  smc: { orderBlocks: Array<{ type: string; high: number; low: number; mid: number; index: number; strength: number; isActive: boolean }>; fvg: Array<{ type: string; top: number; bottom: number; mid: number; index: number; isFilled: boolean }>; supplyZones: Array<{ high: number; low: number; strength: number }>; demandZones: Array<{ high: number; low: number; strength: number }>; nearestDemand: { high: number; low: number; strength: number } | null; nearestSupply: { high: number; low: number; strength: number } | null; priceInDemand: boolean; priceInSupply: boolean; };
  speedLines: { majorHigh: number; majorLow: number; line1_3: number; line2_3: number; currentPosition: string; buyZone: boolean; description: string; };
}

function MiniChart({ data, positive }: { data: { time: number; price: number }[]; positive: boolean }) {
  if (data.length < 2) return null;
  const prices = data.map(d => d.price);
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1;
  const W = 200, H = 60;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * W},${H - ((d.price - min) / range) * H}`).join(" ");
  const color = positive ? "#4EDEA3" : "#FFB4AB";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16">
      <defs>
        <linearGradient id={`cg-${positive}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#cg-${positive})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 85 ? "#4EDEA3" : value >= 70 ? "#ADC6FF" : value >= 50 ? "#E9C349" : "#FFB4AB";
  return (
    <div className="relative w-20 h-20">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
        <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${value} ${100 - value}`} strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black text-white">{value}%</span>
      </div>
    </div>
  );
}

function labelStyle(label: string) {
  if (label === "STRONG BUY") return "bg-[#4EDEA3]/15 text-[#4EDEA3] border-[#4EDEA3]/30";
  if (label === "BUY") return "bg-[#ADC6FF]/15 text-[#ADC6FF] border-[#ADC6FF]/30";
  if (label === "WATCH") return "bg-[#E9C349]/15 text-[#E9C349] border-[#E9C349]/30";
  return "bg-[#FFB4AB]/15 text-[#FFB4AB] border-[#FFB4AB]/30";
}

function labelIcon(label: string) {
  if (label === "STRONG BUY") return <Zap size={14} />;
  if (label === "BUY") return <TrendingUp size={14} />;
  if (label === "WATCH") return <Eye size={14} />;
  return <XCircle size={14} />;
}

export default function TradePage() {
  const { t, language, formatMoney } = useApp();
  const isTh = language === "th";
  const params = useParams();
  const router = useRouter();
  
  const [scanResults, setScanResults] = useState<SignalData[]>([]);
  const [scanLoading, setScanLoading] = useState(true);
  const [scanTab, setScanTab] = useState<'all' | 'set' | 'us'>('all');
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>(undefined as any);

  const [scanProgress, setScanProgress] = useState<{
    phase: 'idle' | 'fetching_universe' | 'pre_filtering' | 'analyzing' | 'done';
    count: number;
    total: number;
    label: string;
    pct: number;
  }>({ phase: 'idle', count: 0, total: 0, label: '', pct: 0 });
  const [result, setResult] = useState<SignalData | null>(null);
  const [error, setError] = useState("");
  const [pyramidPlan, setPyramidPlan] = useState<PyramidPlan | null>(null);
  const [timeframe, setTimeframe] = useState<'DAY' | 'SWING' | 'MONTH'>('DAY');

  const fetchScan = useCallback(async (market: 'SET' | 'US_STANDARD' | 'ALL' = 'ALL') => {
    setScanLoading(true);
    try {
      const results = await scanMarketSignals(market);
      setScanResults(results as SignalData[]);
      setLastScanTime(new Date());
    } catch (e) { console.error("Scan failed", e); }
    setScanLoading(false);
  }, []);

  useEffect(() => { fetchScan('ALL'); }, [fetchScan]);

  useEffect(() => {
    if (!scanLoading) {
      setScanProgress({ phase: 'done', count: 0, total: 0, label: '', pct: 100 });
      return;
    }
    setScanProgress({ phase: 'fetching_universe', count: 0, total: 0, label: 'กำลังดึงรายชื่อหุ้นทั้งหมด...', pct: 30 });
    const t1 = setTimeout(() => setScanProgress(p => ({ ...p, phase: 'pre_filtering', label: 'Pre-filter หุ้นที่ active วันนี้...', pct: 65 })), 1500);
    const t2 = setTimeout(() => setScanProgress(p => ({ ...p, phase: 'analyzing', label: 'วิเคราะห์ technical indicators...', pct: 90 })), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [scanLoading]);

  const handleQueryChange = (value: string) => {
    setQuery(value.toUpperCase());
    clearTimeout(debounceRef.current);
    if (value.length < 1) { 
      setSuggestions([]); 
      setShowSuggestions(false);
      return; 
    }
    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchSymbols(value);
        setSuggestions(results);
        setShowSuggestions(true);
      } catch {}
      setSearchLoading(false);
    }, 300);
  };

  useEffect(() => {
    const handler = () => setShowSuggestions(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleDataResult = async (data: SignalData, tf: 'DAY'|'SWING'|'MONTH' = timeframe) => {
    setResult(data);
    setQuery(data.symbol.replace(".BK", ""));
    if (data.label === "BUY" || data.label === "STRONG BUY" || data.label === "WATCH") {
      const atr = Math.abs(data.trade.entry - data.trade.sl) / 1.2;
      const plan = await computePyramidLevels(
        data.trade.entry, data.trade.sl, data.trade.tp, atr,
        data.market as "SET"|"US", tf,
        {
          ma20: data.ma[20], ma50: data.ma[50],
          demandLow: data.smc.nearestDemand?.low, demandHigh: data.smc.nearestDemand?.high,
          supplyLow: data.smc.nearestSupply?.low, supplyHigh: data.smc.nearestSupply?.high,
          vwap: data.signals.vwap.value
        }
      );
      setPyramidPlan(plan);
    } else { setPyramidPlan(null); }
  };

  const analyze = useCallback(async (sym: string, tf: 'DAY'|'SWING'|'MONTH' = timeframe, silent = false) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    if (!silent) { setSearchLoading(true); setError(""); }
    try {
      const { tfData, pyramidPlan: pPlan, advice, ...data } = await analyzeTradeSignal(s) as any;
      await handleDataResult(data, tf);
    } catch (e: any) { if (!silent) setError(e.message || "Error"); }
    if (!silent) setSearchLoading(false);
  }, []);

  // Poll for live price
  useEffect(() => {
    if (!result) return;
    const interval = setInterval(() => {
      analyze(result.symbol.replace(".BK", ""), timeframe, true);
    }, 15000); // 15s polling
    return () => clearInterval(interval);
  }, [result?.symbol, timeframe, analyze]);

  // Handle Path /trade/[symbol]
  useEffect(() => {
    const urlSymbol = params.symbol?.[0];
    if (urlSymbol && urlSymbol.toUpperCase() !== query.toUpperCase()) {
      setQuery(urlSymbol);
      analyze(urlSymbol);
    }
  }, [params.symbol]);

  const handleSubmit = (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (query.trim()) {
      router.push(`/trade/${query.trim().toUpperCase()}`);
    }
  };
  const cur = (v: number, c?: string) => {
    const curr = (c || result?.currency || "USD") as "USD" | "THB" | "JPY" | "EUR";
    return formatMoney(v, curr, 1);
  };

  const filteredScanResults = scanResults.filter(r => {
    if (scanTab === 'all') return true;
    if (scanTab === 'set') return r.market === 'SET';
    if (scanTab === 'us') return r.market === 'US';
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <span className="text-[#E9C349] uppercase tracking-wide text-xs font-black mb-1 block">Signal Analysis Pro</span>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tighter">{isTh ? "ผู้ช่วยเทรดรายวัน" : "Trade Assistant"}</h1>
        <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mt-1">SMC • PA • Trend • Momentum</p>
      </motion.div>

      {/* SECTION 1: Scan */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(['all', 'set', 'us'] as const).map(tab => (
              <button key={tab} onClick={() => setScanTab(tab)}
                className={cn("px-4 py-1.5 rounded-full text-xs font-black uppercase transition-all",
                  scanTab === tab ? "bg-white text-black" : "bg-white/5 text-gray-500 hover:text-white"
                )}>
                {tab === 'all' ? "All" : tab === 'set' ? "🇹🇭 SET" : "🇺🇸 US"}
              </button>
            ))}
          </div>
          <button onClick={() => fetchScan('ALL')} className="flex items-center gap-1.5 text-gray-500 hover:text-white transition-colors text-xs font-bold">
            <RefreshCw size={14} className={scanLoading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">
              {lastScanTime ? (isTh ? `อัปเดตเมื่อ ${Math.round((Date.now() - lastScanTime.getTime()) / 60000)} นาทีที่แล้ว` : `Updated ${Math.round((Date.now() - lastScanTime.getTime()) / 60000)} mins ago`) : (isTh ? "รีเฟรช" : "Refresh")}
            </span>
          </button>
        </div>

        {scanLoading ? (
          <div className="bg-[#1C1B1B] border border-white/10 rounded-2xl p-6 mb-4">
            <div className="flex justify-between items-end mb-2">
              <div>
                <div className="text-sm font-black text-white flex items-center gap-2"><Search size={16} className="animate-pulse text-[#4EDEA3]" /> {isTh ? "กำลัง scan ตลาด..." : "Scanning markets..."}</div>
                <div className="text-xs text-gray-400 mt-1">Phase: {scanProgress.label}</div>
              </div>
              <div className="text-xs font-bold text-[#4EDEA3]">{scanProgress.pct}%</div>
            </div>
            <div className="w-full bg-black rounded-full h-2 overflow-hidden">
              <div className="bg-[#4EDEA3] h-full transition-all duration-500 ease-out" style={{ width: `${scanProgress.pct}%` }} />
            </div>
          </div>
        ) : filteredScanResults.length > 0 ? (
          <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {filteredScanResults.map(res => (
              <motion.button key={res.symbol} onClick={() => handleDataResult(res)} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                className="bg-[#1C1B1B] hover:bg-[#252525] transition-all rounded-2xl p-4 border border-white/5 text-left flex flex-col gap-2 relative overflow-hidden group">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span>{res.market === 'SET' ? '🇹🇭' : '🇺🇸'}</span>
                    <span className="font-black text-white text-sm">{res.symbol.replace(".BK", "")}</span>
                  </div>
                  <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-black border", labelStyle(res.label))}>{res.label}</div>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-black text-white">{cur(res.price, res.currency)}</span>
                  <span className={cn("text-[10px] font-black", res.changePct >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {res.changePct >= 0 ? "+" : ""}{res.changePct}%
                  </span>
                </div>
                <div className="flex gap-1 mt-1">
                  {res.smc?.priceInDemand && <span className="bg-blue-500/20 text-blue-400 text-[9px] px-1.5 py-0.5 rounded font-black">📐 SMC</span>}
                  {res.priceAction?.latestBullish && <span className="bg-orange-500/20 text-orange-400 text-[9px] px-1.5 py-0.5 rounded font-black">🕯️ PA</span>}
                  {res.stoch?.signal === 'BUY' && <span className="bg-purple-500/20 text-purple-400 text-[9px] px-1.5 py-0.5 rounded font-black">📊 STOCH</span>}
                  {res.trendlines?.currentTrend === 'UP' && <span className="bg-green-500/20 text-green-400 text-[9px] px-1.5 py-0.5 rounded font-black">📈 TREND</span>}
                </div>
                <div className="w-full bg-black rounded-full h-1 mt-1 overflow-hidden">
                  <div className="bg-[#ADC6FF] h-full" style={{ width: `${res.confidence}%` }} />
                </div>
              </motion.button>
            ))}
          </motion.div>
        ) : (
          <div className="bg-[#1C1B1B] rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center gap-3 text-gray-500">
            <Shield size={24} className="opacity-50" />
            <p className="text-sm font-bold">{isTh ? "ไม่มีสัญญาณชัดเจนวันนี้" : "No clear signals today"}</p>
          </div>
        )}
      </section>

      {/* SECTION 2: Search */}
      <section>
        <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative max-w-2xl mx-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={query} onChange={e => handleQueryChange(e.target.value)}
                onFocus={() => { if(suggestions.length > 0) setShowSuggestions(true); }}
                placeholder="พิมพ์ชื่อหุ้น เช่น NVDA, AOT, TSLA..."
                className="w-full bg-[#1C1B1B] border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm font-bold outline-none focus:border-[#ADC6FF]/50 transition-all placeholder:text-gray-600"
              />
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-[#1C1B1B] border border-white/10 rounded-2xl overflow-hidden z-50 shadow-2xl">
                    {suggestions.map((s, i) => (
                      <div key={i} onClick={() => { setQuery(s.symbol); setShowSuggestions(false); router.push(`/trade/${s.symbol}`); }}
                        className="p-3 hover:bg-white/5 cursor-pointer flex justify-between items-center border-b border-white/5 last:border-0 transition-colors">
                        <div className="flex items-center gap-2">
                          <span>{s.market === 'SET' ? '🇹🇭' : '🇺🇸'}</span>
                          <span className="text-white font-bold text-sm">{s.symbol}</span>
                          <span className="text-gray-400 text-xs truncate max-w-[150px] sm:max-w-[200px]">{s.name}</span>
                        </div>
                        {s.exchange && <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] font-bold text-gray-300">{s.exchange}</span>}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button type="submit" disabled={searchLoading || !query.trim()} className={cn(
              "px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wide transition-all flex items-center gap-2",
              searchLoading ? "bg-white/5 text-gray-500" : "bg-[#ADC6FF] text-[#00285d] hover:brightness-110"
            )}>
              {searchLoading ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />} {isTh ? "วิเคราะห์" : "Analyze"}
            </button>
          </div>
          <p className="text-center text-xs text-gray-500 font-bold mt-3">{isTh ? "หรือเลือกจากสัญญาณด้านบน ↑" : "Or select a signal above ↑"}</p>
        </motion.form>
      </section>

      {error && <div className="bg-[#FFB4AB]/10 border border-[#FFB4AB]/20 rounded-2xl p-4 text-sm text-[#FFB4AB] font-bold">⚠️ {error}</div>}

      {/* SECTION 3 & 4: Detail View */}
      <AnimatePresence mode="wait">
        {result && !searchLoading && (
          <motion.div key={result.symbol} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            
            {/* Header Score Summary */}
            <div className="bg-[#1C1B1B] rounded-3xl p-6 border border-white/5">
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{result.market === "SET" ? "🇹🇭" : "🇺🇸"}</span>
                    <div>
                      <h2 className="text-2xl font-black text-white">{result.symbol}</h2>
                      <p className="text-xs text-gray-500">{result.name} • {result.market}</p>
                    </div>
                    <div className={cn("ml-auto px-3 py-1.5 rounded-full text-xs font-black border flex items-center gap-1.5", labelStyle(result.label))}>
                      {labelIcon(result.label)} {result.label} {result.confidence}%
                    </div>
                  </div>
                  <div className="flex items-baseline gap-3 mb-4">
                    <span className="text-4xl font-black text-white">{cur(result.price)}</span>
                    <span className={cn("text-sm font-black", result.changePct >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                      {result.changePct >= 0 ? "+" : ""}{result.changePct}%
                    </span>
                  </div>
                  <MiniChart data={result.chartData} positive={result.changePct >= 0} />
                  
                  {/* Timeframe Selector */}
                  <div className="flex gap-2 mt-4 p-1 bg-black/40 rounded-xl border border-white/5 inline-flex">
                    {(['DAY', 'SWING', 'MONTH'] as const).map(tf => (
                      <button
                        key={tf}
                        onClick={() => { setTimeframe(tf); analyze(result.symbol, tf); }}
                        className={cn("px-4 py-1.5 rounded-lg text-xs font-black transition-all",
                          timeframe === tf ? "bg-[#ADC6FF] text-[#00285d]" : "text-gray-500 hover:text-white"
                        )}
                      >
                        {tf === 'DAY' ? 'Day Trade' : tf === 'SWING' ? 'Swing Trade' : 'Month Trade'}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Scoring Breakdown */}
                <div className="flex-1 grid grid-cols-2 gap-4">
                  {[
                    { l: 'TREND', v: result.trendlines.currentTrend, s: result.trendlines.trendStrength },
                    { l: 'MOMENTUM', v: result.stoch.signal, s: result.signals.rsi.buy ? 100 : 50 },
                    { l: 'STRUCTURE', v: result.smc.priceInDemand ? 'In Demand' : 'Neutral', s: result.smc.priceInDemand ? 100 : 50 },
                    { l: 'PATTERN', v: result.priceAction.latestBullish || 'None', s: result.priceAction.latestBullish ? 100 : 0 }
                  ].map(score => (
                    <div key={score.l} className="bg-black/20 p-3 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-black text-gray-500">{score.l}</span>
                        <span className="text-xs font-bold text-white">{score.v}</span>
                      </div>
                      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#ADC6FF] h-full" style={{ width: `${score.s}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Trade Levels Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {[
                { label: "Entry", value: cur(result.trade.entry), icon: <Target size={14} />, color: "#ADC6FF", bg: "#ADC6FF" },
                { label: "Target (TP)", value: `${cur(result.trade.tp)} (+${result.trade.tpPct}%)`, icon: <TrendingUp size={14} />, color: "#4EDEA3", bg: "#4EDEA3" },
                { label: "Stop Loss", value: `${cur(result.trade.sl)} (-${result.trade.slPct}%)`, icon: <Shield size={14} />, color: "#FFB4AB", bg: "#FFB4AB" },
                { label: "Risk:Reward", value: `1:${result.trade.rr}`, icon: <BarChart3 size={14} />, color: result.trade.rr >= 1.5 ? "#4EDEA3" : "#E9C349", bg: result.trade.rr >= 1.5 ? "#4EDEA3" : "#E9C349" },
              ].map(item => (
                <div key={item.label} className="bg-[#1C1B1B] rounded-2xl p-4 border border-white/5 relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-16 h-16 blur-2xl rounded-full opacity-10" style={{ backgroundColor: item.bg }} />
                  <div className="flex items-center gap-2 mb-2" style={{ color: item.color }}>{item.icon}<span className="text-[10px] font-black uppercase">{item.label}</span></div>
                  <p className="text-lg font-black text-white">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Panel A: Price Action */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-[#1C1B1B] rounded-3xl p-6 border border-white/5">
                <h3 className="text-sm font-black text-white mb-4">🕯️ Price Action Patterns (ล่าสุด)</h3>
                {result.priceAction.patterns.length > 0 ? (
                  <div className="space-y-2">
                    {result.priceAction.patterns.slice(-3).map((p, i) => (
                      <div key={i} className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                        <div>
                          <div className="text-sm font-bold text-white">{p.name}</div>
                          <div className="text-[10px] text-gray-500">{p.index} แท่งที่แล้ว</div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-black", p.type === 'BULLISH' ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" : "bg-[#FFB4AB]/10 text-[#FFB4AB]")}>{p.type}</span>
                          <span className="text-[#E9C349] text-xs">{'★'.repeat(p.strength)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="text-xs text-gray-500 text-center py-4">ไม่พบ pattern ชัดเจนใน 5 แท่งล่าสุด</div>}
              </motion.div>

              {/* Panel B: SMC Analysis */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-[#1C1B1B] rounded-3xl p-6 border border-white/5">
                <h3 className="text-sm font-black text-white mb-4">🏦 Smart Money Concepts</h3>
                <div className="space-y-4">
                  {result.smc.nearestDemand && (
                    <div className="border-l-2 border-[#4EDEA3] pl-3 py-1">
                      <div className="text-[10px] font-black text-gray-500">📗 Nearest Demand Zone</div>
                      <div className="text-sm font-bold text-white">{cur(result.smc.nearestDemand.low)} – {cur(result.smc.nearestDemand.high)}</div>
                    </div>
                  )}
                  {result.smc.nearestSupply && (
                    <div className="border-l-2 border-[#FFB4AB] pl-3 py-1">
                      <div className="text-[10px] font-black text-gray-500">📕 Nearest Supply Zone</div>
                      <div className="text-sm font-bold text-white">{cur(result.smc.nearestSupply.low)} – {cur(result.smc.nearestSupply.high)}</div>
                    </div>
                  )}
                  {result.smc.priceInDemand && <div className="bg-[#4EDEA3]/10 text-[#4EDEA3] p-2 rounded-lg text-xs font-bold border border-[#4EDEA3]/20">✅ ราคาอยู่ใน Demand Zone — โซน BUY ที่ดี</div>}
                </div>
              </motion.div>

              {/* Panel C: Speed Lines & Trendlines */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-[#1C1B1B] rounded-3xl p-6 border border-white/5">
                <h3 className="text-sm font-black text-white mb-4">📐 Speed Lines & Trendlines</h3>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg">
                    <span className="text-xs font-bold text-gray-400">Current Trend</span>
                    <span className="font-black text-white">{result.trendlines.currentTrend} {result.trendlines.currentTrend === 'UP' ? '↑' : result.trendlines.currentTrend === 'DOWN' ? '↓' : '→'}</span>
                  </div>
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg">
                    <span className="text-xs font-bold text-gray-400">Speed Line 1/3</span>
                    <span className="font-black text-white">{cur(result.speedLines.line1_3)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg">
                    <span className="text-xs font-bold text-gray-400">Speed Line 2/3</span>
                    <span className="font-black text-white">{cur(result.speedLines.line2_3)}</span>
                  </div>
                  <div className="text-xs text-gray-400 text-center">{result.speedLines.description}</div>
                  {result.speedLines.buyZone && <div className="bg-[#4EDEA3]/10 text-[#4EDEA3] text-center p-2 rounded-lg text-xs font-bold">อยู่ในโซน Speed Line Support</div>}
                </div>
              </motion.div>

              {/* Panel D: Moving Averages */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-[#1C1B1B] rounded-3xl p-6 border border-white/5">
                <h3 className="text-sm font-black text-white mb-4">📊 Moving Averages</h3>
                <div className="space-y-2">
                  {[20, 50, 200].map(p => (
                    <div key={p} className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                      <span className="text-xs font-black text-gray-400">MA{p}</span>
                      <span className="text-sm font-black text-white">{cur(result.ma[p])}</span>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded font-black", result.price > result.ma[p] ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" : "bg-[#FFB4AB]/10 text-[#FFB4AB]")}>
                        {result.price > result.ma[p] ? 'ราคาอยู่เหนือ MA' : 'ราคาอยู่ใต้ MA'}
                      </span>
                    </div>
                  ))}
                  {result.price > result.ma[20] && result.ma[20] > result.ma[50] && <div className="text-center text-xs font-bold text-[#4EDEA3] mt-2">MA20 &gt; MA50 — Strong Uptrend</div>}
                </div>
              </motion.div>

              {/* Panel E: Stochastic */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-[#1C1B1B] rounded-3xl p-6 border border-white/5">
                <h3 className="text-sm font-black text-white mb-4">〜 Stochastic (14,3)</h3>
                <div className="flex items-center gap-6 mb-4">
                  <div>
                    <div className="text-[10px] text-gray-500 font-black">%K LINE</div>
                    <div className="text-2xl font-black text-[#ADC6FF]">{result.stoch.k}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-500 font-black">%D LINE</div>
                    <div className="text-2xl font-black text-white">{result.stoch.d}</div>
                  </div>
                  <div className="ml-auto">
                    <span className={cn("px-3 py-1 rounded-lg text-xs font-black border",
                      result.stoch.k < 25 ? "bg-[#4EDEA3]/10 text-[#4EDEA3] border-[#4EDEA3]/30" : result.stoch.k > 75 ? "bg-[#FFB4AB]/10 text-[#FFB4AB] border-[#FFB4AB]/30" : "bg-white/5 text-gray-400 border-white/10"
                    )}>{result.stoch.k < 25 ? 'OVERSOLD' : result.stoch.k > 75 ? 'OVERBOUGHT' : 'NEUTRAL'}</span>
                  </div>
                </div>
                {result.stoch.crossover && result.stoch.signal === 'BUY' && (
                  <div className="bg-[#4EDEA3]/10 text-[#4EDEA3] text-center p-2 rounded-lg text-xs font-bold animate-pulse border border-[#4EDEA3]/30">🔔 Bullish Crossover ✓</div>
                )}
              </motion.div>
            </div>

            {/* Pyramid Position Panel */}
            {pyramidPlan && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="bg-[#1C1B1B] rounded-3xl p-6 border border-white/5 space-y-6">
                
                <div>
                  <h3 className="text-sm font-black text-white mb-4 flex items-center justify-between">
                    <span className="flex items-center gap-2">📐 แผนเข้าซื้อ (Entry Strategy - {pyramidPlan.timeframe})</span>
                    <span className="text-xs text-gray-400 font-normal px-2 py-1 bg-white/5 rounded-md">Total Weight: 100%</span>
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/20">
                    <table className="w-full text-left text-sm min-w-[500px]">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="p-3 text-xs font-black text-gray-500 uppercase">ไม้</th>
                          <th className="p-3 text-xs font-black text-gray-500 uppercase">ราคา Entry</th>
                          <th className="p-3 text-xs font-black text-gray-500 uppercase">สัดส่วน</th>
                          <th className="p-3 text-xs font-black text-gray-500 uppercase">เหตุผล (Zone)</th>
                          <th className="p-3 text-xs font-black text-gray-500 uppercase text-right">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pyramidPlan.entries.map((entry, i) => (
                          <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                            <td className="p-3 text-xs font-bold text-white whitespace-nowrap">{entry.label}</td>
                            <td className="p-3 text-sm font-black text-white">{cur(entry.price)}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-400 w-8">{entry.sizePercent}%</span>
                                <div className="w-16 h-1.5 bg-black rounded-full overflow-hidden">
                                  <div className="h-full bg-[#ADC6FF]" style={{ width: `${entry.sizePercent}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="text-[10px] font-bold text-gray-400 block">{entry.reason}</span>
                            </td>
                            <td className="p-3 text-right">
                              {entry.status === 'READY' ? <span className="text-[10px] font-black px-2 py-1 bg-[#4EDEA3]/10 text-[#4EDEA3] rounded border border-[#4EDEA3]/20">🟢 เข้าได้เลย</span> :
                               entry.status === 'PASSED' ? <span className="text-[10px] font-black px-2 py-1 bg-white/5 text-gray-500 rounded border border-white/10">⚪ ราคาผ่านไปแล้ว</span> :
                               <span className="text-[10px] font-black px-2 py-1 bg-[#E9C349]/10 text-[#E9C349] rounded border border-[#E9C349]/20">🟡 รอราคาตกถึงจุด</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-black text-white mb-4 flex items-center gap-2">🎯 แผนทำกำไร (Take Profit Zones)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {pyramidPlan.takeProfits.map((tp, i) => (
                      <div key={i} className="bg-black/20 rounded-xl p-4 border border-white/5 relative overflow-hidden group hover:border-[#4EDEA3]/30 transition-colors">
                        <div className="absolute -right-4 -top-4 w-16 h-16 bg-[#4EDEA3]/5 rounded-full blur-2xl group-hover:bg-[#4EDEA3]/10 transition-colors" />
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-black text-[#4EDEA3]">{tp.label}</span>
                          <span className="text-[10px] font-black text-gray-500 bg-white/5 px-2 py-0.5 rounded">ขาย {tp.sellPercent}%</span>
                        </div>
                        <div className="text-2xl font-black text-white mb-1">{cur(tp.price)}</div>
                        <div className="text-[10px] font-bold text-gray-400">{tp.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/5">
                  <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] text-gray-500 font-black uppercase mb-1">Avg Entry (ถ้ารับทุกไม้)</div>
                    <div className="text-sm text-white font-black">{cur(pyramidPlan.avgEntry)}</div>
                  </div>
                  <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] text-gray-500 font-black uppercase mb-1">Stop Loss (ใต้ไม้สุดท้าย)</div>
                    <div className="text-sm text-[#FFB4AB] font-black">{cur(pyramidPlan.newSL)}</div>
                  </div>
                  <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] text-gray-500 font-black uppercase mb-1">Break Even Point</div>
                    <div className="text-sm text-white font-black">{cur(pyramidPlan.breakEven)}</div>
                  </div>
                  <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] text-gray-500 font-black uppercase mb-1">Risk : Reward (TP2)</div>
                    <div className="text-sm text-[#4EDEA3] font-black">1:{pyramidPlan.newRR}</div>
                  </div>
                </div>

                <div className="mt-4 text-xs font-bold text-gray-500 bg-white/5 p-4 rounded-xl flex items-start gap-3">
                  <span className="text-lg">💡</span>
                  <div>
                    <div className="text-white mb-1">สรุปกลยุทธ์: {pyramidPlan.summary}</div>
                    <div>⚠️ เติมไม้เฉพาะเมื่อ trend ยังคงอยู่ และ volume ยืนยัน — หากราคาหลุดเส้น Stop Loss ให้ตัดขาดทุนทันที ห้ามถัวเพิ่มเด็ดขาด</div>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="text-center py-6">
              <p className="text-[10px] text-gray-600 font-medium">⚠️ {language === "th" ? "การวิเคราะห์นี้เพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำทางการเงิน" : "This analysis is for educational purposes only."}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
