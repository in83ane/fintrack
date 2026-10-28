"use client";
import PlanSkeleton from '@/src/app/(app)/plan/PlanSkeleton';
import DashboardSkeleton from '@/src/app/(app)/dashboard/DashboardSkeleton';
import PortfolioSkeleton from '@/src/app/(app)/portfolio/PortfolioSkeleton';
import AssetSkeleton from '@/src/app/(app)/portfolio/[symbol]/AssetSkeleton';
import LedgerSkeleton from '@/src/app/(app)/ledger/LedgerSkeleton';
import CashFlowSkeleton from '@/src/app/(app)/cashflow/CashFlowSkeleton';
import TerminalSkeleton from '@/src/app/(app)/terminal/TerminalSkeleton';
import TradeSkeleton from '@/src/app/(app)/trade/[[...symbol]]/TradeSkeleton';
import TradePlanSkeleton from '@/src/app/(app)/trade/plan/TradePlanSkeleton';
import BucketSkeleton from '@/src/app/(app)/budget/BucketSkeleton';
import HistorySkeleton from '@/src/app/(app)/history/HistorySkeleton';
import CalendarSkeleton from '@/src/app/(app)/calendar/CalendarSkeleton';
import TransactionsSkeleton from '@/src/app/(app)/transactions/TransactionsSkeleton';
import SettingsSkeleton from '@/src/app/(app)/settings/SettingsSkeleton';
import TraderHubSkeleton from '@/src/app/(app)/trader-hub/TraderHubSkeleton';

export const routeSkeletons = {
  plan: PlanSkeleton, dashboard: DashboardSkeleton, portfolio: PortfolioSkeleton, ledger: LedgerSkeleton,
  cashflow: CashFlowSkeleton, terminal: TerminalSkeleton, trade: TradeSkeleton,
  budget: BucketSkeleton, history: HistorySkeleton, calendar: CalendarSkeleton,
  transactions: TransactionsSkeleton, settings: SettingsSkeleton, 'trader-hub': TraderHubSkeleton,
};
export function RouteSkeleton({path}:{path:string}) {
  if(path.startsWith('/portfolio/')) return <AssetSkeleton/>;
  if(path==='/trade/plan') return <TradePlanSkeleton/>;
  const Skeleton=routeSkeletons[path.split('/')[1] as keyof typeof routeSkeletons];
  // Unknown URLs use Next's not-found boundary, never an unrelated dashboard shell.
  return Skeleton ? <Skeleton/> : <p className="app-page-container py-8" role="status">Loading…</p>;
}
