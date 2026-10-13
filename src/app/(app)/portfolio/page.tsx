"use client";

import React, { useState, useMemo, useEffect, useCallback, useContext, createContext } from "react";
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  Eye,
  EyeOff,
  Plus,
  X,
  PiggyBank,
  Layers,
  PieChart,
  Pencil,
  Trash2,
  GripVertical,
  FolderOpen,
  TrendingUp,
  TrendingDown,
  Check,
  AlertTriangle,
  LogOut,
  LogIn,
  ChevronDown,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import { CustomSelect } from "@/src/components/CustomSelect";
import { AssetFundingFields, type AssetEntryMode } from '@/src/components/AssetFundingFields';
import { InvestmentTransferModal } from "@/src/components/InvestmentTransferModal";
import { TradeLotEditor } from "@/src/components/TradeLotEditor";
import { projectLotPosition } from "@/src/lib/trade-lots";
import { useFxRate } from "@/src/hooks/useFxRate";
import { useExecutionFxInput } from '@/src/hooks/useExecutionFxInput';
import { decimal, formatAmount, formatMoney as formatFxMoney, valuePortfolio, isFxCurrency, sumNativeMoney, type ValuationItem } from "@/src/lib/fx";
import type { Decimal } from "@/src/lib/cost-basis-ledger";
import {
  PortfolioDisplayFilterModal,
  TotalFilterSettings,
  DEFAULT_TOTAL_FILTER,
} from "@/src/components/PortfolioDisplayFilterModal";

// ─── Types ───────────────────────────────────────────────────────────────────

type Cur = "USD" | "THB";
type Market = "US" | "TH" | "GOLD" | "FUND";
type TabKey = "all" | "cash" | Market;
type MoveMode = "deposit" | "withdraw";
type Counterparty = "external" | "bucket";
type MoveKind = "deposit_external" | "deposit_bucket" | "withdraw_bucket" | "withdraw_external";

interface Broker {
  id: string;
  name: string;
  color: string;
}

interface CashAccount {
  id: string;
  brokerId: string;
  name: string;
  currency: Cur;
  balance: number;
}

/** เงินที่อยู่นอกโบรกเกอร์ แต่ยังนับรวมในแอป */
interface Bucket {
  id: string;
  name: string;
  currency: Cur;
  balance: number;
}

interface Holding {
  id: string;
  brokerId: string;
  market: Market;
  symbol: string;
  name: string;
  shares: number;
  avgCost: number; // Per-unit cost in this projection's currency, not necessarily native currency.
  price: number; // Per-unit market value in this projection's currency.
  currency: Cur;
  realizedPL?: number;
  dividends?: number;
  investedCost?: number;
  executionFee?: number;
  entryMode?: AssetEntryMode;
  fundingAccountId?: string;
  executionFx?: number;
}

interface HoldingGroup {
  id: string;
  brokerId: string;
  name: string;
  /** Standard groups mirror the original four portfolio categories. */
  market?: Market;
  isDefault: boolean;
}

interface LedgerEntry {
  id: string;
  ts: number;
  kind: MoveKind;
  accountId: string;
  bucketId?: string;
  inputAmount: number;
  inputCurrency: Cur;
  accountAmount: number;
  accountCurrency: Cur;
}

interface PortfolioState {
  brokers: Broker[];
  accounts: CashAccount[];
  buckets: Bucket[];
  holdings: Holding[];
  holdingGroups: HoldingGroup[];
  /** A holding can appear in several group boards without being counted twice. */
  holdingGroupIds: Record<string, string[]>;
  ledger: LedgerEntry[];
  rate: number; // THB ต่อ 1 USD
}

interface MoveInput {
  mode: MoveMode;
  accountId: string;
  currency: Cur;
  amount: number;
  counterparty: Counterparty;
  bucketId?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "fintrack.multibroker.v1";
const DEFAULT_RATE = Number.NaN; // Unavailable until the shared FX quote is loaded.

const ACCENT = "#4EDEA3";
const GAIN = "#4EDEA3";
const LOSS = "#FFB4AB";

const BROKER_COLORS = ["#4EDEA3", "#9B7BFF", "#ADC6FF", "#E8B84A", "#FF9EC4", "#5FD3F3"];

const TABS: { key: Exclude<TabKey, "all">; label: string; color: string }[] = [
  { key: "cash", label: "เงินสด", color: "#4EDEA3" },
  { key: "FUND", label: "กองทุนรวม", color: "#ADC6FF" },
  { key: "TH", label: "หุ้นไทย", color: "#B69CFF" },
  { key: "US", label: "หุ้นสหรัฐฯ", color: "#9B7BFF" },
  { key: "GOLD", label: "ทองคำ", color: "#E8B84A" },
];

const MARKET_CURRENCY: Record<Market, Cur> = { US: "USD", TH: "THB", GOLD: "USD", FUND: "THB" };
const MARKET_LABEL: Record<Market, string> = {
  US: "หุ้นสหรัฐฯ",
  TH: "หุ้นไทย",
  GOLD: "ทองคำ",
  FUND: "กองทุนรวม",
};

const DEFAULT_HOLDING_GROUPS: { market: Market; name: string }[] = [
  { market: "FUND", name: "กองทุนรวม" },
  { market: "TH", name: "หุ้นไทย" },
  { market: "US", name: "หุ้นสหรัฐฯ" },
  { market: "GOLD", name: "ทองคำ" },
];

const defaultHoldingGroupId = (brokerId: string, market: Market) => `${brokerId}:group:${market}`;
const defaultHoldingGroups = (brokerId: string): HoldingGroup[] => DEFAULT_HOLDING_GROUPS.map(({ market, name }) => ({
  id: defaultHoldingGroupId(brokerId, market), brokerId, name, market, isDefault: true,
}));

const KIND_META: Record<MoveKind, { title: string; counted: boolean }> = {
  deposit_external: { title: "ฝากเงิน", counted: true },
  deposit_bucket: { title: "ฝากเงิน", counted: true },
  withdraw_bucket: { title: "ถอนเงิน", counted: true },
  withdraw_external: { title: "ถอนเงิน", counted: false },
};

function makeInitialState(): PortfolioState {
  return {
    // Brokers are created through AppContext so the portfolio page and the
    // sidebar always use the same list.
    brokers: [],
    accounts: [],
    buckets: [],
    holdings: [],
    holdingGroups: [],
    holdingGroupIds: {},
    ledger: [],
    rate: DEFAULT_RATE,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const floor2 = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

function nf(n: number, d = 2): string {
  if (!Number.isFinite(n)) return 'unresolved';
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function convert(amount: number, from: Cur, to: Cur, rate: number): number {
  if (!isFxCurrency(from) || !isFxCurrency(to)) return Number.NaN;
  if (from === to) return amount;
  return from === "USD" ? amount * rate : amount / rate;
}

function otherCur(c: Cur): Cur {
  return c === "USD" ? "THB" : "USD";
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function thaiDateTime(ts: number, withTime = true): string {
  const d = new Date(ts);
  const yy = (d.getFullYear() + 543) % 100;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const date = `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${yy}`;
  return withTime ? `${date} - ${hh}:${mm} น.` : date;
}

function holdingValue(h: Holding): number {
  return h.shares * h.price;
}
function holdingCost(h: Holding): number {
  return h.shares * h.avgCost;
}

const HideContext = createContext(false);
const MASK = "••••••";

/** ตัวเลขเงิน: ทศนิยมตัวเล็กแบบแอป Dime, ซ่อนได้ด้วยปุ่มรูปตา */
function Money({
  value,
  exactValue,
  cur,
  className,
  decimalClass = "text-[0.6em]",
  curClass = "text-[0.5em]",
}: {
  value: number;
  exactValue?: Decimal | null;
  cur: Cur;
  className?: string;
  decimalClass?: string;
  curClass?: string;
}) {
  const hide = useContext(HideContext);
  if (hide) return <span className={className}>{MASK}</span>;
  if (!isFxCurrency(cur) || (exactValue === undefined && !Number.isFinite(value))) return <span className={className}>unresolved</span>;
  if (exactValue === null) return <span className={className}>— <span className={curClass}>{cur}</span></span>;
  const [int, dec] = (exactValue === undefined ? nf(Math.abs(value)) : formatAmount(exactValue).replace('-', '')).split(".");
  return (
    <span className={cn("tabular-nums", className)}>
      {(exactValue === undefined ? value < 0 : exactValue.cmp(decimal('0')) < 0) ? "-" : ""}
      {int}
      <span className={cn("font-semibold", decimalClass)}>.{dec}</span>{" "}
      <span className={cn("font-bold", curClass)}>{cur}</span>
    </span>
  );
}

/** ข้อความเงินแบบบรรทัดเดียว (เคารพโหมดซ่อน) */
function moneyDisplaySign(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Presentation only: do not round the underlying P/L used by totals.
  return decimal(decimal(value).toFixed(2)).cmp(decimal('0'));
}

function useMoneyText() {
  const hide = useContext(HideContext);
  return useCallback(
    (n: number, cur: Cur, sign = false) => {
      if (hide) return `${MASK} ${cur}`;
      if (!Number.isFinite(n)) return `unresolved ${cur}`;
      const direction = moneyDisplaySign(n);
      const s = sign && direction > 0 ? "+" : direction < 0 ? "-" : "";
      return `${s}${direction === 0 ? '0.00' : nf(Math.abs(n))} ${cur}`;
    },
    [hide]
  );
}

// ─── Move planning (pure) ────────────────────────────────────────────────────

interface MovePlan {
  error?: string;
  accountAmount: number;
  bucketAmount: number;
  account?: CashAccount;
  bucket?: Bucket;
}

function planMove(s: PortfolioState, m: MoveInput): MovePlan {
  const base: MovePlan = { accountAmount: 0, bucketAmount: 0 };
  const account = s.accounts.find((a) => a.id === m.accountId);
  if (!account) return { ...base, error: "เลือกบัญชีเงินสด" };
  if (m.currency !== account.currency) return { ...base, account, error: "รายการเงินสดต้องใช้สกุลเงินเดียวกับบัญชี" };
  if (!Number.isFinite(m.amount) || m.amount <= 0) return { ...base, account, error: "กรอกจำนวนเงิน" };

  const accountAmount = r2(convert(m.amount, m.currency, account.currency, s.rate));
  if (accountAmount <= 0) return { ...base, account, error: "จำนวนเงินน้อยเกินไป" };

  let bucket: Bucket | undefined;
  let bucketAmount = 0;
  if (m.counterparty === "bucket") {
    bucket = s.buckets.find((b) => b.id === m.bucketId);
    if (!bucket) return { ...base, account, accountAmount, error: "เลือก Bucket (หรือสร้าง Bucket ก่อน)" };
    bucketAmount = r2(convert(m.amount, m.currency, bucket.currency, s.rate));
  }

  if (m.mode === "withdraw" && accountAmount > account.balance + 0.005) {
    return {
      account,
      bucket,
      accountAmount,
      bucketAmount,
      error: `ยอดในบัญชีไม่พอ (มี ${nf(account.balance)} ${account.currency})`,
    };
  }
  if (m.mode === "deposit" && bucket && bucketAmount > bucket.balance + 0.005) {
    return {
      account,
      bucket,
      accountAmount,
      bucketAmount,
      error: `ยอดใน ${bucket.name} ไม่พอ (มี ${nf(bucket.balance)} ${bucket.currency})`,
    };
  }
  return { account, bucket, accountAmount, bucketAmount };
}

function applyMove(s: PortfolioState, m: MoveInput): PortfolioState {
  const plan = planMove(s, m);
  if (plan.error || !plan.account) return s;

  const sign = m.mode === "deposit" ? 1 : -1;
  const kind: MoveKind = `${m.mode}_${m.counterparty}` as MoveKind;

  const accounts = s.accounts.map((a) =>
    a.id === plan.account!.id ? { ...a, balance: Math.max(0, r2(a.balance + sign * plan.accountAmount)) } : a
  );
  // ฝั่ง Bucket: ถอนจากบัญชี → เข้า Bucket (+), ฝากเข้าบัญชีจาก Bucket → ออกจาก Bucket (−)
  const buckets = s.buckets.map((b) =>
    plan.bucket && b.id === plan.bucket.id
      ? { ...b, balance: Math.max(0, r2(b.balance - sign * plan.bucketAmount)) }
      : b
  );
  const entry: LedgerEntry = {
    id: uid(),
    ts: Date.now(),
    kind,
    accountId: plan.account.id,
    bucketId: plan.bucket?.id,
    inputAmount: m.amount,
    inputCurrency: m.currency,
    accountAmount: plan.accountAmount,
    accountCurrency: plan.account.currency,
  };
  return { ...s, accounts, buckets, ledger: [entry, ...s.ledger].slice(0, 200) };
}

// ─── Store (localStorage) ────────────────────────────────────────────────────

function sanitize(raw: unknown): PortfolioState {
  const fallback = makeInitialState();
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Partial<PortfolioState>;
  if (!Array.isArray(o.brokers) || !Array.isArray(o.accounts) || !Array.isArray(o.buckets)) return fallback;
  // ชื่อเริ่มต้นรุ่นก่อนเป็นชื่อบัญชีของ Dime ย้ายเป็นชื่อกลางๆ (ชื่อที่ผู้ใช้ตั้งเองไม่แตะ)
  const legacy = new Set(["Dime! Save", "Dime! USD"]);
  const accounts = o.accounts.map((a) => {
    const isLegacy = legacy.has(a.name) || (/-(thb|usd)$/.test(a.id) && /\((THB|USD)\)$/.test(a.name));
    return isLegacy ? { ...a, name: `เงินสด ${a.currency}` } : a;
  });
  const holdings = Array.isArray(o.holdings) ? o.holdings : [];
  const defaultGroups = o.brokers.flatMap((broker) => defaultHoldingGroups(broker.id));
  const savedGroups = Array.isArray(o.holdingGroups)
    ? o.holdingGroups.filter((group): group is HoldingGroup => !!group && typeof group.id === "string" && typeof group.brokerId === "string" && typeof group.name === "string")
    : [];
  const groupMap = new Map(defaultGroups.map((group) => [group.id, group]));
  savedGroups.forEach((group) => groupMap.set(group.id, group));
  const holdingGroups = Array.from(groupMap.values());
  const validGroupIds = new Set(holdingGroups.map((group) => group.id));
  const savedMemberships = o.holdingGroupIds && typeof o.holdingGroupIds === "object" ? o.holdingGroupIds as Record<string, unknown> : {};
  const holdingGroupIds: Record<string, string[]> = {};
  holdings.forEach((holding) => {
    const saved = Array.isArray(savedMemberships[holding.id])
      ? (savedMemberships[holding.id] as unknown[]).filter((id): id is string => typeof id === "string" && validGroupIds.has(id))
      : [];
    holdingGroupIds[holding.id] = saved.length ? Array.from(new Set(saved)) : [defaultHoldingGroupId(holding.brokerId, holding.market)];
  });
  return {
    brokers: o.brokers,
    accounts,
    buckets: o.buckets,
    holdings,
    holdingGroups,
    holdingGroupIds,
    ledger: Array.isArray(o.ledger) ? o.ledger : [],
    rate: typeof o.rate === "number" && o.rate > 0 ? o.rate : DEFAULT_RATE,
  };
}

function usePortfolioStore() {
  const [state, setState] = useState<PortfolioState>(makeInitialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = sanitize(JSON.parse(raw));
        // Reset rate on refresh so it always starts with fresh auto rate from API
        // Keep the legacy key byte-for-byte as the snapshot. Monetary projections
        // are rebuilt from the shared native source, never rehydrated as facts.
        const layout = JSON.parse(window.localStorage.getItem('fintrack.multibroker.layout.v2') || '{}');
        setState({ ...parsed, ...layout, accounts: [], buckets: [], holdings: [], ledger: [], rate: DEFAULT_RATE });
      }
    } catch {
      /* ใช้ค่าเริ่มต้น */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      // Exclude rate from localStorage persistence so refresh always reverts to auto
      const { holdingGroups, holdingGroupIds } = state;
      window.localStorage.setItem('fintrack.multibroker.layout.v2', JSON.stringify({ holdingGroups, holdingGroupIds }));
    } catch {
      /* เก็บไม่ได้ก็ข้าม */
    }
  }, [state, ready]);

  const move = useCallback((m: MoveInput) => setState((s) => applyMove(s, m)), []);

  const setRate = useCallback((rate: number) => {
    if (rate > 0) setState((s) => ({ ...s, rate }));
  }, []);

  const addBroker = useCallback((name: string, color: string): string => {
    const id = uid();
    setState((s) => ({
      ...s,
      brokers: [...s.brokers, { id, name, color }],
      accounts: [
        ...s.accounts,
        { id: `${id}-thb`, brokerId: id, name: "เงินสด THB", currency: "THB", balance: 0 },
        { id: `${id}-usd`, brokerId: id, name: "เงินสด USD", currency: "USD", balance: 0 },
      ],
    }));
    return id;
  }, []);

  const updateBroker = useCallback((id: string, name: string, color: string) => {
    setState((s) => ({ ...s, brokers: s.brokers.map((b) => (b.id === id ? { ...b, name, color } : b)) }));
  }, []);

  /** ลบโบรกได้เมื่อไม่มีสินทรัพย์และเงินสดเป็น 0 (UI ตรวจก่อน) พร้อมบัญชีเงินสดของโบรกนั้น */
  const removeBroker = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      brokers: s.brokers.filter((b) => b.id !== id),
      accounts: s.accounts.filter((a) => a.brokerId !== id),
      holdings: s.holdings.filter((h) => h.brokerId !== id),
    }));
  }, []);

  const addAccount = useCallback((brokerId: string, name: string, currency: Cur) => {
    setState((s) => ({ ...s, accounts: [...s.accounts, { id: uid(), brokerId, name, currency, balance: 0 }] }));
  }, []);

  const updateAccount = useCallback((id: string, name: string) => {
    setState((s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, name } : a)) }));
  }, []);

  const removeAccount = useCallback((id: string) => {
    setState((s) => ({ ...s, accounts: s.accounts.filter((a) => a.id !== id) }));
  }, []);

  const addBucket = useCallback((name: string, currency: Cur) => {
    setState((s) => ({ ...s, buckets: [...s.buckets, { id: uid(), name, currency, balance: 0 }] }));
  }, []);

  const syncBuckets = useCallback((nextBuckets: Bucket[]) => {
    setState((current) => {
      const unchanged = current.buckets.length === nextBuckets.length
        && current.buckets.every((bucket, index) => {
          const next = nextBuckets[index];
          return bucket.id === next?.id && bucket.name === next?.name
            && bucket.currency === next?.currency && Object.is(bucket.balance, next?.balance);
        });
      return unchanged ? current : { ...current, buckets: nextBuckets };
    });
  }, []);

  /** Keep the page's broker filters keyed to the portfolio IDs used by Sidebar. */
  const syncBrokers = useCallback((nextBrokers: Broker[]) => {
    setState((current) => {
      const previousByName = new Map(current.brokers.map((broker) => [broker.name.trim().toLowerCase(), broker]));
      const idMap = new Map<string, string>();
      nextBrokers.forEach((broker) => {
        const previous = previousByName.get(broker.name.trim().toLowerCase());
        if (previous && previous.id !== broker.id) idMap.set(previous.id, broker.id);
      });

      const unchanged = current.brokers.length === nextBrokers.length
        && current.brokers.every((broker, index) => broker.id === nextBrokers[index]?.id && broker.name === nextBrokers[index]?.name && broker.color === nextBrokers[index]?.color);
      if (unchanged) return current;

      return {
        ...current,
        brokers: nextBrokers,
        accounts: current.accounts.map((account) => ({ ...account, brokerId: idMap.get(account.brokerId) || account.brokerId })),
        holdings: current.holdings.map((holding) => ({ ...holding, brokerId: idMap.get(holding.brokerId) || holding.brokerId })),
        holdingGroups: [
          ...nextBrokers.flatMap((broker) => defaultHoldingGroups(broker.id)),
          ...current.holdingGroups
            .filter((group) => !group.isDefault && nextBrokers.some((broker) => broker.id === (idMap.get(group.brokerId) || group.brokerId)))
            .map((group) => ({ ...group, brokerId: idMap.get(group.brokerId) || group.brokerId })),
        ],
        holdingGroupIds: Object.fromEntries(current.holdings.map((holding) => {
          const nextHolding = { ...holding, brokerId: idMap.get(holding.brokerId) || holding.brokerId };
          const ids = current.holdingGroupIds[holding.id] || [defaultHoldingGroupId(nextHolding.brokerId, nextHolding.market)];
          return [holding.id, ids.map((id) => idMap.get(holding.brokerId) ? id.replace(`${holding.brokerId}:group:`, `${nextHolding.brokerId}:group:`) : id)];
        })),
      };
    });
  }, []);

  /** Cash cards are projections of the brokerage cash ledger, never a second balance. */
  const syncAccounts = useCallback((nextAccounts: CashAccount[]) => {
    setState((current) => {
      const unchanged = current.accounts.length === nextAccounts.length
        && current.accounts.every((account, index) => {
          const next = nextAccounts[index];
          return account.id === next?.id && account.name === next?.name && account.brokerId === next?.brokerId
            && account.currency === next?.currency && Object.is(account.balance, next?.balance);
        });
      return unchanged ? current : { ...current, accounts: nextAccounts };
    });
  }, []);

  /** Investment values come from AppContext's trade-derived positions.  Keep
   * this page's boards and drag placement as a presentation layer only. */
  const syncHoldings = useCallback((nextHoldings: Holding[]) => {
    setState((current) => {
      const missingBrokerIds = Array.from(new Set(nextHoldings
        .map((holding) => holding.brokerId)
        .filter((brokerId) => !current.holdingGroups.some((group) => group.brokerId === brokerId))));
      const groups = [
        ...current.holdingGroups,
        ...missingBrokerIds.flatMap((brokerId) => defaultHoldingGroups(brokerId)),
      ];
      const nextGroupIds = Object.fromEntries(nextHoldings.map((holding) => {
        const previousHolding = current.holdings.find(item => item.brokerId === holding.brokerId && item.symbol === holding.symbol);
        const previous = current.holdingGroupIds[holding.id] || (previousHolding ? current.holdingGroupIds[previousHolding.id] : []) || [];
        const valid = previous.filter((id) => groups.some((group) => group.id === id && group.brokerId === holding.brokerId));
        return [holding.id, valid.length ? valid : [defaultHoldingGroupId(holding.brokerId, holding.market)]];
      }));
      const unchanged = current.holdings.length === nextHoldings.length
        && current.holdings.every((holding, index) => {
          const next = nextHoldings[index];
          return holding.id === next?.id && holding.brokerId === next?.brokerId
            && holding.shares === next?.shares && Object.is(holding.avgCost, next?.avgCost)
            && Object.is(holding.price, next?.price) && holding.name === next?.name
            && holding.currency === next?.currency && holding.market === next?.market
            && Object.is(holding.realizedPL, next?.realizedPL) && Object.is(holding.dividends, next?.dividends)
            && Object.is(holding.investedCost, next?.investedCost);
        });
      return unchanged ? current : { ...current, holdings: nextHoldings, holdingGroups: groups, holdingGroupIds: nextGroupIds };
    });
  }, []);

  const saveHolding = useCallback((h: Holding) => {
    setState((s) => {
      const previous = s.holdings.find((item) => item.id === h.id);
      const groups = s.holdingGroups.some((group) => group.brokerId === h.brokerId)
        ? s.holdingGroups
        : [...s.holdingGroups, ...defaultHoldingGroups(h.brokerId)];
      const shouldResetPlacement = !previous || previous.brokerId !== h.brokerId;
      const existingIds = s.holdingGroupIds[h.id] || [];
      const groupIds = shouldResetPlacement || existingIds.length === 0
        ? [defaultHoldingGroupId(h.brokerId, h.market)]
        : existingIds.filter((id) => groups.some((group) => group.id === id && group.brokerId === h.brokerId));
      return {
        ...s,
        holdings: previous ? s.holdings.map((item) => item.id === h.id ? h : item) : [...s.holdings, h],
        holdingGroups: groups,
        holdingGroupIds: { ...s.holdingGroupIds, [h.id]: groupIds.length ? groupIds : [defaultHoldingGroupId(h.brokerId, h.market)] },
      };
    });
  }, []);

  const removeHolding = useCallback((id: string) => {
    setState((s) => {
      const { [id]: _removed, ...holdingGroupIds } = s.holdingGroupIds;
      return { ...s, holdings: s.holdings.filter((h) => h.id !== id), holdingGroupIds };
    });
  }, []);

  const addHoldingGroup = useCallback((brokerId: string, name: string) => {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) return;
    setState((s) => ({ ...s, holdingGroups: [...s.holdingGroups, { id: uid(), brokerId, name: trimmed, isDefault: false }] }));
  }, []);

  const removeHoldingGroup = useCallback((groupId: string) => {
    setState((s) => {
      const group = s.holdingGroups.find((item) => item.id === groupId);
      if (!group || group.isDefault) return s;
      return {
        ...s,
        holdingGroups: s.holdingGroups.filter((item) => item.id !== groupId),
        holdingGroupIds: Object.fromEntries(Object.entries(s.holdingGroupIds).map(([holdingId, ids]) => [holdingId, ids.filter((id) => id !== groupId)])),
      };
    });
  }, []);

  const placeHoldingInGroup = useCallback((holdingId: string, groupId: string) => {
    setState((s) => {
      const holding = s.holdings.find((item) => item.id === holdingId);
      const group = s.holdingGroups.find((item) => item.id === groupId);
      if (!holding || !group || holding.brokerId !== group.brokerId) return s;
      const current = s.holdingGroupIds[holdingId] || [];
      return current.includes(groupId) ? s : { ...s, holdingGroupIds: { ...s.holdingGroupIds, [holdingId]: [...current, groupId] } };
    });
  }, []);

  /** Move the canonical holding to another broker portfolio.  Categories stay
   * visual-only; a cross-broker drop changes the real portfolio ownership and
   * resets the visual placement to that broker's matching default category. */
  const moveHoldingToBroker = useCallback((holdingId: string, brokerId: string) => {
    setState((s) => {
      const holding = s.holdings.find((item) => item.id === holdingId);
      const destination = s.brokers.find((broker) => broker.id === brokerId);
      if (!holding || !destination || holding.brokerId === brokerId) return s;
      const moved = { ...holding, brokerId };
      const groups = s.holdingGroups.some((group) => group.brokerId === brokerId)
        ? s.holdingGroups
        : [...s.holdingGroups, ...defaultHoldingGroups(brokerId)];
      return {
        ...s,
        holdings: s.holdings.map((item) => item.id === holdingId ? moved : item),
        holdingGroups: groups,
        holdingGroupIds: {
          ...s.holdingGroupIds,
          [holdingId]: [defaultHoldingGroupId(brokerId, moved.market)],
        },
      };
    });
  }, []);

  const removeHoldingFromGroup = useCallback((holdingId: string, groupId: string) => {
    setState((s) => ({ ...s, holdingGroupIds: { ...s.holdingGroupIds, [holdingId]: (s.holdingGroupIds[holdingId] || []).filter((id) => id !== groupId) } }));
  }, []);

  return {
    state,
    ready,
    move,
    setRate,
    addAccount,
    updateAccount,
    removeAccount,
    addBucket,
    syncBrokers,
    syncAccounts,
    syncHoldings,
    syncBuckets,
    saveHolding,
    removeHolding,
    addHoldingGroup,
    removeHoldingGroup,
    placeHoldingInGroup,
    moveHoldingToBroker,
    removeHoldingFromGroup,
  };
}

// ─── UI primitives ───────────────────────────────────────────────────────────

const INPUT =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#4EDEA3]/50 transition-colors [color-scheme:dark]";

const PRIMARY_BTN =
  "rounded-xl bg-[#4EDEA3] text-[#002114] font-bold text-sm py-3 px-5 hover:brightness-110 transition disabled:bg-white/5 disabled:text-gray-600 disabled:cursor-not-allowed";

function cleanNum(v: string, maxDec: number): string {
  let out = v.replace(/[^0-9.]/g, "");
  const firstDot = out.indexOf(".");
  if (firstDot !== -1) {
    out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, "");
    const [i, d] = out.split(".");
    out = `${i}.${d.slice(0, maxDec)}`;
  }
  return out;
}

function Label({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-xs font-semibold text-gray-400">{children}</span>
      {right}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        role="dialog"
        aria-label={title}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-[#1C1B1B] border border-white/10 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-8 h-8 rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function CurrencyToggle({ value, onChange }: { value: Cur; onChange: (c: Cur) => void }) {
  return (
    <div className="flex rounded-lg bg-black/40 p-0.5 shrink-0" role="radiogroup" aria-label="สกุลเงิน">
      {(["USD", "THB"] as Cur[]).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          onClick={() => onChange(c)}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
            value === c ? "bg-[#4EDEA3] text-[#002114]" : "text-gray-400 hover:text-white"
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function AccountCurrencyPicker({ value, onChange, locked = false }: { value: Cur; onChange?: (c: Cur) => void; locked?: boolean }) {
  const options: Array<{ value: Cur; symbol: string; title: string; desc: string; accent: string }> = [
    { value: "THB", symbol: "฿", title: "บาทไทย", desc: "Thai Baht", accent: "#4EDEA3" },
    { value: "USD", symbol: "$", title: "ดอลลาร์สหรัฐ", desc: "US Dollar", accent: "#9B7BFF" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="สกุลเงินของบัญชี">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={locked}
            onClick={() => onChange?.(option.value)}
            className={cn(
              "flex min-w-0 items-center gap-2.5 rounded-xl border p-3 text-left transition-all",
              selected
                ? "border-white/35 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "border-white/10 bg-black/20 text-gray-500 hover:border-white/20 hover:bg-white/[0.04]",
              locked && "cursor-default"
            )}
            style={selected ? { borderColor: `${option.accent}88` } : undefined}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black"
              style={{ backgroundColor: `${option.accent}20`, color: option.accent }}
            >
              {option.symbol}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-white">{option.value}</span>
              <span className="block truncate text-[10px] text-gray-500">{option.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ChoiceCard({
  active,
  disabled,
  icon: Icon,
  title,
  desc,
  warn,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: React.ElementType;
  title: string;
  desc: string;
  warn?: boolean;
  onClick: () => void;
}) {
  const tone = warn ? LOSS : ACCENT;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border p-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        active ? "bg-white/[0.06]" : "bg-white/[0.02] border-white/10 hover:bg-white/5"
      )}
      style={active ? { borderColor: `${tone}99` } : undefined}
    >
      <Icon size={16} style={{ color: active ? tone : "#9ca3af" }} />
      <div className="text-sm font-bold text-white mt-2">{title}</div>
      <div className="text-[11px] text-gray-500 leading-snug mt-0.5">{desc}</div>
    </button>
  );
}

// ─── Deposit / Withdraw sheet ────────────────────────────────────────────────

function MoveSheet({
  state,
  buckets,
  initialMode,
  initialAccountId,
  activeBrokerFilter,
  onClose,
  onSubmit,
  onFundFromBucket,
}: {
  state: PortfolioState;
  buckets: Array<{ id: string; name: string; currency?: string; currentAmount: number }>;
  initialMode: MoveMode;
  initialAccountId: string;
  activeBrokerFilter?: string | null;
  onClose: () => void;
  onSubmit: (input: MoveInput, message: string) => void;
  onFundFromBucket: (bucketId: string, accountId: string) => void;
}) {
  const text = useMoneyText();
  const firstAccount = state.accounts.find((a) => a.id === initialAccountId) ?? state.accounts[0];
  const { transferBrokerToBucket, exchangeRates } = useApp();
  const [withdrawing, setWithdrawing] = useState(false);
  const withdrawalRequest = React.useRef<{ key: string; id: string } | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<'external' | 'bucket'>('external');
  const [withdrawRate, setWithdrawRate] = useExecutionFxInput();

  const [mode, setMode] = useState<MoveMode>(initialMode);
  const [accountId, setAccountId] = useState(firstAccount?.id ?? "");
  const [amountStr, setAmountStr] = useState("");
  const [depositSource, setDepositSource_] = useState<"external" | "bucket">("external");
  const [bucketId, setBucketId] = useState(buckets[0]?.id ?? "");

  // Reset amount when switching deposit source to avoid stale data in preview
  const setDepositSource = (src: "external" | "bucket") => {
    setDepositSource_(src);
    setAmountStr("");
  };

  const account = state.accounts.find((a) => a.id === accountId);
  const cur: Cur = account?.currency ?? "THB";
  const bucketFunding = mode === "deposit" && depositSource === "bucket";
  const bucketWithdrawal = mode === 'withdraw' && withdrawTarget === 'bucket';
  const destinationBucket = buckets.find(bucket => bucket.id === bucketId);
  const rate = Number(withdrawRate);
  const amount = parseFloat(amountStr);
  const sign = mode === "deposit" ? 1 : -1;

  const input: MoveInput = { mode, accountId, currency: cur, amount, counterparty: "external" };
  const plan = useMemo(() => planMove(state, input), [state, mode, accountId, cur, amount]); // eslint-disable-line react-hooks/exhaustive-deps
  const showError = amountStr !== "" && !!plan.error;

  const changeMode = (m: MoveMode) => {
    setMode(m);
    if (m === "withdraw") setDepositSource("external");
  };

  const changeAccount = (id: string) => {
    setAccountId(id);
  };

  const maxInCur = account ? floor2(account.balance) : 0;

  const impact = (() => {
    if (!(amount > 0)) return null;
    // Funding from bucket: money moves within the app, total doesn't change
    if (bucketFunding || bucketWithdrawal) return { label: "ยอดรวมของคุณ", value: "ย้ายภายในแอป · เงินยังอยู่ในบัญชีปลายทาง", tone: "text-gray-400" };
    return mode === "deposit"
      ? { label: "ยอดรวมของคุณ", value: `เพิ่มขึ้น ${text(amount, cur)}`, tone: "text-[#4EDEA3]" }
      : { label: "ยอดรวมของคุณ", value: `ลดลง ${text(amount, cur)} · นำเงินออกจากระบบ`, tone: "text-[#FFB4AB]" };
  })();

  const submit = async () => {
    if (withdrawing) return;
    if (bucketWithdrawal) {
      if (!destinationBucket || plan.error || !Number.isFinite(rate) || rate <= 0) return;
      const key = JSON.stringify([accountId, bucketId, amount, rate]);
      if (withdrawalRequest.current?.key !== key) withdrawalRequest.current = { key, id: crypto.randomUUID() };
      setWithdrawing(true);
      try { if (await transferBrokerToBucket(withdrawalRequest.current.id, accountId, bucketId, amount, rate)) onClose(); }
      finally { setWithdrawing(false); }
      return;
    }
    if (bucketFunding) {
      if (!bucketId || !accountId) return;
      onFundFromBucket(bucketId, accountId);
      return;
    }
    if (plan.error || !plan.account) return;
    const amt = text(amount, cur);
    const message =
      mode === "withdraw"
        ? `ถอน ${amt} ออกนอกแอปแล้ว — ไม่นับในยอดรวม`
        : `ฝาก ${amt} เข้า ${plan.account.name} แล้ว`;
    onSubmit(input, message);
  };

  return (
    <Sheet title="ฝาก / ถอนเงิน" onClose={onClose}>
      {/* โหมด */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/30 mb-4" role="tablist">
        {(["deposit", "withdraw"] as MoveMode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => changeMode(m)}
            className={cn(
              "py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors",
              mode === m ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
            )}
          >
            {m === "deposit" ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}
            {m === "deposit" ? "ฝากเงิน" : "ถอนเงิน"}
          </button>
        ))}
      </div>

      {/* บัญชี */}
      <div className="mb-4">
        <Label>บัญชีเงินสด</Label>
        <CustomSelect
          value={accountId}
          onChange={(val) => changeAccount(val)}
          items={(activeBrokerFilter ? state.brokers.filter(b => b.id === activeBrokerFilter) : state.brokers).map((b) => ({
            label: b.name,
            options: state.accounts
              .filter((a) => a.brokerId === b.id)
              .map((a) => ({
                value: a.id,
                label: `${a.name} · ${nf(a.balance)} ${a.currency}`,
              })),
          }))}
        />
      </div>

      {mode === "deposit" && (
        <div className="mb-4">
          <Label>แหล่งเงิน</Label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            <button type="button" role="radio" aria-checked={depositSource === "external"} onClick={() => setDepositSource("external")} className={cn("rounded-xl border px-3 py-3 text-left text-sm font-bold transition-colors", depositSource === "external" ? "border-[#4EDEA3]/50 bg-[#4EDEA3]/[0.08] text-white" : "border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/5")}>จากภายนอก<span className="mt-1 block text-[10px] font-normal text-gray-500">เงินใหม่เข้าพอร์ต</span></button>
            <button type="button" role="radio" aria-checked={depositSource === "bucket"} disabled={buckets.length === 0} onClick={() => setDepositSource("bucket")} className={cn("rounded-xl border px-3 py-3 text-left text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40", depositSource === "bucket" ? "border-[#ADC6FF]/50 bg-[#ADC6FF]/[0.08] text-white" : "border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/5")}>จาก Bucket<span className="mt-1 block text-[10px] font-normal text-gray-500">ย้ายเงินที่มีอยู่แล้ว</span></button>
          </div>
          {depositSource === "bucket" && <div className="mt-2 space-y-2"><CustomSelect value={bucketId} onChange={setBucketId} placeholder="เลือก Bucket" items={buckets.map((bucket) => ({ value: bucket.id, label: `${bucket.name} · ${nf(bucket.currentAmount)} ${bucket.currency || "USD"}` }))} /><p className="text-[11px] leading-relaxed text-gray-500">ขั้นตอนถัดไปจะให้กรอกยอดโอน และเลือกยอดรับจริงหรืออัตราแลกเปลี่ยน</p></div>}
        </div>
      )}

      {mode === 'withdraw' && <div className="mb-4 space-y-3">
        <Label>ปลายทางเงินถอน</Label>
        <CustomSelect value={withdrawTarget} onChange={value => setWithdrawTarget(value as 'external' | 'bucket')} items={[
          { value: 'external', label: 'นำออกนอกระบบ — ไม่นับในทรัพย์สินของแอป' },
          { value: 'bucket', label: 'โอนไป Bucket — ยังนับเป็นทรัพย์สิน' },
        ]} />
        {bucketWithdrawal && <>
          <CustomSelect value={bucketId} onChange={setBucketId} placeholder="เลือก Bucket ปลายทาง" items={buckets.filter(bucket => ['USD', 'THB'].includes(bucket.currency || 'USD')).map(bucket => ({ value: bucket.id, label: `${bucket.name} (${bucket.currency || 'USD'})` }))} />
          {destinationBucket?.currency !== cur && <label className="block text-xs text-gray-400">อัตราแลกเปลี่ยน ณ วันที่โอน · 1 USD = THB<input type="number" step="any" min="0" value={withdrawRate} onChange={event => setWithdrawRate(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white" /></label>}
          {destinationBucket && amount > 0 && rate > 0 && <p className="text-xs text-[#4EDEA3]">Bucket จะได้รับ {text(Math.round(amount / (cur === 'USD' ? 1 : rate) * (destinationBucket.currency === 'USD' ? 1 : rate) * 100) / 100, (destinationBucket.currency || 'USD') as Cur)}</p>}
        </>}
      </div>}
      {!bucketFunding && <div className="mb-4">
        <Label
          right={
            mode === "withdraw" && account ? (
              <button
                type="button"
                onClick={() => setAmountStr(maxInCur > 0 ? maxInCur.toFixed(2) : "")}
                className="text-[11px] font-semibold text-[#4EDEA3] hover:underline"
              >
                ถอนทั้งหมด {text(maxInCur, cur)}
              </button>
            ) : undefined
          }
        >
          จำนวนเงิน
        </Label>
        <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 pl-4 pr-2 focus-within:border-[#4EDEA3]/50 transition-colors">
          <input
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => setAmountStr(cleanNum(e.target.value, 2))}
            placeholder="0.00"
            aria-label={`จำนวนเงิน (${cur})`}
            className="flex-1 min-w-0 bg-transparent py-3.5 text-2xl font-bold text-white tabular-nums placeholder:text-gray-700 focus:outline-none"
          />
          <span className="text-sm font-bold text-gray-400">{cur}</span>
        </div>
        <p className="mt-1.5 text-[11px] text-gray-500">รายการนี้ใช้สกุลเงินเดียวกับบัญชีที่เลือก</p>
      </div>}

      <div className="mb-4 rounded-xl border border-white/10 px-3.5 py-3 text-[11px] leading-relaxed text-gray-400">{bucketWithdrawal ? 'หักเงินสดโบรกและเพิ่ม Bucket พร้อมกัน ไม่ใช่รายได้ใหม่' : bucketFunding ? 'เงินจะถูกหักจาก Bucket และเพิ่มในบัญชีเงินสดนี้พร้อมกัน' : mode === 'withdraw' ? 'เงินออกนอกบัญชีที่ติดตามในแอป ยอดทรัพย์สินจึงลดลง' : 'เงินใหม่จากภายนอก เพิ่มยอดเงินสดในโบรก'}</div>

      {/* สรุปก่อนยืนยัน — hide when bucketFunding since amount is entered in the next modal */}
      {account && amount > 0 && !plan.error && !bucketFunding && (
        <div className="rounded-xl bg-black/30 border border-white/5 p-3 mb-4 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">ยอด {account.name} หลังทำรายการ</span>
            <span className="text-white font-semibold tabular-nums">
              {text(account.balance + sign * plan.accountAmount, account.currency)}
            </span>
          </div>
          {impact && (
            <div className="flex justify-between">
              <span className="text-gray-500">{impact.label}</span>
              <span className={cn("font-semibold", impact.tone)}>{impact.value}</span>
            </div>
          )}
        </div>
      )}

      {showError && (
        <p className="flex items-center gap-1.5 text-xs text-[#FFB4AB] mb-3" role="alert">
          <AlertTriangle size={13} /> {plan.error}
        </p>
      )}

      <button onClick={submit} disabled={withdrawing || (bucketWithdrawal && (!destinationBucket || !(rate > 0))) || (bucketFunding ? !bucketId || !accountId : !!plan.error)} className={cn(PRIMARY_BTN, "w-full")}>
        {withdrawing ? 'กำลังโอน…' : bucketWithdrawal ? 'ยืนยันโอนไป Bucket' : bucketFunding ? "ระบุยอดโอนจาก Bucket" : mode === "deposit" ? "ยืนยันฝากเงิน" : "ยืนยันนำเงินออกนอกระบบ"}
      </button>
    </Sheet>
  );
}

// ─── Add / edit holding ──────────────────────────────────────────────────────

function HoldingModal({
  brokers,
  defaultBrokerId,
  defaultMarket,
  holding,
  onSave,
  onDelete,
  onClose,
}: {
  brokers: Broker[];
  defaultBrokerId: string;
  defaultMarket: Market;
  holding?: Holding;
  onSave: (h: Holding, isNew: boolean) => Promise<boolean>;
  onDelete: (holding: Holding) => void;
  onClose: () => void;
}) {
  const { fetchAssetMarketData, exchangeRates } = useApp();
  const fetchQuoteRef = React.useRef(fetchAssetMarketData);
  const [brokerId, setBrokerId] = useState(holding?.brokerId ?? defaultBrokerId);
  const [market, setMarket] = useState<Market>(holding?.market ?? defaultMarket);
  const [symbol, setSymbol] = useState(holding?.symbol ?? "");
  const [name, setName] = useState(holding?.name ?? "");
  const [shares, setShares] = useState(holding ? String(holding.shares) : "");
  const [avgCost, setAvgCost] = useState(holding ? String(holding.avgCost) : "");
  const [executionFee, setExecutionFee] = useState('0');
  const [entryMode, setEntryMode] = useState<AssetEntryMode>('IMPORT');
  const [fundingAccountId, setFundingAccountId] = useState('');
  const [executionFx, setExecutionFx] = useExecutionFxInput();
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [quoteName, setQuoteName] = useState<string>("");
  const [quoteState, setQuoteState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currency = MARKET_CURRENCY[market];
  const sharesN = parseFloat(shares);
  const costN = parseFloat(avgCost);
  const priceN = marketPrice || 0;
  const valid = symbol.trim() !== "" && sharesN > 0 && costN > 0 && priceN > 0 && quoteState === 'ready' && Number.isFinite(Number(executionFee)) && Number(executionFee) >= 0 && Number.isFinite(Number(executionFx)) && Number(executionFx) > 0;

  useEffect(() => {
    fetchQuoteRef.current = fetchAssetMarketData;
  }, [fetchAssetMarketData]);

  useEffect(() => {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) {
      setMarketPrice(null);
      setQuoteName("");
      setQuoteState('idle');
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setQuoteState('loading');
      setMarketPrice(null);
      try {
        const quote = await fetchQuoteRef.current(ticker);
        const rawPrice = Number(quote?.price || 0);
        const quoteCurrency = quote?.quoteCurrency === 'THB' || ticker.endsWith('.BK') || ticker.endsWith('.TH')
          ? 'THB'
          : 'USD';
        const conversionRate = exchangeRates.THB || DEFAULT_RATE;
        const displayPrice = quoteCurrency === currency
          ? rawPrice
          : quoteCurrency === 'THB'
            ? rawPrice / conversionRate
            : rawPrice * conversionRate;
        if (cancelled) return;
        if (displayPrice > 0) {
          setMarketPrice(displayPrice);
          setQuoteName(typeof quote?.name === 'string' ? quote.name : '');
          setQuoteState('ready');
        } else {
          setQuoteState('unavailable');
        }
      } catch {
        if (!cancelled) setQuoteState('unavailable');
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currency, exchangeRates.THB, symbol]);

  const save = async () => {
    if (!valid || isSaving) return;
    setIsSaving(true);
    try {
    const saved = await onSave({
      id: holding?.id ?? uid(),
      brokerId,
      market,
      symbol: symbol.trim().toUpperCase(),
      name: name.trim() || quoteName,
      shares: sharesN,
      avgCost: costN,
      executionFee: Number(executionFee),
      entryMode,
      fundingAccountId: entryMode === 'BUY' ? fundingAccountId : undefined,
      executionFx: Number(executionFx),
      price: priceN,
      currency,
    }, !holding);
    if (saved) onClose();
    } finally { setIsSaving(false); }
  };

  return (
    <Sheet title={holding ? `แก้ไข ${holding.symbol}` : "เพิ่มสินทรัพย์"} onClose={onClose}>
      <div className="mb-4">
        <Label>หัวข้อเริ่มต้น</Label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MARKET_LABEL) as Market[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMarket(m)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold border transition-colors",
                market === m
                  ? "border-white/60 bg-white/10 text-white"
                  : "border-white/10 text-gray-400 hover:text-white"
              )}
            >
              {MARKET_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">ภายหลังสามารถลากสินทรัพย์นี้ไปไว้ในหัวข้ออื่นของโบรกเกอร์เดียวกันได้</p>
      </div>

      <div className="mb-4">
        <Label>โบรกเกอร์</Label>
        <CustomSelect
          value={brokerId}
          onChange={(val) => setBrokerId(val)}
          items={brokers.map((b) => ({
            value: b.id,
            label: b.name,
          }))}
        />
        <p className="mt-2 text-xs text-gray-400">เมื่อเพิ่ม จะบันทึกเป็นไม้ซื้อและหักจากบัญชีเงินสด {currency} ของ {brokers.find(b => b.id === brokerId)?.name || 'โบรกเกอร์ที่เลือก'} ตามต้นทุนที่กรอก</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <Label>สัญลักษณ์</Label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="NVDA"
            className={cn(INPUT, "uppercase")}
          />
        </div>
        <div>
          <Label>ชื่อ (ไม่บังคับ)</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="NVIDIA" className={INPUT} />
        </div>
      </div>

      <div className="mb-4">
        <Label>จำนวนหน่วยที่ถือ</Label>
        <input
          inputMode="decimal"
          value={shares}
          onChange={(e) => setShares(cleanNum(e.target.value, 6))}
          placeholder="0.000000"
          className={INPUT}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <Label>ต้นทุนเฉลี่ย ({currency})</Label>
          <input
            inputMode="decimal"
            value={avgCost}
            onChange={(e) => setAvgCost(cleanNum(e.target.value, 4))}
            placeholder="0.00"
            className={INPUT}
          />
        </div>
        <div>
          <Label>ราคาตลาดล่าสุด ({currency})</Label>
          <div className={cn(INPUT, "flex items-center justify-between cursor-default", quoteState === 'unavailable' && "border-[#FFB4AB]/40")}>
            <span className={cn("tabular-nums", quoteState === 'ready' ? "text-white" : "text-gray-500")}>
              {quoteState === 'loading' ? 'กำลังดึงราคา…' : quoteState === 'ready' ? marketPrice?.toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'ไม่พบราคาตลาด'}
            </span>
            <span className="text-[10px] font-black text-[#4EDEA3]">MARKET</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mb-4">
        ราคาตลาดอัปเดตอัตโนมัติทุก 30 วินาที ไม่ต้องกดบันทึกเพื่ออัปเดตราคา ข้อมูลอาจล่าช้าตามผู้ให้บริการ
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <label><Label>ค่าธรรมเนียมซื้อ ({currency})</Label><input className={INPUT} type="number" min="0" step="any" value={executionFee} onChange={e => setExecutionFee(e.target.value)} /></label>
        <label><Label>1 USD = กี่ THB ณ วันซื้อ</Label><input className={INPUT} type="number" min="0" step="any" value={executionFx} onChange={e => setExecutionFx(e.target.value)} /></label>
      </div>
      <div className="mb-4"><AssetFundingFields portfolioId={brokerId} currency={currency} mode={entryMode} onModeChange={setEntryMode} accountId={fundingAccountId} onAccountChange={setFundingAccountId} /></div>
      <p className="mb-4 text-xs text-gray-400">{entryMode === 'BUY' ? 'หักเงินรวมค่าธรรมเนียม' : 'ต้นทุนรวมค่าธรรมเนียม (ไม่ตัดเงิน)'} {((sharesN * costN || 0) + (Number(executionFee) || 0)).toLocaleString()} {currency} · เรทนี้เก็บกับรายการ ไม่เปลี่ยนเรทตลาด</p>

      <div className="flex gap-3">
        {holding && (
          <button
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              onDelete(holding);
              onClose();
            }}
            className={cn(
              "rounded-xl border px-4 text-sm font-bold flex items-center gap-2 transition-colors",
              confirmDelete
                ? "bg-[#FFB4AB]/20 border-[#FFB4AB]/50 text-[#FFB4AB]"
                : "border-white/10 text-gray-400 hover:text-[#FFB4AB]"
            )}
          >
            <Trash2 size={14} />
            {confirmDelete ? "ยืนยันลบ" : "ลบ"}
          </button>
        )}
        <button onClick={save} disabled={!valid || isSaving} className={cn(PRIMARY_BTN, "flex-1")}>
          {holding ? "บันทึกการแก้ไข" : "เพิ่มสินทรัพย์"}
        </button>
      </div>
    </Sheet>
  );
}

// ─── Add broker / bucket ─────────────────────────────────────────────────────

function BrokerModal({
  broker,
  usedCount,
  deleteBlockedReason,
  onSave,
  onDelete,
  onClose,
}: {
  broker?: Broker;
  usedCount: number;
  /** ถ้ามีค่า = ลบไม่ได้ และแสดงเหตุผลนี้ */
  deleteBlockedReason?: string;
  onSave: (name: string, color: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(broker?.name ?? "");
  const [color, setColor] = useState(broker?.color ?? BROKER_COLORS[usedCount % BROKER_COLORS.length]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Sheet title={broker ? "แก้ไขโบรกเกอร์" : "เพิ่มโบรกเกอร์"} onClose={onClose}>
      <div className="mb-4">
        <Label>ชื่อโบรกเกอร์</Label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น Dime, InnovestX, Streaming"
          className={INPUT}
        />
      </div>
      <div className="mb-4">
        <Label>สีประจำโบรก</Label>
        <div className="flex gap-2">
          {BROKER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`สี ${c}`}
              onClick={() => setColor(c)}
              className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-transform hover:scale-110"
              style={{ background: c, borderColor: color === c ? "#fff" : "transparent" }}
            >
              {color === c && <Check size={14} className="text-black" />}
            </button>
          ))}
        </div>
      </div>
      {!broker && (
        <p className="text-[11px] text-gray-500 mb-4">
          ระบบจะสร้างบัญชีเงินสดมาตรฐาน THB และ USD ให้อัตโนมัติ เพื่อให้ยอดเงินและประวัติการโอนตรงกัน
        </p>
      )}
      {broker && deleteBlockedReason && <p className="text-[11px] text-gray-500 mb-4">ลบโบรกนี้ไม่ได้: {deleteBlockedReason}</p>}
      <div className="flex gap-3">
        {broker && onDelete && !deleteBlockedReason && (
          <button
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              onDelete();
              onClose();
            }}
            className={cn(
              "rounded-xl border px-4 text-sm font-bold flex items-center gap-2 transition-colors",
              confirmDelete
                ? "bg-[#FFB4AB]/20 border-[#FFB4AB]/50 text-[#FFB4AB]"
                : "border-white/10 text-gray-400 hover:text-[#FFB4AB]"
            )}
          >
            <Trash2 size={14} />
            {confirmDelete ? "ยืนยันลบ" : "ลบ"}
          </button>
        )}
        <button
          disabled={name.trim() === ""}
          onClick={() => {
            onSave(name.trim(), color);
            onClose();
          }}
          className={cn(PRIMARY_BTN, "flex-1")}
        >
          {broker ? "บันทึกการแก้ไข" : "เพิ่มโบรกเกอร์"}
        </button>
      </div>
    </Sheet>
  );
}

/** เพิ่ม / แก้ชื่อ / ลบ บัญชีเงินสดของแต่ละโบรก (ชื่อบัญชีไม่ได้ตายตัวเหมือนแอปใดแอปหนึ่ง) */
function AccountModal({
  brokers,
  defaultBrokerId,
  account,
  deleteBlockedReason,
  onAdd,
  onRename,
  onDelete,
  onClose,
}: {
  brokers: Broker[];
  defaultBrokerId: string;
  account?: CashAccount;
  deleteBlockedReason?: string;
  onAdd: (brokerId: string, name: string, cur: Cur) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [brokerId, setBrokerId] = useState(account?.brokerId ?? defaultBrokerId);
  const [cur, setCur] = useState<Cur>(account?.currency ?? "THB");
  const [name, setName] = useState(account?.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const finalName = name.trim() || `เงินสด ${cur}`;

  return (
    <Sheet title={account ? "แก้ไขบัญชีเงินสด" : "เพิ่มบัญชีเงินสด"} onClose={onClose}>
      {!account && (
        <div className="mb-4">
          <Label>โบรกเกอร์</Label>
          <div className="grid gap-2" role="radiogroup" aria-label="เลือกโบรกเกอร์">
            {brokers.map((broker) => {
              const selected = broker.id === brokerId;
              return (
                <button
                  key={broker.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setBrokerId(broker.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                    selected
                      ? "border-[#ADC6FF]/60 bg-[#ADC6FF]/10 text-white"
                      : "border-white/10 bg-black/20 text-gray-400 hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: broker.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{broker.name}</span>
                  {selected && <Check size={16} className="shrink-0 text-[#ADC6FF]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mb-4">
        <Label>ชื่อบัญชี</Label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`เช่น เงินสด ${cur}, บัญชีพักเงิน, Save`}
          className={INPUT}
        />
      </div>
      <div className="mb-4">
        <Label>สกุลเงินของบัญชี</Label>
        {account ? (
          <>
            <AccountCurrencyPicker value={account.currency} locked />
            <p className="mt-2 text-[11px] text-gray-500">สกุลเงินของบัญชีที่สร้างแล้วเปลี่ยนไม่ได้</p>
          </>
        ) : (
          <>
            <AccountCurrencyPicker value={cur} onChange={setCur} />
            <p className="mt-2 text-[11px] text-gray-500">ยอดเงินในบัญชีนี้จะเก็บเป็นสกุลเงินที่เลือก</p>
          </>
        )}
      </div>
      {account && deleteBlockedReason && <p className="text-[11px] text-gray-500 mb-4">ลบบัญชีนี้ไม่ได้: {deleteBlockedReason}</p>}
      <div className="flex gap-3">
        {account && !deleteBlockedReason && (
          <button
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              onDelete(account.id);
              onClose();
            }}
            className={cn(
              "rounded-xl border px-4 text-sm font-bold flex items-center gap-2 transition-colors",
              confirmDelete
                ? "bg-[#FFB4AB]/20 border-[#FFB4AB]/50 text-[#FFB4AB]"
                : "border-white/10 text-gray-400 hover:text-[#FFB4AB]"
            )}
          >
            <Trash2 size={14} />
            {confirmDelete ? "ยืนยันลบ" : "ลบ"}
          </button>
        )}
        <button
          onClick={() => {
            if (account) onRename(account.id, finalName);
            else onAdd(brokerId, finalName, cur);
            onClose();
          }}
          className={cn(PRIMARY_BTN, "flex-1")}
        >
          {account ? "บันทึกการแก้ไข" : "เพิ่มบัญชี"}
        </button>
      </div>
    </Sheet>
  );
}

function BucketModal({ onSave, onClose }: { onSave: (name: string, cur: Cur) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [cur, setCur] = useState<Cur>("THB");
  return (
    <Sheet title="เพิ่ม Bucket" onClose={onClose}>
      <div className="mb-4">
        <Label>ชื่อ Bucket</Label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น เงินสำรองฉุกเฉิน"
          className={INPUT}
        />
      </div>
      <div className="mb-4">
        <Label>สกุลเงิน</Label>
        <CurrencyToggle value={cur} onChange={setCur} />
      </div>
      <p className="text-[11px] text-gray-500 mb-4">
        Bucket คือที่พักเงินนอกโบรกเกอร์ ที่ยังนับรวมในยอดทั้งหมดของคุณ
      </p>
      <button
        disabled={name.trim() === ""}
        onClick={() => {
          onSave(name.trim(), cur);
          onClose();
        }}
        className={cn(PRIMARY_BTN, "w-full")}
      >
        เพิ่ม Bucket
      </button>
    </Sheet>
  );
}

// ─── Page sections ───────────────────────────────────────────────────────────

const BUCKET_COLOR = "#8b8b95";
const symbolOf = (c: Cur) => (c === "USD" ? "$" : c === 'THB' ? "฿" : '');

function RateEditor({
  rate,
  onChange,
  isCustom,
  onResetAuto,
}: {
  rate: number | null;
  onChange: (r: number) => void;
  isCustom?: boolean;
  onResetAuto?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(rate));
  const cancelled = React.useRef(false);

  const commit = () => {
    const n = parseFloat(val);
    if (!cancelled.current && Number.isFinite(n) && n > 0) onChange(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-300">
        1 USD =
        <input
          autoFocus
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(cleanNum(e.target.value, 4))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              cancelled.current = true;
              setEditing(false);
            }
          }}
          aria-label="อัตราแลกเปลี่ยน THB ต่อ 1 USD"
          className="w-20 bg-black/40 border border-white/20 rounded px-1.5 py-0.5 text-white tabular-nums focus:outline-none focus:border-[#4EDEA3]/60"
        />
        THB
      </span>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        onClick={() => {
          cancelled.current = false;
          setVal(rate === null ? '' : String(rate));
          setEditing(true);
        }}
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        title="แก้อัตราแลกเปลี่ยน (คลิกเพื่อแก้ไข)"
      >
        1 USD = {rate === null || !Number.isFinite(rate) ? '—' : rate.toLocaleString('en-US', { maximumFractionDigits: 4 })} THB
        <Pencil size={11} className="text-gray-500" />
      </button>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#4EDEA3]/15 text-[#4EDEA3] font-semibold">{isCustom ? 'Manual' : 'Auto'}</span>
      {isCustom && onResetAuto && (
        <button
          onClick={onResetAuto}
          className="text-[10px] px-1.5 py-0.5 rounded bg-[#4EDEA3]/15 text-[#4EDEA3] hover:bg-[#4EDEA3]/25 font-semibold transition-colors"
          title="รีเซ็ตเป็น Auto (ดึงจาก API)"
        >
          กลับเป็น Auto
        </button>
      )}
    </div>
  );
}

interface Segment {
  label: string;
  value: number;
  color: string;
}

/** วงแหวนสัดส่วน: เปลี่ยนความหมายตามแท็บ (โบรก / เงินสดแยกสกุล / สินทรัพย์รายตัว) */
function Donut({ segments }: { segments: Segment[] }) {
  const sum = segments.reduce((s, x) => s + x.value, 0);
  const R = 44;
  const C = 2 * Math.PI * R;
  const gap = segments.length > 1 ? 2.5 : 0;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative w-[124px] h-[124px] shrink-0">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" role="img" aria-label="สัดส่วนสินทรัพย์">
          <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="13" strokeDasharray={sum > 0 ? undefined : "3 6"} />
          {sum > 0 &&
            segments.map((s) => {
              const len = (s.value / sum) * C;
              const dash = Math.max(len - gap, 0.5);
              const el = (
                <circle
                  key={s.label}
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="13"
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                  style={{ transition: "stroke-dasharray .6s ease, stroke-dashoffset .6s ease" }}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <PieChart size={22} />
        </div>
      </div>
      <ul className="space-y-1.5 min-w-[130px]">
        {sum > 0 ? (
          segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-gray-300 truncate max-w-[110px]">{s.label}</span>
              <span className="ml-auto text-gray-500 tabular-nums">{nf((s.value / sum) * 100, 1)}%</span>
            </li>
          ))
        ) : (
          <li className="text-xs text-gray-600 leading-relaxed">ยังไม่มีข้อมูล
            <br />ฝากเงินหรือเพิ่มสินทรัพย์เพื่อดูสัดส่วน</li>
        )}
      </ul>
    </div>
  );
}

function SummaryCard({
  isCash,
  dateLabel,
  items,
  accountCount,
  isFilterCustomized,
  excludedFilterLabels = [],
  onOpenFilter,
  onResetFilter,
}: {
  isCash: boolean;
  dateLabel: string;
  items: ValuationItem[];
  accountCount: number;
  isFilterCustomized?: boolean;
  excludedFilterLabels?: string[];
  onOpenFilter?: () => void;
  onResetFilter?: () => void;
}) {
  // FX and currency selection live only in this card; they cannot rewrite lots,
  // refresh the whole AppContext or alter historical transaction formatting.
  const fx = useFxRate();
  const hidden = useContext(HideContext);
  const [requestedDisplay, onDisplay] = useState<Cur>('THB');
  const display = fx.rate ? requestedDisplay : 'USD';
  const valuation = valuePortfolio(items, display, fx.rate);
  const alternate = valuePortfolio(items, otherCur(display), fx.rate);
  const { total, cost, profit, profitPct, segments } = valuation;
  const text = (value: Decimal | null, cur: Cur, signed = false) => hidden ? MASK : value === null ? 'unresolved' : formatFxMoney(value, cur, signed);
  const other = otherCur(display);
  const up = !profit || profit.cmp(decimal('0')) >= 0;
  const flat = !profit || profit.toFixed(2) === '0.00';
  const tone = flat ? "#9ca3af" : up ? GAIN : LOSS;

  return (
    <section
      className="relative rounded-2xl border border-white/[0.1] overflow-hidden shadow-[0_16px_48px_-28px_rgba(0,0,0,0.65)]"
      style={{ background: "radial-gradient(ellipse at 95% 0%, rgba(78,222,163,0.1), transparent 62%), linear-gradient(135deg, #222827, #181b1e 70%)" }}
    >
      <div aria-hidden className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#9ECBB5]/60 to-transparent" />

      <div className="flex items-center justify-between gap-3 px-5 sm:px-7 pt-6">
        <div className="text-sm text-gray-300">
          {isCash ? "ยอดเงินรวม" : "มูลค่าสินทรัพย์ทั้งหมด"}{" "}
          {dateLabel && <span className="mt-1 block text-xs text-gray-500">อัปเดต {dateLabel}</span>}
        </div>
        <div className="flex items-center gap-2">
          {onOpenFilter && !isCash && (
            <button
              type="button"
              onClick={onOpenFilter}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                isFilterCustomized
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                  : "border-white/10 bg-white/[0.04] text-gray-300 hover:text-white hover:bg-white/[0.08]"
              )}
              title="ตั้งค่าตัวกรองยอดรวม (เลือกซ่อน/แสดง Bucket, เงินสด, หรือตลาดสินทรัพย์)"
            >
              <SlidersHorizontal size={13} />
              <span className="hidden sm:inline">
                {isFilterCustomized ? "ตัวกรองกำหนดเอง" : "ตัวกรองยอดรวม"}
              </span>
              {isFilterCustomized && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          )}
          <CurrencyToggle value={display} onChange={onDisplay} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-6 px-5 sm:px-7 py-6">
        <div className="min-w-0 flex-[1_1_280px]">
          <Money
            value={0}
            exactValue={total}
            cur={display}
            className="block text-4xl sm:text-5xl font-semibold tracking-tight text-white"
            decimalClass="text-[0.5em] text-gray-300"
            curClass="text-[0.38em] text-gray-400"
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm text-gray-300 tabular-nums">≈ {text(fx.rate ? alternate.total : null, other)}</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <RateEditor rate={fx.rate ? Number(fx.rate) : null} onChange={value => fx.setManual(String(value))} isCustom={fx.mode === 'manual'} onResetAuto={fx.resetAuto} />
            <span className="text-[10px] text-gray-500" aria-live="polite">
              {!fx.rate ? 'ไม่มีข้อมูลเรท' : fx.mode === 'auto' && fx.quote ? `${fx.stale ? 'เรทเก่า · ' : ''}ข้อมูล ณ เวลา  ${new Date(fx.quote.fetchedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          </div>
          <div className="mt-1.5 text-sm text-gray-500">
            {isCash ? `${accountCount} บัญชี` : <>ต้นทุนรวม {text(cost, display)}{display === 'THB' && <span className="ml-2 text-[10px]">คำนวณที่เรทปัจจุบัน</span>}</>}
          </div>

          {excludedFilterLabels.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-3.5 py-2 text-xs text-amber-300">
              <div className="flex items-center gap-2 min-w-0">
                <SlidersHorizontal size={13} className="shrink-0" />
                <span className="truncate">ไม่รวม: {excludedFilterLabels.join(" · ")}</span>
              </div>
              {onOpenFilter && (
                <button
                  type="button"
                  onClick={onOpenFilter}
                  className="shrink-0 font-semibold underline hover:text-white transition-colors"
                >
                  แก้ไข
                </button>
              )}
            </div>
          )}

          {isFilterCustomized && excludedFilterLabels.length === 0 && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.08] px-3.5 py-2 text-xs text-sky-300">
              <div className="flex items-center gap-2 min-w-0">
                <SlidersHorizontal size={12} className="shrink-0 text-sky-400" />
                <span className="truncate">ตัวกรองยอดรวมกำลังทำงาน</span>
              </div>
              {onResetFilter && (
                <button
                  type="button"
                  onClick={onResetFilter}
                  className="shrink-0 font-semibold underline hover:text-white transition-colors"
                >
                  แสดงทั้งหมด
                </button>
              )}
            </div>
          )}
        </div>
        {segments.length > 0 && <Donut segments={segments} />}
      </div>

      {!isCash && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-t border-white/[0.08]">
          <span className="text-sm text-gray-400">กำไร / ขาดทุนที่ยังไม่ขาย{display === 'THB' && <span className="ml-2 text-[10px]">คำนวณที่เรทปัจจุบัน</span>}</span>
          <span className="flex items-center gap-1.5 text-sm sm:text-base font-bold tabular-nums" style={{ color: tone }}>
            {!flat && (up ? <TrendingUp size={16} /> : <TrendingDown size={16} />)}
            {profit ? formatAmount(profitPct).replace('-', '') : '—'}% ({text(profit, display, true)})
          </span>
        </div>
      )}
    </section>
  );
}

function AccountCard({
  account,
  weight,
  rate,
  onMove,
}: {
  account: CashAccount;
  weight: number;
  rate: number;
  onMove: (mode: MoveMode, accountId: string) => void;
}) {
  const text = useMoneyText();
  const isThb = account.currency === "THB";
  const tone = isThb ? "#4EDEA3" : "#8B6CFF";
  const other = otherCur(account.currency);

  return (
    <div
      className="flex flex-col rounded-2xl border border-white/[0.08] p-5 transition-colors hover:border-white/15"
      style={{ background: `radial-gradient(ellipse at 0% 0%, ${tone}16, transparent 75%), #181b1e` }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 shrink-0 rounded-lg bg-white/5 text-gray-300 flex items-center justify-center text-base font-medium"
            style={{ backgroundColor: `${tone}12`, color: tone }}
          >
            {symbolOf(account.currency)}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white truncate">{account.name}</div>
            <div className="text-[11px] text-gray-500 tabular-nums">
              {account.currency} · สัดส่วน {nf(weight)}%
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 mb-4">
        <Money
          value={account.balance}
          cur={account.currency}
          className="block text-3xl font-semibold tracking-tight text-white"
          decimalClass="text-[0.55em] text-gray-300"
          curClass="text-[0.4em] text-gray-400"
        />
        <div className="text-xs text-gray-500 tabular-nums mt-1">≈ {text(convert(account.balance, account.currency, other, rate), other)}</div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <button
          onClick={() => onMove("deposit", account.id)}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] text-gray-200 text-sm font-medium py-2.5 transition-colors hover:bg-white/10"
        >
          <ArrowDownToLine size={14} />
          ฝาก
        </button>
        <button
          onClick={() => onMove("withdraw", account.id)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 text-gray-300 text-sm font-medium py-2.5 hover:bg-white/5 transition-colors"
        >
          <ArrowUpFromLine size={14} />
          ถอน
        </button>
      </div>
    </div>
  );
}

function AddAccountCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="min-h-[170px] rounded-2xl border border-dashed border-white/15 text-gray-500 hover:text-white hover:border-white/30 hover:bg-white/[0.02] flex flex-col items-center justify-center gap-2 text-sm font-bold transition-colors"
    >
      <span className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
        <Plus size={16} />
      </span>
      เพิ่มบัญชีเงินสด
    </button>
  );
}

function HoldingRow({
  holding,
  weight,
  brokerName,
  brokerColor,
  rate,
  onClick,
}: {
  holding: Holding;
  weight: number;
  brokerName?: string;
  brokerColor: string;
  rate: number;
  onClick: () => void;
}) {
  const text = useMoneyText();
  const tabColor = TABS.find((t) => t.key === holding.market)?.color ?? ACCENT;
  const value = holdingValue(holding);
  const profit = value - holdingCost(holding);
  const pct = holdingCost(holding) > 0 ? (profit / holdingCost(holding)) * 100 : 0;
  const up = profit >= 0;
  const flat = Math.abs(profit) < 0.005;
  const tone = flat ? "#9ca3af" : up ? GAIN : LOSS;
  const other = otherCur(holding.currency);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-4 text-left hover:bg-white/[0.03] transition-colors px-1 rounded-lg"
      aria-label={`แก้ไข ${holding.symbol}`}
    >
      <div
        className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-xs font-black"
        style={{ background: `${tabColor}25`, color: tabColor }}
      >
        {holding.symbol.slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-white truncate">{holding.symbol}</div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
          <PieChart size={11} className="shrink-0" />
          <span className="tabular-nums">{nf(weight)}%</span>
          {brokerName && (
            <>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: brokerColor }} />
              <span className="truncate">{brokerName}</span>
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <Money value={value} cur={holding.currency} className="text-base font-bold text-white" decimalClass="" curClass="text-[11px] text-gray-400" />
        <div className="text-[11px] text-gray-500 tabular-nums">
          ≈ {text(convert(value, holding.currency, other, rate), other)}
        </div>
      </div>
      <div className="text-right shrink-0 w-24 sm:w-28 tabular-nums" style={{ color: tone }}>
        <div className="flex items-center justify-end gap-1 text-sm font-bold">
          {!flat && (up ? <TrendingUp size={13} /> : <TrendingDown size={13} />)}
          {nf(Math.abs(pct))}%
        </div>
        <div className="text-[11px]">({text(profit, holding.currency, true)})</div>
      </div>
    </button>
  );
}

function HoldingGroupModal({
  brokers,
  defaultBrokerId,
  onSave,
  onClose,
}: {
  brokers: Broker[];
  defaultBrokerId: string;
  onSave: (brokerId: string, name: string) => void;
  onClose: () => void;
}) {
  const [brokerId, setBrokerId] = useState(defaultBrokerId || brokers[0]?.id || "");
  const [name, setName] = useState("");
  return (
    <Sheet title="เพิ่มหัวข้อสินทรัพย์" onClose={onClose}>
      <div className="mb-4"><Label>โบรกเกอร์</Label><CustomSelect value={brokerId} onChange={setBrokerId} items={brokers.map((broker) => ({ value: broker.id, label: broker.name }))} /></div>
      <div className="mb-5"><Label>ชื่อหัวข้อ</Label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น หุ้นปันผล, ETF ระยะยาว" className={INPUT} /><p className="mt-2 text-[11px] leading-relaxed text-gray-500">หัวข้อนี้แยกเฉพาะโบรกเกอร์ที่เลือก และสามารถใส่สินทรัพย์เดิมได้โดยไม่ทำให้ยอดรวมซ้ำ</p></div>
      <button type="button" disabled={!brokerId || !name.trim()} onClick={() => { onSave(brokerId, name); onClose(); }} className={cn(PRIMARY_BTN, "w-full")}>เพิ่มหัวข้อ</button>
    </Sheet>
  );
}

function HoldingGroupBoard({
  group,
  availableHoldings,
  brokerName,
  holdings,
  total,
  rate,
  onDropHolding,
  onRemoveHolding,
  onEditHolding,
  onDeleteGroup,
}: {
  group: HoldingGroup;
  availableHoldings: Holding[];
  brokerName?: string;
  holdings: Holding[];
  total: number;
  rate: number;
  onDropHolding: (holdingId: string) => void;
  onRemoveHolding: (holdingId: string) => void;
  onEditHolding: (holding: Holding) => void;
  onDeleteGroup: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const candidates = availableHoldings.filter(item => item.brokerId === group.brokerId && !holdings.some(placed => placed.id === item.id) && item.symbol.toLowerCase().includes(query.trim().toLowerCase()));
  const text = useMoneyText();
  const color = group.market ? TABS.find((tab) => tab.key === group.market)?.color ?? ACCENT : "#FF9EC4";
  return (
    <section
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => { event.preventDefault(); setDragOver(false); const holdingId = event.dataTransfer.getData("text/plain"); if (holdingId) onDropHolding(holdingId); }}
      className={cn("min-w-0 rounded-2xl border p-4 transition-colors", dragOver ? "border-[#4EDEA3]/70" : "border-white/[0.08]")}
      style={{ background: `linear-gradient(145deg, ${color}${dragOver ? "20" : "0a"}, transparent 65%), #181b1e` }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-0.5 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-white">{group.name}</h3>{brokerName && <p className="mt-0.5 text-xs text-gray-500">{brokerName}</p>}</div>
        {!group.isDefault && <button type="button" onClick={onDeleteGroup} aria-label={`ลบหัวข้อ ${group.name}`} className="rounded-lg p-1 text-gray-500 hover:bg-white/5 hover:text-[#FFB4AB]"><X size={14} /></button>}
        <span className="text-xs tabular-nums text-gray-400">{holdings.length}</span>
        <button type="button" onClick={() => setChoosing(value => !value)} aria-expanded={choosing} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#4EDEA3] hover:bg-white/5">{choosing ? 'ซ่อนตัวเลือกสินทรัพย์' : '+ เลือกสินทรัพย์'}</button>
      </div>
      {choosing && <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหา symbol ในโบรกนี้" aria-label={`ค้นหาสินทรัพย์สำหรับ ${group.name}`} className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white" />
        <p className="mb-2 text-xs text-gray-400">กดเพิ่ม หรือลากจากรายการนี้ลงหัวข้อ · ไม่เพิ่มจำนวนหุ้นหรือหักเงิน</p>
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">{candidates.map(item => <button key={item.id} type="button" draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('text/plain', item.id); }} onClick={() => onDropHolding(item.id)} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white hover:border-[#4EDEA3]/50"><AssetLogo symbol={item.symbol} /><span>{item.symbol}</span><Plus size={14} /></button>)}{candidates.length === 0 && <p className="text-xs text-gray-400">ไม่มีสินทรัพย์ที่ยังไม่อยู่ในหัวข้อนี้ตรงกับคำค้น</p>}</div>
      </div>}
      {holdings.length === 0 ? <div className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.08] px-3 text-xs text-gray-500"><Plus size={14} strokeWidth={1.5} />วางสินทรัพย์ที่นี่</div> : <div className="overflow-x-auto rounded-xl" tabIndex={0} aria-label={`ตารางสินทรัพย์ ${group.name}`}>
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="border-b border-white/[0.08] text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="min-w-[220px] px-3 py-3 font-semibold">Asset</th>
              <th scope="col" className="px-3 py-3 font-semibold">Price / Avg Cost</th>
              <th scope="col" className="px-3 py-3 font-semibold">Holdings</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Unrealized P/L</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Realized P/L</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold" title="กำไรที่ยังไม่ขาย + กำไรที่ขายแล้ว + ปันผล เทียบกับต้นทุนซื้อสะสม">Total Return</th>
              <th scope="col" className="w-20 px-2 py-3"><span className="sr-only">จัดการสินทรัพย์</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {holdings.map(holding => <HoldingTableRow key={holding.id} holding={holding} color={color} total={total} rate={rate} groupName={group.name} onEdit={() => onEditHolding(holding)} onRemove={() => onRemoveHolding(holding.id)} />)}
          </tbody>
        </table>
      </div>}
    </section>
  );
}

function HoldingTableRow({ holding: h, color, total, rate, groupName, onEdit, onRemove }: {
  holding: Holding; color: string; total: number; rate: number; groupName: string; onEdit: () => void; onRemove: () => void;
}) {
  const hidden = useContext(HideContext);
  const text = useMoneyText();
  const value = holdingValue(h);
  const cost = holdingCost(h);
  const unrealized = value - cost;
  const realized = h.realizedPL || 0;
  const totalReturn = unrealized + realized + (h.dividends || 0);
  const invested = h.investedCost ?? cost;
  const percent = (amount: number, basis: number) => hidden ? MASK : basis > 0 ? `${amount > 0 ? '+' : ''}${nf(amount / basis * 100)}%` : '—';
  const profitColor = (amount: number) => moneyDisplaySign(amount) > 0 ? 'text-[#4EDEA3]' : moneyDisplaySign(amount) < 0 ? 'text-[#FFB4AB]' : 'text-gray-400';
  return <tr draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('text/plain', h.id); }} className="group transition-colors hover:bg-white/[0.025]">
    <td className="px-3 py-5">
      <button type="button" onClick={onEdit} className="flex items-center gap-3 text-left" aria-label={`แก้ไข ${h.symbol}`}>
        <GripVertical size={13} className="shrink-0 cursor-grab text-gray-600" />
        <AssetLogo symbol={h.symbol} color={color} size="sm" />
        <span><span className="block max-w-[190px] truncate font-semibold text-white" title={h.name}>{h.name || h.symbol}</span><span className="mt-1 block text-xs text-gray-400">{hidden ? MASK : h.shares.toLocaleString(undefined, { maximumFractionDigits: 6 })} หน่วย · {h.symbol}</span><span className="mt-1 block text-[10px] text-gray-500">{hidden ? MASK : nf(total > 0 ? convert(value, h.currency, 'THB', rate) / total * 100 : 0)}% ของสินทรัพย์</span></span>
      </button>
    </td>
    <td className="px-3 py-5 tabular-nums"><span className="block font-semibold text-white">{text(h.price, h.currency)}</span><span className="mt-1.5 block whitespace-nowrap text-[11px] text-gray-400">Avg {text(h.avgCost, h.currency)}</span></td>
    <td className="px-3 py-5 tabular-nums"><span className="block whitespace-nowrap font-semibold text-white">{text(value, h.currency)}</span><span className="mt-1.5 block whitespace-nowrap text-[11px] text-gray-400">≈ {text(convert(value, h.currency, h.currency === 'USD' ? 'THB' : 'USD', rate), h.currency === 'USD' ? 'THB' : 'USD')}</span></td>
    <td className={cn('px-3 py-5 text-right tabular-nums', profitColor(unrealized))}><span className="block font-semibold">{percent(unrealized, cost)}</span><span className="mt-1.5 block whitespace-nowrap text-[11px]">{text(unrealized, h.currency, true)}</span></td>
    <td className={cn('px-3 py-5 text-right tabular-nums', profitColor(realized))}><span className="block whitespace-nowrap font-semibold">{text(realized, h.currency, true)}</span><span className="mt-1.5 block text-[11px] text-gray-500">กำไรที่ขายแล้ว</span></td>
    <td className={cn('px-3 py-5 text-right tabular-nums', profitColor(totalReturn))} title={`รวมปันผล ${text(h.dividends || 0, h.currency)}`}><span className="block font-semibold">{percent(totalReturn, invested)}</span><span className="mt-1.5 block whitespace-nowrap text-[11px]">{text(totalReturn, h.currency, true)}</span></td>
    <td className="px-2 py-5"><div className="flex items-center"><button type="button" onClick={onEdit} aria-label={`แก้ไข ${h.symbol}`} className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white"><Pencil size={14} /></button><button type="button" onClick={onRemove} aria-label={`เอา ${h.symbol} ออกจาก ${groupName}`} title="เอาออกจากหัวข้อนี้เท่านั้น ไม่ลบหุ้น" className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-[#FFB4AB]"><X size={14} /></button></div></td>
  </tr>;
}

function AssetLogo({ symbol, color = "#ADC6FF", size = "md" }: { symbol: string; color?: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl";
  if (failed) {
    return <span className={cn("flex shrink-0 items-center justify-center border border-white/10 bg-white/[0.04] text-[10px] font-black", dimensions)} style={{ color }}>{symbol.slice(0, 2)}</span>;
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/[0.04]", dimensions)}>
      <img
        src={`https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}?format=png`}
        alt=""
        className="h-full w-full object-contain p-1"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function HoldingTray({
  brokers,
  holdings,
  placementCounts,
  onEdit,
  onMoveHolding,
}: {
  brokers: Broker[];
  holdings: Holding[];
  placementCounts: Map<string, number>;
  onEdit: (holding: Holding) => void;
  onMoveHolding: (holdingId: string, brokerId: string) => void;
}) {
  const [dragOverBrokerId, setDragOverBrokerId] = useState<string | null>(null);
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#1d2329] to-[#171a1e] p-5">
      <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-white">สินทรัพย์ทั้งหมด</h2><span className="text-xs tabular-nums text-gray-400">{holdings.length}</span></div>
      <p className="mb-5 text-xs leading-relaxed text-gray-400">ลากเพื่อเพิ่มลงในหัวข้อ</p>
      {holdings.length === 0 ? <p className="rounded-xl bg-black/20 px-3 py-4 text-center text-sm text-gray-600">ยังไม่มีสินทรัพย์</p> : <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
        {brokers.map((broker) => {
          const items = holdings.filter((holding) => holding.brokerId === broker.id);
          return <div
            key={broker.id}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverBrokerId(broker.id); }}
            onDragLeave={() => setDragOverBrokerId((current) => current === broker.id ? null : current)}
            onDrop={(event) => { event.preventDefault(); setDragOverBrokerId(null); const holdingId = event.dataTransfer.getData("text/plain"); if (holdingId) onMoveHolding(holdingId, broker.id); }}
            className={cn("rounded-xl border p-2 transition-colors", dragOverBrokerId === broker.id ? "border-[#4EDEA3]/70 bg-[#4EDEA3]/5" : "border-transparent")}
          ><p className="mb-1.5 flex items-center gap-2 text-[11px] font-bold text-gray-500"><span className="h-2 w-2 rounded-full" style={{ background: broker.color }} />{broker.name}<span className="ml-auto text-[10px] font-medium text-gray-600">วางเพื่อย้ายพอร์ต</span></p><div className="space-y-1.5">
            {items.map((holding) => <button key={holding.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/plain", holding.id); }} onClick={() => onEdit(holding)} className="flex w-full cursor-grab items-center gap-3 rounded-lg border border-transparent px-2 py-3 text-left transition-colors hover:border-white/10 hover:bg-white/[0.04] active:cursor-grabbing">
              <AssetLogo symbol={holding.symbol} color={broker.color} size="sm" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-white">{holding.symbol}</span><span className="mt-0.5 block text-xs text-gray-500">{placementCounts.get(holding.id) || 0} หัวข้อ</span></span>
              <GripVertical size={16} strokeWidth={1.5} className="shrink-0 text-gray-500" />
            </button>)}
            {!items.length && <div className="flex min-h-12 items-center justify-center rounded-lg border border-dashed border-white/[0.08] px-2 text-[10px] text-gray-600">ลากสินทรัพย์มาวางที่นี่</div>}
          </div></div>;
        })}
      </div>}
    </section>
  );
}

function EmptyHoldings({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-12">
      <FolderOpen size={24} strokeWidth={1.5} className="mb-4 text-gray-500" />
      <p className="text-sm text-gray-400 mb-5">ยังไม่มีสินทรัพย์ในพอร์ตนี้</p>
      <button onClick={onAdd} className={cn(PRIMARY_BTN, "px-10")}>
        เพิ่มสินทรัพย์
      </button>
    </div>
  );
}

function BucketsCard({ buckets, onAdd }: { buckets: Bucket[]; onAdd: () => void }) {
  const { currency, exchangeRates } = useApp();
  const target = currency === 'THB' ? 'THB' : 'USD';
  const display = (b: Bucket) => {
    if (!isFxCurrency(b.currency) || !Number.isFinite(b.balance)) return 'unresolved';
    const sum = sumNativeMoney([{ amount: b.balance, currency: b.currency }], target, String(exchangeRates.THB));
    return sum ? formatFxMoney(decimal(sum.amount), target) : 'unresolved';
  };
  return (
    <section className="rounded-3xl bg-[#1c1c1c] border border-white/[0.07] p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${ACCENT}20`, color: ACCENT }}>
          <PiggyBank size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-white leading-tight">Bucket</h2>
          <p className="text-[11px] text-gray-500 leading-snug">เงินพักนอกโบรกเกอร์ ยังนับในยอดรวม</p>
        </div>
        <button
          onClick={onAdd}
          aria-label="เพิ่ม Bucket"
          className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 flex items-center justify-center transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>
      {buckets.length === 0 ? (
        <p className="text-sm text-gray-600">ยังไม่มี Bucket</p>
      ) : (
        <ul className="space-y-2">
          {buckets.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-3">
              <span
                className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-black"
                style={{ background: b.currency === "THB" ? "#4EDEA330" : "#8B6CFF30", color: b.currency === "THB" ? "#4EDEA3" : "#8B6CFF" }}
              >
                {symbolOf(b.currency)}
              </span>
              <span className="flex-1 text-sm text-gray-200 truncate">{b.name}</span>
              <span className="text-sm font-bold text-white">{isFxCurrency(b.currency) && b.currency !== target && Number.isFinite(b.balance) && <span className="mr-2 text-[11px] text-gray-500">{formatFxMoney(decimal(b.balance), b.currency)}</span>}{display(b)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LedgerCard({ entries, state, onStart }: { entries: LedgerEntry[]; state: PortfolioState; onStart: () => void }) {
  const text = useMoneyText();
  return (
    <section className="rounded-3xl bg-[#1c1c1c] border border-white/[0.07] p-5">
      <h2 className="font-bold text-white flex items-center gap-2 mb-4">
        <ArrowRightLeft size={16} style={{ color: ACCENT }} /> รายการฝาก/ถอนล่าสุด
      </h2>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center text-center py-6">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3 text-gray-500">
            <ArrowRightLeft size={20} />
          </div>
          <p className="text-sm text-gray-500 mb-4 leading-relaxed">ยังไม่มีรายการ<br />เริ่มจากฝากเงินเข้าบัญชีเงินสด</p>
          <button onClick={onStart} className="rounded-full border border-white/10 hover:bg-white/5 text-sm font-bold text-white px-5 py-2 transition-colors">
            ฝากเงิน
          </button>
        </div>
      ) : (
        <ul className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
          {entries.slice(0, 30).map((e) => {
            const acc = state.accounts.find((a) => a.id === e.accountId);
            const bucketName = state.buckets.find((b) => b.id === e.bucketId)?.name ?? "Bucket";
            const isDeposit = e.kind.startsWith("deposit");
            const counted = KIND_META[e.kind].counted;
            const where =
              e.kind === "deposit_external"
                ? "จากนอกแอป"
                : e.kind === "withdraw_external"
                ? "ออกนอกแอป"
                : e.kind === "deposit_bucket"
                ? `จาก ${bucketName}`
                : `ไป ${bucketName}`;
            const color = e.kind === "withdraw_external" ? LOSS : e.kind === "deposit_external" ? GAIN : "#e5e7eb";
            return (
              <li key={e.id} className="flex items-start gap-3">
                <div className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center" style={{ background: `${color}22`, color }}>
                  {isDeposit ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">
                    {KIND_META[e.kind].title} · {acc?.name ?? "บัญชี"}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {where} · {thaiDateTime(e.ts, false)}
                  </div>
                  <span
                    className={cn(
                      "inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
                      counted ? "bg-white/5 text-gray-400" : "bg-[#FFB4AB]/15 text-[#FFB4AB]"
                    )}
                  >
                    {counted ? "นับในยอดรวม" : "ไม่นับในยอดรวม"}
                  </span>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <div className="text-sm font-bold" style={{ color }}>
                    {text(isDeposit ? e.inputAmount : -e.inputAmount, e.inputCurrency, true)}
                  </div>
                  {e.inputCurrency !== e.accountCurrency && (
                    <div className="text-[10px] text-gray-500">→ {text(e.accountAmount, e.accountCurrency)}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const {
    portfolios,
    activePortfolio,
    isAllPortfolios,
    selectPortfolio,
    createPortfolio,
    renamePortfolio,
    brokerageAccounts,
    allBrokerageAccounts,
    brokerageCashBalances,
    recordBrokerageCashMovement,
    moneyBuckets,
    assets,
    marketQuotes,
    trades,
    isDataLoaded,
    addAsset,
    addTrade,
    addToast,
    removeAsset,
    exchangeRates,
    isExchangeRateCustom,
    netWorthSettings,
    setNetWorthSettings,
  } = useApp();
  const {
    state,
    ready,
    setRate,
    addBucket,
    syncBrokers,
    syncAccounts,
    syncHoldings,
    syncBuckets,
    saveHolding,
    removeHolding,
    addHoldingGroup,
    removeHoldingGroup,
    placeHoldingInGroup,
    moveHoldingToBroker,
    removeHoldingFromGroup,
  } = usePortfolioStore();

  const FILTER_STORAGE_KEY = "fintrack.portfolio.filter.v1";

  const [filterSettings, setFilterSettings] = useState<TotalFilterSettings>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(FILTER_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            ...DEFAULT_TOTAL_FILTER,
            ...parsed,
            includeMarkets: {
              ...DEFAULT_TOTAL_FILTER.includeMarkets,
              ...(parsed.includeMarkets || {}),
            },
          };
        }
      } catch {
        // fallback
      }
    }
    return DEFAULT_TOTAL_FILTER;
  });
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  const updateFilter = useCallback(
    (next: TotalFilterSettings) => {
      setFilterSettings(next);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
      }
      setNetWorthSettings((prev) => ({
        ...prev,
        includeBuckets: next.includeBucket,
        includeCash: next.includeCash,
      }));
    },
    [setNetWorthSettings]
  );

  const handleResetFilter = useCallback(() => {
    updateFilter(DEFAULT_TOTAL_FILTER);
  }, [updateFilter]);

  const [broker, setBroker] = useState<string>("all");
  const [tab, setTab] = useState<TabKey>("all");
  const display: Cur = "THB";
  const [hide, setHide] = useState(false);
  const [sort, setSort] = useState<"value" | "profit" | "name">("value");
  const [now, setNow] = useState<number | null>(null);
  const [moveSheet, setMoveSheet] = useState<{ mode: MoveMode; accountId: string } | null>(null);
  const [bucketFunding, setBucketFunding] = useState<{ bucketId: string; accountId: string } | null>(null);
  const [holdingModal, setHoldingModal] = useState<{ holding?: Holding } | null>(null);
  const [holdingGroupModal, setHoldingGroupModal] = useState(false);
  const [brokerModal, setBrokerModal] = useState<{ broker?: Broker } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const sidebarBrokers = useMemo(
    () => portfolios
      .filter((portfolio) => portfolio.kind === "trading")
      .map((portfolio) => ({ id: portfolio.id, name: portfolio.name, color: portfolio.color || BROKER_COLORS[0] })),
    [portfolios]
  );

  useEffect(() => {
    syncBrokers(sidebarBrokers);
  }, [sidebarBrokers, syncBrokers]);

  const effectiveBrokerageAccounts = useMemo(() => {
    if (activePortfolio?.kind === "trading") {
      return brokerageAccounts;
    }
    return allBrokerageAccounts.length > 0 ? allBrokerageAccounts : brokerageAccounts;
  }, [activePortfolio, brokerageAccounts, allBrokerageAccounts]);

  const cashCards = useMemo(() => {
    const balances = new Map(brokerageCashBalances.map((item) => [item.accountId, item.balance]));
    const groups = new Map<string, typeof effectiveBrokerageAccounts>();
    effectiveBrokerageAccounts
      .filter((account) => account.kind === "cash" && (account.currency === "THB" || account.currency === "USD"))
      .forEach((account) => {
        const key = `${account.portfolioId}:${account.currency}`;
        groups.set(key, [...(groups.get(key) || []), account]);
      });

    return Array.from(groups.values()).map((accounts) => {
      const account = [...accounts].sort((a, b) => {
        const aStandard = a.name.trim() === `เงินสด ${a.currency}` ? 0 : 1;
        const bStandard = b.name.trim() === `เงินสด ${b.currency}` ? 0 : 1;
        return aStandard - bStandard || a.name.localeCompare(b.name, "th");
      })[0];
      return {
        id: account.id,
        brokerId: account.portfolioId,
        name: `เงินสด ${account.currency}`,
        currency: account.currency as Cur,
        balance: balances.get(account.id) || 0,
      };
    });
  }, [effectiveBrokerageAccounts, brokerageCashBalances]);

  useEffect(() => {
    syncAccounts(cashCards);
  }, [cashCards, syncAccounts]);

  const appBuckets = useMemo(() => {
    return moneyBuckets.map((b) => ({
      id: b.id,
      name: b.name,
      currency: (isFxCurrency(b.currency) ? b.currency : 'unresolved') as Cur,
      balance: isFxCurrency(b.currency) && b.nativeStatus !== 'unresolved' ? b.currentAmount : Number.NaN,
    }));
  }, [moneyBuckets]);

  useEffect(() => {
    syncBuckets(appBuckets);
  }, [appBuckets, syncBuckets]);

  // A holding is calculated from the same Asset/Trade state that powers Trade.
  // This replaces the former separate local-only holding list, which could
  // show an old cost as though it were the live market price.
  const appHoldings = useMemo(() => {
    type Position = { portfolioId: string; symbol: string; shares: number; cost: number; realized: number; dividends: number; invested: number; name: string; asset?: typeof assets[number] };
    const positions = new Map<string, Position>();
    const positionKey = (portfolioId: string, symbol: string) => `${portfolioId}::${symbol}`;
    const ensurePosition = (portfolioId: string, symbol: string, name: string) => {
      const key = positionKey(portfolioId, symbol);
      const existing = positions.get(key);
      if (existing) return existing;
      const next: Position = { portfolioId, symbol, shares: 0, cost: 0, realized: 0, dividends: 0, invested: 0, name };
      positions.set(key, next);
      return next;
    };

    // Transactions are the source of truth.  This deliberately does not
    // depend on the cached assets row, which may be created a moment later by
    // the database trigger and was the reason a just-filled DCA lot vanished
    // from Portfolio after a refresh.
    [...trades]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((trade) => {
        const portfolioId = trade.portfolioId || activePortfolio?.id;
        if (!portfolioId) return;
        const symbol = trade.asset.toUpperCase();
        const position = ensurePosition(portfolioId, symbol, symbol);
        const quantity = Number(trade.shares) || (trade.pricePerUnit ? Number(trade.amountUSD) / Number(trade.pricePerUnit) : 0);
        const tradeCost = Number(trade.amountUSD || 0) + Number(trade.fees || 0);
        if (trade.type === 'BUY' || trade.type === 'IMPORT' || trade.type === 'COVER') {
          position.shares += quantity;
          position.cost += tradeCost;
          position.invested += tradeCost;
        } else if (trade.type === 'SELL' || trade.type === 'SHORT') {
          const sold = Math.min(Math.max(quantity, 0), Math.max(position.shares, 0));
          const costPerShare = position.shares > 0 ? position.cost / position.shares : 0;
          position.realized += quantity > 0 ? (Number(trade.amountUSD || 0) - Number(trade.fees || 0)) * sold / quantity - sold * costPerShare : 0;
          position.shares -= sold;
          position.cost = Math.max(0, position.cost - (sold * costPerShare));
        } else if (trade.type === 'DIVIDEND') {
          position.dividends += Number(trade.amountUSD || 0) - Number(trade.fees || 0);
        }
      });

    // Use the same remaining lots as Trade, including specifically closed lots.
    positions.forEach(position => {
      const projected = projectLotPosition(trades, position.portfolioId, position.symbol);
      if (projected) Object.assign(position, projected);
    });

    // Preserve legacy/manual assets that have no transaction history, and use
    // their live quote/name to decorate transaction-derived positions.
    assets.forEach((asset) => {
      const portfolioId = asset.portfolioId || activePortfolio?.id;
      if (!portfolioId) return;
      const symbol = asset.symbol.toUpperCase();
      const key = positionKey(portfolioId, symbol);
      const position = positions.get(key);
      if (position) {
        position.asset = asset;
        position.name = asset.name || position.name;
        return;
      }
      if ((asset.shares || 0) <= 0) return;
      positions.set(key, {
        portfolioId,
        symbol,
        shares: Number(asset.shares) || 0,
        cost: (Number(asset.avgCost) || 0) * (Number(asset.shares) || 0),
        realized: Number(asset.realizedPL) || 0,
        dividends: Number(asset.dividendTotal) || 0,
        invested: (Number(asset.avgCost) || 0) * (Number(asset.shares) || 0),
        name: asset.name || symbol,
        asset,
      });
    });

    return [...positions.values()]
      .filter((position) => position.shares > 0 && sidebarBrokers.some((broker) => broker.id === position.portfolioId))
      .map((position) => {
        // This is a USD valuation projection, NOT a claim about the asset's
        // native denomination. amountUSD / priceUSD and AppContext's legacy
        // avgCost/currentPrice are explicitly USD-normalized by their writers.
        // Keep them in USD here; the display layer converts once, just as on
        // Dashboard. Missing native asset metadata must not invalidate a
        // known USD valuation or require an unrelated cash/Bucket account.
        const allocation = position.asset?.allocation;
        const market: Market = allocation === 'Gold' ? 'GOLD'
          : allocation === 'Funds' ? 'FUND'
          : position.asset?.currency === 'THB' ? 'TH' : 'US';
        const holdingCurrency: Cur = 'USD';
        const avgCostUsd = position.shares > 0 ? position.cost / position.shares : 0;
        const livePriceUsd = marketQuotes[position.symbol]?.priceUSD || Number(position.asset?.currentPrice)
          || (position.shares > 0 ? Number(position.asset?.valueUSD) / position.shares : 0)
          || avgCostUsd;
        return {
          id: position.asset?.id || `${position.portfolioId}:${position.symbol}`,
          brokerId: position.portfolioId,
          market,
          symbol: position.symbol,
          name: position.name,
          shares: position.shares,
          avgCost: avgCostUsd,
          price: livePriceUsd,
          currency: holdingCurrency,
          realizedPL: position.realized,
          dividends: position.dividends,
          investedCost: position.invested,
        };
      });
  }, [activePortfolio?.id, assets, marketQuotes, sidebarBrokers, trades]);

  useEffect(() => {
    // Once the shared ledger has loaded it is authoritative, even when its
    // result is empty.  This prevents a sold/deleted asset lingering in a
    // separate local board.
    if (isDataLoaded) syncHoldings(appHoldings);
  }, [appHoldings, isDataLoaded, syncHoldings]);

  // Sync live rate from AppContext on mount / refresh (unless user manually customized)
  useEffect(() => {
    setRate(exchangeRates.THB);
  }, [exchangeRates.THB, setRate]);

  useEffect(() => {
    if (isAllPortfolios || activePortfolio?.kind !== "trading") {
      setBroker("all");
      return;
    }
    setBroker(activePortfolio.id);
  }, [activePortfolio, isAllPortfolios]);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ถ้าโบรกที่เลือกไว้หายไป ให้กลับไปดูทุกโบรก
  useEffect(() => {
    if (broker !== "all" && !state.brokers.some((b) => b.id === broker)) setBroker("all");
  }, [broker, state.brokers]);

  const rate = state.rate;
  const D = display;
  const toD = useCallback((v: number, c: Cur) => convert(v, c, D, rate), [D, rate]);
  const brokerById = useMemo(() => new Map(state.brokers.map((b) => [b.id, b])), [state.brokers]);

  const showCash = tab === "all" || tab === "cash";
  const showHoldings = tab !== "cash";

  const bucketRawTotal = useMemo(() => {
    return state.buckets.reduce((s, b) => s + toD(b.balance, b.currency), 0);
  }, [state.buckets, toD]);

  const cashRawTotal = useMemo(() => {
    return state.accounts.reduce((s, a) => s + toD(a.balance, a.currency), 0);
  }, [state.accounts, toD]);

  const marketTotals = useMemo(() => {
    const result: Record<Market, number> = { US: 0, TH: 0, FUND: 0, GOLD: 0 };
    state.holdings.forEach((h) => {
      if (result[h.market] !== undefined) {
        result[h.market] += toD(holdingValue(h), h.currency);
      }
    });
    return result;
  }, [state.holdings, toD]);

  const isFilterCustomized = useMemo(() => {
    return (
      !filterSettings.includeBucket ||
      !filterSettings.includeCash ||
      !filterSettings.includeMarkets.US ||
      !filterSettings.includeMarkets.TH ||
      !filterSettings.includeMarkets.FUND ||
      !filterSettings.includeMarkets.GOLD ||
      filterSettings.excludedBrokerIds.length > 0
    );
  }, [filterSettings]);

  const excludedFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (!filterSettings.includeBucket) labels.push("เงินใน Bucket");
    if (!filterSettings.includeCash) labels.push("เงินสดในโบรกเกอร์");
    const marketLabels: Record<Market, string> = {
      US: "หุ้นสหรัฐฯ",
      TH: "หุ้นไทย",
      FUND: "กองทุนรวม",
      GOLD: "ทองคำ",
    };
    (Object.keys(marketLabels) as Market[]).forEach((market) => {
      if (!filterSettings.includeMarkets[market]) labels.push(marketLabels[market]);
    });
    filterSettings.excludedBrokerIds.forEach((id) => {
      const name = brokerById.get(id)?.name;
      labels.push(name || "พอร์ตที่เลือก");
    });
    return labels;
  }, [filterSettings, brokerById]);

  const view = useMemo(() => {
    const inBroker = (id: string) => {
      if (broker !== "all" && id !== broker) return false;
      if (tab === "all" && filterSettings.excludedBrokerIds.includes(id)) return false;
      return true;
    };

    const allowCash = showCash && (tab !== "all" || filterSettings.includeCash);
    const allowBucket = showCash && (tab !== "all" || filterSettings.includeBucket);

    const accounts = allowCash ? state.accounts.filter((a) => inBroker(a.brokerId)) : [];
    const buckets = allowBucket && broker === "all" ? state.buckets : [];
    const holdings = showHoldings
      ? state.holdings.filter((h) => {
          if (!inBroker(h.brokerId)) return false;
          if (tab === "all") {
            if (!filterSettings.includeMarkets[h.market]) return false;
            return true;
          }
          return h.market === tab;
        })
      : [];

    const cashTotal = accounts.reduce((s, a) => s + toD(a.balance, a.currency), 0);
    const bucketTotal = buckets.reduce((s, b) => s + toD(b.balance, b.currency), 0);
    const holdTotal = holdings.reduce((s, h) => s + toD(holdingValue(h), h.currency), 0);
    const holdCost = holdings.reduce((s, h) => s + toD(holdingCost(h), h.currency), 0);
    const total = cashTotal + bucketTotal + holdTotal;
    const profit = holdTotal - holdCost;
    const profitPct = holdCost > 0 ? (profit / holdCost) * 100 : 0;

    const pctOf = (h: Holding) => (holdingCost(h) > 0 ? (holdingValue(h) - holdingCost(h)) / holdingCost(h) : 0);
    const sorted = [...holdings].sort((a, b) =>
      sort === "name"
        ? a.symbol.localeCompare(b.symbol)
        : sort === "profit"
        ? pctOf(b) - pctOf(a)
        : toD(holdingValue(b), b.currency) - toD(holdingValue(a), a.currency)
    );

    // สัดส่วนในวงแหวน เปลี่ยนตามแท็บที่เปิดอยู่
    let segments: Segment[] = [];
    if (tab === "all") {
      if (broker === "all") {
        segments = state.brokers
          .filter((b) => !filterSettings.excludedBrokerIds.includes(b.id))
          .map((b) => {
            const bCash = filterSettings.includeCash
              ? state.accounts.filter((a) => a.brokerId === b.id).reduce((s, a) => s + toD(a.balance, a.currency), 0)
              : 0;
            const bHold = state.holdings
              .filter((h) => h.brokerId === b.id && filterSettings.includeMarkets[h.market])
              .reduce((s, h) => s + toD(holdingValue(h), h.currency), 0);
            return {
              label: b.name,
              color: b.color,
              value: bCash + bHold,
            };
          });
        if (filterSettings.includeBucket && bucketTotal > 0) {
          segments.push({ label: "Bucket", color: BUCKET_COLOR, value: bucketTotal });
        }
      } else {
        segments = [];
        if (cashTotal > 0) {
          segments.push({ label: "เงินสด", color: ACCENT, value: cashTotal });
        }
        if (holdTotal > 0) {
          segments.push({ label: "สินทรัพย์", color: "#9B7BFF", value: holdTotal });
        }
      }
    } else if (tab === "cash") {
      const by: Record<Cur, number> = { THB: 0, USD: 0 };
      accounts.forEach((a) => (by[a.currency] += toD(a.balance, a.currency)));
      segments = [
        { label: "เงินสด THB", color: "#4EDEA3", value: by.THB },
        { label: "เงินสด USD", color: "#8B6CFF", value: by.USD },
      ];
      if (bucketTotal > 0) {
        segments.push({ label: "Bucket", color: BUCKET_COLOR, value: bucketTotal });
      }
    } else {
      const palette = ["#9B7BFF", "#4EDEA3", "#ADC6FF", "#E8B84A", "#FF9EC4"];
      const ranked = holdings
        .map((h) => ({ label: h.symbol, value: toD(holdingValue(h), h.currency) }))
        .sort((a, b) => b.value - a.value);
      segments = ranked.slice(0, 5).map((r, i) => ({ ...r, color: palette[i] }));
      const rest = ranked.slice(5).reduce((s, r) => s + r.value, 0);
      if (rest > 0) segments.push({ label: "อื่นๆ", color: BUCKET_COLOR, value: rest });
    }
    segments = segments.filter((s) => s.value > 0);

    return { accounts, buckets, holdings: sorted, total, holdCost, profit, profitPct, segments };
  }, [state, broker, tab, showCash, showHoldings, sort, toD, filterSettings]);

  const valuationItems = useMemo<ValuationItem[]>(() => {
    const cashGroup = (account: CashAccount) => tab === 'cash'
      ? { group: `เงินสด ${account.currency}`, color: account.currency === 'THB' ? '#4EDEA3' : '#8B6CFF' }
      : broker === 'all'
        ? { group: brokerById.get(account.brokerId)?.name || account.brokerId, color: brokerById.get(account.brokerId)?.color || ACCENT }
        : { group: 'เงินสด', color: ACCENT };
    return [
      ...view.accounts.map(a => ({ amount: String(a.balance), currency: a.currency, ...cashGroup(a) })),
      ...view.buckets.map(b => ({ amount: String(b.balance), currency: b.currency, group: 'Bucket', color: BUCKET_COLOR })),
      ...view.holdings.map(h => {
        const segment = view.segments.find(s => s.label === h.symbol) || view.segments.find(s => s.label === 'อื่นๆ');
        const group = tab === 'all'
          ? broker === 'all'
            ? { group: brokerById.get(h.brokerId)?.name || h.brokerId, color: brokerById.get(h.brokerId)?.color || ACCENT }
            : { group: 'สินทรัพย์', color: '#9B7BFF' }
          : { group: segment?.label || h.symbol, color: segment?.color || '#9B7BFF' };
        return { amount: Number.isFinite(h.price) ? decimal(h.shares).mul(decimal(h.price)) : '0', cost: Number.isFinite(h.avgCost) ? decimal(h.shares).mul(decimal(h.avgCost)) : '0', currency: h.currency, ...group };
      }),
    ];
  }, [view, tab, broker, brokerById]);

  const brokerTotals = useMemo(() => {
    const map = new Map<string, number>();
    state.brokers.forEach((b) => {
      try {
        const items = [
          ...(filterSettings.includeCash ? state.accounts.filter(a => a.brokerId === b.id).map(a => ({amount:a.balance,currency:a.currency})) : []),
          ...state.holdings.filter(h => h.brokerId === b.id && filterSettings.includeMarkets[h.market]).map(h => ({amount:holdingValue(h),currency:h.currency})),
        ];
        const total = sumNativeMoney(items, D, String(rate));
        map.set(b.id, total ? Number(decimal(total.amount).toFixed(12)) : Number.NaN);
      } catch { map.set(b.id, Number.NaN); }
    });
    return map;
  }, [state, filterSettings, D, rate]);

  const allTotal = useMemo(() => {
    try {
      const included = (id: string) => !filterSettings.excludedBrokerIds.includes(id);
      const items = [
        ...(filterSettings.includeCash ? state.accounts.filter(a => included(a.brokerId)).map(a => ({amount:a.balance,currency:a.currency})) : []),
        ...state.holdings.filter(h => included(h.brokerId) && filterSettings.includeMarkets[h.market]).map(h => ({amount:holdingValue(h),currency:h.currency})),
        ...(filterSettings.includeBucket ? state.buckets.map(b => ({amount:b.balance,currency:b.currency})) : []),
      ];
      const total = sumNativeMoney(items, D, String(rate));
      return total ? Number(decimal(total.amount).toFixed(12)) : Number.NaN;
    } catch { return Number.NaN; }
  }, [state, filterSettings, D, rate]);

  // กลุ่มบัญชีเงินสดแยกตามโบรก
  const groups = useMemo(
    () =>
      state.brokers
        .filter((b) => (broker === "all" || b.id === broker) && !filterSettings.excludedBrokerIds.includes(b.id))
        .map((b) => {
          const accounts = state.accounts.filter((a) => a.brokerId === b.id);
          return { broker: b, accounts, total: accounts.reduce((s, a) => s + toD(a.balance, a.currency), 0) };
        }),
    [state.brokers, state.accounts, broker, filterSettings.excludedBrokerIds, toD]
  );

  const visibleBrokers = useMemo(
    () => state.brokers.filter((item) => broker === "all" || item.id === broker),
    [state.brokers, broker]
  );
  const visibleHoldingGroups = useMemo(
    () => state.holdingGroups.filter((group) => visibleBrokers.some((item) => item.id === group.brokerId) && (tab === "all" || group.market === tab)),
    [state.holdingGroups, visibleBrokers, tab]
  );
  const holdingsByGroup = useMemo(() => {
    const result = new Map<string, Holding[]>();
    visibleHoldingGroups.forEach((group) => result.set(group.id, []));
    state.holdings.forEach((holding) => {
      (state.holdingGroupIds[holding.id] || []).forEach((groupId) => {
        const items = result.get(groupId);
        if (items) items.push(holding);
      });
    });
    return result;
  }, [state.holdings, state.holdingGroupIds, visibleHoldingGroups]);
  const trayHoldings = useMemo(
    () => state.holdings.filter((holding) => visibleBrokers.some((item) => item.id === holding.brokerId)),
    [state.holdings, visibleBrokers]
  );
  const trayHoldingTotalTHB = useMemo(
    () => trayHoldings.reduce((sum, holding) => sum + convert(holdingValue(holding), holding.currency, "THB", rate), 0),
    [trayHoldings, rate]
  );
  const placementCounts = useMemo(() => new Map(trayHoldings.map((holding) => [holding.id, (state.holdingGroupIds[holding.id] || []).length])), [trayHoldings, state.holdingGroupIds]);
  const duplicatePlacements = useMemo(() => trayHoldings.flatMap((holding) => {
    const groupsForHolding = (state.holdingGroupIds[holding.id] || []).map((id) => state.holdingGroups.find((group) => group.id === id)).filter((group): group is HoldingGroup => !!group);
    return groupsForHolding.length > 1 ? [{ holding, groups: groupsForHolding }] : [];
  }), [trayHoldings, state.holdingGroupIds, state.holdingGroups]);

  const ledgerEntries = useMemo(() => {
    if (broker === "all") return state.ledger;
    const ids = new Set(state.accounts.filter((a) => a.brokerId === broker).map((a) => a.id));
    return state.ledger.filter((e) => ids.has(e.accountId));
  }, [state.ledger, state.accounts, broker]);


  const openMove = (mode: MoveMode, accountId?: string) => {
    const fallback =
      (broker !== "all" ? state.accounts.find((a) => a.brokerId === broker) : undefined) ?? state.accounts[0];
    if (!accountId && !fallback) return;
    setMoveSheet({ mode, accountId: accountId ?? fallback.id });
  };

  const openAddHolding = () => setHoldingModal({});
  const saveHoldingToPortfolio = useCallback(async (holding: Holding, isNew: boolean) => {
    if (!isNew) return false;
    const account = [...allBrokerageAccounts, ...effectiveBrokerageAccounts].find(item => item.id === holding.fundingAccountId && item.portfolioId === holding.brokerId && item.kind === 'cash' && item.currency === holding.currency);
    if (holding.entryMode === 'BUY' && !account) {
      addToast(`ไม่พบบัญชีเงินสด ${holding.currency} ของโบรกเกอร์ที่เลือก กรุณาสร้างบัญชีก่อน`, 'error');
      return false;
    }
    const rateAtTime = holding.currency === 'THB' ? holding.executionFx || exchangeRates.THB || DEFAULT_RATE : 1;
    const importedCostUsd = (holding.avgCost * holding.shares) / rateAtTime;
    // One transaction owns the lot and cash debit. Never publish a local
    // holding before the server has accepted the purchase.
    const saved = await addTrade({
        asset: holding.symbol,
        type: holding.entryMode ?? 'IMPORT',
        amountUSD: importedCostUsd,
        fees: (holding.executionFee || 0) / rateAtTime,
        fxRateTHB: holding.executionFx,
        date: new Date().toISOString(),
        rateAtTime,
        currency: holding.currency,
        shares: holding.shares,
        pricePerUnit: holding.avgCost / rateAtTime,
        originalAmount: holding.avgCost * holding.shares + (holding.executionFee || 0),
        brokerageAccountId: holding.entryMode === 'BUY' ? account?.id : undefined,
        portfolioId: holding.brokerId,
        tag: 'Added from Portfolio',
      });
    if (saved) saveHolding(holding);
    return saved;
  }, [addTrade, addToast, allBrokerageAccounts, effectiveBrokerageAccounts, exchangeRates.THB, saveHolding]);

  const deleteHoldingFromPortfolio = useCallback((holding: Holding) => {
    // Only the shared state removes the row after the database confirms it.
    void removeAsset(holding.symbol, holding.brokerId);
  }, [removeAsset]);
  const marketTab: Market | null = tab === "US" || tab === "TH" || tab === "GOLD" || tab === "FUND" ? tab : null;

  if (!ready) {
    return <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-600">กำลังโหลดพอร์ต…</div>;
  }

  const chipBase =
    "shrink-0 flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors";
  const chipOn = "border-white/20 bg-white/[0.08] text-white";
  const chipOff = "border-transparent text-gray-400 hover:text-white hover:bg-white/[0.04]";

  return (
    <HideContext.Provider value={hide}>
      <div className="relative isolate min-h-[calc(100dvh-4rem)] w-full pt-8 pb-24">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]" style={{ background: "radial-gradient(ellipse at 35% 0%, rgba(78,222,163,0.1), transparent 65%), radial-gradient(ellipse at 95% 12%, rgba(139,108,255,0.07), transparent 55%)" }} />
        <div className="max-w-7xl mx-auto w-full space-y-7 px-4 sm:px-6">
          {/* หัวเรื่อง */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl leading-tight font-semibold tracking-tight text-white">พอร์ตลงทุน</h1>
              <button
                onClick={() => setHide((h) => !h)}
                aria-label={hide ? "แสดงยอดเงิน" : "ซ่อนยอดเงิน"}
                aria-pressed={hide}
                className="w-9 h-9 rounded-full text-gray-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                {hide ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => openMove("deposit")}
                className="flex items-center gap-2 rounded-lg border border-white/10 text-gray-300 font-medium text-sm px-4 py-2.5 hover:bg-white/5 transition-colors"
              >
                <ArrowRightLeft size={15} /> ฝาก / ถอน
              </button>
              <button
                onClick={openAddHolding}
                className="flex items-center gap-2 rounded-lg bg-[#B8DECA] text-[#14261C] font-semibold text-sm px-4 py-2.5 hover:bg-[#CEEBDC] transition-colors"
              >
                <Plus size={15} /> เพิ่มสินทรัพย์
              </button>
            </div>
          </div>

          {/* ตัวกรอง: โบรกเกอร์ (สี่เหลี่ยมมน) แล้วตามด้วยประเภทสินทรัพย์ (แคปซูลแบบ Dime) */}
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="โบรกเกอร์">
              <button
                role="tab"
                aria-selected={broker === "all"}
                  onClick={() => { setBroker("all"); selectPortfolio(null); }}
                className={cn(chipBase, broker === "all" ? chipOn : chipOff)}
              >
                <Layers size={14} /> ทุกโบรกเกอร์
                <span className="text-xs font-semibold text-gray-400 tabular-nums">
                  {hide ? MASK : `${symbolOf(D)}${nf(allTotal, 0)}`}
                </span>
              </button>
              {state.brokers.map((b) => (
                <button
                  key={b.id}
                  role="tab"
                  aria-selected={broker === b.id}
                  onClick={() => { setBroker(b.id); selectPortfolio(b.id); }}
                  className={cn(chipBase, broker === b.id ? chipOn : chipOff)}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} />
                  {b.name}
                  <span className="text-xs font-semibold text-gray-400 tabular-nums">
                    {hide ? MASK : `${symbolOf(D)}${nf(brokerTotals.get(b.id) ?? 0, 0)}`}
                  </span>
                </button>
              ))}
              <button
                onClick={() => setBrokerModal({})}
                className="shrink-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Plus size={14} /> เพิ่มโบรก
              </button>
            </div>

            <div className="flex items-center gap-5 overflow-x-auto border-b border-white/[0.08]" role="tablist" aria-label="ประเภทสินทรัพย์">
              <button
                role="tab"
                aria-selected={tab === "all"}
                onClick={() => setTab("all")}
                className={cn(
                  "shrink-0 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
                  tab === "all" ? "border-[#BBD2C5] text-white" : "border-transparent text-gray-400 hover:text-white"
                )}
              >
                ทั้งหมด
              </button>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "shrink-0 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
                    tab === t.key ? "border-[#BBD2C5] text-white" : "border-transparent text-gray-400 hover:text-white"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "all" && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                <p className="flex items-center gap-2 text-xs text-gray-400">
                  <SlidersHorizontal size={14} />
                  {isFilterCustomized
                    ? `กำลังไม่นับ ${excludedFilterLabels.length} รายการในยอดรวม`
                    : "ยอดรวมกำลังนับทุกพอร์ต เงินสด และ Bucket"}
                </p>
                <div className="flex items-center gap-3">
                  {isFilterCustomized && (
                    <button type="button" onClick={handleResetFilter} className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white">
                      <RotateCcw size={13} /> แสดงทั้งหมด
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFilterModalOpen(true)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      isFilterCustomized
                        ? "border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15"
                        : "border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08] hover:text-white"
                    )}
                  >
                    <SlidersHorizontal size={13} />
                    เลือกสิ่งที่นับรวม
                    {isFilterCustomized && <span className="rounded bg-amber-300/15 px-1.5 py-0.5 text-[10px]">{excludedFilterLabels.length}</span>}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-6 xl:gap-8 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
            {/* คอลัมน์หลัก */}
            <div className="contents">
              <div className="min-w-0 lg:col-start-1">
              <SummaryCard
                isCash={tab === "cash"}
                dateLabel={now ? thaiDateTime(now) : ""}
                items={valuationItems}
                accountCount={view.accounts.length + view.buckets.length}
                isFilterCustomized={isFilterCustomized}
                excludedFilterLabels={excludedFilterLabels}
                onOpenFilter={() => setFilterModalOpen(true)}
                onResetFilter={handleResetFilter}
              />
              </div>

              {showCash && (
                <section className="min-w-0 space-y-5 lg:col-start-1">
                  <h2 className="text-base font-semibold text-white">บัญชีเงินสด</h2>
                  {groups.map((g) => (
                    <div key={g.broker.id}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.broker.color }} />
                          <span className="font-bold text-white truncate">{g.broker.name}</span>
                          <span className="text-xs text-gray-500 tabular-nums">
                            {hide ? MASK : `${symbolOf(D)}${nf(g.total)}`}
                          </span>
                        </div>
                        <button
                          onClick={() => setBrokerModal({ broker: g.broker })}
                          aria-label={`แก้ไขโบรก ${g.broker.name}`}
                          className="w-8 h-8 rounded-full text-gray-500 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {g.accounts.map((a) => (
                          <AccountCard
                            key={a.id}
                            account={a}
                            weight={view.total > 0 ? (toD(a.balance, a.currency) / view.total) * 100 : 0}
                            rate={rate}
                            onMove={openMove}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {(tab !== "all" || filterSettings.includeBucket) && state.buckets.length > 0 && (
                    <BucketsCard buckets={state.buckets} onAdd={() => { window.location.href = "/budget"; }} />
                  )}
                </section>
              )}

              {showHoldings && (
                <section className="min-w-0 space-y-3 lg:col-span-2 lg:order-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><h2 className="text-base font-semibold text-white">หัวข้อสินทรัพย์</h2><p className="mt-1 text-xs text-gray-400">จัดได้หลายหัวข้อ มูลค่ารวมนับครั้งเดียว</p></div>
                    <button onClick={() => setHoldingGroupModal(true)} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/5"><Plus size={14} /> เพิ่มหัวข้อ</button>
                  </div>
                  {duplicatePlacements.length > 0 && <details className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <summary className="cursor-pointer text-xs text-gray-300">อยู่หลายหัวข้อ {duplicatePlacements.length} รายการ · ดูรายละเอียด</summary>
                    <div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#E8B84A]" /><div className="min-w-0"><p className="text-sm font-bold text-[#F6D783]">มีสินทรัพย์อยู่มากกว่าหนึ่งหัวข้อ</p><p className="mt-1 text-[11px] leading-relaxed text-gray-400">นี่เป็นการจัดกลุ่มเท่านั้น จึงไม่ต้องลบจำนวนหน่วย และยอดรวมจะนับสินทรัพย์จริงเพียงครั้งเดียว</p><div className="mt-3 space-y-2">{duplicatePlacements.map(({ holding, groups: placedGroups }) => <div key={holding.id} className="flex flex-wrap items-center gap-2 text-xs"><span className="font-bold text-white">{holding.symbol}</span><span className="text-gray-500">อยู่ใน</span>{placedGroups.map((group, index) => <span key={group.id} className="inline-flex items-center gap-1 rounded-lg bg-black/20 px-2 py-1 text-gray-300">{group.name}{index > 0 && <button type="button" onClick={() => removeHoldingFromGroup(holding.id, group.id)} className="text-gray-500 hover:text-[#FFB4AB]" aria-label={`เอา ${holding.symbol} ออกจาก ${group.name}`}><X size={12} /></button>}</span>)}</div>)}</div></div></div>
                  </details>}
                  {trayHoldings.length === 0 ? <EmptyHoldings onAdd={openAddHolding} /> : <div className="space-y-4">
                    {visibleHoldingGroups.map((group) => <HoldingGroupBoard key={group.id} group={group} availableHoldings={trayHoldings} brokerName={broker === "all" ? brokerById.get(group.brokerId)?.name : undefined} holdings={holdingsByGroup.get(group.id) || []} total={trayHoldingTotalTHB} rate={rate} onDropHolding={(holdingId) => {
                      const holding = state.holdings.find((item) => item.id === holdingId);
                      if (holding && holding.brokerId !== group.brokerId) { setToast("ลากสินทรัพย์ไปได้เฉพาะหัวข้อของโบรกเกอร์เดียวกัน"); return; }
                      placeHoldingInGroup(holdingId, group.id);
                    }} onRemoveHolding={(holdingId) => removeHoldingFromGroup(holdingId, group.id)} onEditHolding={(holding) => setHoldingModal({ holding })} onDeleteGroup={() => removeHoldingGroup(group.id)} />)}
                  </div>}
                </section>
              )}
            </div>

            {/* Asset tray keeps the canonical holding list separate from its visual groups. */}
            <aside className="space-y-6 min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
              {showHoldings && <HoldingTray brokers={state.brokers} holdings={trayHoldings} placementCounts={placementCounts} onEdit={(holding) => setHoldingModal({ holding })} onMoveHolding={(holdingId, brokerId) => {
                const holding = state.holdings.find((item) => item.id === holdingId);
                if (!holding || holding.brokerId === brokerId) return;
                moveHoldingToBroker(holdingId, brokerId);
                setToast(`ย้าย ${holding.symbol} ไป ${brokerById.get(brokerId)?.name || "พอร์ตที่เลือก"} แล้ว`);
              }} />}
              <LedgerCard entries={ledgerEntries} state={state} onStart={() => openMove("deposit")} />
            </aside>
          </div>
        </div>

        {/* Modals */}
        <AnimatePresence>
          {moveSheet && (
            <HideContext.Provider value={false}>
              <MoveSheet
                key={`${moveSheet.mode}-${moveSheet.accountId}`}
                state={state}
                buckets={moneyBuckets}
                initialMode={moveSheet.mode}
                initialAccountId={moveSheet.accountId}
                activeBrokerFilter={broker === "all" ? null : broker}
                onClose={() => setMoveSheet(null)}
                onFundFromBucket={(bucketId, accountId) => {
                  setMoveSheet(null);
                  setBucketFunding({ bucketId, accountId });
                }}
                onSubmit={(input, message) => {
                  const plan = planMove(state, input);
                  if (plan.error || !plan.account) return;
                  void recordBrokerageCashMovement(
                    input.accountId,
                    input.mode === "deposit" ? "DEPOSIT" : "WITHDRAW",
                    plan.accountAmount
                  ).then((saved) => {
                    if (!saved) {
                      setToast("บันทึกการเคลื่อนไหวเงินสดไม่สำเร็จ");
                      return;
                    }
                    setMoveSheet(null);
                    setToast(message);
                  });
                }}
              />
            </HideContext.Provider>
          )}
          {bucketFunding && (() => {
            const bucket = moneyBuckets.find((item) => item.id === bucketFunding.bucketId);
            return bucket ? <InvestmentTransferModal key={`${bucket.id}-${bucketFunding.accountId}`} bucket={bucket} initialAccountId={bucketFunding.accountId} onClose={() => setBucketFunding(null)} /> : null;
          })()}
          {holdingModal?.holding && <TradeLotEditor symbol={holdingModal.holding.symbol} portfolioId={holdingModal.holding.brokerId} onClose={() => setHoldingModal(null)} />}
          {holdingModal && !holdingModal.holding && (
            <HoldingModal
              key="new"
              brokers={state.brokers}
              defaultBrokerId={broker !== "all" ? broker : state.brokers[0]?.id ?? ""}
              defaultMarket={marketTab ?? "US"}
              holding={holdingModal.holding}
              onSave={saveHoldingToPortfolio}
              onDelete={deleteHoldingFromPortfolio}
              onClose={() => setHoldingModal(null)}
            />
          )}
          {holdingGroupModal && (
            <HoldingGroupModal
              brokers={visibleBrokers.length ? visibleBrokers : state.brokers}
              defaultBrokerId={broker === "all" ? state.brokers[0]?.id ?? "" : broker}
              onSave={addHoldingGroup}
              onClose={() => setHoldingGroupModal(false)}
            />
          )}
          {brokerModal && (
            <BrokerModal
              key={brokerModal.broker?.id ?? "new-broker"}
              broker={brokerModal.broker}
              usedCount={state.brokers.length}
              deleteBlockedReason={brokerModal.broker ? "ลบโบรกเกอร์ได้จากการตั้งค่าบัญชีลงทุน" : undefined}
              onSave={(name, color) => {
                if (brokerModal.broker) {
                  void renamePortfolio(brokerModal.broker.id, name, color);
                } else {
                  void createPortfolio(name, color);
                }
              }}
              onClose={() => setBrokerModal(null)}
            />
          )}
        </AnimatePresence>

        {/* Modal สำหรับปรับแต่งตัวกรองยอดรวม */}
        <PortfolioDisplayFilterModal
          isOpen={filterModalOpen}
          onClose={() => setFilterModalOpen(false)}
          filter={filterSettings}
          onChange={updateFilter}
          onReset={handleResetFilter}
          bucketTotal={bucketRawTotal}
          cashTotal={cashRawTotal}
          marketTotals={marketTotals}
          brokerTotals={brokerTotals}
          brokers={state.brokers}
          currencySymbol={symbolOf(D)}
          calculatedTotal={view.total}
        />

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              role="status"
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] max-w-[90vw] flex items-center gap-2 rounded-full bg-[#2a2a2a] border border-white/10 px-5 py-3 text-sm text-white shadow-2xl"
            >
              <Check size={15} style={{ color: ACCENT }} className="shrink-0" />
              <span>{toast}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </HideContext.Provider>
  );
}
