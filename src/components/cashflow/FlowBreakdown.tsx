'use client';
// วางที่ src/components/cashflow/FlowBreakdown.tsx
// แทน FlowChart (Sankey) ด้วยรายการแท่งเรียงลำดับ: เงินมาจากไหน / เงินไปไหน
import React from 'react';
import type { FlowNode } from '@/src/lib/cashflow-selectors';

const GAIN = 'var(--color-gain, #4EDEA3)';
const LOSS = 'var(--color-loss, #FF8F87)';
const INVEST = '#568CD6';

type Row = { key: string; name: string; minor: number; color: string; node?: FlowNode };
type Totals = { inflowMinor: number; outflowMinor: number; investedMinor: number; netMinor: number };
type Format = (minor: number) => React.ReactNode;
type Text = (en: string, thai: string) => string;

type Props = {
  nodes: FlowNode[];
  totals: Totals;
  format: Format;
  text: Text;
  onSelect?: (node: FlowNode) => void;
  /** Category filtering removes the other side of the cash flow. */
  focused?: boolean;
  /** grid classes, shared with the loading shell via skeleton-layout.ts */
  className?: string;
};

// biggest first, "Other" always last
const isOther = (row: Row) => (row.node?.category === '__other' ? 1 : 0);
const byAmount = (a: Row, b: Row) => isOther(a) - isOther(b) || b.minor - a.minor;

const toRows = (nodes: FlowNode[], color: string): Row[] =>
  nodes
    .map((node, i) => ({ key: `${node.kind}-${node.category ?? node.walletId ?? node.name}-${i}`, name: node.name, minor: node.minor, color, node }))
    .sort(byAmount);

function BarRow({ row, scale, base, format, onSelect }: { row: Row; scale: number; base: number; format: Format; onSelect?: (node: FlowNode) => void }) {
  const pct = base > 0 ? `${((row.minor / base) * 100).toFixed(1)}%` : '';
  const cls = 'block w-full rounded-lg px-2 py-1.5 text-left';
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate" title={row.name}>{row.name}</span>
        <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
          <span data-money>{format(row.minor)}</span>
          <span className="w-12 text-right text-muted">{pct}</span>
        </span>
      </span>
      <span aria-hidden="true" className="mt-1.5 block h-2 rounded-full bg-surface-2">
        <span className="block h-2 rounded-full" style={{ width: `${Math.min(100, (row.minor / scale) * 100)}%`, minWidth: row.minor > 0 ? 4 : 0, background: row.color }} />
      </span>
    </>
  );
  const node = row.node;
  if (node && onSelect) {
    return <button type="button" className={`${cls} hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary`} onClick={() => onSelect(node)}>{body}</button>;
  }
  return <div className={cls}>{body}</div>;
}

function Column({ title, rows, scale, base, format, text, onSelect }: { title: string; rows: Row[]; scale: number; base: number; format: Format; text: Text; onSelect?: (node: FlowNode) => void }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-xs font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">{text('Nothing recorded in this period.', 'ไม่มีรายการในช่วงนี้')}</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {rows.map(row => <li key={row.key}><BarRow row={row} scale={scale} base={base} format={format} onSelect={onSelect} /></li>)}
        </ul>
      )}
    </section>
  );
}

export function FlowBreakdown({ nodes, totals, format, text, onSelect, className, focused = false }: Props) {
  const { inflowMinor, outflowMinor, investedMinor, netMinor } = totals;
  // Both columns share a scale. The displayed percentage states its own denominator.
  const scale = Math.max(inflowMinor, outflowMinor, 1);

  const income = toRows(nodes.filter(n => n.layer === 0 && n.kind !== 'reconciliation'), GAIN);
  const out = toRows(nodes.filter(n => n.kind === 'expense'), LOSS);
  if (investedMinor > 0) out.push({ key: 'invested', name: text('Invested', 'ลงทุน'), minor: investedMinor, color: INVEST });
  if (!focused && netMinor > 0) out.push({ key: 'saved', name: text('Saved', 'ออม'), minor: netMinor, color: GAIN });

  const clickable = !!onSelect && [...income, ...out].some(r => r.node);

  return (
    <div>
      <div className={className}>
        <Column title={text('Where it came from', 'เงินมาจากไหน')} rows={income} scale={scale} base={inflowMinor} format={format} text={text} onSelect={onSelect} />
        <Column title={text('Where it went', 'เงินไปไหน')} rows={out} scale={scale} base={focused ? outflowMinor : inflowMinor} format={format} text={text} onSelect={onSelect} />
      </div>
      {clickable && <p className="mt-4 text-[10px] text-muted">{focused
        ? text('Tap a row to filter the page. Percentages are shares of the selected inflows or outflows in each column.', 'แตะรายการเพื่อกรองทั้งหน้า เปอร์เซ็นต์คือสัดส่วนของเงินเข้าหรือเงินออกที่เลือกในแต่ละฝั่ง')
        : text('Tap a row to filter the page. Percentages are share of inflow.', 'แตะรายการเพื่อกรองทั้งหน้า เปอร์เซ็นต์คือสัดส่วนของเงินเข้า')}</p>}
    </div>
  );
}
