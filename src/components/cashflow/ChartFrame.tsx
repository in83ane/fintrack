"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Table2 } from 'lucide-react';

export type DataRow = { label: string; values: React.ReactNode[]; subtotal?: boolean };
export function DataTable({ headers, rows }: { headers: string[]; rows: DataRow[] }) {
  return <div className="max-h-[480px] overflow-auto"><table className="w-full text-xs tabular-nums">
    <thead className="sticky top-0 bg-background text-muted"><tr>{headers.map((h, i) => <th key={`${h}-${i}`} scope="col" className={`px-2 py-3 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={`${row.label}-${i}`} className={`border-t border-border ${row.subtotal ? 'bg-surface-2 font-semibold' : ''}`}><th scope="row" className="px-2 py-2.5 text-left font-inherit">{row.label}</th>{row.values.map((v, n) => <td key={n} className="whitespace-nowrap px-2 py-2.5 text-right">{v}</td>)}</tr>)}</tbody>
  </table></div>;
}
export function ChartFrame({ title, description, children, rows, headers, className = '', id, action, initialTable = false, hiddenAmounts = false, period }: {
  title: string; description: string; children: React.ReactNode; rows: DataRow[]; headers: string[];
  className?: string; id?: string; action?: React.ReactNode; initialTable?: boolean; hiddenAmounts?: boolean; period?: string;
}) {
  const [table, setTable] = useState(initialTable);
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => { setTable(initialTable); }, [initialTable]);
  useEffect(() => {
    if (!expanded) return;
    const before = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); before?.focus(); };
  }, [expanded]);
  return <section ref={root} tabIndex={-1} id={id} aria-label={title} className={`min-w-0 rounded-2xl border border-border bg-background p-4 sm:p-5 ${expanded ? 'fixed inset-3 z-[90] overflow-auto shadow-2xl sm:inset-8' : className}`}>
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-foreground">{title}</h2>{period && <p className="mt-1 text-[10px] text-muted">{period}</p>}</div>
      <div className="flex items-center gap-1.5">{action}<button aria-pressed={table} title="View as table / ดูตาราง" onClick={() => setTable(v => !v)} className="rounded-lg border border-border p-2 text-muted hover:text-foreground"><Table2 size={14}/><span className="sr-only">View as table</span></button><button aria-label={expanded ? 'Close full view' : 'Expand to full view'} onClick={() => setExpanded(v => !v)} className="rounded-lg border border-border p-2 text-muted hover:text-foreground">{expanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button></div>
    </header>
    <p className="sr-only">{description}</p>
    <div data-private={hiddenAmounts || undefined} className="cashflow-private">{table ? <DataTable headers={headers} rows={rows}/> : children}</div>
  </section>;
}
