"use client";

import React from "react";
import { Modal } from "@/src/components/Modal";
import { useApp } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { Wallet, Briefcase, DollarSign } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t, netWorthSettings, setNetWorthSettings } = useApp();

  const toggleSetting = (key: keyof typeof netWorthSettings) => {
    setNetWorthSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Global Settings">
      <div className="p-6 space-y-6">
        <div>
          <h3 className="text-sm font-bold text-white mb-1">Net Worth Calculation</h3>
          <p className="text-xs text-gray-500 mb-4">Choose what is included in your top-level net worth and portfolio value across the app.</p>

          <div className="space-y-3">
            {/* Toggle: Investment Assets */}
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-[#ADC6FF]/10 text-[#ADC6FF] flex items-center justify-center">
                  <Briefcase size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Include Investment Assets</p>
                  <p className="text-xs text-gray-500">Stocks, Crypto, Gold, Real Estate</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('includeAssets')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.includeAssets ? "bg-[#ADC6FF]" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  netWorthSettings.includeAssets ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Toggle: Money Buckets */}
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-[#4EDEA3]/10 text-[#4EDEA3] flex items-center justify-center">
                  <Wallet size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Include Money Buckets</p>
                  <p className="text-xs text-gray-500">Savings goals, sinking funds</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('includeBuckets')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.includeBuckets ? "bg-[#4EDEA3]" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  netWorthSettings.includeBuckets ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Toggle: Liquid Cash */}
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-[#E9C349]/10 text-[#E9C349] flex items-center justify-center">
                  <DollarSign size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Include Liquid Cash</p>
                  <p className="text-xs text-gray-500">Unallocated income / expenses</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('includeCash')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.includeCash ? "bg-[#E9C349]" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  netWorthSettings.includeCash ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-white mb-1">Cashflow Calculation</h3>
          <p className="text-xs text-gray-500 mb-4">Choose what activities are included in your Cashflow Overview.</p>

          <div className="space-y-3">
            {/* Toggle: Cash */}
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-[#E9C349]/10 text-[#E9C349] flex items-center justify-center">
                  <DollarSign size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Include Cash Transactions</p>
                  <p className="text-xs text-gray-500">Regular income and expenses</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('cashflowIncludeCash')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.cashflowIncludeCash ? "bg-[#E9C349]" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  netWorthSettings.cashflowIncludeCash ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Toggle: Buckets */}
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-[#4EDEA3]/10 text-[#4EDEA3] flex items-center justify-center">
                  <Wallet size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Include Bucket Movements</p>
                  <p className="text-xs text-gray-500">Deposits, withdrawals, splits</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('cashflowIncludeBuckets')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.cashflowIncludeBuckets ? "bg-[#4EDEA3]" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  netWorthSettings.cashflowIncludeBuckets ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Toggle: Assets */}
            <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-[#ADC6FF]/10 text-[#ADC6FF] flex items-center justify-center">
                  <Briefcase size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Include Asset Trades</p>
                  <p className="text-xs text-gray-500">Buying and selling investments</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSetting('cashflowIncludeAssets')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.cashflowIncludeAssets ? "bg-[#ADC6FF]" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  netWorthSettings.cashflowIncludeAssets ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-white/10 text-white rounded-full font-bold text-sm uppercase tracking-wide hover:bg-white/20 transition-all"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
