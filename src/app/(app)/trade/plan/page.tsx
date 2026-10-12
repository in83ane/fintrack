"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, BarChart2, BriefcaseBusiness, Search, Target } from "lucide-react";
import { useSharedMarketSymbol } from '@/src/hooks/useSharedMarketSymbol';
import { useSearchParams } from "next/navigation";
import { CustomSelect } from "@/src/components/CustomSelect";
import { DcaOrderSystem } from "@/src/components/DcaOrderSystem";
import { useApp } from "@/src/context/AppContext";

const normalizeSymbol = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "");
type MarketStatus = "idle" | "loading" | "available" | "not_found" | "unavailable";

function TradePlanSkeleton() {
  return (
    <section className="animate-pulse rounded-3xl border border-border bg-surface p-5 sm:p-7" aria-label="กำลังตรวจสอบข้อมูลตลาด">
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div className="space-y-2">
          <div className="h-4 w-36 rounded bg-white/10" />
          <div className="h-3 w-52 rounded bg-white/[0.06]" />
        </div>
        <div className="h-7 w-20 rounded-lg bg-[#ADC6FF]/10" />
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-1">
          <div className="h-14 rounded-2xl bg-white/[0.06]" />
          <div className="h-48 rounded-2xl bg-white/[0.04]" />
          <div className="h-12 rounded-xl bg-white/[0.04]" />
        </div>
        <div className="h-72 rounded-2xl bg-black/20 xl:col-span-2" />
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold text-gray-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ADC6FF]" /> กำลังตรวจสอบ ticker และราคาตลาด
      </div>
    </section>
  );
}

export default function TradePlanPage() {
  return (
    <React.Suspense fallback={<main className="min-h-screen bg-background" />}>
      <TradePlanContent />
    </React.Suspense>
  );
}

function TradePlanContent() {
  const { activePortfolioId, portfolios, selectPortfolio } = useApp();
  const searchParams = useSearchParams();
  const requestedSymbol = normalizeSymbol(searchParams.get("symbol") || "");
  const [symbolInput, setSymbolInput] = React.useState(requestedSymbol);
  const { symbol, selectSymbol: setSymbol } = useSharedMarketSymbol(requestedSymbol);
  const [marketStatus, setMarketStatus] = React.useState<MarketStatus>(requestedSymbol ? "loading" : "idle");
  const [marketPrice, setMarketPrice] = React.useState<number | null>(null);
  const [analysis, setAnalysis] = React.useState<any>(null);

  React.useEffect(() => {
    setSymbolInput(symbol);
  }, [symbol]);

  // Do not recreate the entire plan for every keypress.  A symbol only becomes
  // active once typing pauses, is confirmed with Enter, or the field loses focus.
  React.useEffect(() => {
    if (!symbolInput || symbolInput === symbol) return;
    const timer = window.setTimeout(() => {
      setSymbol(symbolInput);
      setMarketStatus(symbolInput ? "loading" : "idle");
    }, 550);
    return () => window.clearTimeout(timer);
  }, [symbolInput, symbol, setSymbol]);

  const applySymbolNow = React.useCallback(() => {
    // Focusing and leaving the field without changing the text must not reload
    // the plan (or replace an existing not-found message with a loading state).
    if (!symbolInput || symbolInput === symbol) return;
    setSymbol(symbolInput);
    setMarketStatus(symbolInput ? "loading" : "idle");
  }, [symbol, symbolInput, setSymbol]);

  // Validate the ticker before mounting the DCA workspace.  This keeps the
  // plan form out of view while a symbol is still being checked.
  React.useEffect(() => {
    if (!symbol) {
      setMarketStatus("idle");
      setMarketPrice(null);
      return;
    }
    const controller = new AbortController();
    setMarketStatus("loading");
    setMarketPrice(null);
    const validateTicker = async () => {
      try {
        const response = await fetch(`/api/market/analysis?symbol=${encodeURIComponent(symbol)}&interval=60`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          setMarketStatus("not_found");
          return;
        }
        if (!response.ok) {
          setMarketStatus("unavailable");
          return;
        }
        const result = await response.json();
        const price = Number(result?.data?.currentPrice);
        if (result?.data?.symbol === symbol && price > 0) {
          setMarketPrice(price);
          setAnalysis(result.data);
          // ATH loads independently; do not hold up the trading workspace.
          void fetch(`/api/market/ath?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal })
            .then(response => response.ok ? response.json() : null)
            .then(history => {
              if (!controller.signal.aborted && history?.ath > 0) setAnalysis((previous: any) => ({ ...previous, ath: history.ath }));
            }).catch(() => { /* Ladder explicitly labels missing ATH. */ });
          setMarketStatus("available");
        } else {
          setMarketStatus("not_found");
        }
      } catch (error: any) {
        if (error?.name !== "AbortError" && !controller.signal.aborted) setMarketStatus("unavailable");
      }
    };
    void validateTicker();
    return () => controller.abort();
  }, [symbol]);


  const tradingPortfolios = React.useMemo(
    () => portfolios.filter((portfolio) => portfolio.kind === "trading"),
    [portfolios]
  );
  const selectedPortfolio = tradingPortfolios.find((portfolio) => portfolio.id === activePortfolioId) || null;
  const marketCurrency = symbol.endsWith(".BK") ? "THB" : "USD";
  const inputCurrency = symbolInput.endsWith(".BK") ? "THB" : "USD";
  const isSymbolPending = symbolInput !== symbol;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <section className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#ADC6FF]/25 bg-[#ADC6FF]/10 text-[#ADC6FF]">
              <Target size={19} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ADC6FF]">Trade</p>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">วางแผนซื้อขาย</h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">เลือกพอร์ตและสินทรัพย์ก่อนกำหนดไม้ซื้อ ระบบจะบันทึกรายการลงพอร์ตที่เลือกเท่านั้น</p>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-[530px]">
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-gray-500">พอร์ตลงทุน</label>
            <CustomSelect
              value={selectedPortfolio?.id || ""}
              onChange={selectPortfolio}
              placeholder={tradingPortfolios.length ? "เลือกพอร์ตลงทุน" : "ยังไม่มีพอร์ตลงทุน"}
              disabled={tradingPortfolios.length === 0}
              items={tradingPortfolios.map((portfolio) => ({ value: portfolio.id, label: portfolio.name }))}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="trade-symbol" className="text-[10px] font-black uppercase tracking-wider text-gray-500">สัญลักษณ์</label>
              {symbol && (
                <Link
                  href={`/terminal?symbol=${encodeURIComponent(symbol)}`}
                  replace={false}
                  className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#ADC6FF]/30 bg-[#ADC6FF]/10 px-3 py-1.5 text-xs font-bold text-[#ADC6FF] transition-colors hover:border-[#ADC6FF]/60 hover:bg-[#ADC6FF]/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ADC6FF] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={`วิเคราะห์หุ้น ${symbol} ใน Terminal`}
                  title={`เปิดกราฟ ${symbol} ใน Terminal`}
                >
                  <BarChart2 size={14} aria-hidden="true" />
                  วิเคราะห์หุ้น
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              )}
            </div>
            <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-[#ADC6FF]">
              <Search size={15} className="text-gray-500" />
              <input
                id="trade-symbol"
                value={symbolInput}
                onChange={(event) => setSymbolInput(normalizeSymbol(event.target.value))}
                onBlur={applySymbolNow}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applySymbolNow();
                    const input = event.currentTarget;
                    // Defer the blur until after React has committed the search
                    // state, so Enter always dismisses the field.
                    window.setTimeout(() => input.blur(), 0);
                  }
                }}
                placeholder="เช่น NVDA, PTT.BK"
                className="min-w-0 flex-1 bg-transparent text-sm font-black uppercase text-white outline-none placeholder:font-medium placeholder:normal-case placeholder:text-gray-600"
                autoComplete="off"
              />
              {isSymbolPending ? (
                <span className="flex items-center gap-1.5 text-[10px] font-black text-[#ADC6FF]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ADC6FF]" />กำลังค้นหา</span>
              ) : symbolInput ? (
                <span className="text-[10px] font-black text-gray-500">{inputCurrency}</span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {tradingPortfolios.length === 0 ? (
        <section className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface px-6 text-center">
          <BriefcaseBusiness size={30} className="mb-4 text-[#ADC6FF]" />
          <h2 className="text-lg font-black text-white">เริ่มจากสร้างพอร์ตลงทุน</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-gray-400">Trade แยกจาก Bucket เพื่อให้ยอดเงินและประวัติการซื้อขายอยู่กับโบรกเกอร์ที่ถูกต้อง</p>
          <Link href="/portfolio" className="mt-5 rounded-xl bg-[#ADC6FF] px-4 py-2.5 text-xs font-black text-[#00285d] transition-opacity hover:opacity-90">ไปหน้า Portfolio</Link>
        </section>
      ) : !selectedPortfolio ? (
        <section className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface px-6 text-center">
          <BriefcaseBusiness size={30} className="mb-4 text-[#ADC6FF]" />
          <h2 className="text-lg font-black text-white">เลือกพอร์ตลงทุนก่อน</h2>
          <p className="mt-2 text-sm text-gray-400">เลือกโบรกเกอร์จากรายการด้านบนเพื่อเปิดแผนซื้อขาย</p>
        </section>
      ) : !symbol ? (
        <section className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface px-6 text-center">
          <Search size={30} className="mb-4 text-[#ADC6FF]" />
          <h2 className="text-lg font-black text-white">ระบุสัญลักษณ์ที่ต้องการซื้อขาย</h2>
          <p className="mt-2 text-sm text-gray-400">ตัวอย่าง NVDA, VOO หรือ PTT.BK</p>
        </section>
      ) : marketStatus === "loading" ? (
        <TradePlanSkeleton />
      ) : marketStatus === "not_found" ? (
        <section className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-[#FFB4AB]/25 bg-[#FFB4AB]/5 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FFB4AB]/25 bg-[#FFB4AB]/10 text-lg font-black text-[#FFB4AB]">?</div>
          <h2 className="mt-4 text-lg font-black text-white">ไม่พบสัญลักษณ์ “{symbol}”</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-gray-400">ตรวจสอบ ticker อีกครั้ง เช่น NVDA, TSLA, VOO หรือหุ้นไทยให้ใส่ท้ายด้วย .BK เช่น PTT.BK</p>
          <button
            type="button"
            onClick={() => { setSymbolInput(""); setSymbol(""); }}
            className="mt-5 rounded-xl border border-border px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-white/5"
          >
            ล้างสัญลักษณ์
          </button>
        </section>
      ) : marketStatus === "unavailable" ? (
        <section className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-[#E9C349]/25 bg-[#E9C349]/5 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E9C349]/25 bg-[#E9C349]/10 text-lg font-black text-[#E9C349]">!</div>
          <h2 className="mt-4 text-lg font-black text-white">ยังโหลดข้อมูลตลาดไม่ได้</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-gray-400">ลองค้นหาอีกครั้งในอีกสักครู่ ระบบยังยืนยันราคาของ “{symbol}” ไม่ได้</p>
          <button type="button" onClick={() => { setSymbolInput(""); setSymbol(""); }} className="mt-5 rounded-xl border border-border px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-white/5">ค้นหาใหม่</button>
        </section>
      ) : (
        <DcaOrderSystem
          key={`${selectedPortfolio.id}-${symbol}`}
          initialSymbol={symbol}
          initialPrice={marketPrice || 0}
          marketCurrency={marketCurrency}
          signalData={analysis}
        />
      )}
    </main>
  );
}
