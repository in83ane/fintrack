"use client";

import React, { useState } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Target, 
  ShieldAlert, 
  Briefcase 
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";

// Mock Data for the Equity Curve
const mockEquityData = [
  { date: "01 Aug", equity: 42100 },
  { date: "05 Aug", equity: 42850 },
  { date: "10 Aug", equity: 43200 },
  { date: "15 Aug", equity: 42980 },
  { date: "20 Aug", equity: 44100 },
  { date: "25 Aug", equity: 44880 },
  { date: "30 Aug", equity: 45320 },
  { date: "04 Sep", equity: 46100 },
  { date: "09 Sep", equity: 45780 },
  { date: "14 Sep", equity: 47200 },
  { date: "19 Sep", equity: 48050 },
  { date: "24 Sep", equity: 48742 },
];

const mockActivePositions = [
  { id: "1", symbol: "EURUSD", type: "BUY", size: 1.5, openPrice: 1.0850, currentPrice: 1.0875, profit: 375.00, openTime: "2026-08-29 10:30" },
  { id: "2", symbol: "XAUUSD", type: "SELL", size: 0.5, openPrice: 1950.00, currentPrice: 1945.50, profit: 225.00, openTime: "2026-08-29 11:15" },
  { id: "3", symbol: "US30", type: "BUY", size: 0.1, openPrice: 34500, currentPrice: 34450, profit: -50.00, openTime: "2026-08-29 14:00" },
];

export default function TraderHubPage() {
  const [timeframe, setTimeframe] = useState("1M");

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="text-primary" size={24} />
            </div>
            Trader Hub
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Professional monitoring: track your performance, equity curve, and open positions.
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-surface border border-border p-1 rounded-lg">
          {["1W", "1M", "3M", "YTD", "ALL"].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                timeframe === tf 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Main Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-surface/50 border border-border rounded-2xl p-5 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="flex justify-between items-start mb-4">
            <div className="text-sm font-medium text-muted-foreground">Total Equity</div>
            <Briefcase size={16} className="text-primary/50" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-white">$48,742.18</span>
          </div>
          <div className="mt-2 text-xs font-medium text-primary flex items-center gap-1">
            <TrendingUp size={14} /> +$3,218.44 (7.06%) All Time
          </div>
        </motion.div>

        {/* Metric 2 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-surface/50 border border-border rounded-2xl p-5 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="flex justify-between items-start mb-4">
            <div className="text-sm font-medium text-muted-foreground">Win Rate</div>
            <Target size={16} className="text-emerald-400/50" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-white">68.4%</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Based on last 100 trades
          </div>
        </motion.div>

        {/* Metric 3 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-surface/50 border border-border rounded-2xl p-5 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="flex justify-between items-start mb-4">
            <div className="text-sm font-medium text-muted-foreground">Profit Factor</div>
            <Activity size={16} className="text-blue-400/50" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-white">1.87</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Gross Profit / Gross Loss
          </div>
        </motion.div>

        {/* Metric 4 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-surface/50 border border-border rounded-2xl p-5 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="flex justify-between items-start mb-4">
            <div className="text-sm font-medium text-muted-foreground">Max Drawdown</div>
            <ShieldAlert size={16} className="text-red-400/50" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-white">-4.2%</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Peak to Trough drop
          </div>
        </motion.div>
      </div>

      {/* Equity Curve Graph */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-surface/50 border border-border rounded-2xl p-5 sm:p-6 backdrop-blur-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-white">Equity Curve</h2>
          <div className="text-sm text-primary font-medium flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-md">
            <TrendingUp size={16} /> +7.06%
          </div>
        </div>
        
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mockEquityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false} 
                dy={10} 
              />
              <YAxis 
                stroke="rgba(255,255,255,0.3)" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(value) => `$${value/1000}k`} 
                dx={-10}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f1115', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                itemStyle={{ color: 'var(--color-primary)' }}
              />
              <Area 
                type="monotone" 
                dataKey="equity" 
                stroke="var(--color-primary)" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorEquity)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Active Positions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-surface/50 border border-border rounded-2xl backdrop-blur-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Active Positions</h2>
          <span className="bg-white/5 text-muted-foreground text-xs px-2 py-1 rounded-md">
            {mockActivePositions.length} Open
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="p-4 font-medium">Symbol</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium text-right">Size</th>
                <th className="p-4 font-medium text-right">Open Price</th>
                <th className="p-4 font-medium text-right">Current Price</th>
                <th className="p-4 font-medium text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-border">
              {mockActivePositions.map((pos) => (
                <tr key={pos.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 font-medium text-white">{pos.symbol}</td>
                  <td className="p-4">
                    <span className={cn(
                      "px-2 py-1 rounded-md text-xs font-bold",
                      pos.type === "BUY" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                    )}>
                      {pos.type}
                    </span>
                  </td>
                  <td className="p-4 text-right tabular-nums text-muted-foreground">{pos.size}</td>
                  <td className="p-4 text-right tabular-nums text-muted-foreground">{pos.openPrice.toFixed(4)}</td>
                  <td className="p-4 text-right tabular-nums text-muted-foreground">{pos.currentPrice.toFixed(4)}</td>
                  <td className="p-4 text-right font-medium tabular-nums">
                    <span className={pos.profit >= 0 ? "text-primary" : "text-red-400"}>
                      {pos.profit >= 0 ? "+" : ""}{pos.profit.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mockActivePositions.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              No active positions at the moment.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
