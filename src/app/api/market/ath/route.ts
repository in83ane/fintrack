import { NextRequest, NextResponse } from 'next/server';
import { fetchOHLCV } from '@/src/app/(app)/terminal/actions';

const cache = new Map<string, { price: number; expires: number }>();
export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get('symbol') || '').trim().toUpperCase();
  if (!/^[A-Z0-9.^=\-]{1,24}$/.test(symbol)) return NextResponse.json({ ath: null }, { status: 400 });
  const cached = cache.get(symbol);
  if (cached && cached.expires > Date.now()) return NextResponse.json({ ath: cached.price });
  try {
    const candles = await fetchOHLCV(symbol, 'max', '1mo');
    const price = Math.max(0, ...candles.map(candle => candle.high).filter(Number.isFinite));
    if (!price) return NextResponse.json({ ath: null });
    cache.set(symbol, { price, expires: Date.now() + 3_600_000 });
    return NextResponse.json({ ath: price, source: 'Maximum monthly high in provider full history' });
  } catch {
    return NextResponse.json({ ath: null }, { status: 503 });
  }
}
