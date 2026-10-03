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
import { Plus } from "lucide-react";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isAddCashflowOpen, setIsAddCashflowOpen] = useState(false);

  return (
    <div className="flex min-h-screen min-w-0">
      <Sidebar />
      
      <div className="min-w-0 flex-1 lg:ml-64 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0 relative">
        <TopBar />
        <main className="min-w-0">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      {/* Global FAB for Ledger Entry */}
      <button
        onClick={() => setIsAddCashflowOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-8 right-4 lg:right-8 z-[45] flex h-14 w-14 items-center justify-center rounded-full bg-[#E9C349] text-[#241a00] shadow-[0_4px_24px_rgba(233,195,73,0.3)] hover:scale-105 hover:shadow-[0_8px_32px_rgba(233,195,73,0.5)] transition-all duration-300"
        aria-label="Add Ledger Entry"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      <AddCashflowModal 
        isOpen={isAddCashflowOpen} 
        onClose={() => setIsAddCashflowOpen(false)} 
      />

      <BottomNav />
      <CommandPalette />
      <PriceAlertManager />
      <OfflineIndicator />
    </div>
  );
}
