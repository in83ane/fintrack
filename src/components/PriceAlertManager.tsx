"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bell, Plus, Trash2, TrendingUp, TrendingDown, Target, X, AlertTriangle, Check, Eye } from "lucide-react";
import { useApp } from "@/src/context/AppContext";
import { Modal } from "@/src/components/Modal";
import { cn } from "@/src/lib/utils";

export interface PriceAlert {
  id: string;
  symbol: string;
  name: string;
  targetPrice: number;
  direction: "above" | "below"; // trigger when price goes above or below target
  isActive: boolean;
  createdAt: string;
  triggeredAt?: string;
  currentPrice?: number;
  note?: string;
}

const ALERTS_STORAGE_KEY = "fintrack-price-alerts";

function loadAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ALERTS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAlerts(alerts: PriceAlert[]) {
  localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
}

export function PriceAlertManager() {
  const { t, language, formatMoney, assets, addNotification, addToast, moneyBuckets } = useApp();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({ symbol: "", targetPrice: "", direction: "below" as "above" | "below", note: "" });
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const notifiedBucketsRef = useRef<Set<string>>(new Set());

  // Budget Goal Notification (#N4)
  useEffect(() => {
    moneyBuckets.forEach(bucket => {
      if (bucket.targetAmount && bucket.targetAmount > 0 && bucket.currentAmount >= bucket.targetAmount) {
        if (!notifiedBucketsRef.current.has(bucket.id)) {
          notifiedBucketsRef.current.add(bucket.id);
          addNotification(
            `🎉 ${language === 'th' ? 'ถึงเป้าแล้ว!' : 'Goal Reached!'}: ${bucket.name}`,
            `${bucket.icon} ${bucket.name} ${language === 'th' ? 'เก็บเงินครบเป้า' : 'has reached its target'} ${formatMoney(bucket.targetAmount)}`,
            'system'
          );
        }
      }
    });
  }, [moneyBuckets, addNotification, language, formatMoney]);

  // Load alerts on mount
  useEffect(() => {
    setAlerts(loadAlerts());
  }, []);

  // Save alerts whenever they change
  useEffect(() => {
    if (alerts.length > 0) saveAlerts(alerts);
  }, [alerts]);

  // Check price alerts periodically
  const checkAlerts = useCallback(() => {
    setAlerts((prevAlerts) => {
      let changed = false;
      const updated = prevAlerts.map((alert) => {
        if (!alert.isActive) return alert;

        // Find matching asset
        const asset = assets.find((a) => a.symbol.toUpperCase() === alert.symbol.toUpperCase());
        if (!asset) return alert;

        const currentPrice = asset.currentPrice || (asset.shares && asset.shares > 0 ? asset.valueUSD / asset.shares : 0);
        if (currentPrice <= 0) return alert;

        // Update current price
        const updatedAlert = { ...alert, currentPrice };

        // Check if triggered
        const triggered =
          (alert.direction === "above" && currentPrice >= alert.targetPrice) ||
          (alert.direction === "below" && currentPrice <= alert.targetPrice);

        if (triggered) {
          changed = true;
          addNotification(
            `🔔 ${language === "th" ? "แจ้งเตือนราคา" : "Price Alert"}: ${alert.symbol}`,
            `${alert.symbol} ${alert.direction === "above" ? "↑" : "↓"} ${formatMoney(currentPrice)} (${language === "th" ? "เป้าหมาย" : "Target"}: ${formatMoney(alert.targetPrice)})`,
            "price"
          );
          addToast(
            `${alert.symbol} ${language === "th" ? "ถึงแนวรับ/ต้าน" : "hit target"} ${formatMoney(alert.targetPrice)}`,
            "success"
          );
          return { ...updatedAlert, isActive: false, triggeredAt: new Date().toISOString() };
        }

        return updatedAlert;
      });

      return changed || updated.some((a, i) => a.currentPrice !== prevAlerts[i]?.currentPrice) ? updated : prevAlerts;
    });
  }, [assets, addNotification, addToast, formatMoney, language]);

  // Run check every 30 seconds
  useEffect(() => {
    checkAlerts(); // Initial check
    checkIntervalRef.current = setInterval(checkAlerts, 30000);
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [checkAlerts]);

  const handleAddAlert = () => {
    if (!newAlert.symbol || !newAlert.targetPrice) return;

    const alert: PriceAlert = {
      id: Date.now().toString(),
      symbol: newAlert.symbol.toUpperCase(),
      name: newAlert.symbol.toUpperCase(),
      targetPrice: parseFloat(newAlert.targetPrice),
      direction: newAlert.direction,
      isActive: true,
      createdAt: new Date().toISOString(),
      note: newAlert.note,
    };

    setAlerts((prev) => {
      const updated = [alert, ...prev];
      saveAlerts(updated);
      return updated;
    });
    setNewAlert({ symbol: "", targetPrice: "", direction: "below", note: "" });
    setIsModalOpen(false);
    addToast(language === "th" ? "เพิ่มการแจ้งเตือนแล้ว" : "Alert created", "success");
  };

  const removeAlert = (id: string) => {
    setAlerts((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      saveAlerts(updated);
      return updated;
    });
  };

  const activeAlerts = alerts.filter((a) => a.isActive);
  const triggeredAlerts = alerts.filter((a) => !a.isActive && a.triggeredAt);

  return (
    <>
      {/* Floating Alert Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-[#E9C349] to-[#D4A017] text-[#1C1B1B] shadow-lg shadow-[#E9C349]/20 flex items-center justify-center"
      >
        <Bell size={22} />
        {activeAlerts.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-[#FFB4AB] text-[#1C1B1B] rounded-full text-[9px] font-bold flex items-center justify-center border-2 border-[#0E0E0E]">
            {activeAlerts.length}
          </span>
        )}
      </motion.button>

      {/* Alert Manager Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={language === "th" ? "แจ้งเตือนราคา" : "Price Alerts"}>
        <div className="w-full max-w-lg space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">
                {language === "th" ? "🔔 แจ้งเตือนราคา" : "🔔 Price Alerts"}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {language === "th" ? "รับแจ้งเตือนเมื่อถึงแนวรับหรือแนวต้าน" : "Get notified when assets hit support/resistance"}
              </p>
            </div>
          </div>

          {/* Add New Alert */}
          <div className="bg-[#0E0E0E] rounded-2xl p-4 border border-white/5 space-y-3">
            <span className="text-[10px] font-bold text-[#ADC6FF] uppercase tracking-wide">
              {language === "th" ? "เพิ่มการแจ้งเตือนใหม่" : "New Alert"}
            </span>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder={language === "th" ? "สัญลักษณ์ (เช่น BTC)" : "Symbol (e.g. BTC)"}
                value={newAlert.symbol}
                onChange={(e) => setNewAlert({ ...newAlert, symbol: e.target.value })}
                className="bg-white/5 rounded-xl px-3 py-2.5 text-sm text-white border border-white/5 focus:border-[#ADC6FF]/30 outline-none"
              />
              <input
                type="number"
                placeholder={language === "th" ? "ราคาเป้าหมาย" : "Target Price"}
                value={newAlert.targetPrice}
                onChange={(e) => setNewAlert({ ...newAlert, targetPrice: e.target.value })}
                className="bg-white/5 rounded-xl px-3 py-2.5 text-sm text-white border border-white/5 focus:border-[#ADC6FF]/30 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setNewAlert({ ...newAlert, direction: "below" })}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border",
                  newAlert.direction === "below"
                    ? "bg-[#4EDEA3]/10 text-[#4EDEA3] border-[#4EDEA3]/20"
                    : "bg-white/5 text-gray-500 border-white/5"
                )}
              >
                <TrendingDown size={14} /> {language === "th" ? "แนวรับ (ต่ำกว่า)" : "Below (Support)"}
              </button>
              <button
                onClick={() => setNewAlert({ ...newAlert, direction: "above" })}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border",
                  newAlert.direction === "above"
                    ? "bg-[#FFB4AB]/10 text-[#FFB4AB] border-[#FFB4AB]/20"
                    : "bg-white/5 text-gray-500 border-white/5"
                )}
              >
                <TrendingUp size={14} /> {language === "th" ? "แนวต้าน (สูงกว่า)" : "Above (Resistance)"}
              </button>
            </div>
            <input
              type="text"
              placeholder={language === "th" ? "หมายเหตุ (ไม่บังคับ)" : "Note (optional)"}
              value={newAlert.note}
              onChange={(e) => setNewAlert({ ...newAlert, note: e.target.value })}
              className="w-full bg-white/5 rounded-xl px-3 py-2.5 text-sm text-white border border-white/5 focus:border-[#ADC6FF]/30 outline-none"
            />
            <button
              onClick={handleAddAlert}
              disabled={!newAlert.symbol || !newAlert.targetPrice}
              className="w-full py-2.5 bg-[#ADC6FF] text-[#00285d] rounded-xl font-bold text-xs hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Plus size={14} /> {language === "th" ? "เพิ่มการแจ้งเตือน" : "Add Alert"}
            </button>
          </div>

          {/* Active Alerts */}
          {activeAlerts.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-[#E9C349] uppercase tracking-wide">
                {language === "th" ? `กำลังติดตาม (${activeAlerts.length})` : `Watching (${activeAlerts.length})`}
              </span>
              {activeAlerts.map((alert) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between p-3 bg-[#0E0E0E] rounded-xl border border-white/5 group hover:border-white/10 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      alert.direction === "below" ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
                    )}>
                      {alert.direction === "below" ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{alert.symbol}</div>
                      <div className="text-[10px] text-gray-500">
                        {alert.direction === "below" ? "≤" : "≥"} {formatMoney(alert.targetPrice)}
                        {alert.currentPrice && (
                          <span className="ml-1.5 text-gray-600">
                            ({language === "th" ? "ปัจจุบัน" : "Now"}: {formatMoney(alert.currentPrice)})
                          </span>
                        )}
                      </div>
                      {alert.note && <div className="text-[9px] text-gray-600 mt-0.5">{alert.note}</div>}
                    </div>
                  </div>
                  <button
                    onClick={() => removeAlert(alert.id)}
                    className="p-1.5 text-gray-600 hover:text-[#FFB4AB] opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))}
            </div>
          )}

          {/* Triggered (History) */}
          {triggeredAlerts.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                {language === "th" ? `แจ้งเตือนแล้ว (${triggeredAlerts.length})` : `Triggered (${triggeredAlerts.length})`}
              </span>
              {triggeredAlerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 bg-[#0E0E0E]/50 rounded-xl border border-white/5 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#4EDEA3]/10 flex items-center justify-center text-[#4EDEA3]">
                      <Check size={14} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{alert.symbol}</div>
                      <div className="text-[10px] text-gray-500">
                        {language === "th" ? "ถูกแจ้งเตือน" : "Triggered"} @ {formatMoney(alert.targetPrice)}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => removeAlert(alert.id)} className="p-1.5 text-gray-600 hover:text-[#FFB4AB] transition-all">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {alerts.length === 0 && (
            <div className="text-center py-8">
              <Eye size={32} className="text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">{language === "th" ? "ยังไม่มีการแจ้งเตือน" : "No alerts yet"}</p>
              <p className="text-xs text-gray-600 mt-1">{language === "th" ? "เพิ่มสัญลักษณ์ที่คุณสนใจด้านบน" : "Add a symbol above to start watching"}</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
