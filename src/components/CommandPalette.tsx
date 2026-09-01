"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, LayoutDashboard, Briefcase, TrendingUp, TrendingDown,
  Wallet, ArrowRightLeft, Calendar, Settings, ArrowRight,
  Plus, DollarSign, Receipt, Clock, Zap, ChevronRight,
  ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useApp } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ReactNode;
  action: () => void;
  category: "navigation" | "asset" | "action" | "quicklog" | "recent";
}

// ─── Quick-log parser ──────────────────────────────────────────────────────────
function parseQuickLog(query: string): { type: "INCOME" | "EXPENSE"; amount: number; category: string } | null {
  const lower = query.toLowerCase().trim();

  // Patterns: "income 50000", "expense 150 food", "lunch 200", "salary 50k"
  const incomeKeywords = ["income", "salary", "wage", "bonus", "เงินเดือน", "รายได้", "โบนัส"];
  const expenseKeywords = ["expense", "spending", "lunch", "dinner", "food", "taxi", "coffee", "rent", "ค่าอาหาร", "ค่าเดินทาง", "ค่าน้ำ", "ค่าไฟ"];

  const amountMatch = lower.match(/([\d,]+(?:\.\d+)?)\s*(k|m)?/);
  if (!amountMatch) return null;

  let amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  if (amountMatch[2]?.toLowerCase() === "k") amount *= 1000;
  if (amountMatch[2]?.toLowerCase() === "m") amount *= 1000000;
  if (amount <= 0 || isNaN(amount)) return null;

  let type: "INCOME" | "EXPENSE" = "EXPENSE";
  let category = "other";

  for (const kw of incomeKeywords) {
    if (lower.includes(kw)) { type = "INCOME"; category = "salary"; break; }
  }
  if (type === "EXPENSE") {
    const catMap: Record<string, string> = {
      food: "food", lunch: "food", dinner: "food", coffee: "food", อาหาร: "food",
      taxi: "transport", grab: "transport", uber: "transport", transport: "transport", เดินทาง: "transport",
      rent: "utilities", electric: "utilities", internet: "utilities", น้ำ: "utilities", ไฟ: "utilities",
      shopping: "entertainment", movie: "entertainment", netflix: "entertainment",
      salary: "salary", wage: "salary",
    };
    for (const [kw, cat] of Object.entries(catMap)) {
      if (lower.includes(kw)) { category = cat; break; }
    }
  }

  return { type, amount, category };
}

// ─── Recent actions store (module-level, persists between opens) ───────────────
const recentActions: { label: string; page: string; ts: number }[] = [];
function trackAction(label: string, page: string) {
  const existing = recentActions.findIndex(r => r.label === label);
  if (existing !== -1) recentActions.splice(existing, 1);
  recentActions.unshift({ label, page, ts: Date.now() });
  if (recentActions.length > 5) recentActions.pop();
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quickLogResult, setQuickLogResult] = useState<ReturnType<typeof parseQuickLog>>(null);
  const [loggedFlash, setLoggedFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { assets, t, language, addCashActivity, addToast, formatMoney } = useApp();
  const isTh = language === "th";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setQuickLogResult(null);
      setLoggedFlash(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Parse query for quick-log
  useEffect(() => {
    if (query.length >= 3) {
      const parsed = parseQuickLog(query);
      setQuickLogResult(parsed);
    } else {
      setQuickLogResult(null);
    }
  }, [query]);

  const handleNavigate = useCallback((label: string, path: string) => {
    trackAction(label, path);
    router.push(path);
    setOpen(false);
  }, [router]);

  const handleQuickLog = useCallback(() => {
    if (!quickLogResult) return;
    addCashActivity({
      type: quickLogResult.type,
      amountUSD: quickLogResult.amount,
      category: quickLogResult.category,
      date: new Date().toISOString(),
      note: query,
    });
    const label = `${quickLogResult.type === "INCOME" ? "+" : "-"}${formatMoney(quickLogResult.amount)} · ${quickLogResult.category}`;
    setLoggedFlash(label);
    addToast(`${quickLogResult.type === "INCOME" ? "💰" : "💸"} ${label}`, "success");
    trackAction(`Logged: ${label}`, "/cashflow");
    setTimeout(() => { setLoggedFlash(null); setOpen(false); }, 1200);
  }, [quickLogResult, query, addCashActivity, addToast, formatMoney]);

  const items: CommandItem[] = useMemo(() => {
    const navItems: CommandItem[] = [
      { id: "nav-dashboard", label: isTh ? "แดชบอร์ด" : "Dashboard", icon: <LayoutDashboard size={16} />, action: () => handleNavigate("Dashboard", "/dashboard"), category: "navigation" },
      { id: "nav-portfolio", label: isTh ? "พอร์ตโฟลิโอ" : "Portfolio", icon: <Briefcase size={16} />, action: () => handleNavigate("Portfolio", "/portfolio"), category: "navigation" },
      { id: "nav-trade", label: isTh ? "ผู้ช่วยเทรด" : "Trade Assistant", icon: <TrendingUp size={16} />, action: () => handleNavigate("Trade", "/trade"), category: "navigation" },
      { id: "nav-budget", label: isTh ? "งบประมาณ" : "Budget", icon: <Wallet size={16} />, action: () => handleNavigate("Budget", "/budget"), category: "navigation" },
      { id: "nav-cashflow", label: isTh ? "กระแสเงินสด" : "Cashflow", icon: <ArrowRightLeft size={16} />, action: () => handleNavigate("Cashflow", "/cashflow"), category: "navigation" },
      { id: "nav-transactions", label: isTh ? "ธุรกรรม" : "Transactions", icon: <Receipt size={16} />, action: () => handleNavigate("Transactions", "/transactions"), category: "navigation" },
      { id: "nav-calendar", label: isTh ? "ปฏิทิน" : "Calendar", icon: <Calendar size={16} />, action: () => handleNavigate("Calendar", "/calendar"), category: "navigation" },
      { id: "nav-settings", label: isTh ? "ตั้งค่า" : "Settings", icon: <Settings size={16} />, action: () => handleNavigate("Settings", "/settings"), category: "navigation" },
    ];

    const assetItems: CommandItem[] = assets.map(a => ({
      id: `asset-${a.symbol}`,
      label: a.symbol,
      sublabel: a.name,
      badge: `${a.change >= 0 ? "+" : ""}${a.change.toFixed(2)}%`,
      badgeColor: a.change >= 0 ? "#4EDEA3" : "#FFB4AB",
      icon: a.change >= 0 ? <ArrowUpRight size={16} className="text-[#4EDEA3]" /> : <ArrowDownRight size={16} className="text-[#FFB4AB]" />,
      action: () => { handleNavigate(a.symbol, `/trade/${a.symbol}`); },
      category: "asset" as const,
    }));

    const actionItems: CommandItem[] = [
      {
        id: "action-log-income",
        label: isTh ? "บันทึกรายได้" : "Log Income",
        sublabel: isTh ? "เพิ่มรายรับใหม่" : "Add a new income entry",
        icon: <Plus size={16} className="text-[#4EDEA3]" />,
        action: () => { handleNavigate("Log Income", "/cashflow"); },
        category: "action",
      },
      {
        id: "action-log-expense",
        label: isTh ? "บันทึกรายจ่าย" : "Log Expense",
        sublabel: isTh ? "เพิ่มรายจ่ายใหม่" : "Add a new expense entry",
        icon: <Receipt size={16} className="text-[#FFB4AB]" />,
        action: () => { handleNavigate("Log Expense", "/cashflow"); },
        category: "action",
      },
    ];

    return [...navItems, ...assetItems, ...actionItems];
  }, [assets, isTh, handleNavigate]);

  const recentItems: CommandItem[] = useMemo(() => {
    if (query) return [];
    return recentActions.slice(0, 4).map((r, i) => ({
      id: `recent-${i}`,
      label: r.label,
      sublabel: isTh ? "เมื่อกี้" : "Recent",
      icon: <Clock size={14} className="text-gray-500" />,
      action: () => { router.push(r.page); setOpen(false); },
      category: "recent" as const,
    }));
  }, [query, isTh, router]);

  const filtered = useMemo(() => {
    if (!query) return [...recentItems, ...items.filter(i => i.category === "navigation"), ...items.filter(i => i.category === "action")];
    const q = query.toLowerCase();
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.sublabel?.toLowerCase().includes(q)
    );
  }, [items, recentItems, query]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, (quickLogResult ? filtered.length : filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      if (quickLogResult && (selectedIndex === filtered.length || filtered.length === 0)) {
        handleQuickLog();
      } else if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        setOpen(false);
      }
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-start justify-center pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl bg-[#1a1a1a] border border-border rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            {/* ─── Input ─── */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <Search size={17} className="text-gray-500 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isTh
                  ? "ค้นหาหน้า · สินทรัพย์ · หรือพิมพ์ 'รายได้ 50000' เพื่อบันทึกเร็ว"
                  : "Search · or type 'income 50000' / 'lunch 150' to quick-log"}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-gray-600"
              />
              <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-bold text-gray-500 border border-border">ESC</kbd>
            </div>

            {/* ─── Quick-log preview ─── */}
            <AnimatePresence>
              {quickLogResult && !loggedFlash && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div
                    className={cn(
                      "mx-3 my-2 px-4 py-3 rounded-xl border cursor-pointer flex items-center justify-between gap-3 transition-all hover:brightness-110",
                      quickLogResult.type === "INCOME"
                        ? "bg-[#4EDEA3]/10 border-[#4EDEA3]/30"
                        : "bg-[#FFB4AB]/10 border-[#FFB4AB]/30"
                    )}
                    onClick={handleQuickLog}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        quickLogResult.type === "INCOME" ? "bg-[#4EDEA3]/20" : "bg-[#FFB4AB]/20"
                      )}>
                        {quickLogResult.type === "INCOME"
                          ? <DollarSign size={15} className="text-[#4EDEA3]" />
                          : <Receipt size={15} className="text-[#FFB4AB]" />
                        }
                      </div>
                      <div>
                        <p className="text-xs font-black text-white">
                          ⚡ Quick Log: {quickLogResult.type === "INCOME" ? "Income" : "Expense"}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {formatMoney(quickLogResult.amount)} · {quickLogResult.category} · Press Enter ↵
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      "text-sm font-black tracking-tighter",
                      quickLogResult.type === "INCOME" ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                    )}>
                      {quickLogResult.type === "INCOME" ? "+" : "-"}{formatMoney(quickLogResult.amount)}
                    </span>
                  </div>
                </motion.div>
              )}

              {loggedFlash && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mx-3 my-2 px-4 py-3 rounded-xl bg-[#4EDEA3]/15 border border-[#4EDEA3]/30 flex items-center gap-2">
                    <Zap size={14} className="text-[#4EDEA3]" />
                    <span className="text-xs font-black text-[#4EDEA3]">✓ Logged: {loggedFlash}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── Results ─── */}
            <div className="max-h-[340px] overflow-y-auto py-1.5" style={{ scrollbarWidth: "none" }}>
              {filtered.length === 0 && !quickLogResult ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {isTh ? "ไม่พบผลลัพธ์" : "No results found"}
                </div>
              ) : (
                <>
                  {(["recent", "navigation", "action", "asset"] as const).map(cat => {
                    const catItems = filtered.filter(i => i.category === cat);
                    if (catItems.length === 0) return null;
                    const catLabel = cat === "navigation" ? (isTh ? "หน้า" : "Pages")
                      : cat === "asset" ? (isTh ? "สินทรัพย์" : "Assets")
                      : cat === "action" ? (isTh ? "คำสั่งด่วน" : "Quick Actions")
                      : (isTh ? "ล่าสุด" : "Recent");
                    return (
                      <div key={cat}>
                        <div className="px-4 pt-2.5 pb-1 text-[9px] font-black uppercase tracking-widest text-gray-600 flex items-center gap-1.5">
                          {cat === "recent" && <Clock size={9} />}
                          {cat === "action" && <Zap size={9} className="text-[#E9C349]" />}
                          {catLabel}
                        </div>
                        {catItems.map(item => {
                          const globalIndex = filtered.indexOf(item);
                          return (
                            <button
                              key={item.id}
                              onClick={() => { item.action(); }}
                              onMouseEnter={() => setSelectedIndex(globalIndex)}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                                globalIndex === selectedIndex ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                              )}
                            >
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                cat === "asset" ? "bg-transparent" : "bg-white/5",
                                globalIndex === selectedIndex && cat !== "asset" ? "bg-white/10" : ""
                              )}>
                                <span className="text-gray-400">{item.icon}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-white truncate">{item.label}</div>
                                {item.sublabel && <div className="text-[10px] text-gray-500 truncate">{item.sublabel}</div>}
                              </div>
                              {item.badge && (
                                <span
                                  className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                                  style={{ color: item.badgeColor, backgroundColor: `${item.badgeColor}20` }}
                                >
                                  {item.badge}
                                </span>
                              )}
                              {globalIndex === selectedIndex && (
                                <ChevronRight size={14} className="text-gray-600 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* ─── Footer ─── */}
            <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-gray-600">
              <span>↑↓ {isTh ? "เลือก" : "Navigate"}</span>
              <span>↵ {isTh ? "เปิด" : "Open"}</span>
              <span>ESC {isTh ? "ปิด" : "Close"}</span>
              <span className="ml-auto text-gray-700">
                {isTh ? "พิมพ์ 'รายได้ 50000' เพื่อบันทึก" : "Type 'income 50k' to quick-log"}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
