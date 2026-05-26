import { NextResponse } from 'next/server';
import { analyzeCache, generateCacheKey, queryDeduplicator } from '@/src/lib/cache';

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
    for (let i = period; i < arr.length; i++) {
      s = s - s / period + arr[i];
      result.push(s);
    }
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
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
  }
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });

  const cacheKey = generateCacheKey('analyze', { symbol });
  const cached = analyzeCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const data = await queryDeduplicator.dedupe(cacheKey, async () => {
      const ts = Date.now();
      const yahooSymbol = /^[A-Z]+$/.test(symbol) && ['AOT','PTT','DELTA','SCB','CPALL','KBANK','BBL','TRUE','ADVANC','IVL','GULF','BEM','BDMS','BH','MINT','CPN','SCC','PTTGC','TOP','IRPC','BANPU','RATCH','EGCO','INTUCH','DTAC','AWC','WHA','HMPRO','BJC','MAKRO','CRC','OR','GPSC','EA','SAWAD','KTB','TTB','TISCO','KKP','TIDLOR'].includes(symbol) ? `${symbol}.BK` : symbol;

      const isSET = yahooSymbol.endsWith('.BK');

      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=1mo&interval=1d&_=${ts}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!res.ok) throw new Error('Yahoo fetch failed');

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result?.meta) throw new Error('No data available');

      const meta = result.meta;
      const closes: number[] = result.indicators?.quote?.[0]?.close?.filter((v: any) => v != null) || [];
      const highs: number[] = result.indicators?.quote?.[0]?.high?.filter((v: any) => v != null) || [];
      const lows: number[] = result.indicators?.quote?.[0]?.low?.filter((v: any) => v != null) || [];
      const volumes: number[] = result.indicators?.quote?.[0]?.volume?.filter((v: any) => v != null) || [];

      const price = meta.regularMarketPrice || closes[closes.length - 1] || 0;
      const prevClose = meta.chartPreviousClose || meta.previousClose || price;
      const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

      // Indicators
      const rsi = computeRSI(closes);
      const macdData = computeMACD(closes);
      const ema9 = computeEMA(closes, 9);
      const ema21 = computeEMA(closes, 21);
      const ema9Val = ema9[ema9.length - 1];
      const ema21Val = ema21[ema21.length - 1];
      const ema9Prev = ema9.length >= 2 ? ema9[ema9.length - 2] : ema9Val;
      const ema21Prev = ema21.length >= 2 ? ema21[ema21.length - 2] : ema21Val;
      const emaCrossover = ema9Prev <= ema21Prev && ema9Val > ema21Val;
      const emaAbove = ema9Val > ema21Val;

      const avgVol10 = volumes.length >= 10 ? volumes.slice(-10).reduce((a, b) => a + b, 0) / 10 : volumes[volumes.length - 1] || 1;
      const currentVol = volumes[volumes.length - 1] || 0;
      const volRatio = avgVol10 > 0 ? currentVol / avgVol10 : 0;

      const vwap = computeVWAP(highs, lows, closes, volumes);
      const vwapPosition = price > vwap * 1.005 ? 'Above' : price < vwap * 0.995 ? 'Below' : 'At';

      const adx = computeADX(highs, lows, closes);

      // Signal scoring
      const rsiMin = isSET ? 30 : 35;
      const rsiMax = isSET ? 50 : 52;
      const volThreshold = isSET ? 1.5 : 1.3;
      const adxThreshold = isSET ? 20 : 18;

      const signals = {
        rsi: { value: +rsi.toFixed(2), buy: rsi >= rsiMin && rsi <= rsiMax },
        macd: { ...macdData, buy: macdData.crossover },
        ema: { ema9: +ema9Val.toFixed(4), ema21: +ema21Val.toFixed(4), crossover: emaCrossover, above: emaAbove, buy: emaCrossover || emaAbove },
        volume: { current: currentVol, avg10: Math.round(avgVol10), ratio: +volRatio.toFixed(2), buy: volRatio >= volThreshold },
        vwap: { value: +vwap.toFixed(2), position: vwapPosition, buy: vwapPosition === 'At' || vwapPosition === 'Above' },
        adx: { value: adx, trend: adx > adxThreshold, buy: adx > adxThreshold },
      };

      const buyCount = [signals.rsi.buy, signals.macd.buy, signals.ema.buy, signals.volume.buy, signals.vwap.buy, signals.adx.buy].filter(Boolean).length;
      const confidence = Math.round((buyCount / 6) * 100);
      const label = confidence >= 85 ? 'STRONG BUY' : confidence >= 70 ? 'BUY' : confidence >= 50 ? 'WATCH' : 'NO SIGNAL';

      // Trade levels
      const atr = highs.length >= 14 ? highs.slice(-14).reduce((sum, h, i) => {
        const l = lows[lows.length - 14 + i];
        const pc = i > 0 ? closes[closes.length - 14 + i - 1] : closes[closes.length - 15];
        return sum + Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      }, 0) / 14 : price * 0.02;

      const entry = +price.toFixed(2);
      const sl = +(price - atr * 1.2).toFixed(2);
      const tp = +(price + atr * 2).toFixed(2);
      const riskAmt = entry - sl;
      const rewardAmt = tp - entry;
      const rr = riskAmt > 0 ? +(rewardAmt / riskAmt).toFixed(2) : 0;
      const slPct = +((riskAmt / entry) * 100).toFixed(2);
      const tpPct = +((rewardAmt / entry) * 100).toFixed(2);

      const chartData = (result.timestamp || []).map((t: number, i: number) => ({
        time: t * 1000,
        price: closes[i] || 0,
      })).filter((d: any) => d.price > 0);

      return {
        symbol, yahooSymbol, market: isSET ? 'SET' : 'US',
        name: meta.shortName || meta.longName || symbol,
        price: entry, prevClose: +prevClose.toFixed(2), changePct: +changePct.toFixed(2),
        signals, confidence, label, buyCount,
        trade: { entry, tp, tpPct, sl, slPct, rr },
        chartData,
        currency: isSET ? 'THB' : 'USD',
      };
    });

    analyzeCache.set(cacheKey, data);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Internal error', details: err instanceof Error ? err.message : 'Unknown' }, { status: 500 });
  }
}
