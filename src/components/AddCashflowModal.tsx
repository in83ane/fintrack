"use client";

import React, { useState, useMemo } from "react";
import { X, Wallet, ChevronDown, Loader2 } from "lucide-react";
import { Modal } from "@/src/components/Modal";
import { useApp } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";

interface AddCashflowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddCashflowModal({ isOpen, onClose }: AddCashflowModalProps) {
  const { t, addCashActivity, moneyBuckets, updateMoneyBucket, addBucketActivity, formatMoney, language, addToast, currency } = useApp();

  const [type, setType] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("salary");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [selectedBucketId, setSelectedBucketId] = useState("<auto-distribute>");
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
    setSelectedBucketId(newType === "INCOME" ? "<auto-distribute>" : "<no-bucket>");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    const amountNum = Number(amount);

    // Validate bucket deduction
    if (type === "EXPENSE" && selectedBucketId !== "<no-bucket>") {
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

    let detailedNote = note;
    if (type === "EXPENSE" && selectedBucketId !== "<no-bucket>") {
      const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
      if (bucket) {
        detailedNote = `${note ? note + " | " : ""}Paid from: ${t(bucket.name) || bucket.name}`;
      }
    } else if (type === "INCOME") {
      if (selectedBucketId === "<auto-distribute>") {
        detailedNote = `${note ? note + " | " : ""}Auto-distributed to buckets`;
      } else if (selectedBucketId !== "<no-bucket>") {
        const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
        if (bucket) {
          detailedNote = `${note ? note + " | " : ""}Deposited to: ${t(bucket.name) || bucket.name}`;
        }
      }
    }

    try {
      addCashActivity({
        type,
        amountUSD: amountNum,
        category: category,
        date: date === new Date().toISOString().split("T")[0] ? new Date().toISOString() : new Date(date).toISOString(),
        note: detailedNote,
        bucketId: selectedBucketId !== "<no-bucket>" && selectedBucketId !== "<auto-distribute>" ? selectedBucketId : undefined
      });

      // Deduct from bucket if EXPENSE
      if (type === "EXPENSE" && selectedBucketId !== "<no-bucket>") {
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

      // Handle INCOME Bucket logic
      if (type === "INCOME" && moneyBuckets.length > 0) {
        if (selectedBucketId === "<auto-distribute>") {
          const totalAllocated = moneyBuckets.reduce((acc, b) => acc + (b.targetPercent || 0), 0);
          if (totalAllocated > 0) {
            for (const bucket of moneyBuckets) {
              const pct = bucket.targetPercent || 0;
              const share = (pct / totalAllocated) * amountNum;
              if (share > 0) {
                updateMoneyBucket(bucket.id, { currentAmount: bucket.currentAmount + share });
                addBucketActivity({
                  bucketId: bucket.id,
                  bucketName: bucket.name,
                  type: "deposit",
                  amount: share,
                  date: new Date().toISOString(),
                  note: `${t("income")}: ${t(category) || category}${note ? ` - ${note}` : ""}`,
                });
              }
            }
          }
        } else if (selectedBucketId !== "<no-bucket>") {
          // Deposit entirely into one specific bucket
          const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
          if (bucket) {
            updateMoneyBucket(bucket.id, { currentAmount: bucket.currentAmount + amountNum });
            addBucketActivity({
              bucketId: bucket.id,
              bucketName: bucket.name,
              type: "deposit",
              amount: amountNum,
              date: new Date().toISOString(),
              note: `${t("income")}: ${t(category) || category}${note ? ` - ${note}` : ""}`,
            });
          }
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
    setSelectedBucketId("<auto-distribute>");
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
            {t("amount")}
          </label>
          <div className="relative">
            <input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium placeholder-gray-600 focus:outline-none focus:border-[#ADC6FF]/50 transition-colors pr-12"
              required
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs uppercase">{currency}</span>
          </div>
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

        {/* Bucket Selection - Always visible if buckets exist */}
        {moneyBuckets.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
              <Wallet size={12} className={type === "INCOME" ? "text-[#4EDEA3]" : "text-[#FFB4AB]"} />
              {type === "INCOME" ? t("selectBucket") || "Deposit to Bucket" : t("deductFromBucket")}
            </label>
            <div className="relative">
              <select
                value={selectedBucketId}
                onChange={(e) => setSelectedBucketId(e.target.value)}
                className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white text-sm font-medium appearance-none focus:outline-none focus:border-[#ADC6FF]/50 transition-colors"
              >
                {type === "INCOME" && (
                  <option value="<auto-distribute>" className="bg-[#1C1B1B]">
                    ⚡ Auto-distribute (Target Plan)
                  </option>
                )}
                <option value="<no-bucket>" className="bg-[#1C1B1B]">
                  {t("none") || "None (General Cashflow)"}
                </option>
                {moneyBuckets.map(bucket => (
                  <option key={bucket.id} value={bucket.id} className="bg-[#1C1B1B]">
                    {bucket.icon} {t(bucket.name) || bucket.name} ({formatMoney(bucket.currentAmount)})
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                <ChevronDown size={16} />
              </div>
            </div>
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
