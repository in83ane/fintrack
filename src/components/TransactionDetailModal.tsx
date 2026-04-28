"use client";

import React from "react";
import { Modal } from "@/src/components/Modal";
import { useApp } from "@/src/context/AppContext";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Calendar,
  DollarSign,
  Hash,
  Tag,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  PiggyBank,
  Rocket,
  Lightbulb
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/src/lib/utils";

interface TransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: {
    id: number | string;
    type: string;
    asset?: string;
    amountUSD: number;
    date: string;
    shares?: number;
    pricePerUnit?: number;
    sourceBucketId?: string;
    tag?: string;
    rateAtTime?: number;
    currency?: string;
    // For bucket/cash activities
    bucketName?: string;
    category?: string;
    note?: string;
    activityType?: string;
    isTransfer?: boolean;
    source?: 'cash' | 'bucket';
  } | null;
}

export function TransactionDetailModal({ isOpen, onClose, transaction }: TransactionDetailModalProps) {
  const { t, formatMoney, moneyBuckets, language } = useApp();

  if (!transaction) return null;

  const sourceBucket = transaction.sourceBucketId
    ? moneyBuckets.find(b => b.id === transaction.sourceBucketId)
    : null;

  const isTrade = transaction.asset !== undefined;
  const isBucketActivity = transaction.source === 'bucket' || (transaction.activityType !== undefined && !isTrade);
  const isCashActivity = transaction.source === 'cash' || (transaction.category !== undefined && !isTrade && !isBucketActivity);

  // Icon mapping for activity types
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'income_split': return PiggyBank;
      case 'invest': return Rocket;
      case 'profit_split': return Lightbulb;
      case 'deposit': return ArrowDownToLine;
      case 'withdraw': return ArrowUpFromLine;
      default: return Wallet;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'income_split': return '#ADC6FF';
      case 'invest': return '#FF8B9A';
      case 'profit_split': return '#4EDEA3';
      case 'deposit': return '#4EDEA3';
      case 'withdraw': return '#FFB4AB';
      default: return '#E9C349';
    }
  };

  const getTradeTypeColor = (type: string) => {
    switch (type) {
      case 'BUY': return '#4EDEA3';
      case 'SELL': return '#FFB4AB';
      case 'DIVIDEND': return '#E9C349';
      case 'IMPORT': return '#ADC6FF';
      default: return '#6B7280';
    }
  };

  const getTagColor = (tag: string) => {
    switch (tag) {
      case 'dayTrade': return '#FF8B9A';
      case 'swingTrade': return '#ADC6FF';
      case 'longTerm': return '#4EDEA3';
      case 'dividendIncome': return '#E9C349';
      case 'cryptoTrade': return '#A78BFA';
      case 'forexTrade': return '#60A5FA';
      default: return '#6B7280';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("transactionDetails") || "Transaction Details"}>
      <div className="space-y-6">
        {/* Header - Transaction Type */}
        <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              isTrade
                ? `bg-[${getTradeTypeColor(transaction.type)}]/10`
                : `bg-[${getActivityColor(transaction.activityType || 'deposit')}]/10`
            )}
            style={{
              backgroundColor: isTrade
                ? `${getTradeTypeColor(transaction.type)}15`
                : `${getActivityColor(transaction.activityType || 'deposit')}15`
            }}
            >
              {isTrade ? (
                transaction.type === 'BUY' || transaction.type === 'IMPORT'
                  ? <ArrowUpRight size={24} style={{ color: getTradeTypeColor(transaction.type) }} />
                  : <ArrowDownLeft size={24} style={{ color: getTradeTypeColor(transaction.type) }} />
              ) : (
                React.createElement(getActivityIcon(transaction.activityType || 'deposit'), {
                  size: 24,
                  style: { color: getActivityColor(transaction.activityType || 'deposit') }
                })
              )}
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                {isTrade
                  ? `${transaction.type} ${transaction.asset}`
                  : isBucketActivity
                    ? t(transaction.bucketName || transaction.type === 'DEPOSIT' || transaction.type === 'WITHDRAW' ? (transaction.type === 'DEPOSIT' ? 'deposit' : 'withdraw') : (transaction.activityType || '')) || transaction.bucketName || transaction.type || transaction.activityType
                    : t(transaction.category || '') || transaction.category
                }
              </h3>
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                {format(new Date(transaction.date), language === 'th' ? 'dd MMM yyyy HH:mm' : 'MMM dd, yyyy HH:mm')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={cn(
              "text-xl font-black",
              transaction.type === 'BUY' || transaction.type === 'IMPORT' ||
              transaction.type === 'INCOME' || transaction.type === 'DEPOSIT' ||
              (transaction.activityType && ['deposit', 'income_split', 'profit_split'].includes(transaction.activityType))
                ? 'text-[#4EDEA3]'
                : transaction.type === 'SELL' || transaction.type === 'EXPENSE' || transaction.type === 'WITHDRAW' || transaction.activityType === 'withdraw'
                  ? 'text-[#FFB4AB]'
                  : 'text-white'
            )}>
              {(transaction.type === 'BUY' || transaction.type === 'IMPORT' || transaction.type === 'INCOME' || transaction.type === 'DEPOSIT') ? '+' : ''}
              {(transaction.type === 'SELL' || transaction.type === 'EXPENSE' || transaction.type === 'WITHDRAW') ? '-' : ''}
              {formatMoney(transaction.amountUSD)}
            </p>
          </div>
        </div>

        {/* Trade Details */}
        {isTrade && transaction.asset && (
          <>
            {/* Quantity & Price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <Hash size={14} className="text-gray-500" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {t("shares") || "Shares"}
                  </span>
                </div>
                <p className="text-lg font-black text-white">
                  {transaction.shares?.toFixed(6) || '0.00'}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">{transaction.asset}</p>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={14} className="text-gray-500" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {t("pricePerUnit") || "Price/Unit"}
                  </span>
                </div>
                <p className="text-lg font-black text-white">
                  {formatMoney(transaction.pricePerUnit || 0, transaction.currency as any, transaction.rateAtTime)}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {t("atTimeOfTrade") || "At time of trade"}
                </p>
              </div>
            </div>

            {/* Total Value */}
            <div className="p-4 bg-gradient-to-br from-[#ADC6FF]/5 to-[#4EDEA3]/5 rounded-2xl border border-[#ADC6FF]/20">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  {t("totalValue") || "Total Value"}
                </span>
                <TrendingUp size={14} className="text-[#ADC6FF]" />
              </div>
              <p className="text-2xl font-black text-white">
                {formatMoney(transaction.amountUSD)}
              </p>
            </div>

            {/* Source Bucket */}
            {sourceBucket && (
              <div className="p-4 bg-[#E9C349]/5 rounded-2xl border border-[#E9C349]/20">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet size={14} className="text-[#E9C349]" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {t("sourceBucket") || "Source Bucket"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{sourceBucket.icon}</span>
                    <div>
                      <p className="text-sm font-bold text-white">
                        {t(sourceBucket.name) || sourceBucket.name}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {formatMoney(sourceBucket.currentAmount)} {t("remaining") || "remaining"}
                      </p>
                    </div>
                  </div>
                  <div className="w-20 h-20 rounded-full -mr-2 opacity-20 blur-xl"
                       style={{ backgroundColor: sourceBucket.color }} />
                </div>
              </div>
            )}

            {/* Tag */}
            {transaction.tag && (
              <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/10">
                <Tag size={14} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  {t("tag") || "Tag"}:
                </span>
                <span
                  className="px-2 py-1 rounded-lg text-xs font-black uppercase tracking-wide"
                  style={{
                    backgroundColor: `${getTagColor(transaction.tag)}20`,
                    color: getTagColor(transaction.tag)
                  }}
                >
                  {t(transaction.tag) || transaction.tag}
                </span>
              </div>
            )}

            {/* Exchange Rate */}
            {transaction.rateAtTime && transaction.rateAtTime !== 1 && (
              <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/10">
                <TrendingUp size={14} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  {t("exchangeRate") || "Exchange Rate"}:
                </span>
                <span className="text-xs font-bold text-white">
                  1 USD = {transaction.rateAtTime} {transaction.currency}
                </span>
              </div>
            )}
          </>
        )}

        {/* Bucket Activity Details */}
        {isBucketActivity && (
          <>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                {React.createElement(getActivityIcon(transaction.type === 'DEPOSIT' || transaction.type === 'WITHDRAW' ? (transaction.type === 'DEPOSIT' ? 'deposit' : 'withdraw') : (transaction.activityType || 'deposit')), {
                  size: 14,
                  style: { color: getActivityColor(transaction.type === 'DEPOSIT' || transaction.type === 'WITHDRAW' ? (transaction.type === 'DEPOSIT' ? 'deposit' : 'withdraw') : (transaction.activityType || 'deposit')) }
                })}
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  {t(transaction.type === 'DEPOSIT' || transaction.type === 'WITHDRAW' ? (transaction.type === 'DEPOSIT' ? 'deposit' : 'withdraw') : (transaction.activityType || '')) || transaction.type || transaction.activityType}
                </span>
              </div>
              {transaction.note && (
                <p className="text-sm text-gray-300 leading-relaxed">
                  {transaction.note}
                </p>
              )}
            </div>

            {transaction.bucketName && (
              <div className="p-4 bg-[#E9C349]/5 rounded-2xl border border-[#E9C349]/20">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet size={14} className="text-[#E9C349]" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {t("bucket") || "Bucket"}
                  </span>
                </div>
                <p className="text-sm font-bold text-white">
                  {t(transaction.bucketName) || transaction.bucketName}
                </p>
              </div>
            )}
          </>
        )}

        {/* Cash Activity Details */}
        {isCashActivity && (
          <>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign size={14} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  {t("category") || "Category"}
                </span>
              </div>
              <p className="text-sm font-bold text-white">
                {t(transaction.category || '') || transaction.category}
              </p>
            </div>

            {transaction.isTransfer && (
              <div className="p-4 bg-[#ADC6FF]/5 rounded-2xl border border-[#ADC6FF]/20">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet size={14} className="text-[#ADC6FF]" />
                  <span className="text-xs font-bold text-[#ADC6FF] uppercase tracking-wide">
                    {t("transfer") || "Money Transfer"}
                  </span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {transaction.type === 'DEPOSIT'
                    ? `Money moved from Cash to ${t(transaction.category || '') || transaction.category}`
                    : `Money moved from ${t(transaction.category || '') || transaction.category} back to Cash`
                  }
                </p>
              </div>
            )}

            {transaction.note && (
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <Tag size={14} className="text-gray-500" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {t("note") || "Note"}
                  </span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {transaction.note}
                </p>
              </div>
            )}
          </>
        )}

        {/* Timestamp */}
        <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/10">
          <Calendar size={14} className="text-gray-500" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {t("timestamp") || "Timestamp"}:
          </span>
          <span className="text-xs font-bold text-white">
            {format(new Date(transaction.date), language === 'th' ? 'dd MMMM yyyy HH:mm:ss' : 'MMMM dd, yyyy HH:mm:ss')}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white/5 text-gray-400 rounded-xl font-bold text-sm hover:text-white hover:bg-white/10 transition-all"
          >
            {t("close") || "Close"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
