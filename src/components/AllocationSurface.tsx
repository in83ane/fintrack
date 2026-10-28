"use client";
import React, { useRef } from 'react';
import { useAllocationMotion } from '@/src/hooks/useAllocationMotion';

export function AllocationSurface({ identity, ready = true, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { identity: string; ready?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useAllocationMotion(root, ready, identity);
  return <div {...props} ref={root} data-chart-owned>{children}</div>;
}
