import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval') || '60';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  // Basic symbol mapping for Yahoo Finance
  let formattedSymbol = symbol;
  if (symbol === 'XAUUSD' || symbol === 'XAGUSD' || symbol === 'EURUSD' || symbol === 'GBPUSD' || symbol === 'USDJPY') {
    formattedSymbol = `${symbol}=X`;
  } else if (symbol.endsWith('USD') && symbol.length >= 6) {
     formattedSymbol = symbol.replace('USD', '-USD');
  }

  let yahooInterval = '1h';
  let range = '1mo';

  // Map TradingView intervals to Yahoo intervals
  switch (interval) {
    case '1':
      yahooInterval = '1m';
      range = '5d';
      break;
    case '5':
      yahooInterval = '5m';
      range = '5d';
      break;
    case '15':
      yahooInterval = '15m';
      range = '5d';
      break;
    case '30':
      yahooInterval = '30m';
      range = '1mo';
      break;
    case '60':
      yahooInterval = '1h';
      range = '1mo';
      break;
    case '240': // 4h fallback to 1h with longer range
      yahooInterval = '1h';
      range = '3mo';
      break;
    case 'D':
      yahooInterval = '1d';
      range = '1y';
      break;
    case 'W':
      yahooInterval = '1wk';
      range = '5y';
      break;
    default:
      yahooInterval = '1h';
      range = '1mo';
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedSymbol}?interval=${yahooInterval}&range=${range}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    const data = await response.json();

    if (data.chart.error) {
      return NextResponse.json({ error: data.chart.error.description }, { status: 400 });
    }

    const result = data.chart.result[0];
    const quote = result.indicators.quote[0];
    
    const highs = quote.high;
    const lows = quote.low;
    const timestamps = result.timestamp;

    const cleanData = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (highs[i] !== null && lows[i] !== null) {
        cleanData.push({
          timestamp: timestamps[i] * 1000,
          high: highs[i],
          low: lows[i],
        });
      }
    }

    return NextResponse.json({ data: cleanData, symbol: formattedSymbol });
  } catch (error) {
    console.error('Error fetching market data:', error);
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}
