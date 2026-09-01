"use client";

import React, { useState } from "react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownRight,
  Filter
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";

// Mock Data
const MOCK_DAYS = Array.from({ length: 31 }, (_, i) => ({
  date: i + 1,
  profit: Math.random() > 0.3 ? Math.random() * 500 : -(Math.random() * 200),
  hasTrades: Math.random() > 0.4
}));

const MOCK_TRANSACTIONS = [
  { id: 1, type: "BUY", symbol: "EURUSD", size: 1.0, openPrice: 1.0850, closePrice: 1.0875, profit: 250.00, time: "10:30 AM", date: 15 },
  { id: 2, type: "SELL", symbol: "XAUUSD", size: 0.5, openPrice: 1950.00, closePrice: 1948.50, profit: 75.00, time: "11:15 AM", date: 15 },
  { id: 3, type: "BUY", symbol: "US30", size: 0.1, openPrice: 34500, closePrice: 34450, profit: -50.00, time: "14:00 PM", date: 15 },
  { id: 4, type: "SELL", symbol: "GBPUSD", size: 2.0, openPrice: 1.2500, closePrice: 1.2480, profit: 400.00, time: "09:00 AM", date: 14 },
];

export default function HistoryPage() {
  const [selectedDate, setSelectedDate] = useState<number | null>(15);

  const filteredTransactions = selectedDate 
    ? MOCK_TRANSACTIONS.filter(t => t.date === selectedDate)
    : MOCK_TRANSACTIONS;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CalendarIcon className="text-primary" size={24} />
            </div>
            History
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Unified view of your daily performance and transaction ledger.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Calendar View */}
        <div className="lg:col-span-1 space-y-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-surface/50 border border-border rounded-2xl p-5 backdrop-blur-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white">August 2026</h2>
              <div className="flex gap-2">
                <button className="p-1 rounded-md hover:bg-white/5 text-muted-foreground transition-colors"><ChevronLeft size={20}/></button>
                <button className="p-1 rounded-md hover:bg-white/5 text-muted-foreground transition-colors"><ChevronRight size={20}/></button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => (
                <div key={day} className="text-xs font-medium text-muted-foreground py-1">{day}</div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1 sm:gap-2 text-sm">
              {/* Padding for start of month */}
              <div className="aspect-square"></div>
              <div className="aspect-square"></div>
              <div className="aspect-square"></div>
              
              {MOCK_DAYS.map((day) => (
                <button 
                  key={day.date}
                  onClick={() => setSelectedDate(day.date)}
                  className={cn(
                    "relative aspect-square rounded-lg flex flex-col items-center justify-center transition-all p-1",
                    selectedDate === day.date ? "ring-2 ring-primary bg-white/10" : "hover:bg-white/5",
                    !day.hasTrades && "opacity-50"
                  )}
                >
                  <span className={cn(
                    "font-medium",
                    selectedDate === day.date ? "text-white" : "text-muted-foreground"
                  )}>
                    {day.date}
                  </span>
                  
                  {day.hasTrades && (
                    <span className={cn(
                      "text-[10px] font-bold mt-0.5",
                      day.profit >= 0 ? "text-primary" : "text-red-400"
                    )}>
                      {day.profit >= 0 ? "+" : ""}{Math.round(day.profit)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
          
          {/* Monthly Summary */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="bg-surface/50 border border-border rounded-2xl p-5 backdrop-blur-xl">
             <h3 className="text-sm font-semibold text-white mb-4">Monthly Summary</h3>
             <div className="space-y-4">
               <div className="flex justify-between items-center">
                 <span className="text-sm text-muted-foreground">Total Net Profit</span>
                 <span className="text-sm font-bold text-primary">+$3,450.00</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-sm text-muted-foreground">Profitable Days</span>
                 <span className="text-sm font-bold text-white">18 / 22</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-sm text-muted-foreground">Total Trades</span>
                 <span className="text-sm font-bold text-white">124</span>
               </div>
             </div>
          </motion.div>
        </div>

        {/* Right Column: Transactions List */}
        <div className="lg:col-span-2">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-surface/50 border border-border rounded-2xl backdrop-blur-xl overflow-hidden h-full">
            <div className="p-5 sm:p-6 border-b border-border flex justify-between items-center bg-white/[0.01]">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                Transactions 
                {selectedDate && <span className="text-sm font-normal text-muted-foreground">for Aug {selectedDate}</span>}
              </h2>
              <button className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-white transition-colors bg-white/5 px-3 py-1.5 rounded-md">
                <Filter size={14} /> Filter
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="p-4 font-medium">Time</th>
                    <th className="p-4 font-medium">Symbol</th>
                    <th className="p-4 font-medium">Type/Size</th>
                    <th className="p-4 font-medium text-right">Open / Close</th>
                    <th className="p-4 font-medium text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-border">
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="p-4 text-muted-foreground tabular-nums">{tx.time}</td>
                      <td className="p-4 font-medium text-white">{tx.symbol}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            tx.type === "BUY" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {tx.type}
                          </span>
                          <span className="text-muted-foreground tabular-nums">{tx.size.toFixed(2)}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right tabular-nums">
                        <div className="flex flex-col items-end">
                          <span className="text-muted-foreground">{tx.openPrice.toFixed(4)}</span>
                          <span className="text-white">{tx.closePrice.toFixed(4)}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1 font-medium tabular-nums">
                          {tx.profit >= 0 ? (
                            <ArrowUpRight size={16} className="text-primary" />
                          ) : (
                            <ArrowDownRight size={16} className="text-red-400" />
                          )}
                          <span className={tx.profit >= 0 ? "text-primary" : "text-red-400"}>
                            {tx.profit >= 0 ? "+" : ""}{tx.profit.toFixed(2)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTransactions.length === 0 && (
                <div className="p-12 text-center flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                    <CalendarIcon className="text-muted-foreground" size={24} />
                  </div>
                  <p className="text-muted-foreground">No trades found for this date.</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

      </div>
    </div>
  );
}
