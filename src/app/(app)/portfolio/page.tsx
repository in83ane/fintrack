"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Wallet, ArrowUpRight, ArrowDownRight, Filter, Upload, Download, Plus, X, ZoomIn, Trash2, TrendingUp, PieChart, ChevronDown } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { useApp, Asset } from "@/src/context/AppContext";
import { Modal } from "@/src/components/Modal";
import { AddAssetModal } from "@/src/components/AddAssetModal";
import { EditAssetModal } from "@/src/components/EditAssetModal";
import { TradeJourney } from "@/src/components/TradeJourney";
import { cn } from "@/src/lib/utils";
import { StockChart, fetchChartData, TimePeriod } from "@/src/components/StockChart";
import Papa from "papaparse";
import { GripVertical, Star } from "lucide-react";

interface PricePoint {
  time: number;
  price: number;
}

// ─── Period config (no "1w") ──────────────────────────────────────────────────

const PERIODS: { key: TimePeriod; label: string; labelTh: string }[] = [
  { key: "1d",  label: "1D",  labelTh: "1วัน" },
  { key: "5d",  label: "5D",  labelTh: "5วัน" },
  { key: "1m",  label: "1M",  labelTh: "1ด."  },
  { key: "6m",  label: "6M",  labelTh: "6ด."  },
  { key: "ytd", label: "YTD", labelTh: "YTD"  },
  { key: "1y",  label: "1Y",  labelTh: "1ปี"  },
  { key: "5y",  label: "5Y",  labelTh: "5ปี"  },
];

// ───────────────────────────────────────────────────────────────────────────────

const AssetLogo = ({ symbol, name, className }: { symbol: string; name: string; className?: string }) => {
  const [imgError, setImgError] = useState(false);
  const isCrypto = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'].includes(symbol.toUpperCase());

  if (imgError) {
    return (
      <div className={cn("w-full h-full flex items-center justify-center bg-[#1C1B1B] text-[#ADC6FF] font-black rounded-lg overflow-hidden text-xs", className)}>
        {symbol.slice(0, 3).toUpperCase()}
      </div>
    );
  }

  const src = isCrypto
    ? `https://cryptologos.cc/logos/${name.toLowerCase().replace(' ', '-')}-${symbol.toLowerCase()}-logo.png`
    : `https://eodhd.com/img/logos/US/${symbol.toUpperCase()}.png`;

  return (
    <img
      src={src}
      className={cn("w-full h-full object-contain p-1", className)}
      alt={symbol}
      onError={() => setImgError(true)}
    />
  );
};

// ─── Asset Trade Panel Component ─────────────────────────────────────────────
function AssetTradePanel({ asset, onClose }: { asset: Asset, onClose: () => void }) {
  const { t, addTrade, currency, exchangeRates, addToast } = useApp();
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedShares = parseFloat(shares);
    const parsedPrice = parseFloat(price);
    if (!parsedShares || !parsedPrice || parsedShares <= 0 || parsedPrice <= 0) return;

    addTrade({
      asset: asset.symbol,
      type: tradeType,
      amountUSD: parsedShares * parsedPrice,
      date: date === new Date().toISOString().split("T")[0] ? new Date().toISOString() : new Date(date).toISOString(),
      rateAtTime: exchangeRates[currency] || 1,
      currency: currency,
      shares: parsedShares,
      pricePerUnit: parsedPrice,
    });
    addToast(t("tradeAdded") || "Trade recorded successfully", "success");
    setShares("");
    setPrice("");
    onClose();
  };

  return (
    <div className="bg-[#1C1B1B] p-5 rounded-2xl border border-white/5 space-y-4">
       <div className="flex bg-white/5 rounded-xl p-1 gap-1">
         <button onClick={() => setTradeType("BUY")} className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-all", tradeType === "BUY" ? "bg-[#4EDEA3] text-[#00285d]" : "text-gray-400 hover:text-white")}>{t("buy") || "BUY"}</button>
         <button onClick={() => setTradeType("SELL")} className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-all", tradeType === "SELL" ? "bg-[#FFB4AB] text-[#5d0000]" : "text-gray-400 hover:text-white")}>{t("sell") || "SELL"}</button>
       </div>
       <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
             <div>
               <label className="text-[10px] font-bold text-gray-500 uppercase">{t("shares") || "SHARES"}</label>
               <input type="number" step="any" required value={shares} onChange={e => setShares(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-[#ADC6FF] focus:outline-none mt-1" />
             </div>
             <div>
               <label className="text-[10px] font-bold text-gray-500 uppercase">{t("pricePerUnit") || "PRICE"}</label>
               <div className="relative mt-1">
                 <input type="number" step="any" required value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-[#ADC6FF] focus:outline-none pr-10" />
                 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADC6FF] font-bold text-[10px] uppercase opacity-80">USD</span>
               </div>
             </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase">{t("date") || "DATE"}</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-[#ADC6FF] focus:outline-none mt-1" />
          </div>
          <button type="submit" className={cn("w-full py-3 rounded-xl font-black text-sm uppercase tracking-tight transition-all", tradeType === "BUY" ? "bg-[#4EDEA3] text-[#00285d] hover:brightness-110" : "bg-[#FFB4AB] text-[#5d0000] hover:brightness-110")}>
            {tradeType === "BUY" ? (t("buy") || "Buy") : (t("sell") || "Sell")} {asset.symbol}
          </button>
       </form>
    </div>
  );
}

// ─── Asset Detail Modal Component ─────────────────────────────────────────────

interface AssetDetailModalProps {
  asset: Asset | null;
  isOpen: boolean;
  onClose: () => void;
  initialPeriod?: TimePeriod;
}

function AssetDetailModal({ asset, isOpen, onClose, initialPeriod = "1m" }: AssetDetailModalProps) {
  const { t, formatMoney, language, currency, exchangeRates } = useApp();
  const THB_RATE = exchangeRates["THB"] || 36.5;
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>(initialPeriod);
  const [chartData, setChartData] = useState<PricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset period when modal opens with new initialPeriod
  useEffect(() => {
    if (isOpen) {
      setSelectedPeriod(initialPeriod);
    }
  }, [isOpen, initialPeriod]);

  // Fetch chart data when period or asset changes
  useEffect(() => {
    if (!asset || !isOpen) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (selectedPeriod === "1d" && asset.intradayData && asset.intradayData.length > 1) {
          setChartData(asset.intradayData);
        } else {
          const data = await fetchChartData(asset.symbol, selectedPeriod);
          setChartData(data);
        }
      } catch (err: any) {
        console.error("Failed to fetch chart data:", err);
        setError(err.message);
        if (asset.chartData) {
          setChartData(asset.chartData);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [asset, selectedPeriod, isOpen]);

  if (!asset) return null;

  const shares = asset.shares || 0;
  const livePrice = asset.currentPrice || (shares > 0 ? (asset.valueUSD / shares) : 0);
  const avgCost = asset.avgCost || livePrice;
  const isPositive = asset.change >= 0;
  const isThaiAsset = asset.symbol.toUpperCase().endsWith('.BK') || asset.symbol.toUpperCase().endsWith('.TH');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" assetName={asset.name}>


      <div className="p-6">
        <div className="space-y-4">
          {/* Live Price and Avg Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#1C1B1B] p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">{t("livePrice")}</p>
              <div>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-white">
                    {isThaiAsset ? formatMoney(livePrice, "THB", THB_RATE) : formatMoney(livePrice, "USD", 1)}
                  </p>
                  <p className={cn("text-sm font-bold", isPositive ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {isPositive ? '+' : ''}{asset.change.toFixed(2)}%
                  </p>
                </div>
                {(!isThaiAsset && currency === "THB") && (
                  <p className="text-sm text-gray-500 mt-1 font-medium">
                    {t("approx")} {formatMoney(livePrice, "THB", THB_RATE)}
                  </p>
                )}
                {(isThaiAsset && currency === "USD") && (
                  <p className="text-sm text-gray-500 mt-1 font-medium">
                    {t("approx")} {formatMoney(livePrice, "USD", 1 / THB_RATE)}
                  </p>
                )}
              </div>
            </div>
            <div className="bg-[#1C1B1B] p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">{t("avgCost")}</p>
              <div>
                <p className="text-2xl font-bold text-white">
                  {isThaiAsset ? formatMoney(avgCost, "THB", THB_RATE) : formatMoney(avgCost, "USD", 1)}
                </p>
                {(!isThaiAsset && currency === "THB") && (
                  <p className="text-sm text-gray-400 mt-1 font-medium">
                    ≈ {formatMoney(avgCost, "THB", THB_RATE)}
                  </p>
                )}
                {(isThaiAsset && currency === "USD") && (
                  <p className="text-sm text-gray-400 mt-1 font-medium">
                    ≈ {formatMoney(avgCost, "USD", 1 / THB_RATE)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Chart with Time Period Selector */}
          <div className="pt-2">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold text-white">{t("performanceTitle")}</p>
                <Link
                  href={`/portfolio/${asset.symbol}?period=${selectedPeriod}`}
                  className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                  title={t("zoomChart") || "Zoom chart"}
                >
                  <ZoomIn size={14} />
                </Link>
              </div>

              {/* Custom period selector — no "1w" */}
              <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                {PERIODS.map((period) => (
                  <button
                    key={period.key}
                    onClick={() => setSelectedPeriod(period.key)}
                    className={cn(
                      "px-2 py-1 text-[10px] font-black uppercase tracking-wide rounded-md transition-all",
                      selectedPeriod === period.key
                        ? "bg-[#ADC6FF] text-[#00285d]"
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    {t(`period${period.key.toLowerCase()}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[180px] w-full" style={{ minHeight: 180 }}>
              {isLoading ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm font-medium">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ADC6FF] mb-2"></div>
                  <p>{t("loading")}</p>
                </div>
              ) : error && chartData.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm font-medium">
                  <p>{t("noHistoricalData")}</p>
                </div>
              ) : chartData.length > 1 ? (
                <StockChart
                  data={chartData}
                  isPositive={isPositive}
                  period={selectedPeriod}
                  symbol={asset.symbol}
                  language={language}
                  height={180}
                  showGrid={true}
                  showTooltip={true}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm font-medium">
                  <p>{t("noHistoricalData")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Enhanced P/L Details */}
          <div className="bg-[#1C1B1B] p-5 rounded-2xl border border-white/5 space-y-4">
             <div className="flex justify-between items-center">
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-[#4EDEA3]" />
                 <span className="text-xs font-medium text-gray-400">{t("unrealizedPL")}</span>
               </div>
               <span className={cn("text-sm font-bold", (asset.valueUSD - (asset.avgCost || 0) * (asset.shares || 0)) >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                 {formatMoney(asset.valueUSD - (asset.avgCost || 0) * (asset.shares || 0))}
               </span>
             </div>
             <div className="flex justify-between items-center">
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-[#ADC6FF]" />
                 <span className="text-xs font-medium text-gray-400">{t("realizedPL")}</span>
               </div>
               <span className={cn("text-sm font-bold", (asset.realizedPL || 0) >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                 {formatMoney(asset.realizedPL || 0)}
               </span>
             </div>
             <div className="flex justify-between items-center pt-2 border-t border-white/5">
               <span className="text-xs font-medium text-gray-400">{t("totalReturn")}</span>
               <span className="text-sm font-black text-white">
                 {formatMoney((asset.valueUSD - (asset.avgCost || 0) * (asset.shares || 0)) + (asset.realizedPL || 0) + (asset.dividendTotal || 0))}
               </span>
             </div>
             <div className="pt-2">
               <p className="text-[10px] text-gray-600 leading-relaxed italic">
                 * {t("unrealizedPL")}: กำไรหรือขาดทุนจากสินทรัพย์ที่ยังถือครองอยู่ (ยังไม่ได้ขาย)<br/>
                 * {t("realizedPL")}: กำไรหรือขาดทุนที่เกิดขึ้นจริงจากการขายสินทรัพย์ไปแล้ว
               </p>
             </div>
          </div>

          <AssetTradePanel asset={asset} onClose={onClose} />

          <button
            onClick={onClose}
            className="w-full py-4 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { t, formatMoney, assets, language, exchangeRates, currency, removeAsset, updateAsset, allocations, netWorthHistory, totalInvested, totalUnrealizedPL, totalRealizedPL, totalDividends, addAsset, addTrade, fetchAssetMarketData, addToast, reorderAssets } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("1m");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [showSoldAssets, setShowSoldAssets] = useState(false);
  const [isImportCSVOpen, setIsImportCSVOpen] = useState(false);
  const [csvImportStatus, setCsvImportStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const filterRef = React.useRef<HTMLDivElement>(null);

  const totalValue = assets.reduce((acc, curr) => acc + curr.valueUSD, 0);

  // Translate asset class labels
  const assetClassKeyMap: Record<string, string> = {
    Equities: "equities",
    "Fixed Income": "fixedIncome",
    Alternatives: "alternatives",
    Cash: "cash",
  };
  const translateLabel = (label: string) => {
    const key = assetClassKeyMap[label];
    return key ? t(key) : label;
  };

  // Click outside to close filter dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter assets based on active filter
  const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'];
  const filteredAssets = useMemo(() => {
    let result = assets;
    
    // Filter by active status
    if (!showSoldAssets) {
      result = result.filter(a => a.is_active !== false);
    } else {
      // If showing sold, maybe show ONLY sold or both? 
      // User asked "How to know if it's sold", so maybe they want to see them.
      // Let's show both but maybe dim the sold ones.
    }

    if (activeFilter === 'all') return result;
    if (activeFilter === 'favorites') return result.filter(a => a.isFavorite);
    // Category filters
    if (['Equities', 'Fixed Income', 'Alternatives', 'Cash'].includes(activeFilter)) {
      return result.filter(a => (a.allocation || 'Other') === activeFilter);
    }
    // Type filters
    if (activeFilter === 'crypto') return result.filter(a => CRYPTO_SYMBOLS.includes(a.symbol.toUpperCase()));
    if (activeFilter === 'thai') return result.filter(a => a.symbol.toUpperCase().endsWith('.BK') || a.symbol.toUpperCase().endsWith('.TH'));
    if (activeFilter === 'stock') return result.filter(a => !CRYPTO_SYMBOLS.includes(a.symbol.toUpperCase()) && !a.symbol.toUpperCase().endsWith('.BK') && !a.symbol.toUpperCase().endsWith('.TH'));
    return result;
  }, [assets, activeFilter, showSoldAssets]);

  // CSV Export handler
  const handleExportCSV = () => {
    if (assets.length === 0) return;
    const rows = assets.map(a => ({
      symbol: a.symbol,
      name: a.name,
      shares: a.shares || 0,
      avgCost: a.avgCost || 0,
      valueUSD: a.valueUSD,
      change: a.change,
      realizedPL: a.realizedPL || 0,
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fintrack_portfolio_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast(t("csvExportSuccess"), 'success');
  };

  // CSV Import handler
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          let count = 0;
          for (const row of results.data as any[]) {
            const symbol = (row.symbol || row.Symbol || '').toUpperCase().trim();
            const shares = parseFloat(row.shares || row.Shares || row.quantity || row.Quantity || '0');
            const avgCostVal = parseFloat(row.avgCost || row.AvgCost || row.avg_cost || row.cost || '0');
            if (!symbol || shares <= 0) continue;

            try {
              const liveData = await fetchAssetMarketData(symbol);
              const livePrice = liveData?.price || avgCostVal || 0;
              const CRYPTO = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'];
              const autoAllocation = CRYPTO.includes(symbol) ? 'Alternatives'
                : (symbol.endsWith('.BK') || symbol.endsWith('.TH')) ? 'Equities'
                : 'Equities';
              addAsset({
                name: liveData?.name || row.name || row.Name || symbol,
                symbol: symbol,
                valueUSD: livePrice * shares,
                change: liveData?.changePercent || 0,
                allocation: autoAllocation,
                shares: shares,
                avgCost: avgCostVal || livePrice,
                chartData: liveData?.chartData,
              });
              addTrade({
                asset: symbol,
                type: 'BUY' as const,
                amountUSD: avgCostVal * shares,
                date: new Date().toISOString(),
                rateAtTime: exchangeRates[currency],
                currency: currency,
                shares: shares,
                pricePerUnit: avgCostVal,
              });
              count++;
            } catch (err) {
              console.error(`Failed to import ${symbol}:`, err);
            }
          }
          if (count > 0) {
            setCsvImportStatus({ type: 'success', message: `${count} ${t("csvImportedAssets")}` });
            addToast(`${count} ${t("csvImportedAssets")}`, 'success');
            setTimeout(() => { setIsImportCSVOpen(false); setCsvImportStatus({ type: 'idle', message: '' }); }, 1500);
          } else {
            setCsvImportStatus({ type: 'error', message: t("noValidTradesFound") });
          }
        } catch {
          setCsvImportStatus({ type: 'error', message: t("importError") });
        }
      },
      error: () => {
        setCsvImportStatus({ type: 'error', message: t("importError") });
      }
    });
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  // Allocation donut segments
  const CRYPTO_ALLOC = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'];
  const getAutoAllocation = (symbol: string, allocation: string) => {
    const knownCats = ['Equities', 'Fixed Income', 'Alternatives', 'Cash'];
    if (knownCats.includes(allocation)) return allocation;
    // Auto-categorize by symbol
    const sym = symbol.toUpperCase();
    if (CRYPTO_ALLOC.includes(sym)) return 'Alternatives';
    if (sym.endsWith('.BK') || sym.endsWith('.TH')) return 'Equities';
    return 'Equities';
  };

  const allocationSegments = useMemo(() => {
    if (totalValue === 0) return allocations.map(a => ({ label: a.label, pct: a.value, color: a.color }));
    const cats: Record<string, { value: number; color: string }> = {};
    allocations.forEach(a => { cats[a.label] = { value: 0, color: a.color }; });
    assets.forEach(a => {
      const cat = getAutoAllocation(a.symbol, a.allocation || '');
      if (cats[cat]) cats[cat].value += a.valueUSD;
      else cats[cat] = { value: a.valueUSD, color: '#6B7280' };
    });
    return Object.entries(cats).map(([label, { value, color }]) => ({
      label, pct: totalValue > 0 ? (value / totalValue) * 100 : 0, color
    }));
  }, [assets, allocations, totalValue]);

  // Equity curve mini data
  const equityData = useMemo(() => {
    if (netWorthHistory.length < 2) return null;
    const values = netWorthHistory.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const W = 300, H = 60, PAD = 4;
    const points = values.map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
      const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const pathD = `M ${points.join(" L ")}`;
    const areaD = `${pathD} L ${(PAD + (W - PAD * 2)).toFixed(1)},${H} L ${PAD},${H} Z`;
    const isPositive = values[values.length - 1] >= values[0];
    return { pathD, areaD, isPositive, W, H };
  }, [netWorthHistory]);

  const calculateRiskAllocation = () => {
    let high = 0;
    let moderate = 0;
    let conservative = 0;
    const total = totalValue || 1;

    assets.forEach(asset => {
        const symbol = asset.symbol.toUpperCase();
        if (['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'].includes(symbol)) {
            high += asset.valueUSD;
        } else if (['BND', 'TLT', 'USDC', 'GOVT'].includes(symbol)) {
            conservative += asset.valueUSD;
        } else {
            moderate += asset.valueUSD;
        }
    });

    return {
        high: Math.round((high / total) * 100),
        moderate: Math.round((moderate / total) * 100),
        conservative: Math.round((conservative / total) * 100),
    };
  };
  const riskDist = calculateRiskAllocation();

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <section className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <span className="text-[#ADC6FF] uppercase tracking-wide text-xs font-black mb-1 block">{t("portfolio")}</span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-white leading-tight">
            {t("assetInventory")}
          </h1>
        </motion.div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 sm:px-5 py-2.5 sm:py-3 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-xs tracking-tight flex items-center gap-1.5 sm:gap-2 hover:brightness-110 transition-all"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t("addAsset")}</span>
            <span className="sm:hidden">Add</span>
          </button>

          <button
            onClick={() => setIsReorderMode(!isReorderMode)}
            className={cn(
              "px-4 py-2.5 sm:py-3 rounded-full font-black text-xs tracking-tight flex items-center gap-2 transition-all border",
              isReorderMode
                ? "bg-[#E9C349] text-[#00285d] border-[#E9C349]"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
            )}
          >
            <GripVertical size={14} />
            <span className="hidden sm:inline">{isReorderMode ? t("doneDashboard") : t("editAssets")}</span>
          </button>

          {/* Filter Dropdown */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={cn(
                "p-2.5 sm:p-3 border rounded-xl transition-all flex-shrink-0 flex items-center gap-1.5",
                activeFilter !== 'all'
                  ? "bg-[#ADC6FF]/10 border-[#ADC6FF]/30 text-[#ADC6FF]"
                  : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
              )}
            >
              <Filter size={16} />
              {activeFilter !== 'all' && (
                <span className="text-[10px] font-black uppercase hidden sm:inline">
                  {activeFilter === 'crypto' ? t('cryptoType') :
                   activeFilter === 'thai' ? t('thaiStockType') :
                   activeFilter === 'stock' ? t('stockType') :
                   activeFilter === 'favorites' ? t('favorites') || 'Favorites' :
                   translateLabel(activeFilter)}
                </span>
              )}
            </button>
            <AnimatePresence>
              {showFilterDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-52 bg-[#1C1B1B] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-30"
                >
                  <div className="p-1">
                    <button
                      onClick={() => { setActiveFilter('all'); setShowFilterDropdown(false); }}
                      className={cn("w-full px-3 py-2.5 text-left text-xs font-bold rounded-xl transition-colors",
                        activeFilter === 'all' ? 'bg-[#ADC6FF]/10 text-[#ADC6FF]' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      )}
                    >{t('filterAll')}</button>
                    <button
                      onClick={() => { setActiveFilter('favorites'); setShowFilterDropdown(false); }}
                      className={cn("w-full px-3 py-2.5 text-left text-xs font-bold rounded-xl transition-colors mt-1 flex items-center justify-between",
                        activeFilter === 'favorites' ? 'bg-[#E9C349]/10 text-[#E9C349]' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      )}
                    >
                      {t('favorites') || 'Favorites'}
                      <Star size={12} fill={activeFilter === 'favorites' ? 'currentColor' : 'none'} className={activeFilter === 'favorites' ? 'text-[#E9C349]' : 'text-gray-500'} />
                    </button>
                  </div>
                  <div className="px-3 py-1.5">
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t('filterByCategory')}</span>
                  </div>
                  <div className="p-1">
                    {['Equities', 'Fixed Income', 'Alternatives', 'Cash'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => { setActiveFilter(cat); setShowFilterDropdown(false); }}
                        className={cn("w-full px-3 py-2.5 text-left text-xs font-bold rounded-xl transition-colors",
                          activeFilter === cat ? 'bg-[#ADC6FF]/10 text-[#ADC6FF]' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                        )}
                      >{translateLabel(cat)}</button>
                    ))}
                  </div>
                  <div className="px-3 py-1.5">
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{t('filterByType')}</span>
                  </div>
                  <div className="p-1">
                    {[{key: 'stock', label: 'stockType'}, {key: 'crypto', label: 'cryptoType'}, {key: 'thai', label: 'thaiStockType'}].map(f => (
                      <button
                        key={f.key}
                        onClick={() => { setActiveFilter(f.key); setShowFilterDropdown(false); }}
                        className={cn("w-full px-3 py-2.5 text-left text-xs font-bold rounded-xl transition-colors",
                          activeFilter === f.key ? 'bg-[#ADC6FF]/10 text-[#ADC6FF]' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                        )}
                      >{t(f.label)}</button>
                    ))}
                  </div>
                  <div className="px-3 py-1.5 border-t border-white/5 mt-1">
                    <button
                      onClick={() => { setShowSoldAssets(!showSoldAssets); setShowFilterDropdown(false); }}
                      className={cn("w-full px-3 py-2.5 text-left text-xs font-bold rounded-xl transition-colors flex items-center justify-between",
                        showSoldAssets ? 'bg-[#E9C349]/10 text-[#E9C349]' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      )}
                    >
                      <span>{t('showSoldAssets') || "Show Sold Assets"}</span>
                      <div className={cn("w-3 h-3 rounded-full border", showSoldAssets ? "bg-[#E9C349] border-[#E9C349]" : "border-gray-600")} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Import CSV */}
          <button
            onClick={() => setIsImportCSVOpen(true)}
            className="p-2.5 sm:p-3 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white transition-all flex-shrink-0 flex items-center gap-1.5"
            title={t("importCsvPortfolio")}
          >
            <Upload size={16} />
            <span className="text-[10px] font-black uppercase hidden sm:inline">{t("importCsvPortfolio")}</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="p-2.5 sm:p-3 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white transition-all flex-shrink-0 flex items-center gap-1.5"
            title={t("exportCsvPortfolio")}
          >
            <Download size={16} />
            <span className="text-[10px] font-black uppercase hidden sm:inline">{t("exportCsvPortfolio")}</span>
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Enhanced Summary Stats */}
        <div className="lg:col-span-1 space-y-4">
          {/* Portfolio Value Hero */}
          <div className="bg-gradient-to-br from-[#1C1B1B] to-[#0E0E0E] p-4 sm:p-6 rounded-2xl sm:rounded-[1.5rem] border border-white/5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#ADC6FF]/10 blur-3xl rounded-full" />
            <span className="text-xs font-bold text-[#ADC6FF] uppercase tracking-wide block mb-3">{t("portfolioValue")}</span>
            <div className="text-2xl sm:text-3xl font-black text-white mb-2">{formatMoney(totalValue)}</div>
            {/* Mini Equity Curve */}
            {equityData && (
              <div className="h-12 mt-2">
                <svg viewBox={`0 0 ${equityData.W} ${equityData.H}`} className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="port-eq-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={equityData.isPositive ? "#4EDEA3" : "#FFB4AB"} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={equityData.isPositive ? "#4EDEA3" : "#FFB4AB"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <path d={equityData.areaD} fill="url(#port-eq-grad)" />
                  <path d={equityData.pathD} fill="none" stroke={equityData.isPositive ? "#4EDEA3" : "#FFB4AB"} strokeWidth={2} strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>

          {/* P/L Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-[#1C1B1B] p-3 sm:p-4 rounded-2xl border border-white/5">
              <p className="text-[9px] sm:text-[10px] font-black text-[#ADC6FF] uppercase tracking-wide mb-1">{t("totalInvested")}</p>
              <h3 className="text-sm sm:text-lg font-black text-white tracking-tighter">{formatMoney(totalInvested)}</h3>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-[#1C1B1B] p-3 sm:p-4 rounded-2xl border border-white/5">
              <p className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">{t("unrealizedPL")}</p>
              <h3 className={cn("text-sm sm:text-lg font-black tracking-tighter", totalUnrealizedPL >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                {totalUnrealizedPL >= 0 ? "+" : ""}{formatMoney(totalUnrealizedPL)}
              </h3>
              <p className="text-[8px] text-gray-600 mt-1">กำไร/ขาดทุนที่ยังไม่ขาย (ถืออยู่)</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-[#1C1B1B] p-3 sm:p-4 rounded-2xl border border-white/5">
              <p className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-wide mb-1">{t("realizedPL")}</p>
              <h3 className={cn("text-sm sm:text-lg font-black tracking-tighter", totalRealizedPL >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                {totalRealizedPL >= 0 ? "+" : ""}{formatMoney(totalRealizedPL)}
              </h3>
              <p className="text-[8px] text-gray-600 mt-1">กำไร/ขาดทุนที่ขายไปแล้ว (จาก SELL trades)</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-[#1C1B1B] p-3 sm:p-4 rounded-2xl border border-white/5">
              <p className="text-[9px] sm:text-[10px] font-black text-[#E9C349] uppercase tracking-wide mb-1">{t("dividends")}</p>
              <h3 className="text-sm sm:text-lg font-black text-white tracking-tighter">{formatMoney(totalDividends)}</h3>
            </motion.div>
          </div>

          {/* Allocation Donut Chart */}
          <div className="bg-[#1C1B1B] p-4 sm:p-6 rounded-2xl sm:rounded-[1.5rem] border border-white/5">
            <h3 className="text-xs font-bold text-white mb-4 flex items-center gap-2">
              <PieChart size={12} className="text-[#ADC6FF]" />
              {t("assetAllocation")}
            </h3>
            <div className="flex items-center gap-4">
              <svg viewBox="0 0 100 100" className="w-24 h-24 flex-shrink-0">
                {(() => {
                  let cumPct = 0;
                  const R = 40, C = 50;
                  return allocationSegments.map((seg, i) => {
                    const pct = Math.max(seg.pct, 0.5);
                    const startAngle = cumPct * 3.6;
                    cumPct += pct;
                    const endAngle = cumPct * 3.6;
                    const largeArc = pct > 50 ? 1 : 0;
                    const startRad = ((startAngle - 90) * Math.PI) / 180;
                    const endRad = ((endAngle - 90) * Math.PI) / 180;
                    const x1 = C + R * Math.cos(startRad);
                    const y1 = C + R * Math.sin(startRad);
                    const x2 = C + R * Math.cos(endRad);
                    const y2 = C + R * Math.sin(endRad);
                    return (
                      <path
                        key={i}
                        d={`M ${C.toFixed(1)} ${C.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`}
                        fill={seg.color}
                        stroke="#0E0E0E"
                        strokeWidth={1}
                      />
                    );
                  });
                })()}
                <circle cx={50} cy={50} r={22} fill="#1C1B1B" />
                <text x={50} y={50} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="12" fontWeight="bold">
                  {assets.length}
                </text>
              </svg>
              <div className="space-y-1.5 flex-1">
                {allocationSegments.map((seg, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="text-[10px] text-gray-400 font-medium">{translateLabel(seg.label)}</span>
                    </div>
                    <span className="text-[10px] text-white font-bold">{seg.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Risk Allocation */}
          <div className="bg-[#1C1B1B] p-4 sm:p-6 rounded-2xl sm:rounded-[1.5rem] border border-white/5">
            <h3 className="text-xs font-bold text-white mb-4">{t("allocationByRisk")}</h3>
            <div className="space-y-3">
              <RiskItem label={t("highRisk")} value={riskDist.high} color="#FFB4AB" />
              <RiskItem label={t("moderateRisk")} value={riskDist.moderate} color="#E9C349" />
              <RiskItem label={t("conservativeRisk")} value={riskDist.conservative} color="#4EDEA3" />
            </div>
          </div>
        </div>

        {/* Assets Table */}
        <div className="lg:col-span-2">
          <div className="bg-[#1C1B1B] rounded-2xl sm:rounded-[1.5rem] border border-white/5 shadow-xl overflow-x-auto">
            <table className="w-full text-left table-fixed min-w-[500px] sm:min-w-[800px]">
              <thead>
                <tr className="text-[10px] sm:text-xs font-black uppercase tracking-wide text-gray-500 border-b border-white/5 whitespace-nowrap">
                  <th className="pl-4 sm:pl-8 pr-2 sm:pr-3 py-3 sm:py-4 w-[35%] sm:w-[25%]">{t("asset")}</th>
                  <th className="px-2 sm:px-3 py-3 sm:py-4 w-[30%] sm:w-[20%] text-left">{t("marketPriceAndCost")}</th>
                  <th className="px-2 sm:px-3 py-3 sm:py-4 w-[14%] hidden sm:table-cell">{t("holdings")}</th>
                  <th className="px-2 sm:px-3 py-3 sm:py-4 text-right w-[14%] hidden lg:table-cell">{t("unrealizedPL")}</th>
                  <th className="px-2 sm:px-3 py-3 sm:py-4 text-right w-[12%] hidden lg:table-cell">{t("realizedPL")}</th>
                  <th className="px-2 sm:px-3 py-3 sm:py-4 text-right w-[20%] sm:w-[10%]">{t("totalReturn")}</th>
                  <th className="px-2 sm:px-3 py-3 sm:py-4 text-center w-[15%] sm:w-[5%]"></th>
                </tr>
              </thead>
              <Reorder.Group
                as="tbody"
                axis="y"
                values={filteredAssets}
                onReorder={(newOrder) => {
                  reorderAssets(newOrder);
                }}
                className="divide-y divide-white/5"
              >
                {filteredAssets.map((asset, i) => {
                  const shares = asset.shares || 0;
                  const livePrice = asset.currentPrice || (shares > 0 ? (asset.valueUSD / shares) : 0);
                  const avgCost = asset.avgCost || livePrice;
                  const totalCost = avgCost * shares;
                  const profit = asset.valueUSD - totalCost;
                  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;
                  const isProfit = profit >= 0;
                  const isThaiAsset = asset.symbol.toUpperCase().endsWith('.BK') || asset.symbol.toUpperCase().endsWith('.TH');
                  const THB_RATE = exchangeRates["THB"] || 36.5;

                  return (
                    <Reorder.Item
                      key={asset.symbol + i}
                      value={asset}
                      dragListener={isReorderMode}
                      as="tr"
                      className={cn(
                        "hover:bg-white/5 transition-colors group cursor-pointer",
                        isReorderMode && "cursor-grab active:cursor-grabbing"
                      )}
                    >
                      <td className="pl-4 sm:pl-8 pr-2 sm:pr-3 py-3 sm:py-4 max-w-[100px] sm:max-w-[200px]" onClick={() => { if (!isReorderMode) { setSelectedAsset(asset); setIsDetailModalOpen(true); } }}>
                        <div className="flex items-center gap-2 sm:gap-3">
                          {isReorderMode && (
                            <div className="text-gray-600">
                              <GripVertical size={14} />
                            </div>
                          )}
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-black text-[#ADC6FF] relative overflow-hidden group border border-white/5 shadow-xl flex-shrink-0">
                            <AssetLogo symbol={asset.symbol} name={asset.name} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-white truncate">{asset.name}</div>
                            <div className="text-[10px] text-gray-500 font-medium">{shares.toLocaleString('en-US', { maximumFractionDigits: 4 })} {t("holdings")}</div>
                            <div className="text-[10px] sm:text-xs text-gray-500 font-medium uppercase tracking-wide">{asset.symbol}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-3 py-3 sm:py-4" onClick={() => { if (!isReorderMode) { setSelectedAsset(asset); setIsDetailModalOpen(true); } }}>
                        <div className="flex flex-col gap-1">
                          <div className="text-xs sm:text-sm font-bold text-white whitespace-nowrap">
                            {isThaiAsset ? formatMoney(livePrice, "THB", THB_RATE) : formatMoney(livePrice, "USD", 1)}
                          </div>
                          <div className="text-[10px] text-gray-500 font-medium whitespace-nowrap">
                            {t("avgCost")}: {isThaiAsset ? formatMoney(avgCost, "THB", THB_RATE) : formatMoney(avgCost, "USD", 1)}
                          </div>
                        </div>
                        {(!isThaiAsset && currency === "THB") && <span className="text-[10px] text-gray-500 font-medium block sm:hidden">≈ {formatMoney(livePrice, "THB", THB_RATE)}</span>}
                        {(isThaiAsset && currency === "USD") && <span className="text-[10px] text-gray-500 font-medium block sm:hidden">≈ {formatMoney(livePrice, "USD", 1 / THB_RATE)}</span>}
                      </td>
                      <td className="px-2 sm:px-3 py-3 sm:py-4 hidden sm:table-cell" onClick={() => { if (!isReorderMode) { setSelectedAsset(asset); setIsDetailModalOpen(true); } }}>
                        <div className="text-xs sm:text-sm font-bold text-white">
                          {isThaiAsset ? formatMoney(asset.valueUSD, "THB", THB_RATE) : formatMoney(asset.valueUSD, "USD", 1)}
                          {(!isThaiAsset && currency === "THB") && <span className="text-[10px] text-gray-500 ml-1 font-normal hidden lg:inline">≈ {formatMoney(asset.valueUSD, "THB", THB_RATE)}</span>}
                          {(isThaiAsset && currency === "USD") && <span className="text-[10px] text-gray-500 ml-1 font-normal hidden lg:inline">≈ {formatMoney(asset.valueUSD, "USD", 1 / THB_RATE)}</span>}
                        </div>
                      </td>
                      <td className="px-2 sm:px-3 py-3 sm:py-4 text-right hidden lg:table-cell" onClick={() => { if (!isReorderMode) { setSelectedAsset(asset); setIsDetailModalOpen(true); } }}>
                        <div className="flex flex-col items-end">
                          <div className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-black",
                            profit >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                          )}>
                            {profit >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                            {Math.abs(profitPercent).toFixed(2)}%
                          </div>
                          <div className={cn(
                            "text-[10px] font-medium mt-0.5",
                            profit >= 0 ? "text-[#4EDEA3]/70" : "text-[#FFB4AB]/70"
                          )}>
                            {profit >= 0 ? "+" : ""}{isThaiAsset ? formatMoney(profit, "THB", THB_RATE) : formatMoney(profit, "USD", 1)}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-3 py-3 sm:py-4 text-right hidden lg:table-cell" onClick={() => { if (!isReorderMode) { setSelectedAsset(asset); setIsDetailModalOpen(true); } }}>
                        <div className="flex flex-col items-end">
                          <div className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-black",
                            (asset.realizedPL || 0) >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                          )}>
                            {(asset.realizedPL || 0) >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                            {formatMoney(Math.abs(asset.realizedPL || 0))}
                          </div>
                          <div className="text-[10px] text-gray-500 font-medium mt-0.5">{t("realized")}</div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-3 py-3 sm:py-4 text-right">
                        <div className="flex flex-col items-end gap-2">
                          {asset.avgCost ? (
                            <div className="flex flex-col items-end">
                              <div className={cn(
                                "inline-flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs font-black",
                                isProfit ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                              )}>
                                {isProfit ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                {Math.abs(profitPercent).toFixed(2)}%
                              </div>
                              <div className={cn(
                                "text-[10px] font-medium mt-0.5",
                                isProfit ? "text-[#4EDEA3]/70" : "text-[#FFB4AB]/70"
                              )}>
                                {isProfit ? "+" : ""}{isThaiAsset ? formatMoney(profit, "THB", THB_RATE) : formatMoney(profit, "USD", 1)}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end">
                              <div className={cn(
                                "inline-flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs font-black",
                                asset.change >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                              )}>
                                {asset.change >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                {Math.abs(asset.change)}%
                              </div>
                              <div className="text-[10px] text-gray-500 font-medium mt-0.5">24h</div>
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Favorite + Delete Column */}
                      <td className="px-2 sm:px-3 py-3 sm:py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {/* Delete Button - Only in reorder mode */}
                          {isReorderMode && (
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const btn = e.currentTarget;
                                  btn.nextElementSibling?.classList.toggle('opacity-0');
                                  btn.nextElementSibling?.classList.toggle('pointer-events-auto');
                                  btn.nextElementSibling?.classList.toggle('pointer-events-none');
                                }}
                                className="p-1.5 text-[#FFB4AB] hover:bg-[#FFB4AB]/10 rounded-lg transition-all"
                                title={t("delete") || "Delete"}
                              >
                                <Trash2 size={14} />
                              </button>
                              <div className="absolute right-0 top-full mt-1 opacity-0 pointer-events-none transition-opacity duration-150 z-50">
                                <div className="bg-[#1C1B1B] border border-[#FFB4AB]/30 rounded-xl shadow-xl overflow-hidden">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`${t("confirmDelete")} ${asset.symbol}?`)) {
                                        removeAsset(asset.symbol);
                                      }
                                    }}
                                    className="px-3 py-2 text-xs font-bold text-[#FFB4AB] hover:bg-[#FFB4AB]/10 whitespace-nowrap"
                                  >
                                    {t("confirmDeleteAsset") || "Delete asset"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                          {/* Favorite Button - Always visible */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateAsset(asset.symbol, { isFavorite: !asset.isFavorite });
                            }}
                            className={cn(
                              "p-1.5 rounded-lg transition-all",
                              asset.isFavorite ? "text-[#E9C349] bg-[#E9C349]/10" : "text-gray-600 hover:text-gray-400 hover:bg-white/5"
                            )}
                            title={asset.isFavorite ? "Remove from favorites" : "Add to favorites"}
                          >
                            <motion.div whileTap={{ scale: 0.8 }}>
                              <Star
                                size={14}
                                fill={asset.isFavorite ? "currentColor" : "none"}
                                className="w-3.5 h-3.5"
                              />
                            </motion.div>
                          </button>
                        </div>
                      </td>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </table>
          </div>
        </div>
      </div>

      {/* Add Asset Modal (shared component) */}
      <AddAssetModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Asset Detail Modal */}
      <AssetDetailModal
        asset={selectedAsset}
        isOpen={isDetailModalOpen}
        onClose={() => { setIsDetailModalOpen(false); }}
        initialPeriod={selectedPeriod}
      />

      {/* Edit Asset Modal */}
      <EditAssetModal
        asset={selectedAsset}
        isOpen={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); }}
        onDelete={(symbol) => {
          removeAsset(symbol);
          setIsEditModalOpen(false);
        }}
      />

      {/* CSV Import Modal */}
      <Modal isOpen={isImportCSVOpen} onClose={() => { setIsImportCSVOpen(false); setCsvImportStatus({ type: 'idle', message: '' }); }} title={t("importCsvPortfolio")}>
        <div className="space-y-6">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-xs text-gray-400 font-medium mb-3">{t("csvImportInstructions")}</p>
            <div className="bg-[#0E0E0E] p-3 rounded-xl font-mono text-[11px] text-gray-500 leading-relaxed">
              symbol,shares,avgCost<br/>
              AAPL,10,150.00<br/>
              BTC,0.5,42000.00<br/>
              PTT.BK,100,35.50
            </div>
          </div>

          <label className="flex flex-col items-center justify-center gap-3 py-8 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-[#ADC6FF]/30 hover:bg-white/5 transition-all group">
            <Upload size={28} className="text-gray-600 group-hover:text-[#ADC6FF] transition-colors" />
            <span className="text-sm font-bold text-gray-500 group-hover:text-white transition-colors">
              {t("selectFile")}
            </span>
            <span className="text-[10px] text-gray-600">.csv</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
          </label>

          {csvImportStatus.type !== 'idle' && (
            <div className={cn(
              "px-4 py-3 rounded-xl text-xs font-bold",
              csvImportStatus.type === 'success' ? 'bg-[#4EDEA3]/10 text-[#4EDEA3] border border-[#4EDEA3]/20' : 'bg-[#FFB4AB]/10 text-[#FFB4AB] border border-[#FFB4AB]/20'
            )}>
              {csvImportStatus.message}
            </div>
          )}

          <button
            onClick={() => { setIsImportCSVOpen(false); setCsvImportStatus({ type: 'idle', message: '' }); }}
            className="w-full py-4 bg-white/5 border border-white/10 text-white rounded-full font-black text-sm uppercase tracking-tight hover:bg-white/10 transition-all"
          >
            {t("close")}
          </button>
        </div>
      </Modal>
    </div>
  );
}


function RiskItem({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-black uppercase tracking-wide text-gray-500 mb-2">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}