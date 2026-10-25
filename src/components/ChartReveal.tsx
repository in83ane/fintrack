"use client";
import React, { useEffect, useRef } from 'react';
import { registerChart, reviseChart, unregisterChart } from '@/src/lib/chart-motion';

export function ChartReveal({ children, revision = '', className = '', label, endValue }: {
  children: React.ReactNode; revision?: string | number; className?: string; label: string; endValue?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const node = ref.current; if (!node) return; registerChart(node); return () => unregisterChart(node); }, []);
  useEffect(() => { if (ref.current) reviseChart(ref.current, String(revision)); }, [revision]);
  useEffect(() => { if (endValue === undefined) ref.current?.querySelectorAll('[data-chart-decoration] text').forEach(node => { node.textContent = ''; }); }, [endValue]);
  return <div ref={ref} role="group" aria-label={label} data-chart-revision={revision} data-chart-end-value={endValue} className={`chart-reveal min-w-0 ${className}`}>{children}</div>;
}
