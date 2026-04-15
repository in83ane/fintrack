import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const symbols = symbolsParam.split(',').filter(Boolean);

  try {
    const timestamp = new Date().getTime(); // cache-buster

    // Fetch individual charts in parallel as v8/chart bypasses crumb requirements
    const fetchPromises = symbols.map(async (symbol) => {
      try {
        // ✅ Fetch both daily data (for periods > 1d) and intraday data (for 1d chart)
        const [dailyRes, intradayRes] = await Promise.all([
          // Daily data for 6 months (for historical periods)
          fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=6mo&interval=1d&_=${timestamp}`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
              },
              cache: 'no-store'
            }
          ),
          // Intraday data for 1 day (1 minute intervals for detailed sparkline)
          fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1m&_=${timestamp}`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
              },
              cache: 'no-store'
            }
          ).catch(() => null) // Intraday may fail for some symbols, that's ok
        ]);

        if (!dailyRes.ok) return null;
        const dailyData = await dailyRes.json();

        const meta = dailyData?.chart?.result?.[0]?.meta;
        if (!meta) return null;

        const price = meta.regularMarketPrice || 0;
        const prevClose = meta.chartPreviousClose || price;
        const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
        const name = meta.shortName || meta.longName || symbol;

        // Parse daily chart data (for 1w, 1m, 6m, etc.)
        let dailyChartData: { time: number; price: number }[] = [];
        try {
          const timestamps = dailyData?.chart?.result?.[0]?.timestamp || [];
          const closes = dailyData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];

          dailyChartData = timestamps.map((t: number, i: number) => ({
            time: t * 1000,
            price: Number(closes[i]) || 0
          })).filter((dp: any) => dp.price > 0);
        } catch (e) {
          console.error("Failed to parse daily chart series", e);
        }

        // Parse intraday data (for 1d sparkline)
        let intradayData: { time: number; price: number }[] = [];
        if (intradayRes && intradayRes.ok) {
          try {
            const intraData = await intradayRes.json();
            const intraTimestamps = intraData?.chart?.result?.[0]?.timestamp || [];
            const intraCloses = intraData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];

            intradayData = intraTimestamps.map((t: number, i: number) => ({
              time: t * 1000,
              price: Number(intraCloses[i]) || 0
            })).filter((dp: any) => dp.price > 0);
          } catch (e) {
            console.error("Failed to parse intraday chart", e);
          }
        }

        // Merge intraday + daily data: intraday comes first (most recent day), then daily data
        // Filter out daily data points that overlap with intraday
        const intradayLastTime = intradayData.length > 0
          ? Math.max(...intradayData.map(d => d.time))
          : 0;

        // Only keep daily data that is before the intraday period
        const filteredDailyData = dailyChartData.filter(d => d.time < intradayLastTime);

        // Combine: intraday first (for 1d view), then daily (for longer periods)
        const combinedChartData = [...intradayData, ...filteredDailyData];

        return {
          symbol: meta.symbol || symbol,
          price: price,
          changePercent: changePercent,
          name: name,
          chartData: combinedChartData,
          intradayData: intradayData // Separate intraday for sparkline
        };
      } catch (err) {
        console.error(`Failed to fetch chart for ${symbol}`, err);
        return null;
      }
    });

    const results = (await Promise.all(fetchPromises)).filter(Boolean);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Market API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

