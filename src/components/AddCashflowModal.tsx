"use client";
import { focusWithoutScroll } from "@/src/lib/scroll-lock";
import { splitBucketMoney } from '@/src/lib/bucket-command';
import { bucketNativeAmount } from '@/src/lib/native-money';
import { requireCurrency } from '@/src/lib/fx';

import React, { useState, useMemo, useEffect, useRef } from "react";
import { X, Plus } from "lucide-react";
import { CustomSelect } from "./CustomSelect";
import currencyStyles from './RecordCurrencyPicker.module.css';
import { FinanceIcon } from "./FinanceIcon";
import { TransitionOverlay } from '@/src/components/TransitionOverlay';
import { useApp } from "@/src/context/AppContext";
import { cn } from "@/src/lib/utils";
import { getLocalDateKey, localDateKeyToIso } from "@/src/lib/local-date";

interface AddCashflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  presetType?: "INCOME" | "EXPENSE" | "DEPOSIT" | "WITHDRAW";
  presetBucketId?: string;
}

export function AddCashflowModal({ isOpen, onClose, presetType, presetBucketId }: AddCashflowModalProps) {
  const { t, addCashActivities, moneyBuckets, formatMoney, language, addToast, currency, cashActivities, exchangeRates, customCategories, addCustomCategory, removeCustomCategory } = useApp();

  const formId = React.useId();
  const amountId = React.useId();
  const [type, setType] = useState<"INCOME" | "EXPENSE" | "DEPOSIT" | "WITHDRAW">("INCOME");
  const [selectedBucketId, setSelectedBucketId] = useState<string>("<auto-distribute>");
  const prevOpenRef = useRef(false);

  // Sync with preset values when modal opens (only when presetType is provided)
  useEffect(() => {
    if (isOpen && presetType && !prevOpenRef.current) {
      setType(presetType);
      // For EXPENSE/WITHDRAW, select first bucket by default; for INCOME/DEPOSIT, use auto-distribute
      const defaultBucket = presetBucketId
        || (presetType === "DEPOSIT" || presetType === "INCOME" ? "<auto-distribute>" : (moneyBuckets[0]?.id || "<no-bucket>"));
      setSelectedBucketId(defaultBucket);
      setCategory(presetType === "DEPOSIT" || presetType === "INCOME" ? "salary" : "food");
      prevOpenRef.current = true;
    } else if (!isOpen) {
      prevOpenRef.current = false;
    }
  }, [isOpen, presetType, presetBucketId, moneyBuckets]);

  const [amount, setAmount] = useState("");
  const [inputCurrency, setInputCurrency] = useState<"USD" | "THB">(currency === "THB" ? "THB" : "USD");
  const currencyOpenRef = useRef(false);
  React.useLayoutEffect(() => {
    // Read the website preference on each opening, not just when this mounted.
    // Keep an explicit selection intact while the user is filling this record.
    if (isOpen && !currencyOpenRef.current) setInputCurrency(currency === 'THB' ? 'THB' : 'USD');
    currencyOpenRef.current = isOpen;
  }, [isOpen, currency]);
  const [category, setCategory] = useState("salary");
  const [date, setDate] = useState(getLocalDateKey);
  const [note, setNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [autoSuggested, setAutoSuggested] = useState(false);
  const convertCurrency = (amount: number, from: "USD" | "THB", to: "USD" | "THB") => {
    const usd = amount / (exchangeRates[from] || 1);
    return usd * (exchangeRates[to] || 1);
  };
  const bucketCurrency = (bucket: { currency?: string }) => { requireCurrency(bucket.currency); return bucket.currency; };

  // Auto-categorization based on note
  useEffect(() => {
    if (!note || note.trim().length < 3) {
      setAutoSuggested(false);
      return;
    }

    const lowerNote = note.toLowerCase();
    
    // Keywords mapping
    const categoryMap: Record<string, { type: "INCOME"| "EXPENSE", cat: string }> = {
      // Income
      'salary': { type: "INCOME", cat: "salary" },
      'wage': { type: "INCOME", cat: "salary" },
      'paycheck': { type: "INCOME", cat: "salary" },
      'freelance': { type: "INCOME", cat: "salary" },
      'เงินเดือน': { type: "INCOME", cat: "salary" },
      'dividend': { type: "INCOME", cat: "investment" },
      
      // Expense - Food
      'lunch': { type: "EXPENSE", cat: "food" },
      'dinner': { type: "EXPENSE", cat: "food" },
      'breakfast': { type: "EXPENSE", cat: "food" },
      'coffee': { type: "EXPENSE", cat: "food" },
      'starbucks': { type: "EXPENSE", cat: "food" },
      'grocery': { type: "EXPENSE", cat: "food" },
      'อาหาร': { type: "EXPENSE", cat: "food" },
      'กาแฟ': { type: "EXPENSE", cat: "food" },
      
      // Expense - Transport
      'uber': { type: "EXPENSE", cat: "transport" },
      'grab': { type: "EXPENSE", cat: "transport" },
      'taxi': { type: "EXPENSE", cat: "transport" },
      'gas': { type: "EXPENSE", cat: "transport" },
      'fuel': { type: "EXPENSE", cat: "transport" },
      'train': { type: "EXPENSE", cat: "transport" },
      'เดินทาง': { type: "EXPENSE", cat: "transport" },
      
      // Expense - Utilities
      'rent': { type: "EXPENSE", cat: "utilities" },
      'electric': { type: "EXPENSE", cat: "utilities" },
      'water': { type: "EXPENSE", cat: "utilities" },
      'internet': { type: "EXPENSE", cat: "utilities" },
      'phone': { type: "EXPENSE", cat: "utilities" },
      'ค่าเช่า': { type: "EXPENSE", cat: "utilities" },
      
      // Expense - Entertainment
      'movie': { type: "EXPENSE", cat: "entertainment" },
      'netflix': { type: "EXPENSE", cat: "entertainment" },
      'spotify': { type: "EXPENSE", cat: "entertainment" },
      'game': { type: "EXPENSE", cat: "entertainment" },
      'shopping': { type: "EXPENSE", cat: "entertainment" },
      'บันเทิง': { type: "EXPENSE", cat: "entertainment" },
      
      // Investment
      'stock': { type: "EXPENSE", cat: "investment" },
      'shares': { type: "EXPENSE", cat: "investment" },
      'crypto': { type: "EXPENSE", cat: "investment" },
      'btc': { type: "EXPENSE", cat: "investment" },
      'dca': { type: "EXPENSE", cat: "investment" },
      'หุ้น': { type: "EXPENSE", cat: "investment" },
      'ลงทุน': { type: "EXPENSE", cat: "investment" }
    };

    for (const [keyword, suggestion] of Object.entries(categoryMap)) {
      if (lowerNote.includes(keyword)) {
        if (type !== suggestion.type && (type === "INCOME" || type === "EXPENSE")) {
          setType(suggestion.type);
        }
        setCategory(suggestion.cat);
        setAutoSuggested(true);
        return;
      }
    }
    
    setAutoSuggested(false);
  }, [note, type]);

  // Get buckets that are linked to expenses
  const linkedBuckets = useMemo(() => {
    return moneyBuckets.filter(b => b.linkedToExpenses);
  }, [moneyBuckets]);

  // All categories (preset + any previously used custom ones) 
  const incomePresets = ["salary", "freelance", "investment", "dividend", "gift", "rental", "other"];
  const expensePresets = ["food", "transport", "utilities", "entertainment", "shopping", "health", "education", "investment", "other"];
  const depositPresets = ["salary", "investment", "other"];
  const withdrawPresets = ["food", "transport", "utilities", "entertainment", "investment", "other"];

  const currentPresets = type === "INCOME" ? incomePresets
    : type === "EXPENSE" ? expensePresets
    : type === "DEPOSIT" ? depositPresets
    : withdrawPresets;

  const [showCustomCatInput, setShowCustomCatInput] = useState(false);
  const [customCatDraft, setCustomCatDraft] = useState("");
  const isCustomCategory = !currentPresets.includes(category);

  const handleTypeChange = (newType: "INCOME" | "EXPENSE" | "DEPOSIT" | "WITHDRAW") => {
    setType(newType);
    setCategory(newType === "INCOME" || newType === "DEPOSIT" ? "salary" : "food");
    setShowCustomCatInput(false);
    setCustomCatDraft("");
    // For EXPENSE/WITHDRAW, select first bucket; for INCOME/DEPOSIT, use auto-distribute
    setSelectedBucketId(
      newType === "INCOME" || newType === "DEPOSIT" ? "<auto-distribute>" : (moneyBuckets[0]?.id || "<no-bucket>")
    );
    setAutoSuggested(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    const rawAmount = Number(amount);
    try {
      const targets = selectedBucketId === '<auto-distribute>' ? moneyBuckets : moneyBuckets.filter(b => b.id === selectedBucketId);
      targets.forEach(b => bucketNativeAmount({ original_amount: rawAmount, currency: inputCurrency }, b.currency));
    } catch (error) { addToast(String(error), 'error'); return; }
    const THB_RATE = exchangeRates.THB;
    const amountNum = inputCurrency === 'THB' ? rawAmount / THB_RATE : rawAmount;
    if (!Number.isFinite(amountNum)) { addToast('ยังไม่มีข้อมูลเรท USD/THB กรุณารอข้อมูลก่อนบันทึก', 'error'); return; }

    // Validate bucket deduction
    if ((type === "EXPENSE" || type === "WITHDRAW") && selectedBucketId !== "<no-bucket>") {
      const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
      if (bucket && bucket.currentAmount < bucketNativeAmount({ original_amount: rawAmount, currency: inputCurrency }, bucket.currency)) {
        addToast(
          t("insufficientBucketBalance").replace("{bucket}", t(bucket.name) || bucket.name),
          "error"
        );
        return;
      }
    }

    setIsAdding(true);

    let detailedNote = note;
    if ((type === "EXPENSE" || type === "WITHDRAW") && selectedBucketId !== "<no-bucket>") {
      const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
      if (bucket) {
        detailedNote = `${note ? note + " | " : ""}Paid from: ${t(bucket.name) || bucket.name}`;
      }
    } else if (type === "INCOME" || type === "DEPOSIT") {
      if (selectedBucketId === "<auto-distribute>") {
        detailedNote = `${note ? note + " | " : ""}Auto-distributed to buckets`;
      } else if (selectedBucketId !== "<no-bucket>") {
        const bucket = moneyBuckets.find(b => b.id === selectedBucketId);
        if (bucket) {
          detailedNote = `${note ? note + " | " : ""}Deposited to: ${t(bucket.name) || bucket.name}`;
        }
      }
    }

    try {
      const activityDate = date === getLocalDateKey() ? new Date().toISOString() : localDateKeyToIso(date);

      const base={type,amountUSD:amountNum,category,date:activityDate,note:detailedNote,currency:inputCurrency,rateAtTime:exchangeRates[inputCurrency]||1,originalAmount:rawAmount};
      const auto=(type==='INCOME'||type==='DEPOSIT')&&selectedBucketId==='<auto-distribute>'&&moneyBuckets.length>0;
      const shares=auto?splitBucketMoney(amount,moneyBuckets.map(b=>b.targetPercent||0)):[];
      const rows=auto?moneyBuckets.map((b,i)=>({...base,bucketId:b.id,originalAmount:shares[i],amountUSD:shares[i]/(exchangeRates[inputCurrency]||1)})).filter(r=>r.originalAmount>0)
        :[{...base,bucketId:selectedBucketId!=='<no-bucket>'&&selectedBucketId!=='<auto-distribute>'?selectedBucketId:undefined}];
      if(!await addCashActivities(rows,auto?'distribute':'create'))return;

      addToast(t("recordSaved"), "success");

      resetState();
      onClose();
    } catch (err) {
      addToast(language==='th'?'บันทึกไม่สำเร็จ ตรวจยอดและสัดส่วนการแบ่งเงิน':'Could not save. Check the amount and allocation weights.','error');
    } finally {
      setIsAdding(false);
    }
  };

  const resetState = () => {
    setType("INCOME");
    setAmount("");
    setCategory("salary");
    setDate(getLocalDateKey());
    setNote("");
    setSelectedBucketId("<auto-distribute>");
    setAutoSuggested(false);
  };

  // Get default bucket for EXPENSE/WITHDRAW
  const defaultBucketId = moneyBuckets[0]?.id || "<no-bucket>";

  const handleClose = () => {
    resetState();
    onClose();
  };

  const incoming = type === 'INCOME' || type === 'DEPOSIT';
  const categoryType = incoming ? 'INCOME' : 'EXPENSE';
  const savedCategories = customCategories.filter(c => c.type === categoryType && !currentPresets.some(p => p.toLowerCase() === c.label.toLowerCase() || t(p).toLowerCase() === c.label.toLowerCase()));
  const categoryIcon = (cat: string) => ({ salary: 'card', freelance: 'laptop', dividend: 'coins', rental: 'home', other: 'tag' }[cat] || cat);
  const addCategory = () => {
    const label = customCatDraft.trim();
    if (!label) return;
    if (!customCategories.some(c => c.type === categoryType && c.label.toLowerCase() === label.toLowerCase())) addCustomCategory(categoryType, label);
    setCategory(label); setAutoSuggested(false); setShowCustomCatInput(false); setCustomCatDraft('');
  };
  const badge = <span className={cn('record-type-badge', incoming ? 'income' : 'expense')}>● {t(type.toLowerCase())}</span>;
  return <TransitionOverlay open={isOpen} onClose={handleClose} title={t('addRecord')} headingContent={badge} className="record-modal" overlayClassName="record-overlay" initialFocus='[data-record-amount]' footer={<button form={formId} type="submit" disabled={isAdding || !amount || Number(amount) <= 0} className="ledger-control primary h-12 w-full">{isAdding ? (language==='th'?'กำลังบันทึก…':'Saving…') : t('SAVERECORD')}</button>}>
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <CustomSelect aria-label={t('wallet')} value={selectedBucketId} onChange={setSelectedBucketId} className="record-wallet"
        triggerLabel={<span className="block text-left"><span className="mb-1 block text-[10px] font-bold uppercase text-muted">{incoming ? (language==='th'?'ฝากเข้า':'Deposit to') : t('deductFromBucket')}</span><span className="block truncate">{selectedBucketId==='<auto-distribute>' ? (language==='th'?'กระจายตามแผน':'Auto-distribute (Target Plan)') : selectedBucketId==='<no-bucket>' ? t('unassigned') : moneyBuckets.find(b=>b.id===selectedBucketId)?.name}</span></span>}
        items={[...(incoming ? [{value:'<auto-distribute>',label:language==='th'?'กระจายตามแผน':'Auto-distribute (Target Plan)'}] : []),{value:'<no-bucket>',label:t('unassigned')},...moneyBuckets.map(b=>({value:b.id,label:t(b.name)||b.name}))]}/>
      <div className="record-amount">
        <CustomSelect aria-label={`${t('currency')}: ${inputCurrency}`} value={inputCurrency} onChange={value=>setInputCurrency(value as 'USD'|'THB')} className={currencyStyles.picker} dropdownWidth='anchor' dropdownClassName={currencyStyles.menu} triggerLabel={`${inputCurrency==='THB'?'฿':'$'} ${inputCurrency}`} items={[{value:'THB',label:'THB · ฿'},{value:'USD',label:'USD · $'}]}/>
        <input id={amountId} aria-label={t('amount')} data-record-amount type="number" min="0.01" step="0.01" required placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/>
      </div>
      <fieldset><legend className="sr-only">{t('category')}</legend><div className="flex flex-wrap gap-2">
        {currentPresets.map(cat=><button type="button" key={cat} aria-pressed={category===cat} onClick={()=>{setCategory(cat);setAutoSuggested(false);setShowCustomCatInput(false);}} className="record-category"><FinanceIcon name={categoryIcon(cat)} size={14}/>{t(cat)}</button>)}
        {savedCategories.map(cat=><span key={cat.id} className="record-custom-chip"><button type="button" aria-pressed={category===cat.label} onClick={()=>{setCategory(cat.label);setAutoSuggested(false);setShowCustomCatInput(false);}} className="record-category"><FinanceIcon name="tag" size={14}/>{cat.label}</button><button type="button" aria-label={`${t('delete')} ${cat.label}`} onClick={()=>{removeCustomCategory(cat.id);if(category===cat.label)setCategory('other');}} className="record-remove"><X size={12}/></button></span>)}
        {isCustomCategory && category && !savedCategories.some(c=>c.label===category) && <button type="button" aria-pressed="true" className="record-category"><FinanceIcon name="tag" size={14}/>{category}</button>}
        <button type="button" onClick={()=>setShowCustomCatInput(v=>!v)} className="record-category"><Plus size={13}/>{language==='th'?'กำหนดเอง':'Custom'}</button>
      </div>{showCustomCatInput&&<div className="mt-2 flex gap-2"><input ref={focusWithoutScroll} aria-label={language==='th'?'หมวดหมู่กำหนดเอง':'Custom category'} placeholder={language==='th'?'หมวดหมู่กำหนดเอง':'Custom category'} value={customCatDraft} onChange={e=>setCustomCatDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCategory();}}} className="ledger-input"/><button type="button" onClick={addCategory} disabled={!customCatDraft.trim()} className="ledger-control">{language==='th'?'เพิ่ม':'Add'}</button></div>}</fieldset>
      <input aria-label={t('noteOptional')} placeholder={t('noteOptional')} value={note} onChange={e=>setNote(e.target.value)} className="ledger-input"/>
      <input aria-label={t('date')} type="date" required value={date} onChange={e=>setDate(e.target.value)} className="ledger-input"/>
    </form>
  </TransitionOverlay>;
}
