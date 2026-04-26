import { NextResponse } from 'next/server';

// In-memory cache for faster responses (per-server-instance)
const marketCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const symbols = symbolsParam.split(',').filter(Boolean);
  const cacheKey = symbols.sort().join(',');

  // Check cache first
  const cached = marketCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const timestamp = new Date().getTime();

    // Fetch individual charts in parallel with Promise.allSettled for better error handling
    const fetchPromises = symbols.map(async (symbol) => {
      try {
        const [dailyRes, intradayRes] = await Promise.allSettled([
          fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1mo&interval=1d&_=${timestamp}`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain',
              },
              signal: AbortSignal.timeout(8000) // 8 second timeout
            }
          ),
          fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m&_=${timestamp}`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain',
              },
              signal: AbortSignal.timeout(5000)
            }
          ).catch(() => null)
        ]);

        const dailyResult = dailyRes.status === 'fulfilled' && dailyRes.value.ok ? dailyRes.value : null;
        const intradayResult = intradayRes.status === 'fulfilled' && intradayRes.value?.ok ? intradayRes.value : null;

        if (!dailyResult) return null;

        const dailyData = await dailyResult.json();
        const result = dailyData?.chart?.result?.[0];
        if (!result?.meta) return null;

        const meta = result.meta;
        const price = meta.regularMarketPrice || meta.previousClose || 0;
        const prevClose = meta.chartPreviousClose || meta.previousClose || price;
        const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
        const name = meta.shortName || meta.longName || symbol;

        // Parse chart data
        const parseChartData = (data: any) => {
          const timestamps = data?.chart?.result?.[0]?.timestamp || [];
          const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
          return timestamps
            .map((t: number, i: number) => ({ time: t * 1000, price: Number(closes[i]) || 0 }))
            .filter((dp: any) => dp.price > 0);
        };

        let dailyChartData = parseChartData(dailyData);
        let intradayData: { time: number; price: number }[] = [];

        if (intradayResult) {
          const intraData = await intradayResult.json();
          intradayData = parseChartData(intraData);
        }

        // Merge: intraday first, then filtered daily
        const intradayLastTime = intradayData.length > 0 ? Math.max(...intradayData.map((d: { time: number }) => d.time)) : 0;
        const filteredDaily = dailyChartData.filter((d: { time: number }) => d.time < intradayLastTime - 3600000); // 1hr buffer
        const combined = [...intradayData, ...filteredDaily];

        return {
          symbol: meta.symbol || symbol,
          price,
          changePercent: Number(changePercent.toFixed(2)),
          name,
          chartData: combined,
          intradayData
        };
      } catch (err) {
        console.debug(`Yahoo fetch failed for ${symbol}:`, err instanceof Error ? err.message : err);
        return null;
      }
    });

    const results = (await Promise.all(fetchPromises)).filter(Boolean);

    const responseData = { results, timestamp: Date.now() };
    marketCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Market API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
