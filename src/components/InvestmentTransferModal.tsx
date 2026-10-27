"use client";

import React, { useMemo, useRef, useState } from "react";
import { ArrowDown, Loader2, Wallet, Landmark } from "lucide-react";
import { useApp, MoneyBucket, BrokerageAccount } from "@/src/context/AppContext";
import { Modal } from "@/src/components/Modal";
import { CustomSelect } from "@/src/components/CustomSelect";
import { quoteInvestmentTransfer, TransferCurrency } from "@/src/lib/investment-transfer";

const CASH_CURRENCIES = new Set<TransferCurrency>(["THB", "USD"]);

/** Keeps the two operational wallets visible, while retaining legacy duplicate data untouched. */
function standardCashAccounts(accounts: BrokerageAccount[]) {
  const grouped = new Map<string, BrokerageAccount[]>();
  accounts
    .filter((account) => account.kind === "cash" && CASH_CURRENCIES.has(account.currency as TransferCurrency))
    .forEach((account) => {
      const key = `${account.portfolioId}:${account.currency}`;
      grouped.set(key, [...(grouped.get(key) || []), account]);
    });

  return Array.from(grouped.values()).map((items) =>
    [...items].sort((a, b) => {
      const aStandard = a.name.trim() === `เงินสด ${a.currency}` ? 0 : 1;
      const bStandard = b.name.trim() === `เงินสด ${b.currency}` ? 0 : 1;
      return aStandard - bStandard || a.name.localeCompare(b.name, "th");
    })[0]
  );
}

export function InvestmentTransferModal({
  bucket,
  onClose,
  initialAccountId,
}: {
  bucket: MoneyBucket;
  onClose: () => void;
  initialAccountId?: string;
}) {
  const { allBrokerageAccounts, portfolios, activePortfolioId, exchangeRates, moneyBuckets, transferBucketToBroker } = useApp();
  const accounts = useMemo(() => standardCashAccounts(allBrokerageAccounts), [allBrokerageAccounts]);
  const brokers = useMemo(
    () => portfolios.filter((portfolio) => portfolio.kind === "trading" && accounts.some((account) => account.portfolioId === portfolio.id)),
    [accounts, portfolios]
  );
  const [bucketId, setBucketId] = useState(bucket.id);
  const sourceBucket = moneyBuckets.find((item) => item.id === bucketId) || bucket;
  const sourceCurrency: TransferCurrency = sourceBucket.currency === "THB" ? "THB" : "USD";
  const requestedAccount = accounts.find((account) => account.id === initialAccountId);
  const initialBroker = brokers.find((broker) => broker.id === requestedAccount?.portfolioId)
    || brokers.find((broker) => broker.id === activePortfolioId)
    || brokers[0];
  const accountForBroker = (brokerId?: string) => {
    const choices = accounts.filter((account) => account.portfolioId === brokerId);
    return choices.find((account) => account.currency === sourceCurrency) || choices[0];
  };

  const [brokerId, setBrokerId] = useState(initialBroker?.id || "");
  const [accountId, setAccountId] = useState(requestedAccount?.id || accountForBroker(initialBroker?.id)?.id || "");
  const [sourceAmount, setSourceAmount] = useState("");
  const [fee, setFee] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [rate, setRate] = useState("");
  const [fxEntry, setFxEntry] = useState<"received" | "rate">("received");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const requestRef = useRef<{ key: string; id: string } | null>(null);
  const account = accounts.find((item) => item.id === accountId);
  const broker = brokers.find((item) => item.id === brokerId);
  const destinationCurrency = (account?.currency || sourceCurrency) as TransferCurrency;
  const isExchange = sourceCurrency !== destinationCurrency;
  const quote = quoteInvestmentTransfer({
    sourceCurrency,
    destinationCurrency,
    sourceAmount: Number(sourceAmount),
    fee: Number(fee),
    receivedAmount: isExchange && fxEntry === "received" ? Number(receivedAmount) : 0,
    rate: isExchange && fxEntry === "rate" ? Number(rate) : exchangeRates.THB,
    mode: isExchange ? fxEntry : "rate",
  });
  const insufficient = Number(sourceAmount) > sourceBucket.currentAmount;
  const invalidFee = Number(sourceAmount) > 0 && Number(fee) >= Number(sourceAmount);
  const fmt = (amount: number, denomination: string) => `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${denomination}`;
  const fieldClass = "w-full min-w-0 rounded-xl border border-foreground/10 bg-foreground/[0.04] py-3 pl-3.5 pr-16 text-lg font-bold tabular-nums text-foreground outline-none   ";

  const chooseBroker = (id: string) => {
    setBrokerId(id);
    setAccountId(accountForBroker(id)?.id || "");
    setReceivedAmount("");
    setRate("");
  };
  const chooseAccount = (id: string) => {
    setAccountId(id);
    setReceivedAmount("");
    setRate("");
  };
  const chooseBucket = (id: string) => {
    const nextBucket = moneyBuckets.find((item) => item.id === id);
    const nextCurrency: TransferCurrency = nextBucket?.currency === "THB" ? "THB" : "USD";
    const choices = accounts.filter((item) => item.portfolioId === brokerId);
    setBucketId(id);
    setAccountId((choices.find((item) => item.currency === nextCurrency) || choices[0])?.id || "");
    setSourceAmount("");
    setFee("");
    setReceivedAmount("");
    setRate("");
  };
  const close = () => { if (!savingRef.current) onClose(); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quote || !account || insufficient || invalidFee || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const key = JSON.stringify([sourceBucket.id, account.id, quote]);
    if (requestRef.current?.key !== key) requestRef.current = { key, id: crypto.randomUUID() };
    try {
      const saved = await transferBucketToBroker({
        id: requestRef.current.id,
        bucketId: sourceBucket.id,
        accountId: account.id,
        sourceAmount: quote.sourceAmount,
        receivedAmount: quote.receivedAmount,
        fee: quote.fee,
        thbPerUsd: quote.rate || exchangeRates.THB,
      });
      if (saved) onClose();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={close}
      title="โอนเงินเข้าพอร์ตลงทุน"
      contentClassName="p-5 sm:p-6"
      footer={
        <div className="flex gap-3">
          <button type="button" disabled={saving} onClick={close} className="rounded-xl border border-foreground/10 px-5 py-3.5 text-sm font-bold text-gray-400 hover:bg-foreground/5 disabled:opacity-40">ยกเลิก</button>
          <button type="submit" form="investment-transfer-form" disabled={saving || !quote || !account || insufficient || invalidFee} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-black text-primary-foreground hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}{saving ? "กำลังบันทึก…" : "ยืนยันการโอน"}
          </button>
        </div>
      }
    >
      <form id="investment-transfer-form" onSubmit={submit} className="space-y-4">
        <fieldset disabled={saving} className="min-w-0 space-y-4 disabled:opacity-60">
          <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
            <label className="mb-2 block text-xs font-semibold text-gray-400">จาก Bucket</label>
            <CustomSelect
              value={bucketId}
              onChange={chooseBucket}
              items={(moneyBuckets.length ? moneyBuckets : [sourceBucket]).map((item) => ({
                value: item.id,
                label: <span className="flex items-center gap-2"><Landmark size={16} strokeWidth={1.5} className="shrink-0 text-gray-400" /><span className="min-w-0 truncate">{item.name}</span><span className="ml-auto shrink-0 text-xs text-gray-400">{fmt(item.currentAmount, item.currency === "THB" ? "THB" : "USD")}</span></span>,
              }))}
            />
            <p className="mt-2 text-xs text-gray-400">ยอดที่ใช้ได้ {fmt(sourceBucket.currentAmount, sourceCurrency)}</p>
          </div>

          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-gray-400"><ArrowDown size={14} className="text-gain" /> เข้าพอร์ตลงทุน</p>
            {brokers.length === 0 ? <p className="rounded-xl border border-dashed border-foreground/15 p-4 text-sm text-gray-400">ยังไม่มีพอร์ตลงทุน กรุณาเพิ่มโบรกเกอร์ก่อน</p> : <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300">โบรกเกอร์ปลายทาง</label>
                <CustomSelect value={brokerId} onChange={chooseBroker} placeholder="เลือกโบรกเกอร์" items={brokers.map((item) => ({ value: item.id, label: <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}</span> }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300">บัญชีเงินสดปลายทาง</label>
                <CustomSelect value={accountId} onChange={chooseAccount} placeholder="เลือกบัญชีเงินสด" items={accounts.filter((item) => item.portfolioId === brokerId).map((item) => ({ value: item.id, label: <span className="flex items-center gap-2"><span className={item.currency === "THB" ? "text-gain" : "text-[#9B7BFF]"}>{item.currency === "THB" ? "฿" : "$"}</span>{item.currency} · {item.name}</span> }))} />
              </div>
            </>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2"><label htmlFor="funding-source" className="text-xs font-semibold text-gray-300">ยอดที่หักจาก Bucket</label><div className="relative"><input id="funding-source" type="number" inputMode="decimal" min="0.01" step="0.01" required value={sourceAmount} onChange={(event) => setSourceAmount(event.target.value)} placeholder="0.00" className={fieldClass} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">{sourceCurrency}</span></div></div>
            <div className="space-y-2"><label htmlFor="funding-fee" className="text-xs font-semibold text-gray-300">ค่าธรรมเนียม <span className="font-normal text-gray-500">(ถ้ามี)</span></label><div className="relative"><input id="funding-fee" type="number" inputMode="decimal" min="0" step="0.01" value={fee} onChange={(event) => setFee(event.target.value)} placeholder="0.00" className={fieldClass} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">{sourceCurrency}</span></div></div>
          </div>
          <p className="-mt-2 text-xs text-gray-500">ค่าธรรมเนียมรวมอยู่ในยอดที่หักจาก Bucket แล้ว</p>
          {insufficient && <p role="alert" className="text-xs text-loss">ยอดหักเกินเงินคงเหลือใน Bucket</p>}
          {invalidFee && <p role="alert" className="text-xs text-loss">ค่าธรรมเนียมต้องน้อยกว่ายอดที่หัก</p>}

          {isExchange ? <div className="space-y-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300">ข้อมูลการแลกเงิน</label>
              <CustomSelect
                value={fxEntry}
                onChange={(value) => setFxEntry(value as "received" | "rate")}
                items={[
                  { value: "received", label: "ยอดที่เข้าบัญชีจริง · แนะนำ" },
                  { value: "rate", label: "อัตราแลกเปลี่ยนจริง" },
                ]}
              />
            </div>
            {fxEntry === "received" ? <div className="space-y-2">
              <label htmlFor="funding-received" className="text-xs font-semibold text-gray-300">ยอดที่เข้าบัญชีจริง</label>
              <div className="relative"><input id="funding-received" type="number" inputMode="decimal" min="0.01" step="0.01" required value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} placeholder="0.00" className={fieldClass} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">{destinationCurrency}</span></div>
              <p className="text-xs leading-relaxed text-gray-500">กรอกตัวเลขที่โบรกเกอร์ได้รับจริง ระบบจะคำนวณเรตของรายการนี้ให้อัตโนมัติ</p>
            </div> : <div className="space-y-2">
              <label htmlFor="funding-rate" className="text-xs font-semibold text-gray-300">1 USD เท่ากับ</label>
              <div className="relative"><input id="funding-rate" type="number" inputMode="decimal" min="0.000001" step="any" required value={rate} onChange={(event) => setRate(event.target.value)} placeholder="เช่น 33.50" className={fieldClass} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">THB</span></div>
              <p className="text-xs leading-relaxed text-gray-500">ใช้เรตจากธนาคารหรือโบรกเกอร์ ระบบจะคำนวณยอดที่เข้าบัญชีให้</p>
            </div>}
          </div> : <p className="rounded-xl bg-foreground/[0.03] px-3 py-2.5 text-xs text-gray-400">สกุลเงินต้นทางและปลายทางตรงกัน จึงไม่มีการแลกเงิน</p>}

          <div aria-live="polite" className="space-y-2.5 rounded-2xl border border-gain/15 bg-gain/[0.04] p-4">
            <div className="flex items-center justify-between gap-3 text-xs text-gray-400"><span>หักจาก Bucket</span><span className="tabular-nums">{quote ? fmt(quote.sourceAmount, sourceCurrency) : "—"}</span></div>
            {Number(fee) > 0 && <div className="flex justify-between gap-3 text-xs text-gray-400"><span>ค่าธรรมเนียม</span><span>{fmt(Number(fee), sourceCurrency)}</span></div>}
            {quote?.rate && <div className="flex justify-between gap-3 text-xs text-gray-400"><span>เรตที่เกิดขึ้นจริง</span><span>1 USD = {quote.rate.toLocaleString("en-US", { maximumFractionDigits: 6 })} THB</span></div>}
            <div className="flex items-center justify-between gap-3 border-t border-foreground/5 pt-3"><span className="min-w-0 truncate text-xs font-semibold text-gray-300">เข้าบัญชี {broker?.name || "ปลายทาง"}</span><span className="shrink-0 text-lg font-black tabular-nums text-gain">{quote ? fmt(quote.receivedAmount, destinationCurrency) : `— ${destinationCurrency}`}</span></div>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
