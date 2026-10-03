"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Briefcase, ReceiptText, PiggyBank, CalendarDays } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { motion } from "motion/react";

const NAV_ITEMS = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Home", color: "#4EDEA3" },
  { path: "/portfolio", icon: Briefcase, label: "Portfolio", color: "#ADC6FF" },
  { path: "/ledger", icon: ReceiptText, label: "Ledger", color: "#E9C349" },
  { path: "/budget", icon: PiggyBank, label: "Bucket", color: "#FF8B9A" },
  { path: "/calendar", icon: CalendarDays, label: "Calendar", color: "#A78BFA" },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pointer-events-none">
      <div className="flex justify-center pb-3 px-3">
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.1 }}
          className="pointer-events-auto flex items-center justify-around w-full max-w-md bg-[#111114]/95 backdrop-blur-2xl border border-white/[0.06] rounded-2xl px-1 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
          style={{ paddingBottom: `calc(0.375rem + env(safe-area-inset-bottom, 0px))` }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = pathname?.startsWith(item.path);
            const Icon = item.icon;

            return (
              <button
                key={item.path}
                id={`bottom-nav-${item.path.replace("/", "")}`}
                onClick={() => router.push(item.path)}
                className="relative flex flex-col items-center justify-center flex-1 py-1.5 group"
              >
                {/* Active indicator pill */}
                {isActive && (
                  <motion.div
                    layoutId="bottom-nav-pill"
                    className="absolute inset-x-2 inset-y-0 rounded-xl"
                    style={{ backgroundColor: `${item.color}10` }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}

                {/* Active top dot */}
                {isActive && (
                  <motion.div
                    layoutId="bottom-nav-dot"
                    className="absolute -top-0.5 w-4 h-[2px] rounded-full"
                    style={{ backgroundColor: item.color }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}

                {/* Icon */}
                <div className="relative z-10">
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.2 : 1.5}
                    className="transition-colors duration-200"
                    style={{ color: isActive ? item.color : '#555' }}
                  />
                </div>

                {/* Label */}
                <span
                  className={cn(
                    "relative z-10 text-[9px] font-bold mt-0.5 tracking-wide transition-colors duration-200",
                    isActive ? "opacity-100" : "opacity-40"
                  )}
                  style={{ color: isActive ? item.color : '#888' }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </motion.div>
      </div>
    </nav>
  );
}