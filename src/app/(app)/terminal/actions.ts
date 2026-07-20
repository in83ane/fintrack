"use server";

// ─── Terminal Server Actions ──────────────────────────────────────────────────
// Provides OHLCV data fetching, Support/Resistance detection, Fibonacci
// retracement calculation, and multi-factor alert generation for the
// /terminal advanced analytics page.
//
// Reuses the Yahoo Finance fetching infrastructure from trade/actions.ts
// and the shared utilities from lib/finance.ts.

import { computeFibLevels, clusterPriceLevels, type OHLCV, type FibLevel } from "@/src/lib/finance";

// ─── Rate-limited Yahoo fetcher (mirrors trade/actions.ts pattern) ────────────
let lastYahooRequest = 0;
const YAHOO_MIN_INTERVAL = 100;

async function yahooFetch(url: string, timeout = 8000): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, YAHOO_MIN_INTERVAL - (now - lastYahooRequest));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastYahooRequest = Date.now();

  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(timeout),
  });
}

async function yahooFetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await yahooFetch(url);
      if (res.ok) return res;
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

// ─── SET symbol detection ─────────────────────────────────────────────────────
const SET_SYMBOLS = [
  "AOT","PTT","DELTA","SCB","CPALL","KBANK","BBL","TRUE","ADVANC","IVL",
  "GULF","BEM","BDMS","BH","MINT","CPN","SCC","PTTGC","TOP","IRPC",
  "BANPU","RATCH","EGCO","INTUCH","AWC","WHA","HMPRO","BJC","MAKRO","CRC",
  "OR","GPSC","EA","SAWAD","KTB","TTB","TISCO","KKP","TIDLOR",
];

function resolveYahooSymbol(symbol: string): { yahooSymbol: string; isSET: boolean } {
  const s = symbol.toUpperCase().replace('.BK', '');
  const isProbablySET = /^[A-Z]+$/.test(s) && SET_SYMBOLS.includes(s);
  const yahooSymbol = isProbablySET ? `${s}.BK` : s;
  return { yahooSymbol, isSET: yahooSymbol.endsWith('.BK') };
}

// ─── Cache ────────────────────────────────────────────────────────────────────
const ohlcvCache = new Map<string, { data: OHLCV[]; ts: number }>();
const OHLCV_TTL = 60_000; // 1 minute

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FETCH OHLCV DATA
// ═══════════════════════════════════════════════════════════════════════════════
// Returns full OHLCV array for candlestick rendering.
// Periods: 1d, 5d, 1mo, 3mo, 6mo, 1y, 5y

export async function fetchOHLCV(
  symbol: string,
  range: string = '3mo',
  interval: string = '1d'
): Promise<OHLCV[]> {
  const { yahooSymbol } = resolveYahooSymbol(symbol);
  const cacheKey = `${yahooSymbol}_${range}_${interval}`;

  const cached = ohlcvCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < OHLCV_TTL) return cached.data;

  const ts = Date.now();
  const res = await yahooFetchWithRetry(
    `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=${range}&interval=${interval}&_=${ts}`
  );

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result?.meta) throw new Error("No data found for this symbol");

  const timestamps: number[] = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const opens: number[] = quote.open || [];
  const highs: number[] = quote.high || [];
  const lows: number[] = quote.low || [];
  const closes: number[] = quote.close || [];
  const volumes: number[] = quote.volume || [];

  const ohlcv: OHLCV[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (opens[i] != null && highs[i] != null && lows[i] != null && closes[i] != null) {
      ohlcv.push({
        time: timestamps[i] * 1000,
        open: +opens[i].toFixed(4),
        high: +highs[i].toFixed(4),
        low: +lows[i].toFixed(4),
        close: +closes[i].toFixed(4),
        volume: volumes[i] || 0,
      });
    }
  }

  ohlcvCache.set(cacheKey, { data: ohlcv, ts: Date.now() });
  return ohlcv;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SUPPORT / RESISTANCE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
// Uses a rolling-window fractal algorithm:
// - Swing High at index i: High[i] is the highest in [i-lookback, i+lookback]
// - Swing Low at index i: Low[i] is the lowest in [i-lookback, i+lookback]
// Clusters nearby levels to consolidate into major S/R zones.

export interface SRLevel {
  price: number;
  type: 'support' | 'resistance';
  touches: number;  // How many times price has tested this level
  strength: number; // 1-5 strength score
}

export async function detectSupportResistance(
  ohlcv: OHLCV[],
  lookback: number = 20
): Promise<{ supports: SRLevel[]; resistances: SRLevel[] }> {
  if (ohlcv.length < lookback * 2 + 1) {
    return { supports: [], resistances: [] };
  }

  const highs = ohlcv.map(c => c.high);
  const lows = ohlcv.map(c => c.low);
  const currentPrice = ohlcv[ohlcv.length - 1].close;

  const swingHighPrices: number[] = [];
  const swingLowPrices: number[] = [];

  // Detect swing points using fractal algorithm
  for (let i = lookback; i < ohlcv.length - lookback; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (highs[j] > highs[i]) isSwingHigh = false;
      if (lows[j] < lows[i]) isSwingLow = false;
    }

    if (isSwingHigh) swingHighPrices.push(highs[i]);
    if (isSwingLow) swingLowPrices.push(lows[i]);
  }

  // Cluster nearby levels (within 1% of each other)
  const clusteredHighs = clusterPriceLevels(swingHighPrices, 1.0);
  const clusteredLows = clusterPriceLevels(swingLowPrices, 1.0);

  // Count touches for each level (how many candles came within 0.5%)
  const countTouches = (level: number): number => {
    let touches = 0;
    for (const candle of ohlcv) {
      const dist = Math.abs(candle.high - level) / level;
      const distLow = Math.abs(candle.low - level) / level;
      if (dist < 0.005 || distLow < 0.005) touches++;
    }
    return touches;
  };

  // Build resistance levels (above current price)
  const resistances: SRLevel[] = clusteredHighs
    .filter(p => p > currentPrice)
    .map(price => {
      const touches = countTouches(price);
      return {
        price: +price.toFixed(2),
        type: 'resistance' as const,
        touches,
        strength: Math.min(5, Math.max(1, touches)),
      };
    })
    .sort((a, b) => a.price - b.price)
    .slice(0, 5);

  // Build support levels (below current price)
  const supports: SRLevel[] = clusteredLows
    .filter(p => p < currentPrice)
    .map(price => {
      const touches = countTouches(price);
      return {
        price: +price.toFixed(2),
        type: 'support' as const,
        touches,
        strength: Math.min(5, Math.max(1, touches)),
      };
    })
    .sort((a, b) => b.price - a.price)
    .slice(0, 5);

  return { supports, resistances };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. FIBONACCI RETRACEMENT
// ═══════════════════════════════════════════════════════════════════════════════
// Auto-detects the most recent significant impulse wave by finding the
// highest high and lowest low in the lookback window, then computes
// standard Fibonacci retracement levels.

export interface FibResult {
  levels: FibLevel[];
  impulseHigh: number;
  impulseLow: number;
  trendDirection: 'up' | 'down';
  highIndex: number;
  lowIndex: number;
}

export async function calculateFibonacci(
  ohlcv: OHLCV[],
  lookback: number = 100
): Promise<FibResult> {
  const data = ohlcv.slice(-Math.min(lookback, ohlcv.length));

  let highestHigh = -Infinity;
  let lowestLow = Infinity;
  let highIndex = 0;
  let lowIndex = 0;

  for (let i = 0; i < data.length; i++) {
    if (data[i].high > highestHigh) {
      highestHigh = data[i].high;
      highIndex = i;
    }
    if (data[i].low < lowestLow) {
      lowestLow = data[i].low;
      lowIndex = i;
    }
  }

  // If the low came before the high, it's an uptrend impulse
  // If the high came before the low, it's a downtrend impulse
  const trendDirection: 'up' | 'down' = lowIndex < highIndex ? 'up' : 'down';

  const levels = computeFibLevels(highestHigh, lowestLow, trendDirection);

  return {
    levels,
    impulseHigh: +highestHigh.toFixed(2),
    impulseLow: +lowestLow.toFixed(2),
    trendDirection,
    highIndex: ohlcv.length - data.length + highIndex,
    lowIndex: ohlcv.length - data.length + lowIndex,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MULTI-FACTOR ALERT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
// Generates BUY/SELL alerts only when multiple conditions converge:
// BUY: Bullish MACD crossover + (price breaks resistance OR holds Fib support)
// SELL: Bearish MACD crossover + (price breaks support OR falls below Fib 0.786)

export interface TerminalAlert {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  confidence: number;
  reasons: string[];
  timestamp: number;
  price: number;
}

// EMA helper (mirrors trade/actions.ts)
function computeEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

// MACD helper
function computeMACD(closes: number[]): {
  macd: number; signal: number; histogram: number;
  bullishCrossover: boolean; bearishCrossover: boolean;
} {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0, bullishCrossover: false, bearishCrossover: false };

  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEMA(macdLine.slice(-9), 9);

  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const prevMacd = macdLine[macdLine.length - 2];
  const prevSignal = signalLine.length >= 2 ? signalLine[signalLine.length - 2] : signal;

  const bullishCrossover = prevMacd <= prevSignal && macd > signal;
  const bearishCrossover = prevMacd >= prevSignal && macd < signal;

  return {
    macd: +macd.toFixed(4),
    signal: +signal.toFixed(4),
    histogram: +(macd - signal).toFixed(4),
    bullishCrossover,
    bearishCrossover,
  };
}

export async function generateAlerts(
  symbol: string,
  ohlcv: OHLCV[],
  supports: SRLevel[],
  resistances: SRLevel[],
  fibLevels: FibLevel[]
): Promise<TerminalAlert[]> {
  if (ohlcv.length < 30) return [];

  const alerts: TerminalAlert[] = [];
  const closes = ohlcv.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  const prevPrice = closes[closes.length - 2];
  const macd = computeMACD(closes);

  // Check EMA 9/21 crossover
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const ema9Val = ema9[ema9.length - 1];
  const ema21Val = ema21[ema21.length - 1];
  const ema9Prev = ema9[ema9.length - 2];
  const ema21Prev = ema21[ema21.length - 2];
  const emaBullishCross = ema9Prev <= ema21Prev && ema9Val > ema21Val;
  const emaBearishCross = ema9Prev >= ema21Prev && ema9Val < ema21Val;

  // Find key Fibonacci levels
  const fib382 = fibLevels.find(f => f.ratio === 0.382);
  const fib618 = fibLevels.find(f => f.ratio === 0.618);
  const fib786 = fibLevels.find(f => f.ratio === 0.786);

  // Helper: is price near a level (within 1%)?
  const isNear = (price: number, level: number) =>
    Math.abs(price - level) / level < 0.01;

  // ─── BUY ALERT LOGIC ────────────────────────────────────────────────────
  // Requires: Bullish MACD crossover AND (resistance breakout OR Fib support hold)
  if (macd.bullishCrossover || emaBullishCross) {
    const reasons: string[] = [];
    let confidence = 40;

    if (macd.bullishCrossover) {
      reasons.push('MACD Bullish Crossover');
      confidence += 15;
    }
    if (emaBullishCross) {
      reasons.push('EMA 9/21 Bullish Cross');
      confidence += 10;
    }

    // Check resistance breakout
    const brokenResistance = resistances.find(r => prevPrice < r.price && currentPrice > r.price);
    if (brokenResistance) {
      reasons.push(`Breakout above resistance $${brokenResistance.price}`);
      confidence += 20;
    }

    // Check Fibonacci support hold
    if (fib618 && isNear(currentPrice, fib618.price)) {
      reasons.push(`Holding Fibonacci 61.8% ($${fib618.price.toFixed(2)})`);
      confidence += 15;
    } else if (fib382 && isNear(currentPrice, fib382.price)) {
      reasons.push(`Holding Fibonacci 38.2% ($${fib382.price.toFixed(2)})`);
      confidence += 10;
    }

    if (reasons.length >= 2) {
      alerts.push({
        id: `buy_${symbol}_${Date.now()}`,
        symbol,
        type: 'BUY',
        confidence: Math.min(100, confidence),
        reasons,
        timestamp: ohlcv[ohlcv.length - 1].time,
        price: currentPrice,
      });
    }
  }

  // ─── SELL ALERT LOGIC ───────────────────────────────────────────────────
  // Requires: Bearish MACD crossover AND (support break OR below Fib 0.786)
  if (macd.bearishCrossover || emaBearishCross) {
    const reasons: string[] = [];
    let confidence = 40;

    if (macd.bearishCrossover) {
      reasons.push('MACD Bearish Crossover');
      confidence += 15;
    }
    if (emaBearishCross) {
      reasons.push('EMA 9/21 Bearish Cross');
      confidence += 10;
    }

    // Check support breakdown
    const brokenSupport = supports.find(s => prevPrice > s.price && currentPrice < s.price);
    if (brokenSupport) {
      reasons.push(`Breakdown below support $${brokenSupport.price}`);
      confidence += 20;
    }

    // Check below Fibonacci 78.6%
    if (fib786 && currentPrice < fib786.price) {
      reasons.push(`Below Fibonacci 78.6% ($${fib786.price.toFixed(2)})`);
      confidence += 15;
    }

    if (reasons.length >= 2) {
      alerts.push({
        id: `sell_${symbol}_${Date.now()}`,
        symbol,
        type: 'SELL',
        confidence: Math.min(100, confidence),
        reasons,
        timestamp: ohlcv[ohlcv.length - 1].time,
        price: currentPrice,
      });
    }
  }

  return alerts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FULL TERMINAL ANALYSIS (Combines all above)
// ═══════════════════════════════════════════════════════════════════════════════
// Single entry point that runs all analyses for a given symbol.

export interface TerminalAnalysis {
  symbol: string;
  yahooSymbol: string;
  name: string;
  market: 'SET' | 'US';
  currency: string;
  currentPrice: number;
  changePct: number;
  ohlcv: OHLCV[];
  supports: SRLevel[];
  resistances: SRLevel[];
  fibonacci: FibResult;
  alerts: TerminalAlert[];
  macd: { macd: number; signal: number; histogram: number; bullishCrossover: boolean; bearishCrossover: boolean };
  ema9: number;
  ema21: number;
}

export async function analyzeTerminal(
  symbol: string,
  range: string = '3mo',
  interval: string = '1d'
): Promise<TerminalAnalysis> {
  const { yahooSymbol, isSET } = resolveYahooSymbol(symbol);

  // 1. Fetch OHLCV data
  const ohlcv = await fetchOHLCV(symbol, range, interval);
  if (ohlcv.length < 10) throw new Error("Insufficient data for analysis");

  // 2. Get metadata
  const ts = Date.now();
  let name = symbol;
  let changePct = 0;
  try {
    const metaRes = await yahooFetchWithRetry(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbol}&fields=shortName,regularMarketChangePercent&_=${ts}`
    );
    const metaJson = await metaRes.json();
    const quote = metaJson?.quoteResponse?.result?.[0];
    if (quote) {
      name = quote.shortName || quote.longName || symbol;
      changePct = +(quote.regularMarketChangePercent || 0).toFixed(2);
    }
  } catch { /* use defaults */ }

  // 3. Run analyses
  const [sr, fib] = await Promise.all([
    detectSupportResistance(ohlcv),
    calculateFibonacci(ohlcv),
  ]);

  // 4. Generate alerts
  const alerts = await generateAlerts(symbol, ohlcv, sr.supports, sr.resistances, fib.levels);

  // 5. Compute indicators for display
  const closes = ohlcv.map(c => c.close);
  const macd = computeMACD(closes);
  const ema9arr = computeEMA(closes, 9);
  const ema21arr = computeEMA(closes, 21);

  return {
    symbol: symbol.toUpperCase(),
    yahooSymbol,
    name,
    market: isSET ? 'SET' : 'US',
    currency: isSET ? 'THB' : 'USD',
    currentPrice: ohlcv[ohlcv.length - 1].close,
    changePct,
    ohlcv,
    supports: sr.supports,
    resistances: sr.resistances,
    fibonacci: fib,
    alerts,
    macd,
    ema9: ema9arr[ema9arr.length - 1],
    ema21: ema21arr[ema21arr.length - 1],
  };
}
