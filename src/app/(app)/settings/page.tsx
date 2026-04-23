"use client";

import React, { useState } from "react";
import { Settings, Shield, Bell, User, CreditCard, Globe, Check, ChevronRight, Moon, Download, Upload } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useApp, Language } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";

export default function SettingsPage() {
  const { t, language, setLanguage, currency, setCurrency, addToast, notifPreferences, setNotifPreferences } = useApp();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(true);

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
      trades: JSON.parse(localStorage.getItem('trades') || '[]'),
      cashActivities: JSON.parse(localStorage.getItem('cashActivities') || '[]'),
      moneyBuckets: JSON.parse(localStorage.getItem('moneyBuckets') || '[]'),
      bucketActivities: JSON.parse(localStorage.getItem('bucketActivities') || '[]'),
      allocations: JSON.parse(localStorage.getItem('allocations') || '[]'),
      language: localStorage.getItem('preferred-lang') || 'en',
      currency: localStorage.getItem('preferred-currency') || 'USD',
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
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.trades) localStorage.setItem('trades', JSON.stringify(data.trades));
        if (data.cashActivities) localStorage.setItem('cashActivities', JSON.stringify(data.cashActivities));
        if (data.moneyBuckets) localStorage.setItem('moneyBuckets', JSON.stringify(data.moneyBuckets));
        if (data.bucketActivities) localStorage.setItem('bucketActivities', JSON.stringify(data.bucketActivities));
        if (data.allocations) localStorage.setItem('allocations', JSON.stringify(data.allocations));
        addToast(t("importSuccessData"), 'success');
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
    <div className="p-8 lg:p-12 max-w-4xl mx-auto space-y-12">
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
        {/* Regional Settings */}
        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{t("regionalSettings")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#1C1B1B] p-6 rounded-3xl border border-white/5 space-y-4">
              <div className="flex items-center gap-3 text-[#ADC6FF]">
                <Globe size={18} />
                <span className="text-xs font-black uppercase tracking-wide">{t("languageLabel")}</span>
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
                        : "bg-white/5 text-gray-400 border-white/5 hover:border-white/10"
                    )}
                  >
                    {lang.flag} {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#1C1B1B] p-6 rounded-3xl border border-white/5 space-y-4">
              <div className="flex items-center gap-3 text-[#E9C349]">
                <CreditCard size={18} />
                <span className="text-xs font-black uppercase tracking-wide">{t("baseCurrency")}</span>
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
                        : "bg-white/5 text-gray-400 border-white/5 hover:border-white/10"
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
          <div className="bg-[#1C1B1B] rounded-3xl border border-white/5 p-6">
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
                onClick={() => setDarkMode(!darkMode)}
                className={cn(
                  "relative w-12 h-7 rounded-full transition-all duration-300 focus:outline-none",
                  darkMode ? "bg-[#8B5CF6]" : "bg-white/10"
                )}
              >
                <motion.div
                  className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md"
                  animate={{ left: darkMode ? 24 : 4 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Data Management */}
        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{t("dataManagement")}</h2>
          <div className="bg-[#1C1B1B] rounded-3xl border border-white/5 divide-y divide-white/5">
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
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all border border-white/5"
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
              <label className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all border border-white/5 cursor-pointer">
                Import
                <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
              </label>
            </div>
          </div>
        </section>

        {/* Notification Preferences */}
        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{t("notifPreferences")}</h2>
          <div className="bg-[#1C1B1B] rounded-3xl border border-white/5 divide-y divide-white/5">
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
      </div>

      <div className="pt-8 border-t border-white/5">
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
        active ? "bg-[#ADC6FF]/5 border-[#ADC6FF]/20" : "bg-[#1C1B1B] border-white/5 hover:border-white/10"
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
          "w-8 h-8 rounded-full border border-white/5 flex items-center justify-center transition-all",
          active ? "text-[#ADC6FF] rotate-90" : "text-gray-600 group-hover:text-white"
        )}>
          <ChevronRight size={14} />
        </div>
      </div>
    </div>
  );
}
