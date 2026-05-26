"use client";

import React from "react";
import { Sidebar } from "@/src/components/Sidebar";
import { TopBar } from "@/src/components/TopBar";
import { BottomNav } from "@/src/components/BottomNav";
import { CommandPalette } from "@/src/components/CommandPalette";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { PriceAlertManager } from "@/src/components/PriceAlertManager";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      
      <div className="flex-1 lg:ml-64 pb-16 sm:pb-0">
        <TopBar />
        <main>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      <BottomNav />
      <CommandPalette />
      <PriceAlertManager />
    </div>
  );
}
