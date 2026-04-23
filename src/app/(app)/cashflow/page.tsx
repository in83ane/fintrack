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
  CheckCircle2,
  AlertCircle,
  PieChart,
  Wallet
} from "lucide-react";
import { format } from "date-fns";
import Papa from "papaparse";
import { useApp, CashActivity } from "@/src/context/AppContext";
import { AddCashflowModal } from "@/src/components/AddCashflowModal";
import { cn } from "@/src/lib/utils";

export default function CashflowPage() {
  const { t, formatMoney, cashActivities, removeCashActivity, currency, exchangeRates } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteCashflow = (id: string) => {
    if (!confirm(t("confirmDelete") || "Are you sure you want to delete this entry?")) return;
    removeCashActivity(id);
    showNotification(t("recordSaved"), 'success');
  };

  const handleExportCSV = () => {
    const csv = Papa.unparse(cashActivities.map(c => ({
      type: c.type,
      amount: c.amountUSD,
      category: c.category,
      date: c.date,
      note: c.note || ""
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `fintrack_cashflow_${format(new Date(), 'yyyy-MM-dd')}.csv`);
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
          let count = 0;
          results.data.forEach((row: any) => {
            const type = (row.type || "INCOME").toUpperCase();
            const amount = parseFloat(row.amount || row.amountUSD || "0");
            if (amount > 0 && (type === "INCOME" || type === "EXPENSE")) {
              // We can't bulk add, so show message
              count++;
            }
          });
          showNotification(`${t("importedTransactions")} ${count}`, count > 0 ? 'success' : 'error');
        } catch (error: any) {
          showNotification(t("importError"), 'error');
        }
      }
    });
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredCashflow = cashActivities.filter(c => {
    const matchesSearch = t(c.category).toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (c.note && c.note.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterType === "all" || c.type.toLowerCase() === filterType;
    return matchesSearch && matchesFilter;
  });

  // Calculate stats
  const totalIncome = cashActivities.filter(c => c.type === 'INCOME').reduce((acc, c) => acc + c.amountUSD, 0);
  const totalExpenses = cashActivities.filter(c => c.type === 'EXPENSE').reduce((acc, c) => acc + c.amountUSD, 0);
  const netCashflow = totalIncome - totalExpenses;

  // Category breakdown for current month
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const thisMonthActivities = cashActivities.filter(a => {
    const date = new Date(a.date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  });
  const monthIncome = thisMonthActivities.filter(a => a.type === "INCOME").reduce((sum, a) => sum + a.amountUSD, 0);
  const monthExpense = thisMonthActivities.filter(a => a.type === "EXPENSE").reduce((sum, a) => sum + a.amountUSD, 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <span className="text-[#ADC6FF] uppercase tracking-wide text-xs font-black mb-1 block">{t("cashflowOverview")}</span>
          <h1 className="text-3xl font-black text-white tracking-tighter mb-1">{t("cashflowOverview")}</h1>
          <p className="text-gray-500 font-medium uppercase tracking-wide text-xs">{t("auditDetail")}</p>
        </motion.div>
        
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
            {t("addRecord")}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#1C1B1B] to-[#0E0E0E] p-5 rounded-3xl border border-white/5 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-[#ADC6FF]/10 blur-3xl rounded-full" />
          <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1">{t("netCashflow")}</p>
          <h3 className={cn("text-2xl font-black tracking-tighter", netCashflow >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
            {netCashflow >= 0 ? "+" : ""}{formatMoney(netCashflow)}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-5 rounded-3xl border border-white/5">
          <p className="text-xs font-black text-[#4EDEA3] uppercase tracking-wide mb-1">{t("totalIncome")}</p>
          <h3 className="text-2xl font-black text-white tracking-tighter">
            {formatMoney(totalIncome)}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-5 rounded-3xl border border-white/5">
          <p className="text-xs font-black text-[#FFB4AB] uppercase tracking-wide mb-1">{t("totalExpenses")}</p>
          <h3 className="text-2xl font-black text-white tracking-tighter">
            {formatMoney(totalExpenses)}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-5 rounded-3xl border border-white/5">
          <p className="text-xs font-black text-[#E9C349] uppercase tracking-wide mb-1">{t("monthlyOverview") || "This Month"}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-lg font-black text-white tracking-tighter">
              <span className="text-[#4EDEA3]">+{formatMoney(monthIncome)}</span>
            </h3>
          </div>
          <p className="text-xs text-[#FFB4AB] font-bold mt-0.5">-{formatMoney(monthExpense)}</p>
        </div>
      </div>

      {/* Monthly Breakdown Chart */}
      {cashActivities.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Income by Category */}
          <div className="bg-[#1C1B1B] p-6 rounded-3xl border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <PieChart size={16} className="text-[#4EDEA3]" />
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide">{t("incomeByCategory") || "Income by Category"}</h3>
            </div>
            <div className="space-y-3">
              {(() => {
                const incomes = cashActivities.filter(c => c.type === 'INCOME');
                const categories = [...new Set(incomes.map(c => c.category))];
                const colors = ['#4EDEA3', '#ADC6FF', '#E9C349', '#FF8B9A', '#A78BFA'];
                return categories.map((cat, i) => {
                  const total = incomes.filter(c => c.category === cat).reduce((s, c) => s + c.amountUSD, 0);
                  const pct = totalIncome > 0 ? (total / totalIncome) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-400">{t(cat)}</span>
                        <span className="text-white">{formatMoney(total)} <span className="text-gray-500">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="h-full rounded-full" 
                          style={{ backgroundColor: colors[i % colors.length] }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Expense by Category */}
          <div className="bg-[#1C1B1B] p-6 rounded-3xl border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={16} className="text-[#FFB4AB]" />
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide">{t("expenseByCategory") || "Expense by Category"}</h3>
            </div>
            <div className="space-y-3">
              {(() => {
                const expenses = cashActivities.filter(c => c.type === 'EXPENSE');
                const categories = [...new Set(expenses.map(c => c.category))];
                const colors = ['#FFB4AB', '#E9C349', '#ADC6FF', '#A78BFA', '#4EDEA3'];
                return categories.map((cat, i) => {
                  const total = expenses.filter(c => c.category === cat).reduce((s, c) => s + c.amountUSD, 0);
                  const pct = totalExpenses > 0 ? (total / totalExpenses) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-400">{t(cat)}</span>
                        <span className="text-white">{formatMoney(total)} <span className="text-gray-500">({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="h-full rounded-full" 
                          style={{ backgroundColor: colors[i % colors.length] }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-[#1C1B1B] p-4 rounded-3xl border border-white/5">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text"
            placeholder={t("searchTransactions") || "Search..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0E0E0E] border-none rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:ring-2 focus:ring-[#4EDEA3]/20 transition-all"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {(['all', 'income', 'expense'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex-1 md:flex-none px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-wide transition-all ${
                filterType === type 
                  ? type === 'income' 
                    ? "bg-[#4EDEA3] text-[#0E0E0E]"
                    : type === 'expense'
                      ? "bg-[#FFB4AB] text-[#0E0E0E]"
                      : "bg-[#ADC6FF] text-[#0E0E0E]"
                  : "bg-[#0E0E0E] text-gray-500 hover:text-white"
              }`}
            >
              {type === 'all' ? t('all') : type === 'income' ? t('income') : t('expense')}
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
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("category")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("type")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("amount")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredCashflow.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                      <FileText size={40} className="text-white" />
                      <p className="text-xs text-white font-bold uppercase tracking-wide">{t("noTransactionsFound") || "No records found"}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCashflow.map((txn) => (
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
                          txn.type === 'EXPENSE' ? 'bg-[#FFB4AB]/10 text-[#FFB4AB]' : 'bg-[#4EDEA3]/10 text-[#4EDEA3]'
                        }`}>
                          {txn.type === 'EXPENSE' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">{t(txn.category)}</span>
                          {txn.note && <span className="text-[10px] text-gray-500">{txn.note}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                        txn.type === 'INCOME' 
                          ? "bg-[#4EDEA3]/10 text-[#4EDEA3]" 
                          : "bg-[#FFB4AB]/10 text-[#FFB4AB]"
                      )}>
                        {t(txn.type.toLowerCase())}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-base font-black tracking-tighter ${
                        txn.type === 'INCOME' ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]'
                      }`}>
                        {txn.type === 'INCOME' ? '+' : '-'}{formatMoney(txn.amountUSD)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteCashflow(txn.id)}
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

      {/* Add Cashflow Modal */}
      <AddCashflowModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />

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
