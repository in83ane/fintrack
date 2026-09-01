"use client";

import React, { useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// Direct TradingView Widget Embedder
// Uses TradingView's official embed script structure:
//   <div class="tradingview-widget-container">
//     <div class="tradingview-widget-container__widget"></div>
//     <script src="..." async>{ ...config }</script>
//   </div>
// ═══════════════════════════════════════════════════════════════════════════════

interface TradingViewWidgetProps {
  scriptSrc: string;
  config: Record<string, any>;
}

function TradingViewWidget({ scriptSrc, config }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any previous widget
    container.innerHTML = "";

    // Create the inner widget div (required by TradingView)
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    // Create and append the script with config as text content
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = scriptSrc;
    script.async = true;
    script.textContent = JSON.stringify(config);
    container.appendChild(script);

    return () => {
      if (container) {
        container.innerHTML = "";
      }
    };
  }, []); // Run only once on mount

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ height: "100%", width: "100%" }}
    />
  );
}

// ─── Pre-configured Widget Components ─────────────────────────────────────────

export function TickerTapeWidget() {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
      config={{
        symbols: [
          { proName: "OANDA:XAUUSD", title: "XAU/USD" },
          { proName: "FX:EURUSD", title: "EUR/USD" },
          { proName: "FX:GBPUSD", title: "GBP/USD" },
          { proName: "FX:USDJPY", title: "USD/JPY" },
          { proName: "BITSTAMP:BTCUSD", title: "BTC/USD" },
          { proName: "BITSTAMP:ETHUSD", title: "ETH/USD" },
          { proName: "TVC:USOIL", title: "USOIL" },
          { proName: "OANDA:XAGUSD", title: "XAG/USD" },
        ],
        showSymbolLogo: true,
        colorTheme: "dark",
        isTransparent: true,
        displayMode: "regular",
        locale: "en",
      }}
    />
  );
}

export function AdvancedChartWidget({ symbol = "OANDA:XAUUSD", interval = "60" }: { symbol?: string; interval?: string }) {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
      config={{
        autosize: true,
        symbol,
        interval,
        timezone: "Asia/Bangkok",
        theme: "dark",
        style: "1",
        locale: "en",
        allow_symbol_change: true,
        calendar: false,
        hide_side_toolbar: false,
        support_host: "https://www.tradingview.com",
        backgroundColor: "rgba(0, 0, 0, 0)",
      }}
    />
  );
}

export function TechnicalAnalysisWidget({ symbol = "OANDA:XAUUSD" }: { symbol?: string }) {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js"
      config={{
        interval: "1h",
        width: "100%",
        isTransparent: true,
        height: "100%",
        symbol,
        showIntervalTabs: true,
        displayMode: "single",
        locale: "en",
        colorTheme: "dark",
      }}
    />
  );
}

export function EconomicCalendarWidget() {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
      config={{
        colorTheme: "dark",
        isTransparent: true,
        width: "100%",
        height: "100%",
        locale: "en",
        importanceFilter: "-1,0,1",
        countryFilter: "us,gb,eu,jp,cn,au",
      }}
    />
  );
}

export function MarketOverviewWidget() {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js"
      config={{
        colorTheme: "dark",
        dateRange: "1M",
        showChart: true,
        locale: "en",
        width: "100%",
        height: "100%",
        largeChartUrl: "",
        isTransparent: true,
        showSymbolLogo: true,
        showFloatingTooltip: true,
        tabs: [
          {
            title: "Metals",
            symbols: [
              { s: "OANDA:XAUUSD", d: "Gold" },
              { s: "OANDA:XAGUSD", d: "Silver" },
              { s: "TVC:USOIL", d: "USOIL" },
            ],
          },
          {
            title: "Forex",
            symbols: [
              { s: "FX:EURUSD", d: "EUR/USD" },
              { s: "FX:GBPUSD", d: "GBP/USD" },
              { s: "FX:USDJPY", d: "USD/JPY" },
              { s: "FX:AUDUSD", d: "AUD/USD" },
            ],
          },
          {
            title: "Indices",
            symbols: [
              { s: "FOREXCOM:SPX500", d: "S&P 500" },
              { s: "FOREXCOM:NSXUSD", d: "Nasdaq 100" },
              { s: "FOREXCOM:DJI", d: "Dow Jones" },
            ],
          },
          {
            title: "Crypto",
            symbols: [
              { s: "BITSTAMP:BTCUSD", d: "BTC/USD" },
              { s: "BITSTAMP:ETHUSD", d: "ETH/USD" },
              { s: "BINANCE:SOLUSDT", d: "SOL/USDT" },
            ],
          },
        ],
      }}
    />
  );
}

export function ScreenerWidget() {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-screener.js"
      config={{
        width: "100%",
        height: "100%",
        defaultColumn: "overview",
        defaultScreen: "general",
        market: "forex",
        showToolbar: true,
        colorTheme: "dark",
        locale: "en",
        isTransparent: true,
      }}
    />
  );
}

export function TimelineWidget() {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-timeline.js"
      config={{
        feedMode: "all_symbols",
        isTransparent: true,
        displayMode: "regular",
        width: "100%",
        height: "100%",
        colorTheme: "dark",
        locale: "en",
      }}
    />
  );
}
