"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Download, 
  Upload, 
  Trash2, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft,
  FileText,
  X,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import Papa from "papaparse";
import { useApp, Trade } from "@/src/context/AppContext";
import { AddAssetModal } from "@/src/components/AddAssetModal";

export default function TransactionsPage() {
  const { t, formatMoney, trades, removeTrade, bulkAddTrades, currency, exchangeRates } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteTrade = (id: number) => {
    if (!confirm(t("confirmDeleteLedgerEntry"))) return;
    try {
      removeTrade(id);
      showNotification(t("transactionDeleted"), 'success');
    } catch (error: any) {
      showNotification(t("errorOccurred"), 'error');
    }
  };

  const handleExportCSV = () => {
    const csv = Papa.unparse(trades);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `fintrack_ledger_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const importedData = results.data.map((row: any) => ({
            type: (row.type || row.Type || 'BUY').toUpperCase() as 'BUY' | 'SELL',
            asset: (row.asset || row.Asset || 'UNKNOWN').toUpperCase(),
            amountUSD: parseFloat(row.amountUSD || row.AmountUSD || row.amount || "0"),
            date: row.date || row.Date || format(new Date(), 'yyyy-MM-dd'),
            rateAtTime: parseFloat(row.rateAtTime || row.RateAtTime || exchangeRates[currency].toString()),
            currency: row.currency || row.Currency || currency
          })).filter(t => t.asset && t.amountUSD > 0);

          if (importedData.length > 0) {
            bulkAddTrades(importedData);
            showNotification(`${t("importedTransactions")} ${importedData.length}`, 'success');
          } else {
            showNotification(t("noValidTradesFound"), 'error');
          }
        } catch (error: any) {
          showNotification(t("importError"), 'error');
        }
      }
    });
  };

  const filteredTrades = trades.filter(t => {
    const matchesSearch = t.asset.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || t.type.toLowerCase() === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter mb-1">{t("transactions") || "Ledger"}</h1>
          <p className="text-gray-500 font-medium uppercase tracking-wide text-xs">{t("auditDetail")}</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1C1B1B] text-white rounded-xl font-bold text-xs uppercase tracking-wide border border-white/5 hover:bg-white/5 transition-all"
          >
            <Download size={14} className="text-[#4EDEA3]" />
            {t("importCsv")}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportCSV} 
            accept=".csv" 
            className="hidden" 
          />
          
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1C1B1B] text-white rounded-xl font-bold text-xs uppercase tracking-wide border border-white/5 hover:bg-white/5 transition-all"
          >
            <Upload size={14} className="text-[#ADC6FF]" />
            {t("exportCsv")}
          </button>
          
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#4EDEA3] text-[#0E0E0E] rounded-xl font-black text-xs uppercase tracking-wide hover:brightness-110 transition-all shadow-lg shadow-[#4EDEA3]/10"
          >
            <Plus size={16} />
            {t("addTrade")}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1C1B1B] p-5 rounded-3xl border border-white/5">
          <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1">{t("totalBalance")}</p>
          <h3 className="text-2xl font-black text-white tracking-tighter">
            {formatMoney(trades.reduce((acc, t) => acc + (t.type === 'BUY' ? t.amountUSD : -t.amountUSD), 0))}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-5 rounded-3xl border border-white/5">
          <p className="text-xs font-black text-[#4EDEA3] uppercase tracking-wide mb-1">{t("buyVolume")}</p>
          <h3 className="text-2xl font-black text-white tracking-tighter">
            {formatMoney(trades.filter(t => t.type === 'BUY').reduce((acc, t) => acc + t.amountUSD, 0))}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-5 rounded-3xl border border-white/5">
          <p className="text-xs font-black text-[#FFB4AB] uppercase tracking-wide mb-1">{t("sellVolume")}</p>
          <h3 className="text-2xl font-black text-white tracking-tighter">
            {formatMoney(trades.filter(t => t.type === 'SELL').reduce((acc, t) => acc + t.amountUSD, 0))}
          </h3>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-[#1C1B1B] p-4 rounded-3xl border border-white/5">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text"
            placeholder={t("searchTransactions") || "Search Ledger..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0E0E0E] border-none rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:ring-2 focus:ring-[#4EDEA3]/20 transition-all"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {(['all', 'buy', 'sell'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex-1 md:flex-none px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-wide transition-all ${
                filterType === type 
                  ? type === 'buy'
                    ? "bg-[#4EDEA3] text-[#0E0E0E]"
                    : type === 'sell'
                      ? "bg-[#FFB4AB] text-[#0E0E0E]"
                      : "bg-[#ADC6FF] text-[#0E0E0E]"
                  : "bg-[#0E0E0E] text-gray-500 hover:text-white"
              }`}
            >
              {type === 'all' ? t('all') : type === 'buy' ? t('buy') : t('sell')}
            </button>
          ))}
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-[#1C1B1B] rounded-[2rem] border border-white/5 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("date")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("asset")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("flow")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("amount")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                      <FileText size={40} className="text-white" />
                      <p className="text-xs text-white font-bold uppercase tracking-wide">{t("noTransactionsFound") || "No Ledgers Found"}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTrades.map((txn) => (
                  <motion.tr 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={txn.id} 
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <span className="text-xs text-gray-400 font-medium">{format(new Date(txn.date), 'MMM dd, yyyy')}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          txn.type === 'SELL' ? 'bg-[#FFB4AB]/10 text-[#FFB4AB]' : 'bg-[#4EDEA3]/10 text-[#4EDEA3]'
                        }`}>
                          {txn.type === 'SELL' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                        </div>
                        <span className="text-xs font-bold text-white">{txn.asset}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                        txn.type === 'BUY' 
                          ? 'bg-[#4EDEA3]/10 text-[#4EDEA3]' 
                          : 'bg-[#FFB4AB]/10 text-[#FFB4AB]'
                      }`}>
                        {txn.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-base font-black tracking-tighter ${
                        txn.type === 'BUY' ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]'
                      }`}>
                        {txn.type === 'BUY' ? '+' : '-'}{formatMoney(txn.amountUSD)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteTrade(txn.id)}
                        className="p-2 text-gray-500 hover:text-[#FFB4AB] hover:bg-[#FFB4AB]/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Asset / Trade Modal */}
      <AddAssetModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className={`fixed bottom-8 right-8 z-[100] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border ${
              notification.type === 'success' 
                ? "bg-[#0E0E0E] border-[#4EDEA3]/20 text-[#4EDEA3]" 
                : "bg-[#0E0E0E] border-[#FFB4AB]/20 text-[#FFB4AB]"
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="text-xs font-bold uppercase tracking-wide">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
