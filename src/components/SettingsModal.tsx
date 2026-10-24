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
  const { t, netWorthSettings, setNetWorthSettings, addToast } = useApp();

  const toggleSetting = (key: keyof typeof netWorthSettings) => {
    addToast(t("settingsSaved"), "success");
    setNetWorthSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Global Settings">
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-bold text-foreground mb-1">Net Worth Calculation</h3>
          <p className="text-xs text-gray-500 mb-4">Choose what is included in your top-level net worth and portfolio value across the app.</p>

          <div className="space-y-3">
            {/* Toggle: Investment Assets */}
            <div className="flex items-center justify-between p-4 bg-foreground/5 border border-border rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-info/10 text-info flex items-center justify-center">
                  <Briefcase size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Include Investment Assets</p>
                  <p className="text-xs text-gray-500">Stocks, Crypto, Gold, Real Estate</p>
                </div>
              </div>
              <button
                type="button"
                role="switch" aria-checked={netWorthSettings.includeAssets} aria-label="includeAssets"
                onClick={() => toggleSetting('includeAssets')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.includeAssets ? "bg-primary" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-primary-foreground transition-transform",
                  netWorthSettings.includeAssets ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Toggle: Money Buckets */}
            <div className="flex items-center justify-between p-4 bg-foreground/5 border border-border rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-gain/10 text-gain flex items-center justify-center">
                  <Wallet size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Include Accounts</p>
                  <p className="text-xs text-gray-500">Cash accounts, savings buckets</p>
                </div>
              </div>
              <button
                type="button"
                role="switch" aria-checked={netWorthSettings.includeBuckets} aria-label="includeBuckets"
                onClick={() => toggleSetting('includeBuckets')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.includeBuckets ? "bg-primary" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-primary-foreground transition-transform",
                  netWorthSettings.includeBuckets ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Toggle: Liquid Cash */}
            <div className="flex items-center justify-between p-4 bg-foreground/5 border border-border rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-warning/10 text-warning flex items-center justify-center">
                  <DollarSign size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Include Liquid Cash</p>
                  <p className="text-xs text-gray-500">Unallocated income / expenses</p>
                </div>
              </div>
              <button
                type="button"
                role="switch" aria-checked={netWorthSettings.includeCash} aria-label="includeCash"
                onClick={() => toggleSetting('includeCash')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.includeCash ? "bg-primary" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-primary-foreground transition-transform",
                  netWorthSettings.includeCash ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-foreground mb-1">Cashflow Calculation</h3>
          <p className="text-xs text-gray-500 mb-4">Choose what activities are included in your Cashflow Overview.</p>

          <div className="space-y-3">
            {/* Toggle: Cash */}
            <div className="flex items-center justify-between p-4 bg-foreground/5 border border-border rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-warning/10 text-warning flex items-center justify-center">
                  <DollarSign size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Include Cash Transactions</p>
                  <p className="text-xs text-gray-500">Regular income and expenses</p>
                </div>
              </div>
              <button
                type="button"
                role="switch" aria-checked={netWorthSettings.cashflowIncludeCash} aria-label="cashflowIncludeCash"
                onClick={() => toggleSetting('cashflowIncludeCash')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.cashflowIncludeCash ? "bg-primary" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-primary-foreground transition-transform",
                  netWorthSettings.cashflowIncludeCash ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Toggle: Buckets */}
            <div className="flex items-center justify-between p-4 bg-foreground/5 border border-border rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-gain/10 text-gain flex items-center justify-center">
                  <Wallet size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Include Bucket Movements</p>
                  <p className="text-xs text-gray-500">Deposits, withdrawals, splits</p>
                </div>
              </div>
              <button
                type="button"
                role="switch" aria-checked={netWorthSettings.cashflowIncludeBuckets} aria-label="cashflowIncludeBuckets"
                onClick={() => toggleSetting('cashflowIncludeBuckets')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.cashflowIncludeBuckets ? "bg-primary" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-primary-foreground transition-transform",
                  netWorthSettings.cashflowIncludeBuckets ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            {/* Toggle: Assets */}
            <div className="flex items-center justify-between p-4 bg-foreground/5 border border-border rounded-2xl">
              <div className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-full bg-info/10 text-info flex items-center justify-center">
                  <Briefcase size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Include Asset Trades</p>
                  <p className="text-xs text-gray-500">Buying and selling investments</p>
                </div>
              </div>
              <button
                type="button"
                role="switch" aria-checked={netWorthSettings.cashflowIncludeAssets} aria-label="cashflowIncludeAssets"
                onClick={() => toggleSetting('cashflowIncludeAssets')}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                  netWorthSettings.cashflowIncludeAssets ? "bg-primary" : "bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-primary-foreground transition-transform",
                  netWorthSettings.cashflowIncludeAssets ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-foreground/10 text-foreground rounded-full font-bold text-sm uppercase tracking-wide hover:bg-foreground/20 transition-all"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
