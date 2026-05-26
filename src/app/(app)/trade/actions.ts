"use server";

// ─── Cache ────────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: any; ts: number }>();
const TTL = 60_000;
const SCAN_TTL = 300_000;

// ─── SET universe ─────────────────────────────────────────────────────────────
const SET_SYMBOLS_FALLBACK = [
  "AOT","PTT","DELTA","SCB","CPALL","KBANK","BBL","TRUE","ADVANC","IVL",
  "GULF","BEM","BDMS","BH","MINT","CPN","SCC","PTTGC","TOP","IRPC",
  "BANPU","RATCH","EGCO","INTUCH","AWC","WHA","HMPRO","BJC","MAKRO","CRC",
  "OR","GPSC","EA","SAWAD","KTB","TTB","TISCO","KKP","TIDLOR",
];

// ─── US universe ──────────────────────────────────────────────────────────────
const US_SYMBOLS_STANDARD_FALLBACK = [
  "AAPL","TSLA","NVDA","AMZN","META","GOOGL","MSFT","AMD","SPY","QQQ",
  "PLTR","COIN","MSTR","SOFI","RIVN",
];

const US_SYMBOLS_DIME_FALLBACK = [
  "MULN","FFIE","GWAV","CRKN"
];

// Global rate limiter for Yahoo Finance
let lastYahooRequest = 0;
const YAHOO_MIN_INTERVAL = 100; // ms between requests

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

async function fetchSETUniverse(): Promise<string[]> {
  const res = await fetch(
    'https://www.set.or.th/api/set/stock/list?language=en',
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Referer': 'https://www.set.or.th/en/market/index.html',
      },
      signal: AbortSignal.timeout(10000),
    }
  );
  
  if (!res.ok) throw new Error('SET API failed');
  const json = await res.json();
  
  const stocks = (json?.securitySymbols || json?.data || [])
    .filter((s: any) => 
      s.securityType === 'S' || 
      s.market === 'SET' ||
      s.market === 'mai'
    )
    .map((s: any) => s.symbol as string)
    .filter(Boolean);
  
  return stocks;
}

async function fetchSETFallback(): Promise<string[]> {
  const res = await fetch(
    'https://www.set.or.th/api/set/factsheet/info?language=en&type=S',
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) throw new Error('SET Fallback API failed');
  const json = await res.json();
  return (json || []).map((s: any) => s.symbol).filter(Boolean);
}

async function fetchUSUniverse(
  type: 'ALL' | 'NASDAQ' | 'NYSE' | 'DIME'
): Promise<string[]> {
  const url = 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&download=true';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.nasdaq.com/market-activity/stocks/screener',
    },
    signal: AbortSignal.timeout(15000),
  });
  
  if (!res.ok) throw new Error('NASDAQ screener failed');
  const json = await res.json();
  const rows = json?.data?.table?.rows || [];
  
  let symbols = rows
    .filter((r: any) => r.symbol && !r.symbol.includes('^') && !r.symbol.includes('/'))
    .map((r: any) => ({
      symbol: r.symbol as string,
      price: parseFloat(r.lastsale?.replace('$','') || '0'),
      volume: parseFloat(r.volume?.replace(/,/g,'') || '0'),
      marketCap: r.marketCap || '',
      exchange: r.exchange || '',
    }));
  
  if (type === 'DIME') {
    symbols = symbols.filter((s: any) => s.price > 0.01 && s.price <= 5.00 && s.volume > 1_000_000);
  } else if (type === 'NASDAQ') {
    symbols = symbols.filter((s: any) => s.exchange === 'NASDAQ' && s.price > 5);
  } else if (type === 'NYSE') {
    symbols = symbols.filter((s: any) => s.exchange === 'NYSE' && s.price > 5);
  } else {
    symbols = symbols.filter((s: any) => s.price > 1 && s.volume > 100_000);
  }
  
  return symbols.map((s: any) => s.symbol);
}

async function fetchUSFallback(): Promise<string[]> {
  const res = await fetch(
    'https://financialmodelingprep.com/api/v3/stock/list?apikey=demo',
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error('US Fallback failed');
  const json = await res.json();
  return (json || [])
    .filter((s: any) => s.type === 'stock' && s.price > 0)
    .map((s: any) => s.symbol);
}

const universeCache = new Map<string, { symbols: string[]; ts: number }>();
const UNIVERSE_TTL = 24 * 60 * 60 * 1000;

async function getSymbolUniverse(market: 'SET' | 'US_ALL' | 'US_DIME'): Promise<string[]> {
  const cached = universeCache.get(market);
  if (cached && Date.now() - cached.ts < UNIVERSE_TTL) {
    return cached.symbols;
  }
  
  let symbols: string[] = [];
  try {
    if (market === 'SET') {
      symbols = await fetchSETUniverse();
      if (symbols.length < 10) symbols = await fetchSETFallback();
      if (symbols.length < 10) symbols = SET_SYMBOLS_FALLBACK;
    } else if (market === 'US_DIME') {
      symbols = await fetchUSUniverse('DIME');
      if (symbols.length < 10) symbols = US_SYMBOLS_DIME_FALLBACK;
    } else {
      symbols = await fetchUSUniverse('ALL');
      if (symbols.length < 10) symbols = [...US_SYMBOLS_STANDARD_FALLBACK, ...US_SYMBOLS_DIME_FALLBACK];
    }
  } catch {
    if (market === 'SET') symbols = SET_SYMBOLS_FALLBACK;
    else if (market === 'US_DIME') symbols = US_SYMBOLS_DIME_FALLBACK;
    else symbols = US_SYMBOLS_STANDARD_FALLBACK;
  }
  
  universeCache.set(market, { symbols, ts: Date.now() });
  return symbols;
}

async function preFilterSymbols(
  symbols: string[],
  market: 'SET' | 'US_STANDARD' | 'US_DIME'
): Promise<string[]> {
  const BATCH_SIZE = 50;
  const filtered: string[] = [];
  
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const yahooSymbols = batch.map((s: string) => 
      market === 'SET' ? `${s}.BK` : s
    ).join(',');
    
    try {
      const res = await yahooFetchWithRetry(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbols}&fields=regularMarketPrice,regularMarketVolume,regularMarketChangePercent,averageDailyVolume10Day`
      );
      
      const json = await res.json();
      const quotes = json?.quoteResponse?.result || [];
      
      for (const q of quotes) {
        const price = q.regularMarketPrice || 0;
        const vol = q.regularMarketVolume || 0;
        const avgVol = q.averageDailyVolume10Day || 0;
        const volRatio = avgVol > 0 ? vol / avgVol : 0;
        const changePct = Math.abs(q.regularMarketChangePercent || 0);
        
        let passes = false;
        
        if (market === 'SET') {
          passes = price > 0 && vol > 500_000 && volRatio > 1.2 && changePct > 0.3;
        } else if (market === 'US_DIME') {
          passes = price > 0.01 && price <= 5.00 && vol > 2_000_000 && volRatio > 1.5 && changePct > 1.0;
        } else {
          passes = price > 1 && vol > 200_000 && volRatio > 1.1;
        }
        
        if (passes) {
          const sym = q.symbol?.replace('.BK', '') || '';
          if (sym) filtered.push(sym);
        }
      }
    } catch {
      // skip
    }
    
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return filtered;
}

// ─── Technical indicator helpers ──────────────────────────────────────────────
function computeRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  gains /= period; losses /= period;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function computeEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function computeMACD(closes: number[]) {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0, crossover: false };
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEMA(macdLine.slice(-9), 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const prevMacd = macdLine[macdLine.length - 2];
  const prevSignal = signalLine.length >= 2 ? signalLine[signalLine.length - 2] : signal;
  const crossover = prevMacd <= prevSignal && macd > signal;
  return { macd: +macd.toFixed(4), signal: +signal.toFixed(4), histogram: +(macd - signal).toFixed(4), crossover };
}

function computeADX(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period * 2) return 15;
  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const upMove = h - highs[i - 1];
    const downMove = lows[i - 1] - l;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const smooth = (arr: number[]) => {
    let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
    const result = [s];
    for (let i = period; i < arr.length; i++) { s = s - s / period + arr[i]; result.push(s); }
    return result;
  };
  const sTR = smooth(trueRanges);
  const sPDM = smooth(plusDMs);
  const sMDM = smooth(minusDMs);
  const dx: number[] = [];
  for (let i = 0; i < sTR.length; i++) {
    if (sTR[i] === 0) { dx.push(0); continue; }
    const pdi = (sPDM[i] / sTR[i]) * 100;
    const mdi = (sMDM[i] / sTR[i]) * 100;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }
  if (dx.length < period) return dx[dx.length - 1] || 15;
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) { adx = (adx * (period - 1) + dx[i]) / period; }
  return +adx.toFixed(2);
}

function computeVWAP(highs: number[], lows: number[], closes: number[], volumes: number[]): number {
  let cumVol = 0, cumTP = 0;
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumVol += volumes[i];
    cumTP += tp * volumes[i];
  }
  return cumVol > 0 ? cumTP / cumVol : closes[closes.length - 1];
}

function computeStochastic(highs: number[], lows: number[], closes: number[], kPeriod = 14, dPeriod = 3): { k: number; d: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; crossover: boolean } {
  if (closes.length < kPeriod + dPeriod) return { k: 50, d: 50, signal: 'NEUTRAL', crossover: false };
  const kLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < kPeriod - 1) {
      kLine.push(50);
      continue;
    }
    const windowHighs = highs.slice(i - kPeriod + 1, i + 1);
    const windowLows = lows.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...windowHighs);
    const ll = Math.min(...windowLows);
    const k = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    kLine.push(k);
  }
  
  const dLine = [];
  for (let i = 0; i < kLine.length; i++) {
    if (i < dPeriod - 1) {
      dLine.push(kLine[i]);
      continue;
    }
    const sum = kLine.slice(i - dPeriod + 1, i + 1).reduce((a,b)=>a+b,0);
    dLine.push(sum / dPeriod);
  }

  const currentK = kLine[kLine.length - 1];
  const currentD = dLine[dLine.length - 1];
  const prevK = kLine[kLine.length - 2];
  const prevD = dLine[dLine.length - 2];
  const prev2K = kLine.length > 2 ? kLine[kLine.length - 3] : prevK;
  const prev2D = dLine.length > 2 ? dLine[dLine.length - 3] : prevD;

  const buyCrossover = (prevK <= prevD && currentK > currentD) || (prev2K <= prev2D && prevK > prevD);
  const sellCrossover = (prevK >= prevD && currentK < currentD) || (prev2K >= prev2D && prevK < prevD);

  let signal: 'BUY'|'SELL'|'NEUTRAL' = 'NEUTRAL';
  let crossover = false;

  if (buyCrossover && currentK < 25 && currentD < 25) {
    signal = 'BUY';
    crossover = true;
  } else if (sellCrossover && currentK > 75 && currentD > 75) {
    signal = 'SELL';
    crossover = true;
  }

  return { k: +currentK.toFixed(2), d: +currentD.toFixed(2), signal, crossover };
}

function computeMA(closes: number[], periods: number[]): Record<number, number> {
  const result: Record<number, number> = {};
  for (const p of periods) {
    if (closes.length < p) {
      result[p] = closes[closes.length - 1] || 0;
    } else {
      const sum = closes.slice(-p).reduce((a,b)=>a+b,0);
      result[p] = +(sum/p).toFixed(2);
    }
  }
  return result;
}

function detectTrendlines(highs: number[], lows: number[], timestamps: number[]) {
  const defaultRes = { uptrend: { slope: 0, r2: 0, isValid: false, touches: 0 }, downtrend: { slope: 0, r2: 0, isValid: false, touches: 0 }, currentTrend: 'SIDEWAYS' as const, trendStrength: 0 };
  if (highs.length < 20) return defaultRes;

  const swingHighs: { i: number; v: number }[] = [];
  const swingLows: { i: number; v: number }[] = [];
  const window = 5;

  for (let i = window; i < highs.length - window; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (highs[j] > highs[i]) isHigh = false;
      if (lows[j] < lows[i]) isLow = false;
    }
    if (isHigh) swingHighs.push({ i, v: highs[i] });
    if (isLow) swingLows.push({ i, v: lows[i] });
  }

  const linearRegression = (pts: {i:number, v:number}[]) => {
    if (pts.length < 3) return { slope: 0, r2: 0, isValid: false, touches: pts.length };
    const n = pts.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    for (let p of pts) {
      sumX += p.i; sumY += p.v; sumXY += p.i * p.v; sumXX += p.i * p.i; sumYY += p.v * p.v;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const r2 = Math.pow((n * sumXY - sumX * sumY) / Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY)), 2);
    return { slope, r2: isNaN(r2) ? 0 : r2, isValid: r2 > 0.85, touches: n };
  };

  const uptrend = linearRegression(swingLows.slice(-5));
  const downtrend = linearRegression(swingHighs.slice(-5));

  let currentTrend: 'UP' | 'DOWN' | 'SIDEWAYS' = 'SIDEWAYS';
  let trendStrength = 0;

  if (uptrend.isValid && uptrend.slope > 0) {
    currentTrend = 'UP';
    trendStrength = uptrend.r2 * 100;
  } else if (downtrend.isValid && downtrend.slope < 0) {
    currentTrend = 'DOWN';
    trendStrength = downtrend.r2 * 100;
  }

  return { uptrend, downtrend, currentTrend, trendStrength: +trendStrength.toFixed(2) };
}

function detectPriceAction(opens: number[], highs: number[], lows: number[], closes: number[]) {
  const patterns: Array<{ name: string; type: 'BULLISH' | 'BEARISH'; index: number; strength: number }> = [];
  if (closes.length < 5) return { patterns, latestBullish: null, latestBearish: null };

  const len = closes.length;
  for (let i = 1; i <= 5; i++) {
    const idx = len - i;
    const o = opens[idx], h = highs[idx], l = lows[idx], c = closes[idx];
    const po = opens[idx - 1], pc = closes[idx - 1], pl = lows[idx - 1];
    
    const body = Math.abs(c - o);
    const range = h - l;
    const upperShadow = h - Math.max(o, c);
    const lowerShadow = Math.min(o, c) - l;
    const pBody = Math.abs(pc - po);

    // Doji
    if (body <= range * 0.1) continue;

    // Hammer
    if (lowerShadow >= 2 * body && upperShadow <= range * 0.1 && Math.min(o, c) > l + range * 0.6) {
      patterns.push({ name: 'Hammer', type: 'BULLISH', index: i - 1, strength: 2 });
    }
    // Inverted Hammer
    else if (upperShadow >= 2 * body && lowerShadow <= range * 0.1 && Math.max(o, c) < h - range * 0.6) {
      patterns.push({ name: 'Inverted Hammer', type: 'BULLISH', index: i - 1, strength: 1 });
    }
    // Bullish Engulfing
    else if (c > po && o < pc && body >= 1.5 * pBody && pc < po) {
      patterns.push({ name: 'Bullish Engulfing', type: 'BULLISH', index: i - 1, strength: 3 });
    }
    // Bearish Engulfing
    else if (c < po && o > pc && body >= 1.5 * pBody && pc > po) {
      patterns.push({ name: 'Bearish Engulfing', type: 'BEARISH', index: i - 1, strength: 3 });
    }
    // Shooting Star
    else if (upperShadow >= 2 * body && Math.min(o, c) < l + range * 0.3) {
      patterns.push({ name: 'Shooting Star', type: 'BEARISH', index: i - 1, strength: 2 });
    }
    // Marubozu Bullish
    else if (c > o && upperShadow < range * 0.05 && lowerShadow < range * 0.05 && body > range * 0.7) {
      patterns.push({ name: 'Marubozu', type: 'BULLISH', index: i - 1, strength: 2 });
    }

    // Morning Star (requires 3 bars)
    if (idx >= 2) {
      const ppo = opens[idx - 2], ppc = closes[idx - 2];
      const bar1Down = ppc < ppo && Math.abs(ppc - ppo) > range * 0.5;
      const bar2Small = pBody <= range * 0.2;
      const bar3Up = c > o && c > (ppo + ppc) / 2;
      if (bar1Down && bar2Small && bar3Up) {
        patterns.push({ name: 'Morning Star', type: 'BULLISH', index: i - 1, strength: 3 });
      }
    }
  }

  const latestBullish = patterns.find(p => p.type === 'BULLISH')?.name || null;
  const latestBearish = patterns.find(p => p.type === 'BEARISH')?.name || null;

  return { patterns, latestBullish, latestBearish };
}

function getATR(highs: number[], lows: number[], closes: number[], period: number) {
  if (highs.length < period + 1) return 0;
  let sum = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return sum / period;
}

function detectSMC(highs: number[], lows: number[], closes: number[], opens: number[], volumes: number[]) {
  const orderBlocks: any[] = [];
  const fvg: any[] = [];
  const demandZones: any[] = [];
  const supplyZones: any[] = [];
  
  if (closes.length < 20) return { orderBlocks, fvg, supplyZones, demandZones, nearestDemand: null, nearestSupply: null, priceInDemand: false, priceInSupply: false };

  const atr = getATR(highs, lows, closes, 14);
  const len = closes.length;
  const price = closes[len - 1];

  for (let i = len - 20; i < len - 2; i++) {
    const moveUp = closes[i + 2] - lows[i];
    const moveDown = highs[i] - closes[i + 2];
    
    // Bullish OB
    if (closes[i] < opens[i] && moveUp > 1.5 * atr) {
      let isActive = true;
      for (let j = i + 1; j < len; j++) { if (closes[j] < lows[i]) { isActive = false; break; } }
      if (isActive) orderBlocks.push({ type: 'BULLISH_OB', high: highs[i], low: lows[i], mid: (highs[i]+lows[i])/2, index: len - 1 - i, strength: moveUp > 2.5 * atr ? 3 : 2, isActive });
    }
    // Bearish OB
    if (closes[i] > opens[i] && moveDown > 1.5 * atr) {
      let isActive = true;
      for (let j = i + 1; j < len; j++) { if (closes[j] > highs[i]) { isActive = false; break; } }
      if (isActive) orderBlocks.push({ type: 'BEARISH_OB', high: highs[i], low: lows[i], mid: (highs[i]+lows[i])/2, index: len - 1 - i, strength: moveDown > 2.5 * atr ? 3 : 2, isActive });
    }

    // FVG
    const gapUp = lows[i + 2] - highs[i];
    if (closes[i + 1] > opens[i + 1] && gapUp > price * 0.003) {
      let isFilled = false;
      for (let j = i + 2; j < len; j++) { if (lows[j] <= highs[i]) { isFilled = true; break; } }
      if (!isFilled) fvg.push({ type: 'BULLISH_FVG', top: lows[i + 2], bottom: highs[i], mid: (lows[i + 2]+highs[i])/2, index: len - 1 - i, isFilled });
    }
    const gapDown = lows[i] - highs[i + 2];
    if (closes[i + 1] < opens[i + 1] && gapDown > price * 0.003) {
      let isFilled = false;
      for (let j = i + 2; j < len; j++) { if (highs[j] >= lows[i]) { isFilled = true; break; } }
      if (!isFilled) fvg.push({ type: 'BEARISH_FVG', top: lows[i], bottom: highs[i + 2], mid: (lows[i]+highs[i + 2])/2, index: len - 1 - i, isFilled });
    }
  }

  // Simplified supply/demand using OBs
  for (const ob of orderBlocks) {
    if (ob.type === 'BULLISH_OB' && ob.isActive) demandZones.push({ high: ob.high, low: ob.low, strength: ob.strength });
    if (ob.type === 'BEARISH_OB' && ob.isActive) supplyZones.push({ high: ob.high, low: ob.low, strength: ob.strength });
  }

  let nearestDemand = null;
  let nearestSupply = null;
  let minDemandDist = Infinity;
  let minSupplyDist = Infinity;

  for (const d of demandZones) {
    if (price >= d.low && price - d.high < minDemandDist) { minDemandDist = Math.abs(price - d.high); nearestDemand = d; }
  }
  for (const s of supplyZones) {
    if (price <= s.high && s.low - price < minSupplyDist) { minSupplyDist = Math.abs(s.low - price); nearestSupply = s; }
  }

  const priceInDemand = nearestDemand !== null && price >= nearestDemand.low && price <= nearestDemand.high;
  const priceInSupply = nearestSupply !== null && price >= nearestSupply.low && price <= nearestSupply.high;

  return { orderBlocks, fvg, supplyZones, demandZones, nearestDemand, nearestSupply, priceInDemand, priceInSupply };
}

function computeSpeedLines(highs: number[], lows: number[], closes: number[]) {
  if (highs.length < 2) return { majorHigh: 0, majorLow: 0, line1_3: 0, line2_3: 0, currentPosition: 'BETWEEN', buyZone: false, description: '' };
  const majorHigh = Math.max(...highs);
  const majorLow = Math.min(...lows);
  const line1_3 = majorHigh - (majorHigh - majorLow) * (1/3);
  const line2_3 = majorHigh - (majorHigh - majorLow) * (2/3);
  const price = closes[closes.length - 1];

  let currentPosition = 'BETWEEN';
  if (price > majorHigh) currentPosition = 'ABOVE_HIGH';
  else if (price < majorLow) currentPosition = 'BELOW_LOW';
  else if (Math.abs(price - line1_3)/price < 0.015) currentPosition = '1/3_ZONE';
  else if (Math.abs(price - line2_3)/price < 0.015) currentPosition = '2/3_ZONE';

  const buyZone = currentPosition === '1/3_ZONE' || currentPosition === '2/3_ZONE';
  let description = 'อยู่ระหว่างแนวโน้มหลัก';
  if (currentPosition === '1/3_ZONE') description = 'ราคาใกล้ Speed Line 1/3 — โซนพักตัวแนวต้านตื้น';
  if (currentPosition === '2/3_ZONE') description = 'ราคาใกล้ Speed Line 2/3 — โซน support แนวรับ';

  return { majorHigh: +majorHigh.toFixed(2), majorLow: +majorLow.toFixed(2), line1_3: +line1_3.toFixed(2), line2_3: +line2_3.toFixed(2), currentPosition, buyZone, description };
}

export async function analyzeTradeSignal(symbol: string, marketHint?: "SET" | "US") {
  symbol = symbol?.toUpperCase();
  if (!symbol) throw new Error("Missing symbol");

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  try {
    const ts = Date.now();
    const isProbablySET = /^[A-Z]+$/.test(symbol) && !symbol.includes(".");
    const yahooSymbol = isProbablySET && (SET_SYMBOLS_FALLBACK.includes(symbol) || marketHint === "SET") ? `${symbol}.BK` : symbol;
    const isSET = yahooSymbol.endsWith(".BK") || marketHint === "SET";

    const res = await yahooFetchWithRetry(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=3mo&interval=1d&_=${ts}`);

    if (!res.ok) throw new Error(`Yahoo fetch failed with status: ${res.status}`);

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result?.meta) throw new Error("No data found for this symbol");

    const meta = result.meta;
    const closes: number[] = result.indicators?.quote?.[0]?.close?.filter((v: any) => v != null) || [];
    const highs: number[]  = result.indicators?.quote?.[0]?.high?.filter((v: any) => v != null) || [];
    const lows: number[]   = result.indicators?.quote?.[0]?.low?.filter((v: any) => v != null) || [];
    const opens: number[]   = result.indicators?.quote?.[0]?.open?.filter((v: any) => v != null) || [];
    const volumes: number[] = result.indicators?.quote?.[0]?.volume?.filter((v: any) => v != null) || [];
    const timestamps: number[] = result.timestamp || [];

    const price = meta.regularMarketPrice || closes[closes.length - 1] || 0;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    const rsi = computeRSI(closes);
    const macdData = computeMACD(closes);
    const ema9 = computeEMA(closes, 9);
    const ema21 = computeEMA(closes, 21);
    const ema9Val  = ema9.length > 0 ? ema9[ema9.length - 1] : price;
    const ema21Val = ema21.length > 0 ? ema21[ema21.length - 1] : price;
    const ema9Prev  = ema9.length  >= 2 ? ema9[ema9.length - 2]   : ema9Val;
    const ema21Prev = ema21.length >= 2 ? ema21[ema21.length - 2] : ema21Val;
    const emaCrossover = ema9Prev <= ema21Prev && ema9Val > ema21Val;
    const emaAbove = ema9Val > ema21Val;

    const avgVol10 = volumes.length >= 10 ? volumes.slice(-10).reduce((a, b) => a + b, 0) / 10 : volumes[volumes.length - 1] || 1;
    const currentVol = volumes[volumes.length - 1] || 0;
    const volRatio = avgVol10 > 0 ? currentVol / avgVol10 : 0;

    const vwap = computeVWAP(highs, lows, closes, volumes);
    const vwapPosition = price > vwap * 1.005 ? "Above" : price < vwap * 0.995 ? "Below" : "At";

    const adx = computeADX(highs, lows, closes);

    const stoch = computeStochastic(highs, lows, closes);
    const ma = computeMA(closes, [20, 50, 200]);
    const trendlines = detectTrendlines(highs, lows, timestamps);
    const priceAction = detectPriceAction(opens, highs, lows, closes);
    const smc = detectSMC(highs, lows, closes, opens, volumes);
    const speedLines = computeSpeedLines(highs, lows, closes);

    const rsiMin = isSET ? 32 : 36;
    const rsiMax = isSET ? 52 : 54;
    const volThreshold = isSET ? 1.6 : 1.4;
    const adxThreshold = isSET ? 22 : 20;

    const rsiTrendUp = closes.length >= 3 ? computeRSI(closes.slice(0, -1)) < rsi : true;
    const rsiBuy = rsi >= rsiMin && rsi <= rsiMax && rsiTrendUp;
    const macdBuy = macdData.crossover;
    const emaBuy = emaCrossover || (emaAbove && macdData.histogram > 0);
    const volumeBuy = volRatio >= volThreshold;
    const vwapBuy = vwapPosition === "At" || vwapPosition === "Above";
    const adxBuy = adx > adxThreshold;

    const signals = {
      rsi:    { value: +rsi.toFixed(2), buy: rsiBuy },
      macd:   { ...macdData, buy: macdBuy },
      ema:    { ema9: +ema9Val.toFixed(4), ema21: +ema21Val.toFixed(4), crossover: emaCrossover, above: emaAbove, buy: emaBuy },
      volume: { current: currentVol, avg10: Math.round(avgVol10), ratio: +volRatio.toFixed(2), buy: volumeBuy },
      vwap:   { value: +vwap.toFixed(2), position: vwapPosition, buy: vwapBuy },
      adx:    { value: adx, trend: adx > adxThreshold, buy: adxBuy },
    };

    const scoringWeights = {
      rsi:        { weight: 8,  buy: signals.rsi.buy },
      macd:       { weight: 10, buy: signals.macd.buy },
      ema:        { weight: 8,  buy: signals.ema.buy },
      volume:     { weight: 7,  buy: signals.volume.buy },
      vwap:       { weight: 7,  buy: signals.vwap.buy },
      adx:        { weight: 6,  buy: signals.adx.buy },
      stoch:      { weight: 9,  buy: stoch.signal === 'BUY' },
      ma_trend:   { weight: 7,  buy: price > ma[20] && ma[20] > ma[50] },
      trendline:  { weight: 8,  buy: trendlines.currentTrend === 'UP' && trendlines.trendStrength > 60 },
      pa_bullish: { weight: 10, buy: priceAction.latestBullish !== null },
      smc_demand: { weight: 12, buy: smc.priceInDemand || (smc.nearestDemand !== null && Math.abs(price - smc.nearestDemand.high) / price < 0.02) },
      speed_line: { weight: 8,  buy: speedLines.buyZone },
    };

    const totalWeight = Object.values(scoringWeights).reduce((sum, s) => sum + s.weight, 0);
    const earnedWeight = Object.values(scoringWeights).filter(s => s.buy).reduce((sum, s) => sum + s.weight, 0);
    const confidence = Math.round(earnedWeight / totalWeight * 100);
    
    const buyCount = Object.values(scoringWeights).filter(s => s.buy).length;
    const label = confidence >= 85 ? "STRONG BUY" : confidence >= 70 ? "BUY" : confidence >= 50 ? "WATCH" : "NO SIGNAL";

    const atr = getATR(highs, lows, closes, 14) || price * 0.02;
    const entry = +price.toFixed(2);
    const sl = +(price - atr * 1.2).toFixed(2);
    const tp = +(price + atr * 2).toFixed(2);
    const riskAmt = entry - sl;
    const rewardAmt = tp - entry;
    const rr = riskAmt > 0 ? +(rewardAmt / riskAmt).toFixed(2) : 0;
    const slPct = +((riskAmt / entry) * 100).toFixed(2);
    const tpPct = +((rewardAmt / entry) * 100).toFixed(2);

    const chartData = (result.timestamp || [])
      .map((t: number, i: number) => ({ time: t * 1000, price: closes[i] || 0 }))
      .filter((d: any) => d.price > 0).slice(-30);

    const data = {
      symbol, yahooSymbol, market: isSET ? "SET" : "US",
      name: meta.shortName || meta.longName || symbol,
      price: entry, prevClose: +prevClose.toFixed(2), changePct: +changePct.toFixed(2),
      signals, confidence, label, buyCount,
      trade: { entry, tp, tpPct, sl, slPct, rr },
      chartData, currency: isSET ? "THB" : "USD",
      stoch, ma, trendlines, priceAction, smc, speedLines
    };

    cache.set(symbol, { data, ts: Date.now() });
    return data;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Unknown error");
  }
}

export async function scanMarketSignals(market: 'SET' | 'US_STANDARD' | 'US_DIME' | 'ALL') {
  const scanCacheKey = `scan_${market}`;
  const cached = cache.get(scanCacheKey);
  if (cached && Date.now() - cached.ts < SCAN_TTL) return cached.data;
  
  let allResults: any[] = [];
  
  const marketsToScan = market === 'ALL' 
    ? ['SET', 'US_STANDARD', 'US_DIME'] as const
    : [market] as const;
  
  for (const mkt of marketsToScan) {
    const universeMarket = mkt === 'US_STANDARD' ? 'US_ALL' : mkt;
    const allSymbols = await getSymbolUniverse(universeMarket as 'SET' | 'US_ALL' | 'US_DIME');
    
    const activeSymbols = await preFilterSymbols(allSymbols, mkt);
    const toAnalyze = activeSymbols.slice(0, 80);
    
    const confidenceThreshold = mkt === 'US_DIME' ? 60 : 50;
    
    const results = await Promise.allSettled(
      toAnalyze.map(sym => analyzeTradeSignal(sym, mkt === 'SET' ? 'SET' : 'US'))
    );
    
    const marketResults = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value)
      .filter(d => d.confidence >= confidenceThreshold && d.label !== 'NO SIGNAL')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, market === 'ALL' ? 10 : 5);
    
    allResults = [...allResults, ...marketResults];
  }
  
  const seen = new Set<string>();
  const final = allResults
    .filter(r => { if (seen.has(r.symbol)) return false; seen.add(r.symbol); return true; })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12);
  
  cache.set(scanCacheKey, { data: final, ts: Date.now() });
  return final;
}

export async function searchSymbols(query: string): Promise<Array<{
  symbol: string;
  name: string;
  market: 'SET' | 'US';
  price?: number;
  exchange?: string;
}>> {
  if (!query || query.length < 1) return [];
  const q = query.toUpperCase();
  
  const res = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&listsCount=0`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    }
  );
  
  if (!res.ok) return [];
  const json = await res.json();
  const quotes = json?.quotes || [];
  
  return quotes
    .filter((q: any) => 
      q.quoteType === 'EQUITY' &&
      q.symbol &&
      !q.symbol.includes('=') &&
      !q.symbol.includes('-')
    )
    .map((q: any) => ({
      symbol: q.symbol.replace('.BK', ''),
      name: q.shortname || q.longname || q.symbol,
      market: q.symbol.endsWith('.BK') ? 'SET' : 'US',
      exchange: q.exchange || '',
    }))
    .slice(0, 10);
}

// ─── Enhanced Pyramid Types ──────────────────────────────────────────────────
export type PyramidEntry = {
  level: number; price: number; sizePercent: number; label: string;
  reason: string; zone: string; status: 'READY' | 'WAIT' | 'PASSED';
};
export type TakeProfitLevel = {
  level: number; price: number; sellPercent: number; label: string; reason: string;
};
export type PyramidPlan = {
  entries: PyramidEntry[];
  takeProfits: TakeProfitLevel[];
  avgEntry: number; newSL: number; newTP: number; newRR: number; breakEven: number;
  timeframe: 'DAY' | 'SWING' | 'MONTH';
  summary: string;
};

export async function computePyramidLevels(
  entry: number, sl: number, tp: number, atr: number,
  market: "SET" | "US",
  timeframe: 'DAY' | 'SWING' | 'MONTH' = 'DAY',
  extras?: { ma20?: number; ma50?: number; demandLow?: number; demandHigh?: number; supplyLow?: number; supplyHigh?: number; vwap?: number }
): Promise<PyramidPlan> {
  const price = entry;
  // Fibonacci pullback levels
  const fib382 = +(price - atr * 0.382).toFixed(2);
  const fib500 = +(price - atr * 0.500).toFixed(2);
  const fib618 = +(price - atr * 0.618).toFixed(2);
  const fib786 = +(price - atr * 0.786).toFixed(2);

  const sizeMap: Record<string, number[]> = {
    DAY:   [35, 25, 20, 12, 8],
    SWING: [30, 25, 20, 15, 10],
    MONTH: [25, 25, 20, 15, 15],
  };
  const sizes = sizeMap[timeframe];

  // Dynamic entry levels with reasons
  const e1 = price;
  const e2 = extras?.vwap && extras.vwap < price ? +extras.vwap.toFixed(2) : fib382;
  const e3 = extras?.ma20 && extras.ma20 < price ? +extras.ma20.toFixed(2) : fib500;
  const e4 = extras?.demandHigh && extras.demandHigh < price ? +extras.demandHigh.toFixed(2) : fib618;
  const e5 = extras?.ma50 && extras.ma50 < price ? +extras.ma50.toFixed(2) : fib786;

  const allEntries = [e1, e2, e3, e4, e5];
  // Sort descending (highest first) and remove entries below SL
  const validEntries = allEntries.filter(e => e > sl).sort((a, b) => b - a);

  const entries: PyramidEntry[] = validEntries.map((ep, i) => {
    let reason = '';
    let zone = '';
    if (ep === price) { reason = 'ราคาปัจจุบัน — จุดเข้าแรก'; zone = 'CURRENT'; }
    else if (extras?.vwap && Math.abs(ep - extras.vwap) / price < 0.005) { reason = 'แนว VWAP Support'; zone = 'VWAP'; }
    else if (extras?.ma20 && Math.abs(ep - extras.ma20) / price < 0.005) { reason = 'แนว MA20 Support'; zone = 'MA20'; }
    else if (extras?.demandHigh && Math.abs(ep - extras.demandHigh) / price < 0.01) { reason = 'Demand Zone (SMC)'; zone = 'DEMAND'; }
    else if (extras?.ma50 && Math.abs(ep - extras.ma50) / price < 0.005) { reason = 'แนว MA50 Support'; zone = 'MA50'; }
    else { reason = `Fibonacci ${i === 1 ? '38.2%' : i === 2 ? '50%' : i === 3 ? '61.8%' : '78.6%'} pullback`; zone = 'FIB'; }

    const status: 'READY' | 'WAIT' | 'PASSED' = i === 0 ? 'READY' : price <= ep ? 'PASSED' : 'WAIT';

    return {
      level: i + 1,
      price: ep,
      sizePercent: sizes[i] || 5,
      label: `ไม้ ${i + 1}${i === 0 ? ' (เปิดสถานะ)' : ` (ถ้าย่อถึง ${ep.toLocaleString()})`}`,
      reason, zone, status,
    };
  });

  // Weighted average
  const totalWeight = entries.reduce((s, e) => s + e.sizePercent, 0);
  const avgEntry = +(entries.reduce((s, e) => s + e.price * e.sizePercent, 0) / totalWeight).toFixed(2);

  const lowestEntry = entries[entries.length - 1]?.price || price;
  const newSL = +(lowestEntry - atr * 0.5).toFixed(2);

  // Multi-level Take Profits
  const tp1Price = +(price + atr * 1.0).toFixed(2);
  const tp2Price = +(price + atr * 2.0).toFixed(2);
  const tp3Price = extras?.supplyLow && extras.supplyLow > price
    ? +extras.supplyLow.toFixed(2)
    : +(price + atr * 3.0).toFixed(2);

  const takeProfits: TakeProfitLevel[] = [
    { level: 1, price: tp1Price, sellPercent: 30, label: 'TP1 — Conservative', reason: `1× ATR (${((tp1Price - price) / price * 100).toFixed(1)}%) คืนทุนเร็ว` },
    { level: 2, price: tp2Price, sellPercent: 40, label: 'TP2 — Normal', reason: `2× ATR (${((tp2Price - price) / price * 100).toFixed(1)}%) จุดขายหลัก` },
    { level: 3, price: tp3Price, sellPercent: 30, label: 'TP3 — Aggressive', reason: extras?.supplyLow ? `Supply Zone (${((tp3Price - price) / price * 100).toFixed(1)}%)` : `3× ATR (${((tp3Price - price) / price * 100).toFixed(1)}%) ปล่อยกำไรวิ่ง` },
  ];

  const newTP = tp2Price;
  const newRR = (newTP - avgEntry) > 0 && (avgEntry - newSL) > 0 ? +((newTP - avgEntry) / (avgEntry - newSL)).toFixed(2) : 0;
  const breakEven = +(avgEntry * 1.003).toFixed(2);

  const tfLabel = timeframe === 'DAY' ? 'Day Trade' : timeframe === 'SWING' ? 'Swing Trade' : 'Month Trade';
  const summary = `${tfLabel}: เข้า ${entries.length} ไม้ | Avg ${market === 'SET' ? '฿' : '$'}${avgEntry} | R:R 1:${newRR} | TP ที่ ${market === 'SET' ? '฿' : '$'}${tp2Price}`;

  return { entries, takeProfits, avgEntry, newSL, newTP, newRR, breakEven, timeframe, summary };
}

// ─── Multi-Timeframe Analysis ────────────────────────────────────────────────
export async function analyzeMultiTimeframe(symbol: string, timeframe: 'DAY' | 'SWING' | 'MONTH', marketHint?: "SET" | "US") {
  const baseData = await analyzeTradeSignal(symbol, marketHint);

  // Fetch additional timeframe-specific data
  const isProbablySET = /^[A-Z]+$/.test(symbol) && !symbol.includes(".");
  const yahooSymbol = isProbablySET && (SET_SYMBOLS_FALLBACK.includes(symbol) || marketHint === "SET") ? `${symbol}.BK` : symbol;
  const ts = Date.now();

  let tfRange = '3mo', tfInterval = '1d';
  if (timeframe === 'DAY') { tfRange = '5d'; tfInterval = '15m'; }
  else if (timeframe === 'MONTH') { tfRange = '1y'; tfInterval = '1wk'; }

  let tfData = null;
  try {
    const res = await yahooFetchWithRetry(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=${tfRange}&interval=${tfInterval}&_=${ts}`
    );
    if (res.ok) {
      const json = await res.json();
      const r = json?.chart?.result?.[0];
      if (r) {
        const c = r.indicators?.quote?.[0]?.close?.filter((v: any) => v != null) || [];
        const h = r.indicators?.quote?.[0]?.high?.filter((v: any) => v != null) || [];
        const l = r.indicators?.quote?.[0]?.low?.filter((v: any) => v != null) || [];
        const tfRsi = computeRSI(c);
        const tfMacd = computeMACD(c);
        const tfTrend = detectTrendlines(h, l, r.timestamp || []);
        tfData = { rsi: +tfRsi.toFixed(2), macd: tfMacd, trend: tfTrend.currentTrend, trendStrength: tfTrend.trendStrength };
      }
    }
  } catch { /* ignore */ }

  // Enhanced pyramid with extra context
  const atr = Math.abs(baseData.trade.entry - baseData.trade.sl) / 1.2;
  const pyramidPlan = await computePyramidLevels(
    baseData.trade.entry, baseData.trade.sl, baseData.trade.tp, atr,
    baseData.market as "SET" | "US", timeframe,
    {
      ma20: baseData.ma[20], ma50: baseData.ma[50],
      demandLow: baseData.smc.nearestDemand?.low, demandHigh: baseData.smc.nearestDemand?.high,
      supplyLow: baseData.smc.nearestSupply?.low, supplyHigh: baseData.smc.nearestSupply?.high,
      vwap: baseData.signals.vwap.value,
    }
  );

  // Timeframe-specific advice
  let advice = '';
  if (timeframe === 'DAY') {
    advice = baseData.signals.volume.ratio >= 1.5
      ? '✅ Volume สูง เหมาะกับ Day Trade — เข้าไม้แรกได้'
      : '⚠️ Volume ยังไม่สูงพอ — รอ breakout ก่อน';
  } else if (timeframe === 'SWING') {
    advice = baseData.trendlines.currentTrend === 'UP'
      ? '✅ Trend ขาขึ้น — เหมาะ Swing 3-7 วัน'
      : '⚠️ ยังไม่ชัดเจน — รอ trend ยืนยัน';
  } else {
    advice = baseData.ma[20] > baseData.ma[50]
      ? '✅ MA20 > MA50 — Structure ดี เหมาะถือ 1-3 เดือน'
      : '⚠️ MA ยังไม่ cross — รอจังหวะดีกว่า';
  }

  return { ...baseData, timeframe, tfData, pyramidPlan, advice };
}

// ─── Trade Journal Types ─────────────────────────────────────────────────────
export type TradeJournalEntry = {
  id: string;
  symbol: string;
  market: 'SET' | 'US';
  timeframe: 'DAY' | 'SWING' | 'MONTH';
  status: 'OPEN' | 'PARTIAL' | 'CLOSED';
  entries: Array<{ level: number; price: number; sizePct: number; filledAt: string | null; status: 'FILLED' | 'PENDING' | 'CANCELLED' }>;
  stopLoss: number;
  takeProfits: Array<{ level: number; price: number; sellPct: number; hitAt: string | null }>;
  avgEntry: number;
  totalPnl: number;
  totalPnlPct: number;
  notes: string;
  openedAt: string;
  closedAt: string | null;
};

