"use client";

import React, { useMemo } from "react";
import { useApp, Asset } from "@/src/context/AppContext";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, Flag, CheckCircle2, CircleDot } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface TradeJourneyProps {
  asset: Asset;
}

export function TradeJourney({ asset }: TradeJourneyProps) {
  const { trades, formatMoney, t } = useApp();

  const milestones = useMemo(() => {
    const assetTrades = trades
      .filter((t) => t.asset === asset.symbol)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const items: any[] = [];

    // 1. Initial Purchase
    const firstTrade = assetTrades.find((t) => t.type === "BUY");
    if (firstTrade) {
      items.push({
        id: "initial",
        type: "buy",
        title: t("initialPurchase") || "Initial Purchase",
        desc: `${t("boughtShares")?.replace("{shares}", firstTrade.shares?.toString() || "0").replace("{price}", formatMoney(firstTrade.amountUSD / (firstTrade.shares || 1)))}`,
        date: firstTrade.date,
        icon: <TrendingUp size={14} />,
        color: "text-[#4EDEA3]",
        bg: "bg-[#4EDEA3]/10",
      });
    }

    // 2. Add some significant trades if any
    const otherTrades = assetTrades.filter((t) => t.id !== firstTrade?.id).slice(-3); // Last 3 trades
    otherTrades.forEach((tr) => {
      const isBuy = tr.type === "BUY";
      items.push({
        id: tr.id,
        type: tr.type.toLowerCase(),
        title: isBuy ? (t("buy") || "Buy") : (t("sell") || "Sell"),
        desc: isBuy
          ? `Bought ${tr.shares} at ${formatMoney(tr.amountUSD / (tr.shares || 1))}`
          : `Sold ${tr.shares} at ${formatMoney(tr.amountUSD / (tr.shares || 1))}`,
        date: tr.date,
        icon: isBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />,
        color: isBuy ? "text-[#4EDEA3]" : "text-[#FFB4AB]",
        bg: isBuy ? "bg-[#4EDEA3]/10" : "bg-[#FFB4AB]/10",
      });
    });

    // 3. Performance milestones (10%, 25%, 50%) based on current P/L
    const shares = asset.shares || 0;
    const livePrice = asset.currentPrice || (shares > 0 ? asset.valueUSD / shares : 0);
    const avgCost = asset.avgCost || livePrice;
    
    if (avgCost > 0 && livePrice > 0) {
      const plPercent = ((livePrice - avgCost) / avgCost) * 100;
      
      if (plPercent >= 10) {
        items.push({
          id: "m10",
          type: "milestone",
          title: t("milestone10") || "+10% Milestone",
          desc: t("firstMilestone") || "First major profit milestone reached",
          date: new Date().toISOString(),
          icon: <Flag size={14} />,
          color: "text-[#E9C349]",
          bg: "bg-[#E9C349]/10",
        });
      }
      
      if (plPercent >= 25) {
        items.push({
          id: "m25",
          type: "milestone",
          title: t("milestone25") || "+25% Milestone",
          desc: t("strongPerformance") || "Strong performance milestone",
          date: new Date().toISOString(),
          icon: <CheckCircle2 size={14} />,
          color: "text-[#E9C349]",
          bg: "bg-[#E9C349]/10",
        });
      }

      // Add future target
      const nextTarget = plPercent < 10 ? 10 : plPercent < 25 ? 25 : plPercent < 50 ? 50 : Math.ceil((plPercent + 10) / 10) * 10;
      const targetPrice = avgCost * (1 + nextTarget / 100);
      
      items.push({
        id: "target",
        type: "target",
        title: t("target50")?.replace("50", nextTarget.toString()) || `Target: +${nextTarget}%`,
        desc: t("targetPrice")?.replace("{price}", formatMoney(targetPrice)) || `Target price: ${formatMoney(targetPrice)}`,
        date: null,
        icon: <CircleDot size={14} />,
        color: "text-gray-500",
        bg: "bg-white/5",
      });
    }

    return items;
  }, [asset, trades, formatMoney, t]);

  if (milestones.length === 0) return null;

  return (
    <div className="bg-[#1C1B1B] p-5 rounded-2xl border border-white/5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Flag size={16} className="text-[#ADC6FF]" />
        <h3 className="text-sm font-bold text-white">{t("investmentJourney") || "Investment Journey"}</h3>
      </div>
      
      <div className="relative pl-3 space-y-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
        {milestones.map((item, idx) => (
          <div key={item.id} className="relative flex items-start gap-4">
            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 border border-[#1C1B1B]", item.bg, item.color)}>
              {item.icon}
            </div>
            <div className="flex-1 pb-4">
              <h4 className={cn("text-xs font-bold", item.type === "target" ? "text-gray-500" : "text-white")}>{item.title}</h4>
              <p className="text-[10px] text-gray-500 mt-0.5">{item.desc}</p>
              {item.date && (
                <p className="text-[9px] text-gray-600 font-medium uppercase mt-1">
                  {format(new Date(item.date), "MMM dd, yyyy")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
