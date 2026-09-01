"use client";

import React from "react";
import { cn } from "@/src/lib/utils";
import { motion } from "motion/react";

// Shimmer pulse skeleton block
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-white/[0.04]",
        className
      )}
      {...props}
    />
  );
}

// Pre-built skeleton patterns
export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-3xl p-6 border border-border space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}

export function SkeletonSignalCard() {
  return (
    <div className="bg-surface rounded-2xl p-4 border border-border space-y-3">
      <div className="flex justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="w-6 h-6 rounded" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-6 w-24" />
      <div className="flex gap-1">
        <Skeleton className="h-4 w-12 rounded" />
        <Skeleton className="h-4 w-12 rounded" />
      </div>
      <Skeleton className="h-1 w-full rounded-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 px-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-3 py-2">
          {[1, 2, 3, 4].map(j => (
            <Skeleton key={j} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonAssetCard() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-surface rounded-2xl p-5 border border-border space-y-3"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="flex justify-between">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
    </motion.div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      {/* Welcome */}
      <Skeleton className="h-24 w-full rounded-3xl" />
      {/* Quick actions */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      {/* Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
