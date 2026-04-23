import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const period = searchParams.get('period');
  const interval = searchParams.get('interval');
  const range = searchParams.get('range');

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  try {
    const timestamp = new Date().getTime();

    // Determine range and interval based on parameters
    let finalRange: string;
    let finalInterval: string;

    // If interval and range are provided directly, use them (new approach)
    if (interval && range) {
      finalInterval = interval;
      finalRange = range;
    }
    // Otherwise fall back to period mapping (old approach)
    else if (period) {
      switch (period) {
        case '1d':
          finalRange = '1d';
          finalInterval = '1m';
          break;
        case '5d':
          finalRange = '5d';
          finalInterval = '15m';
          break;
        case '1m':
          finalRange = '1mo';
          finalInterval = '1d';
          break;
        case '6m':
          finalRange = '6mo';
          finalInterval = '1d';
          break;
        case 'ytd':
          finalRange = 'ytd';
          finalInterval = '1d';
          break;
        case '1y':
          finalRange = '1y';
          finalInterval = '1d';
          break;
        case '5y':
          finalRange = '5y';
          finalInterval = '1d';
          break;
        default:
          finalRange = '1d';
          finalInterval = '1m';
      }
    } else {
      // Default fallback
      finalRange = '1d';
      finalInterval = '1m';
    }

    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${finalRange}&interval=${finalInterval}&_=${timestamp}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: 'No chart data available' }, { status: 404 });
    }

    // Parse chart data
    const timestamps = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];

    const chartData = timestamps.map((t: number, i: number) => ({
      time: t * 1000, // Convert to JS timestamp
      price: Number(closes[i]) || 0
    })).filter((dp: any) => dp.price > 0);

    // Also fetch meta data
    const meta = result?.meta || {};
    const price = meta.regularMarketPrice || 0;
    const prevClose = meta.chartPreviousClose || price;
    const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    return NextResponse.json({
      symbol: meta.symbol || symbol,
      price: price,
      changePercent: changePercent,
      name: meta.shortName || meta.longName || symbol,
      chartData: chartData,
      period: period || finalRange,
      interval: finalInterval,
      range: finalRange
    });

  } catch (error) {
    console.error('Chart API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
