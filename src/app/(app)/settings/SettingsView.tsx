"use client";

import React, { useState } from "react";
import { Settings, Shield, Bell, User, CreditCard, Globe, Check, ChevronRight, Moon, Download, Upload } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useApp, Language } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { supabase } from "@/src/lib/supabase";
import { dataResetCopy } from "@/src/lib/data-reset-policy";

export default function SettingsPage() {
  const { t, language, setLanguage, currency, setCurrency, addToast, notifPreferences, setNotifPreferences, darkMode, setDarkMode, trades, cashActivities, moneyBuckets, bucketActivities, allocations, activePortfolioId } = useApp();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  
  const resetCopy = dataResetCopy[language];

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: "en", label: "English", flag: "🇺🇸" },
    { code: "th", label: "ไทย", flag: "🇹🇭" },
  ];

  const currencies = ["USD", "THB", "JPY", "EUR"];

  const handleSave = () => {
    addToast(t("settingsSaved"), 'success');
  };

  const handleExportData = () => {
    const data = {
      version: 1,
      portfolioId: activePortfolioId,
      trades,
      cashActivities,
      moneyBuckets,
      bucketActivities,
      allocations,
      language,
      currency,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fintrack-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast(t("exportSuccess"), 'success');
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          addToast(language === 'th' ? 'การนำเข้ารองรับเฉพาะโหมดออฟไลน์ กรุณาออกจากระบบก่อน' : 'Import is available in offline mode only. Sign out before importing a backup.', 'warning');
          return;
        }
        if (data.trades) localStorage.setItem('fintrack-trades', JSON.stringify(data.trades));
        if (data.cashActivities) localStorage.setItem('fintrack-cash-activities', JSON.stringify(data.cashActivities));
        if (data.moneyBuckets) localStorage.setItem('fintrack-buckets', JSON.stringify(data.moneyBuckets));
        if (data.bucketActivities) localStorage.setItem('fintrack-bucket-activities', JSON.stringify(data.bucketActivities));
        if (data.allocations) localStorage.setItem('fintrack-allocations', JSON.stringify(data.allocations));
        if (data.language) localStorage.setItem('preferred-lang', data.language);
        if (data.currency) localStorage.setItem('preferred-currency', data.currency);
        addToast(t("importSuccessData"), 'success');
        window.location.reload();
      } catch (error) {
        addToast(t("invalidBackupFile"), 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleNotifPref = (key: keyof typeof notifPreferences) => {
    setNotifPreferences({ ...notifPreferences, [key]: !notifPreferences[key] });
  };


  return (
    <div className="app-page-container space-y-12 py-8 lg:py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="text-[#ADC6FF] uppercase tracking-wide text-xs font-black mb-2 block">{t("settings")}</span>
        <h1 className="text-5xl font-black tracking-tighter text-white leading-tight">
          {t("systemPreferences").split(" ")[0]} <span className="text-[#4EDEA3]">{t("systemPreferences").split(" ").slice(1).join(" ") || t("settings")}</span>
        </h1>
      </motion.div>

      <div className="space-y-8">
        {/* Profile Card (#23) */}
        <section>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-[#1C1B1B] to-[#141414] p-6 rounded-3xl border border-border relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#ADC6FF]/5 blur-3xl rounded-full" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ADC6FF] to-[#4D8EFF] flex items-center justify-center text-xl font-bold text-white shadow-lg">
                <User size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">FinTrack User</h3>
                <p className="text-xs text-gray-500">{language === 'th' ? 'สมาชิกตั้งแต่' : 'Member since'} 2024</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-[#4EDEA3] uppercase tracking-wide bg-[#4EDEA3]/10 px-3 py-1 rounded-full border border-[#4EDEA3]/20">
                  {language === 'th' ? 'แอคทีฟ' : 'Active'}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Regional Settings */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 px-2">{t("regionalSettings")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface p-6 rounded-3xl border border-border space-y-4">
              <div className="flex items-center gap-3 text-[#ADC6FF]">
                <Globe size={18} />
                <span className="text-xs font-bold uppercase tracking-wide">{t("languageLabel")}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={cn(
                      "py-3 px-4 rounded-xl text-xs font-bold transition-all border",
                      language === lang.code 
                        ? "bg-[#ADC6FF] text-[#00285d] border-[#ADC6FF]" 
                        : "bg-white/5 text-gray-400 border-border hover:border-border"
                    )}
                  >
                    {lang.flag} {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface p-6 rounded-3xl border border-border space-y-4">
              <div className="flex items-center gap-3 text-[#E9C349]">
                <CreditCard size={18} />
                <span className="text-xs font-bold uppercase tracking-wide">{t("baseCurrency")}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {currencies.map((curr) => (
                  <button
                    key={curr}
                    onClick={() => setCurrency(curr as any)}
                    className={cn(
                      "py-3 px-4 rounded-xl text-xs font-bold transition-all border",
                      currency === curr 
                        ? "bg-[#E9C349] text-[#241a00] border-[#E9C349]" 
                        : "bg-white/5 text-gray-400 border-border hover:border-border"
                    )}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{t("appearance")}</h2>
          <div className="bg-surface rounded-3xl border border-border p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#8B5CF615' }}>
                  <Moon size={18} style={{ color: '#8B5CF6' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{t("darkMode")}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t("darkModeDesc")}</p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={darkMode}
                aria-label={t('darkMode')}
                onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setDarkMode(!darkMode, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                }}
                className={cn(
                  "relative w-12 h-7 rounded-full transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary",
                  darkMode ? "bg-[#8B5CF6]" : "bg-white/10"
                )}
              >
                <span
                  data-theme-thumb
                  className="absolute left-1 top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 motion-reduce:transition-none"
                  style={{ transform: `translateX(${darkMode ? 20 : 0}px)` }}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Data Management */}
        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{t("dataManagement")}</h2>
          <div className="bg-surface rounded-3xl border border-border divide-y divide-white/5">
            <div className="p-6 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#4EDEA315' }}>
                  <Download size={18} style={{ color: '#4EDEA3' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{t("exportData")}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t("exportDataDesc")}</p>
                </div>
              </div>
              <button
                onClick={handleExportData}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all border border-border"
              >
                Export
              </button>
            </div>
            <div className="p-6 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#ADC6FF15' }}>
                  <Upload size={18} style={{ color: '#ADC6FF' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{t("importData")}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t("importDataDesc")}</p>
                </div>
              </div>
              <label className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all border border-border cursor-pointer">
                Import
                <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
              </label>
            </div>
          </div>
        </section>

        {/* Notification Preferences */}
        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{t("notifPreferences")}</h2>
          <div className="bg-surface rounded-3xl border border-border divide-y divide-white/5">
            {[
              { key: 'priceAlerts' as const, label: t("priceAlerts"), desc: t("priceAlertsDesc"), color: "#E9C349" },
              { key: 'rebalanceAlerts' as const, label: t("rebalanceAlerts"), desc: t("rebalanceAlertsDesc"), color: "#ADC6FF" },
              { key: 'weeklyReport' as const, label: t("weeklyReport"), desc: t("weeklyReportDesc"), color: "#FFB4AB" },
            ].map((item) => (
              <div key={item.key} className="p-6 flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${item.color}15` }}>
                    <Bell size={18} style={{ color: item.color }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{item.label}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleNotifPref(item.key)}
                  className={cn(
                    "relative w-12 h-7 rounded-full transition-all duration-300 focus:outline-none",
                    notifPreferences[item.key]
                      ? "bg-[#4EDEA3]"
                      : "bg-white/10"
                  )}
                >
                  <motion.div
                    className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md"
                    animate={{ left: notifPreferences[item.key] ? 24 : 4 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Account & Security */}
        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{t("accountSecurity")}</h2>
          <div className="space-y-4">
            <SettingsSection 
              icon={User} 
              title={t("accountProfile")} 
              description={t("accountProfileDesc")}
              active={activeSection === "profile"}
              onClick={() => setActiveSection(activeSection === "profile" ? null : "profile")}
            />
            <SettingsSection 
              icon={Shield} 
              title={t("securityPrivacy")} 
              description={t("securityPrivacyDesc")}
              active={activeSection === "security"}
              onClick={() => setActiveSection(activeSection === "security" ? null : "security")}
            />
            <SettingsSection 
              icon={Bell} 
              title={t("notificationSettings")} 
              description={t("notificationSettingsDesc")}
              active={activeSection === "notif"}
              onClick={() => setActiveSection(activeSection === "notif" ? null : "notif")}
            />
          </div>
        </section>

        {/* Data reset is paused; no confirmation or destructive handler is mounted. */}
        <section className="space-y-4" aria-labelledby="data-reset-heading">
          <h2 id="data-reset-heading" className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{resetCopy.section}</h2>
          <div className="bg-surface rounded-3xl border border-border p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white">{resetCopy.title}</h3>
              <p id="data-reset-description" className="text-xs text-gray-500 mt-1">
                {resetCopy.description}
              </p>
            </div>
            <button
              type="button"
              disabled
              aria-describedby="data-reset-description"
              className="px-6 py-2 bg-white/5 text-gray-500 border border-border rounded-xl text-xs font-bold cursor-not-allowed shrink-0 max-w-full"
            >
              {resetCopy.unavailable}
            </button>
          </div>
        </section>
      </div>

      <div className="pt-8 border-t border-border">
        <button 
          onClick={handleSave}
          className="px-8 py-4 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all active:scale-95"
        >
          {t("saveAllChanges")}
        </button>
      </div>
    </div>
  );
}

function SettingsSection({ icon: Icon, title, description, active, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "p-6 rounded-3xl border transition-all cursor-pointer group",
        active ? "bg-[#ADC6FF]/5 border-[#ADC6FF]/20" : "bg-surface border-border hover:border-border"
      )}
    >
      <div className="flex items-center gap-6">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
          active ? "bg-[#ADC6FF] text-[#00285d]" : "bg-white/5 text-gray-400 group-hover:text-white"
        )}>
          <Icon size={24} />
        </div>
        <div className="flex-1">
          <h3 className="text-white font-bold">{title}</h3>
          <p className="text-xs text-gray-500 font-medium mt-1">{description}</p>
        </div>
        <div className={cn(
          "w-8 h-8 rounded-full border border-border flex items-center justify-center transition-all",
          active ? "text-[#ADC6FF] rotate-90" : "text-gray-600 group-hover:text-white"
        )}>
          <ChevronRight size={14} />
        </div>
      </div>
    </div>
  );
}
