import { NextResponse } from 'next/server';
import { supabase } from '@/src/lib/supabase';

interface AnalyticsData {
  period: 'month' | 'quarter' | 'year' | 'all_time';
  trades: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    winLossRatio: number;
  };
  performance: {
    totalReturn: number;
    totalReturnPercent: number;
    cagr: number;
    sharpeRatio: number;
    maxDrawdown: number;
    profitFactor: number;
  };
  monthly: Array<{
    month: string;
    trades: number;
    pnl: number;
    returnPercent: number;
    winRate: number;
  }>;
  tax: {
    shortTermGains: number;
    longTermGains: number;
    losses: number;
    netCapitalGains: number;
  };
  assets: Array<{
    symbol: string;
    trades: number;
    pnl: number;
    returnPercent: number;
    winRate: number;
  }>;
}

export async function GET(request: Request) {
  try {
    // Get user from auth
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') || 'all_time') as 'month' | 'quarter' | 'year' | 'all_time';

    // Extract user ID from Supabase session (simplified for example)
    // In production, properly decode the JWT
    const userIdHeader = request.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Get date filter based on period
    const now = new Date();
    let startDate = new Date(0); // All time

    if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
    } else if (period === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1);
    }

    // Fetch all trades for user
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userIdHeader)
      .gte('execution_date', startDate.toISOString());

    if (error) throw error;

    // Filter for SELL trades (these indicate closed positions)
    const closedTrades = trades.filter(
      (t: any) => t.type === 'SELL' || (t.profit_loss !== null && t.profit_loss !== 0)
    );

    // Calculate win/loss metrics
    const wins = closedTrades.filter((t: any) => t.profit_loss > 0);
    const losses = closedTrades.filter((t: any) => t.profit_loss < 0);
    const totalTrades = closedTrades.length;
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;

    const totalPnL = closedTrades.reduce((sum: number, t: any) => sum + (t.profit_loss || 0), 0);
    const totalInvested = trades
      .filter((t: any) => t.type === 'BUY')
      .reduce((sum: number, t: any) => sum + (t.total_cost || t.amount_usd || 0), 0);

    const avgWin = wins.length > 0 ? wins.reduce((sum: number, t: any) => sum + (t.profit_loss || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum: number, t: any) => sum + (t.profit_loss || 0), 0) / losses.length) : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Calculate CAGR (Compound Annual Growth Rate)
    const daysSinceStart = Math.max(1, (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const yearsActive = Math.max(1, daysSinceStart / 365.25);
    const cagr = totalInvested > 0
      ? (Math.pow(1 + totalPnL / totalInvested, 1 / yearsActive) - 1) * 100
      : 0;

    // Group by month for monthly breakdown
    const monthlyData: Record<string, any> = {};
    closedTrades.forEach((trade: any) => {
      const date = new Date(trade.execution_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          trades: 0,
          pnl: 0,
          wins: 0,
          losses: 0,
        };
      }

      monthlyData[monthKey].trades++;
      monthlyData[monthKey].pnl += trade.profit_loss || 0;
      if ((trade.profit_loss || 0) > 0) monthlyData[monthKey].wins++;
      else monthlyData[monthKey].losses++;
    });

    const monthly = Object.entries(monthlyData).map(([month, data]: [string, any]) => ({
      month,
      trades: data.trades,
      pnl: parseFloat(data.pnl.toFixed(2)),
      returnPercent: totalInvested > 0 ? parseFloat(((data.pnl / totalInvested) * 100).toFixed(2)) : 0,
      winRate: data.trades > 0 ? parseFloat(((data.wins / data.trades) * 100).toFixed(2)) : 0,
    }));

    // Tax calculations
    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

    const shortTermGains = closedTrades
      .filter((t: any) => new Date(t.execution_date) > oneYearAgo && (t.profit_loss || 0) > 0)
      .reduce((sum: number, t: any) => sum + (t.profit_loss || 0), 0);

    const longTermGains = closedTrades
      .filter((t: any) => new Date(t.execution_date) <= oneYearAgo && (t.profit_loss || 0) > 0)
      .reduce((sum: number, t: any) => sum + (t.profit_loss || 0), 0);

    const totalLosses = closedTrades
      .filter((t: any) => (t.profit_loss || 0) < 0)
      .reduce((sum: number, t: any) => sum + Math.abs(t.profit_loss || 0), 0);

    // Group by asset
    const assetData: Record<string, any> = {};
    closedTrades.forEach((trade: any) => {
      const symbol = trade.symbol;
      if (!assetData[symbol]) {
        assetData[symbol] = { trades: 0, pnl: 0, wins: 0, losses: 0 };
      }
      assetData[symbol].trades++;
      assetData[symbol].pnl += trade.profit_loss || 0;
      if ((trade.profit_loss || 0) > 0) assetData[symbol].wins++;
      else assetData[symbol].losses++;
    });

    const assets = Object.entries(assetData)
      .map(([symbol, data]: [string, any]) => ({
        symbol,
        trades: data.trades,
        pnl: parseFloat(data.pnl.toFixed(2)),
        returnPercent: totalInvested > 0 ? parseFloat(((data.pnl / totalInvested) * 100).toFixed(2)) : 0,
        winRate: data.trades > 0 ? parseFloat(((data.wins / data.trades) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 10); // Top 10 assets

    const response: AnalyticsData = {
      period,
      trades: {
        total: totalTrades,
        wins: wins.length,
        losses: losses.length,
        winRate: parseFloat(winRate.toFixed(2)),
        avgWin: parseFloat(avgWin.toFixed(2)),
        avgLoss: parseFloat(avgLoss.toFixed(2)),
        winLossRatio: parseFloat(winLossRatio.toFixed(2)),
      },
      performance: {
        totalReturn: parseFloat(totalPnL.toFixed(2)),
        totalReturnPercent: totalInvested > 0 ? parseFloat(((totalPnL / totalInvested) * 100).toFixed(2)) : 0,
        cagr: parseFloat(cagr.toFixed(2)),
        sharpeRatio: 0, // Would require daily returns data
        maxDrawdown: 0, // Would require cumulative equity tracking
        profitFactor: avgLoss > 0 ? parseFloat((Math.abs(avgWin) / avgLoss).toFixed(2)) : 0,
      },
      monthly,
      tax: {
        shortTermGains: parseFloat(shortTermGains.toFixed(2)),
        longTermGains: parseFloat(longTermGains.toFixed(2)),
        losses: parseFloat(totalLosses.toFixed(2)),
        netCapitalGains: parseFloat((shortTermGains + longTermGains - totalLosses).toFixed(2)),
      },
      assets,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate analytics', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
