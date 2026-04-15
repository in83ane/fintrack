"use client";

import React from "react";
import { Settings, Shield, Bell, User, CreditCard, Globe } from "lucide-react";
import { motion } from "motion/react";
import { useApp, Language } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";

export default function SettingsPage() {
  const { t, language, setLanguage, currency, setCurrency } = useApp();

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: "en", label: "English", flag: "🇺🇸" },
    { code: "th", label: "ไทย", flag: "🇹🇭" },
    { code: "jp", label: "日本語", flag: "🇯🇵" },
    { code: "fr", label: "Français", flag: "🇫🇷" },
  ];

  const currencies = ["USD", "THB", "JPY", "EUR"];

  return (
    <div className="p-8 lg:p-12 max-w-4xl mx-auto space-y-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="text-[#ADC6FF] uppercase tracking-wide text-xs font-black mb-2 block">{t("settings")}</span>
        <h1 className="text-5xl font-black tracking-tighter text-white leading-tight">
          System <span className="text-[#4EDEA3]">Preferences</span>
        </h1>
      </motion.div>

      <div className="space-y-8">
        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">Regional Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#1C1B1B] p-6 rounded-3xl border border-white/5 space-y-4">
              <div className="flex items-center gap-3 text-[#ADC6FF]">
                <Globe size={18} />
                <span className="text-xs font-black uppercase tracking-wide">Language</span>
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
                <span className="text-xs font-black uppercase tracking-wide">Base Currency</span>
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

        <section className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-gray-500 px-2">Account & Security</h2>
          <div className="space-y-4">
            <SettingsSection icon={User} title="Account Profile" description="Manage your personal information and security." />
            <SettingsSection icon={Shield} title="Security & Privacy" description="Two-factor authentication and session management." />
            <SettingsSection icon={Bell} title="Notifications" description="Configure alerts for price movements and rebalancing." />
          </div>
        </section>
      </div>

      <div className="pt-8 border-t border-white/5">
        <button className="px-8 py-4 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all">
          Save All Changes
        </button>
      </div>
    </div>
  );
}

function SettingsSection({ icon: Icon, title, description, active }: any) {
  return (
    <div className={cn(
      "p-6 rounded-3xl border transition-all cursor-pointer group",
      active ? "bg-[#ADC6FF]/5 border-[#ADC6FF]/20" : "bg-[#1C1B1B] border-white/5 hover:border-white/10"
    )}>
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
        <div className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center text-gray-600 group-hover:text-white transition-colors">
          <Settings size={14} />
        </div>
      </div>
    </div>
  );
}
