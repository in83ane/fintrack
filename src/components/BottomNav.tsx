"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Briefcase, ReceiptText, Monitor, PiggyBank, CalendarDays } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { motion } from "motion/react";

const NAV_ITEMS = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { path: "/portfolio", icon: Briefcase, label: "Portfolio" },
  { path: "/ledger", icon: ReceiptText, label: "Ledger", isFab: true },
  { path: "/budget", icon: PiggyBank, label: "Budget" },
  { path: "/calendar", icon: CalendarDays, label: "Calendar" },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
      <div className="bg-background/95 backdrop-blur-xl border-t border-border px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around py-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname?.startsWith(item.path);
            const Icon = item.icon;

            // FAB-style center button for Ledger
            if (item.isFab) {
              return (
                <button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  className="relative flex flex-col items-center gap-0.5 -mt-5"
                >
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-primary/30 scale-105"
                      : "bg-surface-2 text-gray-400 border border-border hover:bg-surface-2"
                  )}>
                    <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  </div>
                  <span className={cn(
                    "text-[9px] font-bold",
                    isActive ? "text-primary" : "text-gray-500"
                  )}>{item.label}</span>
                </button>
              );
            }

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
                    className="absolute -top-1 w-8 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className={cn("text-[9px] font-bold", isActive && "text-primary")}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
