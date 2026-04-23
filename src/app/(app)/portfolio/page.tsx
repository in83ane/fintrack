"use client";

import React, { useState, useEffect } from "react";
import { Wallet, ArrowUpRight, ArrowDownRight, Filter, Upload, Plus, X, ZoomIn, Trash2 } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { useApp, Asset } from "@/src/context/AppContext";
import { Modal } from "@/src/components/Modal";
import { AddAssetModal } from "@/src/components/AddAssetModal";
import { cn } from "@/src/lib/utils";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { StockChart, fetchChartData, TimePeriod } from "@/src/components/StockChart";

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
  const livePrice = shares > 0 ? (asset.valueUSD / shares) : 0;
  const avgCost = asset.avgCost || livePrice;
  const isPositive = asset.change >= 0;
  const isThaiAsset = asset.symbol.toUpperCase().endsWith('.BK') || asset.symbol.toUpperCase().endsWith('.TH');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="">
      <div className="p-8 pb-0">
        <div className="flex items-center gap-4 border-b border-white/5 pb-6">
          <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center relative overflow-hidden flex-shrink-0 border border-white/5 shadow-xl">
             <AssetLogo symbol={asset.symbol} name={asset.name} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-white">{asset.name}</h3>
            <p className="text-gray-500 font-medium">{asset.symbol}</p>
          </div>
        </div>
      </div>

      <div className="p-8 overflow-y-auto">
        <div className="space-y-6">
          {/* Live Price and Avg Cost */}
          <div className="grid grid-cols-2 gap-4">
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

          <button
            onClick={onClose}
            className="w-full py-4 mt-2 bg-white/5 border border-white/10 text-white rounded-full font-black text-sm uppercase tracking-tight hover:bg-white/10 transition-all"
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
  const { t, formatMoney, assets, language, exchangeRates, currency, removeAsset } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("1m");

  const totalValue = assets.reduce((acc, curr) => acc + curr.valueUSD, 0);

  const calculateRiskAllocation = () => {
    let high = 0;
    let moderate = 0;
    let conservative = 0;
    const total = totalValue || 1; // avoid / 0

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
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <section className="flex flex-col md:flex-row justify-between items-end gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <span className="text-[#ADC6FF] uppercase tracking-wide text-xs font-black mb-1 block">{t("portfolio")}</span>
          <h1 className="text-3xl font-black tracking-tighter text-white leading-tight">
            {t("assetInventory")}
          </h1>
        </motion.div>

        <div className="flex gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-3 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-xs tracking-tight flex items-center gap-2 hover:brightness-110 transition-all"
          >
            <Plus size={16} />
            {t("addAsset")}
          </button>
          <button className="p-3 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white transition-all">
            <Filter size={18} />
          </button>
          <button className="p-3 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white transition-all">
            <Upload size={18} />
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Summary Stats */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-gradient-to-br from-[#1C1B1B] to-[#0E0E0E] p-6 rounded-[1.5rem] border border-white/5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#ADC6FF]/10 blur-3xl rounded-full" />
            <span className="text-sm font-bold text-[#ADC6FF] uppercase tracking-wide block mb-3">{t("totalNetWorth")}</span>
            <div className="text-3xl font-black text-white mb-1">{formatMoney(totalValue)}</div>
            <div className="flex items-center gap-2 text-[#4EDEA3] text-xs font-bold">
              <ArrowUpRight size={14} />
              <span>+12.4% this year</span>
            </div>
          </div>

          <div className="bg-[#1C1B1B] p-6 rounded-[1.5rem] border border-white/5">
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
          <div className="bg-[#1C1B1B] rounded-[1.5rem] border border-white/5 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[750px]">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-wide text-gray-500 border-b border-white/5">
                    <th className="px-6 py-4 w-[20%]">{t("asset")}</th>
                    <th className="px-6 py-4 w-[22%]">{t("marketPriceAndCost")}</th>
                    <th className="px-6 py-4 w-[20%]">{t("holdings")}</th>
                    <th className="px-6 py-4 w-[25%]">{t("intradayTrend") || "Intraday Trend"}</th>
                    <th className="px-6 py-4 text-right w-[13%]">{t("totalReturn")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {assets.map((asset, i) => {
                    const intradayData = asset.intradayData || [];
                    const hasIntradayData = intradayData.length > 1;
                    const shares = asset.shares || 0;
                    const livePrice = shares > 0 ? (asset.valueUSD / shares) : 0;
                    const avgCost = asset.avgCost || livePrice;
                    const totalCost = avgCost * shares;
                    const profit = asset.valueUSD - totalCost;
                    const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;
                    const isProfit = profit >= 0;
                    const isThaiAsset = asset.symbol.toUpperCase().endsWith('.BK') || asset.symbol.toUpperCase().endsWith('.TH');
                    const THB_RATE = exchangeRates["THB"] || 36.5;

                    return (
                      <motion.tr
                        key={asset.symbol + i}
                        onClick={() => { setSelectedAsset(asset); setIsDetailModalOpen(true); }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="hover:bg-white/5 transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-black text-[#ADC6FF] relative overflow-hidden group border border-white/5 shadow-xl">
                              <AssetLogo symbol={asset.symbol} name={asset.name} />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white">{asset.name}</div>
                              <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{asset.symbol}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-white">
                            {isThaiAsset ? formatMoney(livePrice, "THB", THB_RATE) : formatMoney(livePrice, "USD", 1)}
                            {(!isThaiAsset && currency === "THB") && <span className="text-[10px] text-gray-500 ml-1 font-normal">≈ {formatMoney(livePrice, "THB", THB_RATE)}</span>}
                            {(isThaiAsset && currency === "USD") && <span className="text-[10px] text-gray-500 ml-1 font-normal">≈ {formatMoney(livePrice, "USD", 1 / THB_RATE)}</span>}
                          </div>
                          <div className="text-[10px] text-gray-500 font-medium">
                            {t("avgCost")} {isThaiAsset ? formatMoney(avgCost, "THB", THB_RATE) : formatMoney(avgCost, "USD", 1)}
                            {(!isThaiAsset && currency === "THB") && <span className="ml-1 opacity-70">≈ {formatMoney(avgCost, "THB", THB_RATE)}</span>}
                            {(isThaiAsset && currency === "USD") && <span className="ml-1 opacity-70">≈ {formatMoney(avgCost, "USD", 1 / THB_RATE)}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-white">
                            {isThaiAsset ? formatMoney(asset.valueUSD, "THB", THB_RATE) : formatMoney(asset.valueUSD, "USD", 1)}
                            {(!isThaiAsset && currency === "THB") && <span className="text-[10px] text-gray-500 ml-1 font-normal">≈ {formatMoney(asset.valueUSD, "THB", THB_RATE)}</span>}
                            {(isThaiAsset && currency === "USD") && <span className="text-[10px] text-gray-500 ml-1 font-normal">≈ {formatMoney(asset.valueUSD, "USD", 1 / THB_RATE)}</span>}
                          </div>
                          <div className="text-[10px] text-gray-500 font-medium">{shares.toLocaleString('en-US', { maximumFractionDigits: 4 })} {t("holdings")}</div>
                        </td>
                        <td className="px-6 py-2">
                          <div className="h-[50px] w-full" style={{ minHeight: 50 }}>
                            {hasIntradayData ? (
                              <SparklineChart
                                data={intradayData}
                                isPositive={asset.change >= 0}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="w-full h-[1px] bg-gray-600" />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-4">
                            {asset.avgCost ? (
                              <div className="flex flex-col items-end">
                                <div className={cn(
                                  "inline-flex items-center gap-1 text-xs font-black",
                                  isProfit ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                                )}>
                                  {isProfit ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                  {Math.abs(profitPercent).toFixed(2)}%
                                </div>
                                <div className={cn(
                                  "text-[10px] font-medium mt-0.5",
                                  isProfit ? "text-[#4EDEA3]/70" : "text-[#FFB4AB]/70"
                                )}>
                                  {isProfit ? "+" : ""}{isThaiAsset ? formatMoney(profit, "THB", THB_RATE) : formatMoney(profit, "USD", 1)}
                                  {(!isThaiAsset && currency === "THB") && <span className="block mt-0.5 opacity-60">≈ {isProfit ? "+" : ""}{formatMoney(profit, "THB", THB_RATE)}</span>}
                                  {(isThaiAsset && currency === "USD") && <span className="block mt-0.5 opacity-60">≈ {isProfit ? "+" : ""}{formatMoney(profit, "USD", 1 / THB_RATE)}</span>}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <div className={cn(
                                  "inline-flex items-center gap-1 text-xs font-black",
                                  asset.change >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                                )}>
                                  {asset.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                  {Math.abs(asset.change)}%
                                </div>
                                <div className="text-[10px] text-gray-500 font-medium mt-0.5">24h</div>
                              </div>
                            )}
                            
                            <button
                              onClick={(e) => { e.stopPropagation(); if (confirm(`${t("confirmDelete")} ${asset.symbol}?`)) removeAsset(asset.symbol); }}
                              className="p-2 text-gray-500 hover:text-[#FFB4AB] hover:bg-[#FFB4AB]/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title={t("deleteAsset")}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
    </div>
  );
}

// ─── Sub Components ───────────────────────────────────────────────────────────

function SparklineChart({ data, isPositive }: { data: { time: number; price: number }[]; isPositive: boolean }) {
  if (!data || data.length < 2) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-full h-[1px] bg-gray-600" />
      </div>
    );
  }

  const sortedData = [...data].sort((a, b) => a.time - b.time);

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={50}>
      <LineChart data={sortedData}>
        <Line
          type="monotone"
          dataKey="price"
          stroke={isPositive ? "#4EDEA3" : "#FFB4AB"}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
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