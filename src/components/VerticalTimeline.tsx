"use client";

import React from "react";
import { motion } from "motion/react";
import { TrendingUp, TrendingDown, Minus, Target, Calendar, DollarSign } from "lucide-react";
import { cn } from "@/src/lib/utils";

export interface TimelineItem {
  id: string;
  date: string;
  label: string;
  description?: string;
  value?: number;
  change?: number;
  status: "completed" | "current" | "upcoming" | "target";
  type?: "buy" | "sell" | "hold" | "milestone" | "dividend";
}

interface VerticalTimelineProps {
  items: TimelineItem[];
  currency?: string;
  formatMoney: (amount: number, currency?: string) => string;
}

const statusConfig = {
  completed: {
    color: "#4EDEA3",
    bgColor: "bg-[#4EDEA3]/10",
    borderColor: "border-[#4EDEA3]/30",
    icon: TrendingUp,
  },
  current: {
    color: "#ADC6FF",
    bgColor: "bg-[#ADC6FF]/10",
    borderColor: "border-[#ADC6FF]/30",
    icon: Target,
  },
  upcoming: {
    color: "#6B7280",
    bgColor: "bg-white/5",
    borderColor: "border-white/10",
    icon: Calendar,
  },
  target: {
    color: "#E9C349",
    bgColor: "bg-[#E9C349]/10",
    borderColor: "border-[#E9C349]/30",
    icon: DollarSign,
  },
};

const typeConfig = {
  buy: { color: "#4EDEA3", label: "BUY" },
  sell: { color: "#FFB4AB", label: "SELL" },
  hold: { color: "#E9C349", label: "HOLD" },
  milestone: { color: "#ADC6FF", label: "MILESTONE" },
  dividend: { color: "#4EDEA3", label: "DIVIDEND" },
};

export function VerticalTimeline({ items, currency = "USD", formatMoney }: VerticalTimelineProps) {
  const sortedItems = [...items].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA; // Newest first
  });

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[22px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-[#4EDEA3] via-[#ADC6FF] to-white/10" />

      <div className="space-y-4">
        {sortedItems.map((item, index) => {
          const status = statusConfig[item.status];
          const type = item.type ? typeConfig[item.type] : null;
          const Icon = status.icon;

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative flex gap-4 group"
            >
              {/* Status Icon */}
              <div className="relative z-10 flex-shrink-0">
                <div
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all",
                    status.bgColor,
                    status.borderColor,
                    item.status === "current" && "ring-4 ring-[#ADC6FF]/20 animate-pulse"
                  )}
                >
                  <Icon size={18} style={{ color: status.color }} />
                </div>
              </div>

              {/* Content Card */}
              <div
                className={cn(
                  "flex-1 p-4 rounded-2xl border transition-all",
                  status.bgColor,
                  status.borderColor,
                  "group-hover:scale-[1.02] group-hover:brightness-110"
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span
                      className="text-[10px] font-black uppercase tracking-wide"
                      style={{ color: status.color }}
                    >
                      {item.status}
                    </span>
                    <h4 className="text-sm font-bold text-white mt-0.5">{item.label}</h4>
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">
                    {new Date(item.date).toLocaleDateString('en-US', {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>

                {item.description && (
                  <p className="text-xs text-gray-400 mb-3 leading-relaxed">{item.description}</p>
                )}

                {/* Value and Change */}
                {(item.value !== undefined || item.change !== undefined) && (
                  <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                    {item.value !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500 font-medium uppercase">Value</span>
                        <span className="text-sm font-black text-white">
                          {formatMoney(item.value, currency)}
                        </span>
                      </div>
                    )}

                    {item.change !== undefined && (
                      <div className="flex items-center gap-1">
                        {item.change > 0 ? (
                          <TrendingUp size={12} className="text-[#4EDEA3]" />
                        ) : item.change < 0 ? (
                          <TrendingDown size={12} className="text-[#FFB4AB]" />
                        ) : (
                          <Minus size={12} className="text-gray-500" />
                        )}
                        <span
                          className={cn(
                            "text-xs font-black",
                            item.change > 0 ? "text-[#4EDEA3]" : item.change < 0 ? "text-[#FFB4AB]" : "text-gray-500"
                          )}
                        >
                          {item.change > 0 ? "+" : ""}
                          {item.change.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Type Badge */}
                {type && (
                  <div className="mt-3">
                    <span
                      className="inline-block px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide"
                      style={{
                        backgroundColor: `${type.color}20`,
                        color: type.color,
                      }}
                    >
                      {type.label}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
