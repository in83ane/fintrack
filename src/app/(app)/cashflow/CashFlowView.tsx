"use client";
// แก้ layout หน้านี้ ต้องแก้ CashFlowSkeleton ด้วย
import { matchesRecord } from '@/src/lib/record-search';
import { RecordSearch } from '@/src/components/RecordSearch';
import { Sk } from '@/src/components/skeleton';
import { layout } from './skeleton-layout';
import { CustomSelect } from "@/src/components/CustomSelect";
import { GlideGroup, GlidingIndicator } from '@/src/components/GlidingIndicator';


import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Papa from 'papaparse';
import { ChevronLeft, ChevronRight, CircleHelp, Eye, EyeOff, MoreHorizontal, Plus, Sparkles, X } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { AddCashflowModal } from '@/src/components/AddCashflowModal';
import { AllocationSurface } from '@/src/components/AllocationSurface';
import { ChartReveal } from '@/src/components/ChartReveal';
import { ChartFrame, DataTable, type DataRow } from '@/src/components/cashflow/ChartFrame';
import { decimal } from '@/src/lib/fx';
import { type CashflowScope, type FlowNode, displayCashflowCategory, formatCashflowMoney, getBudgetStatus, getCashflowSummary, getCategoryBreakdown, getDailySeries, getFlowGraph, getMonthlySeries, getNetWorthIncludedSources, getUpcomingRecurring, localCashflowDay, monthBounds, toMinor } from '@/src/lib/cashflow-selectors';

const chartLoading = () => <Sk.Root name="cashflow-chart"><Sk.Chart height={256}/></Sk.Root>;
const FlowChart = dynamic(() => import('@/src/components/cashflow/charts').then(m => m.FlowChart), { ssr: false, loading: ()=><Sk.Chart height={420}/> });
const MonthlyChart = dynamic(() => import('@/src/components/cashflow/charts').then(m => m.MonthlyChart), { ssr: false, loading: chartLoading });
const SavingsChart = dynamic(() => import('@/src/components/cashflow/charts').then(m => m.SavingsChart), { ssr: false, loading: chartLoading });
const BalanceChart = dynamic(() => import('@/src/components/cashflow/charts').then(m => m.BalanceChart), { ssr: false, loading: chartLoading });
const CategoryChart = dynamic(() => import('@/src/components/cashflow/charts').then(m => m.CategoryChart), { ssr: false, loading: chartLoading });
const Advisor = dynamic(() => import('@/src/components/AIFinancialAdvisor').then(m => m.AIFinancialAdvisor), { ssr: false, loading: chartLoading });
const green = 'var(--color-gain, #4EDEA3)', red = 'var(--color-loss, #FF8F87)', blue = '#568CD6';
const control = 'shrink-0 rounded-lg border border-border px-2.5 py-2 text-xs text-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary';
type Period = 'month' | '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'All' | 'custom';
type View = 'overview' | 'flow' | 'trends' | 'budget';
function shiftDay(day: string, amount: number) { const date = new Date(`${day}T12:00:00+07:00`); date.setUTCDate(date.getUTCDate() + amount); return localCashflowDay(date.toISOString()); }
function shiftMonth(month: string, amount: number) { const [y, m] = month.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1 + amount, 1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; }
function ratioMinor(value: number, divisor: number, multiplier = 1) { return Number(decimal(value).mul(decimal(multiplier)).div(decimal(Math.max(1, divisor))).toFixed(0)); }
function delta(now: number, before: number) { return before ? `${now >= before ? '+' : '−'}${(Math.abs(now - before) / Math.abs(before) * 100).toFixed(1)}%` : now ? '—' : '0%'; }
function Sparkline({ values, revision, color }: { values: number[]; revision: string; color: string }) {
  const min = Math.min(...values, 0), max = Math.max(...values, 1);
  const path = values.map((n, i) => `${i ? 'L' : 'M'}${i / Math.max(1, values.length - 1) * 100},${25 - (n - min) / (max - min) * 23}`).join(' ');
  return <ChartReveal label="Monthly trend sparkline; exact values available in the trends table" revision={revision} className="h-7"><svg viewBox="0 0 100 28" className="h-full w-full" aria-hidden="true"><path data-chart-plot d={path} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke"/></svg></ChartReveal>;
}

export default function CashFlowView({loading:forceLoading=false}:{loading?:boolean}) {
  const app = useApp();
  const { cashActivities, trades, moneyBuckets, brokerageAccounts, activePortfolioId, activePortfolio, currency, exchangeRates, language, isDataLoaded:appDataLoaded, netWorthHistory, netWorthSettings, formatMoney, t, addToast, addCashActivity, assets } = app;
  const isDataLoaded=appDataLoaded&&!forceLoading;
  const th = language === 'th', text = (en: string, thai: string) => th ? thai : en;
  const [today] = useState(() => localCashflowDay(new Date().toISOString()));
  const [month, setMonth] = useState(today.slice(0, 7));
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState(`${month}-01`), [to, setTo] = useState(monthBounds(month).to);
  const [walletId, setWalletId] = useState('all'), [category, setCategory] = useState('');
  const [view, setView] = useState<View>('overview');
  const [displayCurrency, setDisplayCurrency] = useState(currency);
  const [includeInvestments, setIncludeInvestments] = useState(false);
  const [hidden, setHidden] = useState(false), [expandedCategories, setExpandedCategories] = useState(false);
  const [showAdd, setShowAdd] = useState(false), [showAdvisor, setShowAdvisor] = useState(false), [showAudit, setShowAudit] = useState(false);
  const [retry, setRetry] = useState(0), [importRows, setImportRows] = useState<Record<string, string>[]>([]), [importing, setImporting] = useState(false);
  const input = useRef<HTMLInputElement>(null), drawer = useRef<HTMLDivElement>(null), ask = useRef<HTMLButtonElement>(null);
  useEffect(() => setDisplayCurrency(currency), [currency]);
  useEffect(() => {
    if (!showAdvisor) return;
    const trigger = ask.current;
    drawer.current?.focus({ preventScroll: true });
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowAdvisor(false);
      if (event.key === 'Tab') {
        const focusables = drawer.current?.querySelectorAll<HTMLElement>('button, input, textarea, a[href], [tabindex="0"]');
        if (!focusables?.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus({ preventScroll: true }); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); trigger?.focus({ preventScroll: true }); };
  }, [showAdvisor]);
  const bounds = useMemo<{ from?: string; to?: string }>(() => {
    if (period === 'All') return {};
    if (period === 'month') return monthBounds(month);
    if (period === 'custom') return { from, to };
    const days = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }[period];
    return { from: shiftDay(today, -(days - 1)), to: today };
  }, [period, month, from, to, today]);
  const previousBounds = useMemo(() => {
    if (period === 'month') return monthBounds(shiftMonth(month, -1));
    if (!bounds.from || !bounds.to) return { from: '0001-01-01', to: '0001-01-01' };
    const days = Math.round((Date.parse(bounds.to) - Date.parse(bounds.from)) / 86400000) + 1;
    return { from: shiftDay(bounds.from, -days), to: shiftDay(bounds.from, -1) };
  }, [period, month, bounds]);
  const [query,setQuery]=useState('');
  const searchCash=useMemo(()=>cashActivities.filter(r=>matchesRecord(query,r,[moneyBuckets.find(b=>b.id===r.bucketId)?.name||''])),[cashActivities,query,moneyBuckets]);
  const searchTrades=useMemo(()=>trades.filter(r=>matchesRecord(query,r)),[trades,query]);
  const scope = useMemo<CashflowScope>(() => ({ ...bounds, walletId, category: category || undefined, portfolioId: activePortfolioId, currency: displayCurrency, exchangeRates, trades:searchTrades, includeInvestments }), [bounds, walletId, category, activePortfolioId, displayCurrency, exchangeRates, searchTrades, includeInvestments]);
  const projectionMonth = bounds.to?.slice(0, 7) || month;
  const result = useMemo(() => {
    void retry; // The inline Retry action explicitly re-runs a failed calculation.
    try {
      const summary = getCashflowSummary(searchCash, scope), previous = getCashflowSummary(searchCash, { ...scope, ...previousBounds });
      const wallets = [...moneyBuckets.map(b => ({ id: b.id, name: b.name })), ...brokerageAccounts.map(a => ({ id: `broker:${a.id}`, name: a.name }))];
      const monthly = getMonthlySeries(searchCash, scope, 12, bounds.to || today);
      const daily = getDailySeries(searchCash, scope, projectionMonth, today);
      return { summary, previous, wallets, monthly, daily, categories: getCategoryBreakdown(summary, previous, language), graph: getFlowGraph(summary, wallets, language, expandedCategories), budgets: getBudgetStatus(summary, moneyBuckets, scope, daily.elapsed / daily.totalDays), error: null };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to calculate cash flow' }; }
  }, [searchCash, scope, previousBounds, moneyBuckets, brokerageAccounts, bounds.to, today, projectionMonth, language, expandedCategories, retry]);
  const m = (minor: number, signed = false) => !isDataLoaded ? <Sk.Line height={20} width="70%"/> : hidden ? '••••••' : formatCashflowMoney(minor, displayCurrency, signed);
  const revision = `${query}:${JSON.stringify(bounds)}:${walletId}:${category}:${displayCurrency}:${includeInvestments}:${cashActivities.length}:${trades.length}`;
  const periodLabel = bounds.from ? `${bounds.from} — ${bounds.to}` : text('All time', 'ทั้งหมด');
  const monthLabel = new Date(`${month}-01T12:00:00+07:00`).toLocaleDateString(th ? 'th-TH' : 'en-US', { month: 'short', year: 'numeric', calendar: 'gregory' });
  const chartProps = { currency: displayCurrency, privateAmounts: hidden, revision };
  const upcoming = getUpcomingRecurring();
  function chooseNode(node: FlowNode) {
    if (node.walletId) setWalletId(node.walletId);
    if (node.category === '__other') setExpandedCategories(v => !v);
    else if ((node.kind === 'expense' || node.kind === 'income') && node.category) setCategory(node.category);
  }
  function exportRows() {
    if (!result.summary) return;
    const csv = Papa.unparse(result.summary.entries.map(e => ({ id: e.id, date: e.day, type: e.record.type, amount: e.nativeAmount, currency: e.nativeCurrency, category: e.category, wallet: e.walletId, rate: e.rate, displayed_minor: e.minor, display_currency: displayCurrency })));
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `cashflow-${today}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  function readImport(file?: File) {
    if (!file) return;
    Papa.parse<Record<string, string>>(file, { header: true, skipEmptyLines: true, complete: parsed => {
      const valid = parsed.data.filter(row => ['INCOME', 'EXPENSE'].includes(row.type) && Number.isFinite(Number(row.amount)) && Number(row.amount) > 0 && ['THB', 'USD'].includes(row.currency) && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && localCashflowDay(row.date) === row.date);
      if (parsed.errors.length || valid.length !== parsed.data.length || !valid.length) { addToast(text('CSV needs type (INCOME/EXPENSE), positive amount, currency (THB/USD), date (YYYY-MM-DD) and category.', 'CSV ต้องมีประเภท INCOME/EXPENSE จำนวนเงิน สกุล THB/USD วันที่ และหมวดหมู่'), 'error'); return; }
      setImportRows(valid);
    } });
    if (input.current) input.current.value = '';
  }
  async function commitImport() {
    setImporting(true);
    try {
      for (const row of importRows) {
        const rate = Number(row.rate || exchangeRates.THB);
        if (row.currency === 'THB' && !(rate > 0)) throw Error('THB exchange rate is required');
        const saved = await addCashActivity({ type: row.type as 'INCOME' | 'EXPENSE', amountUSD: row.currency === 'THB' ? Number(decimal(row.amount).div(decimal(rate)).toFixed(12)) : Number(row.amount), originalAmount: Number(row.amount), currency: row.currency, rateAtTime: rate || 1, category: row.category || 'Other', date: `${row.date}T12:00:00+07:00`, note: row.note || 'CSV import' });
        if (!saved) throw Error('Import stopped: this record could not be saved. Previously saved rows have been removed from the preview.');
        setImportRows(pending => pending.slice(1));
      }
      setImportRows([]); addToast(text('CSV imported', 'นำเข้า CSV แล้ว'), 'success');
    } catch (error) { addToast(String(error), 'error'); } finally { setImporting(false); }
  }
  const empty = (height = 'h-64') => <div className={`${height} flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center`}><svg width="180" height="35" aria-hidden="true"><path d="M0 27 Q45 5 90 20 T180 10" fill="none" stroke="currentColor" strokeDasharray="3 5" className="text-muted" opacity={.25}/></svg><p className="text-xs text-muted">{text('No activity for this selection yet.', 'ยังไม่มีรายการสำหรับช่วงที่เลือก')}</p><div className="flex gap-2"><button className={control} onClick={() => setShowAdd(true)}>{t('addRecord')}</button><button className={control} onClick={() => input.current?.click()}>Import CSV</button></div></div>;
  const loading = (height = 'h-64') => <Sk.Chart className={height} height=""/>;

  return <div className={`${layout.root} sk-root`} aria-busy={!isDataLoaded} data-skeleton={!isDataLoaded?"cashflow":undefined}>{!isDataLoaded&&<span role="status" className="sr-only">Loading…</span>}
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 py-3 backdrop-blur">
      <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Cash flow toolbar">
        <GlideGroup><div className="flex shrink-0 gap-1">{(['1D','1W','1M','3M','6M','1Y','All'] as const).map(p => <button key={p} onClick={() => { setPeriod(p === '1M' ? 'month' : p); if (p === '1M') setMonth(today.slice(0,7)); }} aria-pressed={period === p || period === 'month' && p === '1M'} className={`relative isolate rounded-lg px-2 py-2 text-xs font-semibold ${period === p || period === 'month' && p === '1M' ? 'text-primary' : 'text-muted'}`}>{(period === p || period === 'month' && p === '1M') && <GlidingIndicator activeKey={p}/>}{p}</button>)}</div></GlideGroup>
        <button className={control} onClick={() => setPeriod('custom')}>{text('Custom', 'กำหนดเอง')}</button>
        <div className="flex shrink-0 items-center rounded-lg border border-border"><button aria-label="Previous month" className="p-2" onClick={() => { setMonth(shiftMonth(month, -1)); setPeriod('month'); }}><ChevronLeft size={14}/></button><span className="w-20 text-center text-xs">{monthLabel}</span><button aria-label="Next month" className="p-2" onClick={() => { setMonth(shiftMonth(month, 1)); setPeriod('month'); }}><ChevronRight size={14}/></button></div>
        <CustomSelect aria-label="Wallet or bucket" className="max-w-40" value={walletId} onChange={setWalletId} items={[{value:'all',label:text('All wallets','ทุกกระเป๋า')},{value:'unassigned',label:text('Unassigned','ไม่ระบุ')},...(result.wallets||[]).map(w=>({value:w.id,label:w.name}))]}/>
        <CustomSelect aria-label="Cash flow view" value={view} onChange={value=>setView(value as View)} items={(['overview','flow','trends','budget'] as View[]).map((v,i)=>({value:v,label:th?['ภาพรวม','การไหล','แนวโน้ม','งบประมาณ'][i]:v[0].toUpperCase()+v.slice(1)}))}/>
        <button className={control} onClick={() => setDisplayCurrency(v => v === 'USD' ? 'THB' : 'USD')}>{displayCurrency} ⇄</button>
        <button className={`${control} p-2`} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} aria-pressed={hidden} onClick={() => setHidden(v => !v)}>{hidden ? <EyeOff size={14}/> : <Eye size={14}/>}</button>
        <button ref={ask} className={`${control} flex items-center gap-1`} onClick={() => setShowAdvisor(true)}><Sparkles size={14}/>{text('Ask', 'ถาม')}</button>
        <button className={control} aria-label="More actions" onClick={() => { const menu = document.getElementById('cashflow-actions') as HTMLDialogElement; menu.showModal(); }}><MoreHorizontal size={16}/></button>
        <button className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground" onClick={() => setShowAdd(true)}><Plus size={14}/>{t('addRecord')}</button>
      </div>
      {period === 'custom' && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><label>{text('From', 'จาก')} <input type="date" className={control} value={from} max={to} onChange={e => setFrom(e.target.value)}/></label><label>{text('To', 'ถึง')} <input type="date" className={control} value={to} min={from} onChange={e => setTo(e.target.value)}/></label></div>}
    </div>
    <RecordSearch value={query} onChange={setQuery} th={th} count={result.summary?.entries.length||0}/>
    <input ref={input} type="file" accept=".csv" className="hidden" onChange={e => readImport(e.target.files?.[0])}/>
    <dialog id="cashflow-actions" className="m-auto rounded-xl border border-border bg-background p-4 text-foreground backdrop:bg-black/40"><form method="dialog"><div className="mb-3 flex items-center justify-between gap-8"><span className="text-sm font-semibold">{text('Cash flow actions', 'จัดการกระแสเงินสด')}</span><button aria-label="Close actions"><X size={16}/></button></div>{[['Import CSV', () => input.current?.click()], ['Export CSV', exportRows], [text('Audit detail', 'ตรวจสอบรายการ'), () => setShowAudit(v => !v)]] .map(([label, action]) => <button key={label as string} onClick={() => (action as () => void)()} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">{label as string}</button>)}</form></dialog>
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs"><p className="text-muted">{periodLabel} · {activePortfolio?.name || text('All portfolios', 'ทุกพอร์ต')}</p><button aria-pressed={includeInvestments} onClick={() => setIncludeInvestments(v => !v)} className={control} style={includeInvestments ? { color: blue, borderColor: blue } : undefined}>{includeInvestments ? text('Include investments', 'รวมการลงทุน') : text('Exclude investments', 'ไม่รวมการลงทุน')}</button></div>
    {(walletId !== 'all' || category) && <button className={control} onClick={() => { setWalletId('all'); setCategory(''); }}>{text('Clear chart filters', 'ล้างตัวกรองกราฟ')} × {category && displayCashflowCategory(category, language)}</button>}
    {result.error ? <div role="alert" className="rounded-xl border border-border p-5"><p>{text('Unable to calculate cash flow.', 'คำนวณกระแสเงินสดไม่ได้')} {result.error}</p><button className={`${control} mt-3`} onClick={() => setRetry(v => v + 1)}>{text('Retry', 'ลองอีกครั้ง')}</button></div> : result.summary && (() => {
      const { summary, previous, monthly, daily, graph, categories, budgets } = result;
      const start = bounds.from || summary.entries.map(e => e.day).sort()[0] || today;
      const last = (bounds.to && bounds.to < today) ? bounds.to : today;
      const elapsed = Math.max(1, Math.floor((Date.parse(last) - Date.parse(start)) / 86400000) + 1);
      const avgIn = ratioMinor(summary.inflowMinor, elapsed), avgOut = ratioMinor(summary.outflowMinor, elapsed);
      const metric = (n: number, signed = false) => !isDataLoaded ? '…' : !summary.hasActivity ? '—' : m(n, signed);
      const monthlyData = monthly.map(row => ({ ...row, label: new Date(`${row.key}-01T12:00:00+07:00`).toLocaleDateString(th ? 'th-TH' : 'en-US', { month: 'short', calendar: 'gregory' }) }));
      const totalsTable: DataRow[] = [
        { label: text('Income', 'รายรับ'), values: [m(summary.incomeMinor)] }, { label: text('Investment proceeds', 'เงินจากการขายลงทุน'), values: [m(summary.proceedsMinor)] },
        { label: text('Inflow subtotal', 'รวมเงินเข้า'), values: [m(summary.inflowMinor)], subtotal: true },
        { label: text('Expenses', 'รายจ่าย'), values: [m(summary.expenseMinor)] }, { label: text('Invested', 'ลงทุน'), values: [m(summary.investedMinor)] },
        { label: text('Outflow subtotal', 'รวมเงินออก'), values: [m(summary.outflowMinor)], subtotal: true },
        { label: summary.netMinor < 0 ? text('Overspent', 'ใช้เกินรายรับ') : text('Saved', 'ออม'), values: [m(summary.netMinor, true)], subtotal: true },
      ];
      const grouped: DataRow[] = [];
      const tableGroups = [
        { title:text('Income / investment proceeds','รายรับ / เงินจากการขายลงทุน'), rows:graph.nodes.filter(n => n.layer===0 && n.kind!=='reconciliation').map(n=>({name:n.name,minor:n.minor})), total:summary.inflowMinor },
        { title:text('Wallets · recorded inflows','กระเป๋า · เงินเข้าที่บันทึก'), rows:result.wallets.map(w=>({name:w.name,minor:summary.entries.filter(e=>e.walletId===w.id && (e.kind==='income'||e.kind==='proceeds')).reduce((s,e)=>s+e.minor,0)})).concat([{name:text('Unassigned wallet','ไม่ระบุกระเป๋า'),minor:summary.entries.filter(e=>e.walletId==='unassigned' && (e.kind==='income'||e.kind==='proceeds')).reduce((s,e)=>s+e.minor,0)}]), total:summary.inflowMinor },
        { title:text('Expenses','รายจ่าย'), rows:graph.nodes.filter(n=>n.kind==='expense').map(n=>({name:n.name,minor:n.minor})), total:summary.expenseMinor },
        { title:text('Invested','ลงทุน'), rows:summary.entries.filter(e=>e.kind==='invested').map(e=>({name:e.record.note||e.record.type,minor:e.minor})), total:summary.investedMinor },
      ];
      for(const group of tableGroups){grouped.push({label:group.title,values:['',''],subtotal:true});group.rows.forEach(row=>grouped.push({label:row.name,values:[m(row.minor),`${(row.minor/Math.max(summary.inflowMinor,1)*100).toFixed(1)}%`]}));grouped.push({label:`${group.title} · ${text('subtotal','รวม')}`,values:[m(group.total),''],subtotal:true});}
      grouped.push(...totalsTable.map(row => ({ ...row, values: [...row.values, ''] })));
      const portfolioValue = assets.reduce((s, asset) => s.add(decimal(asset.valueUSD)), decimal(0));
      const basis = assets.reduce((s, asset) => s.add(decimal(asset.avgCost || 0).mul(decimal(asset.shares || 0))), decimal(0));
      const portfolioReturn = basis.cmp(decimal(0)) > 0 ? Number(portfolioValue.sub(basis).div(basis).mul(decimal(100)).toFixed(2)) : 0;
      const investRatio = summary.incomeMinor ? summary.investedMinor / summary.incomeMinor * 100 : 0;
      const score = Math.min(100, 50 + ((summary.savingsRate || 0) >= 20 ? 15 : (summary.savingsRate || 0) >= 10 ? 8 : 0) + (investRatio >= 15 ? 15 : investRatio >= 5 ? 8 : 0) + (summary.incomeMinor > 0 && summary.expenseMinor <= summary.incomeMinor / 2 ? 10 : 0) + (portfolioReturn >= 10 ? 10 : portfolioReturn >= 0 ? 5 : 0) + (moneyBuckets.length ? 5 : 0) + (assets.some(a => (a.realizedPL || 0) > 0) ? 5 : 0));
      const included = getNetWorthIncludedSources(activePortfolioId, activePortfolio?.kind, netWorthSettings);
      const scopeLabel = `${activePortfolio?.name || text('All portfolios', 'ทุกพอร์ต')} · ${included.assets ? text('assets', 'สินทรัพย์') : text('assets excluded', 'ไม่รวมสินทรัพย์')} · ${included.cash ? text('broker cash', 'เงินสดโบรกเกอร์') : text('cash excluded', 'ไม่รวมเงินสด')} · ${included.buckets ? text('buckets', 'กระเป๋า') : text('buckets excluded', 'ไม่รวมกระเป๋า')} · FX ${exchangeRates.THB || '—'} THB/USD`;
      const worth = netWorthHistory.at(-1)?.value;
      return <>
        {!!summary.missing.length && <p role="status" className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted">{text('Partial data:', 'ข้อมูลบางส่วน:')} {summary.missing.length} {text('rows need a native amount or exchange rate. Available rows are shown; see Audit detail.', 'รายการขาดจำนวนเงินหรืออัตราแลกเปลี่ยน แสดงรายการที่พร้อม ดูรายละเอียดการตรวจสอบ')}</p>}
        <section aria-label="Cash flow metrics" className={layout.metrics}>
          {[
            { name: text('Net cashflow', 'กระแสเงินสดสุทธิ'), value: metric(summary.netMinor, true), change: delta(summary.netMinor, previous.netMinor), data: monthly.map(x => x.netMinor), color: summary.netMinor < 0 ? red : green },
            { name: text('Income', 'รายรับ'), value: metric(summary.incomeMinor), change: delta(summary.incomeMinor, previous.incomeMinor), data: monthly.map(x => x.incomeMinor), color: green },
            { name: text('Expenses', 'รายจ่าย'), value: metric(summary.expenseMinor), change: delta(summary.expenseMinor, previous.expenseMinor), data: monthly.map(x => x.expenseMinor), color: red },
            { name: text('Net invested', 'ลงทุนสุทธิ'), value: metric(summary.netInvestedMinor, true), change: delta(summary.netInvestedMinor, previous.netInvestedMinor), data: monthly.map(x => x.netInvestedMinor), color: blue },
            { name: text('Savings rate', 'อัตราการออม'), value: hidden ? '••••' : summary.savingsRate === null ? '—' : `${summary.savingsRate < 0 ? '' : '+'}${summary.savingsRate.toFixed(1)}%`, change: delta(summary.savingsRate || 0, previous.savingsRate || 0), data: monthly.map(x => x.savingsRate || 0), color: 'var(--color-primary)' },
            { name: text('Daily average in / out', 'เฉลี่ยต่อวัน เข้า / ออก'), value: `${metric(avgIn)} / ${metric(avgOut)}`, change: delta(summary.inflowMinor - summary.outflowMinor, previous.netMinor), data: monthly.map(x => x.netMinor), color: 'var(--color-primary)' },
            { name: text(`Day ${daily.elapsed}/${daily.totalDays} · month pace`, `วันที่ ${daily.elapsed}/${daily.totalDays} · สิ้นเดือน`), value: metric(daily.projectedMinor, true), change: delta(daily.projectedMinor, previous.netMinor), data: monthly.map(x => x.netMinor), color: 'var(--color-primary)' },
          ].map(tile => <article key={tile.name} className="min-w-0 bg-background p-3 sm:p-4"><h2 className="truncate text-[10px] font-medium text-muted" title={tile.name}>{tile.name}</h2><p data-money className="mt-1 break-words text-sm font-semibold tabular-nums" style={{ color: tile.color }}>{!isDataLoaded ? '…' : tile.value}</p><p className="mt-1 text-[10px] text-muted">{!isDataLoaded ? '…' : summary.hasActivity ? tile.change : '—'} {text('vs prior period', 'เทียบช่วงก่อน')}</p><div className="mt-2 h-7">{!isDataLoaded ? <div className="h-full animate-pulse rounded bg-surface-2"/> : <Sparkline values={tile.data} color={tile.color} revision={revision}/>}</div></article>)}
        </section>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="text-xs"><span className="rounded-full border border-border px-3 py-1.5">{text('Net worth', 'มูลค่าสุทธิ')} <b className="ml-2 tabular-nums">{!isDataLoaded ? '…' : hidden ? '••••••' : worth === undefined ? '—' : formatMoney(worth)}</b></span><p className="mt-2 max-w-2xl text-[10px] text-muted">{scopeLabel} · {text('Dashboard valuation currency', 'สกุลเงินตามแดชบอร์ด')}: {currency}</p></div><button className="flex items-center gap-2 text-xs text-muted" title={text('Score starts at 50. Savings: +15 at 20%, +8 at 10%. Investment ratio: +15 at 15%, +8 at 5%. Expenses ≤ half income: +10. Portfolio return: +10 at 10%, +5 if nonnegative. Buckets: +5. Positive realized profit: +5. Capped at 100; selected period and investment toggle apply.', 'เริ่มที่ 50 คะแนน เพิ่มตามการออม การลงทุน การคุมรายจ่าย ผลตอบแทนพอร์ต กระเป๋า และกำไรที่รับรู้ สูงสุด 100 ตามช่วงที่เลือก')}><svg data-chart="ring" viewBox="0 0 40 40" className="h-9 w-9 -rotate-90"><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" opacity={.2} strokeWidth="3"/><circle data-chart-ring cx="20" cy="20" r="16" pathLength="100" fill="none" stroke={green} strokeWidth="3" strokeDasharray={`${isDataLoaded && summary.hasActivity ? score : 0} 100`}/></svg>{text('Financial health', 'สุขภาพการเงิน')} {isDataLoaded && summary.hasActivity ? `${score}/100` : '—'}<CircleHelp size={13}/></button></div>

        {(view === 'overview' || view === 'flow') && <ChartFrame id="cashflow-flow" title={text('Where your money flows', 'เงินของคุณไหลไปที่ไหน')} description="Three layers: income sources, actual wallets, expenses and investments. Exact reconciliation is available in the table." period={periodLabel} headers={[text('Section / item', 'ส่วน / รายการ'), text('Amount', 'จำนวน'), '%']} rows={grouped} hiddenAmounts={hidden} action={graph.smallCategoryCount > 0 ? <button className={control} onClick={() => setExpandedCategories(v => !v)}>{expandedCategories ? text('Collapse Other', 'ย่ออื่น ๆ') : text('Expand Other', 'ขยายอื่น ๆ')}</button> : undefined}>
          {!isDataLoaded ? loading('h-[420px]') : !summary.hasActivity ? empty('h-[420px]') : <FlowChart {...chartProps} graph={graph} onSelect={chooseNode}/>}
          {summary.hasActivity && <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4 text-xs">{[[text('Inflow', 'เงินเข้า'), summary.inflowMinor, green], [text('Outflow', 'เงินออก'), summary.outflowMinor, red], [summary.netMinor < 0 ? text('Overspent', 'ใช้เกินรายรับ') : text('Saved', 'ออม'), summary.netMinor, summary.netMinor < 0 ? red : green]].map(([label, amount, color]) => <div key={String(label)}><p className="text-muted">{label}</p><p className="mt-1 break-all font-semibold tabular-nums" style={{ color: String(color) }}>{m(Number(amount), label === text('Saved', 'ออม') || label === text('Overspent', 'ใช้เกินรายรับ'))}</p></div>)}</div>}
          {graph.reconciliationMinor > 0 && <p className="mt-3 text-[11px] text-muted">{text('Dashed links show opening balances or wallet transfers without paired endpoints. They are excluded from income and the footer. Saved is the period net; wallet attribution of saved money is derived.', 'เส้นประแสดงยอดเดิมหรือเงินโอนที่ไม่มีคู่เชื่อม ไม่รวมในรายรับหรือยอดสรุป การแบ่งเงินออมต่อกระเป๋าเป็นค่าคำนวณ')}</p>}
        </ChartFrame>}

        {(view === 'overview' || view === 'trends') && <>
          <div className={layout.trends}><ChartFrame className="lg:col-span-8" id="cashflow-trends" title={text('Income and expenses · 12 months', 'รายรับและรายจ่าย · 12 เดือน')} description="Monthly paired bars and signed net, with investment cash movements when included" headers={['Month','Income','Expenses','Invested','Proceeds','Net']} rows={monthlyData.map(x => ({ label: x.key, values: [m(x.incomeMinor),m(x.expenseMinor),m(x.investedMinor),m(x.proceedsMinor),m(x.netMinor,true)] }))} period={text('Through ', 'ถึง ') + (bounds.to || today)} hiddenAmounts={hidden}>
            <div className="mb-3 flex flex-wrap gap-3 text-[10px] text-muted">{[['Income',green],['Expenses',red],['Net','var(--color-primary)'],...(includeInvestments ? [['Invested',blue]] : [])].map(([name,color]) => <span key={name}><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }}/>{name}</span>)}</div>{!isDataLoaded ? loading() : !monthly.some(x => x.hasActivity) ? empty() : <MonthlyChart {...chartProps} data={monthlyData} includeInvestments={includeInvestments}/>}
          </ChartFrame><ChartFrame className="lg:col-span-4" title={text('Savings-rate trend', 'แนวโน้มอัตราการออม')} description="Savings rate with a target band centered on 20 percent" headers={['Month','Savings rate','Target']} rows={monthlyData.map(x => ({ label: x.key, values: [hidden ? '•••' : x.savingsRate === null ? '—' : `${x.savingsRate.toFixed(1)}%`, '20%'] }))} period={text('Target 20%', 'เป้าหมาย 20%')} hiddenAmounts={hidden}>{!isDataLoaded ? loading() : !monthly.some(x => x.hasActivity) ? empty() : <SavingsChart {...chartProps} data={monthlyData}/>}</ChartFrame></div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><ChartFrame title={text('Cumulative balance this month', 'ยอดสะสมในเดือนนี้')} description="Running net from zero, with a dashed pace projection; not the account balance" headers={['Date','Net','Projection']} rows={daily.rows.map(x => ({ label: x.day, values: [x.netMinor === null ? '—' : m(x.netMinor,true), x.projectedMinor === null ? '—' : m(x.projectedMinor,true)] }))} period={`${projectionMonth} · ${text('Period net, starting at zero', 'ยอดสุทธิเริ่มจากศูนย์')}`} hiddenAmounts={hidden}>{!isDataLoaded ? loading() : !daily.summary.hasActivity ? empty() : <BalanceChart {...chartProps} data={daily.rows}/>}</ChartFrame>
          <ChartFrame title={text('Daily spending', 'รายจ่ายรายวัน')} description="Monday to Sunday calendar, each cell includes date, expense total and count; select a day to filter" headers={['Date','Count','Expenses']} rows={daily.rows.map(d => ({ label: d.day, values: [d.count,m(d.expenseMinor)] }))} period={projectionMonth} hiddenAmounts={hidden}>
            {!isDataLoaded ? loading() : !daily.summary.hasActivity ? empty() : <ChartReveal label="Spending heatmap" revision={revision}><div className="grid grid-cols-7 gap-1.5">{(th ? ['จ','อ','พ','พฤ','ศ','ส','อา'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).map(d => <span key={d} className="pb-1 text-center text-[10px] text-muted">{d}</span>)}{Array.from({ length: (new Date(`${projectionMonth}-01T12:00:00+07:00`).getDay() + 6) % 7 }, (_, i) => <span key={`pad-${i}`}/>)}{daily.rows.map((d,i) => <button key={d.day} data-chart-cell aria-pressed={bounds.from === d.day && bounds.to === d.day} data-chart-column={(new Date(`${d.day}T12:00:00+07:00`).getDay()+6)%7} onClick={() => { setFrom(d.day); setTo(d.day); setPeriod('custom'); }} title={`${d.day}: ${d.count} · ${m(d.expenseMinor)}`} aria-label={`${d.day}: ${d.count} transactions, ${m(d.expenseMinor)}`} className="aspect-square rounded-md border border-border text-xs focus-visible:outline-2 focus-visible:outline-primary" style={{ background: d.expenseMinor ? `color-mix(in srgb, ${red} ${12 + d.expenseMinor / Math.max(...daily.rows.map(d => d.expenseMinor),1)*55}%, var(--color-background))` : 'var(--color-surface)' }}>{i + 1}</button>)}</div>{bounds.from === bounds.to && daily.rows.some(d => d.day === bounds.from) && <p role="status" className="mt-3 text-xs tabular-nums text-muted">{bounds.from} · {daily.rows.find(d => d.day === bounds.from)?.count} {text("transactions", "รายการ")} · {m(daily.rows.find(d => d.day === bounds.from)?.expenseMinor || 0)}</p>}</ChartReveal>}
          </ChartFrame></div>
        </>}
        {(view === 'overview' || view === 'budget') && <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><ChartFrame id="spending-category" title={text('Spending by category', 'รายจ่ายตามหมวดหมู่')} description="Top seven categories, other, share and signed delta compared with previous period" headers={['Category','Amount','Share','Change']} rows={categories.map(c => ({ label:c.name, values:[m(c.minor),`${c.share.toFixed(1)}%`,m(c.deltaMinor,true)] }))} period={periodLabel} hiddenAmounts={hidden}>{!isDataLoaded ? loading() : !categories.length ? empty() : <CategoryChart {...chartProps} data={categories} onSelect={setCategory}/>}</ChartFrame>
          <ChartFrame title={text('Budget vs actual · Buckets', 'เป้าหมายเทียบยอดใช้ · กระเป๋า')} description="Spending compared with existing bucket targets; these targets are not stored monthly expense budgets" headers={['Bucket','Spent','Target']} rows={budgets.map(b => ({ label:b.name, values:[m(b.actualMinor),b.targetMinor === null ? '—' : m(b.targetMinor)] }))} period={text('Existing bucket targets · pace marker', 'เป้าหมายกระเป๋าที่บันทึก · เส้นแสดงสัดส่วนเวลา')} hiddenAmounts={hidden}>
            {!isDataLoaded ? loading() : !budgets.length ? empty() : <AllocationSurface identity="cashflow-budgets" aria-label="Bucket spending versus existing targets with elapsed-month markers" className="space-y-5">{budgets.map(b => <div key={b.id} tabIndex={0} title={`${b.name}: ${m(b.actualMinor)} / ${b.targetMinor === null ? '—' : m(b.targetMinor)}`}><div className="mb-2 flex justify-between gap-3 text-xs"><span>{b.name}</span><span className="tabular-nums" style={{ color:b.over ? red : undefined }}>{m(b.actualMinor)} / {b.targetMinor === null ? '—' : m(b.targetMinor)} {b.over ? text('· Over target', '· เกินเป้าหมาย') : ''}</span></div><div className="relative h-2 rounded-full bg-surface-2"><div data-allocation-progress className="h-2 origin-left rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ background:b.over ? red : 'var(--color-primary)', width:`${b.targetMinor ? Math.min(100,b.actualMinor/b.targetMinor*100) : 0}%` }}/><span className="absolute -top-1 h-4 w-px bg-foreground/60" style={{ left:`${b.pace*100}%` }}/></div></div>)}</AllocationSurface>}
            <p className="mt-4 text-[10px] text-muted">{text('Uses saved bucket targets. A separate monthly spending budget is not stored.', 'ใช้เป้าหมายกระเป๋าที่บันทึก ยังไม่มีงบใช้จ่ายรายเดือนแยกต่างหาก')}</p>
          </ChartFrame></div>
          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5"><h2 className="text-sm font-semibold">{text('Upcoming and recurring · next 14 days', 'รายการล่วงหน้าและรายการประจำ · 14 วัน')}</h2><p className="mt-3 text-xs text-muted">{!upcoming.supported && text('Recurring schedules and due dates are not stored yet.', 'ยังไม่มีข้อมูลกำหนดการประจำหรือวันครบกำหนด')}</p><p className="mt-3 text-xs">{text('Projected month-end net', 'คาดการณ์สุทธิสิ้นเดือน')}: <b className="tabular-nums">{metric(daily.projectedMinor,true)}</b></p></section>
        </>}
        <details className="rounded-xl border border-border bg-surface p-4"><summary className="cursor-pointer text-xs font-semibold">{text('Insights', 'ข้อมูลเชิงสังเกต')}</summary><div className="mt-3 space-y-2 text-xs text-muted">{categories[0] && <a className="block" href="#spending-category">{categories[0].name}: {m(categories[0].minor)} · {categories[0].share.toFixed(1)}% {text('of expenses', 'ของรายจ่าย')}</a>}{summary.savingsRate !== null && <a className="block" href="#cashflow-trends">{text('Savings rate', 'อัตราการออม')}: {hidden ? '•••' : `${summary.savingsRate.toFixed(1)}%`}</a>}{summary.hasActivity && <a className="block" href="#cashflow-flow">{text('Period net', 'ยอดสุทธิช่วงนี้')}: {m(summary.netMinor,true)}</a>}{!summary.hasActivity && <p>{text('Not enough activity for insights.', 'ยังมีรายการไม่พอสำหรับข้อมูลเชิงสังเกต')}</p>}<p className="pt-2 text-[10px]">{text('Not financial advice.', 'ไม่ใช่คำแนะนำทางการเงิน')}</p></div></details>
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5"><header className="mb-3 flex justify-between"><h2 className="text-sm font-semibold">{text('Recent activity', 'รายการล่าสุด')}</h2><Link href="/ledger" className="text-xs text-primary">{t('viewAllTransactions')}</Link></header>{!isDataLoaded ? loading('h-64') : <DataTable headers={['Date','Category','Note','Type','Original amount']} rows={[...summary.entries].sort((a,b) => b.day.localeCompare(a.day)).slice(0,query?searchCash.length+searchTrades.length:8).map(e => ({ label:e.day, values:[displayCashflowCategory(e.category,language),e.record.note||'—',e.kind,hidden ? '••••••' : formatCashflowMoney(toMinor(e.nativeAmount),e.nativeCurrency)] }))}/ >}{isDataLoaded && !summary.entries.length && <p className="py-5 text-center text-xs text-muted">{text('No transactions in this selection.', 'ไม่มีรายการตามตัวกรองนี้')}</p>}</section>
        {showAudit && <section className="rounded-2xl border border-border p-4"><header className="flex items-center justify-between"><h2 className="text-sm font-semibold">{text('Audit detail', 'รายละเอียดตรวจสอบ')}</h2><button onClick={() => setShowAudit(false)} aria-label="Close audit"><X size={16}/></button></header><p className="my-3 text-xs text-muted">{text('Corrected amounts use native money and stored rates. Legacy amounts reproduce USD-cent rounding followed by the current display rate. Transfer rows are visible but excluded from income and expenses.', 'ยอดแก้ไขใช้เงินต้นฉบับและเรทที่บันทึก ยอดเดิมจำลองการปัด USD แล้วแปลงเรทปัจจุบัน เงินโอนไม่รวมรายรับรายจ่าย')}</p><DataTable headers={['Entry / date','Category','Basis','Rate','Corrected','Legacy','Δ']} rows={summary.entries.map(e => ({ label:`${e.id} · ${e.day}`, values:[e.category,e.kind === 'transfer' ? 'transfer excluded' : e.basis,e.rate ?? '—',m(e.minor),e.legacyMinor === null ? '—' : m(e.legacyMinor),e.legacyMinor === null ? '—' : m(e.minor-e.legacyMinor,true)] }))}/>{summary.missing.map(e => <p key={e.id} className="mt-2 text-xs text-muted">{e.id}: {e.reason}</p>)}</section>}
      </>;
    })()}
    <AddCashflowModal isOpen={showAdd} onClose={() => setShowAdd(false)}/>
    {importRows.length > 0 && <div className="fixed inset-0 z-[85] grid place-items-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-label="Review CSV import" className="w-full max-w-lg rounded-xl border border-border bg-background p-5"><h2 className="text-sm font-semibold">{text('Review CSV import', 'ตรวจสอบก่อนนำเข้า')} · {importRows.length} {text('rows', 'รายการ')}</h2><DataTable headers={['Date','Type','Native amount']} rows={importRows.map(r => ({ label:r.date,values:[r.type,formatCashflowMoney(toMinor(r.amount),r.currency)] }))}/><div className="mt-4 flex justify-end gap-2"><button className={control} disabled={importing} onClick={() => setImportRows([])}>{text('Cancel','ยกเลิก')}</button><button className={control} disabled={importing} onClick={commitImport}>{importing ? '…' : text('Import records','นำเข้ารายการ')}</button></div></section></div>}
    {showAdvisor && <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onClick={() => setShowAdvisor(false)}><div ref={drawer} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Financial advisor" className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-background p-4 shadow-2xl" onClick={e => e.stopPropagation()}><header className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">{text('Financial advisor','ที่ปรึกษาการเงิน')}</h2><button className={control} aria-label="Close advisor" onClick={() => setShowAdvisor(false)}><X size={16}/></button></header><Advisor compactPrompts/></div></div>}
  </div>;
}
