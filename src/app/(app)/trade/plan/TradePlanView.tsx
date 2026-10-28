"use client";
// แก้ layout หน้านี้ ต้องแก้ TradePlanSkeleton ด้วย
import { useLoadingGate } from '@/src/hooks/useLoadingGate';
import { Sk } from '@/src/components/skeleton';
import { layout } from './skeleton-layout';

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

function TradePlanWorkspaceSkeleton(){return <Sk.Root name="trade-plan-workspace" className="space-y-6"><Sk.Card><div className="flex justify-between"><Sk.Line width={100} height={28}/><Sk.Line width={90} height={24}/></div></Sk.Card><div className="grid gap-6 xl:grid-cols-3"><div className="space-y-4">{[0,1,2].map(i=><Sk.Card key={i}><Sk.Line width={90}/><div className="mt-3 grid grid-cols-3 gap-2">{[0,1,2].map(j=><div key={j}><Sk.Line height={12} className="mb-2"/><Sk.Block height={40}/></div>)}</div></Sk.Card>)}</div><Sk.Card className="rounded-2xl border border-border bg-surface p-4 xl:col-span-2"><Sk.Chart height={400}/></Sk.Card></div></Sk.Root>;}
export default function TradePlanView({loading=false}:{loading?:boolean}){
 const fallback=<TradePlanContent forceLoading searchParams={new URLSearchParams()}/>;
 return loading?fallback:<React.Suspense fallback={fallback}><ResolvedTradePlan/></React.Suspense>;
}
function ResolvedTradePlan(){const searchParams=useSearchParams();return <TradePlanContent searchParams={searchParams}/>;}
function TradePlanContent({forceLoading=false,searchParams}:{forceLoading?:boolean;searchParams:Pick<URLSearchParams,'get'>}) {
  const { activePortfolioId, portfolios, selectPortfolio } = useApp();

  const requestedSymbol = normalizeSymbol(searchParams.get("symbol") || "");
  const [symbolInput, setSymbolInput] = React.useState(requestedSymbol);
  const { symbol, selectSymbol: setSymbol } = useSharedMarketSymbol(requestedSymbol, '', !forceLoading);
  const [marketStatus, setMarketStatus] = React.useState<MarketStatus>(requestedSymbol ? "loading" : "idle");
  const showMarketSkeleton = useLoadingGate(marketStatus === "loading");
  const [marketPrice, setMarketPrice] = React.useState<number | null>(null);
  const [analysis, setAnalysis] = React.useState<any>(null);

  React.useEffect(() => {
    setSymbolInput(symbol);
  }, [symbol,forceLoading]);

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
    if(forceLoading)return;
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
  }, [symbol, forceLoading]);


  const tradingPortfolios = React.useMemo(
    () => portfolios.filter((portfolio) => portfolio.kind === "trading"),
    [portfolios]
  );
  const selectedPortfolio = tradingPortfolios.find((portfolio) => portfolio.id === activePortfolioId) || null;
  const marketCurrency = symbol.endsWith(".BK") ? "THB" : "USD";
  const inputCurrency = symbolInput.endsWith(".BK") ? "THB" : "USD";
  const isSymbolPending = symbolInput !== symbol;

  return (
    <main className={layout.root}>
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
            <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 ">
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

      {forceLoading || showMarketSkeleton?<TradePlanWorkspaceSkeleton/>:tradingPortfolios.length === 0 ? (
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
        <section className="min-h-[320px]" aria-busy="true"><span role="status" className="sr-only">Loading…</span></section>
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
