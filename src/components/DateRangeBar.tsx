"use client";

import React, { useState, useRef } from "react";
import { GlideGroup, GlidingIndicator } from './GlidingIndicator';
import { cn } from "@/src/lib/utils";
import { Calendar, ChevronDown, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { CustomSelect } from "./CustomSelect";
import { FloatingPopover } from "./FloatingPopover";
import { useApp } from "@/src/context/AppContext";

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
  if (state.mode === "1d") return { from: new Date(now.getTime() - oneDay), to: now };
  if (state.mode === "1w") return { from: new Date(now.getTime() - 7 * oneDay), to: now };
  if (state.mode === "1m") return { from: new Date(now.getTime() - 30 * oneDay), to: now };
  if (state.mode === "2m") return { from: new Date(now.getTime() - 60 * oneDay), to: now };
  if (state.mode === "3m") return { from: new Date(now.getTime() - 90 * oneDay), to: now };
  if (state.mode === "6m") return { from: new Date(now.getTime() - 180 * oneDay), to: now };
  if (state.mode === "1y") return { from: new Date(now.getTime() - 365 * oneDay), to: now };

  if (state.mode === "month") {
    const d = new Date(state.year, state.month, 1);
    return { from: startOfMonth(d), to: endOfMonth(d) };
  }

  if (state.mode === "custom" && state.from && state.to) {
    const toLocalDate = (date: string, endOfDay = false) => {
      const [year, month, day] = date.split("-").map(Number);
      return endOfDay
        ? new Date(year, month - 1, day, 23, 59, 59, 999)
        : new Date(year, month - 1, day);
    };

    return {
      from: toLocalDate(state.from),
      to: toLocalDate(state.to, true),
    };
  }

  return null;
}

/** Convert any date string to local midnight (start of day in local time) */
export function toLocalDateStart(dateStr: string): Date {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Get local YYYY-MM-DD key from any date string (handles ISO UTC strings correctly) */
export function toLocalDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isInRange(
  dateStr: string,
  bounds: { from: Date; to: Date } | null
): boolean {
  if (!bounds) return true;
  // Use local date for comparison so UTC-stored ISO strings are compared
  // against the local-date bounds (fixes timezone offset issues for UTC+7)
  const localKey = toLocalDateKey(dateStr);
  const [y, mo, dy] = localKey.split('-').map(Number);
  const localMidnight = new Date(y, mo - 1, dy, 0, 0, 0, 0).getTime();
  return localMidnight >= bounds.from.getTime() && localMidnight <= bounds.to.getTime();
}

const PRESETS = [
  { id: "all", label: "All" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W" },
  { id: "1m", label: "1M" },
  { id: "2m", label: "2M" },
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
  { id: "1y", label: "1Y" },
] as const;

function normalizeDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

interface DateRangeBarProps {
  value: DateRangeState;
  onChange: (v: DateRangeState) => void;
  className?: string;
  wrap?: boolean;
  hideCurrentMonthBadge?: boolean;
}

export function DateRangeBar({ value, onChange, className, wrap = false, hideCurrentMonthBadge = false }: DateRangeBarProps) {
  const { language, t } = useApp();
  const text = (en: string, th: string) => language === "th" ? th : en;

  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");


  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const customBtnRef = useRef<HTMLButtonElement>(null);
  const customFromPickerRef = useRef<HTMLInputElement>(null);
  const customToPickerRef = useRef<HTMLInputElement>(null);

  const months = Array.from({ length: 24 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { year: d.getFullYear(), month: d.getMonth(), label: format(d, "MMM yyyy") };
  });
  const recentMonths = months.slice(0, 2);

  const handleToggleCustom = () => {
    if (!showCustom) {
      if (value.mode === "custom") {
        setCustomFrom(value.from);
        setCustomTo(value.to);
      }
    }
    setShowCustom(!showCustom);

  };

  const activeBadge = (() => {
    if (hideCurrentMonthBadge && value.mode === 'month' && value.year === new Date().getFullYear() && value.month === new Date().getMonth()) return null;
    if (value.mode === "month")
      return format(new Date(value.year, value.month, 1), "MMM yyyy");
    if (value.mode === "custom" && value.from && value.to)
      return `${value.from} to ${value.to}`;
    return null;
  })();
  const selectedCustomFrom = customFrom;
  const selectedCustomTo = customTo;
  const hasInvalidCustomRange = Boolean(
    selectedCustomFrom && selectedCustomTo && selectedCustomFrom > selectedCustomTo
  );
  const hasInvalidCustomDate = Boolean(
    (selectedCustomFrom && !isValidDateInput(selectedCustomFrom)) ||
    (selectedCustomTo && !isValidDateInput(selectedCustomTo))
  );

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>

      <div
        ref={scrollContainerRef}
        className={cn("flex max-w-full min-w-0 items-center gap-3", wrap ? "flex-wrap" : "overflow-x-auto overscroll-x-contain scrollbar-none pb-1")}
      >
        <GlideGroup><div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-white/5 p-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                onChange({ mode: preset.id as "1d" | "1w" | "1m" | "2m" | "3m" | "6m" | "1y" | "all" });

                setShowCustom(false);
              }}
              className={cn(
                "relative isolate px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap",
                value.mode === preset.id
                  ? "text-[#ADC6FF]"
                  : "text-gray-500 hover:text-gray-300"
              )}
            >
              {value.mode === preset.id && <GlidingIndicator activeKey={preset.id} className="!bg-[#ADC6FF]/20"/>}
              {preset.id === "all" ? t("all") : preset.label}
            </button>
          ))}
        </div></GlideGroup>

        <GlideGroup><div className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-white/[0.03] p-1">
          {recentMonths.map((m) => (
            <button
              key={`${m.year}-${m.month}`}
              onClick={() => {
                onChange({ mode: "month", year: m.year, month: m.month });

                setShowCustom(false);
              }}
              className={cn(
                "relative isolate rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all whitespace-nowrap",
                value.mode === "month" && value.year === m.year && value.month === m.month
                  ? "text-[#ADC6FF]"
                  : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
              )}
            >
              {value.mode === "month" && value.year === m.year && value.month === m.month && <GlidingIndicator activeKey={`${m.year}-${m.month}`} className="!bg-[#ADC6FF]/20"/>}{format(new Date(m.year, m.month, 1), "MMM yy")}
            </button>
          ))}
        </div></GlideGroup>

        <CustomSelect className="date-month-select" aria-label={text('Month','เดือน')} value={value.mode==='month'?`${value.year}-${value.month}`:''} onChange={key=>{const [year,month]=key.split('-').map(Number);onChange({mode:'month',year,month});setShowCustom(false);}} placeholder={text('More months','เลือกเดือน')} items={months.map(m=>({value:`${m.year}-${m.month}`,label:m.label}))}/>
        <button
          ref={customBtnRef}
          onClick={handleToggleCustom}
          className={cn(
            "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
            value.mode === "custom"
              ? "bg-[#4EDEA3]/20 text-[#4EDEA3] border-[#4EDEA3]/30"
              : "bg-white/5 text-gray-500 border-border hover:text-gray-300"
          )}
        >
          <Calendar size={12} />
          <span>{text('Custom','กำหนดเอง')}</span>
          <ChevronDown size={10} className={cn("transition-transform", showCustom && "rotate-180")} />
        </button>

        {activeBadge && (
          <button
            onClick={() => onChange({ mode: "all" })}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-border text-[10px] font-bold text-gray-400 hover:text-white hover:border-white/20 transition-all"
          >
            <span>{activeBadge}</span>
            <X size={10} />
          </button>
        )}
      </div>

      <FloatingPopover open={showCustom} anchor={customBtnRef} onClose={()=>setShowCustom(false)} width={288} className="date-custom-popover p-4 space-y-3">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide">{text('Custom range','กำหนดช่วงวันที่')}</p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">{text('From','ตั้งแต่')}</label>
                <div className="relative">
                  <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="YYYY-MM-DD"
                  value={selectedCustomFrom}
                  onChange={(e) => setCustomFrom(normalizeDateInput(e.target.value))}
                  className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 pr-9 text-white text-xs font-bold   transition-all"
                />
                  <button
                    type="button"
                    aria-label="Choose start date from calendar"
                    onClick={() => customFromPickerRef.current?.showPicker?.()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:bg-white/5 hover:text-white"
                  >
                    <Calendar size={14} />
                  </button>
                  <input
                    ref={customFromPickerRef}
                    type="date"
                    tabIndex={-1}
                    value={isValidDateInput(selectedCustomFrom) ? selectedCustomFrom : ""}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="sr-only"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">{text('To','ถึง')}</label>
                <div className="relative">
                  <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="YYYY-MM-DD"
                  value={selectedCustomTo}
                  onChange={(e) => setCustomTo(normalizeDateInput(e.target.value))}
                  className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 pr-9 text-white text-xs font-bold   transition-all"
                />
                  <button
                    type="button"
                    aria-label="Choose end date from calendar"
                    onClick={() => customToPickerRef.current?.showPicker?.()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:bg-white/5 hover:text-white"
                  >
                    <Calendar size={14} />
                  </button>
                  <input
                    ref={customToPickerRef}
                    type="date"
                    tabIndex={-1}
                    min={isValidDateInput(selectedCustomFrom) ? selectedCustomFrom : undefined}
                    value={isValidDateInput(selectedCustomTo) ? selectedCustomTo : ""}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="sr-only"
                  />
                </div>
              </div>
            </div>
            {hasInvalidCustomDate ? (
              <p className="text-[10px] font-bold text-[#FFB4AB]">{text('Use a valid date in YYYY-MM-DD format.','กรุณาระบุวันที่ในรูปแบบ YYYY-MM-DD')}</p>
            ) : hasInvalidCustomRange && (
              <p className="text-[10px] font-bold text-[#FFB4AB]">{text('End date must be on or after the start date.','วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่มต้น')}</p>
            )}
            <button
              onClick={() => {
                const from = selectedCustomFrom;
                const to = selectedCustomTo;
                if (isValidDateInput(from) && isValidDateInput(to) && from <= to) {
                  onChange({ mode: "custom", from, to });
                  setShowCustom(false);
                  setCustomFrom("");
                  setCustomTo("");
                }
              }}
              disabled={!selectedCustomFrom || !selectedCustomTo || hasInvalidCustomDate || hasInvalidCustomRange}
              className="w-full py-2 bg-[#4EDEA3] text-[#0E0E0E] rounded-xl font-black text-xs uppercase tracking-wide hover:brightness-110 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {text('Apply','ใช้ช่วงวันที่')}
            </button>
      </FloatingPopover>
    </div>
  );
}
