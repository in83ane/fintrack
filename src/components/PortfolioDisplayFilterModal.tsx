"use client";

import React from "react";
import { Modal } from "@/src/components/Modal";
import { cn } from "@/src/lib/utils";
import {
  PiggyBank,
  Wallet,
  TrendingUp,
  Landmark,
  Check,
  RotateCcw,
  SlidersHorizontal,
  Building2,
  Coins,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

export type Market = "US" | "TH" | "GOLD" | "FUND";

export interface TotalFilterSettings {
  includeBucket: boolean;
  includeCash: boolean;
  includeMarkets: {
    US: boolean;
    TH: boolean;
    FUND: boolean;
    GOLD: boolean;
  };
  excludedBrokerIds: string[];
}

export const DEFAULT_TOTAL_FILTER: TotalFilterSettings = {
  includeBucket: true,
  includeCash: true,
  includeMarkets: {
    US: true,
    TH: true,
    FUND: true,
    GOLD: true,
  },
  excludedBrokerIds: [],
};

interface PortfolioDisplayFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filter: TotalFilterSettings;
  onChange: (filter: TotalFilterSettings) => void;
  onReset: () => void;
  bucketTotal: number;
  cashTotal: number;
  marketTotals: Record<Market, number>;
  brokerTotals: Map<string, number>;
  brokers: Array<{ id: string; name: string; color: string }>;
  currencySymbol: string;
  calculatedTotal: number;
}

export function PortfolioDisplayFilterModal({
  isOpen,
  onClose,
  filter,
  onChange,
  onReset,
  bucketTotal,
  cashTotal,
  marketTotals,
  brokerTotals,
  brokers,
  currencySymbol,
  calculatedTotal,
}: PortfolioDisplayFilterModalProps) {
  const toggleBucket = () => {
    onChange({ ...filter, includeBucket: !filter.includeBucket });
  };

  const toggleCash = () => {
    onChange({ ...filter, includeCash: !filter.includeCash });
  };

  const toggleMarket = (market: Market) => {
    onChange({
      ...filter,
      includeMarkets: {
        ...filter.includeMarkets,
        [market]: !filter.includeMarkets[market],
      },
    });
  };

  const toggleBroker = (brokerId: string) => {
    const isExcluded = filter.excludedBrokerIds.includes(brokerId);
    onChange({
      ...filter,
      excludedBrokerIds: isExcluded
        ? filter.excludedBrokerIds.filter((id) => id !== brokerId)
        : [...filter.excludedBrokerIds, brokerId],
    });
  };

  // Presets
  const applyPresetAll = () => {
    onChange(DEFAULT_TOTAL_FILTER);
  };

  const applyPresetInvestmentsOnly = () => {
    onChange({
      ...DEFAULT_TOTAL_FILTER,
      includeBucket: false,
    });
  };

  const applyPresetAssetsOnly = () => {
    onChange({
      ...DEFAULT_TOTAL_FILTER,
      includeBucket: false,
      includeCash: false,
    });
  };

  const isCustomized =
    !filter.includeBucket ||
    !filter.includeCash ||
    !Object.values(filter.includeMarkets).every(Boolean) ||
    filter.excludedBrokerIds.length > 0;

  const nf = (v: number) =>
    new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="ตัวกรองและแสดงผล (ยอดทั้งหมด)"
      contentClassName="p-5 sm:p-6 space-y-6"
      footer={
        <div className="flex items-center justify-between w-full px-6 py-4 bg-background border-t border-border">
          <button
            type="button"
            onClick={onReset}
            disabled={!isCustomized}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={13} />
            <span>รีเซ็ตเป็นค่าเริ่มต้น</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <span className="text-xs text-gray-500 block leading-tight">ยอดรวมที่คำนวณ</span>
              <span className="text-sm font-bold text-foreground tabular-nums">
                {currencySymbol}{nf(calculatedTotal)}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-[#68efb6] transition-colors shadow-lg shadow-[#4EDEA3]/20"
            >
              เสร็จสิ้น
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Description & Quick Presets */}
        <div className="space-y-3">
          <p className="text-xs text-gray-400 leading-relaxed">
            เลือกสิ่งที่คุณต้องการให้นับรวมใน <strong className="text-foreground font-semibold">มูลค่าสินทรัพย์ทั้งหมด</strong> และแสดงบนหน้าพอร์ต
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={applyPresetAll}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                !isCustomized
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-foreground/[0.04] text-gray-400 border-foreground/10 hover:text-foreground hover:bg-foreground/[0.08]"
              )}
            >
              เลือกทั้งหมด
            </button>
            <button
              type="button"
              onClick={applyPresetInvestmentsOnly}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                !filter.includeBucket && filter.includeCash && Object.values(filter.includeMarkets).every(Boolean) && filter.excludedBrokerIds.length === 0
                  ? "bg-[#E8B84A]/20 text-[#F6D783] border-[#E8B84A]/40"
                  : "bg-foreground/[0.04] text-gray-400 border-foreground/10 hover:text-foreground hover:bg-foreground/[0.08]"
              )}
            >
              พอร์ตลงทุนเท่านั้น (ไม่รวม Bucket)
            </button>
            <button
              type="button"
              onClick={applyPresetAssetsOnly}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                !filter.includeBucket && !filter.includeCash && Object.values(filter.includeMarkets).every(Boolean)
                  ? "bg-primary/20 text-primary border-primary/40"
                  : "bg-foreground/[0.04] text-gray-400 border-foreground/10 hover:text-foreground hover:bg-foreground/[0.08]"
              )}
            >
              เฉพาะสินทรัพย์ (ไม่รวมเงินสด)
            </button>
          </div>
        </div>

        {/* Section 1: แหล่งเงินสด & กระเป๋าเงิน */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            เงินสดและกระเป๋าเงิน
          </h4>

          <div className="space-y-2">
            {/* Toggle: Bucket */}
            <button
              type="button"
              role="checkbox"
              aria-checked={filter.includeBucket}
              onClick={toggleBucket}
              className={cn(
                "flex w-full items-center justify-between p-3.5 rounded-2xl border text-left transition-all",
                filter.includeBucket
                  ? "bg-primary/10 border-primary/30"
                  : "bg-foreground/[0.02] border-foreground/[0.06] opacity-60 hover:opacity-100"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: filter.includeBucket ? "rgba(78, 222, 163, 0.2)" : "rgba(255, 255, 255, 0.05)",
                    color: filter.includeBucket ? "#4EDEA3" : "#888",
                  }}
                >
                  <PiggyBank size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">เงินใน Bucket</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-foreground/10 text-gray-400">
                      เงินพักนอกโบรกเกอร์
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {filter.includeBucket ? "นับรวมในยอดทั้งหมดและแสดงการ์ด Bucket" : "หักออกจากยอดทั้งหมดและซ่อนการ์ด"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-3">
                <span className="text-xs font-semibold tabular-nums text-gray-300">
                  {currencySymbol}{nf(bucketTotal)}
                </span>
                <div
                  className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center transition-colors border",
                    filter.includeBucket
                      ? "bg-gain border-gain text-primary-foreground"
                      : "bg-black/40 border-foreground/20 text-transparent"
                  )}
                >
                  <Check size={14} strokeWidth={3} />
                </div>
              </div>
            </button>

            {/* Toggle: Broker Cash */}
            <button
              type="button"
              role="checkbox"
              aria-checked={filter.includeCash}
              onClick={toggleCash}
              className={cn(
                "flex w-full items-center justify-between p-3.5 rounded-2xl border text-left transition-all",
                filter.includeCash
                  ? "bg-primary/10 border-primary/30"
                  : "bg-foreground/[0.02] border-foreground/[0.06] opacity-60 hover:opacity-100"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: filter.includeCash ? "rgba(173, 198, 255, 0.2)" : "rgba(255, 255, 255, 0.05)",
                    color: filter.includeCash ? "#ADC6FF" : "#888",
                  }}
                >
                  <Wallet size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">เงินสดในโบรกเกอร์</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-foreground/10 text-gray-400">
                      THB / USD
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {filter.includeCash ? "นับรวมเงินสดที่ฝากไว้ในบัญชีโบรกเกอร์" : "ไม่นับเงินสดในโบรกเกอร์"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-3">
                <span className="text-xs font-semibold tabular-nums text-gray-300">
                  {currencySymbol}{nf(cashTotal)}
                </span>
                <div
                  className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center transition-colors border",
                    filter.includeCash
                      ? "bg-info border-info text-primary-foreground"
                      : "bg-black/40 border-foreground/20 text-transparent"
                  )}
                >
                  <Check size={14} strokeWidth={3} />
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Section 2: หมวดหมู่สินทรัพย์ลงทุน */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            หมวดหมู่สินทรัพย์ลงทุน
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { key: "US" as Market, label: "หุ้นสหรัฐฯ", color: "#9B7BFF", icon: TrendingUp },
              { key: "TH" as Market, label: "หุ้นไทย", color: "#B69CFF", icon: Building2 },
              { key: "FUND" as Market, label: "กองทุนรวม", color: "#ADC6FF", icon: Landmark },
              { key: "GOLD" as Market, label: "ทองคำ", color: "#E8B84A", icon: Coins },
            ].map(({ key, label, color, icon: Icon }) => {
              const checked = filter.includeMarkets[key];
              const val = marketTotals[key] || 0;
              return (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  key={key}
                  onClick={() => toggleMarket(key)}
                  className={cn(
                    "flex w-full items-center justify-between p-3 rounded-xl border text-left transition-all",
                    checked
                      ? "bg-foreground/[0.04] border-foreground/15"
                      : "bg-foreground/[0.01] border-foreground/[0.05] opacity-50 hover:opacity-90"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${color}20`, color }}
                    >
                      <Icon size={14} />
                    </div>
                    <span className="text-xs font-bold text-foreground truncate">{label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs font-semibold tabular-nums text-gray-400">
                      {currencySymbol}{nf(val)}
                    </span>
                    <div
                      className={cn(
                        "w-5 h-5 rounded-md flex items-center justify-center transition-colors border",
                        checked
                          ? "bg-foreground/90 border-foreground text-black"
                          : "bg-black/30 border-foreground/20 text-transparent"
                      )}
                    >
                      <Check size={12} strokeWidth={3} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3: โบรกเกอร์ลงทุน */}
        {brokers.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              โบรกเกอร์ที่รวมในการคำนวณ
            </h4>

            <div className="space-y-1.5">
              {brokers.map((broker) => {
                const checked = !filter.excludedBrokerIds.includes(broker.id);
                const val = brokerTotals.get(broker.id) || 0;
                return (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    key={broker.id}
                    onClick={() => toggleBroker(broker.id)}
                    className={cn(
                      "flex w-full items-center justify-between p-2.5 rounded-xl border text-left transition-all",
                      checked
                        ? "bg-foreground/[0.03] border-foreground/10"
                        : "bg-foreground/[0.01] border-foreground/[0.04] opacity-50 hover:opacity-90"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: broker.color }}
                      />
                      <span className="text-xs font-bold text-foreground truncate">{broker.name}</span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 ml-2">
                      <span className="text-xs font-semibold tabular-nums text-gray-400">
                        {currencySymbol}{nf(val)}
                      </span>
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md flex items-center justify-center transition-colors border",
                          checked
                            ? "bg-foreground/90 border-foreground text-black"
                            : "bg-black/30 border-foreground/20 text-transparent"
                        )}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
