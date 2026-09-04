"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Briefcase, ReceiptText, PiggyBank, CalendarDays } from "lucide-react";
import { cn } from "@/src/lib/utils";

const NAV_ITEMS = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { path: "/portfolio", icon: Briefcase, label: "Portfolio" },
  { path: "/ledger", icon: ReceiptText, label: "Ledger" },
  { path: "/budget", icon: PiggyBank, label: "Budget" },
  { path: "/calendar", icon: CalendarDays, label: "Calendar" },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      <div className="bg-background/95 backdrop-blur-xl border-t border-border px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex min-h-16 max-w-lg items-center justify-around py-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname?.startsWith(item.path);
            const Icon = item.icon;

            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 transition-[margin] duration-300 ease-out",
                  isActive && "-mt-5"
                )}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ease-out",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-105"
                      : "bg-transparent text-gray-600"
                  )}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                </div>
                <span
                  className={cn(
                    "text-[9px] font-bold transition-colors",
                    isActive ? "text-primary" : "text-gray-500"
                  )}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}