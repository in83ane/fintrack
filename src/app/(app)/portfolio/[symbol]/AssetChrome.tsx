"use client";
import React from 'react';
import Link from 'next/link';
import {motion} from 'framer-motion';
import {ArrowLeft,ChevronLeft,ChevronRight,Activity,Clock,TrendingUp,DollarSign,BarChart3,ArrowUpRight} from 'lucide-react';
import {useApp} from '@/src/context/AppContext';
import {cn} from '@/src/lib/utils';
import {GlideGroup,GlidingIndicator} from '@/src/components/GlidingIndicator';
export type TimePeriod = "1d" | "5d" | "1m" | "6m" | "ytd" | "1y" | "5y";
export interface PeriodMeta {
  label: string;
  labelTh: string;
  interval: string;
  yahooInterval: string;
  yahooRange: string;
  changeLabel: string;
  changeLabelTh: string;
}
export const VALID_PERIODS: TimePeriod[] = ["1d", "5d", "1m", "6m", "ytd", "1y", "5y"];
export const PERIOD_CONFIG: Record<TimePeriod, PeriodMeta> = {
  "1d":  {
    label: "1D",
    labelTh: "1วัน",
    interval: "1min",
    yahooInterval: "1m",
    yahooRange: "1d",
    changeLabel: "Today",
    changeLabelTh: "วันนี้"
  },
  "5d":  {
    label: "5D",
    labelTh: "5วัน",
    interval: "15min",
    yahooInterval: "15m",
    yahooRange: "5d",
    changeLabel: "5 days",
    changeLabelTh: "5 วันย้อนหลัง"
  },
  "1m":  {
    label: "1M",
    labelTh: "1ด.",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "1mo",
    changeLabel: "1 month",
    changeLabelTh: "1 เดือนย้อนหลัง"
  },
  "6m":  {
    label: "6M",
    labelTh: "6ด.",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "6mo",
    changeLabel: "6 months",
    changeLabelTh: "6 เดือนย้อนหลัง"
  },
  "ytd": {
    label: "YTD",
    labelTh: "YTD",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "ytd",
    changeLabel: "Year to date",
    changeLabelTh: "ตั้งแต่ต้นปี"
  },
  "1y":  {
    label: "1Y",
    labelTh: "1ปี",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "1y",
    changeLabel: "1 year",
    changeLabelTh: "1 ปีย้อนหลัง"
  },
  "5y":  {
    label: "5Y",
    labelTh: "5ปี",
    interval: "1day",
    yahooInterval: "1d",
    yahooRange: "5y",
    changeLabel: "5 years",
    changeLabelTh: "5 ปีย้อนหลัง"
  },
};
export interface StatCardProps {
  label: string;
  icon: React.ElementType;
  isPositive?: boolean;
  isActive?: boolean;
  children: React.ReactNode;
}
export function StatCard({ label, icon: Icon, isPositive, isActive, children }: StatCardProps) {
  const positive = isPositive ?? true;

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-[#1C1B1B] p-4 rounded-2xl border transition-all duration-300",
        isActive ? "border-[#ADC6FF]/30 shadow-lg shadow-[#ADC6FF]/5" : "border-white/5 hover:border-white/10"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={cn("p-1.5 rounded-lg transition-colors", positive ? "bg-[#4EDEA3]/10" : "bg-white/5")}>
          <Icon size={14} className={positive ? "text-[#4EDEA3]" : "text-gray-400"} />
        </div>
      </div>
      {children}
    </motion.div>
  );
}
export const ASSET_PERIODS: {key:TimePeriod;label:string;labelTh:string}[]=[
    { key: "1d",  label: "1D",  labelTh: "1วัน" },
    { key: "5d",  label: "5D",  labelTh: "5วัน" },
    { key: "1m",  label: "1M",  labelTh: "1ด."  },
    { key: "6m",  label: "6M",  labelTh: "6ด."  },
    { key: "ytd", label: "YTD", labelTh: "YTD"  },
    { key: "1y",  label: "1Y",  labelTh: "1ปี"  },
    { key: "5y",  label: "5Y",  labelTh: "5ปี"  },
  ];
export const ASSET_METRICS={price:{key:'livePrice',icon:TrendingUp},cost:{key:'avgCost',icon:DollarSign},holdings:{key:'holdings',icon:BarChart3},returns:{key:'totalReturn',icon:ArrowUpRight}};

export function AssetHeader({identity,price,symbol='',handlePreviousAsset,handleNextAsset,canGoPrevious=false,canGoNext=false}:{identity:React.ReactNode;price:React.ReactNode;symbol?:string;handlePreviousAsset?:()=>void;handleNextAsset?:()=>void;canGoPrevious?:boolean;canGoNext?:boolean}){const {language}=useApp();return (<section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/portfolio" className="p-3 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all">
              <ArrowLeft size={20} />
            </Link>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousAsset}
                disabled={!canGoPrevious}
                className={cn("p-2 rounded-lg transition-all", canGoPrevious ? "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-600 cursor-not-allowed")}
              >
                <ChevronLeft size={20} />
              </button>

{identity}
              <button
                onClick={handleNextAsset}
                disabled={!canGoNext}
                className={cn("p-2 rounded-lg transition-all", canGoNext ? "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-600 cursor-not-allowed")}
              >
                <ChevronRight size={20} />
              </button>

              <Link href={`/terminal?symbol=${encodeURIComponent(symbol)}`} replace={false} className="ml-2 px-4 py-2 bg-[#ADC6FF] text-[#00285d] font-bold text-xs rounded-xl uppercase tracking-wide flex items-center gap-2 hover:brightness-110 transition-all">
                <Activity size={16} /> {language === "th" ? "วิเคราะห์เทรด" : "Trade Assistant"}
              </Link>
            </div>
          </div>

          {/* Price Display */}
{price}
</section>);}

export function AssetChartToolbar({symbol='',selectedPeriod='1d',setSelectedPeriod=()=>{},count=0}:{symbol?:string;selectedPeriod?:TimePeriod;setSelectedPeriod?:(p:TimePeriod)=>void;count?:number}){const {t,language}=useApp();const periods=ASSET_PERIODS;return <>              <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                <p className="text-sm font-bold text-white">{t("performanceTitle")}</p>
                <GlideGroup><div className="flex gap-1 bg-white/5 rounded-lg p-1">
                  {periods.map((period) => (
                    <Link
                      key={period.key}
                      href={`/portfolio/${symbol}?period=${period.key}`}
                      onClick={() => setSelectedPeriod(period.key)}
                      className={cn(
                        "relative isolate px-2 py-1 text-[10px] font-black uppercase tracking-wide rounded-md transition-all",
                        selectedPeriod === period.key ? "text-[#00285d]" : "text-gray-400 hover:text-white"
                      )}
                    >
                      {selectedPeriod === period.key && <GlidingIndicator activeKey={period.key} className="!bg-[#ADC6FF]"/>}{t(`period${period.key.toLowerCase()}`)}
                    </Link>
                  ))}
                </div></GlideGroup>
              </div>

              <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
                <Clock size={14} />
                <span>{language === "th" ? PERIOD_CONFIG[selectedPeriod].changeLabelTh : PERIOD_CONFIG[selectedPeriod].changeLabel}</span>
                {count > 0 && <span className="text-gray-600">• {count} {t("dataPoints")}</span>}
              </div>

</>;}

export const JOURNEY_TITLE='investmentJourney';
export function AssetChartFooter(){const {t}=useApp();return (<div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#4EDEA3]" /><span>{t("uptrend")}</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#FFB4AB]" /><span>{t("downtrend")}</span></div>
                </div>
                <div className="text-xs text-gray-600">{t("hoverToSeePrice")}</div>
              </div>);}
