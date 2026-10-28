"use client";

import { FinanceIcon } from "@/src/components/FinanceIcon";
import { tradeDeletionReason } from '@/src/lib/trade-deletion-policy';
import { formatNativeTotals, nativeTotals } from '@/src/lib/fx';
import React, { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Loader2, Pencil, TrendingUp, Trash2, Wallet, X } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useApp, Portfolio, Trade } from "@/src/context/AppContext";
import {
  DateRangeBar,
  DateRangeState,
  getDateBounds,
  isInRange,
  toLocalDateKey,
} from "@/src/components/DateRangeBar";

type Cur = "USD" | "THB";
type Kind = "DEPOSIT" | "WITHDRAW" | "ADJUSTMENT" | "BUY" | "SELL" | "DIVIDEND";

interface Entry {
  id: string;
  date: string;
  kind: Kind;
  accountId: string | undefined;
  cur: Cur;
  amount: number; // always positive, in `cur`
  signed: number; // + cash in / - cash out, in `cur`
  title: string;
  note?: string;
  trade?: Trade;
}

const LABELS: Record<Kind, { th: string; en: string; color: string }> = {
  DEPOSIT: { th: "ฝากเงินเข้า", en: "Deposit", color: "text-[#4EDEA3]" },
  WITHDRAW: { th: "ถอนเงินออก", en: "Withdraw", color: "text-[#FFB4AB]" },
  ADJUSTMENT: { th: "ปรับยอด", en: "Adjustment", color: "text-[#ADC6FF]" },
  BUY: { th: "ซื้อ", en: "Buy", color: "text-[#FFB4AB]" },
  SELL: { th: "ขาย", en: "Sell", color: "text-[#4EDEA3]" },
  DIVIDEND: { th: "ปันผล", en: "Dividend", color: "text-[#E9C349]" },
};

// Converts an amount between currencies, going through USD as the base.
const convert = (amount: number, from: Cur, to: Cur, rates: Record<string, number>) => {
  const usd = amount / (rates[from] || 1);
  return usd * (rates[to] || 1);
};

export function BrokerLedgerView({
  portfolio,
  dateRange,
  setDateRange,
  symbol,
}: {
  portfolio: Portfolio;
  dateRange: DateRangeState;
  setDateRange: (r: DateRangeState) => void;
  symbol?: string;
}) {
  const {
    trades,
    brokerageAccounts,
    brokerageCashBalances,
    brokerageCashEntries,
    currency,
    exchangeRates,
    language,
    formatMoney,
    updateTrade,
    removeTrade,
    deleteBrokerCashMovement,
    addToast,
  } = useApp();

  const locale = language === "th" ? "th-TH" : "en-US";

  const [accountFilter, setAccountFilter] = useState<"all" | string>("all");
  const [kindFilter, setKindFilter] = useState<"all" | "cash" | "trade">("all");
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [editSymbol, setEditSymbol] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDate, setEditDate] = useState("");
  const [isMutatingTrade, setIsMutatingTrade] = useState(false);

  const fmt = (v: number, cur: Cur) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
      currencyDisplay: "narrowSymbol",
    }).format(v);

  const toDateTimeInput = (value: string) => {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const startEditingTrade = (trade: Trade) => {
    const rate = trade.currency === "THB" ? (trade.rateAtTime || exchangeRates.THB || 1) : 1;
    setEditingTrade(trade);
    setEditSymbol(trade.asset);
    setEditQuantity(String(trade.shares ?? 0));
    setEditPrice(String((Number(trade.pricePerUnit) || 0) * rate));
    setEditDate(toDateTimeInput(trade.date));
  };

  const saveTradeEdit = async () => {
    if (!editingTrade) return;
    const quantity = Number(editQuantity);
    const priceInSourceCurrency = Number(editPrice);
    const symbol = editSymbol.trim().toUpperCase();
    if (!symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(priceInSourceCurrency) || priceInSourceCurrency <= 0 || !editDate) {
      addToast(language === "th" ? "กรอกสัญลักษณ์ จำนวน ราคา และวันที่ให้ครบ" : "Enter a symbol, quantity, price, and date.", "warning");
      return;
    }
    const rate = editingTrade.currency === "THB" ? (editingTrade.rateAtTime || exchangeRates.THB || 1) : 1;
    const priceUSD = priceInSourceCurrency / rate;
    setIsMutatingTrade(true);
    const didSave = await updateTrade(editingTrade.id, {
      asset: symbol,
      shares: quantity,
      pricePerUnit: priceUSD,
      amountUSD: quantity * priceUSD,
      originalAmount: quantity * priceInSourceCurrency,
      date: new Date(editDate).toISOString(),
    });
    setIsMutatingTrade(false);
    if (didSave) setEditingTrade(null);
  };

  const deleteTrade = async (trade: Trade) => {
    const reason = tradeDeletionReason(trade, trades, language);
    if (reason) { addToast(reason, 'warning'); return; }
    const question = language === "th"
      ? `ลบรายการ ${trade.type === "BUY" ? "ซื้อ" : "ขาย"} ${trade.asset} และคืนผลกระทบเงินในโบรกหรือไม่?`
      : `Delete this ${trade.type.toLowerCase()} of ${trade.asset} and its brokerage cash effect?`;
    if (!window.confirm(question)) return;
    setIsMutatingTrade(true);
    await removeTrade(trade.id);
    setIsMutatingTrade(false);
  };

  // Accounts (wallets) that belong to this portfolio, e.g. "เงินสด USD" and "เงินสด THB".
  const accounts = useMemo(
    () => brokerageAccounts.filter(a => a.portfolioId === portfolio.id),
    [brokerageAccounts, portfolio.id]
  );

  const balanceOf = (accountId: string) =>
    brokerageCashBalances.find(b => b.accountId === accountId)?.balance ?? 0;

  // Current cash per account (in USD for formatMoney).
  const totalBalanceUSD = accounts.reduce(
    (s, a) => s + convert(balanceOf(a.id), a.currency as Cur, "USD", exchangeRates),
    0
  );

  // Every cash movement and trade for this portfolio, merged into one list.
  const entries = useMemo<Entry[]>(() => {
    const tradeById = new Map<string, Trade>();
    trades.forEach(t => {
      if (t.dbId) tradeById.set(String(t.dbId), t);
      tradeById.set(String(t.id), t);
    });

    const list: Entry[] = [];
    const linkedTradeKeys = new Set<string>();

    brokerageCashEntries
      .filter(e => e.portfolioId === portfolio.id)
      .forEach(e => {
        const cur = (e.currency === "THB" ? "THB" : "USD") as Cur;
        const kind: Kind =
          e.type === "DEPOSIT" ? "DEPOSIT"
          : e.type === "WITHDRAW" ? "WITHDRAW"
          : e.type === "TRADE_BUY" ? "BUY"
          : e.type === "TRADE_SELL" ? "SELL"
          : "ADJUSTMENT";
        const isIn = kind === "DEPOSIT" || kind === "SELL" || kind === "ADJUSTMENT";
        const trade = e.tradeId ? tradeById.get(String(e.tradeId)) : undefined;
        if (e.tradeId) linkedTradeKeys.add(String(e.tradeId));

        list.push({
          id: e.id,
          date: e.occurredAt,
          kind,
          accountId: e.accountId,
          cur,
          amount: e.amount,
          signed: isIn ? e.amount : -e.amount,
          title: trade?.asset ?? "",
          note: [e.note, trade ? `ค่าธรรมเนียม ${((trade.fees || 0) * (trade.currency === 'USD' ? 1 : trade.rateAtTime || 1)).toLocaleString()} ${trade.currency}` : '', trade?.fxRateTHB ? `1 USD = ${trade.fxRateTHB} THB` : ''].filter(Boolean).join(' · '),
          trade,
        });
      });

    // Dividends that have no cash entry linked to them are added from the trade itself,
    // so they are not counted twice.
    trades
      .filter(t => t.portfolioId === portfolio.id && t.type === "DIVIDEND")
      .forEach(t => {
        if (linkedTradeKeys.has(String(t.dbId ?? t.id)) || linkedTradeKeys.has(String(t.id))) return;
        const cur = (t.currency === "THB" ? "THB" : "USD") as Cur;
        const amount = Math.abs(t.originalAmount ?? t.amountUSD ?? 0);
        list.push({
          id: `trade-${t.id}`,
          date: t.date,
          kind: "DIVIDEND",
          accountId: t.brokerageAccountId,
          cur,
          amount,
          signed: amount,
          title: t.asset,
          note: t.tag,
          trade: t,
        });
      });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [trades, brokerageCashEntries, portfolio.id]);

  const dateBounds = getDateBounds(dateRange);

  const records = entries
    .filter(e => !symbol || e.trade?.asset.toUpperCase() === symbol.toUpperCase())
    .filter(e => isInRange(e.date, dateBounds))
    .filter(e => accountFilter === "all" || e.accountId === accountFilter)
    .filter(e => {
      if (kindFilter === "all") return true;
      const isTrade = e.kind === "BUY" || e.kind === "SELL" || e.kind === "DIVIDEND";
      return kindFilter === "trade" ? isTrade : !isTrade;
    });

  // Historical cash flow is grouped by native currency, never revalued at today's FX.
  const netNegative = nativeTotals(records).some(t => t.net.n < 0n);

  const groups: Record<string, Entry[]> = {};
  records.forEach(e => {
    const key = toLocalDateKey(e.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  const groupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const accountName = (accountId: string | undefined) =>
    accounts.find(a => a.id === accountId)?.name ?? "";

  const chipClass = (active: boolean) =>
    cn(
      "flex-shrink-0 flex flex-col text-left px-4 py-2.5 rounded-2xl border transition-all",
      active
        ? "bg-white text-background font-black border-white"
        : "bg-surface/50 border-white/5 text-gray-400 font-bold hover:bg-white/5"
    );

  return (
    <div className={cn("flex min-w-0 flex-col", symbol ? "overflow-hidden rounded-2xl border border-border" : "min-h-screen pb-24 lg:pb-8")}>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className={cn("bg-gradient-to-b from-[#1C1B1B] to-background border-b border-border", !symbol && "sticky top-[var(--topbar-h)] z-40")}>
        <div className="flex min-w-0 items-center justify-between p-3 sm:p-4">
          <DateRangeBar value={dateRange} onChange={setDateRange} className="min-w-0 flex-1" />
        </div>

        {/* Wallets inside this portfolio */}
        <div className="px-3 sm:px-4 pb-4">
          <div className="flex max-w-full items-center gap-2 overflow-x-auto no-scrollbar pb-2">
            <button onClick={() => setAccountFilter("all")} className={chipClass(accountFilter === "all")}>
              <span className="text-sm">{portfolio.name}</span>
              <span className="text-[10px] leading-none mt-1 opacity-70">{formatMoney(totalBalanceUSD)}</span>
            </button>
            {accounts.map(a => (
              <button key={a.id} onClick={() => setAccountFilter(a.id)} className={chipClass(accountFilter === a.id)}>
                <span className="text-sm">{a.name}</span>
                <span className="text-[10px] leading-none mt-1 opacity-70">
                  {fmt(balanceOf(a.id), a.currency as Cur)}
                </span>
              </button>
            ))}
          </div>

          {/* IN / OUT / NET */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-3">
            <div className="min-w-0 bg-surface/50 border border-border rounded-xl px-2.5 py-3 sm:px-4 sm:py-4">
              <p className="text-[8px] sm:text-[10px] text-gray-500 uppercase font-bold tracking-wide truncate">IN</p>
              <div className="mt-1.5 whitespace-nowrap text-sm sm:text-xl font-black tabular-nums text-[#4EDEA3]">
                {formatNativeTotals(records, 'inc')}
              </div>
            </div>
            <div className="min-w-0 bg-surface/50 border border-border rounded-xl px-2.5 py-3 sm:px-4 sm:py-4">
              <p className="text-[8px] sm:text-[10px] text-gray-500 uppercase font-bold tracking-wide truncate">OUT</p>
              <div className="mt-1.5 whitespace-nowrap text-sm sm:text-xl font-black tabular-nums text-[#FFB4AB]">
                {formatNativeTotals(records, 'exp')}
              </div>
            </div>
            <div className="min-w-0 bg-surface/50 border border-border rounded-xl px-2.5 py-3 sm:px-4 sm:py-4">
              <p className="text-[8px] sm:text-[10px] text-gray-500 uppercase font-bold tracking-wide truncate">NET</p>
              <div
                className={cn(
                  "mt-1.5 whitespace-nowrap text-sm sm:text-xl font-black tabular-nums",
                  !netNegative ? "text-white" : "text-[#FFB4AB]"
                )}
              >
                {formatNativeTotals(records, 'net')}
              </div>
            </div>
          </div>
        </div>

        {/* Type filter */}
        <div className="px-3 sm:px-4 pb-4 border-t border-white/5 pt-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setKindFilter("all")}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap",
                kindFilter === "all" ? "bg-white text-background" : "bg-white/5 text-gray-400"
              )}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => setKindFilter("cash")}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5",
                kindFilter === "cash" ? "bg-[#ADC6FF] text-[#00285d]" : "bg-[#ADC6FF]/10 text-[#ADC6FF]"
              )}
            >
              <Wallet size={14} /> โอนเข้า-ออก
            </button>
            <button
              onClick={() => setKindFilter("trade")}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5",
                kindFilter === "trade" ? "bg-[#E9C349] text-[#00285d]" : "bg-[#E9C349]/10 text-[#E9C349]"
              )}
            >
              <TrendingUp size={14} /> ซื้อ-ขาย/ปันผล
            </button>
          </div>
        </div>
      </div>

      {/* ─── Records ────────────────────────────────────────────── */}
      <div className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 text-3xl"><FinanceIcon name="receipt" size={26} /></div>
            <h3 className="text-lg font-bold text-white mb-2">ยังไม่มีรายการ</h3>
            <p className="text-sm text-gray-500 max-w-[250px]">
              โอนเงินเข้าพอร์ตหรือบันทึกการซื้อขายเพื่อให้รายการแสดงที่นี่
            </p>
          </div>
        ) : (
          groupKeys.map(key => {
            const items = groups[key];
            const dayNegative = nativeTotals(items).some(t => t.net.n < 0n);
            const [y, m, d] = key.split("-").map(Number);
            const dateLabel = new Date(y, m - 1, d).toLocaleDateString(locale, {
              day: "numeric",
              month: "short",
              year: "numeric",
            });

            return (
              <div key={key}>
                <div className="flex items-center justify-between gap-4 mb-3 pl-1">
                  <h3 className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-wider">
                    {dateLabel}
                  </h3>
                  <span
                    className={cn(
                      "text-xs font-black tabular-nums",
                      !dayNegative ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                    )}
                  >
                    {formatNativeTotals(items, 'net')}
                  </span>
                </div>

                <div className="bg-surface/50 border border-border rounded-2xl overflow-hidden">
                  {items.map((e, idx) => {
                    const meta = LABELS[e.kind];
                    const label = language === "th" ? meta.th : meta.en;
                    const Icon = e.signed >= 0 ? ArrowDownLeft : ArrowUpRight;
                    const time = new Date(e.date).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const acc = accountName(e.accountId);
                    const title = [label, e.title].filter(Boolean).join(" ");

                    return (
                      <div
                        key={e.id}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3.5",
                          idx !== items.length - 1 && "border-b border-border/50"
                        )}
                      >
                        <div
                          className={cn(
                            "w-9 h-9 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0",
                            meta.color
                          )}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white truncate">{title}</p>
                          <p className="text-[11px] text-gray-500">
                            {time}
                            {acc ? ` · ${acc}` : ""}
                          </p>
                          {e.note && <p className="mt-1 break-words text-[11px] leading-relaxed text-gray-400">{e.note.replace(/\s*\[funding:[^\]]+\]/g, '')}</p>}
                        </div>
                        <div
                          className={cn(
                            "text-sm font-black tabular-nums whitespace-nowrap",
                            e.signed >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]"
                          )}
                        >
                          {e.signed >= 0 ? "+" : "-"}
                          {fmt(e.amount, e.cur)}
                        </div>
                        {!e.trade && (e.kind === 'DEPOSIT' || e.kind === 'WITHDRAW' || e.kind === 'ADJUSTMENT') && <button type="button" disabled={isMutatingTrade} aria-label="ลบรายการฝากถอน" className="ml-2 rounded-lg p-2 text-[#FFB4AB] disabled:opacity-40" onClick={async () => {
                          if (!window.confirm('ลบรายการนี้และย้อนยอดเงินที่เกี่ยวข้องทั้งสองฝั่งหรือไม่?')) return;
                          setIsMutatingTrade(true);
                          try { await deleteBrokerCashMovement(e.id); } finally { setIsMutatingTrade(false); }
                        }}><Trash2 size={14} /></button>}
                        {e.trade && (e.kind === "BUY" || e.kind === "SELL") && (
                          <div className="ml-1 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditingTrade(e.trade!)}
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
                              aria-label={language === "th" ? "แก้ไขรายการซื้อขาย" : "Edit trade"}
                              title={language === "th" ? "แก้ไขรายการซื้อขาย" : "Edit trade"}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              disabled={isMutatingTrade || Boolean(tradeDeletionReason(e.trade!, trades, language))}
                              onClick={() => deleteTrade(e.trade!)}
                              className="rounded-lg p-2 text-[#FFB4AB] transition hover:bg-[#FFB4AB]/10 disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={language === "th" ? "ลบรายการซื้อขาย" : "Delete trade"}
                              title={tradeDeletionReason(e.trade!, trades, language) || (language === "th" ? "ลบรายการซื้อขาย" : "Delete trade")}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {editingTrade && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="broker-trade-edit-title" className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[#ADC6FF]">Broker ledger</p>
                <h2 id="broker-trade-edit-title" className="mt-1 text-lg font-black text-white">
                  {language === "th" ? "แก้ไขรายการซื้อขาย" : "Edit trade"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !isMutatingTrade && setEditingTrade(null)}
                className="rounded-xl p-2 text-gray-400 hover:bg-white/10 hover:text-white"
                aria-label={language === "th" ? "ปิด" : "Close"}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-gray-400">{language === "th" ? "สัญลักษณ์" : "Symbol"}</span>
                <input value={editSymbol} onChange={event => setEditSymbol(event.target.value.toUpperCase())} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-bold text-white outline-none " />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-gray-400">{language === "th" ? "จำนวนหุ้น" : "Quantity"}</span>
                  <input type="number" min="0" step="any" value={editQuantity} onChange={event => setEditQuantity(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-bold text-white outline-none " />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-gray-400">
                    {language === "th" ? `ราคาต่อหน่วย ณ วันที่ซื้อขาย (${editingTrade.currency})` : `Execution price (${editingTrade.currency})`}
                  </span>
                  <input type="number" min="0" step="any" value={editPrice} onChange={event => setEditPrice(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-bold text-white outline-none " />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-gray-400">{language === "th" ? "วันและเวลาที่ซื้อขาย" : "Trade date and time"}</span>
                <input type="datetime-local" value={editDate} onChange={event => setEditDate(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-bold text-white outline-none " />
              </label>
              <p className="rounded-xl border border-[#ADC6FF]/15 bg-[#ADC6FF]/5 px-3 py-2 text-xs leading-relaxed text-gray-400">
                {language === "th"
                  ? "การแก้ไขจะอัปเดตรายการเงินสดของโบรกตามจำนวนและราคาที่บันทึก ไม่ใช่ราคาตลาดปัจจุบัน"
                  : "Saving updates the linked brokerage cash movement using this execution quantity and price, not the current market price."}
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" disabled={isMutatingTrade} onClick={() => setEditingTrade(null)} className="rounded-xl border border-border px-4 py-3 text-sm font-bold text-gray-300 hover:bg-white/5 disabled:opacity-50">
                {language === "th" ? "ยกเลิก" : "Cancel"}
              </button>
              <button type="button" disabled={isMutatingTrade} onClick={saveTradeEdit} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#4EDEA3] px-4 py-3 text-sm font-black text-[#00285d] hover:brightness-105 disabled:cursor-wait disabled:opacity-60">
                {isMutatingTrade ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {language === "th" ? "บันทึกการแก้ไข" : "Save changes"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
