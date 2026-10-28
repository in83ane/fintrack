"use client";

import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, Eye } from "lucide-react";
import { useApp } from "@/src/context/AppContext";
import { Modal } from "@/src/components/Modal";
import { CustomSelect } from "@/src/components/CustomSelect";
import { cn } from "@/src/lib/utils";
import { PRICE_ALERT_EVENT, parsePriceAlerts } from '@/src/lib/price-alerts';
import { supabase } from '@/src/lib/supabase';
import { usePriceEmailAlerts } from '@/src/hooks/usePriceEmailAlerts';
export type { PriceAlert } from '@/src/lib/price-alerts';

const LEGACY_KEY = 'fintrack-price-alerts';
export function PriceAlertManager() {
  const app = useApp();
  const { language, currency, assets, addNotification, addToast, moneyBuckets, isDataLoaded, userProfile } = app;
  const th = language === 'th';
  const [isModalOpen, setIsModalOpen] = useState(false);
  const emailAlerts = usePriceEmailAlerts(isModalOpen, userProfile?.email);
  const [emailError, setEmailError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAlert, setNewAlert] = useState({ symbol: '', targetPrice: '', direction: 'below' as 'above' | 'below', note: '', currency: currency === 'THB' ? 'THB' : 'USD' });
  const storageKey = userProfile?.email ? `${LEGACY_KEY}:${encodeURIComponent(userProfile.email)}` : '';
  const current = useRef({ app, storageKey });
  current.current = { app, storageKey };
  const notifiedBucketsRef = useRef(new Set<string>());
  const priceText = (value: number, code = 'USD') => new Intl.NumberFormat(th ? 'th-TH' : 'en-US', { style: 'currency', currency: code, maximumFractionDigits: 4 }).format(value);

  // Preserve the existing bucket-goal notifications.
  useEffect(() => {
    if(!storageKey||!isDataLoaded)return;
    moneyBuckets.forEach(bucket => {
      const goalKey=`${storageKey}:goal:${bucket.id}:${bucket.targetAmount}`;
      try{if(localStorage.getItem(goalKey))return;}catch{/* memory fallback */}
      if (bucket.targetAmount && bucket.currentAmount >= bucket.targetAmount && !notifiedBucketsRef.current.has(bucket.id)) {
        notifiedBucketsRef.current.add(bucket.id);
        try{localStorage.setItem(goalKey,'1');}catch{/* memory fallback */}
        addNotification(`${th ? 'ถึงเป้าแล้ว!' : 'Goal reached!'}: ${bucket.name}`, `${bucket.name}: ${app.formatMoney(bucket.targetAmount)}`, 'system');
      }
    });
  }, [moneyBuckets, addNotification, th, app.formatMoney, storageKey, isDataLoaded]);

  useEffect(() => {
    const open=()=>{setNewAlert(a=>({...a,currency:current.current.app.currency==='THB'?'THB':'USD'}));setEmailError(false);setIsModalOpen(true);};
    window.addEventListener(PRICE_ALERT_EVENT,open);
    return()=>window.removeEventListener(PRICE_ALERT_EVENT,open);
  },[]);

  // Move existing device alerts to account monitoring. A stable source key makes retries safe.
  useEffect(()=>{
    if(!storageKey||!isDataLoaded)return;
    let stopped=false;
    const migrate=async()=>{
      const work=async()=>{
        const old=parsePriceAlerts(localStorage.getItem(storageKey));
        for(const alert of old.filter(a=>a.isActive)) {
          if(stopped)return;
          const {error}=await supabase.from('price_email_alerts').insert({symbol:alert.symbol.toUpperCase(),target_price:alert.targetPrice,currency:alert.currency||'USD',direction:alert.direction,note:alert.note||'',locale:language,source_key:`device:${alert.id}`});
          if(error&&error.code!=='23505'){setEmailError(true);break;}
          localStorage.setItem(storageKey,JSON.stringify(parsePriceAlerts(localStorage.getItem(storageKey)).filter(a=>a.id!==alert.id)));
        }
      };
      try {if(navigator.locks)await navigator.locks.request(storageKey,work);else await work();}catch{setEmailError(true);}
    };
    void migrate();return()=>{stopped=true;};
  },[storageKey,isDataLoaded,language]);

  const validTarget = Number.isFinite(Number(newAlert.targetPrice)) && Number(newAlert.targetPrice) > 0 && Number(newAlert.targetPrice) < 1e12;
  const validSymbol = /^[A-Z0-9.^=/-]{1,32}$/i.test(newAlert.symbol.trim());
  async function handleAddAlert() {
    if (saving || !validSymbol || !validTarget || !storageKey) return;
    setSaving(true);
    const symbol = newAlert.symbol.trim().toUpperCase();
    try {
      setEmailError(false);
      await emailAlerts.create({symbol,targetPrice:Number(newAlert.targetPrice),currency:newAlert.currency,direction:newAlert.direction,note:newAlert.note.trim(),locale:language});
      setNewAlert(a=>({...a,symbol:'',targetPrice:'',note:''}));
      addToast(th?'บันทึกแล้ว แจ้งเตือนจะเก็บไว้ในบัญชีแม้ปิดเว็บ':'Saved. Alerts will be kept in your account, even while the app is closed.','success');
    }catch{setEmailError(true);}finally{setSaving(false);}
  }
  return (
    <>
      {/* Alert Manager Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={language === "th" ? "แจ้งเตือนราคา" : "Price Alerts"}>
        <div className="w-full max-w-lg space-y-6">
          <div className="space-y-2 text-xs text-muted">
            <p>{th?'ตรวจราคาบนเซิร์ฟเวอร์ประมาณทุก 1 นาที แม้ปิดเว็บ ราคาตลาดอาจล่าช้า':'Prices are checked on the server about every minute, even with the app closed. Market quotes may be delayed.'}</p>
            <p>{th?'เมื่อถึงเป้า จะแจ้งครั้งเดียวและเก็บในกระดิ่งจนกว่าจะอ่าน ประวัติไม่ถูกลบอัตโนมัติ ไม่มีการส่งอีเมล':'Each target fires once. Unread alerts wait in the bell; history is retained. No email is sent.'}</p>
            {(!emailAlerts.status?.ready||emailAlerts.error)&&<button onClick={()=>void emailAlerts.refresh()} className="text-warning underline">{th?'กำลังตรวจระบบเบื้องหลัง / กดลองอีกครั้ง':'Checking background monitoring / Retry'}</button>}
          </div>

          {/* Add New Alert */}
          <div className="bg-background rounded-2xl p-4 border border-border space-y-3">
            <span className="text-xs font-bold text-info uppercase tracking-wide">
              {language === "th" ? "เพิ่มการแจ้งเตือนใหม่" : "New Alert"}
            </span>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-muted">{th ? 'หุ้น / สัญลักษณ์' : 'Stock / symbol'}
              <input
                list="price-alert-holdings"
                type="text"
                placeholder={language === "th" ? "เช่น AAPL" : "e.g. AAPL"}
                value={newAlert.symbol}
                onChange={(e) => setNewAlert({ ...newAlert, symbol: e.target.value })}
                className="w-full bg-foreground/5 rounded-xl px-3 py-2.5 text-sm text-foreground border border-border  outline-none"
              />
              <datalist id="price-alert-holdings">{[...new Set(assets.map(a => a.symbol))].map(symbol => <option key={symbol} value={symbol}/>)}</datalist>
              </label>
              <label className="space-y-1 text-xs text-muted">{th ? 'ราคาเป้าหมาย' : 'Target price'}
              <input min="0" step="any"
                type="number"
                placeholder={language === "th" ? "ราคาเป้าหมาย" : "Target Price"}
                value={newAlert.targetPrice}
                onChange={(e) => setNewAlert({ ...newAlert, targetPrice: e.target.value })}
                className="w-full bg-foreground/5 rounded-xl px-3 py-2.5 text-sm text-foreground border border-border  outline-none"
              />
              </label>
            </div>
            <label className="block space-y-1 text-xs text-muted">{th ? 'สกุลเงินของราคาเป้าหมาย' : 'Target currency'}
              <CustomSelect aria-label={th ? 'สกุลเงินของราคาเป้าหมาย' : 'Target currency'} value={newAlert.currency} onChange={value => setNewAlert(a => ({ ...a, currency: value }))} items={['USD', 'THB'].map(code => ({ value: code, label: code }))}/>
            </label>
            <div className="flex gap-2">
              <button aria-pressed={newAlert.direction === 'below'}
                onClick={() => setNewAlert({ ...newAlert, direction: "below" })}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border",
                  newAlert.direction === "below"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-foreground/5 text-muted border-border"
                )}
              >
                <TrendingDown size={14} /> {language === "th" ? "ราคาลงถึง (≤)" : "At or below (≤)"}
              </button>
              <button aria-pressed={newAlert.direction === 'above'}
                onClick={() => setNewAlert({ ...newAlert, direction: "above" })}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border",
                  newAlert.direction === "above"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-foreground/5 text-muted border-border"
                )}
              >
                <TrendingUp size={14} /> {language === "th" ? "ราคาขึ้นถึง (≥)" : "At or above (≥)"}
              </button>
            </div>
            <input maxLength={240}
              type="text"
              placeholder={language === "th" ? "หมายเหตุ (ไม่บังคับ)" : "Note (optional)"}
              value={newAlert.note}
              onChange={(e) => setNewAlert({ ...newAlert, note: e.target.value })}
              className="w-full bg-foreground/5 rounded-xl px-3 py-2.5 text-sm text-foreground border border-border  outline-none"
            />
            {emailError && <p role="alert" className="text-xs text-loss">{th ? 'บันทึกไม่สำเร็จ ตรวจการเชื่อมต่อ (ติดตามพร้อมกันได้สูงสุด 20 รายการ)' : 'Could not save alert. Check the connection or the limit of 20 active alerts.'}</p>}
            <button
              onClick={handleAddAlert}
              disabled={(!emailAlerts.status?.ready) || saving || !validSymbol || !validTarget || !storageKey}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-xs hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Plus size={14} /> {language === "th" ? "เพิ่มการแจ้งเตือน" : "Add Alert"}
            </button>
          </div>

          {emailAlerts.alerts.length > 0 && <section className="space-y-2" aria-label={th ? 'รายการแจ้งเตือน' : 'Saved alerts'}>
            <h3 className="text-xs font-bold text-foreground">{th ? 'รายการแจ้งเตือน' : 'Alerts'} ({emailAlerts.alerts.length})</h3>
            {emailAlerts.alerts.map(alert=><div key={alert.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 space-y-1"><p className="text-sm font-bold text-foreground">{alert.symbol} <span className="text-xs font-normal text-muted">{alert.direction==='above'?'≥':'≤'} {priceText(alert.target_price,alert.currency)}</span></p>
              <p className="text-xs text-muted">{({active:th?'กำลังติดตามบนเซิร์ฟเวอร์':'Monitoring on server',triggered:th?'บันทึกในกระดิ่งแล้ว':'Saved in notification inbox',pending:th?'ถึงเป้าแล้ว':'Target reached',sent:th?'ผู้ให้บริการรับอีเมลแล้ว':'Accepted by email provider',failed:th?'ส่งไม่สำเร็จ':'Delivery failed',skipped:th?'ข้ามการส่ง — ถึงขีดจำกัดฟรี':'Skipped — free limit reached'})[alert.status]}</p>
              {alert.last_error && <p className="text-xs text-muted">{['quote_unavailable','fx_or_currency_unavailable'].includes(alert.last_error) ? (th?'ราคา/อัตราแลกเปลี่ยนยังไม่พร้อม จะลองใหม่':'Price/FX unavailable; retrying') : alert.status==='failed' ? (th?'ตรวจการเชื่อมต่อก่อนสร้างเงื่อนไขใหม่':'Check the connection before creating a new alert') : ''}</p>}
              {(alert.triggered_at||alert.sent_at) && <p className="text-[11px] text-muted">{new Date((alert.triggered_at||alert.sent_at)!).toLocaleString(th?'th-TH':'en-US')}</p>}</div>
              <button type="button" aria-label={`${th?'ลบเงื่อนไขแจ้งเตือน':'Delete alert'} ${alert.symbol}`} className="p-2 text-muted hover:text-loss" onClick={async()=>{try{await emailAlerts.remove(alert.id);}catch{setEmailError(true);}}}><Trash2 size={14}/></button>
            </div>)}
          </section>}
          {emailAlerts.alerts.length === 0 && (
            <div className="text-center py-8">
              <Eye size={32} className="text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-muted">{language === "th" ? "ยังไม่มีการแจ้งเตือน" : "No alerts yet"}</p>
              <p className="text-xs text-muted mt-1">{language === "th" ? "เพิ่มสัญลักษณ์ที่คุณสนใจด้านบน" : "Add a symbol above to start watching"}</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
