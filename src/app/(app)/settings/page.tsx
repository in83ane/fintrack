"use client";
import { SettingsSectionNav } from "@/src/components/SettingsSectionNav";

import React, { useState } from "react";
import { Settings, Shield, Bell, User, CreditCard, Globe, Check, ChevronRight, Moon, Download, Upload } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useApp, Language } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { supabase, db } from "@/src/lib/supabase";

export default function SettingsPage() {
  const { t, language, setLanguage, currency, setCurrency, addToast, notifPreferences, setNotifPreferences, darkMode, setDarkMode, trades, cashActivities, moneyBuckets, bucketActivities, allocations, activePortfolioId, userProfile } = useApp();
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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

  const handleDeleteData = async () => {
    if (deleteConfirm !== "DELETE") {
      addToast(language === "th" ? "กรุณาพิมพ์ DELETE เพื่อยืนยัน" : "Please type DELETE to confirm.", "error");
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;

      if (user) {
        const { error } = await db.deleteAllUserData(user.id);
        if (error) throw error;
      }

      [
        'fintrack-assets', 'fintrack-trades', 'fintrack-allocations',
        'fintrack-buckets', 'fintrack-bucket-activities', 'fintrack-cash-activities',
        'fintrack-custom-categories', 'fintrack-nw-settings', 'fintrack-active-portfolio',
      ].forEach(key => localStorage.removeItem(key));
      addToast(language === "th" ? "ข้อมูลทั้งหมดถูกลบแล้ว ยกเว้นชื่อและอีเมล กำลังรีเฟรช..." : "All data deleted except account profile. Refreshing...", "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      console.error("Delete data error:", e);
      addToast(language === "th" ? "เกิดข้อผิดพลาดในการลบข้อมูล" : "Failed to delete data. Please try again.", "error");
    }
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-semibold tracking-tight">{t("systemPreferences")}</h1><p className="mt-2 text-sm text-muted">{language === 'th' ? 'จัดการการแสดงผลและข้อมูลส่วนบุคคล' : 'Manage your workspace, preferences and data.'}</p>
      </motion.div>

      <div className="ft-settings-layout"><SettingsSectionNav /><div className="space-y-8">
        {/* Profile Card (#23) */}
        <section id="settings-profile">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-surface p-6 rounded-2xl border border-border relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-info/5 blur-3xl rounded-full" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-info to-[#4D8EFF] flex items-center justify-center text-xl font-bold text-foreground shadow-lg">
                <User size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground">{userProfile?.email || "FinTrack"}</h3>
                <p className="text-xs text-gray-500">{language === 'th' ? 'บัญชีส่วนตัว' : 'Personal account'}</p>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-gain uppercase tracking-wide bg-gain/10 px-3 py-1 rounded-full border border-gain/20">
                  {language === 'th' ? 'แอคทีฟ' : 'Active'}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Regional Settings */}
        <section id="settings-regional" className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 px-2">{t("regionalSettings")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface p-6 rounded-2xl border border-border space-y-4">
              <div className="flex items-center gap-3 text-info">
                <Globe size={18} />
                <span className="text-xs font-bold uppercase tracking-wide">{t("languageLabel")}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => { setLanguage(lang.code); addToast(t("settingsSaved"), "success"); }}
                    className={cn(
                      "py-3 px-4 rounded-xl text-xs font-bold transition-all border",
                      language === lang.code
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-foreground/5 text-gray-400 border-border hover:border-border"
                    )}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface p-6 rounded-2xl border border-border space-y-4">
              <div className="flex items-center gap-3 text-warning">
                <CreditCard size={18} />
                <span className="text-xs font-bold uppercase tracking-wide">{t("baseCurrency")}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {currencies.map((curr) => (
                  <button
                    key={curr}
                    onClick={() => { setCurrency(curr as any); addToast(t("settingsSaved"), "success"); }}
                    className={cn(
                      "py-3 px-4 rounded-xl text-xs font-bold transition-all border",
                      currency === curr
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-foreground/5 text-gray-400 border-border hover:border-border"
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
        <section id="settings-appearance" className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{t("appearance")}</h2>
          <div className="bg-surface rounded-2xl border border-border p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#8B5CF615' }}>
                  <Moon size={18} style={{ color: '#8B5CF6' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{t("darkMode")}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t("darkModeDesc")}</p>
                </div>
              </div>
              <button
                role="switch" aria-checked={darkMode} aria-label={t("darkMode")}
                onClick={() => { setDarkMode(!darkMode); addToast(t("settingsSaved"), "success"); }}
                className={cn(
                  "relative w-12 h-7 rounded-full transition-all duration-300 focus:outline-none",
                  darkMode ? "bg-[#8B5CF6]" : "bg-foreground/10"
                )}
              >
                <motion.div
                  className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md"
                  style={{left:4}} animate={{ x: darkMode ? 20 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Data Management */}
        <section id="settings-data" className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{t("dataManagement")}</h2>
          <div className="bg-surface rounded-2xl border border-border divide-y divide-foreground/5">
            <div className="p-6 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#4EDEA315' }}>
                  <Download size={18} style={{ color: '#4EDEA3' }} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{t("exportData")}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t("exportDataDesc")}</p>
                </div>
              </div>
              <button
                onClick={handleExportData}
                className="px-4 py-2 bg-foreground/5 hover:bg-foreground/10 text-foreground rounded-xl text-xs font-bold transition-all border border-border"
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
                  <h3 className="text-sm font-bold text-foreground">{t("importData")}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t("importDataDesc")}</p>
                </div>
              </div>
              <label className="px-4 py-2 bg-foreground/5 hover:bg-foreground/10 text-foreground rounded-xl text-xs font-bold transition-all border border-border cursor-pointer">
                Import
                <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
              </label>
            </div>
          </div>
        </section>

        {/* Notification Preferences */}
        <section id="settings-notifications" className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">{t("notifPreferences")}</h2>
          <div className="bg-surface rounded-2xl border border-border divide-y divide-foreground/5">
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
                    <h3 className="text-sm font-bold text-foreground">{item.label}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
                <button
                  role="switch" aria-checked={notifPreferences[item.key]} aria-label={item.label}
                  onClick={() => { toggleNotifPref(item.key); addToast(t("settingsSaved"), "success"); }}
                  className={cn(
                    "relative w-12 h-7 rounded-full transition-all duration-300 focus:outline-none",
                    notifPreferences[item.key]
                      ? "bg-primary"
                      : "bg-foreground/10"
                  )}
                >
                  <motion.div
                    className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md"
                    style={{left:4}} animate={{ x: notifPreferences[item.key] ? 20 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Account & Security */}
        <section id="settings-security" className="space-y-4">
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

        {/* Danger Zone */}
        <section id="settings-danger" className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-loss px-2">Danger Zone</h2>
          <div className="bg-loss/5 rounded-2xl border border-loss/20 p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">{language === "th" ? "ล้างข้อมูลทั้งหมด" : "Delete All Data"}</h3>
              <p className="text-xs text-gray-500 mt-1">
                {language === "th"
                  ? "ระบบจะลบข้อมูลประวัติการเทรด พอร์ต และการตั้งค่าทั้งหมดอย่างถาวร (ยกเว้น ชื่อ อีเมล และรหัสผ่าน) การกระทำนี้ไม่สามารถย้อนกลับได้"
                  : "This will permanently delete all your portfolios, transactions, and settings (except name, email, password). This action cannot be undone."}
              </p>
            </div>
            {showDeleteModal ? (
              <div className="flex gap-2 items-center w-full sm:w-auto">
                <input
                  type="text"
                  placeholder={language === "th" ? "พิมพ์ DELETE" : "Type DELETE"}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  className="bg-black/50 border border-loss/30 rounded-xl px-4 py-2 text-sm text-loss outline-none focus:border-primary w-full sm:w-40"
                />
                <button
                  onClick={handleDeleteData}
                  className="px-4 py-2 bg-loss text-black rounded-xl text-xs font-black uppercase whitespace-nowrap hover:bg-[#ff9a8f]"
                >
                  {language === "th" ? "ยืนยัน" : "Confirm"}
                </button>
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}
                  className="px-4 py-2 bg-foreground/10 text-foreground rounded-xl text-xs font-bold uppercase whitespace-nowrap"
                >
                  {language === "th" ? "ยกเลิก" : "Cancel"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-6 py-2 bg-loss/10 text-loss border border-loss/30 rounded-xl text-xs font-black uppercase hover:bg-loss/20 transition-all shrink-0"
              >
                {language === "th" ? "ล้างข้อมูล" : "Delete Data"}
              </button>
            )}
          </div>
        </section>
      </div>

      </div>
      <div className="pt-8 border-t border-border">
        <button
          onClick={handleSave}
          className="px-8 py-4 bg-primary text-primary-foreground rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all active:scale-95"
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
        "p-6 rounded-2xl border transition-all cursor-pointer group",
        active ? "bg-info/5 border-info/20" : "bg-surface border-border hover:border-border"
      )}
    >
      <div className="flex items-center gap-6">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
          active ? "bg-info text-primary-foreground" : "bg-foreground/5 text-gray-400 group-hover:text-foreground"
        )}>
          <Icon size={24} />
        </div>
        <div className="flex-1">
          <h3 className="text-foreground font-bold">{title}</h3>
          <p className="text-xs text-gray-500 font-medium mt-1">{description}</p>
        </div>
        <div className={cn(
          "w-8 h-8 rounded-full border border-border flex items-center justify-center transition-all",
          active ? "text-info rotate-90" : "text-gray-600 group-hover:text-foreground"
        )}>
          <ChevronRight size={14} />
        </div>
      </div>
    </div>
  );
}
