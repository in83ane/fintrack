"use client";

import React from "react";
import { Activity, TrendingUp, AlertTriangle, CheckCircle2, Loader2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";

export function SupportResistancePanel({ symbol = "XAUUSD", interval = "60" }: { symbol?: string; interval?: string }) {
  const [analysis, setAnalysis] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      setAnalysis(null);
      setLoading(true);
      try {
        const res = await fetch(`/api/market/analysis?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Market analysis request failed: ${res.status}`);
        const result = await res.json();
        if (!controller.signal.aborted && result.data?.symbol === symbol.toUpperCase()) setAnalysis(result.data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetchData();
    return () => controller.abort();
  }, [symbol, interval]);

  let content = null;

  if (loading) {
    content = <div className="flex-1 flex items-center justify-center text-xs text-gray-500"><Loader2 size={16} className="animate-spin" /></div>;
  } else if (!analysis) {
    content = <div className="flex-1 flex items-center justify-center text-xs text-red-400">Data unavailable</div>;
  } else {
    content = (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {analysis.resistances.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] text-[#FF6B6B] font-black mb-2 uppercase tracking-wider">Resistance</div>
            <div className="space-y-1.5">
              {analysis.resistances.map((r: any, i: number) => (
                <div key={`r-${i}`} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#FF6B6B]/5 border border-[#FF6B6B]/10">
                  <span className="text-sm text-white font-mono font-bold">
                    {analysis.currency === 'THB' ? '฿' : '$'}{r.price >= 1000 ? r.price.toFixed(0) : r.price.toFixed(2)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-medium">{r.touches} touches</span>
                    <div className="flex gap-1">
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
            <div className="text-[10px] text-[#4D8EFF] font-black mb-2 uppercase tracking-wider">Support</div>
            <div className="space-y-1.5">
              {analysis.supports.map((s: any, i: number) => (
                <div key={`s-${i}`} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#4D8EFF]/5 border border-[#4D8EFF]/10">
                  <span className="text-sm text-white font-mono font-bold">
                    {analysis.currency === 'THB' ? '฿' : '$'}{s.price >= 1000 ? s.price.toFixed(0) : s.price.toFixed(2)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-medium">{s.touches} touches</span>
                    <div className="flex gap-1">
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
          <p className="text-xs text-gray-600 text-center py-8">No significant levels detected</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-border p-5 flex flex-col h-full max-h-[400px]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-gray-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Support & Resistance
          </h2>
        </div>
        {symbol && (
          <span className="text-[10px] font-bold text-gray-400 bg-surface-2 px-2 py-0.5 rounded border border-border">
            {symbol} {interval === '1' ? '1M' : interval === '5' ? '5M' : interval === '15' ? '15M' : interval === '30' ? '30M' : interval === '60' ? '1H' : interval === '240' ? '4H' : interval === 'D' ? '1D' : interval === 'W' ? '1W' : interval}
          </span>
        )}
      </div>
      {content}
    </div>
  );
}

export function FibonacciPanel({ symbol = "XAUUSD", interval = "60" }: { symbol?: string; interval?: string }) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      setData(null);
      setLoading(true);
      try {
        const res = await fetch(`/api/market/fibo?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Fibonacci request failed: ${res.status}`);
        const result = await res.json();
        if (!controller.signal.aborted && result.symbol === symbol.toUpperCase() && result.data?.length > 0) {
          setData(result.data);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetchData();
    return () => controller.abort();
  }, [symbol, interval]);

  let content = null;

  if (loading) {
    content = <div className="flex-1 flex items-center justify-center text-xs text-gray-500"><Loader2 size={16} className="animate-spin" /></div>;
  } else if (!data) {
    content = <div className="flex-1 flex items-center justify-center text-xs text-red-400">Data unavailable</div>;
  } else {
    const lookback = data.slice(-150);
    
    // 1. Structural Swing Detection Algorithm (Window-based)
    const window = 5;
    let recentHigh = null;
    let recentLow = null;
    let highIdx = -1;
    let lowIdx = -1;

    // Scan backwards to find the most recent valid pivot high and low
    for (let i = lookback.length - 1 - window; i >= window; i--) {
      let isHigh = true;
      let isLow = true;
      for (let j = 1; j <= window; j++) {
        if (lookback[i].high <= lookback[i - j].high || lookback[i].high <= lookback[i + j].high) isHigh = false;
        if (lookback[i].low >= lookback[i - j].low || lookback[i].low >= lookback[i + j].low) isLow = false;
      }

      if (isHigh && !recentHigh) { recentHigh = lookback[i].high; highIdx = i; }
      if (isLow && !recentLow) { recentLow = lookback[i].low; lowIdx = i; }
      if (recentHigh && recentLow) break;
    }

    // Fallback if no clean pivot found in lookback
    if (!recentHigh || !recentLow) {
      recentHigh = -Infinity;
      recentLow = Infinity;
      for (let i = 0; i < lookback.length; i++) {
        if (lookback[i].high > recentHigh) { recentHigh = lookback[i].high; highIdx = i; }
        if (lookback[i].low < recentLow) { recentLow = lookback[i].low; lowIdx = i; }
      }
    }

    const currentPrice = lookback[lookback.length - 1].close || lookback[lookback.length - 1].high;
    const isUptrend = lowIdx < highIdx; // Low formed before High -> Bullish Impulse
    const diff = recentHigh - recentLow;

    const calcLevel = (ratio: number) => {
      return isUptrend ? recentHigh - (diff * ratio) : recentLow + (diff * ratio);
    };

    const levels = [
      { ratio: -0.27, label: "-27.0%", color: "bg-emerald-400" },
      { ratio: 0, label: "0%", color: "bg-emerald-400" },
      { ratio: 0.236, label: "23.6%", color: "bg-purple-400" },
      { ratio: 0.382, label: "38.2%", color: "bg-blue-400" },
      { ratio: 0.5, label: "50.0%", color: "bg-white" },
      { ratio: 0.618, label: "61.8%", color: "bg-amber-400" },
      { ratio: 0.786, label: "78.6%", color: "bg-orange-400" },
      { ratio: 0.886, label: "88.6%", color: "bg-red-400" },
      { ratio: 1, label: "100%", color: "bg-gray-400" },
    ];

    // Find closest level to current price
    let closestIndex = 0;
    let minDiff = Infinity;
    const calculatedLevels = levels.map((l, i) => {
      const price = calcLevel(l.ratio);
      const priceDiff = Math.abs(price - currentPrice);
      if (priceDiff < minDiff) {
        minDiff = priceDiff;
        closestIndex = i;
      }
      return { ...l, price };
    });

    // 2. Trading Recommendations
    const entryStart = calcLevel(0.618);
    const entryEnd = calcLevel(0.786);
    const entryMin = Math.min(entryStart, entryEnd);
    const entryMax = Math.max(entryStart, entryEnd);
    
    const tpPrice1 = calcLevel(0);
    const tpPrice2 = calcLevel(-0.27);
    
    const slRatio = 1.02; 
    const actualSlPrice = calcLevel(slRatio);

    const bgTheme = isUptrend ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20";
    const textTheme = isUptrend ? "text-emerald-400" : "text-red-400";
    const bgBadge = isUptrend ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300";

    content = (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col">
        {/* Signal Card */}
        <div className={`mb-5 rounded-xl p-4 border ${bgTheme}`}>
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2">
                {isUptrend ? <ArrowUpCircle size={18} className={textTheme} /> : <ArrowDownCircle size={18} className={textTheme} />}
                <span className={`font-black uppercase tracking-widest text-xs ${textTheme}`}>
                  {isUptrend ? "BULLISH SETUP" : "BEARISH SETUP"}
                </span>
             </div>
             <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${bgBadge}`}>
               {isUptrend ? "Buy Limit" : "Sell Limit"}
             </span>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-black/20 rounded-lg p-2.5">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Entry Zone</span>
              <span className="text-xs font-mono font-bold text-white">
                {entryMin.toFixed(2)} - {entryMax.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-black/20 rounded-lg p-2.5">
                <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Take Profit</span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {tpPrice1.toFixed(2)} / {tpPrice2.toFixed(2)}
                </span>
              </div>
              <div className="bg-black/20 rounded-lg p-2.5">
                <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Stop Loss</span>
                <span className="text-xs font-mono font-bold text-red-400">
                  {isUptrend ? '<' : '>'} {actualSlPrice.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Fibo levels */}
        <div className="flex-1 space-y-2 mb-4">
          {calculatedLevels.map((level, i) => {
            const active = i === closestIndex;
            return (
              <div key={i} className={`flex items-center justify-between text-xs ${active ? 'opacity-100' : 'opacity-60'} hover:opacity-100 transition-opacity`}>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${level.color}`}></div>
                  <span className={`font-medium ${active ? 'text-white' : 'text-gray-400'}`}>{level.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-medium ${active ? 'text-white' : 'text-gray-400'}`}>
                    {level.price.toFixed(symbol.includes('JPY') ? 3 : 2)}
                  </span>
                  {active && (
                    <span className="text-[9px] text-primary font-bold uppercase tracking-wider whitespace-nowrap bg-primary/10 px-1.5 py-0.5 rounded">
                      Now
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Impulse High/Low info */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50 text-xs text-gray-500 mt-auto">
          <div>
            <div className="text-[9px] uppercase mb-0.5 font-bold">Swing High</div>
            <div className="font-mono text-[10px]">{recentHigh.toFixed(symbol.includes('JPY') ? 3 : 2)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase mb-0.5 font-bold">Swing Low</div>
            <div className="font-mono text-[10px]">{recentLow.toFixed(symbol.includes('JPY') ? 3 : 2)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-border p-5 flex flex-col h-full max-h-[400px]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-gray-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Fibonacci Setup
          </h2>
        </div>
        {symbol && (
          <span className="text-[10px] font-bold text-gray-400 bg-surface-2 px-2 py-0.5 rounded border border-border">
            {symbol} {
              interval === '1' ? '1M' :
              interval === '5' ? '5M' :
              interval === '15' ? '15M' :
              interval === '30' ? '30M' :
              interval === '60' ? '1H' :
              interval === '240' ? '4H' :
              interval === 'D' ? '1D' :
              interval === 'W' ? '1W' : interval
            }
          </span>
        )}
      </div>
      {content}
    </div>
  );
}

function AlertCard({ alert }: { alert: any }) {
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
        {alert.reasons.map((reason: string, i: number) => (
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

export function AlertsPanel({ symbol = "XAUUSD", interval = "60" }: { symbol?: string; interval?: string }) {
  const [analysis, setAnalysis] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      setAnalysis(null);
      setLoading(true);
      try {
        const res = await fetch(`/api/market/analysis?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Market analysis request failed: ${res.status}`);
        const result = await res.json();
        if (!controller.signal.aborted && result.data?.symbol === symbol.toUpperCase()) setAnalysis(result.data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetchData();
    return () => controller.abort();
  }, [symbol, interval]);

  let content = null;

  if (loading) {
    content = <div className="flex-1 flex items-center justify-center text-xs text-gray-500"><Loader2 size={16} className="animate-spin" /></div>;
  } else if (!analysis) {
    content = <div className="flex-1 flex items-center justify-center text-xs text-red-400">Data unavailable</div>;
  } else {
    content = (
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {/* MACD Status */}
        <div className="mb-4 bg-surface-2/30 rounded-xl p-3 border border-border/50">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">MACD Status</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] text-gray-400">MACD</div>
              <div className={cn("font-mono text-xs font-bold", analysis.macd.macd > 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                {analysis.macd.macd.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400">Signal</div>
              <div className="text-gray-300 font-mono text-xs font-bold">{analysis.macd.signal.toFixed(3)}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400">Hist</div>
              <div className={cn("font-mono text-xs font-bold", analysis.macd.histogram > 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                {analysis.macd.histogram.toFixed(3)}
              </div>
            </div>
          </div>
        </div>

        {/* EMA Cross */}
        <div className="mb-5 bg-surface-2/30 rounded-xl p-3 border border-border/50">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">EMA Cross</div>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <div className="text-[10px] text-gray-400">EMA 9</div>
              <div className="text-[#ADC6FF] font-mono text-xs font-bold">{analysis.ema9.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400">EMA 21</div>
              <div className="text-[#E9C349] font-mono text-xs font-bold">{analysis.ema21.toFixed(2)}</div>
            </div>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 text-[10px] font-black px-2 py-1.5 rounded-lg border",
            analysis.ema9 > analysis.ema21 
              ? "text-[#4EDEA3] bg-[#4EDEA3]/10 border-[#4EDEA3]/20" 
              : "text-[#FFB4AB] bg-[#FFB4AB]/10 border-[#FFB4AB]/20"
          )}>
            <CheckCircle2 size={14} />
            {analysis.ema9 > analysis.ema21 ? "EMA 9 > EMA 21 (Bullish)" : "EMA 9 < EMA 21 (Bearish)"}
          </div>
        </div>

        {/* Alerts */}
        <div className="space-y-2">
          <AnimatePresence>
            {analysis.alerts.length > 0 ? (
              analysis.alerts.map((alert: any) => (
                <AlertCard key={alert.id} alert={alert} />
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-6"
              >
                <div className="text-gray-400 text-xs font-bold">No converging signals</div>
                <div className="text-gray-500 text-[10px] mt-1">
                  Alerts fire when MACD crossover + S/R or Fibonacci conditions align
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-border p-5 flex flex-col h-full max-h-[400px]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-gray-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Multi-Factor Alerts
          </h2>
        </div>
        {symbol && (
          <span className="text-[10px] font-bold text-gray-400 bg-surface-2 px-2 py-0.5 rounded border border-border">
            {symbol} {interval === '1' ? '1M' : interval === '5' ? '5M' : interval === '15' ? '15M' : interval === '30' ? '30M' : interval === '60' ? '1H' : interval === '240' ? '4H' : interval === 'D' ? '1D' : interval === 'W' ? '1W' : interval}
          </span>
        )}
      </div>
      {content}
    </div>
  );
}
