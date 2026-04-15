import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const response = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=6`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      return NextResponse.json({ results: [] });
    }

    const data = await response.json();
    const results = data.quotes
      .filter((q: any) => q.quoteType === 'EQUITY' || q.quoteType === 'CRYPTOCURRENCY' || q.quoteType === 'ETF')
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname,
        exchange: q.exchDisp
      }));

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
