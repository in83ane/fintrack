"use client";

import React from "react";
import { Bell, Globe, ChevronDown, Search, Menu, X } from "lucide-react";
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
  const { language, setLanguage, currency, setCurrency, t, userProfile, notifications, markNotificationRead, clearNotifications } = useApp();
  const pathname = usePathname();
  const [showLangMenu, setShowLangMenu] = React.useState(false);
  const [showMobileMenu, setShowMobileMenu] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);
  const [showNotifMenu, setShowNotifMenu] = React.useState(false);

  const langMenuRef = React.useRef<HTMLDivElement>(null);
  const notifMenuRef = React.useRef<HTMLDivElement>(null);
  const profileMenuRef = React.useRef<HTMLDivElement>(null);

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
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showLangMenu, showNotifMenu, showProfileMenu]);

  const isDashboard = pathname === "/dashboard" || pathname === "/";

  const pageTitle = React.useMemo(() => {
    const path = pathname.split("/").pop() || "dashboard";
    return t(path) || path.charAt(0).toUpperCase() + path.slice(1);
  }, [pathname, t]);

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: "en", label: "ENG", flag: "🇺🇸" },
    { code: "th", label: "THA", flag: "🇹🇭" },
  ];

  const currencies: Currency[] = ["USD", "THB"];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Searching for:", searchQuery);
    // Add search logic here
  };

  return (
    <>
      <header className="w-full top-0 sticky z-50 bg-[#1C1B1B]/80 backdrop-blur-md border-b border-white/5 flex justify-between items-center px-6 lg:px-12 py-4">
        <div className="flex items-center gap-4 lg:gap-8">
          <button 
            onClick={() => setShowMobileMenu(true)}
            className="lg:hidden p-2 text-gray-400 hover:text-white transition-colors"
          >
            <Menu size={24} />
          </button>
          <h2 className="text-sm font-black uppercase tracking-wide text-white hidden md:block">
            {pageTitle}
          </h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search Bar - Mobile hidden */}
          <form onSubmit={handleSearch} className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 focus-within:border-[#ADC6FF]/50 transition-all">
            <Search size={12} className="text-gray-500 flex-shrink-0" />
            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-white placeholder:text-gray-600 w-28 lg:w-40"
            />
          </form>

          {/* Language Selector - Compact */}
          <div className="relative" ref={langMenuRef}>
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              <Globe size={12} className="text-gray-400" />
              <span className="text-[10px] font-black uppercase tracking-wide text-white hidden sm:inline">
                {languages.find(l => l.code === language)?.label}
              </span>
              <ChevronDown size={10} className={cn("text-gray-500 transition-transform", showLangMenu && "rotate-180")} />
            </button>

            <AnimatePresence>
              {showLangMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full right-0 mt-2 w-28 bg-[#1C1B1B] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-[60]"
                >
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLanguage(lang.code);
                        setShowLangMenu(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-black uppercase tracking-wide transition-colors hover:bg-white/5",
                        language === lang.code ? "text-[#4EDEA3]" : "text-gray-400"
                      )}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Currency Selector - Compact */}
          <div className="flex bg-white/5 rounded-full p-0.5 border border-white/10">
            {currencies.map((curr) => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide transition-all",
                  currency === curr
                    ? "bg-[#ADC6FF] text-[#00285d]"
                    : "text-gray-500 hover:text-white"
                )}
              >
                {curr}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 relative">
            <div ref={notifMenuRef} className="flex items-center">
              <button
                onClick={() => { setShowNotifMenu(!showNotifMenu); setShowProfileMenu(false); setShowLangMenu(false); }}
                className="text-gray-400 hover:text-white transition-colors relative flex items-center h-full p-1"
              >
                <Bell size={18} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 bg-[#FFB4AB] rounded-full border-2 border-[#1C1B1B] flex items-center justify-center">
                    <span className="text-[7px] font-black text-[#1C1B1B]">{notifications.filter(n => !n.read).length}</span>
                  </span>
                )}
              </button>
              
              <AnimatePresence>
                {showNotifMenu && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full right-12 mt-4 w-80 bg-[#1C1B1B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[60]"
                  >
                    <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                      <span className="text-sm font-bold text-white uppercase tracking-wide">{t("notifications")}</span>
                      {notifications.length > 0 && (
                        <div className="flex gap-2">
                          <button onClick={() => { notifications.forEach(n => markNotificationRead(n.id)); }} className="text-[10px] font-bold text-[#ADC6FF] hover:text-white transition-colors">
                            {t("markAllRead")}
                          </button>
                          <span className="text-gray-600">·</span>
                          <button onClick={clearNotifications} className="text-[10px] font-bold text-[#FFB4AB] hover:text-white transition-colors">
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
                                "px-4 py-3 border-b border-white/5 cursor-pointer transition-all hover:bg-white/5",
                                !notif.read && "bg-white/[0.02]"
                              )}
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: color }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-white truncate">{notif.title}</p>
                                  <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{notif.message}</p>
                                  <p className="text-[9px] text-gray-600 mt-1 font-medium">{formatTimeAgo(notif.time, t)}</p>
                                </div>
                                {!notif.read && <div className="w-1.5 h-1.5 rounded-full bg-[#ADC6FF] mt-2 flex-shrink-0" />}
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
                className="w-8 h-8 rounded-full border border-[#ADC6FF]/20 overflow-hidden bg-white/5 flex items-center justify-center relative group cursor-pointer"
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
                <div className="absolute inset-0 items-center justify-center text-xs font-black text-[#ADC6FF] hidden">
                   {userProfile?.initials || "US"}
                </div>
              </div>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full right-0 mt-4 w-56 bg-[#1C1B1B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-1 z-[60]"
                  >
                    <div className="px-4 py-3 border-b border-white/5 mb-1">
                      <p className="text-sm font-bold text-white truncate">{userProfile?.email || "User"}</p>
                      <p className="text-xs text-[#4EDEA3] mt-0.5 font-medium">{t("premiumTier") || "Premium Plan"}</p>
                    </div>
                    
                    <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                      <User size={14} /> {t("myProfile")}
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                      <Settings size={14} /> {t("settings")}
                    </button>
                    
                    <div className="border-t border-white/5 mt-1 pt-1">
                      <button 
                        onClick={async () => {
                          const keysToRemove = [
                            "fintrack-assets", "fintrack-trades", "fintrack-allocations",
                            "fintrack-buckets", "fintrack-bucket-activities", "fintrack-cash-activities"
                          ];
                          keysToRemove.forEach(key => localStorage.removeItem(key));
                          
                          const { supabase } = await import('@/src/lib/supabase');
                          await supabase.auth.signOut();
                          await logoutAction();
                          window.location.href = "/login";
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-[#FFB4AB] hover:bg-white/5 transition-colors"
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
              className="absolute left-0 top-0 bottom-0 w-72 bg-[#0E0E0E] shadow-2xl"
            >
              <div className="flex justify-end p-4">
                <button onClick={() => setShowMobileMenu(false)} className="p-2 text-gray-400 hover:text-white">
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
