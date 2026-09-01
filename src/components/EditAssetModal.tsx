"use client";

import React, { useState } from "react";
import { X, Trash2, Star, GripVertical, Save, TrendingUp } from "lucide-react";
import { Modal } from "@/src/components/Modal";
import { ConfirmModal } from "@/src/components/ConfirmModal";
import { useApp, Asset } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { formatPnL, getPnLColor } from "@/src/lib/format";
import { motion } from "motion/react";

interface EditAssetModalProps {
  asset: Asset | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (symbol: string) => void;
}

const ALLOCATION_OPTIONS = [
  { value: "Equities", label: "Equities", labelTh: "หุ้น" },
  { value: "Fixed Income", label: "Fixed Income", labelTh: "ตราสารหนี้" },
  { value: "Alternatives", label: "Alternatives", labelTh: "สินทรัพย์ทางเลือก" },
  { value: "Cash", label: "Cash", labelTh: "เงินสด" },
];

export function EditAssetModal({ asset, isOpen, onClose, onDelete }: EditAssetModalProps) {
  const { t, formatMoney, language, updateAsset, addToast, currency, exchangeRates } = useApp();

  const [editedName, setEditedName] = useState("");
  const [editedShares, setEditedShares] = useState("");
  const [editedAvgCost, setEditedAvgCost] = useState("");
  const [editedAllocation, setEditedAllocation] = useState("");
  const [editedExcludeFromTotal, setEditedExcludeFromTotal] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [originalState, setOriginalState] = useState<Asset | null>(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [inputCurrency, setInputCurrency] = useState<"USD" | "THB">(currency === "THB" ? "THB" : "USD");

  const handleCurrencyChange = (newCur: "USD" | "THB") => {
    if (newCur === inputCurrency) return;
    const currentCost = parseFloat(editedAvgCost) || 0;
    const THB_RATE = exchangeRates["THB"] || 36.5;
    if (newCur === "THB") {
      setEditedAvgCost((currentCost * THB_RATE).toFixed(2));
    } else {
      setEditedAvgCost((currentCost / THB_RATE).toFixed(2));
    }
    setInputCurrency(newCur);
  };

  // Reset state when asset changes
  React.useEffect(() => {
    if (asset) {
      setEditedName(asset.name);
      setEditedShares(asset.shares?.toString() || "0");
      const thbRate = exchangeRates["THB"] || 36.5;
      const initialCurr = currency === "THB" ? "THB" : "USD";
      setInputCurrency(initialCurr);
      const displayCost = initialCurr === "THB" ? (asset.avgCost || 0) * thbRate : (asset.avgCost || 0);
      setEditedAvgCost(displayCost > 0 ? displayCost.toFixed(2) : "0");
      setEditedAllocation(asset.allocation);
      setEditedExcludeFromTotal(asset.excludeFromTotal || false);
      setIsFavorite(asset.isFavorite || false);
      setOriginalState(asset);
      setIsEditing(false);
    }
  }, [asset, currency, exchangeRates]);

  if (!asset || !originalState) return null;

  const THB_RATE = exchangeRates["THB"] || 36.5;
  const isThaiAsset = asset.symbol.toUpperCase().endsWith('.BK') || asset.symbol.toUpperCase().endsWith('.TH');

  const livePrice = (asset.shares || 0) > 0 ? (asset.valueUSD / (asset.shares || 0)) : 0;
  const avgCost = asset.avgCost || livePrice;
  const totalCost = avgCost * (asset.shares || 0);
  const unrealizedPL = asset.valueUSD - totalCost;
  const realizedPL = asset.realizedPL || 0;

  const handleSave = async () => {
    const cost = parseFloat(editedAvgCost) || 0;
    const finalCostUSD = inputCurrency === "THB" ? cost / THB_RATE : cost;
    const updates: Partial<Asset> = {
      name: editedName,
      shares: parseFloat(editedShares) || 0,
      avgCost: finalCostUSD,
      allocation: editedAllocation,
      excludeFromTotal: editedExcludeFromTotal,
    };

    updateAsset(asset.symbol, updates);
    addToast("Asset updated!", "success");
    setIsEditing(false);
    onClose();
  };

  const handleToggleFavorite = () => {
    setIsFavorite(!isFavorite);
    updateAsset(asset.symbol, { isFavorite: !isFavorite });
  };

  const handleDelete = () => {
    setIsConfirmDeleteOpen(true);
  };

  const confirmDelete = () => {
    onDelete(asset.symbol);
    onClose();
  };

  const startEditing = () => {
    if (asset) {
      setEditedName(asset.name);
      setEditedShares(asset.shares?.toString() || "0");
      const thbRate = exchangeRates["THB"] || 36.5;
      const initialCurr = currency === "THB" ? "THB" : "USD";
      setInputCurrency(initialCurr);
      const displayCost = initialCurr === "THB" ? (asset.avgCost || 0) * thbRate : (asset.avgCost || 0);
      setEditedAvgCost(displayCost > 0 ? displayCost.toFixed(2) : "0");
      setEditedAllocation(asset.allocation);
      setEditedExcludeFromTotal(asset.excludeFromTotal || false);
      setIsFavorite(asset.isFavorite || false);
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (originalState) {
      setEditedName(originalState.name);
      setEditedShares(originalState.shares?.toString() || "0");
      const thbRate = exchangeRates["THB"] || 36.5;
      const initialCurr = currency === "THB" ? "THB" : "USD";
      setInputCurrency(initialCurr);
      const displayCost = initialCurr === "THB" ? (originalState.avgCost || 0) * thbRate : (originalState.avgCost || 0);
      setEditedAvgCost(displayCost > 0 ? displayCost.toFixed(2) : "0");
      setEditedAllocation(originalState.allocation);
      setEditedExcludeFromTotal(originalState.excludeFromTotal || false);
      setIsFavorite(originalState.isFavorite || false);
    }
    setIsEditing(false);
  };

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="" assetName={editedName || asset.name} assetSymbol={asset.symbol}>
      <div className="p-6 pb-0">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-[#ADC6FF] font-black text-sm border border-border">
            {asset.symbol.slice(0, 3).toUpperCase()}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleToggleFavorite}
              className={cn(
                "p-2 rounded-lg transition-all",
                isFavorite ? "text-[#E9C349] bg-[#E9C349]/10" : "text-gray-600 hover:text-gray-400"
              )}
            >
              <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-6">
          {/* Quick Stats - Always visible */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface p-3 rounded-xl border border-border">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{t("livePrice")}</p>
              <p className="text-sm font-bold text-white">
                {isThaiAsset ? formatMoney(livePrice, "THB", THB_RATE) : formatMoney(livePrice, "USD", 1)}
              </p>
            </div>
            <div className="bg-surface p-3 rounded-xl border border-border">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{t("avgCost")}</p>
              <p className="text-sm font-bold text-white">
                {isThaiAsset ? formatMoney(avgCost, "THB", THB_RATE) : formatMoney(avgCost, "USD", 1)}
              </p>
            </div>
            <div className="bg-surface p-3 rounded-xl border border-border">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{t("holdings")}</p>
              <p className="text-sm font-bold text-white">
                {isThaiAsset ? formatMoney(asset.valueUSD, "THB", THB_RATE) : formatMoney(asset.valueUSD, "USD", 1)}
              </p>
            </div>
            <div className="bg-surface p-3 rounded-xl border border-border">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{t("unrealizedPL")}</p>
              <p className={cn("text-sm font-bold", getPnLColor(unrealizedPL))}>
                {formatPnL(unrealizedPL, (v) => formatMoney(v))}
              </p>
            </div>
          </div>

          {/* Realized PL - Separate card */}
          <div className="bg-surface p-4 rounded-xl border border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-[#ADC6FF]" />
                <p className="text-xs font-bold text-gray-400 uppercase">{t("realizedPL")}</p>
              </div>
              <p className={cn("text-sm font-black", getPnLColor(realizedPL))}>
                {formatPnL(realizedPL, (v) => formatMoney(v))}
              </p>
            </div>
            <p className="text-[10px] text-gray-600 italic">
              * {t("realizedPL")}: กำไร/ขาดทุนที่ขายไปแล้ว (เกิดจาก SELL trades)
              <br />
              * {t("unrealizedPL")}: กำไร/ขาดทุนที่ยังไม่ขาย (ถือครองอยู่)
            </p>
          </div>

          {/* Edit Form */}
          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">{t("asset")}</label>
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-border rounded-xl text-white text-sm focus:outline-none focus:border-[#ADC6FF]/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">{t("quantitySharesCoins")}</label>
                  <input
                    type="number"
                    step="any"
                    value={editedShares}
                    onChange={(e) => setEditedShares(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-border rounded-xl text-white text-sm focus:outline-none focus:border-[#ADC6FF]/50"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-400 uppercase">{t("avgCostPerUnit")}</label>
                    <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg border border-border">
                      {(['USD', 'THB'] as const).map(cur => (
                        <button
                          key={cur}
                          type="button"
                          onClick={() => handleCurrencyChange(cur)}
                          className={cn(
                            'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                            inputCurrency === cur
                              ? cur === 'THB'
                                ? 'bg-[#E9C349] text-[#241a00]'
                                : 'bg-[#ADC6FF] text-[#00285d]'
                              : 'text-gray-500 hover:text-gray-300'
                          )}
                        >
                          {cur}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      value={editedAvgCost}
                      onChange={(e) => setEditedAvgCost(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-border rounded-xl text-white text-sm focus:outline-none focus:border-[#ADC6FF]/50 pr-12"
                    />
                    <span className={cn(
                      "absolute right-3 top-1/2 -translate-y-1/2 font-bold text-xs uppercase opacity-80",
                      inputCurrency === 'THB' ? 'text-[#E9C349]' : 'text-[#ADC6FF]'
                    )}>
                      {inputCurrency}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase">{t("allocation")}</label>
                <select
                  value={editedAllocation}
                  onChange={(e) => setEditedAllocation(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-border rounded-xl text-white text-sm focus:outline-none focus:border-[#ADC6FF]/50"
                >
                  {ALLOCATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {language === "th" ? opt.labelTh : opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Exclude from Net Worth Toggle */}
              <div className="flex items-center justify-between py-2 mt-2">
                <div>
                  <p className="text-sm font-bold text-white">Exclude from Net Worth</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditedExcludeFromTotal(!editedExcludeFromTotal)}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    editedExcludeFromTotal ? "bg-[#ADC6FF]" : "bg-gray-600"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      editedExcludeFromTotal ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-gray-500">{t("asset")}</span>
                <span className="text-sm font-bold text-white">{asset.name}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-gray-500">{t("quantitySharesCoins")}</span>
                <span className="text-sm font-bold text-white">{asset.shares?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-gray-500">{t("avgCostPerUnit")}</span>
                <span className="text-sm font-bold text-white">{formatMoney(asset.avgCost || 0)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-gray-500">{t("allocation")}</span>
                <span className="text-sm font-bold text-white">
                  {ALLOCATION_OPTIONS.find(a => a.value === asset.allocation)?.label || asset.allocation}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500">Favorite</span>
                <span className={cn("text-sm font-bold", isFavorite ? "text-[#E9C349]" : "text-gray-600")}>
                  {isFavorite ? "★ Favorited" : "☆ Not Favorited"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500">Exclude from Net Worth</span>
                <span className={cn("text-sm font-bold", asset.excludeFromTotal ? "text-[#FFB4AB]" : "text-gray-600")}>
                  {asset.excludeFromTotal ? "Yes (Excluded)" : "No (Included)"}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 pt-4">
            {isEditing ? (
              <div className="flex gap-3">
                <button
                  onClick={cancelEditing}
                  className="flex-1 py-3 bg-white/5 border border-border text-white rounded-full font-bold text-xs uppercase hover:bg-white/10 transition-all"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-xs uppercase hover:brightness-110 transition-all flex items-center justify-center gap-2"
                >
                  <Save size={14} />
                  {t("confirm")}
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={startEditing}
                  className="flex-1 py-3 bg-white/5 border border-border text-white rounded-full font-bold text-xs uppercase hover:bg-white/10 transition-all"
                >
                  {t("editAllocation")}
                </button>
              </div>
            )}

            {/* Delete Button - Danger Zone */}
            <div className="pt-4 mt-4 border-t border-border">
              <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Danger Zone</p>
              <button
                onClick={handleDelete}
                className="w-full py-3 bg-[#FFB4AB]/5 border border-[#FFB4AB]/20 text-[#FFB4AB] rounded-xl font-bold text-xs uppercase hover:bg-[#FFB4AB]/10 transition-all flex items-center justify-center gap-2"
              >
                <Trash2 size={14} />
                {t("deleteAsset")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
    <ConfirmModal
      isOpen={isConfirmDeleteOpen}
      onClose={() => setIsConfirmDeleteOpen(false)}
      onConfirm={confirmDelete}
      title={t("deleteAsset")}
      message={`${t("confirmDelete")} ${asset.symbol}?`}
      confirmText={t("confirm")}
      cancelText={t("cancel")}
      isDanger={true}
    />
    </>
  );
}
