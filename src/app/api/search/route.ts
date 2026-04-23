import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const fetchSearch = async (query: string) => {
      const response = await fetch(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${query}&quotesCount=6`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json'
          },
          cache: 'no-store'
        }
      );
      if (!response.ok) return [];
      const data = await response.json();
      return data.quotes
        .filter((q: any) => q.quoteType === 'EQUITY' || q.quoteType === 'CRYPTOCURRENCY' || q.quoteType === 'ETF')
        .map((q: any) => ({
          symbol: q.symbol,
          name: q.shortname || q.longname,
          exchange: q.exchDisp
        }));
    };

    // If query lacks a dot, do a dual search to catch Thai stocks (.BK)
    let results: any[] = [];
    if (!q.includes('.')) {
      const [standardRes, thaiRes] = await Promise.all([
        fetchSearch(q),
        fetchSearch(`${q}.BK`)
      ]);
      
      const seen = new Set();
      const merged = [...thaiRes, ...standardRes].filter(r => {
        if (!r.symbol || seen.has(r.symbol)) return false;
        seen.add(r.symbol);
        return true;
      });
      results = merged.slice(0, 10);
    } else {
      results = await fetchSearch(q);
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
