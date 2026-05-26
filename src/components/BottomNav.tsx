"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Briefcase, TrendingUp, Wallet, ArrowRightLeft } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { motion } from "motion/react";

const NAV_ITEMS = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { path: "/portfolio", icon: Briefcase, label: "Portfolio" },
  { path: "/trade", icon: TrendingUp, label: "Trade" },
  { path: "/budget", icon: Wallet, label: "Budget" },
  { path: "/cashflow", icon: ArrowRightLeft, label: "Cash" },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
      <div className="bg-[#0e0e0e]/95 backdrop-blur-xl border-t border-white/5 px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around py-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname?.startsWith(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all relative",
                  isActive ? "text-white" : "text-gray-600"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="bottomnav-indicator"
                    className="absolute -top-1 w-8 h-0.5 rounded-full bg-[#ADC6FF]"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className={cn("text-[9px] font-bold", isActive && "text-[#ADC6FF]")}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
