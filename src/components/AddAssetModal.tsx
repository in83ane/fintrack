"use client";

import React, { useState } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { Modal } from "@/src/components/Modal";
import { useApp } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { CustomSelect } from "@/src/components/CustomSelect";
import { AssetFundingFields, type AssetEntryMode } from "@/src/components/AssetFundingFields";

interface AddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: "search" | "portfolio";
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

export function AddAssetModal({ isOpen, onClose, variant = "search" }: AddAssetModalProps) {
  const { t, addTrade, fetchAssetMarketData, exchangeRates, language, addToast, portfolios, activePortfolio } = useApp();
  const [brokerId, setBrokerId] = useState("");
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (isOpen && !wasOpen.current) setBrokerId(activePortfolio?.kind === "trading" ? activePortfolio.id : "");
    wasOpen.current = isOpen;
  }, [isOpen, activePortfolio?.id, activePortfolio?.kind]);

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
  const [isImport, setIsImport] = useState(true);
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
  const THB_RATE = exchangeRates.THB;
  const avgCostUSD = priceCurrency === 'THB' ? Number(avgCost) / THB_RATE : Number(avgCost);
  const totalCostUSD = avgCostUSD * Number(shares);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdding || !selectedResult || !shares || !avgCost || !brokerId) return;
    if (!Number.isFinite(totalCostUSD)) { addToast('ยังไม่มีข้อมูลเรท USD/THB กรุณารอข้อมูลก่อนบันทึก', 'error'); return; }


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
          if (rawPrice <= 0) {
            addToast('ไม่พบราคาตลาดของสัญลักษณ์นี้ จึงยังเพิ่มสินทรัพย์ไม่ได้', 'error');
            setIsAdding(false);
            return;
          }
          livePrice = apiCurrency === 'THB' ? rawPrice / THB_RATE : rawPrice;
          liveName = liveData?.name || selectedResult.name || selectedResult.symbol;
          chartData = liveData?.chartData;
        } catch {
          addToast('ดึงราคาตลาดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
          setIsAdding(false);
          return;
        }
      }

      // The accepted trade creates the holding; metadata never overwrites its quantity.
      const tradeData = {
        asset: sym,
        type: isImport ? "IMPORT" as const : "BUY" as const,
        amountUSD: totalCostUSD,
        date: new Date().toISOString(),
        rateAtTime: priceCurrency === "THB" ? THB_RATE : 1,
        currency: priceCurrency,
        originalAmount: Number(avgCost) * Number(shares),
        portfolioId: brokerId,
        shares: Number(shares),
        pricePerUnit: avgCostUSD,
        brokerageAccountId: isImport ? undefined : selectedBucketId,
      };

      const saved = await addTrade(tradeData, { name: liveName, allocation: autoAllocation, currentPrice: livePrice, currency: priceCurrency, chartData, excludeFromTotal });
      if (!saved) return;

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
    setIsImport(true);
    setExcludeFromTotal(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  if (variant === "portfolio") {
    return <PortfolioAssetEntryModal isOpen={isOpen} onClose={onClose} />;
  }

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
              className="w-full pl-12 pr-4 py-4 bg-foreground/5 border border-border rounded-2xl text-foreground text-sm font-medium placeholder-gray-500   transition-colors"
              autoFocus
            />
            {isSearching && (
              <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-info animate-spin" />
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-none">
              {searchResults.map((r) => (
                <button
                  key={r.symbol}
                  onClick={() => handleSelect(r.symbol, r.name)}
                  className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-foreground/5 transition-colors text-left group"
                >
                  <div>
                    <span className="text-sm font-black text-foreground">{r.symbol}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{r.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.exchange === 'SET' && (
                      <span className="bg-warning/20 text-warning text-xs px-1.5 py-0.5 rounded font-black tracking-widest uppercase" title="Stock Exchange of Thailand">
                        THAI
                      </span>
                    )}
                    <span className="text-xs text-gray-600 font-bold uppercase">{r.exchange}</span>
                    <Plus size={16} className="text-gray-600 group-hover:text-info transition-colors" />
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
              <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Popular Assets</p>
              <div className="grid grid-cols-2 gap-2">
                {POPULAR_ASSETS.map((asset) => (
                  <button
                    key={asset.symbol}
                    onClick={() => handleSelect(asset.symbol, asset.name)}
                    className="flex flex-col text-left p-3 rounded-xl bg-foreground/5 border border-border hover:bg-foreground/10 hover:border-primary/30 transition-all group"
                  >
                    <div className="flex justify-between items-center w-full mb-1">
                      <span className="text-sm font-black text-foreground group-hover:text-info transition-colors">{asset.symbol}</span>
                      <span className="text-xs font-bold text-gray-500 bg-black/40 px-1.5 py-0.5 rounded uppercase">{asset.exchange}</span>
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
          <div className="flex items-center gap-4 p-4 bg-foreground/5 rounded-2xl border border-border">
            <div className="w-12 h-12 bg-info/10 rounded-xl flex items-center justify-center text-info font-black text-sm">
              {selectedResult?.symbol.slice(0, 3)}
            </div>
            <div className="flex-1">
              <div className="text-sm font-black text-foreground">{selectedResult?.symbol}</div>
              <div className="text-xs text-gray-500">{selectedResult?.name}</div>
            </div>
            <button
              type="button"
              onClick={() => { setStep("search"); setSelectedResult(null); }}
              className="text-xs text-primary font-bold hover:underline"
            >
              {t("change")}
            </button>
          </div>

          <CustomSelect value={brokerId} onChange={id => { setBrokerId(id); setSelectedBucketId(""); }} placeholder="เลือกโบรกเกอร์"
            items={portfolios.filter(p => p.kind === 'trading').map(p => ({ value: p.id, label: p.name }))} />
          <AssetFundingFields portfolioId={brokerId} currency={priceCurrency} mode={isImport ? 'IMPORT' : 'BUY'}
            onModeChange={mode => setIsImport(mode === 'IMPORT')} accountId={selectedBucketId} onAccountChange={setSelectedBucketId} />

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
              className="w-full px-4 py-4 bg-foreground/5 border border-border rounded-2xl text-foreground text-sm font-medium placeholder-gray-600   transition-colors"
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
              <div className="flex gap-1 p-0.5 bg-foreground/5 rounded-lg border border-border">
                {(['USD', 'THB'] as const).map(cur => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setPriceCurrency(cur)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wide transition-all',
                      priceCurrency === cur
                        ? cur === 'THB'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-primary text-primary-foreground'
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
                  "w-full px-4 py-4 bg-foreground/5 border rounded-2xl text-foreground text-sm font-medium placeholder-gray-600  transition-colors pr-16",
                  priceCurrency === 'THB'
                    ? 'border-primary/30 '
                    : 'border-border '
                )}
                required
              />
              <span className={cn(
                'absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs uppercase opacity-90',
                priceCurrency === 'THB' ? 'text-warning' : 'text-info'
              )}>
                {priceCurrency === 'THB' ? '฿' : '$'}
              </span>
            </div>
            {/* Show USD equivalent when THB selected */}
            {priceCurrency === 'THB' && avgCost && Number(avgCost) > 0 && (
              <p className="text-xs text-gray-500 font-medium">
                ≈ ${avgCostUSD.toFixed(2)} USD per unit
              </p>
            )}
          </div>


          {/* Total preview */}
          {shares && avgCost && (
            <div className="p-4 bg-info/5 border border-info/20 rounded-2xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t("totalInvestment")}</span>
                <div className="text-right">
                  <span className="font-black text-foreground">
                    {priceCurrency === 'THB'
                      ? `฿${(Number(shares) * Number(avgCost)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `$${(Number(shares) * Number(avgCost)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    }
                  </span>
                  {priceCurrency === 'THB' && (
                    <p className="text-xs text-gray-500 mt-0.5">≈ ${totalCostUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Exclude from Net Worth Toggle */}
          <div className="flex items-center justify-between p-4 bg-foreground/5 border border-border rounded-2xl">
            <div>
              <p className="text-sm font-bold text-foreground">Exclude from Net Worth</p>
              <p className="text-xs text-gray-500 mt-0.5 max-w-[200px]">Asset value will be tracked but won&apos;t be added to your total portfolio balance.</p>
            </div>
            <button
              type="button"
              onClick={() => setExcludeFromTotal(!excludeFromTotal)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                excludeFromTotal ? "bg-primary" : "bg-gray-600"
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
              className="flex-1 py-4 text-gray-500 font-bold text-sm hover:text-foreground transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isAdding}
              className={cn(
                "flex-1 py-4 bg-primary text-primary-foreground rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all flex items-center justify-center gap-2",
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

type PortfolioMarket = "US" | "TH" | "GOLD" | "FUND";

const PORTFOLIO_MARKETS: Array<{ id: PortfolioMarket; label: string; currency: "USD" | "THB" }> = [
  { id: "US", label: "หุ้นสหรัฐฯ", currency: "USD" },
  { id: "TH", label: "หุ้นไทย", currency: "THB" },
  { id: "GOLD", label: "ทองคำ", currency: "USD" },
  { id: "FUND", label: "กองทุนรวม", currency: "THB" },
];

function PortfolioAssetEntryModal({ isOpen, onClose }: Pick<AddAssetModalProps, "isOpen" | "onClose">) {
  const {
    portfolios, activePortfolio, addTrade,
    fetchAssetMarketData, exchangeRates, addToast,
  } = useApp();
  const tradingPortfolios = portfolios.filter(portfolio => portfolio.kind === "trading");
  const [brokerId, setBrokerId] = useState("");
  const [entryMode, setEntryMode] = useState<AssetEntryMode>('IMPORT');
  const [cashAccountId, setCashAccountId] = useState('');
  const [market, setMarket] = useState<PortfolioMarket>("US");
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const fetchQuoteRef = React.useRef(fetchAssetMarketData);
  const wasOpen = React.useRef(false);

  React.useEffect(() => {
    if (isOpen && !wasOpen.current) setBrokerId(activePortfolio?.kind === "trading" ? activePortfolio.id : '');
    wasOpen.current = isOpen;
  }, [isOpen, activePortfolio?.id, activePortfolio?.kind]);

  React.useEffect(() => {
    if (!isOpen) {
      setMarket("US");
      setSymbol("");
      setName("");
      setShares("");
      setAvgCost("");
      setMarketPrice(null);
      setQuoteState('idle');
      setIsSaving(false);
      setEntryMode('IMPORT');
      setCashAccountId('');
    }
  }, [isOpen]);

  const selectedMarket = PORTFOLIO_MARKETS.find(item => item.id === market) ?? PORTFOLIO_MARKETS[0];
  const currency = selectedMarket.currency;
  const sharesNumber = Number(shares);
  const avgCostNumber = Number(avgCost);
  const isValid = Boolean(brokerId && symbol.trim() && sharesNumber > 0 && avgCostNumber > 0 && marketPrice && quoteState === 'ready');

  React.useEffect(() => {
    fetchQuoteRef.current = fetchAssetMarketData;
  }, [fetchAssetMarketData]);

  React.useEffect(() => {
    const ticker = symbol.trim().toUpperCase();
    if (!isOpen || !ticker) {
      setMarketPrice(null);
      setQuoteState('idle');
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setQuoteState('loading');
      setMarketPrice(null);
      try {
        const quote = await fetchQuoteRef.current(ticker);
        const rawPrice = Number(quote?.price || 0);
        const quoteCurrency = quote?.quoteCurrency === 'THB' || ticker.endsWith('.BK') || ticker.endsWith('.TH') ? 'THB' : 'USD';
        const rate = exchangeRates.THB || 1;
        const displayPrice = quoteCurrency === currency ? rawPrice : quoteCurrency === 'THB' ? rawPrice / rate : rawPrice * rate;
        if (cancelled) return;
        if (displayPrice > 0) {
          setMarketPrice(displayPrice);
          setQuoteState('ready');
        } else setQuoteState('unavailable');
      } catch {
        if (!cancelled) setQuoteState('unavailable');
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [currency, exchangeRates.THB, isOpen, symbol]);

  const chooseBroker = (id: string) => {
    setBrokerId(id);
    setCashAccountId('');
  };

  const save = async () => {
    if (!isValid || isSaving) return;
    const targetPortfolio = tradingPortfolios.find(portfolio => portfolio.id === brokerId);
    if (!targetPortfolio) return;

    setIsSaving(true);
    try {
      const ticker = symbol.trim().toUpperCase();
      const rate = currency === "THB" ? exchangeRates.THB : 1;
      if (!Number.isFinite(rate) || rate <= 0) { addToast('ยังไม่มีข้อมูลเรท USD/THB', 'error'); return; }
      const marketData = await fetchQuoteRef.current(ticker);
      const rawPrice = Number(marketData?.price || 0);
      const apiPriceCurrency = marketData?.quoteCurrency === "THB" || ticker.endsWith('.BK') || ticker.endsWith('.TH') ? "THB" : "USD";
      if (rawPrice <= 0) {
        addToast('ไม่พบราคาตลาดของสัญลักษณ์นี้ จึงยังเพิ่มสินทรัพย์ไม่ได้', 'error');
        return;
      }
      const currentPriceUSD = apiPriceCurrency === "THB" ? rawPrice / (exchangeRates.THB || 1) : rawPrice;
      const avgCostUSD = avgCostNumber / rate;
      const allocation = market === "GOLD" ? "Gold" : market === "FUND" ? "Funds" : "Equities";

      const saved = await addTrade({
        asset: ticker,
        type: entryMode,
        portfolioId: brokerId,
        brokerageAccountId: entryMode === 'BUY' ? cashAccountId : undefined,
        amountUSD: avgCostUSD * sharesNumber,
        originalAmount: avgCostNumber * sharesNumber,
        date: new Date().toISOString(),
        rateAtTime: rate,
        currency,
        shares: sharesNumber,
        pricePerUnit: avgCostUSD,
      }, { name: name.trim() || marketData?.name || ticker, allocation, currentPrice: currentPriceUSD, currency, chartData: marketData?.chartData });
      if (saved) onClose();
    } catch (error) {
      console.error("Failed to add portfolio asset", error);
      addToast("ไม่สามารถเพิ่มสินทรัพย์ได้ กรุณาลองใหม่อีกครั้ง", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="เพิ่มสินทรัพย์">
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-xs font-bold text-gray-400">หัวข้อเริ่มต้น</label>
          <div className="flex flex-wrap gap-2">
            {PORTFOLIO_MARKETS.map(item => (
              <button key={item.id} type="button" onClick={() => { setMarket(item.id); setCashAccountId(''); }} className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                market === item.id ? "border-primary/70 bg-primary/10 text-foreground" : "border-foreground/10 text-gray-400 hover:text-foreground"
              )}>{item.label}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">ภายหลังสามารถจัดกลุ่มสินทรัพย์นี้ใหม่ได้ในหน้า Portfolio</p>
        </div>

        <div>
          <label className="mb-2 block text-xs font-bold text-gray-400">โบรกเกอร์</label>
          <CustomSelect
            value={brokerId}
            onChange={chooseBroker}
            placeholder="เลือกโบรกเกอร์"
            items={tradingPortfolios.map(portfolio => ({ value: portfolio.id, label: portfolio.name }))}
          />
        </div>
        <AssetFundingFields portfolioId={brokerId} currency={currency} mode={entryMode} onModeChange={setEntryMode} accountId={cashAccountId} onAccountChange={setCashAccountId} />

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-2"><span className="block text-xs font-bold text-gray-400">สัญลักษณ์</span><input value={symbol} onChange={event => setSymbol(event.target.value)} placeholder="NVDA" className="w-full rounded-xl border border-border bg-foreground/5 px-3 py-3 text-sm font-semibold uppercase text-foreground placeholder:text-gray-600  " /></label>
          <label className="space-y-2"><span className="block text-xs font-bold text-gray-400">ชื่อ (ไม่บังคับ)</span><input value={name} onChange={event => setName(event.target.value)} placeholder="NVIDIA" className="w-full rounded-xl border border-border bg-foreground/5 px-3 py-3 text-sm font-semibold text-foreground placeholder:text-gray-600  " /></label>
        </div>

        <label className="space-y-2"><span className="block text-xs font-bold text-gray-400">จำนวนหน่วยที่ถือ</span><input inputMode="decimal" value={shares} onChange={event => setShares(event.target.value)} placeholder="0.000000" className="w-full rounded-xl border border-border bg-foreground/5 px-3 py-3 text-sm font-semibold text-foreground placeholder:text-gray-600  " /></label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-2"><span className="block text-xs font-bold text-gray-400">ต้นทุนเฉลี่ย ({currency})</span><input inputMode="decimal" value={avgCost} onChange={event => setAvgCost(event.target.value)} placeholder="0.00" className="w-full rounded-xl border border-border bg-foreground/5 px-3 py-3 text-sm font-semibold text-foreground placeholder:text-gray-600  " /></label>
          <label className="space-y-2"><span className="block text-xs font-bold text-gray-400">ราคาตลาดล่าสุด ({currency})</span><div className={cn("flex min-h-[46px] items-center justify-between rounded-xl border bg-foreground/5 px-3 py-3 text-sm font-semibold", quoteState === 'unavailable' ? "border-loss/40 text-loss" : "border-border text-foreground")}><span>{quoteState === 'loading' ? 'กำลังดึงราคา…' : quoteState === 'ready' ? marketPrice?.toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'ไม่พบราคาตลาด'}</span><span className="text-xs font-black text-gain">MARKET</span></div></label>
        </div>
        <p className="text-xs leading-5 text-gray-500">ดึงราคาตลาดตามสัญลักษณ์โดยอัตโนมัติ และไม่ใช้ต้นทุนเฉลี่ยแทนราคาตลาด</p>

        <button type="button" onClick={save} disabled={!isValid || isSaving} className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground transition hover:bg-[#CEEBDC] disabled:cursor-not-allowed disabled:opacity-40">
          {isSaving ? "กำลังเพิ่มสินทรัพย์…" : "เพิ่มสินทรัพย์"}
        </button>
      </div>
    </Modal>
  );
}
