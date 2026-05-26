import { NextResponse } from 'next/server';
import { getAllCacheMetrics } from '@/src/lib/cache';

// Only available in development and with proper auth in production
export async function GET(request: Request) {
  // In production, you'd check for auth header/API key here
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !request.headers.get('x-cache-auth')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const metrics = getAllCacheMetrics();
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    metrics,
    summary: {
      totalHits: Object.values(metrics).reduce((sum: number, cache: any) => sum + (cache.totalHits || 0), 0),
      totalMisses: Object.values(metrics).reduce((sum: number, cache: any) => sum + (cache.totalMisses || 0), 0),
    }
  });
}
