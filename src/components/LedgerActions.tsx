"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from '@/src/context/AppContext';
import type { LedgerRow } from '@/src/lib/ledger-selectors';

type Actions = { pending: string[]; busy: boolean; schedule: (rows: LedgerRow[]) => void; notify: (text: string) => void };
const Context = createContext<Actions>({ pending: [], busy: false, schedule: () => {}, notify: () => {} });
export const useLedgerActions = () => useContext(Context);
export function LedgerActions({ children }: { children: React.ReactNode }) {
  const app = useApp(), latest = useRef(app); latest.current = app;
  const [pending, setPending] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [show, setShow] = useState(false), [undoable, setUndoable] = useState(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = useCallback(() => { clearTimeout(commitTimer.current); commitTimer.current = undefined; setPending([]); setUndoable(false); setBusy(false); }, []);
  const notify = useCallback((text: string) => { clearTimeout(toastTimer.current); setMessage(text); setShow(true); toastTimer.current = setTimeout(() => setShow(false), 5000); }, []);
  useEffect(() => { cancel(); setShow(false); }, [app.activePortfolioId, cancel]);
  useEffect(() => () => { clearTimeout(commitTimer.current); clearTimeout(toastTimer.current); }, []);
  function schedule(rows: LedgerRow[]) {
    if (busy || !rows.length) return;
    setBusy(true); setUndoable(true); setPending(rows.map(r => r.id));
    notify(app.t('ledgerDeleted').replace('{n}', String(rows.length)));
    const portfolio = app.activePortfolioId;
    commitTimer.current = setTimeout(async () => {
      setUndoable(false); clearTimeout(toastTimer.current); setShow(false);
      try {
        for (const row of rows) {
          if (latest.current.activePortfolioId !== portfolio) break;
          // Resolve the latest action after each render so wallet reversals do not
          // repeatedly use the same pre-delete balance. Existing guards stay intact.
          if (row.source === 'cash') await latest.current.removeCashActivity(String(row.record.id));
          else if (row.source === 'trade') await latest.current.removeTrade(Number(row.record.id));
          else await latest.current.deleteBrokerCashMovement(String(row.record.id));
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        const remaining = rows.some(row => row.source === 'cash' ? latest.current.cashActivities.some(r => String(r.id) === String(row.record.id)) : row.source === 'trade' ? latest.current.trades.some(r => String(r.id) === String(row.record.id)) : latest.current.brokerageCashEntries.some(r => r.id === row.record.id));
        if (remaining && latest.current.activePortfolioId === portfolio) notify(latest.current.t('ledgerDeleteFailed'));
      } catch { notify(latest.current.t('ledgerDeleteFailed')); }
      finally { setPending([]); setBusy(false); }
    }, 5000);
  }
  return <Context.Provider value={{ pending, busy, schedule, notify }}>{children}
    <div className={`ledger-toast ${show ? 'show' : ''}`} inert={!show} role="status" aria-live="polite"><span>{message}</span>{undoable && <button className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground font-semibold" onClick={() => { cancel(); notify(app.t('ledgerRestored')); }}>{app.t('ledgerUndo')}</button>}</div>
  </Context.Provider>;
}
