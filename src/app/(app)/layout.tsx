"use client";

import React, { useState } from "react";
import { Sidebar } from "@/src/components/Sidebar";
import { TopBar } from "@/src/components/TopBar";
import { BottomNav } from "@/src/components/BottomNav";
import { CommandPalette } from "@/src/components/CommandPalette";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { OfflineIndicator } from "@/src/components/OfflineIndicator";
import { PriceAlertManager } from "@/src/components/PriceAlertManager";
import { AddCashflowModal } from "@/src/components/AddCashflowModal";
import { QuickAdd } from "@/src/components/QuickAdd";
import { PrivacyMarkers } from "@/src/components/PrivacyMarkers";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAddCashflowOpen, setIsAddCashflowOpen] = useState(false);

  return (
    <div className="flex min-h-screen min-w-0">
      <a className="ft-skip" href="#main-content">Skip to content</a>
      <Sidebar />

      <div className="ft-shell-content min-w-0 flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0 relative">
        <TopBar />
        <main id="main-content" tabIndex={-1} className="min-w-0">
          <PrivacyMarkers />
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      <QuickAdd />

      <BottomNav />
      <CommandPalette />
      <PriceAlertManager />
      <OfflineIndicator />
    </div>
  );
}
