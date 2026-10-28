"use client";
// แก้ layout หน้านี้ ต้องแก้ TerminalSkeleton ด้วย
import { Sk } from '@/src/components/skeleton';
import { layout } from './skeleton-layout';
import { CustomSelect } from "@/src/components/CustomSelect";

import { FinanceIcon } from "@/src/components/FinanceIcon";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Briefcase, Calendar, Target, X, ChevronDown, TrendingUp, BarChart2, Bell, CalendarDays, Globe, Search, Newspaper, Flame } from "lucide-react";
import { useApp } from "@/src/context/AppContext";
import { supabase } from "@/src/lib/supabase";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePageRouter as useRouter } from '@/src/components/PageTransition';
import { useSharedMarketSymbol } from '@/src/hooks/useSharedMarketSymbol';
import {
  SupportResistancePanel,
  FibonacciPanel,
  AlertsPanel,
} from "@/src/components/AnalysisPanels";
import {
  TickerTapeWidget,
  AdvancedChartWidget,
  EconomicCalendarWidget,
  MarketOverviewWidget,
  ScreenerWidget,
  TimelineWidget,
} from "@/src/components/TradingViewWidgets";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

// ─── TradingView Stock Heatmap Widget ────────────────────────────────────────
function HeatmapWidget() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget if any
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      exchanges: [],
      dataSource: "SPX500",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      locale: "en",
      symbolUrl: "",
      colorTheme: "dark",
      hasTopBar: false,
      isDataSetEnabled: false,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: "100%",
      height: "100%",
    });
    container.appendChild(script);

    return () => {
      if (container) container.innerHTML = "";
    };
  }, []);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ height: "100%", width: "100%" }}
    />
  );
}

export default function TerminalView({loading=false}:{loading?:boolean}) {
 const fallback=<TerminalContent forceLoading searchParams={new URLSearchParams()}/>;
 return loading ? fallback : <React.Suspense fallback={fallback}><ResolvedTerminal/></React.Suspense>;
}
function ResolvedTerminal(){const searchParams=useSearchParams();return <TerminalContent searchParams={searchParams}/>;}
function TerminalContent({forceLoading=false,searchParams}:{forceLoading?:boolean;searchParams:Pick<URLSearchParams,'get'>}) {
  const { language } = useApp();
  const router = useRouter();

  const mounted = useMounted();
  const requestedSymbol = searchParams.get("symbol")?.trim().toUpperCase();
  const { symbol, selectSymbol: setSymbol, ready: symbolReady } = useSharedMarketSymbol(requestedSymbol || '', 'XAUUSD', !forceLoading);
  const [searchInput, setSearchInput] = useState(requestedSymbol || "XAUUSD");
  const [interval, setInterval] = useState("60");
  const [stateLoaded, setStateLoaded] = useState(false);
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());

  const togglePanel = (id: string) =>
    setOpenPanels(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const openTradePlan = () => {
    router.push(`/trade/plan?symbol=${encodeURIComponent(symbol)}`);
  };
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Load saved terminal state from Supabase on mount ───────────────
  useEffect(() => {
    setSearchInput(symbol);
  }, [symbol]);

  useEffect(() => {
    if(forceLoading)return;
    async function loadTerminalState() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setStateLoaded(true); return; }

        const { data: profile } = await supabase
          .from("profiles")
          .select("terminal_symbol, terminal_interval")
          .eq("id", session.user.id)
          .single();

        if (profile && !requestedSymbol) {
          // Shared selection wins; an older profile response must not reset it.
          if (profile.terminal_interval) {
            setInterval(profile.terminal_interval);
          }
        }
      } catch (err) {
        console.error("Failed to load terminal state:", err);
      } finally {
        setStateLoaded(true);
      }
    }
    loadTerminalState();
  }, [requestedSymbol,forceLoading]);

  // ─── Debounced auto-save to Supabase when symbol or interval changes ─
  const saveTerminalState = useCallback(async (sym: string, tf: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      await supabase
        .from("profiles")
        .update({ terminal_symbol: sym, terminal_interval: tf })
        .eq("id", session.user.id);
    } catch (err) {
      console.error("Failed to save terminal state:", err);
    }
  }, []);

  useEffect(() => {
    if (forceLoading || !stateLoaded || !symbolReady || !symbol) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTerminalState(symbol, interval);
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [symbol, interval, stateLoaded, symbolReady, saveTerminalState, forceLoading]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSymbol(searchInput.trim().toUpperCase());
    }
  };

  const timeframes = [
    { label: "1m", value: "1", group: "Minutes" },
    { label: "5m", value: "5", group: "Minutes" },
    { label: "15m", value: "15", group: "Minutes" },
    { label: "30m", value: "30", group: "Minutes" },
    { label: "1h", value: "60", group: "Hours" },
    { label: "4h", value: "240", group: "Hours" },
    { label: "1D", value: "D", group: "Days" },
    { label: "1W", value: "W", group: "Days" },
  ];

  const currentTfLabel = timeframes.find(tf => tf.value === interval)?.label || "1h";

  return (
    <div className={`${layout.root} sk-root`} aria-busy={forceLoading||!mounted||!symbolReady} data-skeleton={forceLoading?"terminal":undefined}>
      {/* ─── Ticker Tape ───────────────────────────────────────────────────── */}
      <div className="w-full border-b border-border h-[46px]">
        {mounted&&!forceLoading ? <TickerTapeWidget/> : <div className="flex h-full items-center gap-8 overflow-hidden px-4">{[0,1,2,3,4].map(i=><Sk.Line key={i} width={170} className="shrink-0"/>)}</div>}
      </div>

      <div className={layout.container}>
        {/* ─── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Trader Hub
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              TradingView toolkit — charts, calendar, screener, heatmap, and more
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1 bg-surface rounded-xl p-1 border border-border">
            <Link
              href="/portfolio"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <Briefcase size={14} />
              Portfolio
            </Link>
            <Link
              href="/history"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <Calendar size={14} />
              Calendar
            </Link>
          </div>
        </div>

        {true ? (
          <div className="flex flex-col gap-4">
            {/* ═══════════════════════════════════════════════════════════════
                ROW 1 — Advanced Chart
                ═══════════════════════════════════════════════════════════════ */}
            <div className={layout.chart}>
              <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <FinanceIcon name="chart" size={16} className="text-primary" />
                    <h2 className="text-sm font-bold text-white">Advanced chart</h2>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 ml-5">
                    ค้นหาหุ้นด้านบนเพื่อใช้หุ้นเดียวกันกับหน้า Trade
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Timeframe Dropdown */}
                  <CustomSelect aria-label="Chart interval" value={interval} onChange={setInterval} className="w-24" items={[{label:'Minutes',options:[{value:'1',label:'1m'},{value:'5',label:'5m'},{value:'15',label:'15m'},{value:'30',label:'30m'}]},{label:'Hours',options:[{value:'60',label:'1h'},{value:'240',label:'4h'}]},{label:'Days',options:[{value:'D',label:'1D'},{value:'W',label:'1W'}]}]}/>

                  {/* Symbol Search */}
                  <form onSubmit={handleSearchSubmit} className="relative shrink-0 flex items-center">
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                      className="bg-surface-2 border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs font-bold text-white uppercase     w-[140px] transition-all"
                      placeholder="Search Symbol"
                    />
                  </form>
                  <button
                    onClick={openTradePlan}
                    className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[#ADC6FF]/30 bg-[#ADC6FF]/10 px-3 py-1.5 text-xs font-black text-[#ADC6FF] transition-all hover:bg-[#ADC6FF]/20"
                  >
                    <Target size={14} /> Trade
                  </button>
                </div>
              </div>
              <div className="flex-1 w-full relative">
                <div className="absolute inset-0">
                  {forceLoading||!mounted||!symbolReady ? <Sk.Chart height="100%"/> : <AdvancedChartWidget symbol={symbol} interval={interval} key={`${symbol}-${interval}`} />}
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                PANELS — Collapsible sections (Analysis + Market Data + Heatmap)
                ═══════════════════════════════════════════════════════════════ */}

            {/* ── Panel toggle bar ───────────────────────────────────────── */}
            <div className="bg-surface rounded-2xl border border-border p-2">
              <div className="flex flex-wrap gap-2">
                {([
                  { id: "sr",       label: "Support & Resistance", icon: TrendingUp },
                  { id: "fibo",     label: "Fibonacci Setup",      icon: BarChart2  },
                  { id: "alerts",   label: "Multi-Factor Alerts",  icon: Bell       },
                  { id: "calendar", label: "Economic Calendar",    icon: CalendarDays },
                  { id: "overview", label: "Market Overview",      icon: Globe      },
                  { id: "screener", label: "Forex Screener",       icon: Search     },
                  { id: "timeline", label: "Market Timeline",      icon: Newspaper  },
                  { id: "heatmap",  label: "S&P 500 Heatmap",      icon: Flame      },
                ] as const).map(({ id, label, icon: Icon }) => {
                  const isOpen = openPanels.has(id);
                  return (
                    <button
                      key={id}
                      onClick={() => togglePanel(id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        isOpen
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-surface-2 border-border text-gray-400 hover:text-white hover:border-border/80"
                      }`}
                    >
                      <Icon size={12} />
                      {label}
                      <ChevronDown
                        size={11}
                        className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Analysis panels (3 col when multiple open) ─────────────── */}
            {(openPanels.has("sr") || openPanels.has("fibo") || openPanels.has("alerts")) && (
              <div className={`grid gap-4 ${
                [openPanels.has("sr"), openPanels.has("fibo"), openPanels.has("alerts")].filter(Boolean).length === 1
                  ? "grid-cols-1"
                  : [openPanels.has("sr"), openPanels.has("fibo"), openPanels.has("alerts")].filter(Boolean).length === 2
                  ? "grid-cols-1 md:grid-cols-2"
                  : "grid-cols-1 md:grid-cols-3"
              }`}>
                {openPanels.has("sr") && (
                  <SupportResistancePanel key={`sr-${symbol}-${interval}`} symbol={symbol} interval={interval} />
                )}
                {openPanels.has("fibo") && (
                  <FibonacciPanel key={`fibo-${symbol}-${interval}`} symbol={symbol} interval={interval} />
                )}
                {openPanels.has("alerts") && (
                  <AlertsPanel key={`alerts-${symbol}-${interval}`} symbol={symbol} interval={interval} />
                )}
              </div>
            )}

            {/* ── Market data panels ─────────────────────────────────────── */}
            {(openPanels.has("calendar") || openPanels.has("overview")) && (
              <div className={`grid gap-4 ${
                openPanels.has("calendar") && openPanels.has("overview")
                  ? "grid-cols-1 lg:grid-cols-12"
                  : "grid-cols-1"
              }`}>
                {openPanels.has("calendar") && (
                  <div className={`${openPanels.has("overview") ? "lg:col-span-7" : ""} bg-surface rounded-2xl border border-border overflow-hidden flex flex-col`}>
                    <div className="px-4 pt-3 pb-2 border-b border-border flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold text-white">Economic calendar</h2>
                        <p className="text-[11px] text-gray-500 mt-0.5">Upcoming high-impact events</p>
                      </div>
                      <button onClick={() => togglePanel("calendar")} className="p-1 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                    <div className="flex-1 min-h-[400px]"><EconomicCalendarWidget /></div>
                  </div>
                )}
                {openPanels.has("overview") && (
                  <div className={`${openPanels.has("calendar") ? "lg:col-span-5" : ""} bg-surface rounded-2xl border border-border overflow-hidden flex flex-col`}>
                    <div className="px-4 pt-3 pb-2 border-b border-border flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold text-white">Market overview</h2>
                        <p className="text-[11px] text-gray-500 mt-0.5">Forex, metals, indices, and crypto tabs</p>
                      </div>
                      <button onClick={() => togglePanel("overview")} className="p-1 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                    <div className="flex-1 min-h-[400px]"><MarketOverviewWidget /></div>
                  </div>
                )}
              </div>
            )}

            {(openPanels.has("screener") || openPanels.has("timeline")) && (
              <div className={`grid gap-4 ${
                openPanels.has("screener") && openPanels.has("timeline")
                  ? "grid-cols-1 lg:grid-cols-12"
                  : "grid-cols-1"
              }`}>
                {openPanels.has("screener") && (
                  <div className={`${openPanels.has("timeline") ? "lg:col-span-7" : ""} bg-surface rounded-2xl border border-border overflow-hidden flex flex-col`}>
                    <div className="px-4 pt-3 pb-2 border-b border-border flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold text-white">Forex screener</h2>
                        <p className="text-[11px] text-gray-500 mt-0.5">Filter pairs by technicals and overview</p>
                      </div>
                      <button onClick={() => togglePanel("screener")} className="p-1 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                    <div className="flex-1 min-h-[400px]"><ScreenerWidget /></div>
                  </div>
                )}
                {openPanels.has("timeline") && (
                  <div className={`${openPanels.has("screener") ? "lg:col-span-5" : ""} bg-surface rounded-2xl border border-border overflow-hidden flex flex-col`}>
                    <div className="px-4 pt-3 pb-2 border-b border-border flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold text-white">Market timeline</h2>
                        <p className="text-[11px] text-gray-500 mt-0.5">Ideas and headlines that move FX</p>
                      </div>
                      <button onClick={() => togglePanel("timeline")} className="p-1 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                    <div className="flex-1 min-h-[400px]"><TimelineWidget /></div>
                  </div>
                )}
              </div>
            )}

            {/* ── Heatmap ────────────────────────────────────────────────── */}
            {openPanels.has("heatmap") && (
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <div className="px-4 pt-3 pb-2 border-b border-border flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-white">S&amp;P 500 Heatmap</h2>
                    <p className="text-[11px] text-gray-500 mt-0.5">Market cap · grouped by sector · color by change%</p>
                  </div>
                  <button onClick={() => togglePanel("heatmap")} className="p-1 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
                    <X size={13} />
                  </button>
                </div>
                <div className="h-[600px] w-full">
                  <HeatmapWidget />
                </div>
              </div>
            )}

          </div>
        ) : null}
      </div>

      <button
        onClick={openTradePlan}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-[#ADC6FF] px-4 py-3 text-xs font-black text-[#00285d] shadow-xl shadow-[#ADC6FF]/20 lg:hidden"
      >
        <Target size={16} /> Trade
      </button>
    </div>
  );
}
