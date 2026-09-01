import { NextResponse } from 'next/server';
import { analyzeTerminal } from '@/src/app/(app)/terminal/actions';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval') || '60';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
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
    const analysis = await analyzeTerminal(symbol, range, yahooInterval);
    return NextResponse.json({ data: analysis });
  } catch (error) {
    console.error('Market analysis error:', error);
    return NextResponse.json({ error: 'Failed to analyze symbol' }, { status: 500 });
  }
}
