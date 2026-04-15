"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Download, 
  Upload, 
  Trash2, 
  Filter, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft,
  FileText,
  X,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import { format } from "date-fns";
import Papa from "papaparse";
import { useApp } from "@/src/context/AppContext";

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description: string;
  date: string;
  created_at: string;
}

export default function TransactionsPage() {
  const { t, formatMoney } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    type: 'expense',
    category: '',
    amount: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error: any) {
      console.error("Error fetching transactions:", error);
      showNotification(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase
        .from('transactions')
        .insert([{
          ...formData,
          amount: parseFloat(formData.amount),
          user_id: user.id
        }]);

      if (error) throw error;

      showNotification(t("transaction_added"), 'success');
      setShowAddModal(false);
      setFormData({
        type: 'expense',
        category: '',
        amount: '',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd')
      });
      fetchTransactions();
    } catch (error: any) {
      showNotification(error.message, 'error');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showNotification(t("transaction_deleted"), 'success');
      fetchTransactions();
    } catch (error: any) {
      showNotification(error.message, 'error');
    }
  };

  const handleExportCSV = () => {
    const csv = Papa.unparse(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `fintrack_transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`);
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
      complete: async (results) => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("User not authenticated");

          const importedData = results.data.map((row: any) => ({
            type: row.type || 'expense',
            category: row.category || 'Uncategorized',
            amount: parseFloat(row.amount) || 0,
            description: row.description || '',
            date: row.date || format(new Date(), 'yyyy-MM-dd'),
            user_id: user.id
          }));

          const { error } = await supabase
            .from('transactions')
            .insert(importedData);

          if (error) throw error;
          showNotification(`${t("imported_transactions")} ${importedData.length}`, 'success');
          fetchTransactions();
        } catch (error: any) {
          showNotification(error.message, 'error');
        }
      }
    });
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         t.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || t.type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter mb-1">{t("transactions")}</h1>
          <p className="text-gray-500 font-medium uppercase tracking-wide text-xs">{t("manage_cash_flow")}</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1C1B1B] text-white rounded-xl font-bold text-xs uppercase tracking-wide border border-white/5 hover:bg-white/5 transition-all"
          >
            <Upload size={14} className="text-[#4EDEA3]" />
            {t("import_csv")}
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
            <Download size={14} className="text-[#ADC6FF]" />
            {t("export_csv")}
          </button>
          
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#4EDEA3] text-[#0E0E0E] rounded-xl font-black text-xs uppercase tracking-wide hover:brightness-110 transition-all shadow-lg shadow-[#4EDEA3]/10"
          >
            <Plus size={16} />
            {t("add_new")}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1C1B1B] p-5 rounded-3xl border border-white/5">
          <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1">{t("total_balance")}</p>
          <h3 className="text-2xl font-black text-white tracking-tighter">
            {formatMoney(transactions.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0))}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-5 rounded-3xl border border-white/5">
          <p className="text-xs font-black text-[#4EDEA3] uppercase tracking-wide mb-1">{t("total_income")}</p>
          <h3 className="text-2xl font-black text-white tracking-tighter">
            {formatMoney(transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0))}
          </h3>
        </div>
        <div className="bg-[#1C1B1B] p-5 rounded-3xl border border-white/5">
          <p className="text-xs font-black text-[#FFB4AB] uppercase tracking-wide mb-1">{t("total_expenses")}</p>
          <h3 className="text-2xl font-black text-white tracking-tighter">
            {formatMoney(transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0))}
          </h3>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-[#1C1B1B] p-4 rounded-3xl border border-white/5">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text"
            placeholder={t("search_transactions")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0E0E0E] border-none rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:ring-2 focus:ring-[#4EDEA3]/20 transition-all"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {['all', 'income', 'expense'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex-1 md:flex-none px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-wide transition-all ${
                filterType === type 
                  ? "bg-[#4EDEA3] text-[#0E0E0E]" 
                  : "bg-[#0E0E0E] text-gray-500 hover:text-white"
              }`}
            >
              {t(type)}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-[#1C1B1B] rounded-[2rem] border border-white/5 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("date")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("description")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("category")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide">{t("amount")}</th>
                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-wide text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-8 h-8 border-4 border-[#4EDEA3]/20 border-t-[#4EDEA3] rounded-full animate-spin" />
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">{t("loading_transactions")}</p>
                    </div>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                      <FileText size={40} className="text-white" />
                      <p className="text-xs text-white font-bold uppercase tracking-wide">{t("no_transactions_found")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((txn) => (
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
                          txn.type === 'income' ? 'bg-[#4EDEA3]/10 text-[#4EDEA3]' : 'bg-[#FFB4AB]/10 text-[#FFB4AB]'
                        }`}>
                          {txn.type === 'income' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                        </div>
                        <span className="text-xs font-bold text-white">{txn.description}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-0.5 bg-white/5 rounded-full text-xs font-bold text-gray-400 uppercase tracking-wide">
                        {txn.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-base font-black tracking-tighter ${
                        txn.type === 'income' ? 'text-[#4EDEA3]' : 'text-white'
                      }`}>
                        {txn.type === 'income' ? '+' : '-'}{formatMoney(txn.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteTransaction(txn.id)}
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

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-[#1C1B1B] rounded-[2.5rem] border border-white/5 p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-white tracking-tighter">{t("add_transaction")}</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-500 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleAddTransaction} className="space-y-6">
                <div className="flex gap-2 p-1 bg-[#0E0E0E] rounded-2xl">
                  {['expense', 'income'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: type as any })}
                      className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${
                        formData.type === type 
                          ? (type === 'income' ? "bg-[#4EDEA3] text-[#0E0E0E]" : "bg-[#FFB4AB] text-[#0E0E0E]")
                          : "text-gray-500 hover:text-white"
                      }`}
                    >
                      {t(type)}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2 block">{t("description")}</label>
                    <input 
                      required
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full bg-[#0E0E0E] border-none rounded-2xl py-4 px-6 text-sm text-white focus:ring-2 focus:ring-[#4EDEA3]/20 transition-all"
                      placeholder="e.g. Monthly Rent"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2 block">{t("amount")}</label>
                      <input 
                        required
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        className="w-full bg-[#0E0E0E] border-none rounded-2xl py-4 px-6 text-sm text-white focus:ring-2 focus:ring-[#4EDEA3]/20 transition-all"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2 block">{t("category")}</label>
                      <input 
                        required
                        type="text"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full bg-[#0E0E0E] border-none rounded-2xl py-4 px-6 text-sm text-white focus:ring-2 focus:ring-[#4EDEA3]/20 transition-all"
                        placeholder="e.g. Housing"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2 block">{t("date")}</label>
                    <input 
                      required
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full bg-[#0E0E0E] border-none rounded-2xl py-4 px-6 text-sm text-white focus:ring-2 focus:ring-[#4EDEA3]/20 transition-all"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-[#4EDEA3] text-[#0E0E0E] rounded-2xl font-black text-xs uppercase tracking-wide hover:brightness-110 transition-all shadow-lg shadow-[#4EDEA3]/10 mt-4"
                >
                  {t("confirm_transaction")}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
