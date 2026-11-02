"use client";

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownUp, Loader2 } from 'lucide-react';
import { useApp } from '@/src/context/AppContext';
import { Modal } from './Modal';
import { CustomSelect } from './CustomSelect';
import { quoteInvestmentTransfer } from '@/src/lib/investment-transfer';
import { bucketTransferRows, canTransfer, type TransferWallet } from '@/src/lib/ledger-transfer';

export function LedgerTransferModal({ initialWalletId, onClose, onSaved }: {
  initialWalletId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { language, moneyBuckets, allBrokerageAccounts, brokerageCashBalances, portfolios, activePortfolioId,
    exchangeRates, addCashActivities, transferBucketToBroker, transferBrokerToBucket, addToast } = useApp();
  const text = (en: string, th: string) => language === 'th' ? th : en;
  const wallets = useMemo<TransferWallet[]>(() => {
    const result: TransferWallet[] = [];
    for (const bucket of moneyBuckets) {
      if (bucket.currency !== 'USD' && bucket.currency !== 'THB') continue;
      result.push({ id: bucket.id, recordId: bucket.id, kind: 'bucket', name: bucket.name,
        currency: bucket.currency, balance: bucket.currentAmount });
    }
    // Keep distinct accounts, including multiple accounts in the same currency.
    for (const account of allBrokerageAccounts) {
      if (account.kind !== 'cash' || (account.currency !== 'USD' && account.currency !== 'THB')) continue;
      const portfolio = portfolios.find(p => p.id === account.portfolioId);
      result.push({ id: `broker:${account.id}`, recordId: account.id, kind: 'broker',
        name: `${portfolio?.name || ''} · ${account.name}`, currency: account.currency,
        balance: brokerageCashBalances.find(b => b.accountId === account.id)?.balance ?? NaN });
    }
    return result;
  }, [moneyBuckets, allBrokerageAccounts, brokerageCashBalances, portfolios]);
  const initialSource = wallets.find(w => w.id === initialWalletId)
    || wallets.find(w => w.kind === 'broker' && allBrokerageAccounts.find(a => a.id === w.recordId)?.portfolioId === activePortfolioId)
    || wallets[0];
  const [sourceId, setSourceId] = useState(initialSource?.id || '');
  const [destinationId, setDestinationId] = useState('');
  const [amount, setAmount] = useState('');
  const [received, setReceived] = useState('');
  const [fee, setFee] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const requestRef = useRef<{ key: string; id: string } | null>(null);
  const source = wallets.find(w => w.id === sourceId);
  const destinations = source ? wallets.filter(w => canTransfer(source, w)) : [];
  const destination = destinations.find(w => w.id === destinationId);
  const exchange = !!source && !!destination && source.currency !== destination.currency;
  const supportsFee = source?.kind === 'bucket' && destination?.kind === 'broker';
  const quote = source && destination ? quoteInvestmentTransfer({
    sourceCurrency: source.currency, destinationCurrency: destination.currency,
    sourceAmount: Number(amount), fee: supportsFee ? Number(fee) : 0,
    mode: 'received', receivedAmount: Number(received), rate: exchangeRates.THB,
  }) : null;
  const insufficient = !!source && Number(amount) > source.balance;
  const valid = !!source && !!destination && !!quote && Number.isFinite(source.balance) && !insufficient
    && Number.isFinite(exchangeRates.THB) && exchangeRates.THB > 0;
  const fmt = (value: number, currency: string) => `${value.toLocaleString(language === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const chooseSource = (id: string) => { setSourceId(id); setDestinationId(''); setAmount(''); setReceived(''); setFee(''); };
  const close = () => { if (!savingRef.current) onClose(); };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !source || !destination || !quote || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const key = JSON.stringify([source.id, destination.id, quote]);
    if (requestRef.current?.key !== key) requestRef.current = { key, id: crypto.randomUUID() };
    try {
      let saved: boolean;
      if (source.kind === 'bucket' && destination.kind === 'bucket') {
        saved = !!await addCashActivities(bucketTransferRows(source, destination, quote.sourceAmount, exchangeRates.THB, new Date().toISOString()), 'transfer');
        if (saved) addToast(text('Transfer recorded', 'บันทึกการโอนแล้ว'), 'success');
      } else if (source.kind === 'bucket') {
        saved = await transferBucketToBroker({ id: requestRef.current.id, bucketId: source.recordId, accountId: destination.recordId,
          sourceAmount: quote.sourceAmount, receivedAmount: quote.receivedAmount, fee: quote.fee, thbPerUsd: quote.rate || exchangeRates.THB });
      } else {
        saved = await transferBrokerToBucket(requestRef.current.id, source.recordId, destination.recordId, quote.sourceAmount, quote.rate || exchangeRates.THB);
      }
      if (saved) onSaved();
    } catch {
      addToast(text('Could not confirm this transfer. Retry with the same details.', 'ยังยืนยันผลการโอนไม่ได้ กรุณาลองใหม่ด้วยข้อมูลเดิม'), 'error');
    } finally { savingRef.current = false; setSaving(false); }
  }
  return <Modal isOpen onClose={close} title={text('Transfer money', 'โอนเงิน')} contentClassName="p-5 sm:p-6" footer={
    <div className="flex gap-3">
      <button type="button" className="ledger-control" disabled={saving} onClick={close}>{text('Cancel', 'ยกเลิก')}</button>
      <button type="submit" form="ledger-transfer-form" className="ledger-control primary flex-1" disabled={saving || !valid}>
        {saving ? <Loader2 size={16} className="animate-spin"/> : <ArrowDownUp size={16}/>}{saving ? text('Saving…', 'กำลังบันทึก…') : text('Record transfer', 'บันทึกการโอน')}
      </button>
    </div>
  }>
    <form id="ledger-transfer-form" onSubmit={submit} className="space-y-5">
      <p className="text-sm text-muted">{text('Record transfers between Buckets, or between a Bucket and brokerage cash. This does not send money through your bank.', 'บันทึกการโอนระหว่าง Bucket หรือระหว่าง Bucket กับเงินสดในพอร์ต โดยไม่มีการส่งคำสั่งโอนไปยังธนาคาร')}</p>
      <div>
        <label htmlFor="transfer-source" className="mb-2 block text-sm font-medium">{text('From', 'ต้นทาง')}</label>
        <CustomSelect id="transfer-source" disabled={saving} value={sourceId} onChange={chooseSource} items={wallets.map(w => ({ value: w.id, label: `${w.name} · ${w.currency}`, disabled: !Number.isFinite(w.balance) }))}/>
        {source && <p className="mt-2 text-xs text-muted">{text('Available', 'ยอดคงเหลือ')}: {Number.isFinite(source.balance) ? fmt(source.balance, source.currency) : text('Balance unavailable', 'ยังตรวจสอบยอดไม่ได้')}</p>}
      </div>
      <div>
        <label htmlFor="transfer-destination" className="mb-2 block text-sm font-medium">{text('To', 'ปลายทาง')}</label>
        <CustomSelect id="transfer-destination" disabled={saving} value={destinationId} onChange={id => { setDestinationId(id); setReceived(''); setFee(''); }} placeholder={text('Choose a destination', 'เลือกปลายทาง')} items={destinations.map(w => ({ value: w.id, label: `${w.name} · ${w.currency}` }))}/>
        {!destinations.length && <p className="mt-2 text-sm text-muted">{text('No compatible destination. Add a Bucket to record a transfer.', 'ยังไม่มีปลายทางที่รองรับ เพิ่ม Bucket เพื่อบันทึกการโอน')} <Link href="/budget" className="text-primary underline underline-offset-4">{text('Manage Buckets', 'จัดการ Bucket')}</Link></p>}
      </div>
      <label className="block text-sm font-medium">{text('Amount debited', 'ยอดหักจากต้นทาง')} {source?.currency}
        <input autoComplete="off" required disabled={saving} type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="ledger-input mt-2 tabular-nums"/>
      </label>
      {supportsFee && <label className="block text-sm font-medium">{text('Fee included in debit', 'ค่าธรรมเนียมที่รวมในยอดหัก')} {source?.currency}
        <input disabled={saving} type="number" inputMode="decimal" min="0" step="0.01" value={fee} placeholder="0.00" onChange={e => setFee(e.target.value)} className="ledger-input mt-2 tabular-nums"/>
      </label>}
      {exchange && <label className="block text-sm font-medium">{text('Actual amount received', 'ยอดรับจริงที่ปลายทาง')} {destination?.currency}
        <input required disabled={saving} type="number" inputMode="decimal" min="0.01" step="0.01" value={received} onChange={e => setReceived(e.target.value)} className="ledger-input mt-2 tabular-nums"/>
      </label>}
      {insufficient && <p role="alert" className="text-sm text-loss">{text('Insufficient balance in the source wallet.', 'ยอดเงินต้นทางไม่เพียงพอ')}</p>}
      {quote && destination && <div className="border-t border-border pt-4 text-sm" aria-live="polite">
        <div className="flex flex-wrap justify-between gap-2"><span>{text('Destination receives', 'ปลายทางได้รับ')}</span><strong className="tabular-nums">{fmt(quote.receivedAmount, destination.currency)}</strong></div>
        {quote.rate && <p className="mt-2 text-xs text-muted">1 USD = {quote.rate.toLocaleString('en-US', { maximumFractionDigits: 6 })} THB</p>}
      </div>}
    </form>
  </Modal>;
}
