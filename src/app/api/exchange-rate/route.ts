import { NextResponse } from 'next/server';
import { GET as getValuationQuote } from './valuation/route';

export const dynamic = 'force-dynamic';

/** Legacy endpoint compatibility: USD/THB must use the same provider/cache. */
export async function GET() {
  const response = await getValuationQuote();
  const quote = await response.json();
  if (!response.ok) return NextResponse.json({ success: false, error: 'FX unavailable' }, { status: 503 });
  return NextResponse.json({
    success: true,
    rates: { USD: 1, THB: Number(quote.rate) },
    provider: quote.source,
    fetchedAt: quote.fetchedAt,
    providerDate: quote.providerDate,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
