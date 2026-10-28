"use client";
// แก้ layout หน้านี้ ต้องแก้ HistorySkeleton ด้วย
import { useLoadingGate } from '@/src/hooks/useLoadingGate';
import { MemoryResource } from '@/src/lib/memory-resource';
import { Sk } from '@/src/components/skeleton';
import { layout } from './skeleton-layout';

import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Loader2, ScrollText } from "lucide-react";
import { useApp } from "@/src/context/AppContext";
import { db, HistoryEvent, supabase } from "@/src/lib/supabase";
import { cn } from "@/src/lib/utils";
import { decimal, formatMoney as formatFxMoney, formatHistoricalStock } from '@/src/lib/fx';

const historyCache = new MemoryResource<HistoryEvent[]>();
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const dateKey = (date: Date) => date.toLocaleDateString("en-CA");
const number = (value: number | string | null | undefined) => Number(value || 0);

function eventTone(event: HistoryEvent) {
  if (event.action !== "CREATED") return "text-amber-300 bg-amber-400/10";
  if (["BUY", "COVER", "IMPORT", "EXPENSE", "WITHDRAW", "withdraw", "invest"].includes(event.transaction_type)) return "text-red-300 bg-red-400/10";
  return "text-emerald-300 bg-emerald-400/10";
}

export default function HistoryView({loading:forceLoading=false}:{loading?:boolean}) {
  const { activePortfolioId } = useApp();
  // History amounts are recorded USD; never use the global display-currency rate.
  const formatMoney = (amount: number) => formatFxMoney(decimal(amount), 'USD');
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [fetching, setLoading] = useState(true);
  const gatedLoading = useLoadingGate(fetching && events.length === 0);
  const loading=forceLoading||gatedLoading;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if(forceLoading)return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data: sessionData, error: userError } = await supabase.auth.getSession();
      const userData = {user: sessionData.session?.user};
      if (userError || !userData.user) {
        if (!cancelled) { setEvents([]); setError("Sign in to view your immutable financial history."); setLoading(false); }
        return;
      }
      const userId = userData.user.id;
      const start = monthStart(month);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const key = JSON.stringify([userId, activePortfolioId, start.toISOString()]);
      const cached = historyCache.peek(key);
      if (cached && !cancelled) setEvents(cached);
      const {data, error:loadError} = await historyCache.read(key, async () => {
        const result = await db.history.getPage(userId, activePortfolioId, start.toISOString(), end.toISOString());
        if (result.error) throw result.error;
        return (result.data || []) as HistoryEvent[];
      }).then(data=>({data,error:null})).catch(error=>({data:null,error}));
      if (cancelled) return;
      if (loadError) { setEvents([]); setError("History is unavailable until the history ledger migration has been applied."); }
      else setEvents((data || []) as HistoryEvent[]);
      setLoading(false);
    };
    void load().catch(() => { if (!cancelled) {setError('History could not be loaded.');setLoading(false);} });
    const invalidate = () => { historyCache.invalidate(); void load().catch(()=>{if(!cancelled){setError('History could not be loaded.');setLoading(false);}}); };
    window.addEventListener('fintrack:financial-change', invalidate);
    return () => { cancelled = true; window.removeEventListener('fintrack:financial-change', invalidate); };
  }, [activePortfolioId, month, forceLoading]);

  const eventsByDay = useMemo(() => {
    const result = new Map<string, HistoryEvent[]>();
    events.forEach(event => {
      const key = dateKey(new Date(event.occurred_at));
      result.set(key, [...(result.get(key) || []), event]);
    });
    return result;
  }, [events]);
  const visibleEvents = useMemo(() => {
    const current = selectedDay ? eventsByDay.get(selectedDay) || [] : events;
    return [...current].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }, [events, eventsByDay, selectedDay]);
  const summary = useMemo(() => {
    const created = events.filter(event => event.action === "CREATED");
    return {
      entries: events.length,
      trades: created.filter(event => event.source_table === "trades").length,
      netFlow: created.reduce((total, event) => total + number(event.net_amount), 0),
      realized: created.reduce((total, event) => total + number(event.realized_pnl), 0),
    };
  }, [events]);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingCells = (month.getDay() + 6) % 7;
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return <div className={`${layout.root} sk-root`} aria-busy={loading || fetching} data-refreshing={fetching && events.length > 0 || undefined} data-skeleton={loading?"history":undefined}>{loading&&<span role="status" className="sr-only">Loading…</span>}
    <div><h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><ScrollText className="text-primary" size={23} /></span>Trade History</h1><p className="text-sm text-muted-foreground mt-1">Append-only ledger of trade executions and corrections.</p></div>
    <div className={layout.grid}>
      <section className="space-y-5">
        <div className="bg-surface/50 border border-border rounded-2xl p-5 backdrop-blur-xl">
          <div className="flex justify-between items-center mb-5"><h2 className="font-semibold text-white">{monthLabel}</h2><div className="flex gap-1"><button aria-label="Previous month" onClick={() => { setMonth(value => new Date(value.getFullYear(), value.getMonth() - 1, 1)); setSelectedDay(null); }} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground"><ChevronLeft size={18} /></button><button aria-label="Next month" onClick={() => { setMonth(value => new Date(value.getFullYear(), value.getMonth() + 1, 1)); setSelectedDay(null); }} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground"><ChevronRight size={18} /></button></div></div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-2">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(day => <span key={day}>{day}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">{Array.from({ length: leadingCells }).map((_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => {
            const date = new Date(month.getFullYear(), month.getMonth(), index + 1); const key = dateKey(date); const items = eventsByDay.get(key) || []; const dayNet = items.filter(event => event.action === "CREATED").reduce((total, event) => total + number(event.net_amount), 0);
            return <button key={key} onClick={() => setSelectedDay(key === selectedDay ? null : key)} className={cn("aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-colors", selectedDay === key ? "ring-2 ring-primary bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground", items.length > 0 && "text-white")}><span>{index + 1}</span>{items.length > 0 && <span className={cn("text-[9px] font-bold", dayNet >= 0 ? "text-emerald-300" : "text-red-300")}>{dayNet >= 0 ? "+" : ""}{Math.round(dayNet)}</span>}</button>;
          })}</div>
        </div>
        <div className="bg-surface/50 border border-border rounded-2xl p-5 space-y-3 text-sm"><h2 className="font-semibold text-white">Monthly trade summary</h2><Summary label="Ledger events" value={loading?<Sk.Line width={40}/>:String(summary.entries)} /><Summary label="Trade executions" value={loading?<Sk.Line width={40}/>:String(summary.trades)} /><Summary label="Net trade cash flow" value={loading?<Sk.Line width={80}/>:formatMoney(summary.netFlow)} tone={summary.netFlow >= 0 ? "good" : "bad"} /><Summary label="Stored realized P&L" value={loading?<Sk.Line width={80}/>:formatMoney(summary.realized)} tone={summary.realized >= 0 ? "good" : "bad"} /></div>
      </section>
      <section className="lg:col-span-2 bg-surface/50 border border-border rounded-2xl backdrop-blur-xl overflow-hidden min-h-[420px]">
        <div className="p-5 border-b border-border flex items-center justify-between"><div><h2 className="font-semibold text-white">{selectedDay ? new Date(`${selectedDay}T00:00:00`).toLocaleDateString() : "All events"}</h2><p className="text-xs text-muted-foreground mt-1">Events cannot be altered; corrections are recorded as new audit entries.</p></div></div>
        {loading ? <div>{[0,1,2,3].map(i=><Sk.Row key={i} index={i} className="flex items-center gap-3 border-b border-border p-4 sm:p-5"/>)}</div> : error ? <div className="p-10 text-center text-muted-foreground"><CircleAlert className="mx-auto mb-3 text-amber-300" /><p>{error}</p></div> : !loading && visibleEvents.length === 0 ? <div className="p-12 text-center text-muted-foreground"><CalendarDays className="mx-auto mb-3" /><p>No history events for this period.</p></div> : <div className="divide-y divide-border">{visibleEvents.map(event => <article key={event.id} className="p-4 sm:p-5 flex gap-3 hover:bg-white/[0.02]"><span className={cn("mt-0.5 px-2 py-1 h-fit rounded text-[10px] font-bold uppercase", eventTone(event))}>{event.action === "CREATED" ? event.transaction_type : event.action}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="font-medium text-white truncate">{event.asset_symbol || event.category || event.transaction_type}</p><p className={cn("font-semibold tabular-nums whitespace-nowrap", number(event.net_amount) >= 0 ? "text-emerald-300" : "text-red-300")}>{number(event.net_amount) >= 0 ? "+" : ""}{formatHistoricalStock(number(event.net_amount), event.asset_symbol, event.exchange_rate)}</p></div><p className="text-xs text-muted-foreground mt-1">{new Date(event.occurred_at).toLocaleString()} · {event.source_table.replace("_", " ")}{event.quantity ? ` · ${number(event.quantity)} units @ ${formatHistoricalStock(number(event.price), event.asset_symbol, event.exchange_rate)}` : ""}{number(event.fees) ? ` · fees ${formatHistoricalStock(number(event.fees), event.asset_symbol, event.exchange_rate)}` : ""}</p>{event.note && <p className="text-xs text-muted-foreground mt-1 truncate">{event.note}</p>}</div></article>)}</div>}
      </section>
    </div>
  </div>;
}

function Summary({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "bad" }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span data-loading-data className={cn("font-semibold tabular-nums", tone === "good" && "text-emerald-300", tone === "bad" && "text-red-300", !tone && "text-white")}>{value}</span></div>;
}
