"use client";

import React, { useState } from "react";
import { Search, Plus, Loader2, Wallet, ChevronDown, ArrowDownToLine, ShoppingCart } from "lucide-react";
import { Modal } from "@/src/components/Modal";
import { useApp, Asset } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";

interface AddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddAssetModal({ isOpen, onClose }: AddAssetModalProps) {
  const { t, addAsset, addTrade, addTradeFromBucket, fetchAssetMarketData, exchangeRates, currency, language, moneyBuckets, formatMoney, addToast } = useApp();

  const [step, setStep] = useState<"search" | "details">("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; exchange: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<{ symbol: string; name: string } | null>(null);
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [selectedBucketId, setSelectedBucketId] = useState<string>("");
  const [showBucketDropdown, setShowBucketDropdown] = useState(false);
  const [isImport, setIsImport] = useState(false);

  const handleSearch = async (val: string) => {
    setQuery(val);
    if (val.length >= 2) {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${val}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      }
      setIsSearching(false);
    } else {
      setSearchResults([]);
    }
  };

  const handleSelect = (symbol: string, name: string) => {
    setSelectedResult({ symbol, name });
    setSearchResults([]);
    setQuery("");
    setStep("details");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResult || !shares || !avgCost) return;

    const totalCost = Number(avgCost) * Number(shares);

    // Validate bucket balance (only for new purchases with bucket)
    if (!isImport && selectedBucketId) {
      const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
      if (bucket && bucket.currentAmount < totalCost) {
        addToast(t("amountExceedsBalance"), "error");
        return;
      }
    }

    setIsAdding(true);
    try {
      const liveData = await fetchAssetMarketData(selectedResult.symbol.toUpperCase());
      const livePrice = liveData?.price || Number(avgCost) || 0;
      const totalValue = livePrice * Number(shares);

      // 1. Add to assets — auto-detect allocation category
      const sym = selectedResult.symbol.toUpperCase();
      const CRYPTO = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'];
      const autoAllocation = CRYPTO.includes(sym) ? "Alternatives"
        : (sym.endsWith('.BK') || sym.endsWith('.TH')) ? "Equities"
        : "Equities";

      addAsset({
        name: liveData?.name || selectedResult.name || selectedResult.symbol,
        symbol: sym,
        valueUSD: totalValue,
        change: liveData?.changePercent || 0,
        allocation: autoAllocation,
        shares: Number(shares),
        avgCost: Number(avgCost),
        chartData: liveData?.chartData,
      });

      // 2. Auto-create a trade entry
      const tradeData = {
        asset: selectedResult.symbol.toUpperCase(),
        type: isImport ? "IMPORT" as const : "BUY" as const,
        amountUSD: totalCost,
        date: new Date().toISOString(),
        rateAtTime: exchangeRates[currency],
        currency: currency,
        shares: Number(shares),
        pricePerUnit: Number(avgCost),
        sourceBucketId: selectedBucketId || undefined,
      };

      if (!isImport && selectedBucketId) {
        addTradeFromBucket(tradeData, selectedBucketId);
      } else {
        addTrade(tradeData);
      }

      // Reset & close
      resetState();
      onClose();
    } catch (err) {
      console.error("Failed to add asset", err);
    } finally {
      setIsAdding(false);
    }
  };

  const resetState = () => {
    setStep("search");
    setQuery("");
    setSearchResults([]);
    setSelectedResult(null);
    setShares("");
    setAvgCost("");
    setSelectedBucketId("");
    setShowBucketDropdown(false);
    setIsImport(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t("addAsset")}>
      {step === "search" ? (
        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t("searchAssetPlaceholder")}
              className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium placeholder-gray-500 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors"
              autoFocus
            />
            {isSearching && (
              <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#ADC6FF] animate-spin" />
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-none">
              {searchResults.map((r) => (
                <button
                  key={r.symbol}
                  onClick={() => handleSelect(r.symbol, r.name)}
                  className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-colors text-left group"
                >
                  <div>
                    <span className="text-sm font-black text-white">{r.symbol}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{r.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.exchange === 'SET' && (
                      <span className="bg-[#E9C349]/20 text-[#E9C349] text-[9px] px-1.5 py-0.5 rounded font-black tracking-widest uppercase" title="Stock Exchange of Thailand">
                        THAI
                      </span>
                    )}
                    <span className="text-[10px] text-gray-600 font-bold uppercase">{r.exchange}</span>
                    <Plus size={16} className="text-gray-600 group-hover:text-[#ADC6FF] transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {query.length >= 2 && !isSearching && searchResults.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              {t("noResultsFound")}
            </div>
          )}

          {query.length < 2 && (
            <div className="text-center py-12 text-gray-600 text-sm">
              <Search size={32} className="mx-auto mb-3 text-gray-700" />
              {t("typeToSearch")}
            </div>
          )}
        </div>
      ) : (
        /* Step 2: Enter details */
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Selected asset display */}
          <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-12 h-12 bg-[#ADC6FF]/10 rounded-xl flex items-center justify-center text-[#ADC6FF] font-black text-sm">
              {selectedResult?.symbol.slice(0, 3)}
            </div>
            <div className="flex-1">
              <div className="text-sm font-black text-white">{selectedResult?.symbol}</div>
              <div className="text-xs text-gray-500">{selectedResult?.name}</div>
            </div>
            <button
              type="button"
              onClick={() => { setStep("search"); setSelectedResult(null); }}
              className="text-xs text-[#ADC6FF] font-bold hover:underline"
            >
              {t("change")}
            </button>
          </div>

          {/* Import / New Purchase Toggle */}
          <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/10">
            <button
              type="button"
              onClick={() => { setIsImport(false); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all",
                !isImport
                  ? "bg-[#ADC6FF]/20 text-[#ADC6FF] border border-[#ADC6FF]/30"
                  : "text-gray-500 hover:text-gray-300"
              )}
            >
              <ShoppingCart size={14} />
              {t("newPurchase")}
            </button>
            <button
              type="button"
              onClick={() => { setIsImport(true); setSelectedBucketId(""); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all",
                isImport
                  ? "bg-[#E9C349]/20 text-[#E9C349] border border-[#E9C349]/30"
                  : "text-gray-500 hover:text-gray-300"
              )}
            >
              <ArrowDownToLine size={14} />
              {t("importExisting")}
            </button>
          </div>

          {/* Info badge for import mode */}
          {isImport && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#E9C349]/10 border border-[#E9C349]/20 rounded-xl">
              <ArrowDownToLine size={12} className="text-[#E9C349] flex-shrink-0" />
              <span className="text-[11px] text-[#E9C349] font-medium">{t("importExistingDesc")}</span>
            </div>
          )}

          {/* Shares */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
              {t("quantitySharesCoins")}
            </label>
            <input
              type="number"
              step="any"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors"
              required
            />
          </div>

          {/* Avg Cost */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
              {t("avgCostPerUnit")}
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors pr-12"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#ADC6FF] font-bold text-xs uppercase opacity-80">USD</span>
            </div>
          </div>

          {/* Source Bucket Selector — only for new purchases */}
          {!isImport && moneyBuckets.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                <Wallet size={12} className="text-[#ADC6FF]" />
                {t("sourceBucket")}
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowBucketDropdown(!showBucketDropdown)}
                  className={cn(
                    "w-full px-4 py-3 bg-white/5 border rounded-2xl text-sm font-medium flex items-center justify-between transition-colors",
                    selectedBucketId ? "border-[#ADC6FF]/30 text-white" : "border-white/10 text-gray-500"
                  )}
                >
                  <span>
                    {selectedBucketId
                      ? (() => {
                          const b = moneyBuckets.find(b => b.id === selectedBucketId);
                          return b ? `${b.icon} ${t(b.name) || b.name}` : t("selectSourceBucket");
                        })()
                      : t("noBucketSelected")
                    }
                  </span>
                  <ChevronDown size={14} className={cn("transition-transform", showBucketDropdown && "rotate-180")} />
                </button>
                {showBucketDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#1C1B1B] border border-white/10 rounded-2xl overflow-hidden z-20 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => { setSelectedBucketId(""); setShowBucketDropdown(false); }}
                      className={cn("w-full px-4 py-3 text-left text-sm hover:bg-white/5 transition-colors flex items-center justify-between",
                        !selectedBucketId ? "text-[#ADC6FF] font-bold" : "text-gray-400"
                      )}
                    >
                      <span>{t("noBucketSelected")}</span>
                    </button>
                    {moneyBuckets.map(b => {
                      const totalCost = Number(shares || 0) * Number(avgCost || 0);
                      const hasEnough = b.currentAmount >= totalCost;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => { if (hasEnough || totalCost === 0) { setSelectedBucketId(b.id); setShowBucketDropdown(false); } }}
                          className={cn(
                            "w-full px-4 py-3 text-left text-sm hover:bg-white/5 transition-colors flex items-center justify-between",
                            selectedBucketId === b.id ? "text-[#ADC6FF] font-bold" : "text-gray-300",
                            !hasEnough && totalCost > 0 && "opacity-40 cursor-not-allowed"
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span>{b.icon}</span>
                            <span>{t(b.name) || b.name}</span>
                          </span>
                          <span className={cn("text-xs font-bold", hasEnough || totalCost === 0 ? "text-gray-500" : "text-[#FFB4AB]")}>
                            {formatMoney(b.currentAmount)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Total preview */}
          {shares && avgCost && (
            <div className="p-4 bg-[#ADC6FF]/5 border border-[#ADC6FF]/20 rounded-2xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t("totalInvestment")}</span>
                <span className="font-black text-white">${(Number(shares) * Number(avgCost)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {selectedBucketId && (() => {
                const b = moneyBuckets.find(b => b.id === selectedBucketId);
                if (!b) return null;
                const totalCost = Number(shares) * Number(avgCost);
                const remaining = b.currentAmount - totalCost;
                return (
                  <div className="flex justify-between text-xs pt-1 border-t border-white/5">
                    <span className="text-gray-500 flex items-center gap-1">
                      <Wallet size={10} /> {t("bucketBalance")}: {b.icon} {t(b.name) || b.name}
                    </span>
                    <span className={cn("font-bold", remaining >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                      {formatMoney(remaining)}
                    </span>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={() => { setStep("search"); setSelectedResult(null); }}
              className="flex-1 py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isAdding}
              className={cn(
                "flex-1 py-4 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all flex items-center justify-center gap-2",
                isAdding && "opacity-60"
              )}
            >
              {isAdding && <Loader2 size={16} className="animate-spin" />}
              {t("confirm")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
