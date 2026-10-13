"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { db, supabase } from "@/src/lib/supabase";
import { validateAssetFunding } from '@/src/lib/asset-funding';
import { User } from "@supabase/supabase-js";
import { projectLotPosition } from "@/src/lib/trade-lots";
import { tradeDeletionReason, tradeDeleteError } from '@/src/lib/trade-deletion-policy';
import { bucketNativeAmount, getNativeLeg, nativeBucketBalance } from '@/src/lib/native-money';
import { decimal, isFxCurrency } from '@/src/lib/fx';
import { useFxRate } from '@/src/hooks/useFxRate';

export type Language = "en" | "th";
export type Currency = "USD" | "THB" | "JPY" | "EUR";

export interface Trade {
  id: number;
  asset: string;
  type: "BUY" | "SELL" | "DIVIDEND" | "IMPORT" | "SHORT" | "COVER";
  amountUSD: number;
  date: string;
  rateAtTime: number;
  currency: string;
  originalAmount?: number;
  shares?: number;
  pricePerUnit?: number;
  fees?: number;
  fxRateTHB?: number;
  costMethod?: 'SPECIFIC_LOT' | 'PROPORTIONAL';
  closeMode?: 'SPECIFIC_LOT' | 'PROPORTIONAL';
  lotSelections?: { lotId: string; qty: string }[];
  sourceBucketId?: string;
  brokerageAccountId?: string;
  tag?: string;
  dbId?: string;
  portfolioId?: string;
}

export interface CashActivity {
  id: string;
  type: "INCOME" | "EXPENSE" | "DEPOSIT" | "WITHDRAW";
  amountUSD: number;
  amount?: number;
  category: string;
  date: string;
  time?: string;
  note?: string;
  bucketId?: string;
  isTransfer?: boolean; // true = money moving between Cash ↔ Bucket (not income/expense)
  currency?: string;
  rateAtTime?: number;
  originalAmount?: number;
}

export interface Allocation {
  label: string;
  value: number;
  color: string;
}

export interface AppToast {
  id: string;
  message: string;
  type?: 'success' | 'info' | 'warning' | 'error';
}

interface DcaPosition {
  symbol: string;
  quantity: number;
  cost: number;
}

// DCA entries are open positions, even before the trader closes them.  Keep
// their portfolio contribution derived from the saved draft instead of writing
// a duplicate BUY trade every time an input changes.
const getDcaPositions = (drafts: Array<{ symbol?: string; entries?: unknown }>): DcaPosition[] => {
  const positions = new Map<string, DcaPosition>();

  drafts.forEach(draft => {
    const symbol = draft.symbol?.trim().toUpperCase();
    const payload = Array.isArray(draft.entries) ? draft.entries : (draft.entries as any)?.entries;
    if (!symbol || !Array.isArray(payload)) return;

    payload.forEach((entry: any) => {
      if (entry?.active === false) return;
      const quantity = Number(entry?.quantity);
      const price = Number(entry?.price);
      const amount = Number(entry?.amount);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) return;

      const current = positions.get(symbol) || { symbol, quantity: 0, cost: 0 };
      current.quantity += quantity;
      current.cost += Number.isFinite(amount) && amount > 0 ? amount : price * quantity;
      positions.set(symbol, current);
    });
  });

  return Array.from(positions.values());
};

const getTradePosition = (trades: Trade[], symbol: string) => {
  const position = { quantity: 0, cost: 0 };
  [...trades]
    .filter(trade => trade.asset.toUpperCase() === symbol && !trade.tag?.startsWith('DCA '))
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(trade => {
      const quantity = trade.shares || (trade.pricePerUnit ? trade.amountUSD / trade.pricePerUnit : 0);
      if (trade.type === 'BUY' || trade.type === 'IMPORT') {
        position.quantity += quantity;
        position.cost += trade.amountUSD + (trade.fees || 0);
      } else if (trade.type === 'SELL' && position.quantity > 0) {
        const soldQuantity = Math.min(quantity, position.quantity);
        position.cost -= (soldQuantity / position.quantity) * position.cost;
        position.quantity -= soldQuantity;
      }
    });
  return position;
};

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'rebalance' | 'price' | 'system' | 'trade';
  time: Date;
  read: boolean;
}

export interface NotifPreferences {
  priceAlerts: boolean;
  rebalanceAlerts: boolean;
  tradeConfirmations: boolean;
  weeklyReport: boolean;
}

export interface MoneyBucket {
  nativeStatus?: 'resolved' | 'unresolved';
  id: string;
  name: string;
  targetPercent: number;
  targetAmount?: number;
  currentAmount: number;
  currency?: Currency;
  color: string;
  icon: string;
  linkedToExpenses?: boolean;
  portfolioId?: string;
}

export interface BucketActivity {
  id: string;
  bucketId: string;
  bucketName: string;
  type: 'deposit' | 'withdraw' | 'income_split' | 'invest' | 'profit_split';
  amount: number;
  date: string;
  note?: string;
  currency?: string;
  rateAtTime?: number;
  originalAmount?: number;
}

// Extended CashActivity that includes bucket activities for Cashflow page
export interface CashflowActivity {
  id: string;
  type: "INCOME" | "EXPENSE" | "DEPOSIT" | "WITHDRAW";
  amountUSD: number;
  amount?: number;
  category: string;
  date: string;
  time?: string;
  note?: string;
  bucketId?: string;
  bucketName?: string;
  isTransfer?: boolean;
  source: 'cash' | 'bucket'; // 'cash' = from cash_activities, 'bucket' = from bucket_activities
  currency?: string;
  rateAtTime?: number;
  originalAmount?: number;
}

export interface Asset {
  id?: string; // Optional for new assets, mandatory for existing
  name: string;
  symbol: string;
  valueUSD: number;
  change: number;
  allocation: string;
  shares?: number;
  avgCost?: number;
  chartData?: {time: number, price: number}[];
  intradayData?: {time: number, price: number}[];
  dividendTotal?: number;
  realizedPL?: number;
  isFavorite?: boolean;
  sortOrder?: number;
  is_active?: boolean;
  currentPrice?: number;
  currency?: string;
  excludeFromTotal?: boolean;
  portfolioId?: string;
  brokerageAccountId?: string;
}

export interface Portfolio {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  kind: 'trading' | 'cash_management';
}

export interface BrokerageAccount {
  id: string;
  name: string;
  broker?: string;
  currency: Currency;
  color: string;
  portfolioId: string;
  kind: 'cash' | 'asset_group';
}

export interface BrokerageCashBalance {
  accountId: string;
  balance: number;
}

export interface BrokerageCashEntry {
  id: string;
  accountId: string;
  portfolioId: string;
  type: 'DEPOSIT' | 'WITHDRAW' | 'TRADE_BUY' | 'TRADE_SELL' | 'ADJUSTMENT';
  amount: number;
  currency: Currency;
  tradeId?: string;
  occurredAt: string;
  note?: string;
}

export interface InvestmentTransfer {
  id: string;
  bucketId: string;
  accountId: string;
  sourceAmount: number;
  receivedAmount: number;
  fee: number;
  thbPerUsd: number;
}

export const ALL_PORTFOLIOS_ID = "__all_portfolios__";

export interface NetWorthSettings {
  includeAssets: boolean;
  includeBuckets: boolean;
  includeCash: boolean;
  cashflowIncludeCash: boolean;
  cashflowIncludeBuckets: boolean;
  cashflowIncludeAssets: boolean;
}

export type WidgetType = 'watchlist' | 'monthly_summary' | 'allocation_pie' | 'daily_journal' | 'equity_curve' | 'bucket_overview' | 'pl_calendar_mini' | 'top_movers';

export interface DashboardWidget {
  i: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface CustomCategory {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  label: string;
  icon: string;
}

interface AppState {
  language: Language;
  currency: Currency;
  setLanguage: (lang: Language) => void;
  setCurrency: (curr: Currency) => void;
  t: (key: string) => string;
  formatMoney: (amount: number, originalCurrency?: Currency, originalRate?: number, originalAmount?: number) => string;
  exchangeRates: Record<Currency, number>;
  setExchangeRate: (currency: Currency, rate: number) => void;
  resetExchangeRateToAuto: () => Promise<void>;
  isExchangeRateCustom: boolean;
  trades: Trade[];
  /** Returns false when the trade was rejected (for example, insufficient cash). */
  addTrade: (trade: Omit<Trade, "id">, metadata?: Pick<Asset, 'name' | 'allocation' | 'currentPrice' | 'currency' | 'excludeFromTotal' | 'chartData'>) => Promise<boolean>;
  cashActivities: CashActivity[];
  addCashActivity: (activity: Omit<CashActivity, "id">) => Promise<CashActivity | null>;
  removeCashActivity: (id: string) => void;
  allocations: Allocation[];
  updateAllocation: (label: string, value: number) => void;
  assets: Asset[];
  marketQuotes: Record<string, { priceUSD: number; updatedAt: number }>;
  portfolios: Portfolio[];
  activePortfolioId: string | null;
  activePortfolio: Portfolio | null;
  isAllPortfolios: boolean;
  selectPortfolio: (id: string | null) => void;
  createPortfolio: (name: string, color?: string) => Promise<Portfolio | null>;
  renamePortfolio: (id: string, name: string, color?: string) => Promise<boolean>;
  brokerageAccounts: BrokerageAccount[];
  allBrokerageAccounts: BrokerageAccount[];
  brokerageCashBalances: BrokerageCashBalance[];
  brokerageCashEntries: BrokerageCashEntry[];
  addBrokerageAccount: (account: Omit<BrokerageAccount, 'id' | 'portfolioId'>) => Promise<BrokerageAccount | null>;
  updateBrokerageAccount: (id: string, updates: Pick<BrokerageAccount, 'name' | 'broker' | 'currency' | 'kind'>) => Promise<boolean>;
  recordBrokerageCashMovement: (accountId: string, type: 'DEPOSIT' | 'WITHDRAW' | 'ADJUSTMENT', amount: number, note?: string) => Promise<boolean>;
  transferBucketToBroker: (transfer: InvestmentTransfer) => Promise<boolean>;
  transferBrokerToBucket: (id: string, accountId: string, bucketId: string, amount: number, rate: number) => Promise<boolean>;
  deleteBrokerCashMovement: (id: string) => Promise<boolean>;
  deleteTradeJournalTransactions: (id: string) => Promise<boolean>;
  addAsset: (asset: Asset) => void;
  syncDcaPosition: (symbol: string, entries: unknown) => void;
  bulkAddTrades: (trades: Omit<Trade, "id">[]) => void;
  netWorthHistory: { date: string; value: number }[];
  userProfile?: { email: string; avatarUrl: string; initials: string };
  setUserProfile: (profile: { email: string; avatarUrl: string; initials: string } | undefined) => void;
  fetchAssetMarketData: (symbol: string) => Promise<any>;
  removeAsset: (symbol: string, portfolioId?: string) => Promise<void>;
  updateAsset: (symbol: string, updates: Partial<Asset>) => void;
  reorderAssets: (reordered: Asset[]) => void;
  removeTrade: (id: number) => Promise<boolean>;
  updateTrade: (id: number, updates: Partial<Trade>) => Promise<boolean>;
  updateCashActivity: (id: string, updates: Partial<CashActivity>) => void;
  toasts: AppToast[];
  addToast: (message: string, type?: AppToast['type']) => void;
  removeToast: (id: string) => void;
  netWorthSettings: NetWorthSettings;
  setNetWorthSettings: (settings: NetWorthSettings | ((prev: NetWorthSettings) => NetWorthSettings)) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  notifications: AppNotification[];
  addNotification: (title: string, message: string, type: AppNotification['type']) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  isDataLoaded: boolean;
  notifPreferences: NotifPreferences;
  setNotifPreferences: (prefs: NotifPreferences) => void;
  moneyBuckets: MoneyBucket[];
  allMoneyBuckets: MoneyBucket[];
  addMoneyBucket: (bucket: Omit<MoneyBucket, 'id'>) => void;
  updateMoneyBucket: (id: string, updates: Partial<MoneyBucket>) => void;
  removeMoneyBucket: (id: string) => void;
  bucketActivities: BucketActivity[];
  addBucketActivity: (activity: Omit<BucketActivity, 'id'>) => void;
  removeBucketActivity: (id: string) => void;
  addTradeFromBucket: (trade: Omit<Trade, 'id'>, bucketId: string) => void;
  dashboardWidgets: DashboardWidget[];
  setDashboardWidgets: (widgets: DashboardWidget[]) => void;
  totalInvested: number;
  totalUnrealizedPL: number;
  totalRealizedPL: number;
  totalDividends: number;
  customCategories: CustomCategory[];
  addCustomCategory: (type: 'INCOME' | 'EXPENSE', label: string, icon?: string) => Promise<void>;
  removeCustomCategory: (id: string) => Promise<void>;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    dashboard: "Dashboard",
    portfolio: "Portfolio",
    settings: "Settings",
    rebalance: "Rebalance",
    managementEngine: "MANAGEMENT ENGINE",
    targetAllocation: "Target Allocation",
    currentVsTarget: "Current vs Target Drift",
    suggestedTrades: "Suggested Trade Execution",
    executeAll: "Execute All Trades",
    totalImpact: "Total Impact",
    markets: "Markets",
    insights: "Insights",
    rebalanceNow: "REBALANCE",
    calculate: "CALCULATE REBALANCE",
    assetClass: "Asset Class",
    current: "Current",
    target: "Target",
    delta: "Delta",
    history: "Transaction History",
    profitLoss: "Profit/Loss (Historical)",
    calendar: "Calendar",
    buy: "BUY",
    sell: "SELL",
    addTrade: "Add Trade",
    assetName: "Asset Name",
    amountUsd: "Notional Value",
    confirm: "Confirm",
    cancel: "Cancel",
    searchPlaceholder: "Search assets, trades...",
    importCsv: "Import CSV",
    uploadCsvDesc: "Upload a .csv file to bulk import your trade history.",
    selectFile: "Select File",
    importSuccess: "Trades imported successfully!",
    transactions: "Transactions",
    pricing: "Pricing",
    premiumTier: "Premium Tier",
    marketPriceAndCost: "Price / Avg Cost",
    intradayTrend: "Intraday Trend",
    holdings: "Holdings",
    totalReturn: "Total Return",
    eliteAccess: "Elite Access",
    upgradeDesc: "Upgrade to Gold for AI-powered insights.",
    upgradeNow: "Upgrade Now",
    support: "Support",
    logout: "Logout",

    // Landing Page
    featuresNav: "Features",
    pricingNav: "Pricing",
    loginBtn: "Login",
    getStartedBtn: "Get Started",
    goToDashboard: "Go to Dashboard",
    futureOfWealth: "The Future of Wealth Management",
    masterYour: "Master Your",
    financialDestiny: "Financial Destiny",
    heroDesc: "Unified investment intelligence for the modern era. Track, analyze, and optimize your entire portfolio in one sophisticated interface.",
    startYourJourney: "Start Your Journey",
    viewPricing: "View Pricing",
    engineeredForExcellence: "Engineered for Excellence",
    everythingYouNeed: "Everything you need to dominate the markets",
    realTimeTracking: "Real-time Tracking",
    realTimeDesc: "Monitor your assets across all exchanges and wallets with zero latency.",
    institutionalSecurity: "Institutional Security",
    securityDesc: "Military-grade encryption and multi-factor authentication for your peace of mind.",
    aiInsightsFeature: "AI Insights",
    aiDesc: "Leverage advanced machine learning to identify trends and optimize your strategy.",
    globalMarketsFeature: "Global Markets",
    globalDesc: "Access data from over 100+ global exchanges and 10,000+ financial instruments.",
    assetAllocationFeature: "Asset Allocation",
    allocationDesc: "Visualize your diversification and rebalance your portfolio with one click.",
    advancedReporting: "Advanced Reporting",
    reportingDesc: "Generate professional-grade tax and performance reports in seconds.",
    chooseYourTier: "Choose Your Tier",
    transparentPricing: "Transparent pricing for every stage of growth",
    starter: "Starter",
    starterDesc: "Perfect for individuals just starting their investment journey.",
    pro: "Pro",
    proDesc: "Advanced tools for serious investors looking for an edge.",
    enterprise: "Enterprise",
    enterpriseDesc: "Custom solutions for institutional-grade portfolio management.",
    mostPopular: "Most Popular",
    perMonth: "/month",
    startForFree: "Start for Free",
    contactSales: "Contact Sales",
    readyToRedefine: "Ready to redefine your",
    financialFuture: "financial future?",
    joinThousands: "Join thousands of elite investors who trust FinTrack for their portfolio management.",
    getStartedNow: "Get Started Now",
    product: "Product",
    company: "Company",
    about: "About",
    blog: "Blog",
    careers: "Careers",
    contact: "Contact",
    security: "Security",
    privacyPolicyDoc: "Privacy Policy",
    termsOfServiceDoc: "Terms of Service",
    footerTagline: "The ultimate portfolio management platform for the modern investor. Precision, security, and intelligence in one unified dashboard.",
    allRightsReserved: "All rights reserved.",

    featureStarter1: "Up to 5 Portfolio Assets",
    featureStarter2: "Basic Performance Tracking",
    featureStarter3: "Daily Market Updates",
    featureStarter4: "Community Support",
    featureStarter5: "Standard Security",
    featurePro1: "Unlimited Portfolio Assets",
    featurePro2: "Real-time Analytics",
    featurePro3: "AI-Powered Insights",
    featurePro4: "Priority Support",
    featurePro5: "Advanced Risk Analysis",
    featurePro6: "Custom Export Formats",
    featureEnt1: "Multi-User Collaboration",
    featureEnt2: "Dedicated Account Manager",
    featureEnt3: "Custom API Access",
    featureEnt4: "White-label Reports",
    featureEnt5: "SLA Guarantee",
    featureEnt6: "Advanced Compliance Tools",

    // Chart Time Periods
    chart1d: "1D",
    chart5d: "5D",
    chart1w: "1W",
    chart1m: "1M",
    chart6m: "6M",
    chartYtd: "YTD",
    chart1y: "1Y",
    chart5y: "5Y",
    performanceTitle: "Performance",
    livePrice: "Live Price",
    avgCost: "Cost Basis",
    close: "Close",
    investmentJourney: "Investment Journey",
    initialPurchase: "Initial Purchase",
    milestone10: "+10% Milestone",
    milestone25: "+25% Milestone",
    currentPosition: "Current Position",
    target50: "Target: +50%",
    boughtShares: "Bought {shares} shares at {price}",
    holdingShares: "Holding {shares} shares worth {value}",
    firstMilestone: "First major profit milestone reached",
    strongPerformance: "Strong performance milestone",
    targetPrice: "Target price: {price}",
    noHistoricalData: "No historical data available",

    // Calendar
    performanceAudit: "Performance Audit",
    monthlyWinRate: "Monthly Win Rate",
    maxDrawdown: "Max Drawdown",
    netFintrackProfit: "Net Fintrack Profit",
    auditDetail: "Audit Detail",
    verified: "Verified",
    spotTrade: "Spot Trade",
    finalized: "Finalized",
    downloadFullLedger: "Download Full Ledger",
    marketCorrelations: "Market Correlations",
    macroAlignment: "Macro Alignment",
    riskExposure: "Risk Exposure",
    tradesCount: "trades",
    selectDate: "Select Date",
    noActivity: "No activity for this date",

    // Rebalance
    totalBalance: "Total Balance",
    totalNetWorth: "Total Net Worth",
    quickActions: "Quick Actions",
    quickTransfer: "Quick Transfer",
    recentActivity: "Recent Activity",
    viewAll: "View All",
    portfolioHealth: "Portfolio Health",
    monthlyProfit: "Monthly Profit/Loss",
    assetAllocation: "Asset Allocation",
    value: "Value",
    share: "Share",
    marketCap: "Market Cap",
    "24hChange": "24h Change",
    notifications: "Notifications",
    profileSettings: "Profile Settings",
    globalPerformance: "Global Performance",
    growthVelocity: "Growth Velocity",
    securityLogs: "Security Logs",
    vaultActivity: "Vault Activity",
    manualEntry: "Manual Entry",
    bulkImport: "Bulk Import",
    viewFullAudit: "View Full Audit",
    optimalRebalancingMsg: "System set rebalance alert at 3% drift. Recommendations trigger only when allocation exceeds this threshold.",
    marketVolatilityMsg: "Market volatility is low - optimal time for portfolio rebalancing.",
    harvestingGains: "Harvesting Gains",
    reduceOverExposure: "Reduce Over Exposure",
    increaseAllocation: "Increase Allocation",
    rateAtTrade: "Rate at Trade",
    currentRate: "Current Rate",
    initialInvestment: "Initial Investment",
    currentValue: "Current Value",
    assetInventory: "Asset Inventory",
    addAsset: "Add Asset",
    allocationByRisk: "Allocation by Risk",
    highRisk: "High Risk",
    moderateRisk: "Moderate Risk",
    conservativeRisk: "Conservative Risk",
    asset: "Asset",
    amount: "Amount",
    investedAmount: "Investment",
    valueAtTradeTime: "Value at Trade Time",
    valueNow: "Current Value",
    sharesReceived: "Quantity Received",
    holdingValue: "Holding Value",

    // Asset Class Names
    equities: "Equities",
    fixedIncome: "Fixed Income",
    alternatives: "Alternatives",
    cash: "Cash",
    total: "Total",

    // Vault Activity
    stakeRewardClaimed: "Stake Reward Claimed",
    stakeRewardTime: "2m ago • ETH Vault 01",
    btcLimitOrderFill: "BTC Limit Order Fill",
    btcLimitOrderTime: "4h ago • Trade Desk",
    tierBonus: "Tier Bonus",
    tierBonusTime: "Yesterday • Rewards",

    // Settings Page
    systemPreferences: "System Preferences",
    regionalSettings: "Regional Settings",
    languageLabel: "Language",
    baseCurrency: "Base Currency",
    accountSecurity: "Account & Security",
    accountProfile: "Account Profile",
    accountProfileDesc: "Manage your personal information and security.",
    securityPrivacy: "Security & Privacy",
    securityPrivacyDesc: "Two-factor authentication and session management.",
    notificationSettings: "Notifications",
    notificationSettingsDesc: "Configure alerts for price movements and rebalancing.",
    saveAllChanges: "Save All Changes",
    settingsSaved: "Settings saved successfully!",
    appearance: "Appearance",
    darkMode: "Dark Mode",
    darkModeDesc: "Use dark theme across the application.",
    dataManagement: "Data Management",
    exportData: "Export Data",
    exportDataDesc: "Download all your data as a JSON file for backup.",
    importData: "Import Data",
    importDataDesc: "Restore your data from a JSON backup file.",
    exportSuccess: "Data exported successfully!",
    importSuccessData: "Data imported successfully! Please refresh the page.",
    invalidBackupFile: "Invalid backup file format.",

    // Notification Preferences
    notifPreferences: "Notification Preferences",
    priceAlerts: "Price Movement Alerts",
    priceAlertsDesc: "Get notified when assets move significantly.",
    rebalanceAlerts: "Rebalance Alerts",
    rebalanceAlertsDesc: "Alerts when portfolio drifts from target allocation.",
    tradeConfirmations: "Trade Confirmations",
    tradeConfirmationsDesc: "Receive confirmation for executed trades.",
    weeklyReport: "Weekly Report",
    weeklyReportDesc: "Receive a weekly performance summary.",
    markAllRead: "Mark all read",
    clearAll: "Clear all",
    noNewNotifications: "You have no new notifications.",
    justNow: "Just now",
    minutesAgo: "{n} minutes ago",
    hoursAgo: "{n} hours ago",
    daysAgo: "{n} days ago",
    minsAgo: "{n}m ago",

    // Allocation Editor
    editAllocation: "Edit Allocation",
    editAllocationDesc: "Set target allocation percentages. Total must equal 100%.",
    totalMustBe100: "Total must equal 100%",
    allocationSaved: "Target allocation saved!",
    remaining: "Remaining",

    // Transactions Page
    buyVolume: "Buy Volume",
    sellVolume: "Sell Volume",
    exportCsv: "Export CSV",
    searchTransactions: "Search Ledger...",
    all: "All",
    pricePerUnit: "Price per unit",
    date: "Date",
    shares: "Shares",
    flow: "Flow",
    actions: "Actions",
    noTransactionsFound: "No Ledger Entries Found",
    transactionDeleted: "Transaction deleted.",
    csvFormatExample: "CSV Format Example",
    tradePrice: "Trade Price",
    sharesFromTrade: "Shares from Trade",
    currentPortfolioShares: "Current Portfolio Shares",
    currentValueThisTrade: "Current Value (This Trade)",
    portfolioBalanced: "Your portfolio is perfectly balanced!",

    // Money Buckets
    moneyManagement: "Account Management",
    moneyBuckets: "Money Buckets",
    moneyBucketsDesc: "Manage your cash accounts and savings buckets",
    addBucket: "Add Bucket",
    editBucket: "Edit Bucket",
    bucketName: "Bucket Name",
    targetPercent: "Income Split %",
    targetAmount: "Target Goal ($)",
    currentAmount: "Current Amount",
    suggestionInvest: "Excess amount! Consider investing:",
    savings: "Savings",
    emergency: "Emergency Fund",
    lowRiskInvest: "Low-risk Investment",
    highRiskInvest: "High-risk Investment",
    deleteBucket: "Delete Bucket",
    bucketSaved: "Bucket saved!",
    bucketDeleted: "Bucket deleted.",
    depositToBucket: "Deposit",
    deposit: "Deposit",
    withdraw: "Withdraw",
    transfer: "Transfer",
    bucketTransactions: "Bucket Transactions",
    invalidAmount: "Invalid Amount",
    withdrawFromBucket: "Withdraw",
    bucketTotal: "Total Allocated",
    bucketRemaining: "Remaining",
    customBucket: "Custom",
    budgetPage: "Bucket",
    incomeDistribution: "Income Distribution",
    enterIncome: "Enter Income Amount",
    distributeNow: "Distribute Now",
    investFromBucket: "Invest from Bucket",
    investAmount: "Investment Amount",
    investSource: "Source Bucket",
    addProfit: "Add Profit",
    profitAmount: "Profit Amount",
    smartSuggestion: "Smart Suggestion",
    suggestSafeHaven: "Transfer to Emergency Fund (Low Risk) to protect gains",
    suggestReinvest: "Re-invest to leverage compound growth",
    applyAdvice: "Apply Suggestion",
    actionLog: "Action Log",
    fixedExpenses: "Fixed Expenses & Debt",
    personalExpenses: "Personal Spending",
    emergencyFund: "Emergency Fund (Low Risk)",
    investmentGrowth: "Investment (High Risk)",
    bucketUsage: "Usage",
    noActivityYet: "No activity yet",
    adviceTitle: "Financial Advice",
    adviceDebt: "During debt repayment: Keep 40% allocated to debt until fully paid off.",
    advicePostDebt: "After debt is cleared: Redirect that 40% to Savings or Investment — don't change your lifestyle spending (30%).",
    adviceRisk: "For high-risk investments: Withdraw ONLY from the Investment bucket (10%). Never touch Emergency Fund (20%).",
    previewDistribution: "Preview Distribution",
    distributed: "Distributed",
    investedFromBucket: "Invested from bucket",
    profitAdded: "Profit added",
    linkedToExpenses: "Link to Expenses",
    linkedToExpensesDesc: "Auto-deduct from this bucket when adding expenses",
    deductFromBucket: "Deduct from bucket",
    selectBucket: "Select Bucket",
    colorInUse: "Already in use",
    currentTotal: "Current Total",
    exceeds100: "Exceeds 100%!",
    noRemainingPercent: "No remaining % available",

    // Cashflow Tracking
    cashflowOverview: "Cashflow Overview",
    totalIncome: "Total Income",
    totalExpenses: "Total Expenses",
    netCashflow: "Net Cashflow",
    addRecord: "Add Record",
    type: "Type",
    income: "Income",
    expense: "Expense",
    category: "Category",
    logIncomeExpense: "Log Income/Expense",
    note: "Note",
    recordSaved: "Record saved successfully!",
    salary: "Salary",
    food: "Food",
    transport: "Transport",
    utilities: "Utilities",
    entertainment: "Entertainment",
    investment: "Investment Return",
    other: "Other",

    // Calendar
    today: "Today",

    // Profile Menu
    myProfile: "My Profile",
    currentPrice: "Current Price",
    noLiveData: "Add this asset to Portfolio for live tracking",

    // Missing translations
    confirmDelete: "Are you sure you want to delete this entry?",
    monthlyOverview: "This Month",
    incomeByCategory: "Income by Category",
    expenseByCategory: "Expense by Category",
    zoomChart: "Zoom chart",
    importedTransactions: "Imported transactions:",
    confirmDeleteLedger: "Are you sure you want to delete this ledger entry?",
    noLedgersFound: "No Ledgers Found",
    searchLedger: "Search Ledger...",
    overallAvgCost: "Overall Avg Cost",
    loading: "Loading...",
    customColor: "Custom Color",
    noRecordsFound: "No records found",

    // Transaction Details
    transactionDetails: "Transaction Details",
    atTimeOfTrade: "At time of trade",
    totalValue: "Total Value",
    tag: "Tag",
    exchangeRate: "Exchange Rate",
    timestamp: "Timestamp",
    adjustAmount: "Adjust Amount",

    // Chart months
    chartMonthJan: "JAN",
    chartMonthFeb: "FEB",
    chartMonthMar: "MAR",
    chartMonthApr: "APR",
    chartMonthMay: "MAY",
    chartMonthJun: "JUN",
    chartMonthJul: "JUL",
    chartMonthAug: "AUG",
    chartMonthSep: "SEP",
    chartMonthOct: "OCT",
    chartMonthNov: "NOV",
    chartMonthDec: "DEC",

    // Additional missing
    noChartData: "No data",
    deleteAsset: "Delete Asset",
    edit: "Edit",
    editAssets: "Edit Assets",
    delete: "Delete",
    confirmDeleteAsset: "Confirm Delete",
    amountExceedsBalance: "Amount exceeds bucket balance",
    insufficientBucketBalance: "Insufficient balance in {bucket}",
    noValidTradesFound: "No valid trades found",
    importError: "Failed to import file",
    errorOccurred: "An error occurred",
    bucket: "Bucket",
    buckets: "buckets",
    priceAsOf: "Price as of",
    assetNotFound: "Asset not found",
    backToPortfolio: "Back to Portfolio",
    tradesExecuted: "trades executed",
    insufficientBalanceIn: "Insufficient balance in",
    // AddAssetModal
    searchAssetPlaceholder: "Search e.g. BTC, AAPL, MSFT...",
    noResultsFound: "No results found",
    typeToSearch: "Type an asset name or symbol to search",
    change: "Change",
    quantitySharesCoins: "Quantity (Shares/Coins)",
    avgCostPerUnit: "Avg Cost per Unit",
    totalInvestment: "Total Investment",
    // StockChart
    period1d: "1D",
    period5d: "5D",
    period1w: "1W",
    period1m: "1M",
    period6m: "6M",
    periodYtd: "YTD",
    period1y: "1Y",
    period5y: "5Y",
    periodHigh: "Period High",
    periodLow: "Period Low",
    periodReturn: "Period Return",
    dataPoints: "data points",
    loadingChartData: "Loading chart data...",
    failedToLoadData: "Failed to load data",
    uptrend: "Uptrend",
    downtrend: "Downtrend",
    hoverToSeePrice: "Hover to see price",
    assetsInPortfolio: "assets in portfolio",
    fromStart: "from start",
    approx: "≈",
    allocation: "allocation",
    executed: "Executed",

    // Widget Dashboard
    editDashboard: "Edit Dashboard",
    doneDashboard: "Done",
    addWidget: "Add Widget",
    removeWidget: "Remove",
    widgetWatchlist: "Watchlist",
    widgetMonthlySummary: "Monthly Summary",
    widgetAllocationPie: "Asset Allocation",
    widgetDailyJournal: "Trade Journal",
    widgetEquityCurve: "Equity Curve",
    widgetBucketOverview: "Money Buckets",
    widgetPLCalendar: "P/L Calendar",
    widgetTopMovers: "Top Movers",
    widgetLibrary: "Widget Library",
    dragToReorder: "Drag to reorder",
    resetLayout: "Reset Layout",

    // Enhanced P/L
    totalInvested: "Total Invested",
    unrealizedPL: "Unrealized P/L",
    realizedPL: "Realized P/L",
    realized: "Realized P/L",
    dividends: "Dividends",
    sourceBucket: "Source Bucket",
    selectSourceBucket: "Select source bucket",
    noBucketSelected: "No bucket (manual)",
    bucketBalance: "Balance",
    deductedFromBucket: "Deducted from bucket",
    portfolioValue: "Portfolio Value",
    costBasis: "Cost Basis",

    // Import & Filter
    importExisting: "Import from external",
    importExistingDesc: "Won't deduct from budget",
    newPurchase: "New Purchase",
    newPurchaseDesc: "Deduct from selected bucket",
    filterAll: "All",
    filterByCategory: "By Category",
    filterByType: "By Type",
    stockType: "Stock",
    cryptoType: "Crypto",
    thaiStockType: "Thai Stock",
    favorites: "Favorites",
    importCsvPortfolio: "Import CSV",
    exportCsvPortfolio: "Export CSV",
    csvImportedAssets: "Imported assets from CSV!",
    csvExportSuccess: "Portfolio exported!",
    csvImportInstructions: "CSV format: symbol, shares, avgCost (one asset per row)",

    // Calendar Tags
    dayTrade: "Day Trade",
    swingTrade: "Swing Trade",
    longTerm: "Long Term",
    dividendIncome: "Dividend",
    cryptoTrade: "Crypto",
    forexTrade: "Forex",
    allTags: "All Tags",
    equityCurve: "Equity Curve",
    cumulativePL: "Cumulative P/L",
    noDataYet: "No data yet",
    portfolioGrowth: "Portfolio Growth",
    progress: "Progress",
    performance: "Performance",
    winRate: "Win Rate",
    wins: "Wins",
    losses: "Losses",
    avgWin: "Avg Win",
    avgLoss: "Avg Loss",

    // Ledger Page
    ledger: "Ledger",
    ledgerSubtitle: "Daily Income & Expense Tracker",
    ledgerThisMonthIn: "This Month In",
    ledgerThisMonthOut: "This Month Out",
    ledgerNet: "Net",
    addIncome: "+ Income",
    addExpense: "+ Expense",
    addIncomeTitle: "Add Income",
    addExpenseTitle: "Add Expense",
    ledgerDescription: "Description (optional)",
    ledgerDescPlaceholderIncome: "e.g. Monthly salary, Project payment...",
    ledgerDescPlaceholderExpense: "e.g. Lunch with colleagues, Grab taxi...",
    ledgerCategoryHint: "Category — pick or type your own",
    ledgerCustomCategory: "+ Custom",
    ledgerAddCategory: "Add",
    ledgerTypeCategory: "Type your category name...",
    ledgerDepositTo: "Deposit to",
    ledgerDeductFrom: "Deduct from",
    ledgerAutoSplit: "Auto-split",
    ledgerSaveIncome: "Save Income",
    ledgerSaveExpense: "Save Expense",
    ledgerSearchPlaceholder: "Search transactions...",
    ledgerFilterAll: "All",
    ledgerFilterIn: "In",
    ledgerFilterOut: "Out",
    ledgerNoRecords: "No records yet",
    ledgerNoRecordsHint: "Tap + Income or + Expense above to get started",
    ledgerDeleteTitle: "Delete Record",
    ledgerDeleteMessage: "Are you sure you want to delete this transaction?",
    ledgerNewNet: "New net:",
    ledgerToday: "Today",
    ledgerYesterday: "Yesterday",
    // preset categories
    freelance: "Freelance",
    dividend: "Dividend",
    gift: "Gift",
    rental: "Rental Income",
    shopping: "Shopping",
    health: "Health",
    education: "Education",
    coffee: "Coffee",
    travel: "Travel",
    last7Days: "Last 7 Days",
    last30Days: "Last 30 Days",
    thisMonth: "This Month",
    lastMonth: "Last Month",
    custom: "Custom",
    from: "From",
  },
  th: {
    dashboard: "แผงควบคุม",
    portfolio: "พอร์ตโฟลิโอ",
    settings: "ตั้งค่า",
    rebalance: "ปรับสมดุล",
    managementEngine: "ระบบจัดการการลงทุน",
    targetAllocation: "เป้าหมายการจัดสรรสินทรัพย์",
    currentVsTarget: "การเบี่ยงเบนจากเป้าหมาย",
    suggestedTrades: "รายการซื้อขายที่แนะนำ",
    executeAll: "ดำเนินการซื้อขายทั้งหมด",
    totalBalance: "ยอดเงินคงเหลือ",
    totalNetWorth: "ยอดทรัพย์สินสุทธิ",
    quickActions: "เมนูด่วน",
    quickTransfer: "โอนเงินด่วน",
    recentActivity: "กิจกรรมล่าสุด",
    viewAll: "ดูทั้งหมด",
    portfolioHealth: "สุขภาพพอร์ต",
    monthlyProfit: "กำไร/ขาดทุน รายเดือน",
    assetAllocation: "สัดส่วนสินทรัพย์",
    value: "มูลค่า",
    share: "สัดส่วน",
    marketCap: "มูลค่าตลาด",
    "24hChange": "การเปลี่ยนแปลง 24 ชม.",
    notifications: "การแจ้งเตือน",
    profileSettings: "การตั้งค่าโปรไฟล์",
    globalPerformance: "ผลการดำเนินงาน",
    growthVelocity: "อัตราการเติบโต",
    securityLogs: "บันทึกความปลอดภัย",
    vaultActivity: "กิจกรรมพอร์ตโฟลิโอ",
    manualEntry: "บันทึกด้วยตนเอง",
    bulkImport: "นำเข้าข้อมูลทีละมาก",
    csvFormatExample: "ตัวอย่างรูปแบบ CSV",
    viewFullAudit: "ดูประวัติทั้งหมด",
    optimalRebalancingMsg: "ระบบตั้งค่าจุดแจ้งเตือน Rebalance ไว้ที่ความคลาดเคลื่อน 3% ระบบจะแนะนำการซื้อขายเมื่อสัดส่วนเกินขีดจำกัดนี้เท่านั้น",
    marketVolatilityMsg: "ความผันผวนของตลาดต่ำ เป็นช่วงเวลาที่เหมาะสำหรับการปรับสมดุลพอร์ต",
    harvestingGains: "ทำกำไรได้",
    reduceOverExposure: "ลดความเสี่ยงจากการถือครองมากเกินไป",
    increaseAllocation: "เพิ่มสัดส่วนการลงทุน",
    rateAtTrade: "อัตราแลกเปลี่ยนขณะทำรายการ",
    currentRate: "อัตราแลกเปลี่ยนปัจจุบัน",
    initialInvestment: "เงินลงทุนเริ่มต้น",
    currentValue: "มูลค่าปัจจุบัน",
    assetInventory: "คลังสินทรัพย์",
    addAsset: "เพิ่มสินทรัพย์",
    allocationByRisk: "สัดส่วนตามความเสี่ยง",
    highRisk: "ความเสี่ยงสูง",
    moderateRisk: "ปานกลาง",
    conservativeRisk: "ความเสี่ยงต่ำ",
    asset: "สินทรัพย์",

    // Settings Page
    systemPreferences: "การตั้งค่าระบบ",
    regionalSettings: "การตั้งค่าภูมิภาค",
    languageLabel: "ภาษา",
    baseCurrency: "สกุลเงินหลัก",
    accountSecurity: "บัญชีและความปลอดภัย",
    accountProfile: "โปรไฟล์บัญชี",
    accountProfileDesc: "จัดการข้อมูลส่วนตัวและความปลอดภัย",
    securityPrivacy: "ความปลอดภัยและความเป็นส่วนตัว",
    securityPrivacyDesc: "การยืนยันตัวตนสองชั้นและการจัดการเซสชัน",
    notificationSettings: "การแจ้งเตือน",
    notificationSettingsDesc: "ตั้งค่าการแจ้งเตือนการเคลื่อนไหวราคาและการปรับสมดุล",
    saveAllChanges: "บันทึกการเปลี่ยนแปลง",
    settingsSaved: "บันทึกการตั้งค่าเรียบร้อย!",
    appearance: "รูปลักษณ์",
    darkMode: "โหมดมืด",
    darkModeDesc: "ใช้ธีมมืดทั่วทั้งแอปพลิเคชัน",
    dataManagement: "จัดการข้อมูล",
    exportData: "สำรองข้อมูล",
    exportDataDesc: "ดาวน์โหลดข้อมูลทั้งหมดเป็นไฟล์ JSON",
    importData: "นำเข้าข้อมูล",
    importDataDesc: "กู้คืนข้อมูลจากไฟล์สำรอง JSON",
    exportSuccess: "สำรองข้อมูลสำเร็จ!",
    importSuccessData: "นำเข้าข้อมูลสำเร็จ! กรุณารีเฟรชหน้า",
    invalidBackupFile: "รูปแบบไฟล์สำรองไม่ถูกต้อง",

    // Notification Preferences
    notifPreferences: "ตั้งค่าการแจ้งเตือน",
    priceAlerts: "แจ้งเตือนการเคลื่อนไหวราคา",
    priceAlertsDesc: "รับการแจ้งเตือนเมื่อสินทรัพย์เปลี่ยนแปลงมาก",
    rebalanceAlerts: "แจ้งเตือนการปรับสมดุล",
    rebalanceAlertsDesc: "แจ้งเตือนเมื่อพอร์ตเบี่ยงเบนจากเป้าหมาย",
    tradeConfirmations: "ยืนยันการซื้อขาย",
    tradeConfirmationsDesc: "รับการยืนยันเมื่อคำสั่งซื้อขายถูกดำเนินการ",
    weeklyReport: "รายงานรายสัปดาห์",
    weeklyReportDesc: "รับสรุปผลการดำเนินงานรายสัปดาห์",
    markAllRead: "อ่านทั้งหมดแล้ว",
    clearAll: "ล้างทั้งหมด",
    noNewNotifications: "ไม่มีการแจ้งเตือนใหม่",
    justNow: "เมื่อสักครู่",
    minutesAgo: "{n} นาทีที่แล้ว",
    hoursAgo: "{n} ชั่วโมงที่แล้ว",

    // Allocation Editor
    editAllocation: "แก้ไขสัดส่วนการลงทุน",
    editAllocationDesc: "กำหนดเป้าหมายสัดส่วนเป็นเปอร์เซ็นต์ รวมต้องเท่ากับ 100%",
    totalMustBe100: "รวมต้องเท่ากับ 100%",
    allocationSaved: "บันทึกเป้าหมายสัดส่วนเรียบร้อย!",
    remaining: "เหลือ",

    // Transactions Page
    buyVolume: "มูลค่าซื้อ",
    sellVolume: "มูลค่าขาย",
    exportCsv: "ส่งออก CSV",
    searchTransactions: "ค้นหาบันทึก...",
    all: "ทั้งหมด",
    pricePerUnit: "ราคาต่อหน่วย",
    date: "วันที่",
    shares: "จำนวน",
    flow: "ประเภท",
    actions: "ดำเนินการ",
    noTransactionsFound: "ไม่พบรายการ",
    transactionDeleted: "ลบรายการเรียบร้อย",
    tradePrice: "ราคาตอนที่ซื้อ",
    sharesFromTrade: "จำนวนที่ซื้อได้",
    currentPortfolioShares: "จำนวนพอร์ตปัจจุบัน",
    overallAvgCost: "ราคาทุนเฉลี่ยรวม",
    currentValueThisTrade: "มูลค่าปัจจุบัน (ออเดอร์นี้)",
    portfolioBalanced: "พอร์ตของคุณสมดุลดีเยี่ยมแล้ว",

    // Money Buckets
    moneyManagement: "จัดการบัญชี",
    moneyBuckets: "กระเป๋าเงิน",
    moneyBucketsDesc: "จัดการบัญชีเงินสดและกระเป๋าออม",
    addBucket: "เพิ่มกระเป๋า",
    editBucket: "แก้ไขกระเป๋า",
    bucketName: "ชื่อกระเป๋า",
    targetPercent: "เปอร์เซ็นต์แบ่งเงิน",
    targetAmount: "เป้าหมายเงินเก็บ",
    currentAmount: "ยอดปัจจุบัน",
    suggestionInvest: "ยอดเงินเกินเป้าหมาย! นำส่วนเกินไปลงทุน:",
    savings: "เงินเก็บ",
    emergency: "เงินฉุกเฉิน",
    lowRiskInvest: "ลงทุนเสี่ยงต่ำ",
    highRiskInvest: "ลงทุนเสี่ยงสูง",
    deleteBucket: "ลบกระเป๋า",
    bucketSaved: "บันทึกกระเป๋าเรียบร้อย!",
    bucketDeleted: "ลบกระเป๋าแล้ว",
    depositToBucket: "ฝากเงิน",
    deposit: "ฝากเพิ่ม",
    withdraw: "ถอนออก",
    transfer: "โอนเงิน",
    bucketTransactions: "ธุรกรรมกระเป๋า",
    invalidAmount: "จำนวนเงินไม่ถูกต้อง",
    withdrawFromBucket: "ถอนเงิน",
    bucketTotal: "จัดสรรรวม",
    bucketRemaining: "เหลือ",
    customBucket: "กำหนดเอง",
    budgetPage: "Bucket",
    incomeDistribution: "กระจายรายได้",
    enterIncome: "กรอกจำนวนรายได้",
    distributeNow: "กระจายเงินทันที",
    investFromBucket: "ลงทุนจากกระเป๋า",
    investAmount: "จำนวนเงินลงทุน",
    investSource: "กระเป๋าต้นทาง",
    addProfit: "เพิ่มกำไร",
    profitAmount: "จำนวนกำไร",
    smartSuggestion: "คำแนะนำอัจฉริยะ",
    suggestSafeHaven: "โอนเข้ากระเป๋าเงินสำรอง (ความเสี่ยงต่ำ) เพื่อรักษากำไร",
    suggestReinvest: "ลงทุนต่อเพื่อใช้พลังดอกเบี้ยทบต้น",
    applyAdvice: "ใช้คำแนะนำ",
    actionLog: "ประวัติการทำรายการ",
    fixedExpenses: "ค่าใช้จ่ายคงที่ + หนี้สิน",
    personalExpenses: "ค่าใช้จ่ายส่วนตัว",
    emergencyFund: "เงินสำรองฉุกเฉิน (ความเสี่ยงต่ำ)",
    investmentGrowth: "เงินลงทุน (ความเสี่ยงสูง)",
    bucketUsage: "ใช้ไป",
    noActivityYet: "ยังไม่มีรายการ",
    adviceTitle: "คำแนะนำทางการเงิน",
    adviceDebt: "ช่วงแก้หนี้: คง 40% ไว้ที่หนี้สินจนกว่าจะหมด",
    advicePostDebt: "เมื่อหนี้หมด: ย้าย 40% ไปเพิ่มในเงินออมหรือลงทุน โดยไม่ต้องเปลี่ยนไลฟ์สไตล์การใช้จ่าย (30%)",
    adviceRisk: "ลงทุนเสี่ยงสูง: ดึงจากกระเป๋าลงทุน (10%) เท่านั้น ห้ามแตะเงินสำรอง (20%)",
    previewDistribution: "ดูตัวอย่างการกระจาย",
    distributed: "กระจายเงินแล้ว",
    investedFromBucket: "ลงทุนจากกระเป๋า",
    profitAdded: "เพิ่มกำไรแล้ว",
    linkedToExpenses: "ผูกกับรายจ่าย",
    linkedToExpensesDesc: "หักจากกระเป๋านี้อัตโนมัติเมื่อเพิ่มรายจ่าย",
    deductFromBucket: "หักจากกระเป๋า",
    selectBucket: "เลือกกระเป๋า",

    // Calendar
    today: "วันนี้",

    // Profile Menu
    myProfile: "โปรไฟล์ของฉัน",

    // Asset Class Names
    equities: "หุ้น",
    fixedIncome: "ตราสารหนี้",
    alternatives: "สินทรัพย์ทางเลือก",
    cash: "เงินสด",
    total: "รวม",

    // Vault Activity
    stakeRewardClaimed: "รับรางวัล Stake",
    stakeRewardTime: "2 นาทีที่แล้ว • ETH Vault 01",
    btcLimitOrderFill: "คำสั่ง BTC Limit สำเร็จ",
    btcLimitOrderTime: "4 ชั่วโมงที่แล้ว • Trade Desk",
    tierBonus: "โบนัสระดับ",
    tierBonusTime: "เมื่อวานนี้ • รางวัล",

    // Calendar
    performanceAudit: "ตรวจสอบผลการดำเนินงาน",
    monthlyWinRate: "อัตราการชนะรายเดือน",
    maxDrawdown: "การขาดทุนสูงสุด",
    netFintrackProfit: "กำไรสุทธิ FinTrack",
    auditDetail: "รายละเอียดการตรวจสอบ",
    verified: "ตรวจสอบแล้ว",
    spotTrade: "การซื้อขาย Spot",
    finalized: "สรุปยอดแล้ว",
    downloadFullLedger: "ดาวน์โหลดบัญชีทั้งหมด",
    marketCorrelations: "ความสัมพันธ์ของตลาด",
    macroAlignment: "ความสอดคล้องระดับมหภาค",
    riskExposure: "ความเสี่ยงที่เปิดรับ",
    tradesCount: "รายการ",
    selectDate: "เลือกวันที่",
    noActivity: "ไม่มีกิจกรรมในวันนี้",

    // Landing Page
    featuresNav: "ฟีเจอร์",
    pricingNav: "ราคา",
    loginBtn: "เข้าสู่ระบบ",
    getStartedBtn: "เริ่มต้นใช้งาน",
    goToDashboard: "เข้าสู่แดชบอร์ด",
    futureOfWealth: "อนาคตของการบริหารความมั่งคั่ง",
    masterYour: "ควบคุม",
    financialDestiny: "อนาคตทางการเงินของคุณ",
    heroDesc: "ระบบอัจฉริยะแบบบูรณาการสำหรับการลงทุนยุคใหม่ ติดตาม วิเคราะห์ และปรับพอร์ทในจอเดียว",
    startYourJourney: "เริ่มต้นการเดินทาง",
    viewPricing: "ดูราคา",
    engineeredForExcellence: "ออกแบบมาเพื่อความเป็นเลิศ",
    everythingYouNeed: "ทุกสิ่งที่คุณต้องการเพื่อคว้าชัยในตลาด",
    realTimeTracking: "ติดตามผลแบบเรียลไทม์",
    realTimeDesc: "ติดตามสินทรัพย์ข้ามกระดานเทรดและกระเป๋าเงินได้อย่างลื่นไหลไร้ความหน่วง",
    institutionalSecurity: "ความปลอดภัยขั้นสูง",
    securityDesc: "เข้ารหัสระดับกองทัพและยืนยันตัวตนหลายชั้นเพื่อความอุ่นใจอย่างที่สุด",
    aiInsightsFeature: "เจาะลึกข้อมูลด้วย AI",
    aiDesc: "ใช้ Machine Learning ค้นหาแนวโน้มและปรับกลยุทธ์ของคุณดั่งเซียน",
    globalMarketsFeature: "การเงินทั่วโลกระดับปรมาจารย์",
    globalDesc: "เข้าถึงข้อมูลจากกว่า 100+ แหล่งข้อมูลทั่วโลกและตราสารนับหมื่น",
    assetAllocationFeature: "กระจายพอร์ตระดับบอส",
    allocationDesc: "ปรับพอร์ตให้สมดุลและกระจายความเสี่ยงด้วยเทคโนโลยีชั้นยอด",
    advancedReporting: "ระบบรายงานชั้นครู",
    reportingDesc: "สร้างรายงานระดับโปรและผลประกอบการได้ฉับไว",
    chooseYourTier: "เลือกแพ็คเกจของคุณ",
    transparentPricing: "ราคาที่โปร่งใสสำหรับการลงทุนทุกระดับ",
    starter: "Starter",
    starterDesc: "เหมาะสำหรับรายย่อยที่เพิ่งเริ่มลงทุนและต้องการเครื่องมือช่วยเหลือ",
    pro: "Pro",
    proDesc: "เครื่องมือขั้นสูงสำหรับนักลงทุนมืออาชีพที่มองหาความได้เปรียบ",
    enterprise: "Enterprise",
    enterpriseDesc: "โซลูชันยกระดับปรับแต่งได้อิสระเพื่อบริหารพอร์ตระดับสถาบัน",
    mostPopular: "ยอดนิยม",
    perMonth: "/เดือน",
    startForFree: "เริ่มใช้งานฟรี",
    contactSales: "ติดต่อทีมขาย",
    readyToRedefine: "พร้อมรึยังที่จะยกระดับ",
    financialFuture: "อนาคตทั้งหมดของคุณ?",
    joinThousands: "เข้าร่วมกับนักลงทุนระดับแนวหน้านับพันที่ไว้วางใจให้ FinTrack โอบอุ้มพอร์ทให้",
    getStartedNow: "เริ่มต้นตอนนี้เลย",
    product: "ผลิตภัณฑ์",
    company: "บริษัท",
    about: "เกี่ยวกับเรา",
    blog: "อัปเดต",
    careers: "ร่วมงานกับเรา",
    contact: "ติดต่อเรา",
    security: "ความปลอดภัย",
    privacyPolicyDoc: "นโยบายความเป็นส่วนตัว",
    termsOfServiceDoc: "ข้อตกลงในการใช้งาน",
    footerTagline: "สุดยอดแพลตฟอร์มบริหารพอร์ตสำหรับผู้ลงทุนยุคใหม่ แม่นยำ ปลอดภัย และอัจฉริยะในแดชบอร์ดเดียว",
    allRightsReserved: "สงวนลิขสิทธิ์",

    featureStarter1: "รองรับสูงสุด 5 สินทรัพย์",
    featureStarter2: "ติดตามผลประกอบการพื้นฐาน",
    featureStarter3: "อัปเดตตลาดรายวัน",
    featureStarter4: "สนับสนุนโดยคอมมูนิตี้",
    featureStarter5: "ความปลอดภัยแบบมาตรฐาน",
    featurePro1: "รองรับสินทรัพย์ไร้รันิมิต",
    featurePro2: "วิเคราะห์เรียลไทม์",
    featurePro3: "เจาะลึกข้อมูลด้วยขุมพลัง AI",
    featurePro4: "ทีมซัพพอร์ตด่วนพิเศษ",
    featurePro5: "วิเคราะห์ความเสี่ยงประเมินลึก",
    featurePro6: "รูปแบบส่งออกแบบอิสระตามใจ",
    featureEnt1: "ร่วมจัดการพอร์ตหลายผู้ใช้งานรวด",
    featureEnt2: "ผู้จัดการบัญชีบิลส่วนพระองค์",
    featureEnt3: "เชื่อมต่อประยุกต์ API อิสระกว้าง",
    featureEnt4: "รายงานแบรนด์ตัวเองระดับมือโปร",
    featureEnt5: "การันตีระบบเสถียรดั่งเพชร 99%",
    featureEnt6: "เครื่องมือระดับสถาบันระดับเซียน",

    // Cashflow Tracking
    cashflowOverview: "ภาพรวมรายรับรายจ่าย",
    totalIncome: "รายรับรวม",
    totalExpenses: "รายจ่ายรวม",
    netCashflow: "กระแสเงินสดสุทธิ",
    addRecord: "เพิ่มรายการ",
    type: "ประเภท",
    income: "รายรับ",
    expense: "รายจ่าย",
    category: "หมวดหมู่",
    logIncomeExpense: "บันทึกรายรับ/รายจ่าย",
    note: "หมายเหตุ",
    recordSaved: "บันทึกรายการสำเร็จ!",
    salary: "เงินเดือน",
    food: "อาหาร",
    transport: "การเดินทาง",
    utilities: "สาธารณูปโภค",
    entertainment: "ความบันเทิง",
    investment: "ผลตอบแทนจากการลงทุน",
    other: "อื่นๆ",

    // Chart Time Periods
    chart1d: "1วัน",
    chart5d: "5วัน",
    chart1w: "1สด.",
    chart1m: "1ด.",
    chart6m: "6ด.",
    chartYtd: "YTD",
    chart1y: "1ปี",
    chart5y: "5ปี",
    performanceTitle: "ผลการดำเนินงาน",
    livePrice: "ราคาปัจจุบัน",
    avgCost: "ต้นทุนเฉลี่ย",
    close: "ปิด",
    investmentJourney: "การลงทุนของคุณ",
    initialPurchase: "ซื้อครั้งแรก",
    milestone10: "เหนือเป้า +10%",
    milestone25: "เหนือเป้า +25%",
    currentPosition: "สถานะปัจจุบัน",
    target50: "เป้าหมาย: +50%",
    boughtShares: "ซื้อ {shares} หุ้น ที่ราคา {price}",
    holdingShares: "ถือ {shares} หุ้น มูลค่า {value}",
    firstMilestone: "บรรลุเป้าหมายกำไรครั้งแรก",
    strongPerformance: "ผลงานแกร่งผ่านเป้า",
    targetPrice: "ราคาเป้าหมาย: {price}",
    noHistoricalData: "ไม่มีข้อมูลย้อนหลัง",

    insights: "ข้อมูลเชิงลึก",
    rebalanceNow: "ปรับสมดุล",
    calculate: "คำนวณการปรับสมดุล",
    assetClass: "ประเภทสินทรัพย์",
    current: "ปัจจุบัน",
    target: "เป้าหมาย",
    delta: "ส่วนต่าง",
    history: "ประวัติการทำรายการ",
    profitLoss: "กำไร/ขาดทุน (ตามอัตราแลกเปลี่ยนย้อนหลัง)",
    calendar: "ปฏิทิน",
    buy: "ซื้อ",
    sell: "ขาย",
    addTrade: "เพิ่มรายการ",
    assetName: "ชื่อสินทรัพย์",
    amountUsd: "มูลค่าสัญญา",
    confirm: "ยืนยัน",
    cancel: "ยกเลิก",
    searchPlaceholder: "ค้นหาสินทรัพย์, รายการ...",
    importCsv: "นำเข้า CSV",
    uploadCsvDesc: "อัปโหลดไฟล์ .csv เพื่อนำเข้าประวัติการซื้อขายจำนวนมาก",
    selectFile: "เลือกไฟล์",
    importSuccess: "นำเข้าข้อมูลสำเร็จ!",
    transactions: "ธุรกรรมเงิน",
    pricing: "ราคาแพ็กเกจ",
    premiumTier: "สมาชิกพรีเมียม",
    marketPriceAndCost: "ราคา / ต้นทุน",
    intradayTrend: "แนวโน้มรายวัน",
    holdings: "ถือครอง",
    totalReturn: "ผลตอบแทน",
    eliteAccess: "สิทธิพิเศษขั้นสูงสุด",
    upgradeDesc: "อัปเกรดเป็น Gold เพื่อรับบทวิเคราะห์จาก AI",
    upgradeNow: "อัปเกรดเลย",
    support: "ศูนย์ช่วยเหลือ",
    logout: "ออกจากระบบ",

    totalImpact: "ผลกระทบรวม",
    markets: "ตลาด",
    amount: "มูลค่าสัญญา",
    investedAmount: "เงินลงทุน",
    valueAtTradeTime: "มูลค่า ณ วันที่ซื้อ",
    valueNow: "มูลค่าปัจจุบัน",
    sharesReceived: "จำนวนที่ได้",
    holdingValue: "มูลค่าถือครอง",
    currentPrice: "ราคาตอนนี้",
    noLiveData: "เพิ่มสินทรัพย์นี้ในพอร์ตเพื่อติดตามแบบเรียลไทม์",

    // Missing translations
    confirmDelete: "คุณแน่ใจหรือไม่ที่จะลบรายการนี้?",
    monthlyOverview: "เดือนนี้",
    incomeByCategory: "รายได้ตามหมวดหมู่",
    expenseByCategory: "รายจ่ายตามหมวดหมู่",
    zoomChart: "ซูมกราฟ",
    importedTransactions: "นำเข้ารายการ:",
    confirmDeleteLedger: "คุณแน่ใจหรือไม่ที่จะลบรายการบัญชีนี้?",
    noLedgersFound: "ไม่พบรายการบัญชี",
    searchLedger: "ค้นหาบัญชี...",
    loading: "กำลังโหลด...",
    customColor: "สีกำหนดเอง",
    colorInUse: "สีนี้ถูกใช้แล้ว",
    currentTotal: "ผลรวมปัจจุบัน",
    exceeds100: "เกิน 100%!",
    noRemainingPercent: "ไม่มี%ที่เหลือ",
    noRecordsFound: "ไม่พบรายการ",

    // Transaction Details
    transactionDetails: "รายละเอียดธุรกรรม",
    atTimeOfTrade: "ณ เวลาทำรายการ",
    totalValue: "มูลค่ารวม",
    tag: "แท็ก",
    exchangeRate: "อัตราแลกเปลี่ยน",
    timestamp: "วันที่เวลา",
    adjustAmount: "ปรับจำนวนเงิน",

    // Chart months
    chartMonthJan: "ม.ค.",
    chartMonthFeb: "ก.พ.",
    chartMonthMar: "มี.ค.",
    chartMonthApr: "เม.ย.",
    chartMonthMay: "พ.ค.",
    chartMonthJun: "มิ.ย.",
    chartMonthJul: "ก.ค.",
    chartMonthAug: "ส.ค.",
    chartMonthSep: "ก.ย.",
    chartMonthOct: "ต.ค.",
    chartMonthNov: "พ.ย.",
    chartMonthDec: "ธ.ค.",

    // Additional missing
    noChartData: "ไม่มีข้อมูล",
    deleteAsset: "ลบสินทรัพย์",
    edit: "แก้ไข",
    editAssets: "แก้ไขสินทรัพย์",
    delete: "ลบ",
    confirmDeleteAsset: "ยืนยันการลบ",
    amountExceedsBalance: "จำนวนเงินเกินยอดคงเหลือ",
    insufficientBucketBalance: "ยอดเงินใน{bucket}ไม่พอ",
    noValidTradesFound: "ไม่พบรายการที่ถูกต้อง",
    importError: "ไม่สามารถนำเข้าไฟล์ได้",
    errorOccurred: "เกิดข้อผิดพลาด",
    bucket: "กระเป๋า",
    buckets: "กระเป๋า",
    priceAsOf: "ราคา ณ",
    assetNotFound: "ไม่พบสินทรัพย์",
    backToPortfolio: "กลับไปยังพอร์ตโฟลิโอ",
    tradesExecuted: "รายการถูกดำเนินการ",
    insufficientBalanceIn: "ยอดเงินไม่พอใน",
    // AddAssetModal
    searchAssetPlaceholder: "ค้นหา เช่น BTC, AAPL, MSFT...",
    noResultsFound: "ไม่พบผลลัพธ์",
    typeToSearch: "พิมพ์ชื่อหรือสัญลักษณ์สินทรัพย์เพื่อค้นหา",
    change: "เปลี่ยน",
    quantitySharesCoins: "จำนวน (หุ้น/เหรียญ)",
    avgCostPerUnit: "ราคาทุนเฉลี่ยต่อหน่วย",
    totalInvestment: "ยอดลงทุนรวม",
    // StockChart
    period1d: "1วัน",
    period5d: "5วัน",
    period1w: "1สด.",
    period1m: "1ด.",
    period6m: "6ด.",
    periodYtd: "YTD",
    period1y: "1ปี",
    period5y: "5ปี",
    periodHigh: "สูงสุดในงวด",
    periodLow: "ต่ำสุดในงวด",
    periodReturn: "ผลตอบแทนงวด",
    dataPoints: "จุดข้อมูล",
    loadingChartData: "กำลังโหลดข้อมูล...",
    failedToLoadData: "โหลดข้อมูลไม่สำเร็จ",
    uptrend: "แนวโน้มขึ้น",
    downtrend: "แนวโน้มลง",
    hoverToSeePrice: "เลื่อนเมาส์เพื่อดูราคา",
    assetsInPortfolio: "สินทรัพย์ในพอร์ต",
    fromStart: "จากจุดเริ่มต้น",
    approx: "≈",
    allocation: "สัดส่วน",
    executed: "ดำเนินการแล้ว",

    // Widget Dashboard
    editDashboard: "แก้ไขแดชบอร์ด",
    doneDashboard: "เสร็จสิ้น",
    addWidget: "เพิ่ม Widget",
    removeWidget: "ลบ",
    widgetWatchlist: "รายการจับตา",
    widgetMonthlySummary: "สรุปรายเดือน",
    widgetAllocationPie: "สัดส่วนสินทรัพย์",
    widgetDailyJournal: "บันทึกการเทรด",
    widgetEquityCurve: "กราฟมูลค่าพอร์ต",
    widgetBucketOverview: "กระเป๋าเงิน",
    widgetPLCalendar: "ปฏิทินกำไร/ขาดทุน",
    widgetTopMovers: "สินทรัพย์เคลื่อนไหวมาก",
    widgetLibrary: "คลัง Widget",
    dragToReorder: "ลากเพื่อจัดเรียง",
    resetLayout: "รีเซ็ตเลย์เอาต์",

    // Enhanced P/L
    totalInvested: "ลงทุนรวม",
    unrealizedPL: "กำไร/ขาดทุนที่ยังไม่รับรู้",
    realizedPL: "กำไร/ขาดทุนที่รับรู้แล้ว",
    realized: "ที่รับรู้แล้ว",
    dividends: "เงินปันผล",
    sourceBucket: "กระเป๋าต้นทาง",
    selectSourceBucket: "เลือกกระเป๋าต้นทาง",
    noBucketSelected: "ไม่เลือก (บันทึกเอง)",
    bucketBalance: "คงเหลือ",
    deductedFromBucket: "หักจากกระเป๋าแล้ว",
    portfolioValue: "มูลค่าพอร์ต",
    costBasis: "ต้นทุนรวม",

    // Import & Filter
    importExisting: "นำเข้าจากที่อื่น",
    importExistingDesc: "ไม่หักจากกระเป๋าเงิน",
    newPurchase: "ซื้อใหม่",
    newPurchaseDesc: "หักจากกระเป๋าที่เลือก",
    filterAll: "ทั้งหมด",
    filterByCategory: "ตามประเภท",
    filterByType: "ตามชนิด",
    stockType: "หุ้น",
    cryptoType: "คริปโต",
    thaiStockType: "หุ้นไทย",
    favorites: "รายการโปรด",
    importCsvPortfolio: "นำเข้า CSV",
    exportCsvPortfolio: "ส่งออก CSV",
    csvImportedAssets: "นำเข้าสินทรัพย์จาก CSV แล้ว!",
    csvExportSuccess: "ส่งออกพอร์ตแล้ว!",
    csvImportInstructions: "รูปแบบ CSV: symbol, shares, avgCost (1 สินทรัพย์ต่อบรรทัด)",

    // Calendar Tags
    dayTrade: "เทรดรายวัน",
    swingTrade: "สวิงเทรด",
    longTerm: "ลงทุนระยะยาว",
    dividendIncome: "เงินปันผล",
    cryptoTrade: "คริปโต",
    forexTrade: "ฟอเร็กซ์",
    allTags: "ทุกประเภท",
    equityCurve: "กราฟมูลค่าพอร์ต",
    cumulativePL: "กำไร/ขาดทุนสะสม",
    noDataYet: "ยังไม่มีข้อมูล",
    portfolioGrowth: "การเติบโตของพอร์ต",
    progress: "ความคืบหน้า",
    performance: "ผลงาน",
    winRate: "อัตราการชนะ",
    wins: "ชนะ",
    losses: "แพ้",
    avgWin: "ชนะเฉลี่ย",
    avgLoss: "แพ้เฉลี่ย",

    // Ledger Page
    ledger: "สมุดบัญชี",
    ledgerSubtitle: "บันทึกรายรับ-รายจ่ายประจำวัน",
    ledgerThisMonthIn: "รับเดือนนี้",
    ledgerThisMonthOut: "จ่ายเดือนนี้",
    ledgerNet: "สุทธิ",
    addIncome: "+ รายรับ",
    addExpense: "+ รายจ่าย",
    addIncomeTitle: "เพิ่มรายรับ",
    addExpenseTitle: "เพิ่มรายจ่าย",
    ledgerDescription: "รายละเอียด (ไม่บังคับ)",
    ledgerDescPlaceholderIncome: "เช่น เงินเดือนประจำเดือน, รับงานโปรเจกต์...",
    ledgerDescPlaceholderExpense: "เช่น ข้าวกลางวันกับเพื่อน, แกร็บไปทำงาน...",
    ledgerCategoryHint: "หมวดหมู่ — เลือกหรือพิมพ์เอง",
    ledgerCustomCategory: "+ กำหนดเอง",
    ledgerAddCategory: "เพิ่ม",
    ledgerTypeCategory: "พิมพ์ชื่อหมวดหมู่...",
    ledgerDepositTo: "ฝากเข้า",
    ledgerDeductFrom: "หักจาก",
    ledgerAutoSplit: "แบ่งอัตโนมัติ",
    ledgerSaveIncome: "บันทึกรายรับ",
    ledgerSaveExpense: "บันทึกรายจ่าย",
    ledgerSearchPlaceholder: "ค้นหารายการ...",
    ledgerFilterAll: "ทั้งหมด",
    ledgerFilterIn: "รับ",
    ledgerFilterOut: "จ่าย",
    ledgerNoRecords: "ยังไม่มีรายการ",
    ledgerNoRecordsHint: "กด + รายรับ หรือ + รายจ่าย ด้านบนเพื่อเริ่มต้น",
    ledgerDeleteTitle: "ลบรายการ",
    ledgerDeleteMessage: "คุณแน่ใจหรือไม่ที่จะลบรายการนี้?",
    ledgerNewNet: "สุทธิใหม่:",
    ledgerToday: "วันนี้",
    ledgerYesterday: "เมื่อวาน",
    // preset categories
    freelance: "งานฟรีแลนซ์",
    dividend: "เงินปันผล",
    gift: "ของขวัญ",
    rental: "ค่าเช่า",
    shopping: "ช้อปปิ้ง",
    health: "สุขภาพ",
    education: "การศึกษา",
    coffee: "กาแฟ",
    travel: "ท่องเที่ยว",
    last7Days: "7 วันล่าสุด",
    last30Days: "30 วันล่าสุด",
    thisMonth: "เดือนนี้",
    lastMonth: "เดือนที่แล้ว",
    custom: "กำหนดเอง",
    from: "จาก",
  },
};

const defaultExchangeRates: Record<Currency, number> = {
  USD: 1,
  THB: Number.NaN,
  JPY: 158.0,
  EUR: 0.89,
};

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  const [currency, setCurrency] = useState<Currency>("USD");

  const [darkMode, setDarkModeState] = useState(true);

  const fx = useFxRate();
  const exchangeRates = React.useMemo(() => ({ ...defaultExchangeRates, THB: fx.rate ? Number(fx.rate) : Number.NaN }), [fx.rate]);
  const isExchangeRateCustom = fx.mode === 'manual';

  const setExchangeRate = useCallback((cur: Currency, rate: number) => {
    if (cur === 'THB' && Number.isFinite(rate) && rate > 0) fx.setManual(String(rate));
  }, [fx.setManual]);

  const resetExchangeRateToAuto = fx.resetAuto;

  const [netWorthSettings, setNetWorthSettings] = useState<NetWorthSettings>({
    includeAssets: true,
    includeBuckets: true,
    includeCash: true,
    cashflowIncludeCash: true,
    cashflowIncludeBuckets: true,
    cashflowIncludeAssets: false,
  });

  // Initialize lang, theme and currency from localStorage safely on client side
  useEffect(() => {
    try {
      const storedLang = localStorage.getItem("preferred-lang") as Language;
      if (storedLang === "en" || storedLang === "th") {
        setLanguage(storedLang);
      }
      const storedCurrency = localStorage.getItem("preferred-currency") as Currency;
      if (storedCurrency === "USD" || storedCurrency === "THB") {
        setCurrency(storedCurrency);
      }
      const storedTheme = localStorage.getItem("theme");
      if (storedTheme === "light") {
        setDarkModeState(false);
      }
      const storedNWSettings = localStorage.getItem("fintrack-nw-settings");
      if (storedNWSettings) {
        const parsed = JSON.parse(storedNWSettings);
        setNetWorthSettings({
          includeAssets: parsed.includeAssets ?? true,
          includeBuckets: parsed.includeBuckets ?? true,
          includeCash: parsed.includeCash ?? true,
          cashflowIncludeCash: parsed.cashflowIncludeCash ?? true,
          cashflowIncludeBuckets: parsed.cashflowIncludeBuckets ?? true,
          cashflowIncludeAssets: parsed.cashflowIncludeAssets ?? false,
        });
      }
    } catch {}
  }, []);

  // Save netWorthSettings to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("fintrack-nw-settings", JSON.stringify(netWorthSettings));
    } catch {}
  }, [netWorthSettings]);

  const setDarkMode = (isDark: boolean) => {
    setDarkModeState(isDark);
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {}
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.remove('light-mode');
    } else {
      document.documentElement.classList.add('light-mode');
    }
  }, [darkMode]);

  // Sync HTML lang attribute and save to localStorage
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("preferred-lang", language);
    } catch {}
  }, [language]);

  // Save currency to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("preferred-currency", currency);
    } catch {}
  }, [currency]);

  const defaultTrades: Trade[] = [];
  const defaultAllocations: Allocation[] = [
    { label: "Equities", value: 60, color: "#ADC6FF" },
    { label: "Fixed Income", value: 25, color: "#E9C349" },
    { label: "Alternatives", value: 10, color: "#4EDEA3" },
    { label: "Cash", value: 5, color: "#6B7280" },
  ];
  const defaultAssets: Asset[] = [];
  const defaultMoneyBuckets: MoneyBucket[] = [];

  const [trades, setTrades] = useState<Trade[]>(defaultTrades);
  const [allocations, setAllocations] = useState<Allocation[]>(defaultAllocations);
  const [assets, setAssets] = useState<Asset[]>(defaultAssets);
  const [marketQuotes, setMarketQuotes] = useState<Record<string, { priceUSD: number; updatedAt: number }>>({});
  const assetsRef = React.useRef<Asset[]>(assets);
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);
  const [cashActivities, setCashActivities] = useState<CashActivity[]>([]);
  const [moneyBuckets, setMoneyBuckets] = useState<MoneyBucket[]>(defaultMoneyBuckets);
  const [allMoneyBuckets, setAllMoneyBuckets] = useState<MoneyBucket[]>([]);
  const [bucketActivities, setBucketActivities] = useState<BucketActivity[]>([]);
  const [userProfile, setUserProfile] = useState<{ email: string; avatarUrl: string; initials: string } | undefined>();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [financialRevision, setFinancialRevision] = useState(0);
  const [dcaPositions, setDcaPositions] = useState<DcaPosition[]>([]);
  const dcaAssetSaveTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const deletedAssetSymbols = React.useRef<Set<string>>(new Set());
  // Date.now() can repeat within the same millisecond when several async
  // actions fail together. Keep a local counter as a deterministic fallback
  // so React toast keys are always unique.
  const toastSequence = React.useRef(0);
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [brokerageAccounts, setBrokerageAccounts] = useState<BrokerageAccount[]>([]);
  const [allBrokerageAccounts, setAllBrokerageAccounts] = useState<BrokerageAccount[]>([]);
  const [brokerageCashBalances, setBrokerageCashBalances] = useState<BrokerageCashBalance[]>([]);
  const [brokerageCashEntries, setBrokerageCashEntries] = useState<BrokerageCashEntry[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [portfoliosReady, setPortfoliosReady] = useState(false);

  const selectPortfolio = React.useCallback((id: string | null) => {
    setActivePortfolioId(id);
    try { localStorage.setItem('fintrack-active-portfolio', id || ALL_PORTFOLIOS_ID); } catch {}
  }, []);

  const createPortfolio = React.useCallback(async (name: string, color?: string): Promise<Portfolio | null> => {
    const trimmedName = name.trim().slice(0, 80);
    if (!trimmedName) return null;
    const portfolioColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color! : '#ADC6FF';

    if (!user) {
      const portfolio: Portfolio = {
        id: `local-${Date.now()}`,
        name: trimmedName,
        color: portfolioColor,
        isDefault: portfolios.length === 0,
        kind: 'trading',
      };
      const defaultAccounts: BrokerageAccount[] = [
        {
          id: `local-brokerage-${Date.now()}-thb`,
          name: 'เงินสด THB',
          currency: 'THB',
          color: '#4EDEA3',
          portfolioId: portfolio.id,
          kind: 'cash',
        },
        {
          id: `local-brokerage-${Date.now() + 1}-usd`,
          name: 'เงินสด USD',
          currency: 'USD',
          color: '#8B6CFF',
          portfolioId: portfolio.id,
          kind: 'cash',
        },
      ];
      setPortfolios(prev => [...prev, portfolio]);
      setBrokerageAccounts(prev => [...prev, ...defaultAccounts]);
      setAllBrokerageAccounts(prev => [...prev, ...defaultAccounts]);
      selectPortfolio(portfolio.id);
      return portfolio;
    }

    const { data, error } = await db.portfolios.insert({
      user_id: user.id,
      name: trimmedName,
      color: portfolioColor,
      is_default: portfolios.length === 0,
      kind: 'trading',
    });
    if (error || !data) {
      console.error('Failed to create portfolio', error);
      return null;
    }
    const portfolio: Portfolio = {
      id: data.id,
      name: data.name,
      color: data.color,
      isDefault: data.is_default,
      kind: data.kind || 'trading',
    };
    setPortfolios(prev => [...prev, portfolio]);
    const defaultAccounts = [
      { name: 'เงินสด THB', currency: 'THB' as Currency, color: '#4EDEA3' },
      { name: 'เงินสด USD', currency: 'USD' as Currency, color: '#8B6CFF' },
    ];
    const accountResults = await Promise.all(defaultAccounts.map((account) => db.brokerageAccounts.insert({
      user_id: user.id,
      portfolio_id: portfolio.id,
      name: account.name,
      broker: null,
      currency: account.currency,
      color: account.color,
      kind: 'cash',
    })));
    const createdAccounts = accountResults.flatMap(({ data, error }) => {
      if (error) {
        console.error('Failed to create default brokerage account', error);
        return [];
      }
      return data ? [{
        id: data.id,
        name: data.name,
        broker: data.broker || undefined,
        currency: data.currency as Currency,
        color: data.color,
        portfolioId: data.portfolio_id,
        kind: data.kind || 'cash',
      }] : [];
    });
    if (createdAccounts.length) {
      setBrokerageAccounts(prev => [...prev, ...createdAccounts]);
      setAllBrokerageAccounts(prev => [...prev, ...createdAccounts]);
    }
    selectPortfolio(portfolio.id);
    return portfolio;
  }, [portfolios.length, selectPortfolio, user]);

  const addBrokerageAccount = React.useCallback(async (account: Omit<BrokerageAccount, 'id' | 'portfolioId'>): Promise<BrokerageAccount | null> => {
    const selectedPortfolio = portfolios.find(portfolio => portfolio.id === activePortfolioId);
    if (!activePortfolioId || selectedPortfolio?.kind !== 'trading') return null;
    // Trading portfolios deliberately have one standard cash wallet per
    // supported currency. Prevent a second THB/USD wallet from reintroducing
    // ambiguous balances and transfer destinations.
    if (account.kind === 'cash' && (account.currency === 'THB' || account.currency === 'USD')) {
      const existing = allBrokerageAccounts.find(item =>
        item.portfolioId === activePortfolioId && item.kind === 'cash' && item.currency === account.currency
      );
      if (existing) {
        console.warn(`Portfolio already has its standard ${account.currency} cash wallet`);
        return existing;
      }
    }
    const name = account.name.trim().slice(0, 80);
    if (!name) return null;
    if (!user) {
      const localAccount = { ...account, id: `local-brokerage-${Date.now()}`, name, portfolioId: activePortfolioId };
      setBrokerageAccounts(prev => [...prev, localAccount]);
      setAllBrokerageAccounts(prev => [...prev, localAccount]);
      return localAccount;
    }
    const { data, error } = await db.brokerageAccounts.insert({
      user_id: user.id, portfolio_id: activePortfolioId, name,
      broker: account.broker || null, currency: account.currency, color: account.color, kind: account.kind,
    });
    if (error || !data) { console.error('Failed to create brokerage account', error); return null; }
    const created = { id: data.id, name: data.name, broker: data.broker || undefined, currency: data.currency as Currency, color: data.color, portfolioId: data.portfolio_id, kind: data.kind || 'cash' as const };
    setBrokerageAccounts(prev => [...prev, created]);
    setAllBrokerageAccounts(prev => [...prev, created]);
    return created;
  }, [activePortfolioId, allBrokerageAccounts, portfolios, user]);

  const updateBrokerageAccount = React.useCallback(async (
    id: string,
    updates: Pick<BrokerageAccount, 'name' | 'broker' | 'currency' | 'kind'>,
  ): Promise<boolean> => {
    const name = updates.name.trim().slice(0, 80);
    if (!name || !brokerageAccounts.some(account => account.id === id)) return false;
    const current = allBrokerageAccounts.find(account => account.id === id)
      || brokerageAccounts.find(account => account.id === id);
    if (current?.kind === 'cash' && (current.currency === 'THB' || current.currency === 'USD')) {
      console.warn('Standard THB/USD cash wallets cannot be changed');
      return false;
    }
    if (!user) {
      setBrokerageAccounts(prev => prev.map(account => account.id === id ? { ...account, ...updates, name } : account));
      setAllBrokerageAccounts(prev => prev.map(account => account.id === id ? { ...account, ...updates, name } : account));
      return true;
    }
    const { data, error } = await db.brokerageAccounts.update(id, {
      name,
      broker: updates.broker || null,
      currency: updates.currency,
      kind: updates.kind,
    });
    if (error || !data) { console.error('Failed to update brokerage account', error); return false; }
    setBrokerageAccounts(prev => prev.map(account => account.id === id ? {
      ...account,
      name: data.name,
      broker: data.broker || undefined,
      currency: data.currency as Currency,
      kind: data.kind || 'cash',
    } : account));
    setAllBrokerageAccounts(prev => prev.map(account => account.id === id ? {
      ...account,
      name: data.name,
      broker: data.broker || undefined,
      currency: data.currency as Currency,
      kind: data.kind || 'cash',
    } : account));
    return true;
  }, [allBrokerageAccounts, brokerageAccounts, user]);

  const recordBrokerageCashMovement = React.useCallback(async (
    accountId: string,
    type: 'DEPOSIT' | 'WITHDRAW' | 'ADJUSTMENT',
    amount: number,
    note?: string,
  ): Promise<boolean> => {
    const account = allBrokerageAccounts.find(item => item.id === accountId)
      || brokerageAccounts.find(item => item.id === accountId);
    if (!account || amount <= 0) return false;
    if (!user) {
      const occurredAt = new Date().toISOString();
      setBrokerageCashBalances(prev => {
        const current = prev.find(item => item.accountId === accountId)?.balance || 0;
        const next = type === 'WITHDRAW' ? current - amount : current + amount;
        return [...prev.filter(item => item.accountId !== accountId), { accountId, balance: next }];
      });
      setBrokerageCashEntries(prev => [{
        id: `local-brokerage-entry-${Date.now()}`,
        accountId,
        portfolioId: account.portfolioId,
        type,
        amount,
        currency: account.currency,
        occurredAt,
        note,
      }, ...prev]);
      return true;
    }
    const { data, error } = await db.brokerageCashEntries.insert({
      user_id: user.id,
      portfolio_id: account.portfolioId,
      brokerage_account_id: accountId,
      type,
      amount,
      currency: account.currency,
      trade_id: null,
      occurred_at: new Date().toISOString(),
      note: note || null,
    });
    if (error) { console.error('Failed to record brokerage cash movement', error); return false; }
    setBrokerageCashBalances(prev => {
      const current = prev.find(item => item.accountId === accountId)?.balance || 0;
      const next = type === 'WITHDRAW' ? current - amount : current + amount;
      const rest = prev.filter(item => item.accountId !== accountId);
      return [...rest, { accountId, balance: next }];
    });
    if (data) {
      setBrokerageCashEntries(prev => [{
        id: data.id,
        accountId: data.brokerage_account_id,
        portfolioId: data.portfolio_id,
        type: data.type,
        amount: Number(data.amount || 0),
        currency: data.currency as Currency,
        tradeId: data.trade_id || undefined,
        occurredAt: data.occurred_at,
        note: data.note || undefined,
      }, ...prev]);
    }
    return true;
  }, [allBrokerageAccounts, brokerageAccounts, user]);

  const renamePortfolio = React.useCallback(async (id: string, name: string, color?: string): Promise<boolean> => {
    const trimmedName = name.trim().slice(0, 80);
    if (!trimmedName) return false;
    const portfolioColor = /^#[0-9a-f]{6}$/i.test(color || "") ? color : undefined;
    // Guard: Bucket (cash_management) portfolio must not be renamed
    const target = portfolios.find(p => p.id === id);
    if (target?.kind === 'cash_management') return false;
    if (!user) {
      setPortfolios(prev => prev.map(portfolio => portfolio.id === id ? { ...portfolio, name: trimmedName, ...(portfolioColor ? { color: portfolioColor } : {}) } : portfolio));
      return true;
    }
    const { data, error } = await db.portfolios.update(id, { name: trimmedName, ...(portfolioColor ? { color: portfolioColor } : {}) });
    if (error || !data) {
      console.error('Failed to rename portfolio', error);
      return false;
    }
    setPortfolios(prev => prev.map(portfolio => portfolio.id === id ? { ...portfolio, name: data.name, color: data.color } : portfolio));
    return true;
  }, [user, portfolios]);

  // Makes the Terminal and Portfolio agree immediately, then persists the
  // calculated holding so a refresh has the exact same source of truth.
  const syncDcaPosition = React.useCallback((symbol: string, entries: unknown) => {
    // No-op: Users explicitly requested that unexecuted DCA drafts should NOT
    // automatically mirror into the portfolio. They must be explicitly executed.
  }, []);

  const loadFromLocalStorage = React.useCallback(() => {
    let hasLocalData = false;
    const readArray = (key: string): any[] => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const storedAssets = readArray("fintrack-assets");
    const storedTrades = readArray("fintrack-trades");
    const storedAllocations = readArray("fintrack-allocations");
    const storedBuckets = readArray("fintrack-buckets");
    const storedBucketActivities = readArray("fintrack-bucket-activities");
    const storedCashActivities = readArray("fintrack-cash-activities");
    const storedCustomCategories = readArray("fintrack-custom-categories");

    if (storedAssets.length > 0) {
      const uniqueAssets = Array.from(
        new Map(storedAssets.map((item: Asset) => [item.symbol.toUpperCase(), item])).values()
      );
      setAssets(uniqueAssets as Asset[]);
      hasLocalData = true;
    }
    if (storedTrades.length > 0) {
      setTrades(storedTrades as Trade[]);
      hasLocalData = true;
    }
    if (storedAllocations.length > 0) {
      setAllocations(storedAllocations as Allocation[]);
      hasLocalData = true;
    }
    if (storedBuckets.length > 0) {
      setMoneyBuckets(storedBuckets as MoneyBucket[]);
      hasLocalData = true;
    }
    if (storedBucketActivities.length > 0) {
      setBucketActivities(storedBucketActivities as BucketActivity[]);
      hasLocalData = true;
    }
    if (storedCashActivities.length > 0) {
      setCashActivities(storedCashActivities as CashActivity[]);
      hasLocalData = true;
    }
    if (storedCustomCategories.length > 0) {
      setCustomCategories(storedCustomCategories as CustomCategory[]);
      hasLocalData = true;
    }

    return hasLocalData;
  }, []);

  // Auth & Data Loading
  useEffect(() => {
    // 1. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setUserProfile({
          email: session.user.email ?? "",
          initials: session.user.email?.substring(0, 2).toUpperCase() ?? "US",
          avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${session.user.email}&backgroundColor=1C1B1B`,
        });
      } else {
        setUserProfile(undefined);
      }
      if (_event !== "INITIAL_SESSION") {
        setAuthReady(true);
      }
    });

    // 2. Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        if (session) {
          setUser(session.user);
        } else {
          // Fallback: Check server cookies if client storage is empty
          try {
            const { getSessionTokensAction } = await import('@/src/app/actions');
            const tokens = await getSessionTokensAction();
            if (tokens?.access_token) {
              const { data } = await supabase.auth.setSession({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token
              });
              if (data.session) {
                setUser(data.session.user);
                return;
              }
            }
          } catch (e) {
            console.error("Failed to sync session from server", e);
          }
          setUser(null);
        }
      } finally {
        setAuthReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // All financial records are loaded for the selected portfolio.  Passing a
  // null selection is reserved for the explicit aggregate/read-only view.
  useEffect(() => {
    if (!authReady) return;
    setPortfoliosReady(false);

    if (!user) {
      const localPortfolio: Portfolio = { id: 'local-main', name: 'Main Portfolio', color: '#ADC6FF', isDefault: true, kind: 'trading' };
      setPortfolios([localPortfolio]);
      setActivePortfolioId(localPortfolio.id);
      setPortfoliosReady(true);
      return;
    }

    let cancelled = false;
    const loadPortfolios = async () => {
      const { data, error } = await db.portfolios.getAll(user.id);
      if (cancelled) return;
      if (error) {
        // Do not fall back to an unfiltered account query: that would expose
        // Main Portfolio data while the user thinks another portfolio is open.
        console.warn('Unable to load portfolios', error.message);
        setPortfolios([{ id: 'portfolio-migration-required', name: 'Portfolio setup required', color: '#FFB4AB', isDefault: true, kind: 'trading' }]);
        setActivePortfolioId('portfolio-migration-required');
        setPortfoliosReady(true);
        return;
      }

      let records = data || [];
      if (records.length === 0) {
        const created = await db.portfolios.insert({
          user_id: user.id,
          name: 'Main Portfolio',
          color: '#ADC6FF',
          is_default: true,
          kind: 'trading',
        });
        if (cancelled) return;
        records = created.data ? [created.data] : [];
        if (created.error) console.error('Unable to create default portfolio', created.error);
      }

      const nextPortfolios = records.map(record => ({
        id: record.id,
        name: record.name,
        color: record.color,
        isDefault: record.is_default,
        kind: record.kind || 'trading',
      }));

      nextPortfolios.sort((a, b) => {
        if (a.name.toLowerCase() === 'bucket' && b.name.toLowerCase() !== 'bucket') return -1;
        if (b.name.toLowerCase() === 'bucket' && a.name.toLowerCase() !== 'bucket') return 1;
        return 0;
      });

      setPortfolios(nextPortfolios);
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('fintrack-active-portfolio') : null;
      const nextActive = nextPortfolios.find(portfolio => portfolio.id === savedId)
        || nextPortfolios.find(portfolio => portfolio.isDefault)
        || nextPortfolios[0];
      setActivePortfolioId(savedId === ALL_PORTFOLIOS_ID ? null : (nextActive?.id || null));
      setPortfoliosReady(true);
    };

    void loadPortfolios();
    return () => { cancelled = true; };
  }, [authReady, user]);

  // Fetch data when user or selected portfolio changes
  useEffect(() => {
    if (!authReady || (user && !portfoliosReady)) return;
    let cancelled = false;

    setIsDataLoaded(false);

    if (!user) {
      // Load from localStorage for offline mode
      try {
        loadFromLocalStorage();
      } catch (err) {
        console.error("Failed to load from localStorage", err);
      }
      setIsDataLoaded(true);
      return;
    }

    const loadData = async () => {
      try {
        const cashManagementPortfolioId = portfolios.find(portfolio => portfolio.kind === 'cash_management')?.id || null;
        const selectedPortfolio = portfolios.find(portfolio => portfolio.id === activePortfolioId);
        const tradingPortfolioId = selectedPortfolio?.kind === 'trading' ? activePortfolioId : null;
        const [
          { data: assetsData, error: assetsError },
          { data: tradesData, error: tradesError },
          { data: allocationsData, error: allocationsError },
          { data: bucketsData, error: bucketsError },
          { data: bucketActivitiesData, error: bucketActivitiesError },
          { data: cashActivitiesData, error: cashActivitiesError },
          { data: userCategoriesData, error: userCategoriesError },
          { data: brokerageAccountsData, error: brokerageAccountsError },
          { data: allBrokerageAccountsData, error: allBrokerageAccountsError },
          { data: brokerageCashBalancesData, error: brokerageCashBalancesError },
          { data: brokerageCashEntriesData, error: brokerageCashEntriesError },
        ] = await Promise.all([
          db.assets.getAll(user.id, tradingPortfolioId),
          db.trades.getAll(user.id, tradingPortfolioId),
          db.allocations.getAll(user.id, tradingPortfolioId),
          db.buckets.getAll(user.id, null),
          db.bucketActivities.getAll(user.id, cashManagementPortfolioId),
          db.cashActivities.getAll(user.id, cashManagementPortfolioId),
          db.userCategories.getAll(user.id, activePortfolioId),
          db.brokerageAccounts.getAll(user.id, tradingPortfolioId),
          db.brokerageAccounts.getAll(user.id, null),
          db.brokerageCashEntries.getBalances(user.id, null),
          db.brokerageCashEntries.getAll(user.id, tradingPortfolioId),
        ]);
        if (cancelled) return;

        const loadErrors = [
          ["assets", assetsError],
          ["trades", tradesError],
          ["allocations", allocationsError],
          ["money_buckets", bucketsError],
          ["bucket_activities", bucketActivitiesError],
          ["cash_activities", cashActivitiesError],
          ["user_categories", userCategoriesError],
          ["brokerage_accounts", brokerageAccountsError],
          ["all_brokerage_accounts", allBrokerageAccountsError],
          ["brokerage_account_balances", brokerageCashBalancesError],
          ["brokerage_cash_entries", brokerageCashEntriesError],
        ].filter(([, error]) => Boolean(error));

        if (loadErrors.length > 0) {
          console.error("Supabase data load errors:", loadErrors);
        }

        // Signed-in data never falls back to the browser cache.  A cache may
        // belong to a different selected portfolio and was the source of
        // records from Main appearing in a newly-created portfolio.

        if (assetsData) {
          // Populate deleted symbols so trades don't recreate them
          assetsData.filter(a => a.is_active === false).forEach(a => {
            deletedAssetSymbols.current.add(a.symbol.toUpperCase());
          });

          // Filter out soft-deleted assets (is_active: false)
          const activeAssets = assetsData.filter(a => a.is_active !== false);
          const uniqueAssetsMap = new Map();
          activeAssets.forEach(a => {
            const symbolKey = a.symbol.toUpperCase();
            const quantity = a.quantity || 0;
            const currentPrice = a.current_price || a.avg_purchase_price || (quantity > 0 ? (a.value_usd || 0) / quantity : 0);
            const nextAsset = {
                id: a.id,
                name: a.name,
                symbol: a.symbol,
                valueUSD: (() => {
                  if (a.current_price && quantity) return a.current_price * quantity;
                  if (a.avg_purchase_price && quantity) return a.avg_purchase_price * quantity;
                  return a.value_usd || 0;
                })(),
                change: a.change_percentage || 0,
                allocation: a.asset_type || 'Equities',
                shares: quantity,
                avgCost: a.avg_purchase_price || 0,
                currentPrice,
                isFavorite: a.is_favorite,
                sortOrder: a.sort_order,
                is_active: a.is_active,
                portfolioId: a.portfolio_id || undefined,
                brokerageAccountId: a.brokerage_account_id || undefined,
              };
            const existing = uniqueAssetsMap.get(symbolKey);
            // The all-portfolios view is an aggregate. Keep one row per symbol
            // and combine its quantity/cost/value instead of silently keeping
            // the first portfolio's copy.
            if (existing && !tradingPortfolioId) {
              const combinedShares = (existing.shares || 0) + quantity;
              const existingCost = (existing.avgCost || 0) * (existing.shares || 0);
              const nextCost = (a.avg_purchase_price || 0) * quantity;
              uniqueAssetsMap.set(symbolKey, {
                ...existing,
                shares: combinedShares,
                avgCost: combinedShares > 0 ? (existingCost + nextCost) / combinedShares : 0,
                valueUSD: (existing.valueUSD || 0) + nextAsset.valueUSD,
                currentPrice: combinedShares > 0 ? ((existing.valueUSD || 0) + nextAsset.valueUSD) / combinedShares : existing.currentPrice,
                portfolioId: undefined,
              });
            } else if (!existing) {
              uniqueAssetsMap.set(symbolKey, nextAsset);
            }
          });
          const newAssetsArray = Array.from(uniqueAssetsMap.values());
          setAssets(newAssetsArray);
          // Sync to localStorage to prevent stale data flash on refresh
          localStorage.setItem("fintrack-assets", JSON.stringify(newAssetsArray));
        } else {
          setAssets([]);
        }

        if (brokerageAccountsData) {
          setBrokerageAccounts(brokerageAccountsData.map(account => ({
            id: account.id,
            name: account.name,
            broker: account.broker || undefined,
            currency: account.currency as Currency,
            color: account.color,
            portfolioId: account.portfolio_id,
            kind: account.kind || 'cash',
          })));
        } else {
          setBrokerageAccounts([]);
        }
        if (allBrokerageAccountsData) {
          setAllBrokerageAccounts(allBrokerageAccountsData.map(account => ({
            id: account.id,
            name: account.name,
            broker: account.broker || undefined,
            currency: account.currency as Currency,
            color: account.color,
            portfolioId: account.portfolio_id,
            kind: account.kind || 'cash',
          })));
        } else {
          setAllBrokerageAccounts([]);
        }
        if (brokerageCashBalancesData) {
          setBrokerageCashBalances(brokerageCashBalancesData.map(balance => ({
            accountId: balance.brokerage_account_id,
            balance: Number(balance.cash_balance || 0),
          })));
        } else {
          setBrokerageCashBalances([]);
        }
        if (brokerageCashEntriesData) {
          setBrokerageCashEntries(brokerageCashEntriesData.map(entry => ({
            id: entry.id,
            accountId: entry.brokerage_account_id,
            portfolioId: entry.portfolio_id,
            type: entry.type,
            amount: Number(entry.amount || 0),
            currency: entry.currency as Currency,
            tradeId: entry.trade_id || undefined,
            occurredAt: entry.occurred_at,
            note: entry.note || undefined,
          })));
        } else {
          setBrokerageCashEntries([]);
        }

        if (tradesData) {
          setTrades(tradesData.map(t => {
            // Extract source bucket ID from notes if present
            let sourceBucketId: string | undefined = undefined;
            if (t.notes && t.notes.startsWith("Source Wallet ID: ")) {
              sourceBucketId = t.notes.replace("Source Wallet ID: ", "").trim();
            }

            return {
              id: parseInt(t.id.split('-')[0], 16) || Date.now(), // Fallback for old trade ID system if needed
              asset: t.symbol,
              type: t.type,
              amountUSD: t.amount_usd,
              date: t.execution_date,
              rateAtTime: t.exchange_rate_at_time || 1,
              fees: Number(t.fees || 0),
              costMethod: t.cost_basis_sales?.method,
              closeMode: t.cost_basis_sales?.request?.closeMode,
              lotSelections: t.cost_basis_sales?.selections,
              fxRateTHB: Number(t.tags?.find((tag: string) => tag.startsWith('FX USD/THB '))?.slice(11)) || undefined,
              currency: t.currency || 'USD',
              originalAmount: t.original_amount || undefined,
              shares: t.quantity || 0,
              pricePerUnit: t.price_at_execution || 0,
              sourceBucketId: sourceBucketId,
              brokerageAccountId: t.brokerage_account_id || undefined,
              tag: (t.tags && t.tags.length > 0) ? t.tags[0] : undefined,
              dbId: t.id,
              portfolioId: t.portfolio_id || undefined,
            };
          }));
        } else {
          setTrades([]);
        }

        if (allocationsData && allocationsData.length > 0) {
          setAllocations(allocationsData.map(a => ({
            label: a.label,
            value: a.value,
            color: a.color
          })));
        } else {
          setAllocations([]);
        }

        if (bucketsData && bucketsData.length > 0) {
          const parsedBuckets = bucketsData.map(b => ({
            id: b.id,
            name: b.name,
            targetPercent: b.target_percent,
            targetAmount: b.target_amount,
            currentAmount: b.current_amount,
            currency: b.currency as Currency | undefined,
            color: b.color,
            icon: b.icon,
            linkedToExpenses: b.linked_to_expenses,
            portfolioId: b.portfolio_id || undefined
          }));
          setAllMoneyBuckets(parsedBuckets);
          setMoneyBuckets(parsedBuckets);
        } else {
          setAllMoneyBuckets([]);
          setMoneyBuckets([]);
        }

        if (bucketActivitiesData) {
          setBucketActivities(bucketActivitiesData.map(ba => ({
            id: ba.id,
            bucketId: ba.bucket_id,
            bucketName: bucketsData?.find(b => b.id === ba.bucket_id)?.name || "",
            type: ba.type,
            amount: ba.amount,
            date: ba.date,
            note: ba.note || undefined,
            currency: ba.currency || undefined,
            rateAtTime: ba.rate_at_time || undefined,
            originalAmount: ba.original_amount || undefined
          })));
        } else {
          setBucketActivities([]);
        }

        if (cashActivitiesData) {
          setCashActivities(cashActivitiesData.map(ca => ({
            id: ca.id,
            type: ca.type,
            amountUSD: ca.amount,
            category: ca.category,
            date: ca.date,
            note: ca.note || undefined,
            currency: ca.currency || undefined,
            rateAtTime: ca.rate_at_time || undefined,
            originalAmount: ca.original_amount ?? undefined,
            bucketId: ca.bucket_id || undefined,
            isTransfer: ca.is_transfer || false
          })));
        } else {
          setCashActivities([]);
        }

        if (userCategoriesData) {
          setCustomCategories(userCategoriesData.map((c: any) => ({
            id: c.id,
            type: c.type,
            label: c.label,
            icon: c.icon,
          })));
        } else {
          setCustomCategories([]);
        }

      } catch (err) {
        console.error("Failed to load data from Supabase", err);
      } finally {
        if (!cancelled) setIsDataLoaded(true);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [user, authReady, activePortfolioId, portfolios, portfoliosReady, loadFromLocalStorage, financialRevision]);

  // Reconcile all financial views together after returning from another tab.
  // A shared reload prevents an old cash balance being mixed with newer lots.
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      timer = setTimeout(() => setFinancialRevision(value => value + 1), 250);
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('fintrack:financial-change', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('fintrack:financial-change', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user]);

  // Never let a previous portfolio's virtual DCA lots appear while the next
  // selected portfolio is still loading its own draft.
  useEffect(() => {
    deletedAssetSymbols.current.clear();
    setDcaPositions([]);
  }, [activePortfolioId]);

  // Refresh open DCA lots on startup and whenever the Terminal saves a draft.
  // The assistant publishes this browser event after its debounced persistence.
  useEffect(() => {
    if (!authReady || (user && !portfoliosReady)) return;
    let cancelled = false;

    const getLocalDcaDrafts = (): Array<{ symbol: string; entries: unknown }> => {
      const localDrafts: Array<{ symbol: string; entries: unknown }> = [];
      // Portfolio-specific browser drafts cannot be safely reconstructed from
      // their key in the aggregate view. Supabase supplies the combined view.
      if (!activePortfolioId) return localDrafts;
      const prefix = activePortfolioId ? `dca_draft_${activePortfolioId}_` : 'dca_draft_';
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        try {
          localDrafts.push({ symbol: key.slice(prefix.length), entries: JSON.parse(localStorage.getItem(key) || '[]') });
        } catch {
          // Ignore malformed offline drafts and continue loading the rest.
        }
      }
      return localDrafts;
    };

    const loadDcaPositions = async () => {
      const localPositions = getDcaPositions(getLocalDcaDrafts());
      if (user) {
        let query = supabase
          .from('dca_drafts')
          .select('symbol, entries')
          .eq('user_id', user.id);
        const selectedPortfolio = portfolios.find(p => p.id === activePortfolioId);
        const tradingPortfolioId = selectedPortfolio?.kind === 'trading' ? activePortfolioId : null;
        if (tradingPortfolioId) query = query.eq('portfolio_id', tradingPortfolioId);
        const { data, error } = await query;

        if (cancelled) return;
        if (error) {
          // The table is created by migration 007.  Keep the portfolio usable
          // for deployments where that migration has not been run yet.
          console.warn('Unable to load open DCA positions', error.message);
          setDcaPositions(localPositions);
          return;
        }
        const remotePositions = getDcaPositions(data || []);
        // A local snapshot is written with the same edit that starts the remote
        // upsert.  Prefer it for a symbol so a page refresh never flashes an
        // older server response while that write is propagating.
        const merged = new Map(remotePositions.map(position => [position.symbol.toUpperCase(), position]));
        localPositions.forEach(position => merged.set(position.symbol.toUpperCase(), position));
        setDcaPositions(Array.from(merged.values()));
        return;
      }

      if (!cancelled) setDcaPositions(localPositions);
    };

    const handleDcaDraftChange = (event: Event) => {
      const detail = (event as CustomEvent<{ symbol?: string; entries?: unknown; portfolioId?: string | null }>).detail;
      if (detail?.portfolioId && detail.portfolioId !== activePortfolioId) return;
      if (detail?.symbol && detail.entries !== undefined) {
        syncDcaPosition(detail.symbol, detail.entries);
        return;
      }
      void loadDcaPositions();
    };
    void loadDcaPositions();
    window.addEventListener('dca-drafts-changed', handleDcaDraftChange);
    return () => {
      cancelled = true;
      window.removeEventListener('dca-drafts-changed', handleDcaDraftChange);
    };
  }, [activePortfolioId, authReady, portfoliosReady, user, syncDcaPosition]);

  // Sync state to local storage is no longer needed as primary source, 
  // but we can keep it as a backup for transient state if we want.
  // For now, let's focus on Supabase persistence in the action functions.


  const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidget[]>([
    { i: 'w1', type: 'equity_curve', x: 0, y: 0, w: 2, h: 2, minW: 1, minH: 2 },
    { i: 'w2', type: 'allocation_pie', x: 2, y: 0, w: 1, h: 2, minW: 1, minH: 2 },
    { i: 'w3', type: 'monthly_summary', x: 3, y: 0, w: 1, h: 2, minW: 1, minH: 2 },
    { i: 'w4', type: 'watchlist', x: 0, y: 2, w: 2, h: 2, minW: 1, minH: 2 },
    { i: 'w5', type: 'bucket_overview', x: 2, y: 2, w: 1, h: 2, minW: 1, minH: 2 },
    { i: 'w6', type: 'top_movers', x: 3, y: 2, w: 1, h: 2, minW: 1, minH: 2 },
  ]);
  const [notifPreferences, setNotifPreferences] = useState<NotifPreferences>({
    priceAlerts: true,
    rebalanceAlerts: true,
    tradeConfirmations: true,
    weeklyReport: false,
  });

  const addToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    const sequence = ++toastSequence.current;
    const id = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `toast-${Date.now()}-${sequence}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const addNotification = (title: string, message: string, type: AppNotification['type']) => {
    const id = Date.now().toString();
    setNotifications(prev => [{ id, title, message, type, time: new Date(), read: false }, ...prev]);
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  // Compute dynamic bucket balances directly from Ledger transactions (Single Source of Truth)
  const dynamicMoneyBuckets = React.useMemo(() => {
    return moneyBuckets.map(bucket => {
      try {
      if (!isFxCurrency(bucket.currency)) throw Error('unresolved');
      let currentAmount = decimal('0');
      
      const activities = cashActivities.filter(a => a.bucketId === bucket.id);
      activities.forEach(a => {
        const amountInBucketCur = bucketNativeAmount({ original_amount: a.originalAmount, currency: a.currency }, bucket.currency);

        if (a.type === "INCOME" || a.type === "DEPOSIT") {
          currentAmount = currentAmount.add(decimal(amountInBucketCur));
        } else if (a.type === "EXPENSE" || a.type === "WITHDRAW") {
          currentAmount = currentAmount.sub(decimal(amountInBucketCur));
        }
      });
      
      return { ...bucket, nativeStatus: 'resolved' as const, currentAmount: Number(currentAmount.toFixed(12)) };
      } catch {
        return { ...bucket, nativeStatus: 'unresolved' as const, currentAmount: Number.NaN };
      }
    });
  }, [moneyBuckets, cashActivities]);

  const transferBucketToBroker = async (transfer: InvestmentTransfer): Promise<boolean> => {
    // Existing 018 has a legacy FX fallback. Reject unresolved source records
    // before calling it; never let today's reference rate repair old legs.
    try {
      const bucket = moneyBuckets.find(b => b.id === transfer.bucketId);
      if (!bucket || !isFxCurrency(bucket.currency)) throw Error('unresolved: Bucket currency');
      cashActivities.filter(a => a.bucketId === bucket.id).forEach(a =>
        bucketNativeAmount({ original_amount: a.originalAmount, currency: a.currency }, bucket.currency));
    } catch (error) { addToast(String(error), 'error'); return false; }
    if (!user) {
      addToast('เข้าสู่ระบบเพื่อบันทึกการโอนเงินเข้าพอร์ต', 'warning');
      return false;
    }
    try {
      const { data, error } = await db.brokerageCashEntries.transferFromBucket({ ...transfer, legacyThbPerUsd: exchangeRates.THB });
      if (error || !data) {
        console.error('Failed to transfer Bucket funds', error);
        const message = error?.message || '';
        addToast(message.includes('Insufficient') ? 'เงินใน Bucket ไม่เพียงพอ กรุณาตรวจสอบยอดอีกครั้ง'
          : error?.code === 'PGRST202' ? 'ระบบโอนเงินยังไม่พร้อม กรุณาอัปเดตฐานข้อมูลก่อน'
          : 'บันทึกการโอนไม่สำเร็จ กรุณาลองใหม่ด้วยยอดเดิม', 'error');
        return false;
      }
      const cash = data.cash_activity;
      const activity = data.bucket_activity;
      const entry = data.brokerage_entry;
      const bucket = moneyBuckets.find(item => item.id === transfer.bucketId);
      const savedCash: CashActivity = {
        id: cash.id, type: cash.type, amountUSD: Number(cash.amount),
        category: cash.category, date: cash.date, note: cash.note,
        bucketId: cash.bucket_id, currency: cash.currency,
        rateAtTime: Number(cash.rate_at_time), originalAmount: Number(cash.original_amount), isTransfer: true,
      };
      setCashActivities(prev => [...prev.filter(item => item.id !== cash.id), savedCash]);
      setBucketActivities(prev => [{
        id: activity.id, bucketId: activity.bucket_id, bucketName: bucket?.name || '',
        type: activity.type, amount: Number(activity.amount), date: activity.date,
        note: activity.note, currency: activity.currency,
        rateAtTime: Number(activity.rate_at_time), originalAmount: Number(activity.original_amount),
      }, ...prev.filter(item => item.id !== activity.id)]);
      setBrokerageCashEntries(prev => [{
        id: entry.id, accountId: entry.brokerage_account_id, portfolioId: entry.portfolio_id,
        type: entry.type, amount: Number(entry.amount), currency: entry.currency,
        occurredAt: entry.occurred_at, note: entry.note,
      }, ...prev.filter(item => item.id !== entry.id)]);
      setBrokerageCashBalances(prev => [...prev.filter(item => item.accountId !== entry.brokerage_account_id), {
        accountId: entry.brokerage_account_id, balance: Number(data.brokerage_balance),
      }]);
      addToast(`โอนเข้าพอร์ตสำเร็จ ${Number(entry.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${entry.currency}`, 'success');
      return true;
    } catch (error) {
      console.error('Failed to transfer Bucket funds', error);
      addToast('ยังยืนยันผลการโอนไม่ได้ กรุณาลองใหม่ด้วยยอดเดิม', 'error');
      return false;
    }
  };

  // Compute net worth history from actual trade data + current portfolio value
  const netWorthHistory = React.useMemo(() => {
    const toUSD = (amount: number, fromCurrency: Currency = "USD") => {
      return amount / (exchangeRates[fromCurrency] || 1);
    };
    const selectedPortfolioKind = portfolios.find(portfolio => portfolio.id === activePortfolioId)?.kind;
    const currentCashUSD = (() => {
      if (!activePortfolioId) {
        const bucketsTotal = netWorthSettings.includeBuckets !== false
          ? dynamicMoneyBuckets.reduce((acc, curr) => acc + toUSD(curr.currentAmount, curr.currency || "USD"), 0)
          : 0;
        const brokerageTotal = netWorthSettings.includeCash !== false
          ? brokerageAccounts.reduce((acc, account) => {
              const balance = brokerageCashBalances.find(item => item.accountId === account.id)?.balance || 0;
              return acc + toUSD(balance, account.currency);
            }, 0)
          : 0;
        return bucketsTotal + brokerageTotal;
      }
      if (selectedPortfolioKind === "cash_management") {
        return netWorthSettings.includeBuckets !== false
          ? dynamicMoneyBuckets.reduce((acc, curr) => acc + toUSD(curr.currentAmount, curr.currency || "USD"), 0)
          : 0;
      }
      if (selectedPortfolioKind === "trading") {
        return netWorthSettings.includeCash !== false
          ? brokerageAccounts.reduce((acc, account) => {
              const balance = brokerageCashBalances.find(item => item.accountId === account.id)?.balance || 0;
              return acc + toUSD(balance, account.currency);
            }, 0)
          : 0;
      }
      return 0;
    })();
    const currentTotalUSD = (selectedPortfolioKind === "cash_management" ? 0 : (netWorthSettings.includeAssets !== false ? assets.reduce((acc, curr) => acc + curr.valueUSD, 0) : 0)) + currentCashUSD;
    const now = new Date();
    const currentDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Group trades by month to build historical net worth timeline
    const monthlyInvested: Record<string, number> = {};
    trades.forEach(trade => {
      const month = trade.date.substring(0, 7); // "2024-01"
      if (!monthlyInvested[month]) monthlyInvested[month] = 0;
      if (trade.type === "BUY" || trade.type === "COVER" || trade.type === "IMPORT") {
        monthlyInvested[month] += trade.amountUSD + (trade.fees || 0);
      } else if (trade.type === "SELL" || trade.type === "SHORT") {
        monthlyInvested[month] -= Math.max(0, trade.amountUSD - (trade.fees || 0));
      }
    });

    // Build cumulative timeline
    const months = Object.keys(monthlyInvested).sort();
    let cumulative = 0;
    const history = months.map(m => {
      cumulative += monthlyInvested[m];
      return { date: m, value: cumulative + currentCashUSD };
    });

    // Always add current real portfolio value as the latest point
    if (history.length === 0 || history[history.length - 1].date !== currentDateStr) {
      history.push({ date: currentDateStr, value: currentTotalUSD > 0 ? currentTotalUSD : cumulative });
    } else {
      history[history.length - 1].value = currentTotalUSD > 0 ? currentTotalUSD : history[history.length - 1].value;
    }

    // Need at least 2 points for the chart
    if (history.length < 2) {
      history.unshift({ date: "Start", value: 0 });
    }

    return history;
  }, [activePortfolioId, assets, brokerageAccounts, brokerageCashBalances, dynamicMoneyBuckets, portfolios, trades]);


  // Update userProfile when Supabase user session changes
  useEffect(() => {
    if (user && user.email) {
      const email = user.email;
      const initials = email.substring(0, 2).toUpperCase();
      const avatarUrl = user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${email}&backgroundColor=1C1B1B`;
      
      setUserProfile({
        email: email,
        initials,
        avatarUrl,
      });
    } else {
      setUserProfile({
        email: "User",
        initials: "US",
        avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=fintrack&backgroundColor=1C1B1B`,
      });
    }
  }, [user]);

  // Sync asset holdings from trades (Moving Average method)
  useEffect(() => {
    if (!isDataLoaded) return;

    type PositionStats = {
      portfolioId?: string;
      symbol: string;
      shares: number;
      totalCost: number;
      realizedPL: number;
      dividendTotal: number;
    };
    const stats: Record<string, PositionStats> = {};
    // The same ticker can legitimately be held in more than one broker.
    // Never combine those positions merely because their symbols match.
    const positionKey = (portfolioId: string | undefined, symbol: string) => `${portfolioId || 'local-main'}::${symbol.toUpperCase()}`;
    const sortedTrades = [...trades].sort((a, b) => a.date.localeCompare(b.date));

    sortedTrades.forEach(trade => {
      const sym = trade.asset.toUpperCase();
      // Skip trades for assets that were manually deleted
      if (deletedAssetSymbols.current.has(sym)) return;
      // Legacy local trades were saved before portfolioId existed.  Attach
      // those rows to the currently selected portfolio once so they remain
      // visible instead of silently disappearing after this migration.
      const tradePortfolioId = trade.portfolioId || activePortfolioId || undefined;
      const key = positionKey(tradePortfolioId, sym);
      if (!stats[key]) stats[key] = {
        portfolioId: tradePortfolioId,
        symbol: sym,
        shares: 0,
        totalCost: 0,
        realizedPL: 0,
        dividendTotal: 0,
      };
      
      const s = stats[key];
      const tradeShares = trade.shares || (trade.pricePerUnit && trade.pricePerUnit > 0 ? trade.amountUSD / trade.pricePerUnit : 0);
      const fee = trade.fees || 0;

      if (trade.type === "BUY" || trade.type === "IMPORT") {
        s.shares += tradeShares;
        s.totalCost += trade.amountUSD + fee;
      } else if (trade.type === "SELL") {
        if (s.shares > 0) {
          const costOfSharesSold = (tradeShares / s.shares) * s.totalCost;
          s.realizedPL += (trade.amountUSD - fee - costOfSharesSold);
          s.shares -= tradeShares;
          s.totalCost -= costOfSharesSold;
        } else {
          // Selling without buy record
          s.realizedPL += trade.amountUSD - fee;
        }
      } else if (trade.type === "SHORT") {
        // Open short position
        s.shares -= tradeShares;
        s.totalCost += trade.amountUSD - fee;
      } else if (trade.type === "COVER") {
        // Close a short only when an open short lot exists. A malformed COVER
        // must not divide by zero and poison the whole portfolio with NaN.
        if (s.shares < 0) {
          const coveredShares = Math.min(tradeShares, Math.abs(s.shares));
          const costOfSharesCovered = (coveredShares / Math.abs(s.shares)) * s.totalCost;
          s.realizedPL += (costOfSharesCovered - (trade.pricePerUnit || 0) * coveredShares - fee);
          s.shares += coveredShares;
          s.totalCost -= costOfSharesCovered;
        }
      } else if (trade.type === "DIVIDEND") {
        s.dividendTotal += trade.amountUSD;
      }
    });

    // Long holdings share the same lot projection as Portfolio and Trade.
    Object.values(stats).forEach(position => {
      if (!position.portfolioId) return;
      const projected = projectLotPosition(trades, position.portfolioId, position.symbol);
      if (projected) {
        position.shares = projected.shares;
        position.totalCost = projected.cost;
        position.realizedPL = projected.realized;
      }
    });

    // Removed virtual holding merge for open DCA lots. Users explicitly requested
    // that unexecuted DCA entries should not affect the actual portfolio quantities.
    // Executed entries are saved as actual trades and processed above.

    setAssets(prev => {
      // Build a set of symbols that exist in Supabase with is_active: false
      const softDeletedSymbols = new Set(
        prev.filter(a => a.is_active === false).map(a => a.symbol.toUpperCase())
      );

      // Filter out deleted symbols (both soft-deleted and manually removed)
      const filtered = prev.filter(a => {
        const sym = a.symbol.toUpperCase();
        return !deletedAssetSymbols.current.has(sym) && !softDeletedSymbols.has(sym);
      });
      const newAssets = [...filtered];
      // Update existing
      newAssets.forEach((asset, idx) => {
        const s = stats[positionKey(asset.portfolioId, asset.symbol)];
        if (s) {
          newAssets[idx] = {
            ...asset,
            shares: s.shares,
            avgCost: s.shares > 0 ? s.totalCost / s.shares : 0,
            realizedPL: s.realizedPL,
            dividendTotal: s.dividendTotal,
            valueUSD: asset.currentPrice ? (asset.currentPrice * s.shares) : s.totalCost,
            currentPrice: asset.currentPrice || (s.shares > 0 ? s.totalCost / s.shares : 0)
          };
          delete stats[positionKey(asset.portfolioId, asset.symbol)];
        }
      });
      // Add new ones that aren't in the deleted set and have positive shares
      Object.values(stats).forEach((s) => {
        const symbol = s.symbol;
        if (deletedAssetSymbols.current.has(symbol) ) return;
        // Don't recreate assets with 0 shares (fully sold)
        if (s.shares <= 0) return;
        // Don't recreate soft-deleted assets
        if (softDeletedSymbols.has(symbol) ) return;
        const CRYPTO_SYM = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'];
        const autoAlloc = CRYPTO_SYM.includes(symbol) ? 'Alternatives'
          : (symbol.endsWith('.BK') || symbol.endsWith('.TH')) ? 'Equities'
          : 'Equities';
        newAssets.push({
          name: symbol,
          symbol: symbol,
          portfolioId: s.portfolioId,
          valueUSD: s.totalCost,
          currentPrice: s.shares > 0 ? s.totalCost / s.shares : 0,
          change: 0,
          allocation: autoAlloc,
          shares: s.shares,
          avgCost: s.shares > 0 ? s.totalCost / s.shares : 0,
          realizedPL: s.realizedPL,
          dividendTotal: s.dividendTotal
        });
      });
      // Deduplicate to avoid React key collisions
      const deduplicatedAssets = Array.from(new Map(newAssets.map(item => [positionKey(item.portfolioId, item.symbol), item])).values());
      localStorage.setItem("fintrack-assets", JSON.stringify(deduplicatedAssets));
      return deduplicatedAssets;
    });
  }, [activePortfolioId, trades, dcaPositions, isDataLoaded]);

  // Fetch Live Market Data and persist prices to Supabase.  Depend on the
  // symbol list, not the asset objects themselves, so a newly executed trade
  // receives a quote immediately without creating a price-update loop.
  const marketSymbolKey = React.useMemo(
    () => [...new Set([...assets.map(asset => asset.symbol), ...trades.map(trade => trade.asset)])].map(symbol => symbol.toUpperCase()).sort().join('|'),
    [assets, trades]
  );
  useEffect(() => {
    if (!isDataLoaded) return;

    let mounted = true;
    let inFlight = false;
    const controller = new AbortController();

    const mapToMarketSymbol = (sym: string) => {
      const upper = sym.toUpperCase();
      // Handle crypto pairs like BTCUSD, ETHUSD → BTC-USD, ETH-USD
      const CRYPTO_BASES = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'USDT', 'BNB', 'ADA', 'AVAX', 'LINK'];
      for (const base of CRYPTO_BASES) {
        if (upper === base) return `${base}-USD`;
        if (upper === `${base}USD`) return `${base}-USD`;
        if (upper === `${base}USDT`) return `${base}-USD`;
      }
      return upper;
    };

    const fetchMarketData = async () => {
      // Snapshot current assets using the ref to get the latest state immediately
      const snapshot = assetsRef.current;
      const symbolsQuery = marketSymbolKey.split('|').filter(Boolean).map(mapToMarketSymbol).join(',');
      if (!symbolsQuery || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;

      try {
        const res = await fetch(`/api/market?symbols=${encodeURIComponent(symbolsQuery)}`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!res.ok || !mounted) return;
        const data = await res.json();
        if (!data?.results || !Array.isArray(data.results) || !mounted) return;

        const validQuotes = data.results.filter((quote: any) => Number.isFinite(Number(quote.price)) && Number(quote.price) > 0);
        const usdPrice = (quote: any) => Number(quote.price) / (exchangeRates[quote.quoteCurrency as Currency] || 1);
        setMarketQuotes(previous => {
          const next = { ...previous };
          for (const symbol of marketSymbolKey.split('|')) {
            const quote = validQuotes.find((item: any) => item.symbol.toUpperCase() === mapToMarketSymbol(symbol));
            if (quote) next[symbol] = { priceUSD: usdPrice(quote), updatedAt: data.timestamp || Date.now() };
          }
          return next;
        });

        // 1. Update React state with live prices
        setAssets(prev => prev.map(asset => {
          const marketSym = mapToMarketSymbol(asset.symbol);
          const liveData = validQuotes.find((r: any) => r.symbol.toUpperCase() === marketSym);
          if (!liveData) return asset;
          return {
            ...asset,
            change: Number(liveData.changePercent.toFixed(2)),
            valueUSD: asset.shares ? asset.shares * usdPrice(liveData) : asset.valueUSD,
            currentPrice: usdPrice(liveData),
            name: liveData.name || asset.name,
            chartData: liveData.chartData || asset.chartData,
            intradayData: liveData.intradayData || asset.intradayData,
          };
        }));

        // 2. Write live prices back to Supabase so next refresh is instant
        // Aggregate rows are a display-only synthesis and their `id` belongs
        // to just one source portfolio, so never write live quotes from All.
        if (user && activePortfolioId && mounted) {
          const writes = snapshot
            .filter(a => a.id)
            .map(a => {
              const marketSym = mapToMarketSymbol(a.symbol);
              const liveData = validQuotes.find((r: any) => r.symbol.toUpperCase() === marketSym);
              if (!liveData) return null;
              const newValueUSD = a.shares ? a.shares * usdPrice(liveData) : a.valueUSD;
              const updatePayload = {
                current_price: usdPrice(liveData),
                value_usd: newValueUSD,
                change_24h: Number((liveData.price - liveData.price / (1 + liveData.changePercent / 100)).toFixed(2)),
                change_percentage: liveData.changePercent,
                updated_at: new Date().toISOString(),
              };
              console.log("Updating Supabase for", a.symbol, updatePayload);
              return supabase
                .from('assets')
                .update(updatePayload)
                .eq('id', a.id)
                .eq('user_id', user.id)
                .select();
            })
            .filter(Boolean);

          try {
            await Promise.all(writes);
          } catch (e) {
            console.error('Price write-back failed:', e);
          }
        }
      } catch (err) {
        console.debug('Market fetch failed', err);
      } finally {
        inFlight = false;
      }
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 30000);
    window.addEventListener('focus', fetchMarketData);
    document.addEventListener('visibilitychange', fetchMarketData);

    return () => {
      mounted = false;
      controller.abort();
      clearInterval(interval);
      window.removeEventListener('focus', fetchMarketData);
      document.removeEventListener('visibilitychange', fetchMarketData);
    };
  }, [activePortfolioId, exchangeRates, isDataLoaded, marketSymbolKey, user]);


  const fetchAssetMarketData = async (symbol: string) => {
    try {
      const res = await fetch(`/api/market?symbols=${symbol}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.results && data.results.length > 0) {
          return data.results[0];
        }
      }
    } catch(e) {}
    return null;
  };

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  const formatMoney = (amountUSD: number, originalCurrency?: Currency, originalRate?: number, originalAmount?: number) => {
    const targetCurrency = originalCurrency || currency;
    const rate = originalRate || exchangeRates[targetCurrency];
    
    // If the requested target currency matches the original currency and we have the exact original amount,
    // use it directly to bypass floating-point math drift (e.g. 50.00 THB vs 50.01 THB).
    const isExactMatch = originalAmount !== undefined && originalCurrency === targetCurrency;
    const convertedAmount = isExactMatch ? originalAmount! : (amountUSD * rate);
    if (!Number.isFinite(convertedAmount)) return '—';

    // For THB: force en-US locale which reliably returns ฿ (U+0E3F).
    // th-TH locale may return "B" on some browsers/environments.
    if (targetCurrency === "THB") {
      const absFormatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "THB",
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(convertedAmount));
      // en-US + THB narrowSymbol always returns "฿X,XXX.XX"
      return (convertedAmount < 0 ? "-" : "") + absFormatted;
    }

    const formatter = new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
      style: "currency",
      currency: targetCurrency,
      minimumFractionDigits: 2,
      currencyDisplay: "narrowSymbol",
    });

    let formatted = formatter.format(convertedAmount);
    // Fix TH locale showing "US$" → "$"
    if (language === "th" && targetCurrency === "USD") {
      formatted = formatted.replace("US$", "$");
    }

    return formatted;
  };


  const addAsset = async (assetData: Asset) => {
    const targetPortfolioId = assetData.portfolioId ?? activePortfolioId;
    const selectedPortfolio = portfolios.find(portfolio => portfolio.id === targetPortfolioId);
    if (targetPortfolioId && selectedPortfolio?.kind !== 'trading') {
      addToast(language === 'th' ? 'Bucket ใช้สำหรับเงินสดและบัญชีธนาคาร ไม่สามารถเพิ่มสินทรัพย์ลงทุนได้' : 'Cash-management portfolios cannot contain investment assets.', 'warning');
      return;
    }
    const existingIdx = assets.findIndex(a => a.symbol.toUpperCase() === assetData.symbol.toUpperCase() && (a.portfolioId ?? activePortfolioId) === targetPortfolioId);
    if (!user) {
      const nextAsset = { ...assetData, portfolioId: targetPortfolioId || undefined };
      const newAssets = existingIdx === -1
        ? [nextAsset, ...assets]
        : assets.map((asset, index) => index === existingIdx ? { ...asset, ...nextAsset } : asset);
      setAssets(newAssets);
      localStorage.setItem("fintrack-assets", JSON.stringify(newAssets));
      return;
    }
    try {
      const { data, error } = await db.assets.upsert({
        user_id: user.id,
        portfolio_id: targetPortfolioId,
        brokerage_account_id: assetData.brokerageAccountId || null,
        name: assetData.name,
        symbol: assetData.symbol,
        asset_type: assetData.allocation,
        allocation: assetData.allocation,
        value_usd: assetData.valueUSD,
        quantity: assetData.shares || 0,
        avg_purchase_price: assetData.avgCost || 0,
        current_price: assetData.valueUSD / (assetData.shares || 1),
        is_active: true,
        is_favorite: assetData.isFavorite || false,
        sort_order: assetData.sortOrder || assets.length,
        notes: null,
        sector: null,
        country: null,
        allocation_target: 0,
        allocation_current: 0,
        change_24h: 0,
        change_percentage: assetData.change,
        exclude_from_total: assetData.excludeFromTotal || false
      });
      if (data) {
        const newAsset = {
          ...assetData,
          portfolioId: data.portfolio_id || targetPortfolioId || undefined,
          id: data.id,
          is_active: data.is_active,
          isFavorite: data.is_favorite,
          sortOrder: data.sort_order
        };
        setAssets(prev => {
          const idx = prev.findIndex(a => a.symbol.toUpperCase() === newAsset.symbol.toUpperCase() && (a.portfolioId ?? activePortfolioId) === targetPortfolioId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...newAsset };
            return next;
          }
          return [newAsset, ...prev];
        });
      }
    } catch (err) {
      console.error("Failed to add asset to Supabase", err);
    }
  };

  const addTrade = async (tradeData: Omit<Trade, "id">, metadata?: Pick<Asset, 'name' | 'allocation' | 'currentPrice' | 'currency' | 'excludeFromTotal' | 'chartData'>): Promise<boolean> => {
    if (tradeData.type === 'SELL') {
      addToast(language === 'th' ? 'บันทึกการขายผ่าน Live P&L ในหน้า Trade / Plan เพื่อตรวจสอบต้นทุนและไม้ก่อนยืนยัน' : 'Use Trade / Plan → Live P&L to preview allocations before selling.', 'warning');
      return false;
    }
    const targetPortfolioId = tradeData.portfolioId ?? activePortfolioId;
    if (!targetPortfolioId) {
      addToast(language === 'th' ? 'เลือกโบรกเกอร์ในฟอร์มก่อนบันทึก' : 'Select a broker before saving.', 'warning');
      return false;
    }
    const selectedPortfolio = portfolios.find(portfolio => portfolio.id === targetPortfolioId);
    if (targetPortfolioId && selectedPortfolio?.kind !== 'trading') {
      addToast(language === 'th' ? 'Bucket ใช้สำหรับเงินสดและบัญชีธนาคาร ไม่สามารถบันทึกการเทรดได้' : 'Trades can only be recorded in a trading portfolio.', 'warning');
      return false;
    }

    // A BUY settled from a brokerage cash account must be affordable before
    // we add any client-side state.  The database trigger repeats this check
    // under a transaction lock, so concurrent browser tabs cannot overspend.
    const isBrokerageSettlement = tradeData.type === 'BUY';
    const fundingError = validateAssetFunding({
      type: tradeData.type, portfolioId: targetPortfolioId, currency: tradeData.currency,
      amount: tradeData.originalAmount, accountId: tradeData.brokerageAccountId,
      accounts: [...allBrokerageAccounts, ...brokerageAccounts], balances: brokerageCashBalances,
    });
    if (fundingError) { addToast(fundingError, 'error'); return false; }
    if ((tradeData.type === 'BUY' || tradeData.type === 'IMPORT') &&
      (!Number.isFinite(tradeData.shares) || (tradeData.shares || 0) <= 0 || !Number.isFinite(tradeData.pricePerUnit) || (tradeData.pricePerUnit || 0) <= 0)) {
      addToast('ราคาและจำนวนหน่วยต้องมากกว่าศูนย์', 'error'); return false;
    }
    const settlementAccount = tradeData.brokerageAccountId
      ? (allBrokerageAccounts.find(account => account.id === tradeData.brokerageAccountId)
        || brokerageAccounts.find(account => account.id === tradeData.brokerageAccountId))
      : undefined;
    const settlementAmount = Math.max(0, Number(
      tradeData.originalAmount ?? (tradeData.amountUSD * (tradeData.rateAtTime || 1))
    ) || 0);

    if (isBrokerageSettlement && tradeData.brokerageAccountId) {
      if (!settlementAccount || settlementAccount.kind !== 'cash' || settlementAccount.portfolioId !== targetPortfolioId) {
        addToast(language === 'th'
          ? 'บัญชีเงินสดที่เลือกไม่อยู่ในพอร์ตนี้ กรุณาเลือกใหม่'
          : 'The selected cash account does not belong to this portfolio.', 'error');
        return false;
      }
      if (tradeData.type === 'BUY') {
        const availableCash = brokerageCashBalances.find(balance => balance.accountId === settlementAccount.id)?.balance || 0;
        if (settlementAmount > availableCash + 0.000001) {
          const message = language === 'th'
            ? `เงินใน ${settlementAccount.name} ไม่พอ (ใช้ ${settlementAmount.toLocaleString()} ${settlementAccount.currency}, คงเหลือ ${availableCash.toLocaleString()} ${settlementAccount.currency})`
            : `Insufficient cash in ${settlementAccount.name}.`;
          addToast(message, 'error');
          return false;
        }
      }
    }
    // Decorate the server-created projection only AFTER acceptance. Never
    // overwrite aggregate quantity/cost with this individual purchase.
    const applyMetadata = async () => {
      if (!metadata) return;
      if (!activePortfolioId || activePortfolioId === targetPortfolioId) setAssets(previous => {
        const exists = previous.some(a => a.portfolioId === targetPortfolioId && a.symbol.toUpperCase() === tradeData.asset.toUpperCase());
        if (exists) return previous.map(a => a.portfolioId === targetPortfolioId && a.symbol.toUpperCase() === tradeData.asset.toUpperCase() ? { ...a, ...metadata } : a);
        return [...previous, { ...metadata, symbol: tradeData.asset, portfolioId: targetPortfolioId, shares: tradeData.shares, avgCost: tradeData.pricePerUnit, valueUSD: (metadata.currentPrice || 0) * (tradeData.shares || 0), change: 0 }];
      });
      if (user) {
        try {
          const { error } = await supabase.from('assets').update({ name: metadata.name, allocation: metadata.allocation, current_price: metadata.currentPrice, exclude_from_total: metadata.excludeFromTotal ?? false })
            .eq('user_id', user.id).eq('portfolio_id', targetPortfolioId).eq('symbol', tradeData.asset);
          if (error) throw error;
        } catch {
          addToast('บันทึกรายการแล้ว แต่รายละเอียดชื่อ/กลุ่มสินทรัพย์ยังไม่อัปเดต กรุณาแก้ใน Portfolio ไม่ต้องเพิ่มรายการซ้ำ', 'warning');
        }
      }
    };
    if (!user) {
      const nextId = trades.length > 0 ? Math.max(...trades.map(t => t.id)) + 1 : 1;
      // Local mode must keep the portfolio identity too; Portfolio and Trade
      // reconcile positions from this same transaction stream.
      const newTrades = [...trades, { ...tradeData, portfolioId: targetPortfolioId || undefined, id: nextId }];
      setTrades(newTrades);
      localStorage.setItem("fintrack-trades", JSON.stringify(newTrades));

      // Mirror the same buy/sell into the local brokerage-cash ledger.  The
      // hosted database does this in a trigger; local mode needs the matching
      // behaviour so Portfolio never shows an unadjusted wallet balance.
      if (tradeData.brokerageAccountId && isBrokerageSettlement) {
        const account = settlementAccount;
        if (account) {
          const cashAmount = settlementAmount;
          const direction = tradeData.type === 'BUY' ? -1 : 1;
          const occurredAt = new Date(tradeData.date).toISOString();
          setBrokerageCashBalances(prev => {
            const balance = prev.find(item => item.accountId === account.id)?.balance || 0;
            return [...prev.filter(item => item.accountId !== account.id), { accountId: account.id, balance: balance + direction * cashAmount }];
          });
          setBrokerageCashEntries(prev => [{
            id: `local-trade-cash-${nextId}`,
            accountId: account.id,
            portfolioId: account.portfolioId,
            type: tradeData.type === 'BUY' ? 'TRADE_BUY' : 'TRADE_SELL',
            amount: cashAmount,
            currency: account.currency,
            occurredAt,
            note: `Trade ${tradeData.type} ${tradeData.asset}`,
          }, ...prev]);
        }
      }
      await applyMetadata();
      return true;
    }
    try {
      const { data, error } = await db.trades.insert({
        user_id: user.id,
        portfolio_id: targetPortfolioId,
        asset_id: null,
        asset_name: tradeData.asset,
        symbol: tradeData.asset,
        type: tradeData.type,
        amount_usd: tradeData.amountUSD,
        quantity: tradeData.shares || 0,
        price_at_execution: tradeData.pricePerUnit || 0,
        fees: tradeData.fees || 0,
        execution_date: new Date(tradeData.date).toISOString(),
        exchange_rate_at_time: tradeData.rateAtTime || 1,
        currency: tradeData.currency || "USD",
        original_amount: tradeData.originalAmount || null,
        brokerage_account_id: tradeData.brokerageAccountId || null,
        total_cost: tradeData.amountUSD,
        status: "completed",
        notes: tradeData.sourceBucketId ? `Source Wallet ID: ${tradeData.sourceBucketId}` : null,
        tags: [...(tradeData.tag ? [tradeData.tag] : []), ...(tradeData.fxRateTHB ? [`FX USD/THB ${tradeData.fxRateTHB}`] : [])]
      } as any);
      if (error || !data) {
        const message = error?.message || (language === 'th' ? 'บันทึกรายการซื้อขายไม่สำเร็จ' : 'Could not save the trade.');
        console.error('Failed to add trade to Supabase', error);
        addToast(message.includes('Insufficient brokerage cash balance')
          ? (language === 'th' ? 'เงินในบัญชีโบรกไม่พอสำหรับรายการนี้' : 'Insufficient brokerage cash for this trade.')
          : message, 'error');
        return false;
      }
      if (data) {
        await applyMetadata();
        setTrades(prev => activePortfolioId && activePortfolioId !== targetPortfolioId ? prev : [...prev, {
          ...tradeData,
          portfolioId: data.portfolio_id || targetPortfolioId || undefined,
          id: parseInt(data.id.split('-')[0], 16) || Date.now(),
          dbId: data.id
        }]);

        // Refetch cash activities to sync with backend triggers
        const { data: newCashActivities } = await db.cashActivities.getAll(user.id, bucketPortfolioId);
        if (newCashActivities) {
          setCashActivities(newCashActivities.map(ca => ({
            id: ca.id,
            type: ca.type,
            amountUSD: ca.amount,
            category: ca.category,
            date: ca.date,
            note: ca.note || undefined,
            currency: ca.currency || undefined,
            rateAtTime: ca.rate_at_time || undefined,
            originalAmount: ca.original_amount || undefined,
            bucketId: ca.bucket_id || undefined,
            isTransfer: ca.is_transfer || false
          })));
        }

        // The trade trigger has just appended TRADE_BUY / TRADE_SELL.  Refresh
        // the derived brokerage cash balance now rather than waiting for a
        // page reload, so Trade's selected wallet and Portfolio agree.
        const [balancesResult, entriesResult] = await Promise.all([
          db.brokerageCashEntries.getBalances(user.id, null),
          db.brokerageCashEntries.getAll(user.id, activePortfolioId),
        ]);
        if (balancesResult.data) {
          setBrokerageCashBalances(balancesResult.data.map(balance => ({
            accountId: balance.brokerage_account_id,
            balance: Number(balance.cash_balance || 0),
          })));
        }
        if (entriesResult.data) {
          setBrokerageCashEntries(entriesResult.data.map(entry => ({
            id: entry.id,
            accountId: entry.brokerage_account_id,
            portfolioId: entry.portfolio_id,
            type: entry.type,
            amount: Number(entry.amount || 0),
            currency: entry.currency as Currency,
            tradeId: entry.trade_id || undefined,
            occurredAt: entry.occurred_at,
            note: entry.note || undefined,
          })));
        }
        return true;
      }
    } catch (err) {
      console.error("Failed to add trade to Supabase", err);
      addToast(language === 'th' ? 'บันทึกรายการซื้อขายไม่สำเร็จ กรุณาลองใหม่' : 'Could not save the trade. Please try again.', 'error');
    }

    // Trade proceeds remain in the brokerage account.  The database records
    // the cash effect in its own append-only brokerage ledger; bank buckets
    // are deliberately not involved in investment execution.
    return false;
  };

  const refreshBrokerageLedger = async () => {
    if (!user) return;
    const [balances, entries] = await Promise.all([
      db.brokerageCashEntries.getBalances(user.id, null),
      db.brokerageCashEntries.getAll(user.id, activePortfolioId),
    ]);
    if (balances.data) setBrokerageCashBalances(balances.data.map(row => ({ accountId: row.brokerage_account_id, balance: Number(row.cash_balance || 0) })));
    if (entries.data) setBrokerageCashEntries(entries.data.map(row => ({
      id: row.id, accountId: row.brokerage_account_id, portfolioId: row.portfolio_id,
      type: row.type, amount: Number(row.amount || 0), currency: row.currency as Currency,
      tradeId: row.trade_id || undefined, occurredAt: row.occurred_at, note: row.note || undefined,
    })));
  };

  const correctFinancialEvent = async (rpc: string, args: Record<string, unknown>): Promise<boolean> => {
    if (!user) { addToast('เข้าสู่ระบบก่อนจัดการรายการเงินจริง', 'warning'); return false; }
    const { data, error } = await supabase.rpc(rpc, args);
    if (error || data === false || data == null) {
      addToast(error?.message?.includes('Insufficient') ? 'ย้อนรายการไม่ได้ เพราะเงินคงเหลือไม่พอ กรุณาจัดการรายการที่ใช้เงินนี้ก่อน'
        : error?.message?.includes('Ambiguous') ? 'ประวัติเก่ามีเลขไม้ซ้ำ กรุณาลบรายการที่ต้องการใน Ledger เพื่อไม่ให้ลบผิดไม้'
        : error?.message || 'บันทึกไม่สำเร็จ', 'error');
      return false;
    }
    if (rpc === 'delete_trade_journal_transactions' && Array.isArray(data)) {
      setTrades(previous => previous.filter(trade => !data.includes(trade.dbId)));
    }
    setFinancialRevision(revision => revision + 1);
    addToast('บันทึกแล้ว กำลังอัปเดตยอดทุกหน้า', 'success');
    return true;
  };
  const deleteBrokerCashMovement = (id: string) => correctFinancialEvent('delete_broker_cash_movement', { p_id: id });
  const deleteTradeJournalTransactions = (id: string) => correctFinancialEvent('delete_trade_journal_transactions', { p_id: id });
  const transferBrokerToBucket = (id: string, accountId: string, bucketId: string, amount: number, rate: number) =>
    correctFinancialEvent('transfer_broker_to_bucket', { p_id: id, p_account_id: accountId, p_bucket_id: bucketId, p_amount: amount, p_rate: rate });

  const removeAsset = async (symbol: string, portfolioId?: string) => {
    const sym = symbol.toUpperCase();
    const targetPortfolioId = portfolioId ?? activePortfolioId;
    const isTargetAsset = (asset: Asset) => asset.symbol.toUpperCase() === sym
      && (asset.portfolioId ?? activePortfolioId) === targetPortfolioId;
    const isTargetTrade = (trade: Trade) => trade.asset.toUpperCase() === sym
      && (trade.portfolioId ?? activePortfolioId) === targetPortfolioId;
    if (!user) {
      setAssets(prev => {
        const newAssets = prev.filter(asset => !isTargetAsset(asset));
        localStorage.setItem("fintrack-assets", JSON.stringify(newAssets));
        return newAssets;
      });
      setTrades(prev => {
        const newTrades = prev.filter(trade => !isTargetTrade(trade));
        localStorage.setItem("fintrack-trades", JSON.stringify(newTrades));
        return newTrades;
      });
      return;
    }
    try {
      if (!targetPortfolioId) {
        addToast(language === 'th' ? 'เลือกพอร์ตเดี่ยวก่อนลบสินทรัพย์' : 'Select one portfolio before deleting an asset.', 'warning');
        return;
      }

      // Broker cash entries deliberately protect their linked trade from a
      // plain DELETE.  The RPC removes both sides atomically, so the asset
      // cannot return after a refresh because the original trade survived.
      const { error } = await db.trades.deletePositionWithBrokerageCash(sym, targetPortfolioId);
      if (error) throw error;
      
      setAssets(prev => prev.filter(asset => !isTargetAsset(asset)));
      setTrades(prev => prev.filter(trade => !isTargetTrade(trade)));
      await refreshBrokerageLedger();
      addToast(language === 'th' ? `ลบ ${sym} จากพอร์ตแล้ว` : `Removed ${sym} from the portfolio.`, 'success');
    } catch (err) {
      console.error("Failed to remove asset from Supabase", err);
      addToast(language === 'th' ? 'ลบสินทรัพย์ไม่สำเร็จ กรุณาลองใหม่' : 'Could not remove the asset. Please try again.', 'error');
    }
  };

  const updateAsset = async (symbol: string, updates: Partial<Asset>) => {
    const selectedPortfolio = portfolios.find(portfolio => portfolio.id === activePortfolioId);
    if (activePortfolioId && selectedPortfolio?.kind !== 'trading') {
      addToast(language === 'th' ? 'แก้ไขสินทรัพย์ได้เฉพาะพอร์ตลงทุน' : 'Assets can only be changed in a trading portfolio.', 'warning');
      return;
    }
    const sym = symbol.toUpperCase();
    if (!user) {
      setAssets(prev => {
        const newAssets = prev.map(a => a.symbol.toUpperCase() === sym ? { ...a, ...updates } : a);
        localStorage.setItem("fintrack-assets", JSON.stringify(newAssets));
        return newAssets;
      });
      return;
    }
    try {
      const asset = assets.find(a => a.symbol.toUpperCase() === sym);
      if (asset?.id) {
        const supabaseUpdates: any = {};
        if (updates.name !== undefined) supabaseUpdates.name = updates.name;
        if (updates.isFavorite !== undefined) supabaseUpdates.is_favorite = updates.isFavorite;
        if (updates.sortOrder !== undefined) supabaseUpdates.sort_order = updates.sortOrder;
        if (updates.excludeFromTotal !== undefined) supabaseUpdates.exclude_from_total = updates.excludeFromTotal;
        if (updates.allocation !== undefined) {
          supabaseUpdates.asset_type = updates.allocation;
          supabaseUpdates.allocation = updates.allocation;
        }
        if (updates.is_active !== undefined) supabaseUpdates.is_active = updates.is_active;
        if (updates.brokerageAccountId !== undefined) supabaseUpdates.brokerage_account_id = updates.brokerageAccountId || null;
        
        await db.assets.update(asset.id, supabaseUpdates);
      }
      setAssets(prev => prev.map(a => a.symbol.toUpperCase() === sym ? { ...a, ...updates } : a));
    } catch (err) {
      console.error("Failed to update asset in Supabase", err);
    }
  };

  const reorderAssets = async (reordered: Asset[]) => {
    setAssets(reordered);
    if (!user) {
      localStorage.setItem("fintrack-assets", JSON.stringify(reordered));
      return;
    }
    try {
      // Batch update sort order
      const updates = reordered
        .filter(a => a.id)
        .map((a, idx) => ({ id: a.id!, sort_order: idx }));

      if (updates.length > 0) {
        await db.assets.bulkUpdate(updates);
      }
    } catch (err) {
      console.error("Failed to reorder assets in Supabase", err);
    }
  };

  const removeTrade = async (id: number): Promise<boolean> => {
    const tradeToRemove = trades.find(t => t.id === id);
    if (!tradeToRemove) return false;
    const blockedReason = tradeDeletionReason(tradeToRemove, trades, language);
    if (blockedReason) { addToast(blockedReason, 'warning'); return false; }
    if (!user || !tradeToRemove?.dbId) {
      setTrades(prev => {
        const newTrades = prev.filter(t => t.id !== id);
        localStorage.setItem("fintrack-trades", JSON.stringify(newTrades));
        return newTrades;
      });
      return true;
    }
    try {
      const { data, error } = await db.trades.deleteWithBrokerageCash(tradeToRemove.dbId);
      if (error) throw error;
      if (!data) throw new Error('Trade was not deleted');
      setTrades(prev => prev.filter(t => t.id !== id));
      if (!trades.some(trade => trade.id !== id && trade.asset === tradeToRemove.asset && trade.portfolioId === tradeToRemove.portfolioId)) {
        setAssets(prev => prev.filter(asset => !(asset.symbol === tradeToRemove.asset && asset.portfolioId === tradeToRemove.portfolioId)));
      }
      await refreshBrokerageLedger();
      addToast(language === 'th' ? 'ลบรายการโบรกแล้ว' : 'Brokerage entry deleted.', 'success');
      return true;
    } catch (err) {
      const message = tradeDeleteError(err, language);
      console.warn('Trade deletion rejected:', message);
      addToast(message, 'error');
      return false;
    }
  };

  const updateTrade = async (id: number, updates: Partial<Trade>): Promise<boolean> => {
    const tradeToUpdate = trades.find(t => t.id === id);
    if (!tradeToUpdate) return false;
    // Editors submit gross execution amounts. Preserve the already-paid fee
    // in settlement when changing quantity/price; never silently refund it.
    if (updates.originalAmount !== undefined && updates.amountUSD !== undefined) {
      const rate = tradeToUpdate.currency === 'USD' ? 1 : tradeToUpdate.rateAtTime || 1;
      const fee = tradeToUpdate.fees || 0;
      updates = { ...updates, originalAmount: updates.originalAmount + (tradeToUpdate.type === 'SELL' ? -fee : fee) * rate };
    }
    
    if (!user || !tradeToUpdate.dbId) {
      setTrades(prev => {
        const newTrades = prev.map(t => t.id === id ? { ...t, ...updates } : t);
        localStorage.setItem("fintrack-trades", JSON.stringify(newTrades));
        return newTrades;
      });
      return true;
    }
    
    const originalTrade = tradeToUpdate;
    // Update local state first for optimistic UI, then restore it if the
    // database rejects the change.
    setTrades(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    
    try {
      const dbUpdates: any = {};
      if (updates.asset !== undefined) {
        dbUpdates.symbol = updates.asset;
        dbUpdates.asset_name = updates.asset;
      }
      if (updates.type !== undefined) dbUpdates.type = updates.type;
      if (updates.amountUSD !== undefined) dbUpdates.amount_usd = updates.amountUSD;
      if (updates.date !== undefined) dbUpdates.execution_date = new Date(updates.date).toISOString();
      if (updates.shares !== undefined) dbUpdates.quantity = updates.shares;
      if (updates.pricePerUnit !== undefined) dbUpdates.price_at_execution = updates.pricePerUnit;
      if (updates.fees !== undefined) dbUpdates.fees = updates.fees;
      if (updates.originalAmount !== undefined) dbUpdates.original_amount = updates.originalAmount;
      if (updates.currency !== undefined) dbUpdates.currency = updates.currency;
      if (updates.rateAtTime !== undefined) dbUpdates.exchange_rate_at_time = updates.rateAtTime;
      
      const nextTrade = { ...tradeToUpdate, ...updates };
      const isPostedBrokerageTrade = Boolean(nextTrade.brokerageAccountId)
        && (nextTrade.type === 'BUY' || nextTrade.type === 'SELL');

      if (isPostedBrokerageTrade) {
        const { error } = await db.trades.replaceWithBrokerageCash({
          id: tradeToUpdate.dbId,
          symbol: nextTrade.asset,
          executionDate: new Date(nextTrade.date).toISOString(),
          quantity: Number(nextTrade.shares),
          priceAtExecution: Number(nextTrade.pricePerUnit),
          amountUSD: Number(nextTrade.amountUSD),
          originalAmount: Number(nextTrade.originalAmount ?? nextTrade.amountUSD),
        });
        if (error) throw error;
      } else if (Object.keys(dbUpdates).length > 0) {
        const { error } = await db.trades.update(tradeToUpdate.dbId, dbUpdates);
        if (error) throw error;
      }
      if (isPostedBrokerageTrade && nextTrade.portfolioId) {
        const [balancesResult, entriesResult] = await Promise.all([
          db.brokerageCashEntries.getBalances(user.id, null),
          db.brokerageCashEntries.getAll(user.id, nextTrade.portfolioId),
        ]);
        if (balancesResult.data) {
          setBrokerageCashBalances(balancesResult.data.map(balance => ({
            accountId: balance.brokerage_account_id,
            balance: Number(balance.cash_balance || 0),
          })));
        }
        if (entriesResult.data) {
          setBrokerageCashEntries(entriesResult.data.map(entry => ({
            id: entry.id,
            accountId: entry.brokerage_account_id,
            portfolioId: entry.portfolio_id,
            type: entry.type,
            amount: Number(entry.amount || 0),
            currency: entry.currency as Currency,
            tradeId: entry.trade_id || undefined,
            occurredAt: entry.occurred_at,
            note: entry.note || undefined,
          })));
        }
      }
      return true;
    } catch (err) {
      console.error("Failed to update trade in Supabase", err);
      setTrades(prev => prev.map(t => t.id === id ? originalTrade : t));
      addToast(t("errorOccurred") || "Failed to update trade", "error");
      return false;
    }
  };

  const updateCashActivity = async (id: string, updates: Partial<CashActivity>) => {
    if (cashActivities.find(activity => activity.id === id)?.note?.includes('[funding:')) {
      addToast('รายการนี้เชื่อมกับยอดเงินในโบรกเกอร์ ไม่สามารถแก้ไขฝั่งเดียวได้', 'warning');
      return;
    }
    const activityToUpdate = cashActivities.find(c => c.id === id);
    if (!activityToUpdate) return;
    
    if (!user) {
      setCashActivities(prev => {
        const newActivities = prev.map(c => c.id === id ? { ...c, ...updates } : c);
        localStorage.setItem("fintrack-cash-activities", JSON.stringify(newActivities));
        return newActivities;
      });
      return;
    }
    
    // Optimistic
    setCashActivities(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    
    try {
      const dbUpdates: any = {};
      if (updates.type !== undefined) dbUpdates.type = updates.type;
      if (updates.amountUSD !== undefined) dbUpdates.amount = updates.amountUSD;
      if (updates.category !== undefined) dbUpdates.category = updates.category;
      if (updates.date !== undefined) dbUpdates.date = updates.date;
      if (updates.note !== undefined) dbUpdates.note = updates.note;
      if (updates.originalAmount !== undefined) dbUpdates.original_amount = updates.originalAmount;
      if (updates.currency !== undefined) dbUpdates.currency = updates.currency;
      if (updates.rateAtTime !== undefined) dbUpdates.rate_at_time = updates.rateAtTime;
      
      if (Object.keys(dbUpdates).length > 0) {
        await db.cashActivities.update(id, dbUpdates);
      }
    } catch (err) {
      console.error("Failed to update cash activity in Supabase", err);
    }
  };

  // Bucket data lives only in the dedicated cash-management portfolio.  The
  // All-portfolios view is allowed to show/manage that shared bank view, but
  // must never fall back to an arbitrary trading portfolio.
  const selectedPortfolioForBuckets = portfolios.find(portfolio => portfolio.id === activePortfolioId);
  const bucketPortfolioId = selectedPortfolioForBuckets?.kind === 'cash_management'
    ? selectedPortfolioForBuckets.id
    : portfolios.find(portfolio => portfolio.kind === 'cash_management')?.id || null;

  const addMoneyBucket = async (bucket: Omit<MoneyBucket, 'id'>) => {
    if (!isFxCurrency(bucket.currency)) { addToast('unresolved: กรุณาระบุสกุล Bucket', 'error'); return; }
    if (!user) {
      const id = Date.now().toString();
      setMoneyBuckets(prev => {
        const newBuckets = [...prev, { ...bucket, id }];
        localStorage.setItem("fintrack-buckets", JSON.stringify(newBuckets));
        return newBuckets;
      });
      return;
    }
    // Optimistically add to state right away so UI is always responsive
    const tempId = Date.now().toString();
    setMoneyBuckets(prev => [...prev, { ...bucket, id: tempId }]);
    try {
      let { data, error } = await db.buckets.insert({
        user_id: user.id,
        portfolio_id: bucketPortfolioId,
        name: bucket.name,
        target_percent: bucket.targetPercent,
        target_amount: bucket.targetAmount || 0,
        current_amount: bucket.currentAmount,
        currency: bucket.currency,
        color: bucket.color,
        icon: bucket.icon,
        linked_to_expenses: bucket.linkedToExpenses || false
      } as any);
      if (error) {
        console.error("Supabase bucket insert error:", error.message || error);
        // Replace tempId with itself — state stays, DB failed silently
        return;
      }
      if (data) {
        // Replace temp entry with DB-confirmed entry (real UUID)
        setMoneyBuckets(prev => prev.map(b => b.id === tempId ? { ...bucket, id: data.id } : b));
      }
    } catch (err) {
      console.error("Failed to add bucket to Supabase:", err);
    }
  };

  const updateMoneyBucket = async (id: string, updates: Partial<MoneyBucket>) => {
    const bucket = moneyBuckets.find(b => b.id === id);
    if (!bucket || !isFxCurrency(bucket.currency) || (updates.currentAmount !== undefined && (!Number.isFinite(updates.currentAmount) || updates.currentAmount < 0))
      || (updates.currency !== undefined && updates.currency !== bucket.currency)) {
      addToast('unresolved: ตรวจสกุลและยอด Bucket ก่อนบันทึก ห้ามเปลี่ยนสกุลยอดเดิม', 'error'); return;
    }
    if (!user) {
      setMoneyBuckets(prev => {
        const newBuckets = prev.map(b => b.id === id ? { ...b, ...updates } : b);
        localStorage.setItem("fintrack-buckets", JSON.stringify(newBuckets));
        return newBuckets;
      });
      return;
    }
    try {
      const supabaseUpdates: any = {};
      if (updates.name !== undefined) supabaseUpdates.name = updates.name;
      if (updates.currentAmount !== undefined) supabaseUpdates.current_amount = updates.currentAmount;
      if (updates.currency !== undefined) supabaseUpdates.currency = updates.currency;
      if (updates.targetPercent !== undefined) supabaseUpdates.target_percent = updates.targetPercent;
      if (updates.targetAmount !== undefined) supabaseUpdates.target_amount = updates.targetAmount;
      if (updates.color !== undefined) supabaseUpdates.color = updates.color;
      if (updates.icon !== undefined) supabaseUpdates.icon = updates.icon;
      if (updates.linkedToExpenses !== undefined) supabaseUpdates.linked_to_expenses = updates.linkedToExpenses;
      
      const { error } = await db.buckets.update(id, supabaseUpdates);
      if (error) throw error;
      setMoneyBuckets(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    } catch (err) {
      console.error("Failed to update bucket in Supabase", err);
    }
  };

  const removeMoneyBucket = async (id: string) => {
    if (!user) {
      setMoneyBuckets(prev => {
        const newBuckets = prev.filter(b => b.id !== id);
        localStorage.setItem("fintrack-buckets", JSON.stringify(newBuckets));
        return newBuckets;
      });
      return;
    }
    try {
      await db.buckets.delete(id);
      setMoneyBuckets(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error("Failed to remove bucket from Supabase", err);
    }
  };

  const addBucketActivity = async (activity: Omit<BucketActivity, 'id'>) => {
    try {
      const bucket = moneyBuckets.find(b => b.id === activity.bucketId);
      bucketNativeAmount({ original_amount: activity.originalAmount, currency: activity.currency }, bucket?.currency);
    } catch (error) { addToast(String(error), 'error'); return; }
    if (!user) {
      const id = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
      setBucketActivities(prev => {
        const newActivities = [{ ...activity, id }, ...prev];
        localStorage.setItem("fintrack-bucket-activities", JSON.stringify(newActivities));
        return newActivities;
      });
      return;
    }

    // Optimistic update
    const tempId = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
    setBucketActivities(prev => [{ ...activity, id: tempId }, ...prev]);

    try {
      const { data, error } = await db.bucketActivities.insert({
        user_id: user.id,
        portfolio_id: bucketPortfolioId,
        bucket_id: activity.bucketId,
        type: activity.type,
        amount: activity.amount,
        note: activity.note || null,
        date: activity.date,
        currency: activity.currency || null,
        rate_at_time: activity.rateAtTime || null,
        original_amount: activity.originalAmount ?? null
      } as any);

      if (error) {
        console.error("Supabase bucket_activities insert error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        setBucketActivities(prev => prev.filter(a => a.id !== tempId));
        return;
      }

      if (data) {
        setBucketActivities(prev => prev.map(a => a.id === tempId ? { ...activity, id: data.id } : a));
      }
    } catch (err) {
      console.error("Failed to add bucket activity to Supabase", err);
    }
  };



  const removeBucketActivity = async (id: string) => {
    if (bucketActivities.find(activity => activity.id === id)?.note?.includes('[funding:')) {
      addToast('รายการนี้เชื่อมกับยอดเงินในโบรกเกอร์ ไม่สามารถลบฝั่งเดียวได้', 'warning');
      return;
    }
    if (!user) {
      setBucketActivities(prev => {
        const newActivities = prev.filter(a => a.id !== id);
        localStorage.setItem("fintrack-bucket-activities", JSON.stringify(newActivities));
        return newActivities;
      });
      return;
    }
    try {
      await db.bucketActivities.delete(id);
      setBucketActivities(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error("Failed to remove bucket activity from Supabase", err);
    }
  };

  const addCashActivity = async (activityData: Omit<CashActivity, "id">): Promise<CashActivity | null> => {
    try {
      const row = { original_amount: activityData.originalAmount, currency: activityData.currency };
      getNativeLeg(row);
      if (activityData.bucketId) {
        const bucket = moneyBuckets.find(b => b.id === activityData.bucketId);
        bucketNativeAmount(row, bucket?.currency);
      }
    } catch (error) { addToast(String(error), 'error'); return null; }
    if (!user) {
      const id = Math.random().toString(36).substr(2, 9);
      const newActivity = { ...activityData, id };
      setCashActivities(prev => {
        const newActivities = [...prev, newActivity];
        localStorage.setItem("fintrack-cash-activities", JSON.stringify(newActivities));
        return newActivities;
      });
      return newActivity;
    }

    const tempId = Math.random().toString(36).substr(2, 9);
    const optimisticActivity = { ...activityData, id: tempId };
    setCashActivities(prev => [...prev, optimisticActivity]);

    try {
      const { data, error } = await db.cashActivities.insert({
        user_id: user.id,
        portfolio_id: bucketPortfolioId,
        type: activityData.type,
        amount: activityData.amountUSD,
        category: activityData.category,
        note: activityData.note || null,
        date: activityData.date,
        time: activityData.time || null,
        bucket_id: activityData.bucketId || null,
        is_transfer: activityData.isTransfer || false,
        currency: activityData.currency || null,
        rate_at_time: activityData.rateAtTime || null,
        original_amount: activityData.originalAmount ?? null
      } as any);

      if (error) {
        console.error("Supabase cash_activities insert error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        console.error("Failed to insert cash activity:", JSON.stringify(activityData, Object.getOwnPropertyNames(activityData), 2));
        setCashActivities(prev => prev.filter(a => a.id !== tempId));
        addToast(t("errorOccurred") || "Failed to save record", "error");
        return null;
      }
      
      if (data) {
        const savedActivity = { ...activityData, id: data.id };
        setCashActivities(prev => prev.map(a => a.id === tempId ? savedActivity : a));
        return savedActivity;
      }
      return optimisticActivity;
    } catch (err) {
      console.error("Failed to add cash activity to Supabase", err);
      setCashActivities(prev => prev.filter(a => a.id !== tempId));
      addToast(t("errorOccurred") || "Failed to save record", "error");
      return null;
    }
  };

  const removeCashActivity = async (id: string) => {
    const activity = cashActivities.find(a => a.id === id);
    if (!activity) return;
    if (activity.note?.includes('[funding:')) {
      addToast('รายการนี้เชื่อมกับยอดเงินในโบรกเกอร์ ไม่สามารถลบฝั่งเดียวได้', 'warning');
      return;
    }

    // Validate BEFORE deletion; a missing native leg must never remove the source.
    const sourceBucket = moneyBuckets.find(b => b.id === activity.bucketId);
    let reversalBalance: number | undefined;
    try {
      getNativeLeg({ original_amount: activity.originalAmount, currency: activity.currency });
      if (activity.bucketId) {
        if (!sourceBucket) throw Error('unresolved: ไม่พบ Bucket ของรายการเดิม');
        reversalBalance = nativeBucketBalance(sourceBucket.currentAmount,
          { original_amount: activity.originalAmount, currency: activity.currency }, sourceBucket.currency,
          activity.type === 'EXPENSE' || activity.type === 'WITHDRAW' ? 1 : -1);
      }
    } catch (error) { addToast(String(error), 'error'); return; }
    // Reverse the recorded native leg, never today's FX quote.
    const revertBucket = () => {
      if (activity.bucketId && activity.bucketId !== "<no-bucket>" && activity.bucketId !== "<auto-distribute>") {
        const bucket = moneyBuckets.find(b => b.id === activity.bucketId);
        if (bucket) {
          const leg = getNativeLeg({ original_amount: activity.originalAmount, currency: activity.currency });
          const bCur = leg.currency;
          const bRate = activity.rateAtTime;
          const amountInBucketCur = leg.amount;
          const newAmount = reversalBalance!;
          
          updateMoneyBucket(bucket.id, { currentAmount: newAmount });
          addBucketActivity({
            bucketId: bucket.id,
            bucketName: bucket.name,
            type: (activity.type === "EXPENSE" || activity.type === "WITHDRAW") ? "deposit" : "withdraw",
            amount: amountInBucketCur,
            date: new Date().toISOString(),
            note: "Revert: " + (activity.note || activity.category),
            currency: bCur,
            rateAtTime: bRate,
            originalAmount: amountInBucketCur,
          });
        }
      }
    };

    if (!user) {
      setCashActivities(prev => {
        const newActivities = prev.filter(a => a.id !== id);
        localStorage.setItem("fintrack-cash-activities", JSON.stringify(newActivities));
        return newActivities;
      });
      revertBucket();
      return;
    }
    try {
      const { error } = await db.cashActivities.delete(id);
      if (error) throw error;
      setCashActivities(prev => prev.filter(a => a.id !== id));
      revertBucket();
    } catch (err) {
      console.error("Failed to remove cash activity from Supabase", err);
    }
  };

  const updateAllocation = async (label: string, value: number) => {
    setAllocations(prev => prev.map(a => a.label === label ? { ...a, value } : a));
    if (!user) return;
    try {
      const allocation = allocations.find(a => a.label === label);
      await db.allocations.upsert({
        user_id: user.id,
        portfolio_id: activePortfolioId,
        label,
        value,
        color: allocation?.color || "#6B7280"
      });
    } catch (err) {
      console.error("Failed to update allocation in Supabase", err);
    }
  };

  const bulkAddTrades = async (newTrades: Omit<Trade, "id">[]) => {
    if (!user) {
      const tradesWithIds = newTrades.map((t, i) => ({ ...t, id: Date.now() + i }));
      setTrades(prev => [...tradesWithIds, ...prev]);
      return;
    }
    try {
      const supabaseTrades = newTrades.map(t => ({
        user_id: user.id,
        portfolio_id: activePortfolioId,
        asset_id: null,
        asset_name: t.asset,
        symbol: t.asset,
        type: t.type,
        amount_usd: t.amountUSD,
        quantity: t.shares || 0,
        price_at_execution: t.pricePerUnit || 0,
        fees: t.fees || 0,
        execution_date: new Date(t.date).toISOString(),
        exchange_rate_at_time: t.rateAtTime || 1,
        currency: t.currency || "USD",
        total_cost: t.amountUSD,
        status: "completed",
        notes: t.sourceBucketId ? `Source Wallet ID: ${t.sourceBucketId}` : null,
        tags: t.tag ? [t.tag] : []
      } as any));
      const { data } = await db.trades.bulkInsert(supabaseTrades);
      if (data) {
        const tradesWithIds = newTrades.map((t, i) => ({ 
          ...t, 
          id: parseInt(data[i].id.split('-')[0], 16) || Date.now() + i 
        }));
        setTrades(prev => [...tradesWithIds, ...prev]);

        // Refetch cash activities to sync with backend triggers
        const { data: newCashActivities } = await db.cashActivities.getAll(user.id, bucketPortfolioId);
        if (newCashActivities) {
          setCashActivities(newCashActivities.map(ca => ({
            id: ca.id,
            type: ca.type,
            amountUSD: ca.amount,
            category: ca.category,
            date: ca.date,
            note: ca.note || undefined,
            currency: ca.currency || undefined,
            rateAtTime: ca.rate_at_time || undefined,
            originalAmount: ca.original_amount || undefined,
            bucketId: ca.bucket_id || undefined,
            isTransfer: ca.is_transfer || false
          })));
        }
      }
    } catch (err) {
      console.error("Failed to bulk add trades to Supabase", err);
    }
  };

  const addTradeFromBucket = async (tradeData: Omit<Trade, 'id'>, bucketId: string) => {
    const bucket = moneyBuckets.find(b => b.id === bucketId);
    if (!bucket) return;
    let tradeAmountInBucketCurrency: number;
    try {
      tradeAmountInBucketCurrency = bucketNativeAmount({ original_amount: tradeData.originalAmount, currency: tradeData.currency }, bucket.currency);
    } catch (error) { addToast(String(error), 'error'); return; }
    if (tradeAmountInBucketCurrency > bucket.currentAmount) {
      addToast(t("amountExceedsBalance"), 'error');
      return;
    }

    // Add the trade
    const saved = await addTrade({ ...tradeData, sourceBucketId: bucketId });
    if (!saved) return;

    // Deduct from bucket
    await updateMoneyBucket(bucketId, { currentAmount: bucket.currentAmount - tradeAmountInBucketCurrency });

    // Log activity
    await addBucketActivity({
      bucketId: bucket.id,
      bucketName: bucket.name,
      type: 'invest',
      amount: tradeAmountInBucketCurrency,
      date: new Date().toISOString(),
      note: `Trade ${tradeData.asset} — ${t('deductedFromBucket')}`,
      currency: tradeData.currency,
      originalAmount: tradeAmountInBucketCurrency,
      rateAtTime: tradeData.rateAtTime,
    });
  };


  const activePortfolio = React.useMemo(
    () => portfolios.find(portfolio => portfolio.id === activePortfolioId) || null,
    [activePortfolioId, portfolios]
  );
  const isAllPortfolios = activePortfolioId === null;

  // Computed P/L metrics respecting excludeFromTotal
  const includedAssets = React.useMemo(() => assets.filter(a => !a.excludeFromTotal), [assets]);

  const totalInvested = React.useMemo(() => {
    return includedAssets.reduce((acc, a) => acc + (a.avgCost || 0) * (a.shares || 0), 0);
  }, [includedAssets]);

  const totalUnrealizedPL = React.useMemo(() => {
    const portfolioValue = includedAssets.reduce((acc, a) => acc + a.valueUSD, 0);
    const costBasis = includedAssets.reduce((acc, a) => acc + (a.avgCost || 0) * (a.shares || 0), 0);
    return portfolioValue - costBasis;
  }, [includedAssets]);

  const totalRealizedPL = React.useMemo(() => {
    return includedAssets.reduce((acc, a) => acc + (a.realizedPL || 0), 0);
  }, [includedAssets]);

  const totalDividends = React.useMemo(() => {
    return includedAssets.reduce((acc, a) => acc + (a.dividendTotal || 0), 0);
  }, [includedAssets]);

  // ── Custom Category Actions ───────────────────────────────────
  const addCustomCategory = async (type: 'INCOME' | 'EXPENSE', label: string, icon = 'tag') => {
    const trimmed = label.trim();
    if (!trimmed) return;
    // Optimistic update
    const tempId = `local-${Date.now()}`;
    setCustomCategories(prev => [...prev, { id: tempId, type, label: trimmed, icon }]);

    if (!user) {
      // Persist to localStorage for demo users
      try {
        const stored = JSON.parse(localStorage.getItem('fintrack-custom-categories') || '[]');
        stored.push({ id: tempId, type, label: trimmed, icon });
        localStorage.setItem('fintrack-custom-categories', JSON.stringify(stored));
      } catch {}
      return;
    }

    try {
      const { data, error } = await db.userCategories.insert(user.id, type, trimmed, icon, activePortfolioId);
      if (error) throw error;
      if (data) {
        // Replace temp with real DB id
        setCustomCategories(prev => prev.map(c => c.id === tempId ? { id: data.id, type, label: trimmed, icon } : c));
      }
    } catch (err) {
      // Rollback optimistic update
      setCustomCategories(prev => prev.filter(c => c.id !== tempId));
      addToast('Failed to save category', 'error');
    }
  };

  const removeCustomCategory = async (id: string) => {
    setCustomCategories(prev => prev.filter(c => c.id !== id));
    if (!user) {
      try {
        const stored = JSON.parse(localStorage.getItem('fintrack-custom-categories') || '[]');
        localStorage.setItem('fintrack-custom-categories', JSON.stringify(stored.filter((c: any) => c.id !== id)));
      } catch {}
      return;
    }
    try {
      await db.userCategories.delete(id);
    } catch (err) {
      addToast('Failed to delete category', 'error');
    }
  };

  // The combined view is deliberately read-only.  Without this guard a write
  // from "All portfolios" could either be unscoped or modify an arbitrary
  // row that happens to be visible in the aggregate.
  const blockAllPortfolioMutation = () => {
    addToast(
      language === 'th'
        ? 'เลือกพอร์ตเดี่ยวก่อนเพิ่มหรือแก้ไขข้อมูล'
        : 'Select one portfolio before adding or editing data.',
      'warning'
    );
  };
  const readOnlyCashActivity = async (): Promise<CashActivity | null> => {
    blockAllPortfolioMutation();
    return null;
  };
  const blockAllPortfolioMutationAsync = async (): Promise<boolean> => {
    blockAllPortfolioMutation();
    return false;
  };
  const blockAllPortfolioMutationVoidAsync = async (): Promise<void> => {
    blockAllPortfolioMutation();
  };
  // Bucket is the shared bank layer.  It remains usable regardless of the
  // selected investment broker so funds can move into that broker's account.
  const canUseMoneyBuckets = true;
  const blockMoneyBucketMutation = () => {
    addToast(
      language === 'th'
        ? 'Bucket ใช้ได้เฉพาะพอร์ตบัญชีธนาคาร/เงินสดเท่านั้น'
        : 'Money Buckets are available only in the cash-management portfolio.',
      'warning'
    );
  };

  return (
    <AppContext.Provider value={{ 
      language, 
      currency, 
      setLanguage, 
      setCurrency, 
      t, 
      formatMoney,
      exchangeRates,
      setExchangeRate,
      resetExchangeRateToAuto,
      isExchangeRateCustom,
      trades,
      addTrade,
      cashActivities: canUseMoneyBuckets ? cashActivities : [],
      addCashActivity: canUseMoneyBuckets ? addCashActivity : readOnlyCashActivity,
      removeCashActivity: canUseMoneyBuckets ? removeCashActivity : blockMoneyBucketMutation,
      allocations,
      updateAllocation: isAllPortfolios ? blockAllPortfolioMutation : updateAllocation,
      assets,
      marketQuotes,
      portfolios,
      activePortfolioId,
      activePortfolio,
      isAllPortfolios,
      selectPortfolio,
      createPortfolio,
      renamePortfolio,
      brokerageAccounts,
      allBrokerageAccounts,
      brokerageCashBalances,
      brokerageCashEntries,
      transferBucketToBroker,
      transferBrokerToBucket,
      deleteBrokerCashMovement,
      deleteTradeJournalTransactions,
      addBrokerageAccount,
      updateBrokerageAccount,
      recordBrokerageCashMovement,
      addAsset: isAllPortfolios ? blockAllPortfolioMutation : addAsset,
      syncDcaPosition,
      bulkAddTrades: isAllPortfolios ? blockAllPortfolioMutation : bulkAddTrades,
      netWorthHistory,
      userProfile,
      setUserProfile,
      fetchAssetMarketData,
      removeAsset: isAllPortfolios ? blockAllPortfolioMutationVoidAsync : removeAsset,
      updateAsset: isAllPortfolios ? blockAllPortfolioMutation : updateAsset,
      reorderAssets: isAllPortfolios ? blockAllPortfolioMutation : reorderAssets,
      removeTrade: isAllPortfolios ? blockAllPortfolioMutationAsync : removeTrade,
      updateTrade: isAllPortfolios ? blockAllPortfolioMutationAsync : updateTrade,
      updateCashActivity: canUseMoneyBuckets ? updateCashActivity : blockMoneyBucketMutation,
      toasts,
      addToast,
      removeToast,
      netWorthSettings,
      setNetWorthSettings,
      darkMode,
      setDarkMode,
      notifications,
      addNotification,
      markNotificationRead,
      clearNotifications,
      isDataLoaded,
      notifPreferences,
      setNotifPreferences,
      moneyBuckets: canUseMoneyBuckets ? dynamicMoneyBuckets : [],
      allMoneyBuckets: canUseMoneyBuckets ? allMoneyBuckets : [],
      addMoneyBucket: canUseMoneyBuckets ? addMoneyBucket : blockMoneyBucketMutation,
      updateMoneyBucket: canUseMoneyBuckets ? updateMoneyBucket : blockMoneyBucketMutation,
      removeMoneyBucket: canUseMoneyBuckets ? removeMoneyBucket : blockMoneyBucketMutation,
      bucketActivities: canUseMoneyBuckets ? bucketActivities : [],
      addBucketActivity: canUseMoneyBuckets ? addBucketActivity : blockMoneyBucketMutation,
      removeBucketActivity: canUseMoneyBuckets ? removeBucketActivity : blockMoneyBucketMutation,
      // Investments are always funded by brokerage cash accounts, never by a
      // personal/bank Money Bucket (including in the All-portfolios view).
      addTradeFromBucket: ((..._args: Parameters<typeof addTradeFromBucket>) => blockMoneyBucketMutation()),
      dashboardWidgets,
      setDashboardWidgets,
      totalInvested,
      totalUnrealizedPL,
      totalRealizedPL,
      totalDividends,
      customCategories,
      addCustomCategory,
      removeCustomCategory,
    }}>
      {children}
      
      {/* Global Toast Container — Rich Upgrade (#30) */}
      <div className="fixed bottom-20 right-4 z-[9999] flex w-full max-w-sm flex-col gap-3 pointer-events-none sm:right-6 lg:bottom-6">
        {toasts.map(toast => {
          const iconColor = toast.type === 'success' ? '#4EDEA3' : toast.type === 'warning' ? '#E9C349' : toast.type === 'error' ? '#FFB4AB' : '#ADC6FF';
          const iconBg = toast.type === 'success' ? 'rgba(78,222,163,0.1)' : toast.type === 'warning' ? 'rgba(233,195,73,0.1)' : toast.type === 'error' ? 'rgba(255,180,171,0.1)' : 'rgba(173,198,255,0.1)';
          return (
            <div 
              key={toast.id}
              className="pointer-events-auto bg-[#1C1B1B] text-white border border-white/10 shadow-2xl rounded-2xl overflow-hidden transition-all animate-in slide-in-from-right-8 fade-in"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
                  {toast.type === 'success' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                  {toast.type === 'warning' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>}
                  {toast.type === 'error' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
                  {toast.type === 'info' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>}
                </div>
                <p className="text-sm font-bold flex-1 leading-snug">{toast.message}</p>
                <button 
                  onClick={() => removeToast(toast.id)}
                  className="text-gray-600 hover:text-white transition-colors p-1 flex-shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              {/* Progress bar */}
              <div className="h-0.5 w-full" style={{ backgroundColor: `${iconColor}15` }}>
                <div 
                  className="h-full animate-[shrink_4s_linear_forwards]"
                  style={{ backgroundColor: iconColor, width: '100%' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
