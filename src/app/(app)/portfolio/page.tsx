"use client";

import React, { useState } from "react";
import { Wallet, ArrowUpRight, ArrowDownRight, Filter, Upload, Plus, X, ZoomIn } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useApp, Asset } from "@/src/context/AppContext";
import { Modal } from "@/src/components/Modal";
import { cn } from "@/src/lib/utils";
import { VerticalTimeline, TimelineItem } from "@/src/components/VerticalTimeline";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

type TimePeriod = "1d" | "5d" | "1w" | "1m" | "6m" | "ytd" | "1y" | "5y";

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

// Helper to filter chart data by time period
function filterChartDataByPeriod(chartData: {time: number, price: number}[] | undefined, period: TimePeriod): {time: number, price: number}[] {
  if (!chartData || chartData.length === 0) return [];

  const now = Date.now();
  const nowDate = new Date(now);

  // Sort data by time ascending
  const sortedData = [...chartData].sort((a, b) => a.time - b.time);
  const oldestDataTime = sortedData[0]?.time || now;
  const newestDataTime = sortedData[sortedData.length - 1]?.time || now;

  switch (period) {
    case "1d": {
      // Get today's start timestamp (00:00:00)
      const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
      const todayEnd = todayStart + 24 * 60 * 60 * 1000;

      // Filter data for today only
      const todayData = sortedData.filter(d => d.time >= todayStart && d.time < todayEnd);

      // If no data for today OR only 1 data point (market not started), use the most recent day's data
      if (todayData.length <= 1) {
        // Find the most recent day that has data
        const mostRecentTimestamp = sortedData[sortedData.length - 1]?.time;
        if (mostRecentTimestamp) {
          const mostRecentDate = new Date(mostRecentTimestamp);
          const mostRecentStart = new Date(mostRecentDate.getFullYear(), mostRecentDate.getMonth(), mostRecentDate.getDate()).getTime();
          const mostRecentEnd = mostRecentStart + 24 * 60 * 60 * 1000;
          const previousDayData = sortedData.filter(d => d.time >= mostRecentStart && d.time < mostRecentEnd);
          // Only return previous day data if it has more than 1 point
          if (previousDayData.length > 1) {
            return previousDayData;
          }
        }
      }
      return todayData;
    }
    case "1w": {
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
      // If data doesn't go back that far, use all available data
      if (oldestDataTime > oneWeekAgo) {
        return sortedData;
      }
      return sortedData.filter(d => d.time >= oneWeekAgo);
    }
    case "1m": {
      const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
      if (oldestDataTime > oneMonthAgo) {
        return sortedData;
      }
      return sortedData.filter(d => d.time >= oneMonthAgo);
    }
    case "6m": {
      const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
      if (oldestDataTime > sixMonthsAgo) {
        return sortedData;
      }
      return sortedData.filter(d => d.time >= sixMonthsAgo);
    }
    case "ytd": {
      const yearStart = new Date(nowDate.getFullYear(), 0, 1).getTime();
      if (oldestDataTime > yearStart) {
        return sortedData;
      }
      return sortedData.filter(d => d.time >= yearStart);
    }
    case "1y": {
      const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
      if (oldestDataTime > oneYearAgo) {
        return sortedData;
      }
      return sortedData.filter(d => d.time >= oneYearAgo);
    }
    case "5y": {
      const fiveYearsAgo = now - 5 * 365 * 24 * 60 * 60 * 1000;
      // For 5y, if data doesn't go back that far, just use all available data
      if (oldestDataTime > fiveYearsAgo) {
        return sortedData;
      }
      return sortedData.filter(d => d.time >= fiveYearsAgo);
    }
    default:
      return sortedData;
  }
}

export default function PortfolioPage() {
  const { t, formatMoney, assets, addAsset, fetchAssetMarketData } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("1m");
  const [newAsset, setNewAsset] = useState<Partial<Asset>>({ symbol: "", shares: 0, avgCost: 0, name: "" });
  const [isAdding, setIsAdding] = useState(false);
  const [searchResults, setSearchResults] = useState<{symbol: string, name: string, exchange: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSymbolSearch = async (val: string) => {
    setNewAsset({ ...newAsset, symbol: val.toUpperCase() });
    if (val.length >= 2) {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${val}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (e) {}
      setIsSearching(false);
    } else {
      setSearchResults([]);
    }
  };

  const selectSearchResult = (symbol: string, name: string) => {
    setNewAsset({ ...newAsset, symbol, name });
    setSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAsset.symbol && newAsset.shares && newAsset.avgCost) {
      setIsAdding(true);
      try {
        const liveData = await fetchAssetMarketData(newAsset.symbol.toUpperCase());
        const livePrice = liveData?.price || newAsset.avgCost || 0;
        const totalValue = livePrice * (newAsset.shares || 0);

        addAsset({
          name: liveData?.name || newAsset.symbol.toUpperCase(),
          symbol: newAsset.symbol.toUpperCase(),
          valueUSD: totalValue,
          change: liveData?.changePercent || 0,
          allocation: "0%",
          shares: Number(newAsset.shares),
          avgCost: Number(newAsset.avgCost),
          chartData: liveData?.chartData
        });
        setIsModalOpen(false);
        setNewAsset({ symbol: "", shares: 0, avgCost: 0 });
      } catch (err) {
        console.error("Failed to add asset", err);
      } finally {
        setIsAdding(false);
      }
    }
  };

  const totalValue = assets.reduce((acc, curr) => acc + curr.valueUSD, 0);

  const periods: { key: TimePeriod; label: string }[] = [
    { key: "1d", label: t("chart_1d") },
    { key: "1w", label: t("chart_1w") },
    { key: "1m", label: t("chart_1m") },
    { key: "6m", label: t("chart_6m") },
    { key: "ytd", label: t("chart_ytd") },
    { key: "1y", label: t("chart_1y") },
    { key: "5y", label: t("chart_5y") },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <section className="flex flex-col md:flex-row justify-between items-end gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <span className="text-[#ADC6FF] uppercase tracking-wide text-xs font-black mb-1 block">{t("portfolio")}</span>
          <h1 className="text-3xl font-black tracking-tighter text-white leading-tight">
            {t("asset_inventory")}
          </h1>
        </motion.div>

        <div className="flex gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-3 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-xs tracking-tight flex items-center gap-2 hover:brightness-110 transition-all"
          >
            <Plus size={16} />
            {t("add_asset")}
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
            <span className="text-sm font-bold text-[#ADC6FF] uppercase tracking-wide block mb-3">{t("total_net_worth")}</span>
            <div className="text-3xl font-black text-white mb-1">{formatMoney(totalValue)}</div>
            <div className="flex items-center gap-2 text-[#4EDEA3] text-xs font-bold">
              <ArrowUpRight size={14} />
              <span>+12.4% this year</span>
            </div>
          </div>

          <div className="bg-[#1C1B1B] p-6 rounded-[1.5rem] border border-white/5">
            <h3 className="text-xs font-bold text-white mb-4">{t("allocation_by_risk")}</h3>
            <div className="space-y-3">
              <RiskItem label={t("high_risk")} value={45} color="#FFB4AB" />
              <RiskItem label={t("moderate_risk")} value={35} color="#E9C349" />
              <RiskItem label={t("conservative_risk")} value={20} color="#4EDEA3" />
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
                    <th className="px-6 py-4 w-[22%]">{t("market_price_and_cost")}</th>
                    <th className="px-6 py-4 w-[20%]">{t("holdings")}</th>
                    <th className="px-6 py-4 w-[25%]">{t("intraday_trend") || "Intraday Trend"}</th>
                    <th className="px-6 py-4 text-right w-[13%]">{t("total_return")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {assets.map((asset, i) => {
                    // Use intradayData directly from API (30m intervals for 1 day)
                    const intradayData = asset.intradayData || [];
                    const hasIntradayData = intradayData.length > 1;
                    const shares = asset.shares || 0;
                    const livePrice = shares > 0 ? (asset.valueUSD / shares) : 0;
                    const avgCost = asset.avgCost || livePrice;
                    const totalCost = avgCost * shares;
                    const profit = asset.valueUSD - totalCost;
                    const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;
                    const isProfit = profit >= 0;

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
                        <div className="text-xs font-bold text-white">{formatMoney(livePrice)}</div>
                        <div className="text-[10px] text-gray-500 font-medium">{t("avg_cost")} {formatMoney(avgCost)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-white">{formatMoney(asset.valueUSD)}</div>
                        <div className="text-[10px] text-gray-500 font-medium">{shares.toLocaleString('en-US', { maximumFractionDigits: 4 })} {t("holdings")}</div>
                      </td>
                      <td className="px-6 py-2">
                        <div className="h-[50px] w-full">
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
                              {isProfit ? "+" : ""}{formatMoney(profit)}
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

      {/* Add Asset Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t("add_asset")}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2 relative">
            <label className="text-xs font-black text-gray-500 uppercase tracking-wide">Symbol</label>
            <input
              autoFocus
              type="text"
              placeholder="e.g. NVDA, GOOGL, META"
              value={newAsset.symbol}
              onChange={(e) => handleSymbolSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-[#ADC6FF]/50 transition-all uppercase placeholder:normal-case"
            />
            {isSearching && <div className="absolute right-4 top-10 text-xs text-gray-500">Searching...</div>}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1C1B1B] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                {searchResults.map((res, i) => (
                  <div
                    key={res.symbol + i}
                    onClick={() => selectSearchResult(res.symbol, res.name)}
                    className="px-4 py-3 hover:bg-white/5 cursor-pointer flex justify-between items-center transition-colors border-b border-white/5 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-bold text-white">{res.symbol}</div>
                      <div className="text-xs text-gray-500">{res.name}</div>
                    </div>
                    <div className="text-[10px] bg-white/10 px-2 py-1 rounded-sm text-gray-400 font-bold">{res.exchange}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wide">{t("holdings")}</label>
              <input
                type="number"
                step="any"
                placeholder="0.5"
                value={newAsset.shares || ''}
                onChange={(e) => setNewAsset({ ...newAsset, shares: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-[#ADC6FF]/50 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wide">{t("avg_cost")} (USD)</label>
              <input
                type="number"
                step="any"
                placeholder="150.00"
                value={newAsset.avgCost || ''}
                onChange={(e) => setNewAsset({ ...newAsset, avgCost: Number(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-[#ADC6FF]/50 transition-all"
              />
            </div>
          </div>
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isAdding}
              className="flex-1 py-4 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all disabled:opacity-50"
            >
              {isAdding ? "Fetching..." : t("add_asset")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Asset Detail Modal */}
      {isDetailModalOpen && selectedAsset && (
      <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)}>
        <div className="p-8 pb-0">
          <div className="flex items-center gap-4 border-b border-white/5 pb-6">
            <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center relative overflow-hidden flex-shrink-0 border border-white/5 shadow-xl">
               <AssetLogo symbol={selectedAsset.symbol} name={selectedAsset.name} />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white">{selectedAsset.name}</h3>
              <p className="text-gray-500 font-medium">{selectedAsset.symbol}</p>
            </div>
          </div>
        </div>

        <div className="p-8 overflow-y-auto">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#1C1B1B] p-4 rounded-2xl border border-white/5">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">{t("live_price")}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-white">
                    {formatMoney(selectedAsset.shares ? (selectedAsset.valueUSD / selectedAsset.shares) : 0)}
                  </p>
                  <p className={cn("text-sm font-bold", selectedAsset.change >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {selectedAsset.change >= 0 ? '+' : ''}{selectedAsset.change.toFixed(2)}%
                  </p>
                </div>
              </div>
              <div className="bg-[#1C1B1B] p-4 rounded-2xl border border-white/5">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">{t("avg_cost")}</p>
                <p className="text-2xl font-bold text-white">
                  {formatMoney(selectedAsset.avgCost || 0)}
                </p>
              </div>
            </div>

            {/* Chart with Time Period Selector */}
            <div className="pt-2">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold text-white">{t("performance_title")}</p>
                  <Link
                    href={`/portfolio/${selectedAsset.symbol}?period=${selectedPeriod}`}
                    className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                    title={t("zoom_chart") || "Zoom chart"}
                  >
                    <ZoomIn size={14} />
                  </Link>
                </div>
                <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                  {periods.map((period) => (
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
                      {period.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[180px] w-full bg-[#1C1B1B] rounded-2xl border border-white/5 p-4">
                {(() => {
                  const filteredData = filterChartDataByPeriod(selectedAsset.chartData, selectedPeriod);
                  const dataToShow = filteredData.length > 0 ? filteredData : selectedAsset.chartData;

                  return dataToShow && dataToShow.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dataToShow}>
                        <defs>
                          <linearGradient id={`colorPrice-${selectedAsset.symbol}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={selectedAsset.change >= 0 ? "#4EDEA3" : "#FFB4AB"} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={selectedAsset.change >= 0 ? "#4EDEA3" : "#FFB4AB"} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="time"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
                          hide
                        />
                        <YAxis domain={['auto', 'auto']} hide />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#1C1B1B", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff" }}
                          itemStyle={{ color: "#fff", fontWeight: "bold" }}
                          labelFormatter={(label) => new Date(label).toLocaleDateString()}
                          formatter={(value: number) => [formatMoney(value), t("live_price")]}
                        />
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke={selectedAsset.change >= 0 ? "#4EDEA3" : "#FFB4AB"}
                          strokeWidth={3}
                          fillOpacity={1}
                          fill={`url(#colorPrice-${selectedAsset.symbol})`}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm font-medium">
                      <p>{t("no_historical_data")}</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            <button
              onClick={() => setIsDetailModalOpen(false)}
              className="w-full py-4 mt-2 bg-white/5 border border-white/10 text-white rounded-full font-black text-sm uppercase tracking-tight hover:bg-white/10 transition-all"
            >
              {t("close")}
            </button>
          </div>
        </div>
      </Modal>
      )}
    </div>
  );
}

function generateTimelineItems(asset: Asset, t: (key: string) => string, formatMoney: (amount: number, currency?: string) => string): TimelineItem[] {
  const items: TimelineItem[] = [];

  // Initial purchase
  if (asset.avgCost) {
    items.push({
      id: 'initial',
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      label: t("initial_purchase"),
      description: t("bought_shares").replace("{shares}", (asset.shares || 0).toFixed(4)).replace("{price}", formatMoney(asset.avgCost)),
      value: asset.valueUSD,
      change: 0,
      status: 'completed',
      type: 'buy',
    });
  }

  // Price milestones
  const currentPrice = asset.shares ? asset.valueUSD / asset.shares : 0;
  const profitPercent = asset.avgCost ? ((currentPrice - asset.avgCost) / asset.avgCost) * 100 : 0;

  if (profitPercent > 10) {
    items.push({
      id: 'milestone1',
      date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      label: t("milestone_10"),
      description: t("first_milestone"),
      value: asset.valueUSD * 0.9,
      change: 10,
      status: 'completed',
      type: 'milestone',
    });
  }

  if (profitPercent > 25) {
    items.push({
      id: 'milestone2',
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      label: t("milestone_25"),
      description: t("strong_performance"),
      value: asset.valueUSD * 0.8,
      change: 25,
      status: 'completed',
      type: 'milestone',
    });
  }

  // Current status
  items.push({
    id: 'current',
    date: new Date().toISOString(),
    label: t("current_position"),
    description: t("holding_shares").replace("{shares}", (asset.shares || 0).toFixed(4)).replace("{value}", formatMoney(asset.valueUSD)),
    value: asset.valueUSD,
    change: profitPercent,
    status: 'current',
    type: 'hold',
  });

  // Target
  const targetPrice = asset.avgCost ? asset.avgCost * 1.5 : currentPrice * 1.5;
  items.push({
    id: 'target',
    date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    label: t("target_50"),
    description: t("target_price").replace("{price}", formatMoney(targetPrice)),
    value: asset.shares ? asset.shares * targetPrice : asset.valueUSD * 1.5,
    change: 50,
    status: 'target',
    type: 'milestone',
  });

  return items;
}

// Sparkline Chart Component for intraday price movement
function SparklineChart({ data, isPositive }: { data: { time: number; price: number }[]; isPositive: boolean }) {
  if (!data || data.length < 2) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-full h-[1px] bg-gray-600" />
      </div>
    );
  }

  // Sort data by time to ensure correct order
  const sortedData = [...data].sort((a, b) => a.time - b.time);

  return (
    <ResponsiveContainer width="100%" height="100%">
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
