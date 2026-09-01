"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Briefcase, Calendar } from "lucide-react";
import { useApp } from "@/src/context/AppContext";
import { supabase } from "@/src/lib/supabase";
import Link from "next/link";
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

export default function TerminalPage() {
  const { language } = useApp();
  const mounted = useMounted();
  const [symbol, setSymbol] = useState("XAUUSD");
  const [searchInput, setSearchInput] = useState("XAUUSD");
  const [interval, setInterval] = useState("60");
  const [stateLoaded, setStateLoaded] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Load saved terminal state from Supabase on mount ───────────────
  useEffect(() => {
    async function loadTerminalState() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setStateLoaded(true); return; }

        const { data: profile } = await supabase
          .from("profiles")
          .select("terminal_symbol, terminal_interval")
          .eq("id", session.user.id)
          .single();

        if (profile) {
          if (profile.terminal_symbol) {
            setSymbol(profile.terminal_symbol);
            setSearchInput(profile.terminal_symbol);
          }
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
  }, []);

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
    if (!stateLoaded) return; // Don't save until initial load is complete
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTerminalState(symbol, interval);
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [symbol, interval, stateLoaded, saveTerminalState]);

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
    <div className="min-h-screen bg-background pb-20 sm:pb-6">
      {/* ─── Ticker Tape ───────────────────────────────────────────────────── */}
      <div className="w-full border-b border-border h-[46px]">
        {mounted && <TickerTapeWidget />}
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-5 pb-4">
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

        {mounted ? (
          <div className="flex flex-col gap-4">
            {/* ═══════════════════════════════════════════════════════════════
                ROW 1 — Advanced Chart
                ═══════════════════════════════════════════════════════════════ */}
            <div className="bg-surface rounded-2xl border border-border overflow-hidden flex flex-col h-[650px]">
              <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-primary text-sm font-bold">✦</span>
                    <h2 className="text-sm font-bold text-white">Advanced chart</h2>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 ml-5">
                    Full TradingView chart — switch pairs anytime
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Timeframe Dropdown */}
                  <select
                    value={interval}
                    onChange={(e) => setInterval(e.target.value)}
                    className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', paddingRight: '28px' }}
                  >
                    <optgroup label="Minutes" className="bg-gray-900 text-gray-400">
                      <option value="1" className="text-white">1m</option>
                      <option value="5" className="text-white">5m</option>
                      <option value="15" className="text-white">15m</option>
                      <option value="30" className="text-white">30m</option>
                    </optgroup>
                    <optgroup label="Hours" className="bg-gray-900 text-gray-400">
                      <option value="60" className="text-white">1h</option>
                      <option value="240" className="text-white">4h</option>
                    </optgroup>
                    <optgroup label="Days" className="bg-gray-900 text-gray-400">
                      <option value="D" className="text-white">1D</option>
                      <option value="W" className="text-white">1W</option>
                    </optgroup>
                  </select>

                  {/* Symbol Search */}
                  <form onSubmit={handleSearchSubmit} className="relative shrink-0 flex items-center">
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                      className="bg-surface-2 border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs font-bold text-white uppercase focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-[140px] transition-all"
                      placeholder="Search Symbol"
                    />
                  </form>
                </div>
              </div>
              <div className="flex-1 w-full relative">
                <div className="absolute inset-0">
                  <AdvancedChartWidget symbol={symbol} interval={interval} key={`${symbol}-${interval}`} />
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                ROW 2 — Analysis Panels (S/R, Fibo, Alerts)
                ═══════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
              <div className="h-full">
                <SupportResistancePanel key={`sr-${symbol}-${interval}`} symbol={symbol} interval={interval} />
              </div>
              <div className="h-full">
                <FibonacciPanel key={`fibo-${symbol}-${interval}`} symbol={symbol} interval={interval} />
              </div>
              <div className="h-full">
                <AlertsPanel key={`alerts-${symbol}-${interval}`} symbol={symbol} interval={interval} />
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                ROW 3 — Economic Calendar + Market Overview
                ═══════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 bg-surface rounded-2xl border border-border overflow-hidden flex flex-col">
                <div className="px-4 pt-3 pb-2 border-b border-border">
                  <h2 className="text-sm font-bold text-white">Economic calendar</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">Upcoming high-impact events</p>
                </div>
                <div className="flex-1 min-h-[400px]">
                  <EconomicCalendarWidget />
                </div>
              </div>

              <div className="lg:col-span-5 bg-surface rounded-2xl border border-border overflow-hidden flex flex-col">
                <div className="px-4 pt-3 pb-2 border-b border-border">
                  <h2 className="text-sm font-bold text-white">Market overview</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">Forex, metals, indices, and crypto tabs</p>
                </div>
                <div className="flex-1 min-h-[400px]">
                  <MarketOverviewWidget />
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                ROW 3 — Forex Screener + Market Timeline
                ═══════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 bg-surface rounded-2xl border border-border overflow-hidden flex flex-col">
                <div className="px-4 pt-3 pb-2 border-b border-border">
                  <h2 className="text-sm font-bold text-white">Forex screener</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">Filter pairs by technicals and overview</p>
                </div>
                <div className="flex-1 min-h-[400px]">
                  <ScreenerWidget />
                </div>
              </div>

              <div className="lg:col-span-5 bg-surface rounded-2xl border border-border overflow-hidden flex flex-col">
                <div className="px-4 pt-3 pb-2 border-b border-border">
                  <h2 className="text-sm font-bold text-white">Market timeline</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">Ideas and headlines that move FX</p>
                </div>
                <div className="flex-1 min-h-[400px]">
                  <TimelineWidget />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8 xl:col-span-9 bg-surface rounded-2xl border border-border h-[520px] animate-pulse" />
              <div className="lg:col-span-4 xl:col-span-3 bg-surface rounded-2xl border border-border h-[520px] animate-pulse" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 bg-surface rounded-2xl border border-border h-[440px] animate-pulse" />
              <div className="lg:col-span-5 bg-surface rounded-2xl border border-border h-[440px] animate-pulse" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
