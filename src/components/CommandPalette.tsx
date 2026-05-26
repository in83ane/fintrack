"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Search, LayoutDashboard, Briefcase, TrendingUp, Wallet, ArrowRightLeft, Calendar, Settings, X, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useApp } from "@/src/context/AppContext";

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  action: () => void;
  category: "navigation" | "asset" | "action";
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { assets, t, language } = useApp();
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
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const items: CommandItem[] = useMemo(() => {
    const navItems: CommandItem[] = [
      { id: "nav-dashboard", label: isTh ? "แดชบอร์ด" : "Dashboard", icon: <LayoutDashboard size={16} />, action: () => router.push("/dashboard"), category: "navigation" },
      { id: "nav-portfolio", label: isTh ? "พอร์ตโฟลิโอ" : "Portfolio", icon: <Briefcase size={16} />, action: () => router.push("/portfolio"), category: "navigation" },
      { id: "nav-trade", label: isTh ? "ผู้ช่วยเทรด" : "Trade Assistant", icon: <TrendingUp size={16} />, action: () => router.push("/trade"), category: "navigation" },
      { id: "nav-budget", label: isTh ? "งบประมาณ" : "Budget", icon: <Wallet size={16} />, action: () => router.push("/budget"), category: "navigation" },
      { id: "nav-cashflow", label: isTh ? "กระแสเงินสด" : "Cashflow", icon: <ArrowRightLeft size={16} />, action: () => router.push("/cashflow"), category: "navigation" },
      { id: "nav-calendar", label: isTh ? "ปฏิทิน" : "Calendar", icon: <Calendar size={16} />, action: () => router.push("/calendar"), category: "navigation" },
      { id: "nav-settings", label: isTh ? "ตั้งค่า" : "Settings", icon: <Settings size={16} />, action: () => router.push("/settings"), category: "navigation" },
    ];

    const assetItems: CommandItem[] = assets.map(a => ({
      id: `asset-${a.symbol}`,
      label: a.symbol,
      sublabel: a.name,
      icon: <TrendingUp size={16} />,
      action: () => router.push(`/trade/${a.symbol}`),
      category: "asset" as const,
    }));

    return [...navItems, ...assetItems];
  }, [assets, isTh, router]);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.sublabel?.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      filtered[selectedIndex].action();
      setOpen(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
        onClick={() => setOpen(false)}
      >
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-lg bg-[#1C1B1B] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
            <Search size={18} className="text-gray-500 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isTh ? "ค้นหาหน้า, สินทรัพย์, คำสั่ง..." : "Search pages, assets, commands..."}
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-gray-600"
            />
            <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-bold text-gray-500 border border-white/10">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-[300px] overflow-y-auto py-2">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                {isTh ? "ไม่พบผลลัพธ์" : "No results found"}
              </div>
            ) : (
              <>
                {["navigation", "asset", "action"].map(cat => {
                  const catItems = filtered.filter(i => i.category === cat);
                  if (catItems.length === 0) return null;
                  return (
                    <div key={cat}>
                      <div className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-600">
                        {cat === "navigation" ? (isTh ? "นำทาง" : "Navigation") :
                         cat === "asset" ? (isTh ? "สินทรัพย์" : "Assets") :
                         (isTh ? "คำสั่ง" : "Actions")}
                      </div>
                      {catItems.map((item, i) => {
                        const globalIndex = filtered.indexOf(item);
                        return (
                          <button
                            key={item.id}
                            onClick={() => { item.action(); setOpen(false); }}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              globalIndex === selectedIndex ? "bg-white/5" : "hover:bg-white/[0.02]"
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">
                              {item.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-white truncate">{item.label}</div>
                              {item.sublabel && <div className="text-xs text-gray-500 truncate">{item.sublabel}</div>}
                            </div>
                            {globalIndex === selectedIndex && (
                              <ArrowRight size={14} className="text-gray-500 shrink-0" />
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

          {/* Footer */}
          <div className="px-4 py-2 border-t border-white/5 flex items-center gap-4 text-[10px] text-gray-600">
            <span>↑↓ {isTh ? "เลือก" : "Navigate"}</span>
            <span>↵ {isTh ? "เปิด" : "Open"}</span>
            <span>ESC {isTh ? "ปิด" : "Close"}</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
