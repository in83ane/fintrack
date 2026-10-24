"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import { motion } from 'motion/react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Eye, EyeOff, FileText, Plus, Sparkles, Upload, Wallet } from 'lucide-react';
import { useApp, CashActivity } from '@/src/context/AppContext';
import { AddCashflowModal } from '@/src/components/AddCashflowModal';
import { AIFinancialAdvisor } from '@/src/components/AIFinancialAdvisor';
import { ChartReveal } from '@/src/components/ChartReveal';
import { DateRangeState, getDateBounds } from '@/src/components/DateRangeBar';
import { displayCashflowCategory, getCashflowSummary, selectCashflowRecords } from '@/src/lib/cashflow-selectors';
import { decimal } from '@/src/lib/fx';

type View = 'overview' | 'flow' | 'trends' | 'budget';
type Activity = CashActivity & { source: 'cash' };
const emerald = '#4EDEA3';
const rose = '#FF8F87';
const palette = ['#ADC6FF', '#E9C349', '#C4A7FF', '#6AD5D5', '#FFAD70', '#82B7FF', '#F08ABA', '#B7D987'];
const money = (n: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace('THB', '฿').replace('฿ ', '฿');
const keyDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function changePct(now: number, before: number) {
  if (!before) return now ? '—' : '0%';
  const pct = ((now - before) / Math.abs(before)) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function MiniLine({ data, color = emerald, revision }: { data: number[]; color?: string; revision: string }) {
  const finite = data.filter(Number.isFinite);
  const points = finite.length ? finite.length > 1 ? finite : [0, ...finite] : [0, 0];
  const min = Math.min(...points, 0), max = Math.max(...points, 1), span = max - min || 1;
  const path = points.map((v, i) => `${i ? 'L' : 'M'} ${(i / Math.max(points.length - 1, 1)) * 100} ${26 - ((v - min) / span) * 22}`).join(' ');
  return <ChartReveal label="Sparkline" revision={revision} className="h-8 w-full"><svg viewBox="0 0 100 30" className="h-full w-full" aria-hidden="true"><path d={path} fill="none" stroke={color} strokeOpacity={finite.length ? 1 : .35} strokeDasharray={finite.length ? undefined : '2 3'} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></ChartReveal>;
}

function Panel({ title, action, children, className = '', id }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`min-w-0 rounded-2xl border border-border bg-surface/50 p-4 sm:p-5 ${className}`}><header className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-white sm:text-base">{title}</h2>{action}</header>{children}</section>;
}

function CashflowSankeyNode(props: any) {
  const { x, y, width, height, payload, name, value, containerWidth, formatAmount } = props;
  const nodeName = String(payload?.name ?? name ?? '');
  const rightColumn = Number(x) > Number(containerWidth || 620) / 2;
  const labelX = rightColumn ? Number(x) - 8 : Number(x) + Number(width) + 8;
  const anchor = rightColumn ? 'end' : 'start';
  const tone = /saved|ออม/i.test(nodeName) ? emerald : /overspent|balance used|คงเหลือเดิม/i.test(nodeName) ? rose : '#d8dee9';
  return <g><rect x={x} y={y} width={width} height={height} rx={3} fill={tone} opacity={.9}/><text x={labelX} y={Number(y) + Number(height) / 2 - 3} textAnchor={anchor} fill="#d8dee9" fontSize={10}>{nodeName}</text><text x={labelX} y={Number(y) + Number(height) / 2 + 11} textAnchor={anchor} fill="#9299a5" fontSize={9}>{/saved|ออม/i.test(nodeName) ? '' : formatAmount(Number(value ?? payload?.value ?? 0))}</text></g>;
}

export default function CashflowPage() {
  const { t, cashActivities, moneyBuckets, netWorthHistory, currency, exchangeRates, netWorthSettings, language, addToast, activePortfolio, activePortfolioId, isDataLoaded } = useApp();
  const [dateRange, setDateRange] = useState<DateRangeState>(() => ({ mode: 'month', year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [walletId, setWalletId] = useState('all');
  const [view, setView] = useState<View>('overview');
  const [showAdd, setShowAdd] = useState(false);
  const [showAdvisor, setShowAdvisor] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showFlowTable, setShowFlowTable] = useState(false);
  const [showTrendTable, setShowTrendTable] = useState(false);
  const [showDailyTable, setShowDailyTable] = useState(false);
  const [showAmounts, setShowAmounts] = useState(true);
  const [currencyView, setCurrencyView] = useState<'THB' | 'USD'>(currency === 'USD' ? 'USD' : 'THB');
  useEffect(() => setCurrencyView(currency === 'USD' ? 'USD' : 'THB'), [currency]);
  const [refreshError, setRefreshError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const th = language === 'th';
  const locale = th ? 'th-TH' : 'en-US';
  const [now] = useState(() => new Date());
  const monthCursor = useMemo(() => dateRange.mode === 'month' ? new Date(dateRange.year, dateRange.month, 1) : new Date(now.getFullYear(), now.getMonth(), 1), [dateRange, now]);
  const bounds = useMemo(() => {
    const rawBounds = getDateBounds(dateRange);
    return rawBounds ? { from: keyDate(rawBounds.from), to: keyDate(rawBounds.to) } : undefined;
  }, [dateRange]);
  const summary = useMemo(() => getCashflowSummary(cashActivities, { ...bounds, walletId }), [cashActivities, bounds, walletId]);
  const rows = useMemo(() => selectCashflowRecords(cashActivities, { ...bounds, walletId }).map(row => ({ ...row, source: 'cash' as const })).sort((a, b) => b.date.localeCompare(a.date)), [cashActivities, bounds, walletId]);
  const previousBounds = useMemo(() => {
    if (!bounds) return { from: '0000-01-01', to: '0000-01-01', walletId };
    if (dateRange.mode === 'month') {
      const previousMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
      return { from: keyDate(previousMonth), to: keyDate(new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0)), walletId };
    }
    const from = new Date(`${bounds.from}T12:00:00`), to = new Date(`${bounds.from}T12:00:00`);
    const duration = Math.max(1, Math.round((new Date(`${bounds.to}T12:00:00`).getTime() - from.getTime()) / 86400000) + 1);
    to.setDate(to.getDate() - 1);
    from.setDate(from.getDate() - duration);
    return { from: keyDate(from), to: keyDate(to), walletId };
  }, [bounds, dateRange.mode, monthCursor, walletId]);
  const previous = useMemo(() => bounds ? getCashflowSummary(cashActivities, previousBounds) : { records: [], income: 0, expenses: 0, net: 0 }, [cashActivities, bounds, previousBounds]);
  const net = summary.net;
  const savingsRate = summary.income ? (net / summary.income) * 100 : 0;
  const daysElapsed = dateRange.mode === 'month' && dateRange.year === now.getFullYear() && dateRange.month === now.getMonth() ? now.getDate() : dateRange.mode === 'month' ? new Date(dateRange.year, dateRange.month + 1, 0).getDate() : Math.max(1, rows.length ? new Set(rows.map(r => keyDate(new Date(r.date)))).size : 1);
  const daysInPeriod = dateRange.mode === 'month' ? new Date(dateRange.year, dateRange.month + 1, 0).getDate() : daysElapsed;
  const dailyIncome = summary.income / Math.max(daysElapsed, 1), dailyExpense = summary.expenses / Math.max(daysElapsed, 1);
  const projectedNet = dateRange.mode === 'month' && dateRange.year === now.getFullYear() && dateRange.month === now.getMonth() ? dailyIncome * daysInPeriod - dailyExpense * daysInPeriod : net;
  const hasDisplayRate = currencyView === 'USD' || (Number.isFinite(exchangeRates.THB) && exchangeRates.THB > 0);
  const convert = useCallback((usd: number) => currencyView === 'USD' || !hasDisplayRate ? usd : Number(decimal(usd).mul(decimal(exchangeRates.THB)).toFixed(2)), [currencyView, hasDisplayRate, exchangeRates]);
  const fmt = useCallback((usd: number) => !showAmounts ? '••••••' : money(convert(usd), hasDisplayRate ? currencyView : 'USD'), [showAmounts, convert, hasDisplayRate, currencyView]);
  const formatDisplay = (value: number) => !showAmounts ? '••••••' : money(value, hasDisplayRate ? currencyView : 'USD');
  const displayNet = Number((convert(summary.income) - convert(summary.expenses)).toFixed(2));
  const displayProjectedNet = Number((convert(dailyIncome * daysInPeriod) - convert(dailyExpense * daysInPeriod)).toFixed(2));
  const displaySigned = (value: number) => !isDataLoaded || !hasPeriodData ? metric(Math.abs(value)) : `${value < 0 ? '−' : '+'}${formatDisplay(Math.abs(value))}`;
  const hasPeriodData = summary.records.some(row => !row.isTransfer && ['INCOME', 'DEPOSIT', 'EXPENSE', 'WITHDRAW'].includes(row.type));
  const metric = (value: number) => !isDataLoaded ? '…' : !hasPeriodData ? '—' : fmt(value);
  const signedMetric = (value: number) => !isDataLoaded || !hasPeriodData ? metric(Math.abs(value)) : `${value < 0 ? '−' : '+'}${fmt(Math.abs(value))}`;
  const rangeRevision = `${JSON.stringify(dateRange)}:${walletId}:${currencyView}`;

  const selected = summary.records;
  const incomeRows = selected.filter(r => (r.type === 'INCOME' || r.type === 'DEPOSIT') && !r.isTransfer);
  const expenseRows = selected.filter(r => (r.type === 'EXPENSE' || r.type === 'WITHDRAW') && !r.isTransfer);
  const expenseByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    expenseRows.forEach(row => {
      const name = displayCashflowCategory(row.category, th ? 'th' : 'en');
      totals.set(name, (totals.get(name) || 0) + Math.round((row.amountUSD ?? row.amount ?? 0) * 100));
    });
    const sorted = Array.from(totals, ([name, cents]) => ({ name, value: cents / 100 })).sort((a, b) => b.value - a.value);
    return sorted.length > 7 ? [...sorted.slice(0, 7), { name: th ? 'อื่นๆ' : 'Other', value: sorted.slice(7).reduce((s, x) => s + Math.round(x.value * 100), 0) / 100 }] : sorted;
  }, [expenseRows, th]);
  const categoryChange = (name: string, current: number) => {
    const base = name === (th ? 'อื่นๆ' : 'Other') ? 0 : cashActivities.filter(row => {
      const date = new Date(row.date);
      return String(date.getFullYear()) === previousBounds.from.slice(0, 4) && date.getMonth() + 1 === Number(previousBounds.from.slice(5, 7)) && displayCashflowCategory(row.category, th ? 'th' : 'en') === name && !row.isTransfer && (row.type === 'EXPENSE' || row.type === 'WITHDRAW');
    }).reduce((s, r) => s + (r.amountUSD ?? r.amount ?? 0), 0);
    return changePct(current, base);
  };

  const monthly = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = keyDate(month).slice(0, 7);
    const period = cashActivities.filter(row => {
      const d = new Date(row.date);
      return keyDate(d).slice(0, 7) === key && !row.isTransfer;
    });
    const income = period.filter(row => row.type === 'INCOME' || row.type === 'DEPOSIT').reduce((sum, row) => sum + (row.amountUSD ?? row.amount ?? 0), 0);
    const expenses = period.filter(row => row.type === 'EXPENSE' || row.type === 'WITHDRAW').reduce((sum, row) => sum + (row.amountUSD ?? row.amount ?? 0), 0);
      return { month: month.toLocaleDateString(locale, { month: 'short' }), income: convert(income), expenses: convert(expenses), net: convert(income - expenses), savingsRate: income ? ((income - expenses) / income) * 100 : 0, axis: key };
  }), [cashActivities, locale, convert, now]);
  const daily = useMemo(() => {
    const first = dateRange.mode === 'month' ? new Date(dateRange.year, dateRange.month, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => {
      const day = new Date(first.getFullYear(), first.getMonth(), i + 1);
      const key = keyDate(day);
      const tx = selected.filter(row => keyDate(new Date(row.date)) === key && !row.isTransfer && (row.type === 'EXPENSE' || row.type === 'WITHDRAW'));
      return { day: i + 1, spend: convert(tx.reduce((s, r) => s + (r.amountUSD ?? r.amount ?? 0), 0)), count: tx.length, date: key };
    });
  }, [dateRange, selected, convert, now]);
  const daySeries = useMemo(() => {
    let cumulative = 0;
    return daily.map(item => {
      const tx = selected.filter(row => keyDate(new Date(row.date)) === item.date && !row.isTransfer);
      cumulative += tx.filter(row => row.type === 'INCOME' || row.type === 'DEPOSIT').reduce((s, row) => s + (row.amountUSD ?? row.amount ?? 0), 0);
      cumulative -= tx.filter(row => row.type === 'EXPENSE' || row.type === 'WITHDRAW').reduce((s, row) => s + (row.amountUSD ?? row.amount ?? 0), 0);
      return { day: item.day, net: convert(cumulative), projected: item.day >= daysElapsed ? convert(cumulative + (item.day - daysElapsed) * (dailyIncome - dailyExpense)) : null };
    });
  }, [daily, selected, daysElapsed, dailyIncome, dailyExpense, convert]);
  const sourceMap = new Map<string, number>();
  incomeRows.forEach(row => sourceMap.set(row.category || (th ? 'รายรับอื่นๆ' : 'Other income'), (sourceMap.get(row.category || (th ? 'รายรับอื่นๆ' : 'Other income')) || 0) + Math.round((row.amountUSD ?? row.amount ?? 0) * 100)));
  const bucketCents = new Map<string, number>();
  expenseRows.forEach(row => {
    const bucket = moneyBuckets.find(item => item.id === row.bucketId)?.name || (th ? 'เงินสด' : 'Cash');
    bucketCents.set(bucket, (bucketCents.get(bucket) || 0) + Math.round((row.amountUSD ?? row.amount ?? 0) * 100));
  });
  const bucketTotals = new Map(Array.from(bucketCents, ([name, cents]) => [name, cents / 100]));
  const sourceNodes = Array.from(sourceMap, ([name, cents]) => ({ name, value: cents / 100 }));
  const categoryNodes = expenseByCategory.map(item => ({ name: item.name, value: item.value }));
  const flowData = useMemo(() => {
    const adjustment = Math.max(0, -net);
    const middleIndex = sourceNodes.length + (adjustment > 0 ? 1 : 0);
    const nodes = [...sourceNodes, ...(adjustment > 0 ? [{ name: `${th ? 'ยอดคงเหลือเดิมที่ใช้ · คำนวณ' : 'Prior balance used · derived'}`, value: adjustment }] : []), { name: th ? 'เงินสดและ Bucket' : 'Cash & buckets', value: Math.max(summary.income, summary.expenses) }, ...categoryNodes, ...(net >= 0 ? [{ name: `${th ? 'ออม' : 'Saved'} ${formatDisplay(displayNet)}`, value: net }] : [])];
    const categoryStart = middleIndex + 1;
    const savedIndex = nodes.length - 1;
    const links: { source: number; target: number; value: number }[] = [];
    sourceNodes.forEach((source, i) => links.push({ source: i, target: middleIndex, value: source.value }));
    if (adjustment > 0) links.push({ source: sourceNodes.length, target: middleIndex, value: adjustment });
    categoryNodes.forEach((category, i) => links.push({ source: middleIndex, target: categoryStart + i, value: category.value }));
    if (net > 0) links.push({ source: middleIndex, target: savedIndex, value: net });
    return { nodes, links };
  }, [sourceNodes, categoryNodes, net, summary.income, summary.expenses, th, formatDisplay, displayNet]);
  const insights = [
    ...(expenseByCategory[0] ? [{ text: `${expenseByCategory[0].name} · ${fmt(expenseByCategory[0].value)} · ${summary.expenses ? (expenseByCategory[0].value / summary.expenses * 100).toFixed(1) : '0.0'}% ${th ? 'ของรายจ่าย' : 'of expenses'}`, href: '#spending-category' }] : []),
    ...(summary.income ? [{ text: `${th ? 'อัตราการออม' : 'Savings rate'} · ${savingsRate.toFixed(1)}%`, href: '#cashflow-trends' }] : []),
    ...(summary.records.length && net < 0 ? [{ text: `${th ? 'รายจ่ายสูงกว่ารายรับ' : 'Expenses exceed income'} · ${fmt(Math.abs(net))}`, href: '#cashflow-flow' }] : []),
  ].slice(0, 3);

  const stepMonth = (step: number) => {
    const next = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + step, 1);
    setDateRange({ mode: 'month', year: next.getFullYear(), month: next.getMonth() });
  };
  const handleExport = () => {
    const csv = Papa.unparse(rows.map(row => ({ type: row.type, amount: row.originalAmount ?? row.amountUSD, currency: row.currency || 'USD', category: row.category, date: row.date, note: row.note || '' })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'fintrack_cashflow.csv'; anchor.click(); URL.revokeObjectURL(url);
  };
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: result => {
      const valid = result.data.filter((row: any) => ['INCOME', 'EXPENSE'].includes(String(row.type || '').toUpperCase()) && Number(row.amount) > 0).length;
      addToast(th ? `ตรวจพบ ${valid} รายการที่นำเข้าได้` : `${valid} importable rows found. Import is not connected to storage yet.`, valid ? 'info' : 'warning');
    } });
    event.target.value = '';
  };

  const netWorthUSD = netWorthHistory.at(-1)?.value ?? 0;
  const portfolioScope = activePortfolioId ? activePortfolio?.name || (th ? 'พอร์ตที่เลือก' : 'Selected portfolio') : (th ? 'ทุกพอร์ต' : 'All portfolios');
  const netWorthScope = th ? `${portfolioScope} · ${netWorthSettings.includeBuckets !== false ? 'รวม Buckets' : 'ไม่รวม Buckets'} · ${netWorthSettings.includeAssets !== false ? 'รวมสินทรัพย์' : 'ไม่รวมสินทรัพย์'} · ${netWorthSettings.includeCash !== false ? 'รวมเงินสดโบรกเกอร์' : 'ไม่รวมเงินสดโบรกเกอร์'}` : `${portfolioScope} · ${netWorthSettings.includeBuckets !== false ? 'buckets included' : 'buckets excluded'} · ${netWorthSettings.includeAssets !== false ? 'assets included' : 'assets excluded'} · ${netWorthSettings.includeCash !== false ? 'broker cash included' : 'broker cash excluded'}`;
  const previousChange = (current: number, prior: number) => changePct(current, prior);
  const formatNative = (row: CashActivity) => {
    const nativeCurrency = row.currency || 'USD';
    const nativeAmount = row.originalAmount ?? row.amount ?? row.amountUSD;
    if (nativeCurrency === currencyView && row.originalAmount !== undefined) return money(row.originalAmount, currencyView);
    if (nativeCurrency === 'USD' && currencyView === 'USD' && row.originalAmount === undefined) return money(row.amountUSD, 'USD');
    if (nativeCurrency === 'THB' && currencyView === 'THB' && row.originalAmount === undefined) return money(row.amountUSD * (row.rateAtTime || exchangeRates.THB || 1), 'THB');
    return money(nativeAmount, nativeCurrency);
  };

  return <main className="mx-auto max-w-[1500px] space-y-4 p-4 pb-24 sm:p-6 lg:p-8">
    <div className="sticky top-0 z-30 -mx-4 flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-border bg-background/95 px-4 py-3 backdrop-blur-md scrollbar-none sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex shrink-0 gap-1">{['1D', '1W', '1M', '3M', '6M', '1Y', 'All'].map((label, i) => <button key={label} onClick={() => { const modes = ['1d', '1w', '1m', '3m', '6m', '1y'] as const; setDateRange(i === 6 ? { mode: 'all' } : { mode: modes[i] }); }} className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${((dateRange.mode === 'all' && label === 'All') || (dateRange.mode === 'month' && label === '1M') || dateRange.mode === label.toLowerCase()) ? 'bg-primary/15 text-primary' : 'text-muted hover:bg-surface-2'}`}>{label}</button>)}</div>
      <div className="relative"><button onClick={() => setShowCustomRange(value => !value)} className={`rounded-lg border border-border px-2.5 py-2 text-xs ${dateRange.mode === 'custom' ? 'text-primary' : 'text-muted'}`}>{th ? 'กำหนดเอง' : 'Custom range'}</button>{showCustomRange && <div className="absolute left-0 z-40 mt-2 grid min-w-64 gap-2 rounded-xl border border-border bg-background p-3 shadow-xl"><label className="grid gap-1 text-[10px] text-muted">{th ? 'ตั้งแต่' : 'From'}<input type="date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} className="rounded-md border border-border bg-surface px-2 py-2 text-xs text-white"/></label><label className="grid gap-1 text-[10px] text-muted">{th ? 'ถึง' : 'To'}<input type="date" value={customTo} min={customFrom || undefined} onChange={event => setCustomTo(event.target.value)} className="rounded-md border border-border bg-surface px-2 py-2 text-xs text-white"/></label><button disabled={!customFrom || !customTo || customFrom > customTo} onClick={() => { setDateRange({ mode: 'custom', from: customFrom, to: customTo }); setShowCustomRange(false); }} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">{th ? 'ใช้ช่วงเวลา' : 'Apply range'}</button></div>}</div>
      <div className="flex items-center rounded-lg border border-border"><button aria-label="Previous month" onClick={() => stepMonth(-1)} className="p-2 text-muted hover:text-white"><ChevronLeft size={15}/></button><span className="min-w-[94px] text-center text-xs font-semibold tabular-nums">{monthCursor.toLocaleDateString(locale, { month: 'short', year: 'numeric' })}</span><button aria-label="Next month" onClick={() => stepMonth(1)} className="p-2 text-muted hover:text-white"><ChevronRight size={15}/></button></div>
      <select aria-label={th ? 'เลือก Wallet หรือ Bucket' : 'Filter wallet or bucket'} value={walletId} onChange={event => setWalletId(event.target.value)} className="max-w-36 rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-white"><option value="all">{th ? 'ทุก Wallet' : 'All wallets'}</option>{moneyBuckets.map(bucket => <option key={bucket.id} value={bucket.id}>{bucket.name}</option>)}</select>
      <nav className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">{(['overview', 'flow', 'trends', 'budget'] as View[]).map(item => <button key={item} onClick={() => setView(item)} className={`rounded-md px-2 py-1.5 text-xs capitalize ${view === item ? 'bg-surface-2 text-white' : 'text-muted'}`}>{item}</button>)}</nav>
      <div className="ml-auto flex items-center gap-1.5"><button onClick={() => setCurrencyView(c => c === 'THB' ? 'USD' : 'THB')} className="rounded-lg border border-border px-2.5 py-2 text-xs font-bold text-muted">{currencyView === 'THB' ? '฿ → $' : '$ → ฿'}</button>{currencyView === 'THB' && !hasDisplayRate && <span className="text-[10px] text-muted">USD shown · THB rate unavailable</span>}<button onClick={() => setShowAmounts(value => !value)} aria-label={showAmounts ? 'Hide amounts' : 'Show amounts'} className="rounded-lg border border-border p-2 text-muted">{showAmounts ? <Eye size={15}/> : <EyeOff size={15}/>}</button><button onClick={() => setShowAdvisor(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted"><Sparkles size={14}/>Ask</button><div className="relative"><button onClick={() => setShowMenu(!showMenu)} aria-label="More actions" className="rounded-lg border border-border px-3 py-1.5 text-lg leading-5 text-muted">⋯</button>{showMenu && <div className="absolute right-0 z-40 mt-2 w-44 rounded-xl border border-border bg-background p-1 shadow-xl">{[['Import CSV', () => fileInputRef.current?.click()], ['Export CSV', handleExport], ['Audit detail', () => { setView('flow'); setShowFlowTable(true); }]].map(([label, action]) => <button key={label as string} onClick={() => { (action as () => void)(); setShowMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-muted hover:bg-surface-2">{label as string}</button>)}</div>}<input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden"/></div><button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground"><Plus size={15}/>{t('addRecord')}</button></div>
    </div>

    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
      {[
        { name: th ? 'กระแสเงินสดสุทธิ' : 'Net cashflow', value: net, displayValue: displayNet, old: previous.net, data: monthly.map(x => x.net), color: net >= 0 ? emerald : rose, signed: true },
        { name: th ? 'รายรับ' : 'Income', value: summary.income, displayValue: summary.income, old: previous.income, data: monthly.map(x => x.income), color: emerald },
        { name: th ? 'รายจ่าย' : 'Expenses', value: summary.expenses, displayValue: summary.expenses, old: previous.expenses, data: monthly.map(x => x.expenses), color: rose },
        { name: th ? 'อัตราการออม' : 'Savings rate', value: savingsRate, displayValue: savingsRate, old: previous.income ? (previous.net / previous.income) * 100 : 0, data: monthly.map(x => x.savingsRate), percent: true, color: '#ADC6FF' },
        { name: th ? 'เฉลี่ยต่อวัน · เข้า / ออก' : 'Daily avg · in / out', value: dailyIncome, displayValue: dailyIncome, old: dailyExpense, data: daily.map(d => d.spend), pair: true, color: '#ADC6FF' },
        { name: th ? `วันที่ ${daysElapsed}/${daysInPeriod} · คาดการณ์` : `Day ${daysElapsed}/${daysInPeriod} · projected`, value: projectedNet, displayValue: displayProjectedNet, old: previous.net, data: monthly.map(x => x.net), color: projectedNet >= 0 ? emerald : rose, signed: true },
      ].map(tile => <article key={tile.name} className="min-w-0 bg-background p-3 sm:p-4"><p className="truncate text-[10px] font-medium text-muted">{tile.name}</p><p className={`mt-1 truncate text-base font-semibold tabular-nums ${tile.color === rose ? 'text-[#FFB4AB]' : 'text-white'}`}>{tile.percent ? (isDataLoaded && hasPeriodData ? `${tile.value.toFixed(1)}%` : '—') : tile.pair ? `${metric(tile.value)} / ${metric(tile.old)}` : tile.signed ? (!isDataLoaded || !hasPeriodData ? metric(tile.value) : displaySigned(tile.displayValue)) : metric(tile.value)}</p><p className="mt-0.5 text-[10px] tabular-nums text-muted">{tile.pair ? `${th ? 'เฉลี่ยรายจ่าย' : 'Avg out'} ${metric(tile.old)}` : `${hasPeriodData ? previousChange(tile.value, tile.old) : '—'} ${th ? 'เทียบช่วงก่อน' : 'vs prior period'}`}</p><MiniLine data={tile.data} color={tile.color} revision={rangeRevision}/></article>)}
    </section>

    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted"><span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5"><Wallet size={12}/>{th ? 'มูลค่าสุทธิ' : 'Net worth'} <b className="text-white">{fmt(netWorthUSD)}</b><span title={netWorthScope} className="max-w-52 truncate">{netWorthScope}</span></span><span className="inline-flex items-center gap-1.5" title="Score starts at 50: savings rate adds 15 (or 8 at 10%), investment ratio adds 15 (or 8 at 5%), expenses at or below half of income adds 10, portfolio return adds 10 (or 5 if non-negative), existing buckets add 5, and positive realized P/L adds 5; capped at 100."><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 -rotate-90"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="3"/><circle cx="12" cy="12" r="9" fill="none" stroke={emerald} strokeWidth="3" strokeDasharray="39.6 56.5" strokeLinecap="round"/></svg><CircleHelp size={12}/>Financial health <b className="text-white">70/100</b> · {th ? 'ดูวิธีคำนวณ' : 'score method'}</span><span>{th ? 'Cash Flow · Ledger · Dashboard ใช้รายการเงินสดชุดเดียวกัน' : 'Cash Flow, Ledger and Dashboard share the same cash activity totals'}</span></div>

    {(view === 'overview' || view === 'flow') && <Panel id="cashflow-flow" title={th ? 'เงินของคุณไหลไปที่ไหน' : 'Where your money flows'} action={<button onClick={() => setShowFlowTable(value => !value)} className="rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted">{showFlowTable ? (th ? 'แสดงกราฟ' : 'View chart') : (th ? 'ดูเป็นตาราง' : 'View as table')}</button>}>
      {!isDataLoaded ? <div className="grid min-h-64 animate-pulse place-items-center rounded-xl border border-border bg-surface/40"><div className="h-24 w-3/5 rounded-lg bg-surface-2"/></div> : showFlowTable ? <div className="space-y-2">{[...sourceNodes.map(n => ({ ...n, group: th ? 'รายรับ' : 'Income' })), ...categoryNodes.map(n => ({ ...n, group: th ? 'รายจ่าย' : 'Expenses' })), { name: net >= 0 ? 'Saved' : 'Existing balance used (derived)', value: Math.abs(net), group: th ? 'สุทธิ' : 'Net' }].map((row, i) => <div key={`${row.group}-${row.name}-${i}`} className="flex items-center justify-between border-b border-border/60 py-2 text-xs"><span className="text-muted">{row.group} · {row.name}</span><span className="tabular-nums text-white">{fmt(row.value)}</span></div>)}<div className="flex justify-between pt-2 text-xs font-semibold"><span>{th ? 'รายรับ − รายจ่าย = สุทธิ' : 'Income − expenses = net'}</span><span className={net >= 0 ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]'}>{displaySigned(displayNet)}</span></div></div> : summary.income + summary.expenses === 0 ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center"><div className="h-24 w-full max-w-xl rounded-xl border border-border/50 bg-surface/40"/><p className="text-sm text-muted">{th ? 'ยังไม่มีรายการในช่วงเวลานี้' : 'No activity for this period yet.'}</p><div className="flex gap-2"><button onClick={() => setShowAdd(true)} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">{t('addRecord')}</button><button onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-border px-3 py-2 text-xs text-muted">Import CSV</button></div></div> : <><ChartReveal label="Cash flow Sankey: income sources, cash and bucket balance, expense categories and saved net. Prior balance is shown as a derived residual when expenses exceed income." revision={rangeRevision} className="h-[310px] w-full overflow-x-auto sm:h-[350px]"><div className="h-full min-w-[760px]"><ResponsiveContainer width="100%" height="100%"><Sankey data={flowData} nodePadding={22} nodeWidth={12} margin={{ left: 10, right: 160, top: 12, bottom: 12 }} link={{ stroke: '#ADC6FF', strokeOpacity: .32 }} node={<CashflowSankeyNode formatAmount={fmt}/>}><Tooltip formatter={(value: any) => fmt(Number(value))} contentStyle={{ background: '#111318', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, color: '#fff' }}/></Sankey></ResponsiveContainer></div></ChartReveal><div className="flex flex-wrap justify-between gap-3 border-t border-border pt-3 text-xs"><span>{th ? 'รายรับ' : 'Inflow'} <b className="ml-2 text-[#4EDEA3]">{metric(summary.income)}</b></span><span>{th ? 'รายจ่าย' : 'Outflow'} <b className="ml-2 text-[#FFB4AB]">{metric(summary.expenses)}</b></span><span>{net >= 0 ? (th ? 'ออม' : 'Saved') : (th ? 'ยอดคงเหลือเดิมที่ใช้ · คำนวณจากส่วนต่าง' : 'Prior balance used · derived residual')} <b className={`ml-2 ${net >= 0 ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]'}`}>{displaySigned(displayNet)}</b></span></div><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted">{Array.from(bucketTotals, ([name, value]) => <span key={name} className="rounded-full border border-border px-2 py-1">{name} · {metric(value)}</span>)}<span className="self-center">{!hasDisplayRate ? (th ? 'อัตราแลกเปลี่ยน THB ยังไม่พร้อม' : 'THB exchange rate unavailable') : th ? 'ยอดกระเป๋าแยกตามประเภทรายการ; โอนภายในไม่ถูกนับเป็นรายรับ/รายจ่าย' : 'Bucket labels come from linked activity rows; internal transfers are excluded from income and expense.'}</span></div></>}</Panel>}

    {(view === 'overview' || view === 'trends') && <div className="grid grid-cols-1 gap-4 lg:grid-cols-12"><Panel id="cashflow-trends" title={th ? 'รายรับและรายจ่าย · 12 เดือน' : 'Income and expenses · 12 months'} className="lg:col-span-8" action={<button onClick={() => setShowTrendTable(v => !v)} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted">{showTrendTable ? 'Chart' : 'Table'}</button>}>{showTrendTable ? <div className="max-h-72 overflow-auto text-xs">{monthly.map(m => <div key={m.axis} className="grid grid-cols-4 border-b border-border py-2"><span>{m.axis}</span><span>{fmt(m.income)}</span><span>{fmt(m.expenses)}</span><span>{signedMetric(m.net)}</span></div>)}</div> : !hasDisplayRate ? <div className="grid h-64 place-items-center text-xs text-muted">{th ? 'อัตราแลกเปลี่ยนไม่พร้อม · แสดงมูลค่าเป็น USD' : 'Exchange rate unavailable · values remain in USD'}</div> : !monthly.some(item => item.income || item.expenses) ? <div className="grid h-64 place-items-center rounded-lg border border-border/50 text-xs text-muted">{th ? 'ยังไม่มีข้อมูลรายเดือน' : 'No monthly data yet.'}</div> : <ChartReveal label="Monthly paired income and expense bars with net cashflow line" revision={rangeRevision} className="h-64"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthly} margin={{ left: 4, right: 10, top: 6, bottom: 0 }}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false}/><XAxis dataKey="month" tick={{ fill: '#8b929d', fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis width={48} tick={{ fill: '#8b929d', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={n => Number(n).toLocaleString(locale, { notation: 'compact', maximumFractionDigits: 1 })}/><Tooltip formatter={(v: any, name: any) => [fmt(Number(v) / (currencyView === 'USD' ? 1 : exchangeRates.THB || 1)), name]} contentStyle={{ background: '#111318', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12 }}/><Bar dataKey="income" name={th ? 'รายรับ' : 'Income'} fill={emerald} radius={[3,3,0,0]} animationDuration={900}/><Bar dataKey="expenses" name={th ? 'รายจ่าย' : 'Expenses'} fill={rose} radius={[3,3,0,0]} animationDuration={900}/><Line dataKey="net" name={th ? 'สุทธิ' : 'Net'} stroke="#ADC6FF" strokeWidth={2} dot={false} animationDuration={1100}/></ComposedChart></ResponsiveContainer></ChartReveal>}</Panel><Panel title={th ? 'แนวโน้มอัตราการออม' : 'Savings-rate trend'} action={<span className="text-[10px] text-muted">{th ? 'เป้าหมาย' : 'Target'} 20%</span>}>{!hasDisplayRate ? <div className="grid h-64 place-items-center text-xs text-muted">{th ? 'อัตราแลกเปลี่ยนไม่พร้อม · แสดงมูลค่าเป็น USD' : 'Exchange rate unavailable · values remain in USD'}</div> : !monthly.some(item => item.income || item.expenses) ? <div className="grid h-64 place-items-center rounded-lg border border-border/50 text-xs text-muted">{th ? 'ยังไม่มีข้อมูลรายเดือน' : 'No monthly data yet.'}</div> : <ChartReveal label="Monthly savings rate with 20 percent target" revision={rangeRevision} className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly} margin={{ left: -18, right: 5, top: 10, bottom: 0 }}><defs><linearGradient id="savingFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ADC6FF" stopOpacity={.3}/><stop offset="100%" stopColor="#ADC6FF" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false}/><XAxis dataKey="month" tick={{ fill: '#8b929d', fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis unit="%" tick={{ fill: '#8b929d', fontSize: 9 }} axisLine={false} tickLine={false}/><Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, th ? 'อัตราการออม' : 'Savings rate']}/><Area dataKey="savingsRate" type="monotone" stroke="#ADC6FF" fill="url(#savingFill)" strokeWidth={2} animationDuration={1200}/></AreaChart></ResponsiveContainer></ChartReveal>}</Panel></div>}

    {(view === 'overview' || view === 'trends') && <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Panel title={th ? 'ยอดสะสมในเดือนนี้' : 'Cumulative balance this month'}><ChartReveal label="Daily cumulative cashflow and pace projection" revision={rangeRevision} className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daySeries}><defs><linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={emerald} stopOpacity={.25}/><stop offset="100%" stopColor={emerald} stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false}/><XAxis dataKey="day" tick={{ fill: '#8b929d', fontSize: 9 }} axisLine={false} tickLine={false}/><YAxis width={48} tick={{ fill: '#8b929d', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => Number(v).toLocaleString(locale, { notation: 'compact' })}/><Tooltip formatter={(v: any) => fmt(Number(v) / (currencyView === 'USD' ? 1 : exchangeRates.THB || 1))}/><Area dataKey="net" type="monotone" stroke={emerald} fill="url(#balanceFill)" strokeWidth={2} connectNulls={false}/><Line dataKey="projected" type="monotone" stroke="#ADC6FF" strokeDasharray="5 5" dot={false} connectNulls={false}/></AreaChart></ResponsiveContainer></ChartReveal></Panel><Panel title={th ? 'ปฏิทินรายจ่าย · จันทร์–อาทิตย์' : 'Daily spending · Mon–Sun'} action={<button onClick={() => setShowDailyTable(v => !v)} className="text-[10px] text-muted">{showDailyTable ? 'Chart' : 'Table'}</button>}>{showDailyTable ? <div className="grid grid-cols-7 gap-1">{daily.map(d => <div key={d.date} title={`${d.count} transactions · ${fmt(d.spend / (currencyView === 'USD' ? 1 : exchangeRates.THB || 1))}`} className="rounded bg-surface-2 p-1 text-center text-[10px]">{d.day}<br/>{d.count ? fmt(d.spend / (currencyView === 'USD' ? 1 : exchangeRates.THB || 1)) : '—'}</div>)}</div> : <ChartReveal label="Daily spending calendar heatmap with transaction counts" revision={rangeRevision} className="grid grid-cols-7 gap-1.5">{daily.map(d => { const intensity = Math.min(.85, .08 + d.spend / Math.max(...daily.map(x => x.spend), 1) * .75); return <button key={d.date} title={`${d.count} transactions · ${fmt(d.spend / (currencyView === 'USD' ? 1 : exchangeRates.THB || 1))}`} aria-label={`${d.date}, ${d.count} transactions, ${fmt(d.spend / (currencyView === 'USD' ? 1 : exchangeRates.THB || 1))}`} onClick={() => setDateRange({ mode: 'custom', from: d.date, to: d.date })} className="aspect-square rounded-md text-[10px] text-white" style={{ backgroundColor: `rgba(255,143,135,${d.spend ? intensity : .04})` }}>{d.day}</button>; })}</ChartReveal>}</Panel></div>}

    {(view === 'overview' || view === 'budget') && <details className="rounded-xl border border-border bg-surface/40 px-4 py-3"><summary className="cursor-pointer text-xs font-semibold text-white">{th ? 'ข้อมูลเชิงสังเกต' : 'Smart insights'}</summary><div className="mt-3 space-y-2">{insights.length ? insights.map((item, i) => <a key={`${item.href}-${i}`} href={item.href} className="block text-xs text-muted hover:text-white">{item.text} <ArrowUpRight className="inline" size={12}/></a>) : <p className="text-xs text-muted">{th ? 'มีข้อมูลไม่เพียงพอสำหรับข้อมูลเชิงสังเกตในช่วงนี้' : 'Not enough activity for insights in this period.'}</p>}<p className="text-[10px] text-muted">{th ? 'ไม่ใช่คำแนะนำทางการเงิน' : 'Not financial advice.'}</p></div></details>}

    {(view === 'overview' || view === 'budget') && <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Panel id="spending-category" title={th ? 'รายจ่ายตามหมวดหมู่' : 'Spending by category'}>{expenseByCategory.length ? <ChartReveal label="Horizontal bars of top spending categories" revision={rangeRevision} className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={expenseByCategory.map(item => ({ ...item, label: t(item.name) === item.name ? item.name : t(item.name), percent: summary.expenses ? item.value / summary.expenses * 100 : 0 }))} layout="vertical" margin={{ left: 5, right: 20 }}><CartesianGrid stroke="rgba(255,255,255,.05)" horizontal={false}/><XAxis type="number" hide/><YAxis dataKey="label" type="category" width={110} tick={{ fill: '#a8adb7', fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip formatter={(v: any, name: any, item: any) => [`${fmt(Number(v) / (currencyView === 'USD' ? 1 : exchangeRates.THB || 1))} · ${Number(item.payload.percent).toFixed(1)}%`, th ? 'รายจ่าย' : 'Spent']}/><Bar dataKey="value" radius={[0,4,4,0]}>{expenseByCategory.map((row, index) => <Cell key={row.name} fill={palette[index % palette.length]}/>)}</Bar></BarChart></ResponsiveContainer></ChartReveal> : <p className="py-14 text-center text-xs text-muted">{th ? 'ยังไม่มีรายจ่ายในช่วงนี้' : 'No spending in this period.'}</p>}{expenseByCategory.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">{expenseByCategory.map((item, i) => <span key={item.name}><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: palette[i % palette.length] }}/>{item.name} · {summary.expenses ? (item.value / summary.expenses * 100).toFixed(1) : 0}% · {categoryChange(item.name, item.value)}</span>)}</div>}</Panel><Panel title={th ? 'งบประมาณเทียบยอดใช้จริง · Bucket' : 'Budget vs actual · Buckets'}>{moneyBuckets.length ? moneyBuckets.map(bucket => { const cap = bucket.targetAmount || 0; const capUSD = bucket.currency === 'THB' ? (hasDisplayRate ? cap / exchangeRates.THB : Number.NaN) : cap; const actual = expenseRows.filter(row => row.bucketId === bucket.id).reduce((s, r) => s + (r.amountUSD ?? r.amount ?? 0), 0); const ratio = capUSD ? Math.min(actual / capUSD, 1.25) : 0; const over = capUSD > 0 && actual > capUSD; return <div key={bucket.id} className="mb-5"><div className="mb-2 flex justify-between text-xs"><span className="text-white">{bucket.name}</span><span className={over ? 'text-[#FFB4AB]' : 'text-muted'}>{fmt(actual)} / {cap ? Number.isFinite(capUSD) ? fmt(capUSD) : '—' : '—'}{over ? (th ? ' · เกินงบ' : ' · Over budget') : ''}</span></div><div className="relative h-2 rounded-full bg-surface-2"><div className={`h-2 rounded-full ${over ? 'bg-[#FF8F87]' : 'bg-primary'}`} style={{ width: `${Math.min(ratio * 100, 100)}%` }}/><div className="absolute -top-1 h-4 w-px bg-white/70" style={{ left: `${Math.min(daysElapsed / daysInPeriod * 100, 100)}%` }} title="Pace marker"/></div></div> }) : <div className="py-14 text-center text-xs text-muted">{th ? 'ไม่มีข้อมูล Bucket' : 'No bucket budgets are available.'}</div>}</Panel></div>}

    {(view === 'overview' || view === 'budget') && <Panel title={th ? 'รายการที่จะเกิดขึ้น · 14 วัน' : 'Upcoming and recurring · 14 days'}><div className="flex flex-wrap items-center justify-between gap-3 text-xs"><p className="text-muted">{th ? 'ระบบยังไม่มีรายการซ้ำหรือวันครบกำหนดที่บันทึกไว้ จึงไม่สามารถคาดการณ์รายการเหล่านี้ได้' : 'Recurring schedules and due dates are not stored yet, so upcoming transactions cannot be projected.'}</p><p className="text-muted">{th ? 'ยอดสุทธิสิ้นเดือนตามอัตราปัจจุบัน' : 'Projected month-end net'} <b className={projectedNet >= 0 ? 'text-[#4EDEA3]' : 'text-[#FFB4AB]'}>{displaySigned(displayProjectedNet)}</b></p></div></Panel>}

    <Panel title={th ? 'รายการล่าสุด' : 'Recent activity'} action={<Link href="/ledger" className="text-xs font-semibold text-primary">{t('viewAllTransactions')}</Link>}><div className="divide-y divide-border/60">{rows.slice(0, 8).map(row => { const incoming = row.type === 'INCOME'; return <div key={row.id} className="flex items-center gap-3 py-3"><span className={`rounded-lg p-2 ${incoming ? 'bg-primary/10 text-primary' : 'bg-[#FF8F87]/10 text-[#FFB4AB]'}`}>{incoming ? <ArrowDownLeft size={15}/> : <ArrowUpRight size={15}/>}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{t(row.category) || row.category}</p><p className="text-[10px] text-muted">{new Date(row.date).toLocaleDateString(locale)} · {row.note || ''}</p></div><span className={`text-xs font-semibold tabular-nums ${incoming ? 'text-primary' : 'text-[#FFB4AB]'}`}>{incoming ? '+' : '−'}{showAmounts ? formatNative(row) : '••••••'}</span></div> })}{!rows.length && <p className="py-10 text-center text-xs text-muted">{th ? 'ไม่มีรายการในช่วงเวลานี้' : 'No transactions in this period.'}</p>}</div></Panel>

    <footer className="flex flex-wrap items-center justify-between gap-3 px-1 text-[10px] text-muted"><span>{th ? 'ตัวเลขสรุปใช้รายการเงินสดที่ไม่ใช่การโอน ภายในพอร์ตที่เลือก' : 'Summary totals use non-transfer cash activities in the selected portfolio.'}</span><button onClick={() => setRefreshError(false)} className="inline-flex items-center gap-1.5" title={refreshError ? 'Retry loading' : 'Data loaded'}>{refreshError ? 'Retry' : 'Cash data loaded'}<ArrowRight size={11}/></button><span>{th ? 'ไม่ใช่คำแนะนำทางการเงิน' : 'Not financial advice.'}</span></footer>

    <AddCashflowModal isOpen={showAdd} onClose={() => setShowAdd(false)}/>
    {showAdvisor && <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onClick={() => setShowAdvisor(false)}><aside className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-background p-4 shadow-2xl" onClick={event => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-white">{th ? 'ที่ปรึกษาการเงิน' : 'Financial advisor'}</h2><button onClick={() => setShowAdvisor(false)} className="rounded-lg border border-border px-3 py-2 text-xs text-muted">{th ? 'ปิด' : 'Close'}</button></div><AIFinancialAdvisor compactPrompts/></aside></div>}
  </main>;
}
