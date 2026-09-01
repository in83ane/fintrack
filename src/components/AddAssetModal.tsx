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

const POPULAR_ASSETS = [
  { symbol: "BTC-USD", name: "Bitcoin", exchange: "CRYPTO" },
  { symbol: "ETH-USD", name: "Ethereum", exchange: "CRYPTO" },
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ" },
  { symbol: "AOT.BK", name: "Airports of Thailand", exchange: "SET" },
  { symbol: "PTT.BK", name: "PTT Public Company", exchange: "SET" },
  { symbol: "GOLDBAR.TH", name: "ทองแท่ง (Thai Gold Bar)", exchange: "MANUAL" },
  { symbol: "GOLDBAR", name: "Gold Bar (International)", exchange: "MANUAL" },
  { symbol: "XAUUSD", name: "Gold Spot (XAU/USD)", exchange: "FOREX" },
  { symbol: "GLD", name: "SPDR Gold Shares ETF", exchange: "NYSE" },
];

export function AddAssetModal({ isOpen, onClose }: AddAssetModalProps) {
  const { t, addAsset, addTrade, addTradeFromBucket, fetchAssetMarketData, exchangeRates, currency, language, moneyBuckets, formatMoney, addToast } = useApp();

  const [step, setStep] = useState<"search" | "details">("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; exchange: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<{ symbol: string; name: string } | null>(null);
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<'USD' | 'THB'>('USD');
  const [isAdding, setIsAdding] = useState(false);
  const [selectedBucketId, setSelectedBucketId] = useState<string>("");
  const [showBucketDropdown, setShowBucketDropdown] = useState(false);
  const [isImport, setIsImport] = useState(false);
  const [excludeFromTotal, setExcludeFromTotal] = useState(false);

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
    // Auto-detect currency: Thai stocks and Thai gold → THB
    const sym = symbol.toUpperCase();
    const isThaiAsset = sym.endsWith('.BK') || sym.endsWith('.TH') || sym.startsWith('GOLDBAR.TH') || sym === 'GLD965';
    setPriceCurrency(isThaiAsset ? 'THB' : 'USD');
  };

  // Convert input price to USD for internal storage
  const THB_RATE = exchangeRates['THB'] || 36.5;
  const avgCostUSD = priceCurrency === 'THB' ? Number(avgCost) / THB_RATE : Number(avgCost);
  const totalCostUSD = avgCostUSD * Number(shares);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResult || !shares || !avgCost) return;

    // Validate bucket balance (only for new purchases with bucket)
    if (!isImport && selectedBucketId) {
      const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
      if (bucket && bucket.currentAmount < totalCostUSD) {
        addToast(t("amountExceedsBalance"), "error");
        return;
      }
    }

    setIsAdding(true);
    try {
      const sym = selectedResult.symbol.toUpperCase();

      // Manual gold bar symbols — skip live price fetch, use avgCost as price
      const MANUAL_GOLD_SYMBOLS = ['GOLDBAR', 'GOLDBAR.TH', 'GOLDBAR.UK', 'GOLDBAR.US', 'THGOLD', 'PHYSGOLD'];
      const isManualGold = MANUAL_GOLD_SYMBOLS.includes(sym) || sym.startsWith('GOLDBAR');

      const CRYPTO_PREFIXES = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP', 'ADA', 'MATIC', 'AVAX', 'LINK'];
      const isCrypto = CRYPTO_PREFIXES.some(p => sym === p || sym.startsWith(p + '-') || sym.startsWith(p + '/'));
      const isGold = isManualGold || sym.startsWith('XAU') || sym.includes('GOLD') || ['GLD','IAU','SGOL','GC=F','PAXG','XAUT','GLD965'].includes(sym);
      const isThaiStock = sym.endsWith('.BK') || sym.endsWith('.TH') && !isManualGold;

      const autoAllocation = isGold ? 'Gold'
        : isCrypto ? 'Alternatives'
        : isThaiStock ? 'Equities'
        : 'Equities';

      let livePrice = avgCostUSD;
      let liveName = selectedResult.name || selectedResult.symbol;
      let chartData: any[] | undefined = undefined;

      if (!isManualGold) {
        try {
          const liveData = await fetchAssetMarketData(sym);
          // For Thai-priced assets: live price from API may be in THB, convert to USD
          const rawPrice = liveData?.price || 0;
          const apiCurrency = (sym.endsWith('.BK') || sym.endsWith('.TH') || sym === 'GLD965') ? 'THB' : 'USD';
          livePrice = rawPrice > 0
            ? (apiCurrency === 'THB' ? rawPrice / THB_RATE : rawPrice)
            : avgCostUSD;
          liveName = liveData?.name || selectedResult.name || selectedResult.symbol;
          chartData = liveData?.chartData;
        } catch {
          // fallback to manual price
        }
      }

      const totalValue = livePrice * Number(shares);

      // 1. Add to assets
      addAsset({
        name: liveName,
        symbol: sym,
        valueUSD: totalValue,
        change: 0,
        allocation: autoAllocation,
        shares: Number(shares),
        avgCost: avgCostUSD,   // always store in USD
        chartData,
        excludeFromTotal,
      });

      // 2. Auto-create a trade entry
      const tradeData = {
        asset: sym,
        type: isImport ? "IMPORT" as const : "BUY" as const,
        amountUSD: totalCostUSD,
        date: new Date().toISOString(),
        rateAtTime: exchangeRates[currency],
        currency: currency,
        shares: Number(shares),
        pricePerUnit: avgCostUSD,
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
    setPriceCurrency('USD');
    setSelectedBucketId("");
    setShowBucketDropdown(false);
    setIsImport(false);
    setExcludeFromTotal(false);
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
              className="w-full pl-12 pr-4 py-4 bg-white/5 border border-border rounded-2xl text-white text-sm font-medium placeholder-gray-500 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors"
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
            <div className="pt-4">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Popular Assets</p>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_ASSETS.map((asset) => (
                  <button
                    key={asset.symbol}
                    onClick={() => handleSelect(asset.symbol, asset.name)}
                    className="flex flex-col text-left p-3 rounded-xl bg-white/5 border border-border hover:bg-white/10 hover:border-[#ADC6FF]/30 transition-all group"
                  >
                    <div className="flex justify-between items-center w-full mb-1">
                      <span className="text-sm font-black text-white group-hover:text-[#ADC6FF] transition-colors">{asset.symbol}</span>
                      <span className="text-[9px] font-bold text-gray-500 bg-black/40 px-1.5 py-0.5 rounded uppercase">{asset.exchange}</span>
                    </div>
                    <span className="text-xs text-gray-500 line-clamp-1">{asset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Step 2: Enter details */
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Selected asset display */}
          <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-border">
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
          <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-border">
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
              className="w-full px-4 py-4 bg-white/5 border border-border rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors"
              required
            />
          </div>

          {/* Avg Cost */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                {t("avgCostPerUnit")}
              </label>
              {/* THB / USD toggle */}
              <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg border border-border">
                {(['USD', 'THB'] as const).map(cur => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setPriceCurrency(cur)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide transition-all',
                      priceCurrency === cur
                        ? cur === 'THB'
                          ? 'bg-[#E9C349] text-[#241a00]'
                          : 'bg-[#ADC6FF] text-[#00285d]'
                        : 'text-gray-500 hover:text-gray-300'
                    )}
                  >
                    {cur === 'THB' ? '฿ THB' : '$ USD'}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                placeholder="0.00"
                className={cn(
                  "w-full px-4 py-4 bg-white/5 border rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none transition-colors pr-16",
                  priceCurrency === 'THB'
                    ? 'border-[#E9C349]/30 focus:border-[#E9C349]/60'
                    : 'border-border focus:border-[#ADC6FF]/50'
                )}
                required
              />
              <span className={cn(
                'absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs uppercase opacity-90',
                priceCurrency === 'THB' ? 'text-[#E9C349]' : 'text-[#ADC6FF]'
              )}>
                {priceCurrency === 'THB' ? '฿' : '$'}
              </span>
            </div>
            {/* Show USD equivalent when THB selected */}
            {priceCurrency === 'THB' && avgCost && Number(avgCost) > 0 && (
              <p className="text-[11px] text-gray-500 font-medium">
                ≈ ${avgCostUSD.toFixed(2)} USD per unit
              </p>
            )}
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
                    selectedBucketId ? "border-[#ADC6FF]/30 text-white" : "border-border text-gray-500"
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
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-2xl overflow-hidden z-20 shadow-2xl">
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
                            {formatMoney(b.currentAmount / (exchangeRates[b.currency || 'USD'] || 1), b.currency as any, undefined, b.currentAmount)}
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
                <div className="text-right">
                  <span className="font-black text-white">
                    {priceCurrency === 'THB'
                      ? `฿${(Number(shares) * Number(avgCost)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `$${(Number(shares) * Number(avgCost)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    }
                  </span>
                  {priceCurrency === 'THB' && (
                    <p className="text-[11px] text-gray-500 mt-0.5">≈ ${totalCostUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</p>
                  )}
                </div>
              </div>
              {selectedBucketId && (() => {
                const b = moneyBuckets.find(b => b.id === selectedBucketId);
                if (!b) return null;
                const totalCost = Number(shares) * Number(avgCost);
                const remaining = b.currentAmount - totalCost;
                return (
                  <div className="flex justify-between text-xs pt-1 border-t border-border">
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

          {/* Exclude from Net Worth Toggle */}
          <div className="flex items-center justify-between p-4 bg-white/5 border border-border rounded-2xl">
            <div>
              <p className="text-sm font-bold text-white">Exclude from Net Worth</p>
              <p className="text-xs text-gray-500 mt-0.5 max-w-[200px]">Asset value will be tracked but won&apos;t be added to your total portfolio balance.</p>
            </div>
            <button
              type="button"
              onClick={() => setExcludeFromTotal(!excludeFromTotal)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                excludeFromTotal ? "bg-[#ADC6FF]" : "bg-gray-600"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  excludeFromTotal ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>

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
