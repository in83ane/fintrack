"use client";

import React from "react";
import { LayoutDashboard, Wallet, Settings, HelpCircle, Crown, Calendar, User, LineChart, Banknote, PiggyBank } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import { logoutAction } from "@/src/app/actions";

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isMobile, onClose }: SidebarProps) {
  const { t } = useApp();
  const pathname = usePathname();

  const navItems = [
    { icon: LayoutDashboard, label: t("dashboard"), href: "/dashboard" },
    { icon: Wallet, label: t("portfolio"), href: "/portfolio" },
    { icon: Calendar, label: t("calendar"), href: "/calendar" },
    { icon: LineChart, label: t("transactions") || "Transactions", href: "/transactions" },
    { icon: Banknote, label: t("cashflowOverview"), href: "/cashflow" },
    { icon: PiggyBank, label: t("budgetPage"), href: "/budget" },
    { icon: Crown, label: t("pricing") || "Pricing", href: "/#pricing" },
    { icon: Settings, label: t("settings"), href: "/settings" },
  ];

  const sidebarClasses = cn(
    "flex h-screen flex-col py-8 border-r border-white/5",
    isMobile ? "w-full bg-transparent" : "hidden lg:flex w-64 fixed left-0 top-0 bg-[#0E0E0E] z-40"
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    await logoutAction();
    window.location.href = "/login";
  };

  return (
    <aside className={sidebarClasses}>
      <div className="px-8 mb-10">
        <Link href="/dashboard" onClick={onClose} className="flex items-center gap-3 group">
          <div className="w-10 h-10 bg-[#4EDEA3] rounded-2xl flex items-center justify-center shadow-lg shadow-[#4EDEA3]/20 group-hover:scale-105 transition-transform">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"></path>
              <path d="M7 16l4-6 4 4 4-8"></path>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide cursor-pointer">
            FinTrack
          </h2>
        </Link>
        <p className="text-xs text-gray-500 font-medium tracking-wide uppercase mt-1">{t("premiumTier") || "Premium Tier"}</p>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 mx-4 py-3 px-6 rounded-full transition-all duration-200",
                isActive 
                  ? "bg-[#4EDEA3]/10 text-[#4EDEA3] font-semibold" 
                  : "text-gray-500 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon size={20} className={isActive ? "fill-[#4EDEA3]/20" : ""} />
              <span className="text-sm tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-6 mt-auto">
        <div className="bg-[#4EDEA3] p-4 rounded-2xl mb-6 shadow-lg shadow-[#4EDEA3]/10">
          <div className="flex items-center gap-2 mb-1">
            <Crown size={14} className="text-[#0E0E0E]" />
            <span className="text-xs font-black uppercase tracking-wide text-[#0E0E0E]">{t("eliteAccess") || "Elite Access"}</span>
          </div>
          <p className="text-sm font-medium text-[#0E0E0E] leading-tight">
            {t("upgradeDesc") || "Upgrade to Gold for AI-powered insights."}
          </p>
          <button className="w-full mt-3 py-2 bg-[#0E0E0E] text-[#4EDEA3] rounded-xl font-bold text-xs uppercase tracking-wide hover:brightness-125 transition-all">
            {t("upgradeNow") || "Upgrade Now"}
          </button>
        </div>
        
        <a href="#" className="flex items-center gap-3 text-gray-500 mx-4 py-3 px-6 hover:text-white transition-all">
          <HelpCircle size={20} />
          <span className="text-sm">{t("support") || "Support"}</span>
        </a>

        <button 
          onClick={handleLogout}
          className="flex items-center gap-3 text-[#FFB4AB] mx-4 py-3 px-6 hover:bg-[#FFB4AB]/10 rounded-full transition-all mt-2 w-full"
        >
          <User size={20} />
          <span className="text-sm font-bold">{t("logout") || "Logout"}</span>
        </button>
      </div>
    </aside>
  );
}
