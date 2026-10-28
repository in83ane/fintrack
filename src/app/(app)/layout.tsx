"use client";

import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Sidebar } from "@/src/components/Sidebar";
import { TopBar } from "@/src/components/TopBar";
import { BottomNav } from "@/src/components/BottomNav";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { RouteViewport } from '@/src/components/RouteContent';
import { OfflineIndicator } from "@/src/components/OfflineIndicator";
import { PriceAlertManager } from "@/src/components/PriceAlertManager";
import { AddCashflowModal } from "@/src/components/AddCashflowModal";
import { Plus } from "lucide-react";
import { installChartMotion, replayVisibleCharts } from '@/src/lib/chart-motion';
import { useApp } from '@/src/context/AppContext';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAddCashflowOpen, setIsAddCashflowOpen] = useState(false);
  const pathname = usePathname();
  const { currency } = useApp();

  useEffect(() => installChartMotion(), []);
  useEffect(() => replayVisibleCharts(), [currency]);

  return (
    <div className="flex min-h-screen min-w-0">
      <Sidebar />
      
      <div className="relative ml-[var(--sidebar-w)] min-w-0 flex-1 pb-0">
        <TopBar />
        <main data-page-content className="min-w-0">
          <ErrorBoundary>
            <RouteViewport>{children}</RouteViewport>
          </ErrorBoundary>
        </main>
      </div>

      {/* Global FAB for Ledger Entry */}
      {pathname !== "/ledger" && <button
        onClick={() => setIsAddCashflowOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-8 right-4 lg:right-8 z-[45] flex h-14 w-14 items-center justify-center rounded-full bg-[#E9C349] text-[#241a00] shadow-[0_4px_24px_rgba(233,195,73,0.3)] hover:scale-105 hover:shadow-[0_8px_32px_rgba(233,195,73,0.5)] transition-all duration-300"
        aria-label="Add Ledger Entry"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>}

      <AddCashflowModal 
        isOpen={isAddCashflowOpen} 
        onClose={() => setIsAddCashflowOpen(false)} 
      />

      <BottomNav />
      <PriceAlertManager />
      <OfflineIndicator />
    </div>
  );
}
