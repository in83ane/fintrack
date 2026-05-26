import { NextResponse } from 'next/server';
import { chartCache, generateCacheKey, queryDeduplicator } from '@/src/lib/cache';

interface ChartCacheData {
  symbol: string;
  price: number;
  changePercent: number;
  name: string;
  chartData: any[];
  period: string;
  interval: string;
  range: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval');
  const range = searchParams.get('range');

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  const cacheKey = generateCacheKey('chart', { symbol, interval, range });

  // Check cache first
  const cached = chartCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    // Use deduplicator to prevent duplicate requests
    const responseData = await queryDeduplicator.dedupe(cacheKey, async () => {
      const timestamp = new Date().getTime();
      const finalRange = range || '1d';
      const finalInterval = interval || '1m';

      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${finalRange}&interval=${finalInterval}&_=${timestamp}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain',
          },
          signal: AbortSignal.timeout(10000) // 10 second timeout
        }
      );

      if (!response.ok) {
        throw new Error(`Yahoo API returned ${response.status}`);
      }

      const data = await response.json();
      const result = data?.chart?.result?.[0];

      if (!result) {
        throw new Error('No chart data available');
      }

      const timestamps = result?.timestamp || [];
      const closes = result?.indicators?.quote?.[0]?.close || [];

      const chartData = timestamps
        .map((t: number, i: number) => ({ time: t * 1000, price: Number(closes[i]) || 0 }))
        .filter((dp: any) => dp.price > 0);

      const meta = result?.meta || {};
      const price = meta.regularMarketPrice || 0;
      const prevClose = meta.chartPreviousClose || meta.previousClose || price;
      const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

      return {
        symbol: meta.symbol || symbol,
        price,
        changePercent: Number(changePercent.toFixed(2)),
        name: meta.shortName || meta.longName || symbol,
        chartData,
        period: range || finalRange,
        interval: finalInterval,
        range: finalRange
      } as ChartCacheData;
    });

    // Cache the successful response
    chartCache.set(cacheKey, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Chart API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
