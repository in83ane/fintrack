"use client";

import React from "react";
import { Bell, Globe, ChevronDown, Search, Menu, X, LayoutDashboard } from "lucide-react";
import { useApp, Language, Currency } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { Sidebar } from "./Sidebar";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { logoutAction } from "@/src/app/actions";
import { LogOut, Settings, User } from "lucide-react";

export function TopBar() {
  const { language, setLanguage, currency, setCurrency, formatMoney, t, exchangeRates, userProfile } = useApp();
  const pathname = usePathname();
  const [showLangMenu, setShowLangMenu] = React.useState(false);
  const [showMobileMenu, setShowMobileMenu] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);
  const [showNotifMenu, setShowNotifMenu] = React.useState(false);

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

        <div className="flex items-center gap-3 lg:gap-6">
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 focus-within:border-[#ADC6FF]/50 transition-all">
            <Search size={14} className="text-gray-500" />
            <input 
              type="text" 
              placeholder={t("search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm text-white placeholder:text-gray-600 w-32 lg:w-48"
            />
          </form>

          {/* Language Selector */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button 
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
              >
                <Globe size={14} className="text-gray-400" />
                <span className="text-xs font-black uppercase tracking-wide text-white">
                  {languages.find(l => l.code === language)?.label}
                </span>
                <ChevronDown size={12} className={cn("text-gray-500 transition-transform", showLangMenu && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showLangMenu && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 w-32 bg-[#1C1B1B] border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-[60]"
                  >
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          setLanguage(lang.code);
                          setShowLangMenu(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors hover:bg-white/5",
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

            {/* Currency Selector */}
            <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
              {currencies.map((curr) => (
                <button
                  key={curr}
                  onClick={() => setCurrency(curr)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide transition-all",
                    currency === curr 
                      ? "bg-[#ADC6FF] text-[#00285d]" 
                      : "text-gray-500 hover:text-white"
                  )}
                >
                  {curr}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 relative">
            <button 
              onClick={() => { setShowNotifMenu(!showNotifMenu); setShowProfileMenu(false); setShowLangMenu(false); }}
              className="text-gray-400 hover:text-white transition-colors relative"
            >
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-[#FFB4AB] rounded-full border-2 border-[#1C1B1B]"></span>
            </button>
            
            <AnimatePresence>
              {showNotifMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-12 mt-4 w-72 bg-[#1C1B1B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden py-2 z-[60]"
                >
                  <div className="px-4 py-2 border-b border-white/5 text-sm font-bold text-white uppercase tracking-wide">
                    {t("notifications")}
                  </div>
                  <div className="p-4 text-center text-xs text-gray-500 font-medium">
                    You have no new notifications.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                    <p className="text-xs text-[#4EDEA3] mt-0.5 font-medium">{t("premium_tier") || "Premium Plan"}</p>
                  </div>
                  
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                    <User size={14} /> My Profile
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                    <Settings size={14} /> {t("settings")}
                  </button>
                  
                  <div className="border-t border-white/5 mt-1 pt-1">
                    <form action={logoutAction}>
                      <button type="submit" className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-[#FFB4AB] hover:bg-white/5 transition-colors">
                        <LogOut size={14} /> {t("logout")}
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
