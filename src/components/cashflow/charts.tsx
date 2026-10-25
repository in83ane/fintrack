"use client";

import React, { memo, useId, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartReveal } from '@/src/components/ChartReveal';
import { formatCashflowMoney, type FlowNode, getFlowGraph } from '@/src/lib/cashflow-selectors';

export const chartTheme = {
  income: 'var(--color-gain, #4EDEA3)', expense: 'var(--color-loss, #FF8F87)', net: 'var(--color-primary)', invested: '#568CD6',
  categories: ['#56B4E9', '#E69F00', '#009E73', '#CC79A7', '#D55E00', '#0072B2', '#B3A124', '#8A77BA'],
  axis: 'var(--color-muted)', grid: 'var(--color-border)', background: 'var(--color-background)', text: 'var(--color-foreground)',
};
type Common = { currency: string; revision: string; privateAmounts: boolean };
const tick = { fill: chartTheme.axis, fontSize: 10 };
const tipStyle = { background: chartTheme.background, border: `1px solid ${chartTheme.grid}`, borderRadius: 10, color: chartTheme.text, fontSize: 12 };
const axisAmount = (value: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value / 100);
const fmt = (value: number, props: Common, signed = false) => props.privateAmounts ? '••••••' : formatCashflowMoney(Math.round(value), props.currency, signed);

export const MonthlyChart = memo(function MonthlyChart(props: Common & { data: { label: string; incomeMinor: number; expenseMinor: number; investedMinor: number; proceedsMinor: number; netMinor: number }[]; includeInvestments: boolean }) {
  return <ChartReveal label="Monthly income, expenses and investment cash movements; signed net line" revision={props.revision} endValue={props.privateAmounts ? undefined : (props.data.at(-1)?.netMinor ?? 0) / 100} className="h-64">
    <ResponsiveContainer width="100%" height="100%"><ComposedChart data={props.data} accessibilityLayer margin={{ top: 10, left: 0, right: 12, bottom: 6 }}>
      <CartesianGrid stroke={chartTheme.grid} vertical={false}/><XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false}/><YAxis tick={tick} width={48} tickFormatter={props.privateAmounts ? () => '•••' : axisAmount} axisLine={false} tickLine={false}/>
      <Tooltip contentStyle={tipStyle} formatter={(v: any, name: any) => [fmt(Number(v), props, name === 'Net'), name]}/>
      <ReferenceLine y={0} stroke={chartTheme.grid}/>
      <Bar dataKey="incomeMinor" name="Income" fill={chartTheme.income} radius={[3,3,0,0]} isAnimationActive={false}/>
      <Bar dataKey="expenseMinor" name="Expenses" fill={chartTheme.expense} radius={[3,3,0,0]} isAnimationActive={false}/>
      {props.includeInvestments && <Bar dataKey="investedMinor" name="Invested" fill={chartTheme.invested} radius={[3,3,0,0]} isAnimationActive={false}/>}
      {props.includeInvestments && <Bar dataKey="proceedsMinor" name="Investment proceeds" fill="#8A77BA" radius={[3,3,0,0]} isAnimationActive={false}/>}
      <Line dataKey="netMinor" name="Net" type="monotone" stroke={chartTheme.net} dot={false} strokeWidth={2} isAnimationActive={false}/>
    </ComposedChart></ResponsiveContainer>
    <div className="-mt-1 ml-12 mr-3 flex gap-1" aria-label="Signed monthly net indicators">{props.data.map((d, i) => <span key={i} className="h-0.5 flex-1" title={`${d.label}: ${fmt(d.netMinor, props, true)}`} style={{ background: d.netMinor < 0 ? chartTheme.expense : chartTheme.income }}/>)}</div>
  </ChartReveal>;
});
export const SavingsChart = memo(function SavingsChart(props: Common & { data: { label: string; savingsRate: number | null }[] }) {
  const id = useId();
  return <ChartReveal label="Savings rate, with 20 percent target band" revision={props.revision} className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={props.data} accessibilityLayer margin={{ left: -20, right: 10 }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartTheme.net} stopOpacity={.3}/><stop offset="100%" stopColor={chartTheme.net} stopOpacity={0}/></linearGradient></defs>
    <CartesianGrid stroke={chartTheme.grid} vertical={false}/><XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false}/><YAxis tick={tick} unit="%" axisLine={false} tickLine={false}/>
    <ReferenceArea y1={18} y2={22} fill={chartTheme.income} fillOpacity={.1}/><ReferenceLine y={20} stroke={chartTheme.income} strokeDasharray="3 3"/>
    <Tooltip contentStyle={tipStyle} formatter={(v: any) => [props.privateAmounts ? '••••' : `${Number(v) < 0 ? '' : '+'}${Number(v).toFixed(1)}%`, 'Savings rate']}/>
    <Area dataKey="savingsRate" type="monotone" stroke={chartTheme.net} fill={`url(#${id})`} strokeWidth={2} dot={{ r: 3, fill: chartTheme.net }} isAnimationActive={false}/>
  </AreaChart></ResponsiveContainer></ChartReveal>;
});
export const BalanceChart = memo(function BalanceChart(props: Common & { data: { day: string; netMinor: number | null; projectedMinor: number | null; large: boolean }[] }) {
  const id = useId();
  return <ChartReveal label="Daily cumulative net. Dashed line is the pace projection; dots mark large transaction days." revision={props.revision} endValue={props.privateAmounts ? undefined : (props.data.filter(d => d.netMinor !== null).at(-1)?.netMinor ?? 0) / 100} className="h-64"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={props.data} accessibilityLayer margin={{ left: 0, right: 12 }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartTheme.net} stopOpacity={.25}/><stop offset="100%" stopColor={chartTheme.net} stopOpacity={0}/></linearGradient></defs>
    <CartesianGrid stroke={chartTheme.grid} vertical={false}/><XAxis dataKey="day" tick={tick} tickFormatter={d => String(Number(d.slice(-2)))} axisLine={false} tickLine={false}/><YAxis tick={tick} width={48} tickFormatter={props.privateAmounts ? () => '•••' : axisAmount} axisLine={false} tickLine={false}/>
    <Tooltip contentStyle={tipStyle} formatter={(v: any, name: any) => [fmt(Number(v), props, true), name]}/><ReferenceLine y={0} stroke={chartTheme.grid}/>
    <Area dataKey="netMinor" name="Cumulative net" type="monotone" stroke={chartTheme.net} fill={`url(#${id})`} strokeWidth={2} isAnimationActive={false} dot={(p: any) => p.payload.large && p.payload.netMinor !== null ? <circle key={p.key} cx={p.cx} cy={p.cy} r={3} fill={chartTheme.net}/> : <g key={p.key}/>}/>
    <Line dataKey="projectedMinor" name="Pace projection" type="monotone" stroke={chartTheme.net} strokeDasharray="5 5" dot={false} isAnimationActive={false}/>
  </ComposedChart></ResponsiveContainer></ChartReveal>;
});
export const CategoryChart = memo(function CategoryChart(props: Common & { data: { key: string; name: string; minor: number; share: number; deltaMinor: number }[]; onSelect: (key: string) => void }) {
  const max = Math.max(...props.data.map(d => d.minor), 1);
  return <ChartReveal label="Spending by category, share of total and signed change from the previous period" revision={props.revision} className="space-y-4">{props.data.map((d, i) => <button key={d.key} onClick={() => d.key !== '__other' && props.onSelect(d.key)} className="block w-full rounded text-left focus-visible:outline-2 focus-visible:outline-primary" title={`${d.name}: ${fmt(d.minor, props)}, ${d.share.toFixed(1)}%, change ${fmt(d.deltaMinor, props, true)}`}>
    <span className="mb-1 flex justify-between gap-3 text-xs"><span>{d.name}</span><span className="tabular-nums">{fmt(d.minor, props)} <span className="text-muted">· {d.share.toFixed(1)}%</span></span></span>
    <span className="block h-2 rounded-full bg-surface-2"><span data-chart-bar className="block h-2 origin-left rounded-full" style={{ width: `${d.minor / max * 100}%`, background: chartTheme.categories[i % 8] }}/></span><span className="mt-1 block text-[10px] text-muted">Δ {fmt(d.deltaMinor, props, true)}</span>
  </button>)}</ChartReveal>;
});

type Graph = ReturnType<typeof getFlowGraph>;
export const FlowChart = memo(function FlowChart(props: Common & { graph: Graph; onSelect: (node: FlowNode) => void }) {
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  const graph = props.graph;
  const layout = useMemo(() => {
    const height = Math.max(420, Math.max(...[0,1,2].map(layer => graph.nodes.filter(n => n.layer === layer).length)) * 60);
    const positions = new Map<string, FlowNode & { x: number; y: number; h: number; color: string }>();
    const total = Math.max(...[0,1,2].map(layer => graph.nodes.filter(n => n.layer === layer).reduce((s, n) => s + n.minor, 0)), 1);
    const maxNodes = Math.max(...[0,1,2].map(layer => graph.nodes.filter(n => n.layer === layer).length), 1);
    const scale = (height - maxNodes * 38 - 30) / total;
    for (const layer of [0,1,2]) {
      const nodes = graph.nodes.filter(n => n.layer === layer);
      const used = nodes.reduce((s, n) => s + Math.max(18, n.minor * scale) + 38, 0);
      let y = Math.max(16, (height - used) / 2);
      nodes.forEach((node, i) => {
        const h = Math.max(18, node.minor * scale);
        const color = node.kind === 'income' || node.kind === 'saved' ? chartTheme.income : node.kind === 'invested' || node.kind === 'proceeds' ? chartTheme.invested : node.kind === 'reconciliation' ? chartTheme.axis : chartTheme.categories[i % 8];
        positions.set(node.id, { ...node, x: [8, 440, 872][layer], y, h, color }); y += h + 38;
      });
    }
    const outgoing = new Map<string, number>(), incoming = new Map<string, number>();
    const links = graph.links.map(link => {
      const source = positions.get(link.source)!, target = positions.get(link.target)!;
      const width = Math.max(.8, link.minor * scale), sy = source.y + (outgoing.get(source.id) || 0) + width / 2, ty = target.y + (incoming.get(target.id) || 0) + width / 2;
      outgoing.set(source.id, (outgoing.get(source.id) || 0) + width); incoming.set(target.id, (incoming.get(target.id) || 0) + width);
      return { ...link, sourceNode: source, targetNode: target, width, path: `M${source.x + 12},${sy} C${source.x + 170},${sy} ${target.x - 170},${ty} ${target.x},${ty}` };
    });
    return { positions: [...positions.values()], links, height };
  }, [graph]);
  const related = new Set<string>(active ? [active] : []);
  if (active) {
    graph.links.filter(l => l.source === active || l.target === active).forEach(l => { related.add(l.source); related.add(l.target); });
    for (const node of graph.nodes.filter(n => n.layer === 1 && related.has(n.id))) graph.links.filter(l => l.source === node.id || l.target === node.id).forEach(l => { related.add(l.source); related.add(l.target); });
  }
  const label = (node: FlowNode) => `${node.name}: ${fmt(node.minor, props)} · ${(node.minor / Math.max(graph.inflowMinor, graph.expenseMinor + graph.investedMinor, 1) * 100).toFixed(1)}%`;
  return <ChartReveal label="Actual income sources to recorded wallets to spending categories. Dashed links reconcile opening balances or transfers without paired endpoints." revision={props.revision}>
    <div className="grid grid-cols-3 gap-2 sm:hidden">{[0,1,2].map(layer => <div key={layer} className="space-y-3">{layout.positions.filter(n => n.layer === layer).map(node => <button key={node.id} onClick={() => props.onSelect(node)} className="w-full rounded-lg border border-border bg-surface p-2 text-left text-xs" style={{ borderLeft: `3px solid ${node.color}` }}><span className="block break-words">{node.name}</span><span className="mt-1 block break-all tabular-nums text-muted">{fmt(node.minor, props)}</span></button>)}</div>)}</div>
    <svg className="hidden h-auto w-full sm:block" viewBox={`0 0 900 ${layout.height}`} role="img" aria-label="Cash flow by wallet">
      <defs>{layout.links.map((l, i) => <linearGradient key={i} id={`${id}-${i}`} x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor={l.sourceNode.color}/><stop offset="100%" stopColor={l.targetNode.color}/></linearGradient>)}</defs>
      <g data-chart-plot>{layout.links.map((link, i) => <path key={i} d={link.path} stroke={`url(#${id}-${i})`} strokeWidth={link.width} fill="none" strokeDasharray={link.derived ? '4 4' : undefined} opacity={active ? related.has(link.source) && related.has(link.target) ? .7 : .1 : .35} onMouseEnter={() => setActive(link.source)} onMouseLeave={() => setActive(null)}><title>{link.sourceNode.name} → {link.targetNode.name}: {fmt(link.minor, props)}</title></path>)}</g>
      {layout.positions.map(node => <g key={node.id} data-chart-node data-chart-column={node.layer} tabIndex={0} role="button" aria-label={label(node)} onFocus={() => setActive(node.id)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(node.id)} onMouseLeave={() => setActive(null)} onClick={() => { setActive(node.id); props.onSelect(node); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onSelect(node); } }} className="cursor-pointer focus:outline-none">
        <rect x={node.x} y={node.y} width={12} height={node.h} rx={3} fill={node.color}/>
        <text x={node.layer === 2 ? node.x - 8 : node.x + 20} y={node.y + 10} textAnchor={node.layer === 2 ? 'end' : 'start'} fill={chartTheme.text} stroke={chartTheme.background} strokeWidth={4} paintOrder="stroke" fontSize={12} fontWeight={500}>{node.name}</text>
        <text x={node.layer === 2 ? node.x - 8 : node.x + 20} y={node.y + 28} textAnchor={node.layer === 2 ? 'end' : 'start'} fill={chartTheme.axis} stroke={chartTheme.background} strokeWidth={4} paintOrder="stroke" fontSize={12}>{fmt(node.minor, props)} · {(node.minor / Math.max(graph.inflowMinor, graph.expenseMinor + graph.investedMinor, 1) * 100).toFixed(1)}%</text>
      </g>)}
    </svg>
  </ChartReveal>;
});
