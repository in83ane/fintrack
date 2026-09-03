"use client";

import React from "react";
import { LayoutDashboard, Wallet, Settings, HelpCircle, User, PiggyBank, Monitor, ReceiptText, CalendarDays, ArrowRightLeft, Plus, Check, Layers, Pencil, ChevronDown } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import { logoutAction } from "@/src/app/actions";
import { SettingsModal } from "@/src/components/SettingsModal";

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isMobile, onClose }: SidebarProps) {
  const { t, language, portfolios, activePortfolio, isAllPortfolios, selectPortfolio, createPortfolio, renamePortfolio } = useApp();
  const pathname = usePathname();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [portfolioName, setPortfolioName] = React.useState("");
  const [isAddingPortfolio, setIsAddingPortfolio] = React.useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = React.useState<string | null>(null);
  const [editingPortfolioName, setEditingPortfolioName] = React.useState("");
  const [isPortfolioSectionOpen, setIsPortfolioSectionOpen] = React.useState(true);

  const navItems = [
    { icon: LayoutDashboard, label: t("dashboard"), href: "/dashboard" },
    { icon: Wallet, label: t("portfolio"), href: "/portfolio" },
    { icon: ReceiptText, label: "Ledger", href: "/ledger" },
    { icon: ArrowRightLeft, label: language === "th" ? "กระแสเงินสด" : "Cash Flow", href: "/cashflow" },
    { icon: Monitor, label: "Terminal", href: "/terminal" },
    { icon: PiggyBank, label: t("budgetPage"), href: "/budget" },
    { icon: CalendarDays, label: "Calendar", href: "/calendar" },
    { icon: Settings, label: t("settings"), href: "/settings" },
  ];

  const sidebarClasses = cn(
    "flex h-screen flex-col py-6 border-r border-border",
    isMobile ? "w-full bg-background" : "hidden lg:flex w-64 fixed left-0 top-0 bg-background z-40"
  );

  const handleLogout = async () => {
    // Clear all local storage data related to user session to prevent data bleeding
    const keysToRemove = [
      "fintrack-assets",
      "fintrack-trades",
      "fintrack-allocations",
      "fintrack-buckets",
      "fintrack-bucket-activities",
      "fintrack-cash-activities"
    ];
    keysToRemove.forEach(key => localStorage.removeItem(key));
    Object.keys(localStorage)
      .filter(key => key.startsWith("dca_draft_"))
      .forEach(key => localStorage.removeItem(key));

    await supabase.auth.signOut();
    await logoutAction();
    window.location.href = "/login";
  };

  const handleCreatePortfolio = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!portfolioName.trim()) return;
    setIsAddingPortfolio(true);
    const created = await createPortfolio(portfolioName);
    if (created) setPortfolioName("");
    setIsAddingPortfolio(false);
  };

  const handleRenamePortfolio = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingPortfolioId || !editingPortfolioName.trim()) return;
    const renamed = await renamePortfolio(editingPortfolioId, editingPortfolioName);
    if (renamed) {
      setEditingPortfolioId(null);
      setEditingPortfolioName("");
    }
  };

  return (
    <aside className={sidebarClasses}>
      <div className="px-6 mb-8">
        <Link href="/dashboard" onClick={onClose} className="flex items-center gap-3 group">
          <div className="w-9 h-9 bg-primary/20 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"></path>
              <path d="M7 16l4-6 4 4 4-8"></path>
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide cursor-pointer">
              FinTrack
            </h2>
            <p className="text-[10px] text-gray-500 font-medium tracking-wide uppercase">{t("premiumTier") || "Premium Tier"}</p>
          </div>
        </Link>
      </div>

      <div className={cn("mx-4 mb-5 rounded-2xl border border-border bg-white/[0.03] p-3", !isMobile && "mx-3") }>
          <button
            type="button"
            onClick={() => setIsPortfolioSectionOpen(open => !open)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={isPortfolioSectionOpen}
            aria-controls="portfolio-list"
          >
            <span className="text-[10px] font-black uppercase tracking-wide text-gray-500">Investment portfolio</span>
            <ChevronDown size={15} className={cn("text-gray-500 transition-transform", !isPortfolioSectionOpen && "-rotate-90")} />
          </button>
          {!isPortfolioSectionOpen && (
            <p className="mt-2 truncate text-xs font-bold text-[#ADC6FF]">
              {isAllPortfolios ? "All portfolios" : (activePortfolio?.name || "Portfolio")}
            </p>
          )}
          {isPortfolioSectionOpen && (
          <>
          <div id="portfolio-list" className="mt-2 space-y-1.5">
            <button
              onClick={() => { selectPortfolio(null); onClose?.(); }}
              className={cn(
                "flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-left text-xs font-bold transition-colors",
                isAllPortfolios
                  ? "bg-[#4EDEA3]/15 text-[#4EDEA3]"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <span className="flex min-w-0 items-center gap-2 truncate"><Layers size={14} /> <span className="truncate">All portfolios</span></span>
              {isAllPortfolios && <Check size={14} />}
            </button>
            {portfolios.map((portfolio) => (
              <div key={portfolio.id} className={cn("flex items-center gap-1 rounded-xl", activePortfolio?.id === portfolio.id && "bg-[#ADC6FF]/15")}>
                {editingPortfolioId === portfolio.id ? (
                  <form onSubmit={handleRenamePortfolio} className="flex min-w-0 flex-1 gap-1 p-1">
                    <input
                      autoFocus
                      value={editingPortfolioName}
                      onChange={(event) => setEditingPortfolioName(event.target.value)}
                      maxLength={80}
                      className="min-w-0 flex-1 rounded-lg border border-[#ADC6FF]/40 bg-background px-2 py-1.5 text-xs text-white outline-none"
                    />
                    <button type="submit" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#ADC6FF] text-[#00285d]" aria-label="Save portfolio name"><Check size={14} /></button>
                  </form>
                ) : (
                  <>
                    <button
                      onClick={() => { selectPortfolio(portfolio.id); onClose?.(); }}
                      className={cn(
                        "flex min-h-10 min-w-0 flex-1 items-center justify-between rounded-xl px-3 text-left text-xs font-bold transition-colors",
                        activePortfolio?.id === portfolio.id
                          ? "text-[#ADC6FF]"
                          : "text-gray-400 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: portfolio.color }} />
                        <span className="truncate">{portfolio.name}</span>
                      </span>
                      {activePortfolio?.id === portfolio.id && <Check size={14} />}
                    </button>
                    <button
                      onClick={() => { setEditingPortfolioId(portfolio.id); setEditingPortfolioName(portfolio.name); }}
                      className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-white/10 hover:text-white"
                      aria-label={`Rename ${portfolio.name}`}
                    ><Pencil size={13} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={handleCreatePortfolio} className="mt-2 flex gap-2">
            <input
              value={portfolioName}
              onChange={(event) => setPortfolioName(event.target.value)}
              maxLength={80}
              placeholder="New portfolio"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-white outline-none placeholder:text-gray-600 focus:border-[#ADC6FF]/60"
            />
            <button
              type="submit"
              disabled={isAddingPortfolio || !portfolioName.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ADC6FF] text-[#00285d] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Create portfolio"
            >
              <Plus size={16} />
            </button>
          </form>
          </>
          )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 mx-3 py-2.5 px-4 rounded-xl transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-gray-500 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon size={18} className={isActive ? "text-primary" : ""} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 mt-auto space-y-3">

        <a href="#" className="flex items-center gap-2.5 text-gray-500 px-4 py-2.5 hover:text-white transition-all">
          <HelpCircle size={16} />
          <span className="text-sm">{t("support") || "Support"}</span>
        </a>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-2.5 text-gray-500 px-4 py-2.5 hover:text-white transition-all w-full text-left"
        >
          <Settings size={16} />
          <span className="text-sm">Global Settings</span>
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 text-red-400 px-4 py-2.5 hover:bg-red-400/10 rounded-xl transition-all w-full"
        >
          <User size={16} />
          <span className="text-sm font-bold">{t("logout") || "Logout"}</span>
        </button>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </aside>
  );
}