"use client";

import React from "react";
import { InterfaceControls } from "./InterfaceControls";
import { useFxRate } from '@/src/hooks/useFxRate';
import { Bell, Globe, ChevronDown, Search, Menu, X, Plus, Check, Layers, Pencil } from "lucide-react";
import { useApp, Language, Currency, AppNotification } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { Sidebar } from "./Sidebar";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { logoutAction } from "@/src/app/actions";
import { LogOut, Settings, User } from "lucide-react";

function formatTimeAgo(time: Date, t: (key: string) => string): string {
  const now = new Date();
  const diffMs = now.getTime() - time.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  if (diffMin < 1) return t("justNow");
  if (diffMin < 60) return t("minutesAgo").replace("{n}", String(diffMin));
  return t("hoursAgo").replace("{n}", String(diffHr));
}

export function TopBar() {
  const fx = useFxRate();
  const { language, setLanguage, currency, setCurrency, t, userProfile, notifications, markNotificationRead, clearNotifications, portfolios, activePortfolio, isAllPortfolios, selectPortfolio, createPortfolio, renamePortfolio } = useApp();
  const pathname = usePathname();
  React.useEffect(()=>{
    const bar=document.querySelector('.ft-topbar');if(!bar)return;
    const measure=()=>document.documentElement.style.setProperty('--ft-topbar-height',`${bar.getBoundingClientRect().height}px`);
    measure();const observer=new ResizeObserver(measure);observer.observe(bar);return()=>observer.disconnect();
  },[]);

  // Separate Bucket (cash_management) from trading portfolios — Bucket should not be renamable
  const tradingPortfolios = React.useMemo(
    () => portfolios.filter((p) => p.kind === "trading"),
    [portfolios]
  );
  const cashManagementPortfolio = React.useMemo(
    () => portfolios.find((p) => p.kind === "cash_management") || null,
    [portfolios]
  );
  const [showLangMenu, setShowLangMenu] = React.useState(false);
  const [showMobileMenu, setShowMobileMenu] = React.useState(false);
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);
  const [showNotifMenu, setShowNotifMenu] = React.useState(false);
  const [showPortfolioMenu, setShowPortfolioMenu] = React.useState(false);
  const [portfolioName, setPortfolioName] = React.useState("");
  const [isCreatingPortfolio, setIsCreatingPortfolio] = React.useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = React.useState<string | null>(null);
  const [editingPortfolioName, setEditingPortfolioName] = React.useState("");

  const langMenuRef = React.useRef<HTMLDivElement>(null);
  const notifMenuRef = React.useRef<HTMLDivElement>(null);
  const profileMenuRef = React.useRef<HTMLDivElement>(null);
  const portfolioMenuRef = React.useRef<HTMLDivElement>(null);
  const currencyBtnRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const [currencyHighlight, setCurrencyHighlight] = React.useState({ left: 0, width: 0 });

  const measureCurrencyHighlight = React.useCallback(() => {
    const btn = currencyBtnRefs.current[currency];
    if (btn) {
      setCurrencyHighlight({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
  }, [currency]);

  React.useLayoutEffect(() => {
    measureCurrencyHighlight();
  }, [measureCurrencyHighlight]);

  React.useEffect(() => {
    window.addEventListener("resize", measureCurrencyHighlight);
    return () => window.removeEventListener("resize", measureCurrencyHighlight);
  }, [measureCurrencyHighlight]);

  // Close all popups when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (showLangMenu && langMenuRef.current && !langMenuRef.current.contains(target)) {
        setShowLangMenu(false);
      }
      if (showNotifMenu && notifMenuRef.current && !notifMenuRef.current.contains(target)) {
        setShowNotifMenu(false);
      }
      if (showProfileMenu && profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
      if (showPortfolioMenu && portfolioMenuRef.current && !portfolioMenuRef.current.contains(target)) {
        setShowPortfolioMenu(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showLangMenu, showNotifMenu, showProfileMenu, showPortfolioMenu]);

  const handleCreatePortfolio = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!portfolioName.trim()) return;
    setIsCreatingPortfolio(true);
    const created = await createPortfolio(portfolioName);
    if (created) {
      setPortfolioName("");
      setShowPortfolioMenu(false);
    }
    setIsCreatingPortfolio(false);
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

  const isDashboard = pathname === "/dashboard" || pathname === "/";

  const pageTitle = React.useMemo(() => {
    if (pathname === "/budget") return t("budgetPage");
    const path = pathname.split("/").pop() || "dashboard";
    return t(path) || path.charAt(0).toUpperCase() + path.slice(1);
  }, [pathname, t]);

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: "en", label: "ENG", flag: "🇺🇸" },
    { code: "th", label: "THA", flag: "🇹🇭" },
  ];

  const currencies: Currency[] = ["USD", "THB"];

  return (
    <>
      <header className="ft-topbar sticky top-0 z-50 flex w-full min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface/80 px-3 py-3  sm:px-4 lg:px-6 lg:py-3">
        <div className="flex min-w-0 shrink items-center gap-2 lg:gap-8">
          <button
            aria-label={language === "th" ? "เปิดเมนู" : "Open navigation"}
            onClick={() => setShowMobileMenu(true)}
            className="lg:hidden shrink-0 rounded-xl p-2 text-gray-400 hover:bg-foreground/5 hover:text-foreground transition-colors"
          >
            <Menu size={24} />
          </button>
          {!pathname.startsWith('/trade') && (
            <h2 className="text-sm font-bold tracking-wide text-foreground hidden md:block">
              {pageTitle}
            </h2>
          )}
          <div id="topbar-price-portal" className="hidden items-center gap-3 xl:flex"></div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-3">
          {/* ⌘K Search Trigger */}
          <div className="hidden 2xl:flex h-9 box-border items-center rounded-full bg-foreground/5 border border-border hover:border-primary/30 transition-all">
            <button
              onClick={() => { const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true }); window.dispatchEvent(e); }}
              className="flex h-full items-center gap-2 px-3 leading-none cursor-pointer"
            >
              <Search size={12} className="text-gray-500" />
              <span className="text-xs text-gray-500">{t('searchPlaceholder')}</span>
              <kbd className="text-xs font-bold text-gray-600 bg-foreground/5 px-1.5 py-0.5 rounded border border-border">⌘K</kbd>
            </button>
          </div>

          <div className="relative hidden lg:block" ref={portfolioMenuRef}>
            <div
              className={cn(
                "box-border flex h-9 max-w-44 shrink-0 items-center rounded-full border border-border bg-foreground/5 hover:bg-foreground/10 transition-colors",
                showPortfolioMenu && "border-primary/40 bg-foreground/10"
              )}
            >
              <button
                onClick={() => setShowPortfolioMenu(open => !open)}
                className="flex h-full min-w-0 items-center gap-2 rounded-full px-3 text-xs font-bold leading-none text-foreground"
                aria-label="Choose investment portfolio"
              >
                {isAllPortfolios ? (
                  <Layers size={14} className="shrink-0 text-primary" />
                ) : (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: activePortfolio?.color || "#ADC6FF" }} />
                )}
                <span className="truncate">{isAllPortfolios ? "All portfolios" : (activePortfolio?.name || "Portfolio")}</span>
                <ChevronDown size={11} className={cn("shrink-0 text-gray-500 transition-transform", showPortfolioMenu && "rotate-180")} />
              </button>
            </div>
            <AnimatePresence>
              {showPortfolioMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute right-0 top-full z-[60] mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-background p-2 shadow-2xl shadow-black/40"
                >
                  <p className="px-2 py-1 text-xs font-black uppercase tracking-wide text-gray-500">Investment portfolios</p>
                  <div className="max-h-48 space-y-0.5 overflow-y-auto py-1">
                    <button
                      onClick={() => { selectPortfolio(null); setShowPortfolioMenu(false); }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors",
                        isAllPortfolios ? "bg-primary/15 text-primary" : "text-gray-400 hover:bg-foreground/5 hover:text-foreground"
                      )}
                    >
                      <span className="flex items-center gap-2"><Layers size={14} /> All portfolios</span>
                      {isAllPortfolios && <Check size={14} />}
                    </button>
                    {cashManagementPortfolio && (
                      <button
                        onClick={() => { selectPortfolio(cashManagementPortfolio.id); setShowPortfolioMenu(false); }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors",
                          activePortfolio?.id === cashManagementPortfolio.id ? "bg-primary/15 text-primary" : "text-gray-400 hover:bg-foreground/5 hover:text-foreground"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cashManagementPortfolio.color }} />
                          <span className="truncate">{cashManagementPortfolio.name}</span>
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
                            <button type="submit" className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-label="Save portfolio name"><Check size={14} /></button>
                          </form>
                        ) : (
                          <>
                            <button
                              onClick={() => { selectPortfolio(portfolio.id); setShowPortfolioMenu(false); }}
                              className={cn(
                                "flex min-w-0 flex-1 items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors",
                                activePortfolio?.id === portfolio.id ? "text-primary" : "text-gray-400 hover:bg-foreground/5 hover:text-foreground"
                              )}
                            >
                              <span className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: portfolio.color }} /><span className="truncate">{portfolio.name}</span></span>
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
                  <form onSubmit={handleCreatePortfolio} className="mt-1 flex gap-2 border-t border-border pt-2">
                    <input
                      value={portfolioName}
                      onChange={(event) => setPortfolioName(event.target.value)}
                      maxLength={80}
                      placeholder="New portfolio"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-gray-600 focus:border-primary/60"
                    />
                    <button
                      type="submit"
                      disabled={!portfolioName.trim() || isCreatingPortfolio}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Create portfolio"
                    >
                      <Plus size={16} />
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Language Selector - Compact */}
          <div className="relative" ref={langMenuRef}>
            <div
              className={cn(
                "box-border flex h-9 shrink-0 items-center rounded-full border border-border bg-foreground/5 hover:bg-foreground/10 transition-all",
                showLangMenu && "border-primary/40 bg-foreground/10"
              )}
            >
              <button
                aria-label={language === "th" ? "ภาษา" : "Language"}
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex h-full items-center gap-1.5 rounded-full px-3 leading-none"
              >
                <Globe size={13} className="shrink-0 text-primary" />
                <span className="text-xs font-black uppercase tracking-wide text-foreground hidden sm:inline">
                  {languages.find(l => l.code === language)?.label}
                </span>
                <ChevronDown size={10} className={cn("text-gray-500 transition-transform", showLangMenu && "rotate-180")} />
              </button>
            </div>

            <AnimatePresence>
              {showLangMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full right-0 mt-2 w-28 bg-background border border-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden py-1 z-[60]"
                >
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLanguage(lang.code);
                        setShowLangMenu(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-black uppercase tracking-wide transition-colors hover:bg-foreground/5",
                        language === lang.code ? "text-primary" : "text-gray-400"
                      )}
                    >

                      <span>{lang.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="ft-fx-chip shrink-0 px-2 py-1 text-right" aria-live="polite" aria-label="USD THB exchange rate">
            <div className="text-xs font-bold text-primary sm:text-xs">1 USD = {fx.rate ? Number(fx.rate).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'} THB</div>
            <div className="text-xs text-gray-500">
              {!fx.rate ? (language === 'th' ? 'รอข้อมูลเรท' : 'Rate unavailable') : fx.mode === 'manual' ? 'Manual' : `${fx.stale ? (language === 'th' ? 'เรทเก่า · ' : 'Stale · ') : 'Auto · '}${fx.quote ? new Date(fx.quote.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : ''} ICT`}
            </div>
          </div>
          {/* Currency Selector - Capsule Toggle */}
          <div className="relative flex h-9 shrink-0 items-center rounded-full border border-border bg-foreground/5 p-1 box-border">
            <motion.div
              className="absolute top-1 bottom-1 rounded-full bg-primary"
              animate={{ left: currencyHighlight.left, width: currencyHighlight.width }}
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
            />
            {currencies.map((curr) => (
              <button
                key={curr}
                ref={(el) => { currencyBtnRefs.current[curr] = el; }}
                aria-pressed={currency === curr}
                onClick={() => setCurrency(curr)}
                className={cn(
                  "relative z-10 flex h-full items-center justify-center rounded-full px-3 text-xs font-black uppercase tracking-wide transition-colors",
                  currency === curr ? "text-primary-foreground" : "text-gray-500 hover:text-foreground"
                )}
              >
                {curr}
              </button>
            ))}
          </div>

          <InterfaceControls />
          <div className="relative flex shrink-0 items-center gap-1.5 sm:gap-3">
            <div ref={notifMenuRef} className="flex items-center">
              <button
                aria-label={t("notifications")} aria-expanded={showNotifMenu}
                onClick={() => { setShowNotifMenu(!showNotifMenu); setShowProfileMenu(false); setShowLangMenu(false); }}
                className="text-gray-400 hover:text-foreground transition-colors relative flex items-center h-full p-1"
              >
                <Bell size={18} aria-hidden="true" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-primary text-primary-foreground rounded-full border-2 border-surface flex items-center justify-center">
                    <span className="text-xs font-bold text-surface">{notifications.filter(n => !n.read).length}</span>
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full right-0 mt-4 w-80 max-w-[calc(100vw-24px)] bg-background border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden z-[60]"
                  >
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground uppercase tracking-wide">{t("notifications")}</span>
                      {notifications.length > 0 && (
                        <div className="flex gap-2">
                          <button onClick={() => { notifications.forEach(n => markNotificationRead(n.id)); }} className="text-xs font-bold text-primary hover:text-foreground transition-colors">
                            {t("markAllRead")}
                          </button>
                          <span className="text-gray-600">·</span>
                          <button onClick={clearNotifications} className="text-xs font-bold text-loss hover:text-foreground transition-colors">
                            {t("clearAll")}
                          </button>
                        </div>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-gray-500 font-medium">
                        {t("noNewNotifications")}
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto">
                        {notifications.map((notif) => {
                          const typeColors: Record<string, string> = {
                            rebalance: "#ADC6FF",
                            price: "#E9C349",
                            trade: "#4EDEA3",
                            system: "#FFB4AB"
                          };
                          const color = typeColors[notif.type] || "#ADC6FF";
                          return (
                            <div
                              key={notif.id}
                              onClick={() => markNotificationRead(notif.id)}
                              className={cn(
                                "px-4 py-3 border-b border-border cursor-pointer transition-all hover:bg-foreground/5",
                                !notif.read && "bg-foreground/[0.02]"
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-foreground truncate">{notif.title}</p>
                                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{notif.message}</p>
                                  <p className="text-xs text-gray-600 mt-1 font-medium">{formatTimeAgo(notif.time, t)}</p>
                                </div>
                                {!notif.read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div ref={profileMenuRef}>
              <div
                onClick={() => { setShowProfileMenu(!showProfileMenu); setShowNotifMenu(false); setShowLangMenu(false); }}
                className="w-8 h-8 rounded-full border border-primary/20 overflow-hidden bg-foreground/5 flex items-center justify-center relative group cursor-pointer"
              >
                {userProfile ? (
                  <img
                    src={userProfile.avatarUrl}
                    alt={userProfile.email}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextElementSibling) {
                        (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div className="absolute inset-0 items-center justify-center text-xs font-black text-primary hidden">
                  {userProfile?.initials || "US"}
                </div>
              </div>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full right-0 mt-4 w-56 bg-background border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden py-1 z-[60]"
                  >
                    <div className="px-4 py-3 border-b border-border mb-1">
                      <p className="text-sm font-bold text-foreground truncate">{userProfile?.email || "User"}</p>
                      <p className="text-xs text-primary mt-0.5 font-medium">{t("premiumTier") || "Premium Plan"}</p>
                    </div>

                    <Link href="/settings" onClick={() => setShowProfileMenu(false)} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-foreground hover:bg-foreground/5 transition-colors">
                      <User size={14} /> {t("myProfile")}
                    </Link>
                    <Link href="/settings" onClick={() => setShowProfileMenu(false)} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-foreground hover:bg-foreground/5 transition-colors">
                      <Settings size={14} /> {t("settings")}
                    </Link>

                    <div className="border-t border-border mt-1 pt-1">
                      <button
                        onClick={async () => {
                          const keysToRemove = [
                            "fintrack-assets", "fintrack-trades", "fintrack-allocations",
                            "fintrack-buckets", "fintrack-bucket-activities", "fintrack-cash-activities"
                          ];
                          keysToRemove.forEach(key => localStorage.removeItem(key));
                          Object.keys(localStorage)
                            .filter(key => key.startsWith("dca_draft_"))
                            .forEach(key => localStorage.removeItem(key));

                          const { supabase } = await import('@/src/lib/supabase');
                          await supabase.auth.signOut();
                          await logoutAction();
                          window.location.href = "/login";
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-loss hover:bg-foreground/5 transition-colors"
                      >
                        <LogOut size={14} /> {t("logout")}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {showMobileMenu && (
          <div className="fixed inset-0 z-[100] lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileMenu(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute left-0 top-0 bottom-0 w-72 bg-background shadow-2xl"
            >
              <div className="flex justify-end p-4">
                <button onClick={() => setShowMobileMenu(false)} className="p-2 text-gray-400 hover:text-foreground">
                  <X size={24} />
                </button>
              </div>
              <Sidebar isMobile onClose={() => setShowMobileMenu(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
