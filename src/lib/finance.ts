export interface TradeMetrics {
  grossProfit: number;
  grossLoss: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
}

export function calcCostBasis(avgPrice: number, quantity: number, totalFees: number = 0): number {
  return (avgPrice * quantity) + totalFees;
}

export function calcUnrealizedPnL(currentPrice: number, avgCost: number, quantity: number, fxRate: number = 1): number {
  return (currentPrice - avgCost) * quantity * fxRate;
}

export function calcUnrealizedPnLPercent(currentPrice: number, avgCost: number): number {
  if (avgCost === 0) return 0;
  return ((currentPrice - avgCost) / avgCost) * 100;
}

export function calcRealizedPnL(
  sellPrice: number, 
  sellQty: number, 
  sellFee: number, 
  avgBuyPrice: number, 
  buyFee: number = 0
): number {
  return (sellPrice * sellQty - sellFee) - (avgBuyPrice * sellQty + buyFee);
}

export function calcRealizedPnLShort(
  coverPrice: number, 
  coverQty: number, 
  coverFee: number, 
  shortEntryPrice: number, 
  shortFee: number = 0
): number {
  return (shortEntryPrice * coverQty - shortFee) - (coverPrice * coverQty + coverFee);
}

export function calcSimpleReturn(currentValue: number, costBasis: number): number {
  if (costBasis === 0) return 0;
  return ((currentValue - costBasis) / costBasis) * 100;
}

export function calcTotalReturn(currentValue: number, totalDividends: number, costBasis: number): number {
  if (costBasis === 0) return 0;
  return ((currentValue + totalDividends - costBasis) / costBasis) * 100;
}

export function calcProfitFactor(grossProfit: number, grossLoss: number): number {
  if (grossLoss === 0) return grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
  return Math.abs(grossProfit / grossLoss);
}

export function calcWinRate(winningTrades: number, totalTrades: number): number {
  if (totalTrades === 0) return 0;
  return winningTrades / totalTrades;
}

export function calcExpectancy(winRate: number, avgWin: number, avgLoss: number): number {
  const lossRate = 1 - winRate;
  return (winRate * avgWin) - (lossRate * Math.abs(avgLoss));
}

export function calcStreak(tradePnLs: number[]): { currentStreak: number, maxWinStreak: number, maxLossStreak: number } {
  let currentStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;

  for (const pnl of tradePnLs) {
    if (pnl > 0) {
      currentWinStreak++;
      currentLossStreak = 0;
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
    } else if (pnl < 0) {
      currentLossStreak++;
      currentWinStreak = 0;
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    } else {
      currentWinStreak = 0;
      currentLossStreak = 0;
      currentStreak = 0;
    }
  }

  return { currentStreak, maxWinStreak, maxLossStreak };
}

export function calcRiskRewardRatio(entryPrice: number, takeProfit: number, stopLoss: number, isShort: boolean = false): number {
  if (entryPrice === stopLoss) return 0;
  
  if (isShort) {
    const risk = stopLoss - entryPrice;
    const reward = entryPrice - takeProfit;
    return risk === 0 ? 0 : reward / risk;
  } else {
    const risk = entryPrice - stopLoss;
    const reward = takeProfit - entryPrice;
    return risk === 0 ? 0 : reward / risk;
  }
}

export function calcPositionSize(accountSize: number, riskPercent: number, entryPrice: number, stopLoss: number): number {
  if (entryPrice === stopLoss) return 0;
  const positionSizeUsd = accountSize * (riskPercent / 100);
  return Math.abs(positionSizeUsd / (entryPrice - stopLoss));
}

export function calcMaxDrawdown(portfolioValues: number[]): number {
  if (portfolioValues.length === 0) return 0;
  
  let peak = portfolioValues[0];
  let maxDrawdown = 0;
  
  for (const value of portfolioValues) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = peak > 0 ? (peak - value) / peak * 100 : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  return maxDrawdown;
}

export function calcSharpeRatioApprox(dailyReturns: number[], riskFreeRateDaily: number = 0): number {
  if (dailyReturns.length < 2) return 0;
  
  const excessReturns = dailyReturns.map(r => r - riskFreeRateDaily);
  const avgExcessReturn = excessReturns.reduce((sum, r) => sum + r, 0) / excessReturns.length;
  
  const variance = excessReturns.reduce((sum, r) => sum + Math.pow(r - avgExcessReturn, 2), 0) / (excessReturns.length - 1);
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  return (avgExcessReturn / stdDev) * Math.sqrt(252);
}
