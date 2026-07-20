"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/src/lib/utils";
import { Calendar, ChevronDown, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { AnimatePresence, motion } from "motion/react";

export type DateRangeState =
  | { mode: "1d" | "1w" | "1m" | "2m" | "3m" | "6m" | "1y" | "all" }
  | { mode: "month"; year: number; month: number }
  | { mode: "custom"; from: string; to: string };

export function getDateBounds(
  state: DateRangeState
): { from: Date; to: Date } | null {
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  if (state.mode === "all") return null;
  if (state.mode === "1d")
    return { from: new Date(now.getTime() - oneDay), to: now };
  if (state.mode === "1w")
    return { from: new Date(now.getTime() - 7 * oneDay), to: now };
  if (state.mode === "1m")
    return { from: new Date(now.getTime() - 30 * oneDay), to: now };
  if (state.mode === "2m")
    return { from: new Date(now.getTime() - 60 * oneDay), to: now };
  if (state.mode === "3m")
    return { from: new Date(now.getTime() - 90 * oneDay), to: now };
  if (state.mode === "6m")
    return { from: new Date(now.getTime() - 180 * oneDay), to: now };
  if (state.mode === "1y")
    return { from: new Date(now.getTime() - 365 * oneDay), to: now };

  if (state.mode === "month") {
    const d = new Date(state.year, state.month, 1);
    return { from: startOfMonth(d), to: endOfMonth(d) };
  }

  if (state.mode === "custom" && state.from && state.to) {
    return {
      from: new Date(state.from),
      to: new Date(state.to + "T23:59:59"),
    };
  }

  return null;
}

export function isInRange(
  dateStr: string,
  bounds: { from: Date; to: Date } | null
): boolean {
  if (!bounds) return true;
  const d = new Date(dateStr).getTime();
  return d >= bounds.from.getTime() && d <= bounds.to.getTime();
}

const PRESETS = [
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W" },
  { id: "1m", label: "1M" },
  { id: "2m", label: "2M" },
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
  { id: "all", label: "All" },
] as const;

interface DateRangeBarProps {
  value: DateRangeState;
  onChange: (v: DateRangeState) => void;
  className?: string;
}

export function DateRangeBar({ value, onChange, className }: DateRangeBarProps) {
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const monthPickerRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLDivElement>(null);

  const months = Array.from({ length: 24 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { year: d.getFullYear(), month: d.getMonth(), label: format(d, "MMM yyyy") };
  });

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node))
        setShowMonthPicker(false);
      if (customRef.current && !customRef.current.contains(e.target as Node))
        setShowCustom(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const activeBadge = (() => {
    if (value.mode === "month")
      return format(new Date(value.year, value.month, 1), "MMM yyyy");
    if (value.mode === "custom" && value.from && value.to)
      return `${value.from} to ${value.to}`;
    return null;
  })();

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-0.5 bg-white/5 rounded-xl p-1 border border-white/10 overflow-x-auto">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => {
              onChange({ mode: preset.id as "1d" | "1w" | "1m" | "2m" | "3m" | "6m" | "1y" | "all" });
              setShowMonthPicker(false);
              setShowCustom(false);
            }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
              value.mode === preset.id
                ? "bg-[#ADC6FF]/20 text-[#ADC6FF]"
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="relative" ref={monthPickerRef}>
        <button
          onClick={() => { setShowMonthPicker(!showMonthPicker); setShowCustom(false); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
            value.mode === "month"
              ? "bg-[#ADC6FF]/20 text-[#ADC6FF] border-[#ADC6FF]/30"
              : "bg-white/5 text-gray-500 border-white/10 hover:text-gray-300"
          )}
        >
          <Calendar size={12} />
          <span>{value.mode === "month" ? format(new Date(value.year, value.month, 1), "MMM yyyy") : "Month"}</span>
          <ChevronDown size={10} className={cn("transition-transform", showMonthPicker && "rotate-180")} />
        </button>

        <AnimatePresence>
          {showMonthPicker && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute top-full left-0 mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-2 max-h-64 overflow-y-auto space-y-0.5">
                {months.map((m) => (
                  <button
                    key={`${m.year}-${m.month}`}
                    onClick={() => { onChange({ mode: "month", year: m.year, month: m.month }); setShowMonthPicker(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all",
                      value.mode === "month" && value.year === m.year && value.month === m.month
                        ? "bg-[#ADC6FF]/20 text-[#ADC6FF]"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative" ref={customRef}>
        <button
          onClick={() => { setShowCustom(!showCustom); setShowMonthPicker(false); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
            value.mode === "custom"
              ? "bg-[#4EDEA3]/20 text-[#4EDEA3] border-[#4EDEA3]/30"
              : "bg-white/5 text-gray-500 border-white/10 hover:text-gray-300"
          )}
        >
          <Calendar size={12} />
          <span>Custom</span>
          <ChevronDown size={10} className={cn("transition-transform", showCustom && "rotate-180")} />
        </button>

        <AnimatePresence>
          {showCustom && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute top-full left-0 mt-2 w-72 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl z-50 p-4 space-y-3"
            >
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide">Custom Range</p>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">From</label>
                  <input
                    type="date"
                    value={customFrom || (value.mode === "custom" ? value.from : "")}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-bold focus:outline-none focus:border-[#4EDEA3]/50 transition-all [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">To</label>
                  <input
                    type="date"
                    value={customTo || (value.mode === "custom" ? value.to : "")}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-bold focus:outline-none focus:border-[#4EDEA3]/50 transition-all [color-scheme:dark]"
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  const from = customFrom || (value.mode === "custom" ? value.from : "");
                  const to = customTo || (value.mode === "custom" ? value.to : "");
                  if (from && to) {
                    onChange({ mode: "custom", from, to });
                    setShowCustom(false);
                    setCustomFrom("");
                    setCustomTo("");
                  }
                }}
                className="w-full py-2 bg-[#4EDEA3] text-[#0E0E0E] rounded-xl font-black text-xs uppercase tracking-wide hover:brightness-110 transition-all active:scale-95"
              >
                Apply
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {activeBadge && (
        <button
          onClick={() => onChange({ mode: "all" })}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-gray-400 hover:text-white hover:border-white/20 transition-all"
        >
          <span>{activeBadge}</span>
          <X size={10} />
        </button>
      )}
    </div>
  );
}
