"use client";

import React from "react";
import { Sidebar } from "@/src/components/Sidebar";
import { TopBar } from "@/src/components/TopBar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      
      <div className="flex-1 lg:ml-64">
        <TopBar />
        <main>
          {children}
        </main>
      </div>
    </div>
  );
}
