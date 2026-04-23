"use client";

import React, { useState, useMemo } from "react";
import { Plus, Loader2, Wallet } from "lucide-react";
import { Modal } from "@/src/components/Modal";
import { useApp } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";

interface AddCashflowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddCashflowModal({ isOpen, onClose }: AddCashflowModalProps) {
  const { t, addCashActivity, moneyBuckets, updateMoneyBucket, addBucketActivity, formatMoney, language, addToast } = useApp();

  const [type, setType] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("salary");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [selectedBucketId, setSelectedBucketId] = useState("<no-bucket>");
  const [deductFromBucket, setDeductFromBucket] = useState(false);

  // Get buckets that are linked to expenses
  const linkedBuckets = useMemo(() => {
    return moneyBuckets.filter(b => b.linkedToExpenses);
  }, [moneyBuckets]);

  // Available categories based on type
  const incomeCategories = ["salary", "investment", "other"];
  const expenseCategories = ["food", "transport", "utilities", "entertainment", "investment", "other"];

  const currentCategories = type === "INCOME" ? incomeCategories : expenseCategories;

  // Handle type change reset
  const handleTypeChange = (newType: "INCOME" | "EXPENSE") => {
    setType(newType);
    setCategory(newType === "INCOME" ? "salary" : "food");
    setDeductFromBucket(false);
    setSelectedBucketId("<no-bucket>");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    const amountNum = Number(amount);

    // Validate bucket deduction if enabled
    if (type === "EXPENSE" && deductFromBucket && selectedBucketId !== "<no-bucket>") {
      const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
      if (bucket && bucket.currentAmount < amountNum) {
        addToast(
          t("insufficientBucketBalance").replace("{bucket}", t(bucket.name) || bucket.name),
          "error"
        );
        return;
      }
    }

    setIsAdding(true);

    try {
      addCashActivity({
        type,
        amountUSD: amountNum,
        category: category,
        date,
        note
      });

      // Deduct from bucket if enabled
      if (type === "EXPENSE" && deductFromBucket && selectedBucketId !== "<no-bucket>") {
        const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
        if (bucket) {
          const newAmount = Math.max(0, bucket.currentAmount - amountNum);
          updateMoneyBucket(bucket.id, { currentAmount: newAmount });
          addBucketActivity({
            bucketId: bucket.id,
            bucketName: bucket.name,
            type: "withdraw",
            amount: amountNum,
            date: new Date().toISOString(),
            note: `${t("deductFromBucket")}: ${t(category) || category}${note ? ` - ${note}` : ""}`,
          });
        }
      }

      addToast(t("recordSaved"), "success");

      // Reset & close
      resetState();
      onClose();
    } catch (err) {
      console.error("Failed to add cashflow activity", err);
    } finally {
      setIsAdding(false);
    }
  };

  const resetState = () => {
    setType("INCOME");
    setAmount("");
    setCategory("salary");
    setDate(new Date().toISOString().split("T")[0]);
    setNote("");
    setDeductFromBucket(false);
    setSelectedBucketId("<no-bucket>");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t("logIncomeExpense")}>
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Type Toggle */}
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10">
          <button
            type="button"
            onClick={() => handleTypeChange("INCOME")}
            className={cn(
              "flex-1 py-3 text-sm font-black uppercase tracking-wide rounded-xl transition-all",
              type === "INCOME" 
                ? "bg-[#4EDEA3] text-[#00285d] shadow-lg" 
                : "text-gray-400 hover:text-white"
            )}
          >
            {t("income")}
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange("EXPENSE")}
            className={cn(
              "flex-1 py-3 text-sm font-black uppercase tracking-wide rounded-xl transition-all",
              type === "EXPENSE" 
                ? "bg-[#FFB4AB] text-[#00285d] shadow-lg" 
                : "text-gray-400 hover:text-white"
            )}
          >
            {t("expense")}
          </button>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {t("amountUsd")}
          </label>
          <input
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors"
            required
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {t("category")}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {currentCategories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  "p-3 text-xs font-bold rounded-xl border transition-all text-left",
                  category === cat
                    ? "bg-white/10 border-white/20 text-white"
                    : "bg-transparent border-white/5 text-gray-500 hover:text-gray-300"
                )}
              >
                {t(cat)}
              </button>
            ))}
          </div>
        </div>

        {/* Bucket Deduction - Only for EXPENSE */}
        {type === "EXPENSE" && linkedBuckets.length > 0 && (
          <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5">
            <button
              type="button"
              onClick={() => setDeductFromBucket(!deductFromBucket)}
              className="w-full flex items-center gap-3"
            >
              <div
                className={cn(
                  "w-5 h-5 rounded border flex items-center justify-center transition-all",
                  deductFromBucket
                    ? "bg-[#FFB4AB] border-[#FFB4AB]"
                    : "bg-transparent border-white/30"
                )}
              >
                {deductFromBucket && (
                  <svg className="w-3 h-3 text-[#0E0E0E]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Wallet size={14} className="text-[#FFB4AB]" />
                <span className="text-sm font-bold text-white">{t("deductFromBucket")}</span>
              </div>
            </button>

            {deductFromBucket && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  {t("selectBucket")}
                </label>
                <div className="space-y-2">
                  {linkedBuckets.map((bucket) => (
                    <button
                      key={bucket.id}
                      type="button"
                      onClick={() => setSelectedBucketId(bucket.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border transition-all",
                        selectedBucketId === bucket.id
                          ? "bg-white/10 border-white/20"
                          : "bg-white/[0.02] border-transparent hover:bg-white/5"
                      )}
                    >
                      <span className="text-lg">{bucket.icon}</span>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-bold text-white">{t(bucket.name) || bucket.name}</p>
                        <p className="text-[10px] text-gray-500">
                          {formatMoney(bucket.currentAmount)}
                        </p>
                      </div>
                      {selectedBucketId === bucket.id && (
                        <div className="w-4 h-4 rounded-full bg-[#FFB4AB] flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-[#0E0E0E]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Date */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {t("date")}
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors"
            required
          />
        </div>

        {/* Note */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {t("note")}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`${t("note")}...`}
            className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-4 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-4 text-gray-500 font-bold text-sm hover:text-white transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={isAdding || !amount || Number(amount) <= 0}
            className={cn(
              "flex-1 py-4 rounded-full font-black text-sm uppercase tracking-tight transition-all flex items-center justify-center gap-2",
              isAdding || !amount || Number(amount) <= 0
                ? "bg-white/5 text-gray-600 opacity-60 cursor-not-allowed"
                : type === "INCOME" 
                  ? "bg-[#4EDEA3] text-[#00285d] hover:brightness-110" 
                  : "bg-[#FFB4AB] text-[#00285d] hover:brightness-110"
            )}
          >
            {isAdding && <Loader2 size={16} className="animate-spin" />}
            {t("addRecord")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
