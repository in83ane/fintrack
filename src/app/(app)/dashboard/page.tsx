"use client";

import React from "react";
import { TrendingUp, TrendingDown, ArrowRight, Edit3, Info, History, Plus, Download, FileText, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import { Modal } from "@/src/components/Modal";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Papa from "papaparse";

export default function DashboardPage() {
  const { t, formatMoney, currency, exchangeRates, trades, addTrade, bulkAddTrades, allocations, netWorthHistory } = useApp();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isCSVModalOpen, setIsCSVModalOpen] = React.useState(false);
  const [newTrade, setNewTrade] = React.useState<{ asset: string; amountUSD: string; type: "BUY" | "SELL" }>({ asset: "", amountUSD: "", type: "BUY" });
  const [importStatus, setImportStatus] = React.useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrade.asset || !newTrade.amountUSD) return;

    addTrade({
      asset: newTrade.asset.toUpperCase(),
      type: newTrade.type,
      amountUSD: parseFloat(newTrade.amountUSD),
      date: new Date().toISOString().split("T")[0],
      rateAtTime: exchangeRates[currency],
      currency: currency,
    });

    setNewTrade({ asset: "", amountUSD: "", type: "BUY" });
    setIsModalOpen(false);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const parsedTrades = results.data.map((row: any) => ({
            asset: (row.asset || row.Asset || "").toUpperCase(),
            type: (row.type || row.Type || "BUY").toUpperCase() as "BUY" | "SELL",
            amountUSD: parseFloat(row.amountUSD || row.AmountUSD || row.amount || "0"),
            date: row.date || row.Date || new Date().toISOString().split("T")[0],
            rateAtTime: parseFloat(row.rateAtTime || row.RateAtTime || exchangeRates[currency].toString()),
            currency: row.currency || row.Currency || currency,
          })).filter(t => t.asset && t.amountUSD > 0);

          if (parsedTrades.length > 0) {
            bulkAddTrades(parsedTrades);
            setImportStatus({ type: 'success', message: t("import_success") });
            setTimeout(() => {
              setIsCSVModalOpen(false);
              setImportStatus({ type: 'idle', message: '' });
            }, 2000);
          } else {
            setImportStatus({ type: 'error', message: "No valid trades found in CSV." });
          }
        } catch (err) {
          setImportStatus({ type: 'error', message: "Error parsing CSV format." });
        }
      },
      error: () => {
        setImportStatus({ type: 'error', message: "Failed to read file." });
      }
    });
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Hero Section: Net Worth & Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-8 bg-[#1C1B1B] rounded-3xl p-8 relative overflow-hidden group shadow-xl border border-white/5"
        >
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div className="space-y-1">
              <span className="text-sm font-bold text-gray-400 uppercase tracking-wide">{t("total_net_worth")}</span>
              <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-white leading-none">
                {formatMoney(netWorthHistory[netWorthHistory.length - 1].value / exchangeRates[currency])}
              </h1>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-[#4EDEA3]">
                  <TrendingUp size={14} />
                  <span className="text-sm font-bold">+14.2%</span>
                </div>
                <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">
                  Rate: 1 USD = {exchangeRates[currency]} {currency}
                </span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setIsCSVModalOpen(true)}
                className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-400 hover:text-white transition-all"
                title={t("import_csv")}
              >
                <Download size={20} />
              </button>
            </div>
          </div>

          {/* Recharts Area Chart */}
          <div className="h-48 mt-4 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={300}>
              <AreaChart data={netWorthHistory}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ADC6FF" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ADC6FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#ADC6FF" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                  animationDuration={2000}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1C1B1B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#ADC6FF', fontWeight: 'bold' }}
                  labelStyle={{ color: '#6B7280', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'black' }}
                  formatter={(value: number) => [formatMoney(value / exchangeRates[currency]), 'Net Worth']}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Top Movers / Quick Actions */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-4">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-base font-bold tracking-tight text-white">{t("quick_actions")}</h2>
            <span className="text-xs font-black text-[#4EDEA3] uppercase tracking-wide">FinTrack OS</span>
          </div>
          
          <div className="space-y-3 flex-1">
            <motion.button 
              whileHover={{ x: 5 }}
              onClick={() => setIsModalOpen(true)}
              className="w-full p-5 bg-[#1C1B1B] border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/5 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#ADC6FF]/10 flex items-center justify-center text-[#ADC6FF]">
                  <Plus size={20} />
                </div>
                <div className="text-left">
                  <h4 className="font-black text-sm text-white leading-tight">{t("add_trade")}</h4>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{t("manual_entry")}</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-gray-600 group-hover:text-[#ADC6FF] transition-colors" />
            </motion.button>

            <motion.button 
              whileHover={{ x: 5 }}
              onClick={() => setIsCSVModalOpen(true)}
              className="w-full p-5 bg-[#1C1B1B] border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/5 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#E9C349]/10 flex items-center justify-center text-[#E9C349]">
                  <Download size={20} />
                </div>
                <div className="text-left">
                  <h4 className="font-black text-sm text-white leading-tight">{t("import_csv")}</h4>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{t("bulk_import")}</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-gray-600 group-hover:text-[#ADC6FF] transition-colors" />
            </motion.button>
          </div>

          <button className="w-full py-3.5 bg-gradient-to-r from-[#ADC6FF] to-[#4D8EFF] text-[#00285d] rounded-full font-black text-xs tracking-tight shadow-[0_10px_30px_rgba(173,198,255,0.2)]">
            {t("calculate")}
          </button>
        </div>
      </section>

      {/* Draggable Widgets Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Performance Chart Widget */}
        <div className="lg:col-span-2 bg-[#1C1B1B] rounded-3xl p-6 relative group shadow-lg border border-white/5">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="text-xs text-[#E9C349] uppercase tracking-wide font-black">{t("global_performance")}</span>
              <h3 className="text-lg font-bold text-white">{t("growth_velocity")}</h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
              <Edit3 size={14} className="text-gray-400" />
            </div>
          </div>
          <div className="w-full h-48 relative mt-4 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={300}>
              <AreaChart data={netWorthHistory}>
                <defs>
                  <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4EDEA3" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#4EDEA3" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#4EDEA3" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#velocityGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="absolute top-10 left-[80%] bg-white/5 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs border border-white/10">
              <p className="font-bold text-white">$2.84M Peak</p>
              <p className="text-gray-500 uppercase tracking-wide">Mar 24, 2024</p>
            </div>
          </div>
          <div className="flex justify-between mt-6 text-gray-500 text-xs font-black uppercase tracking-wide">
            <span>JAN</span><span>FEB</span><span>MAR</span><span>APR</span><span>MAY</span><span>JUN</span>
          </div>
        </div>

        {/* Vault Activity Widget */}
        <div className="bg-[#1C1B1B] rounded-3xl p-6 group relative overflow-hidden border border-white/5 shadow-lg">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="text-xs text-[#E9C349] uppercase tracking-wide font-black">{t("security_logs")}</span>
              <h3 className="text-lg font-bold text-white">{t("vault_activity")}</h3>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
              <Edit3 size={14} className="text-gray-400" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-1 bg-[#4EDEA3] rounded-full"></div>
              <div>
                <p className="text-xs font-bold text-white leading-tight">Stake Reward Claimed</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide">2m ago • ETH Vault 01</p>
                <p className="text-xs text-[#4EDEA3] font-black mt-1">+0.42 ETH</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-1 bg-[#ADC6FF] rounded-full"></div>
              <div>
                <p className="text-xs font-bold text-white leading-tight">BTC Limit Order Fill</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide">4h ago • Trade Desk</p>
                <p className="text-xs text-[#ADC6FF] font-black mt-1">Executed $63,400</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-1 bg-[#E9C349] rounded-full"></div>
              <div>
                <p className="text-xs font-bold text-white leading-tight">Tier Bonus</p>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Yesterday • Rewards</p>
                <p className="text-xs text-[#E9C349] font-black mt-1">2,500 SVN Points</p>
              </div>
            </div>
          </div>
          <button className="w-full mt-8 py-2.5 rounded-xl border border-white/10 text-xs font-black uppercase tracking-wide text-gray-400 hover:bg-white/5 transition-all">
            {t("view_full_audit")}
          </button>
        </div>
      </section>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column: Target Allocation */}
        <section className="md:col-span-4 space-y-6">
          <div className="bg-[#1C1B1B] p-6 rounded-3xl border border-white/5 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-base font-bold text-white">{t("target_allocation")}</h3>
              <Edit3 size={16} className="text-gray-500 cursor-pointer hover:text-white transition-colors" />
            </div>
            
            <div className="space-y-4">
              {allocations.map(item => (
                <AllocationItem key={item.label} label={item.label} value={item.value} color={item.color} />
              ))}
            </div>

            <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-sm text-gray-400 leading-relaxed font-medium">
                {t("optimal_rebalancing_msg")}
              </p>
            </div>
          </div>

          {/* Insight Card */}
          <div className="relative overflow-hidden rounded-3xl h-48 bg-[#1C1B1B] p-8 flex flex-col justify-end group border border-white/5">
            <div 
              className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-500 bg-cover bg-center" 
              style={{ backgroundImage: "url('https://picsum.photos/seed/market/600/400')" }}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Info size={12} className="text-[#E9C349]" />
                <span className="text-xs font-black uppercase text-[#E9C349] tracking-wide">{t("insights")}</span>
              </div>
              <h4 className="text-white font-bold leading-tight">
                {t("market_volatility_msg")}
              </h4>
            </div>
          </div>
        </section>

        {/* Right Column: Drift Table & Suggested Trades */}
        <section className="md:col-span-8 space-y-6">
          <div className="bg-[#1C1B1B] rounded-3xl border border-white/5 overflow-hidden shadow-xl">
            <div className="p-6 pb-2">
              <h3 className="text-base font-bold text-white">{t("current_vs_target")}</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-wide text-gray-500 border-b border-white/5">
                    <th className="px-6 py-3">{t("asset_class")}</th>
                    <th className="px-6 py-3">{t("current")}</th>
                    <th className="px-6 py-3">{t("target")}</th>
                    <th className="px-6 py-3 text-right">{t("delta")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <DriftRow label="US Large Cap" current="64.2%" target="60.0%" delta="+4.2%" type="negative" color="#ADC6FF" />
                  <DriftRow label="Global Bonds" current="22.1%" target="25.0%" delta="-2.9%" type="positive" color="#E9C349" />
                  <DriftRow label="Crypto / Alts" current="11.5%" target="10.0%" delta="+1.5%" type="negative" color="#4EDEA3" />
                  <DriftRow label="Liquid Cash" current="2.2%" target="5.0%" delta="-2.8%" type="positive" color="#6B7280" />
                </tbody>
              </table>
            </div>
          </div>

          {/* Suggested Trades */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wide text-gray-500 mb-6">{t("suggested_trades")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <TradeCard 
                type={t("sell")} 
                asset="VTI (US Total Market)" 
                desc={`${t("reduce_over_exposure")} ${formatMoney(14200)}`} 
                icon={TrendingDown} 
                color="#FFB4AB" 
              />
              <TradeCard 
                type={t("buy")} 
                asset="BND (Total Bond ETF)" 
                desc={`${t("increase_allocation")} ${formatMoney(9400)}`} 
                icon={TrendingUp} 
                color="#4EDEA3" 
              />
              <TradeCard 
                type={t("sell")} 
                asset="BTC (Bitcoin)" 
                desc={`${t("harvesting_gains")} ${formatMoney(4800)}`} 
                icon={TrendingDown} 
                color="#FFB4AB" 
              />
              
              <div className="bg-[#ADC6FF]/5 p-6 rounded-3xl border border-[#ADC6FF]/20 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-black text-[#ADC6FF] uppercase tracking-wide">{t("total_impact")}</span>
                  <span className="text-xl font-black text-white">{formatMoney(28400)}</span>
                </div>
                <button 
                  onClick={() => console.log("Executing all suggested trades...")}
                  className="w-full py-3 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-xs uppercase tracking-wide hover:brightness-110 transition-all active:scale-95"
                >
                  {t("execute_all")}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Transaction History Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <History size={18} className="text-[#ADC6FF]" />
          <h3 className="text-base font-bold text-white">{t("history")}</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {trades.map((trade) => {
            const currentRate = exchangeRates[currency];
            const historicalValue = trade.amountUSD * trade.rateAtTime;
            const currentValue = trade.amountUSD * currentRate;
            const profitLoss = currentValue - historicalValue;
            const isProfit = profitLoss >= 0;

            return (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                key={trade.id} 
                className="bg-[#1C1B1B] p-6 rounded-3xl border border-white/5 shadow-lg"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{trade.date}</span>
                    <h4 className="text-lg font-black text-white mt-1">{trade.asset} {trade.type === "BUY" ? t("buy") : t("sell")}</h4>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{t("initial_investment")}</span>
                    <div className="text-xs font-bold text-white">{formatMoney(trade.amountUSD, trade.currency as any, trade.rateAtTime)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                  <div>
                    <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{t("current_value")}</span>
                    <div className="text-base font-black text-white">{formatMoney(trade.amountUSD)}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-gray-500 uppercase tracking-wide">{t("profit_loss")}</span>
                    <div className={cn(
                      "text-base font-black",
                      isProfit ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                    )}>
                      {isProfit ? "+" : ""}{formatMoney(profitLoss / currentRate)}
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 text-xs text-gray-500 font-medium">
                  {t("rate_at_trade")}: 1 USD = {trade.rateAtTime} {trade.currency} | {t("current_rate")}: 1 USD = {currentRate} {currency}
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Add Trade Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t("add_trade")}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-500 uppercase tracking-wide">{t("asset_name")}</label>
            <input 
              autoFocus
              type="text" 
              placeholder="e.g. AAPL, BTC"
              value={newTrade.asset}
              onChange={(e) => setNewTrade({ ...newTrade, asset: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-[#ADC6FF]/50 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-500 uppercase tracking-wide">{t("amount_usd")}</label>
            <input 
              type="number" 
              placeholder="0.00"
              value={newTrade.amountUSD}
              onChange={(e) => setNewTrade({ ...newTrade, amountUSD: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white outline-none focus:border-[#ADC6FF]/50 transition-all"
            />
          </div>
          <div className="flex gap-4">
            <button 
              type="button"
              onClick={() => setNewTrade({ ...newTrade, type: "BUY" })}
              className={cn(
                "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-wide transition-all",
                newTrade.type === "BUY" ? "bg-[#4EDEA3] text-[#00285d]" : "bg-white/5 text-gray-500"
              )}
            >
              {t("buy")}
            </button>
            <button 
              type="button"
              onClick={() => setNewTrade({ ...newTrade, type: "SELL" })}
              className={cn(
                "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-wide transition-all",
                newTrade.type === "SELL" ? "bg-[#FFB4AB] text-[#00285d]" : "bg-white/5 text-gray-500"
              )}
            >
              {t("sell")}
            </button>
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
              className="flex-1 py-4 bg-[#ADC6FF] text-[#00285d] rounded-full font-black text-sm uppercase tracking-tight hover:brightness-110 transition-all"
            >
              {t("confirm")}
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal isOpen={isCSVModalOpen} onClose={() => setIsCSVModalOpen(false)} title={t("import_csv")}>
        <div className="space-y-8 py-4">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-[#ADC6FF]/10 rounded-3xl flex items-center justify-center mx-auto text-[#ADC6FF]">
              <FileText size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">{t("import_csv")}</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                {t("upload_csv_desc")}
              </p>
            </div>
          </div>

          <div className="bg-white/5 border border-dashed border-white/10 rounded-3xl p-12 text-center relative group hover:border-[#ADC6FF]/50 transition-all">
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleCSVUpload}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <div className="space-y-4">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto text-gray-400 group-hover:text-[#ADC6FF] transition-colors">
                <Download size={24} />
              </div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-500 group-hover:text-white transition-colors">
                {t("select_file")}
              </p>
            </div>
          </div>

          <div className="bg-[#1C1B1B] p-6 rounded-2xl border border-white/5">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-wide mb-4">{t("csv_format_example")}</h4>
            <code className="text-xs text-[#ADC6FF] block font-mono bg-black/30 p-4 rounded-xl">
              asset,type,amountUSD,date,rateAtTime,currency<br/>
              BTC,BUY,5000,2024-01-15,34.5,THB<br/>
              ETH,BUY,3000,2024-02-10,35.2,THB
            </code>
          </div>

          <AnimatePresence>
            {importStatus.type !== 'idle' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={cn(
                  "p-4 rounded-2xl flex items-center gap-3",
                  importStatus.type === 'success' ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
                )}
              >
                {importStatus.type === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}
                <span className="text-xs font-bold">{importStatus.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => setIsCSVModalOpen(false)}
            className="w-full py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors"
          >
            {t("cancel")}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function AllocationItem({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="group">
      <div className="flex justify-between text-xs font-black uppercase tracking-wide text-gray-400 mb-2">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full rounded-full" 
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function DriftRow({ label, current, target, delta, type, color }: any) {
  return (
    <tr className="hover:bg-white/5 transition-colors group">
      <td className="px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-bold text-sm text-white">{label}</span>
        </div>
      </td>
      <td className="px-8 py-6 text-sm text-gray-400">{current}</td>
      <td className="px-8 py-6 text-sm text-gray-400">{target}</td>
      <td className={cn(
        "px-8 py-6 text-right text-sm font-black",
        type === "negative" ? "text-[#FFB4AB]" : "text-[#4EDEA3]"
      )}>
        {delta}
      </td>
    </tr>
  );
}

function TradeCard({ type, asset, desc, icon: Icon, color }: any) {
  return (
    <div className="bg-[#1C1B1B] p-6 rounded-3xl flex items-center justify-between group hover:bg-[#262626] transition-all border border-white/5 cursor-pointer">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${color}10`, color }}>
          <Icon size={24} />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wide" style={{ color }}>{type}</div>
          <div className="text-white font-bold text-sm">{asset}</div>
          <div className="text-xs text-gray-400 font-medium">{desc}</div>
        </div>
      </div>
      <ArrowRight size={18} className="text-gray-600 group-hover:text-[#ADC6FF] transition-colors" />
    </div>
  );
}
