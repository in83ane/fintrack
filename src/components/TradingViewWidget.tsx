"use client";

import React, { useEffect, useRef, memo } from 'react';

function TradingViewWidgetComponent({ symbol }: { symbol: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Clear previous widget if it exists
    if (container.current) {
      container.current.innerHTML = '';
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => {
      if (typeof window !== "undefined" && (window as any).TradingView && container.current) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: symbol.includes(":") ? symbol : `DEFAULT:${symbol}`, // Fallback if no exchange is known
          interval: "D",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1", // 1 means candlestick
          locale: "en",
          enable_publishing: false,
          backgroundColor: "#1C1B1B",
          gridColor: "rgba(255, 255, 255, 0.05)",
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: true,
          container_id: container.current.id,
          allow_symbol_change: true,
          studies: [
            "RSI@tv-basicstudies",
            "MASimple@tv-basicstudies",
            "MACD@tv-basicstudies",
            "StochasticRSI@tv-basicstudies"
          ],
          toolbar_bg: "#1C1B1B",
          studies_overrides: {
            // Optional default settings
          }
        });
      }
    };
    
    // We need a unique ID for the container
    const newId = `tradingview_${Math.random().toString(36).substring(7)}`;
    if (container.current) {
        container.current.id = newId;
    }
    
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
      if (container.current) {
        container.current.innerHTML = '';
      }
    };
  }, [symbol]);

  return (
    <div className="tradingview-widget-container" style={{ height: "100%", width: "100%" }}>
      <div ref={container} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

export const TradingViewWidget = memo(TradingViewWidgetComponent);
