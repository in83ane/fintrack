"use client";

import React from "react";
import { Sidebar } from "@/src/components/Sidebar";
import { TopBar } from "@/src/components/TopBar";
import { BottomNav } from "@/src/components/BottomNav";
import { CommandPalette } from "@/src/components/CommandPalette";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { OfflineIndicator } from "@/src/components/OfflineIndicator";
import { PriceAlertManager } from "@/src/components/PriceAlertManager";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen min-w-0">
      <Sidebar />
      
      <div className="min-w-0 flex-1 lg:ml-64 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">
        <TopBar />
        <main className="min-w-0">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      <BottomNav />
      <CommandPalette />
      <PriceAlertManager />
      <OfflineIndicator />
    </div>
  );
}
