"use client";

import React from "react";
import { motion } from "motion/react";
import { SupportPanel } from "./SupportPanel";
import { LayoutDashboard, Wallet, Settings, HelpCircle, User, PiggyBank, Monitor, ReceiptText, CalendarDays, ArrowRightLeft, Plus, Check, Layers, Pencil, ChevronDown, Target, Pin, PinOff } from "lucide-react";
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
  // Bucket is a cash-management workspace, not an investment broker.  Keep it
  // in the Bucket navigation item and show only tradeable broker portfolios in
  // this selector.
  const tradingPortfolios = React.useMemo(
    () => portfolios.filter((portfolio) => portfolio.kind === "trading"),
    [portfolios]
  );
  const cashManagementPortfolio = React.useMemo(
    () => portfolios.find((portfolio) => portfolio.kind === "cash_management") || null,
    [portfolios]
  );
  const pathname = usePathname();
  const [pinned, setPinned] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const hoverTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  const [supportOpen, setSupportOpen] = React.useState(false);
  React.useEffect(() => { try { setPinned(localStorage.getItem("fintrack-rail-pinned") === "true"); } catch {} }, []);
  React.useEffect(() => { if (!isMobile) document.documentElement.dataset.railPinned = String(pinned); }, [pinned, isMobile]);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [portfolioName, setPortfolioName] = React.useState("");
  const [isAddingPortfolio, setIsAddingPortfolio] = React.useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = React.useState<string | null>(null);
  const [editingPortfolioName, setEditingPortfolioName] = React.useState("");
  const [isPortfolioSectionOpen, setIsPortfolioSectionOpen] = React.useState(false);
  const portfolioSectionRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!isPortfolioSectionOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (portfolioSectionRef.current && !portfolioSectionRef.current.contains(event.target as Node)) {
        setIsPortfolioSectionOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPortfolioSectionOpen]);

  const navItems = [
    { icon: LayoutDashboard, label: t("dashboard"), href: "/dashboard" },
    { icon: Wallet, label: t("portfolio"), href: "/portfolio" },
    { icon: ReceiptText, label: "Ledger", href: "/ledger" },
    { icon: ArrowRightLeft, label: language === "th" ? "กระแสเงินสด" : "Cash Flow", href: "/cashflow" },
    { icon: Monitor, label: "Terminal", href: "/terminal" },
    { icon: Target, label: "Trade", href: "/trade/plan" },
    { icon: PiggyBank, label: t("budgetPage"), href: "/budget" },
    { icon: CalendarDays, label: "History", href: "/history" },
    { icon: Settings, label: t("settings"), href: "/settings" },
  ];

  const sidebarClasses = cn(
    "flex h-screen flex-col py-6 border-r border-border",
    isMobile ? "w-full bg-background" : "ft-rail hidden lg:flex fixed left-0 top-0 z-40"
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
    <aside className={sidebarClasses} data-pinned={pinned} data-expanded={pinned || hovered}
      onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); if (!isMobile && !pinned) hoverTimer.current = setTimeout(() => setHovered(true), 80); }}
      onMouseLeave={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHovered(false); }} aria-label={language === "th" ? "เมนูหลัก" : "Main navigation"}>
      <div className="rail-brand px-6 mb-5">
        <Link href="/dashboard" onClick={onClose} aria-label="FinTrack" className="flex items-center gap-3 group">
          <div className="w-9 h-9 bg-primary/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-[1.02] transition-transform">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"></path>
              <path d="M7 16l4-6 4 4 4-8"></path>
            </svg>
          </div>
          <div className={isMobile ? "" : "rail-label"}>
            <h2 className="text-lg font-bold text-foreground tracking-wide cursor-pointer">
              FinTrack
            </h2>
            <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Premium</p>
          </div>
        </Link>
      </div>

      <div ref={portfolioSectionRef} className={cn("relative mx-4 mb-5", !isMobile && "rail-account mx-3")}>
        <button
          type="button"
          onClick={() => setIsPortfolioSectionOpen(open => !open)}
          className={cn(
            "rail-account-trigger flex w-full items-center gap-2.5 rounded-2xl border border-border bg-foreground/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.06]",
            isPortfolioSectionOpen && "border-primary/40 bg-foreground/[0.06]"
          )}
          aria-expanded={isPortfolioSectionOpen}
          aria-controls="portfolio-list"
          aria-label={isAllPortfolios ? "Investment accounts: All portfolios" : `Investment accounts: ${activePortfolio?.name || "Portfolio"}`}
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
              isAllPortfolios ? "bg-primary/15 text-primary" : "bg-primary/15 text-primary"
            )}
          >
            {isAllPortfolios ? (
              <Layers size={15} />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activePortfolio?.color || "#ADC6FF" }} />
            )}
          </span>
          <span className={cn("min-w-0 flex-1", !isMobile && "rail-label")}>
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Investment accounts</span>
            <span className="block truncate text-xs font-bold text-foreground">
              {isAllPortfolios ? "All portfolios" : (activePortfolio?.name || "Portfolio")}
            </span>
          </span>
          <ChevronDown size={15} className={cn("shrink-0 text-gray-500 transition-transform", !isMobile && "rail-label", isPortfolioSectionOpen && "rotate-180")} />
        </button>

        {isPortfolioSectionOpen && (
          <div
            id="portfolio-list"
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-2xl border border-border bg-background p-2 shadow-2xl shadow-black/40"
          >
            <div className="max-h-64 space-y-1 overflow-y-auto custom-scrollbar">
              <button
                onClick={() => { selectPortfolio(null); setIsPortfolioSectionOpen(false); onClose?.(); }}
                className={cn(
                  "flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-left text-xs font-bold transition-colors",
                  isAllPortfolios
                    ? "bg-primary/15 text-primary"
                    : "text-gray-400 hover:bg-foreground/5 hover:text-foreground"
                )}
              >
                <span className="flex min-w-0 items-center gap-2 truncate"><Layers size={14} /> <span className="truncate">All portfolios</span></span>
                {isAllPortfolios && <Check size={14} />}
              </button>
              {cashManagementPortfolio && (
                <button
                  onClick={() => { selectPortfolio(cashManagementPortfolio.id); setIsPortfolioSectionOpen(false); onClose?.(); }}
                  className={cn(
                    "flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-left text-xs font-bold transition-colors",
                    activePortfolio?.id === cashManagementPortfolio.id
                      ? "bg-primary/15 text-primary"
                      : "text-gray-400 hover:bg-foreground/5 hover:text-foreground"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <PiggyBank size={14} className="shrink-0" />
                    <span className="truncate">{cashManagementPortfolio.name || "Bucket"}</span>
                  </span>
                  {activePortfolio?.id === cashManagementPortfolio.id && <Check size={14} />}
                </button>
              )}
              {tradingPortfolios.map((portfolio) => (
                <div key={portfolio.id} className={cn("flex items-center gap-1 rounded-xl", activePortfolio?.id === portfolio.id && "bg-primary/15")}>
                  {editingPortfolioId === portfolio.id ? (
                    <form onSubmit={handleRenamePortfolio} className="flex min-w-0 flex-1 gap-1 p-1">
                      <input
                        autoFocus
                        value={editingPortfolioName}
                        onChange={(event) => setEditingPortfolioName(event.target.value)}
                        maxLength={80}
                        className="min-w-0 flex-1 rounded-lg border border-primary/40 bg-background px-2 py-1.5 text-xs text-foreground outline-none"
                      />
                      <button type="submit" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-label="Save portfolio name"><Check size={14} /></button>
                    </form>
                  ) : (
                    <>
                      <button
                        onClick={() => { selectPortfolio(portfolio.id); setIsPortfolioSectionOpen(false); onClose?.(); }}
                        className={cn(
                          "flex min-h-10 min-w-0 flex-1 items-center justify-between rounded-xl px-3 text-left text-xs font-bold transition-colors",
                          activePortfolio?.id === portfolio.id
                            ? "text-primary"
                            : "text-gray-400 hover:bg-foreground/5 hover:text-foreground"
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
                        className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-foreground/10 hover:text-foreground"
                        aria-label={`Rename ${portfolio.name}`}
                      ><Pencil size={13} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={handleCreatePortfolio} className="mt-2 flex gap-2 border-t border-border pt-2">
              <input
                value={portfolioName}
                onChange={(event) => setPortfolioName(event.target.value)}
                maxLength={80}
                placeholder="New broker"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-gray-600 focus:border-primary/60"
              />
              <button
                type="submit"
                disabled={isAddingPortfolio || !portfolioName.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Create portfolio"
              >
                <Plus size={16} />
              </button>
            </form>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto custom-scrollbar">
        {navItems.map((item, index) => {
          const isActive = pathname === item.href || (item.href === "/trade/plan" && pathname.startsWith("/trade"));
          return (
            <Link
              key={item.label}
              href={item.href}
              replace={false}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              onClick={onClose}
              className={cn(
                "relative flex items-center gap-3 mx-3 py-2.5 px-4 rounded-xl transition-colors duration-200",
                isActive
                  ? "text-primary font-semibold"
                  : "text-gray-500 hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              <>{isActive && <motion.span layoutId={isMobile ? "mobile-rail-active" : "rail-active"} className="ft-nav-indicator" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}<item.icon size={18} className={isActive ? "relative text-primary" : "relative"} />
              <span style={{ "--label-delay": `${Math.min(index * 8, 48)}ms` } as React.CSSProperties} className={cn("relative text-sm font-medium", !isMobile && "rail-label")}>{item.label}</span></>
            </Link>
          );
        })}
      </nav>

      <div className="rail-footer px-4 mt-auto space-y-1">

        <button onClick={() => setSupportOpen(true)} title="Support" aria-label={t("support") || "Support"} className="flex w-full items-center gap-2.5 text-gray-500 px-4 py-2.5 hover:text-foreground transition-colors">
          <HelpCircle size={16} />
          <span className={isMobile ? "text-sm" : "rail-label text-sm"}>{t("support") || "Support"}</span>
        </button>

        <button
          title="Global Settings" aria-label="Global Settings"
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-2.5 text-gray-500 px-4 py-2.5 hover:text-foreground transition-all w-full text-left"
        >
          <Settings size={16} />
          <span className={isMobile ? "text-sm" : "rail-label text-sm"}>Global Settings</span>
        </button>

        <button
          title={t("logout")} aria-label={t("logout")}
          onClick={handleLogout}
          className="flex items-center gap-2.5 text-red-400 px-4 py-2.5 hover:bg-red-400/10 rounded-xl transition-all w-full"
        >
          <User size={16} />
          <span className={isMobile ? "text-sm" : "rail-label text-sm"}>{t("logout") || "Logout"}</span>
        </button>
      </div>

      <SupportPanel isOpen={supportOpen} onClose={() => setSupportOpen(false)} />
      {!isMobile && <button className="ft-icon-button rail-pin mx-5 mt-3" aria-pressed={pinned} aria-label={pinned ? "Unpin sidebar" : "Pin sidebar"} title={pinned ? "Unpin sidebar" : "Pin sidebar"} onClick={() => { setPinned(!pinned); try { localStorage.setItem("fintrack-rail-pinned", String(!pinned)); } catch {} }}>{pinned ? <PinOff size={17} /> : <Pin size={17} />}</button>}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </aside>
  );
}
