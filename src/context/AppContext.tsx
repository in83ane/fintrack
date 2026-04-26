"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { db, supabase } from "@/src/lib/supabase";
import { User } from "@supabase/supabase-js";

export type Language = "en" | "th";
export type Currency = "USD" | "THB" | "JPY" | "EUR";

export interface Trade {
  id: number;
  asset: string;
  type: "BUY" | "SELL" | "DIVIDEND" | "IMPORT";
  amountUSD: number;
  date: string;
  rateAtTime: number;
  currency: string;
  shares?: number;
  pricePerUnit?: number;
  sourceBucketId?: string;
  tag?: string;
  dbId?: string;
}

export interface CashActivity {
  id: string;
  type: "INCOME" | "EXPENSE";
  amountUSD: number;
  category: string;
  date: string;
  note?: string;
  bucketId?: string;
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
  id: string;
  name: string;
  targetPercent: number;
  targetAmount?: number;
  currentAmount: number;
  color: string;
  icon: string;
  linkedToExpenses?: boolean;
}

export interface BucketActivity {
  id: string;
  bucketId: string;
  bucketName: string;
  type: 'deposit' | 'withdraw' | 'income_split' | 'invest' | 'profit_split';
  amount: number;
  date: string;
  note?: string;
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

interface AppState {
  language: Language;
  currency: Currency;
  setLanguage: (lang: Language) => void;
  setCurrency: (curr: Currency) => void;
  t: (key: string) => string;
  formatMoney: (amount: number, originalCurrency?: Currency, originalRate?: number) => string;
  exchangeRates: Record<Currency, number>;
  trades: Trade[];
  addTrade: (trade: Omit<Trade, "id">) => void;
  cashActivities: CashActivity[];
  addCashActivity: (activity: Omit<CashActivity, "id">) => void;
  removeCashActivity: (id: string) => void;
  allocations: Allocation[];
  updateAllocation: (label: string, value: number) => void;
  assets: Asset[];
  addAsset: (asset: Asset) => void;
  bulkAddTrades: (trades: Omit<Trade, "id">[]) => void;
  netWorthHistory: { date: string; value: number }[];
  userProfile?: { email: string; avatarUrl: string; initials: string };
  setUserProfile: (profile: { email: string; avatarUrl: string; initials: string } | undefined) => void;
  fetchAssetMarketData: (symbol: string) => Promise<any>;
  removeAsset: (symbol: string) => void;
  updateAsset: (symbol: string, updates: Partial<Asset>) => void;
  reorderAssets: (reordered: Asset[]) => void;
  removeTrade: (id: number) => void;
  toasts: AppToast[];
  addToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  removeToast: (id: string) => void;
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
  addMoneyBucket: (bucket: Omit<MoneyBucket, 'id'>) => void;
  updateMoneyBucket: (id: string, updates: Partial<MoneyBucket>) => void;
  removeMoneyBucket: (id: string) => void;
  bucketActivities: BucketActivity[];
  addBucketActivity: (activity: Omit<BucketActivity, 'id'>) => void;
  addTradeFromBucket: (trade: Omit<Trade, 'id'>, bucketId: string) => void;
  dashboardWidgets: DashboardWidget[];
  setDashboardWidgets: (widgets: DashboardWidget[]) => void;
  totalInvested: number;
  totalUnrealizedPL: number;
  totalRealizedPL: number;
  totalDividends: number;
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
    amountUsd: "Amount",
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
    avgCost: "Avg Cost",
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
    moneyManagement: "Money Management",
    moneyBuckets: "Money Buckets",
    moneyBucketsDesc: "Divide your money into purpose-based buckets",
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
    invalidAmount: "Invalid Amount",
    withdrawFromBucket: "Withdraw",
    bucketTotal: "Total Allocated",
    bucketRemaining: "Remaining",
    customBucket: "Custom",
    budgetPage: "Money Buckets",
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
    realized: "Realized",
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
    overallAvgCost: "ต้นทุนเฉลี่ยรวม (พอร์ต)",
    currentValueThisTrade: "มูลค่าปัจจุบัน (ออเดอร์นี้)",
    portfolioBalanced: "พอร์ตของคุณสมดุลดีเยี่ยมแล้ว",

    // Money Buckets
    moneyManagement: "การจัดการเงิน",
    moneyBuckets: "กระเป๋าเงิน",
    moneyBucketsDesc: "แบ่งเงินของคุณตามวัตถุประสงค์",
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
    invalidAmount: "จำนวนเงินไม่ถูกต้อง",
    withdrawFromBucket: "ถอนเงิน",
    bucketTotal: "จัดสรรรวม",
    bucketRemaining: "เหลือ",
    customBucket: "กำหนดเอง",
    budgetPage: "กระเป๋าเงิน",
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
    amountUsd: "จำนวนเงิน",
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
    amount: "จำนวนเงิน",
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
    avgCostPerUnit: "ต้นทุนเฉลี่ยต่อหน่วย",
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
    unrealizedPL: "กำไรยังไม่ขาย",
    realizedPL: "กำไรขายแล้ว",
    realized: "ขายแล้ว",
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
    winRate: "อัตราชนะ",
    wins: "ชนะ",
    losses: "แพ้",
    avgWin: "ชนะเฉลี่ย",
    avgLoss: "แพ้เฉลี่ย",
  },
};

const exchangeRates: Record<Currency, number> = {
  USD: 1,
  THB: 36.5,
  JPY: 150.5,
  EUR: 0.92,
};

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  const [currency, setCurrency] = useState<Currency>("USD");

  const [darkMode, setDarkModeState] = useState(true);

  // Initialize lang and theme from localStorage safely on client side
  useEffect(() => {
    try {
      const storedLang = localStorage.getItem("preferred-lang") as Language;
      if (storedLang === "en" || storedLang === "th") {
        setLanguage(storedLang);
      }
      const storedTheme = localStorage.getItem("theme");
      if (storedTheme === "light") {
        setDarkModeState(false);
      }
    } catch {}
  }, []);

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

  const defaultTrades: Trade[] = [];
  const defaultAllocations: Allocation[] = [
    { label: "Equities", value: 60, color: "#ADC6FF" },
    { label: "Fixed Income", value: 25, color: "#E9C349" },
    { label: "Alternatives", value: 10, color: "#4EDEA3" },
    { label: "Cash", value: 5, color: "#6B7280" },
  ];
  const defaultAssets: Asset[] = [];
  const defaultMoneyBuckets: MoneyBucket[] = [
    { id: 'fixed-expenses', name: 'Fixed Expenses & Debt', targetPercent: 40, currentAmount: 0, color: '#ADC6FF', icon: '🏠', linkedToExpenses: true },
    { id: 'personal', name: 'Personal Spending', targetPercent: 30, currentAmount: 0, color: '#E9C349', icon: '🛒', linkedToExpenses: true },
    { id: 'emergency', name: 'Emergency Fund (Low Risk)', targetPercent: 20, currentAmount: 0, color: '#4EDEA3', icon: '🛡️', linkedToExpenses: false },
    { id: 'investment', name: 'Investment (High Risk)', targetPercent: 10, currentAmount: 0, color: '#FF8B9A', icon: '🚀', linkedToExpenses: false },
  ];

  const [trades, setTrades] = useState<Trade[]>(defaultTrades);
  const [allocations, setAllocations] = useState<Allocation[]>(defaultAllocations);
  const [assets, setAssets] = useState<Asset[]>(defaultAssets);
  const [cashActivities, setCashActivities] = useState<CashActivity[]>([]);
  const [moneyBuckets, setMoneyBuckets] = useState<MoneyBucket[]>(defaultMoneyBuckets);
  const [bucketActivities, setBucketActivities] = useState<BucketActivity[]>([]);
  const [userProfile, setUserProfile] = useState<{ email: string; avatarUrl: string; initials: string } | undefined>();
  const [user, setUser] = useState<User | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const deletedAssetSymbols = React.useRef<Set<string>>(new Set());
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

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
    });

    // 2. Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
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
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch data when user changes
  useEffect(() => {
    if (!user) {
      // Load from localStorage for offline mode
      try {
        const storedAssets = localStorage.getItem("fintrack-assets");
        const storedTrades = localStorage.getItem("fintrack-trades");
        const storedAllocations = localStorage.getItem("fintrack-allocations");
        const storedBuckets = localStorage.getItem("fintrack-buckets");
        const storedBucketActivities = localStorage.getItem("fintrack-bucket-activities");
        const storedCashActivities = localStorage.getItem("fintrack-cash-activities");

        if (storedAssets) {
          const parsedAssets = JSON.parse(storedAssets);
          if (Array.isArray(parsedAssets)) {
            const uniqueAssets = Array.from(new Map(parsedAssets.map(item => [item.symbol.toUpperCase(), item])).values());
            setAssets(uniqueAssets as Asset[]);
          }
        }
        if (storedTrades) setTrades(JSON.parse(storedTrades));
        if (storedAllocations) setAllocations(JSON.parse(storedAllocations));
        if (storedBuckets) setMoneyBuckets(JSON.parse(storedBuckets));
        if (storedBucketActivities) setBucketActivities(JSON.parse(storedBucketActivities));
        if (storedCashActivities) setCashActivities(JSON.parse(storedCashActivities));
      } catch (err) {
        console.error("Failed to load from localStorage", err);
      }
      setIsDataLoaded(true);
      return;
    }

    const loadData = async () => {
      try {
        const [
          { data: assetsData },
          { data: tradesData },
          { data: allocationsData },
          { data: bucketsData },
          { data: bucketActivitiesData },
          { data: cashActivitiesData }
        ] = await Promise.all([
          db.assets.getAll(user.id),
          db.trades.getAll(user.id),
          db.allocations.getAll(user.id),
          db.buckets.getAll(user.id),
          db.bucketActivities.getAll(user.id),
          db.cashActivities.getAll(user.id)
        ]);

        if (assetsData) {
          // Populate deleted symbols so trades don't recreate them
          assetsData.filter(a => a.is_active === false).forEach(a => {
            deletedAssetSymbols.current.add(a.symbol.toUpperCase());
          });

          // Filter out soft-deleted assets (is_active: false)
          const activeAssets = assetsData.filter(a => a.is_active !== false);
          const uniqueAssetsMap = new Map();
          activeAssets.forEach(a => {
            if (!uniqueAssetsMap.has(a.symbol.toUpperCase())) {
              uniqueAssetsMap.set(a.symbol.toUpperCase(), {
                id: a.id,
                name: a.name,
                symbol: a.symbol,
                valueUSD: a.value_usd,
                change: a.change_percentage || 0,
                allocation: a.asset_type || 'Equities',
                shares: a.quantity,
                avgCost: a.avg_purchase_price || 0,
                currentPrice: a.current_price || (a.quantity && a.quantity > 0 ? a.value_usd / a.quantity : 0),
                isFavorite: a.is_favorite,
                sortOrder: a.sort_order,
                is_active: a.is_active
              });
            }
          });
          setAssets(Array.from(uniqueAssetsMap.values()));
        } else {
          setAssets([]);
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
              currency: t.currency || 'USD',
              shares: t.quantity || 0,
              pricePerUnit: t.price_at_execution || 0,
              sourceBucketId: sourceBucketId,
              tag: (t.tags && t.tags.length > 0) ? t.tags[0] : undefined,
              dbId: t.id
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
          setMoneyBuckets(bucketsData.map(b => ({
            id: b.id,
            name: b.name,
            targetPercent: b.target_percent,
            currentAmount: b.current_amount,
            color: b.color,
            icon: b.icon,
            linkedToExpenses: b.linked_to_expenses
          })));
        } else {
          if (user) {
            // Auto-create default buckets in DB for new users
            Promise.all(defaultMoneyBuckets.map(b => 
              db.buckets.insert({
                user_id: user.id,
                name: b.name,
                target_percent: b.targetPercent,
                current_amount: b.currentAmount,
                color: b.color,
                icon: b.icon,
                linked_to_expenses: b.linkedToExpenses || false
              } as any)
            )).then(results => {
               const createdBuckets = results.map(r => r.data).filter(Boolean);
               if (createdBuckets.length > 0) {
                 setMoneyBuckets(createdBuckets.map(b => ({
                    id: b.id,
                    name: b.name,
                    targetPercent: b.target_percent,
                    currentAmount: b.current_amount,
                    color: b.color,
                    icon: b.icon,
                    linkedToExpenses: b.linked_to_expenses
                 })));
               } else {
                 setMoneyBuckets(defaultMoneyBuckets);
               }
            });
          } else {
            setMoneyBuckets(defaultMoneyBuckets);
          }
        }

        if (bucketActivitiesData) {
          setBucketActivities(bucketActivitiesData.map(ba => ({
            id: ba.id,
            bucketId: ba.bucket_id,
            bucketName: "", // We can look this up
            type: ba.type,
            amount: ba.amount,
            date: ba.date,
            note: ba.note || undefined
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
            note: ca.note || undefined
          })));
        } else {
          setCashActivities([]);
        }

      } catch (err) {
        console.error("Failed to load data from Supabase", err);
      } finally {
        setIsDataLoaded(true);
      }
    };

    loadData();
  }, [user]);

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
    const id = Date.now().toString();
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

  // Compute net worth history from actual trade data + current portfolio value
  const netWorthHistory = React.useMemo(() => {
    const currentCashUSD = moneyBuckets.reduce((acc, curr) => acc + curr.currentAmount, 0) / (exchangeRates[currency] || 1);
    const currentTotalUSD = assets.reduce((acc, curr) => acc + curr.valueUSD, 0) + currentCashUSD;
    const now = new Date();
    const currentDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Group trades by month to build historical net worth timeline
    const monthlyInvested: Record<string, number> = {};
    trades.forEach(trade => {
      const month = trade.date.substring(0, 7); // "2024-01"
      if (!monthlyInvested[month]) monthlyInvested[month] = 0;
      monthlyInvested[month] += trade.type === "BUY" ? trade.amountUSD : -trade.amountUSD;
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
  }, [assets, trades, moneyBuckets, currency, exchangeRates]);


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

    const stats: Record<string, { shares: number; totalCost: number; realizedPL: number; dividendTotal: number }> = {};
    const sortedTrades = [...trades].sort((a, b) => a.date.localeCompare(b.date));

    sortedTrades.forEach(trade => {
      const sym = trade.asset.toUpperCase();
      // Skip trades for assets that were manually deleted
      if (deletedAssetSymbols.current.has(sym)) return;
      if (!stats[sym]) stats[sym] = { shares: 0, totalCost: 0, realizedPL: 0, dividendTotal: 0 };
      
      const s = stats[sym];
      const tradeShares = trade.shares || (trade.pricePerUnit && trade.pricePerUnit > 0 ? trade.amountUSD / trade.pricePerUnit : 0);

      if (trade.type === "BUY" || trade.type === "IMPORT") {
        s.shares += tradeShares;
        s.totalCost += trade.amountUSD;
      } else if (trade.type === "SELL") {
        if (s.shares > 0) {
          const costOfSharesSold = (tradeShares / s.shares) * s.totalCost;
          s.realizedPL += (trade.amountUSD - costOfSharesSold);
          s.shares -= tradeShares;
          s.totalCost -= costOfSharesSold;
        } else {
          // Short selling or selling without buy record
          s.realizedPL += trade.amountUSD;
        }
      } else if (trade.type === "DIVIDEND") {
        s.dividendTotal += trade.amountUSD;
      }
    });

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
        const s = stats[asset.symbol.toUpperCase()];
        if (s) {
          newAssets[idx] = {
            ...asset,
            shares: s.shares,
            avgCost: s.shares > 0 ? s.totalCost / s.shares : 0,
            realizedPL: s.realizedPL,
            dividendTotal: s.dividendTotal
          };
          delete stats[asset.symbol.toUpperCase()];
        }
      });
      // Add new ones that aren't in the deleted set and have positive shares
      Object.entries(stats).forEach(([symbol, s]) => {
        if (deletedAssetSymbols.current.has(symbol)) return;
        // Don't recreate assets with 0 shares (fully sold)
        if (s.shares <= 0) return;
        // Don't recreate soft-deleted assets
        if (softDeletedSymbols.has(symbol)) return;
        const CRYPTO_SYM = ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'];
        const autoAlloc = CRYPTO_SYM.includes(symbol) ? 'Alternatives'
          : (symbol.endsWith('.BK') || symbol.endsWith('.TH')) ? 'Equities'
          : 'Equities';
        newAssets.push({
          name: symbol,
          symbol: symbol,
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
      const deduplicatedAssets = Array.from(new Map(newAssets.map(item => [item.symbol.toUpperCase(), item])).values());
      return deduplicatedAssets;
    });
  }, [trades, isDataLoaded]);

  // Fetch Live Market Data with caching and optimistic updates
  useEffect(() => {
    if (!isDataLoaded) return;

    let mounted = true;
    const CACHE_KEY = 'fintrack-market-cache';
    const CACHE_DURATION = 30000; // 30 seconds cache

    const getCachedData = () => {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            return data;
          }
        }
      } catch {}
      return null;
    };

    const setCacheData = (data: any) => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
      } catch {}
    };

    const fetchMarketData = async () => {
      setAssets(currentAssets => {
        if (currentAssets.length === 0) return currentAssets;

        // First: Try cache immediately for fast UI
        const cachedData = getCachedData();
        let updated = currentAssets;

        if (cachedData?.results && Array.isArray(cachedData.results)) {
          updated = currentAssets.map(asset => {
            const marketSym = mapToMarketSymbol(asset.symbol);
            const liveData = cachedData.results.find((r: any) => r.symbol === marketSym);
            if (liveData) {
              const calculatedValue = asset.shares ? (asset.shares * liveData.price) : asset.valueUSD;
              return {
                ...asset,
                change: Number(liveData.changePercent.toFixed(2)),
                valueUSD: calculatedValue,
                currentPrice: liveData.price,
                name: liveData.name || asset.name,
                chartData: liveData.chartData || asset.chartData,
                intradayData: liveData.intradayData || asset.intradayData,
              };
            }
            return asset;
          });
        }

        // Background: Fetch fresh data
        const symbolsQuery = currentAssets.map(a => mapToMarketSymbol(a.symbol)).join(',');

        fetch(`/api/market?symbols=${symbolsQuery}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (mounted && data?.results && Array.isArray(data.results)) {
              setCacheData(data);
              setAssets(prev => prev.map(asset => {
                const marketSym = mapToMarketSymbol(asset.symbol);
                const liveData = data.results.find((r: any) => r.symbol === marketSym);
                if (liveData) {
                  const calculatedValue = asset.shares ? (asset.shares * liveData.price) : asset.valueUSD;
                  return {
                    ...asset,
                    change: Number(liveData.changePercent.toFixed(2)),
                    valueUSD: calculatedValue,
                    currentPrice: liveData.price,
                    name: liveData.name || asset.name,
                    chartData: liveData.chartData || asset.chartData,
                    intradayData: liveData.intradayData || asset.intradayData,
                  };
                }
                return asset;
              }));
            }
          })
          .catch(e => {
            console.debug("Market fetch failed, using cached data");
          });

        return updated;
      });
    };

    const mapToMarketSymbol = (sym: string) => {
      if (['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'].includes(sym.toUpperCase())) return `${sym.toUpperCase()}-USD`;
      return sym.toUpperCase();
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 30000); // 30 seconds refresh

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isDataLoaded]);

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

  const formatMoney = (amountUSD: number, originalCurrency?: Currency, originalRate?: number) => {
    const rate = originalRate || exchangeRates[currency];
    const convertedAmount = amountUSD * rate;
    
    const formatter = new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
      style: "currency",
      currency: originalCurrency || currency,
      minimumFractionDigits: 2,
      currencyDisplay: "narrowSymbol",
    });

    let formatted = formatter.format(convertedAmount);
    // User-friendly fix for TH locale showing "US$" which looks chaotic.
    if (language === "th" && (originalCurrency || currency) === "USD") {
      formatted = formatted.replace("US$", "$");
    }
    
    // Ensure THB is always "฿" regardless of locale overrides, to save space and avoid line breaks
    formatted = formatted.replace("THB", "฿").replace("฿ ", "฿");
    
    return formatted;
  };

  const addAsset = async (assetData: Asset) => {
    const existingIdx = assets.findIndex(a => a.symbol.toUpperCase() === assetData.symbol.toUpperCase());
    if (!user) {
      if (existingIdx === -1) {
        const newAssets = [assetData, ...assets];
        setAssets(newAssets);
        localStorage.setItem("fintrack-assets", JSON.stringify(newAssets));
      }
      return;
    }
    try {
      const { data, error } = await db.assets.upsert({
        user_id: user.id,
        name: assetData.name,
        symbol: assetData.symbol,
        asset_type: assetData.allocation,
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
        change_percentage: assetData.change
      });
      if (data) {
        const newAsset = {
          ...assetData,
          id: data.id,
          is_active: data.is_active,
          isFavorite: data.is_favorite,
          sortOrder: data.sort_order
        };
        setAssets(prev => {
          const idx = prev.findIndex(a => a.symbol.toUpperCase() === newAsset.symbol.toUpperCase());
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

  const addTrade = async (tradeData: Omit<Trade, "id">) => {
    if (!user) {
      const nextId = trades.length > 0 ? Math.max(...trades.map(t => t.id)) + 1 : 1;
      const newTrades = [...trades, { ...tradeData, id: nextId }];
      setTrades(newTrades);
      localStorage.setItem("fintrack-trades", JSON.stringify(newTrades));
      return;
    }
    try {
      const { data, error } = await db.trades.insert({
        user_id: user.id,
        asset_id: null,
        asset_name: tradeData.asset,
        symbol: tradeData.asset,
        type: tradeData.type === "IMPORT" ? "BUY" : tradeData.type,
        amount_usd: tradeData.amountUSD,
        quantity: tradeData.shares || 0,
        price_at_execution: tradeData.pricePerUnit || 0,
        execution_date: new Date(tradeData.date).toISOString(),
        exchange_rate_at_time: tradeData.rateAtTime || 1,
        currency: tradeData.currency || "USD",
        total_cost: tradeData.amountUSD,
        status: "completed",
        notes: tradeData.sourceBucketId ? `Source Wallet ID: ${tradeData.sourceBucketId}` : null,
        tags: tradeData.tag ? [tradeData.tag] : []
      } as any);
      if (data) {
        setTrades(prev => [...prev, {
          ...tradeData,
          id: parseInt(data.id.split('-')[0], 16) || Date.now(),
          dbId: data.id
        }]);
      }
    } catch (err) {
      console.error("Failed to add trade to Supabase", err);
    }

    // Also log as cash activity for Cashflow tracking
    await addCashActivity({
      type: tradeData.type === "BUY" ? "EXPENSE" : "INCOME",
      amountUSD: tradeData.amountUSD,
      category: "investment",
      date: tradeData.date,
      note: `${tradeData.type} ${tradeData.asset} | ${tradeData.shares ? `${tradeData.shares} shares @ ${tradeData.pricePerUnit?.toFixed(2)}` : ""} | Total: ${tradeData.amountUSD.toFixed(2)} ${tradeData.sourceBucketId ? `| Wallet: ${moneyBuckets.find(b => b.id === tradeData.sourceBucketId)?.name || "Unknown"}` : ""}`
    });

    // If SELL, distribute the income to buckets automatically
    if (tradeData.type === "SELL" && moneyBuckets.length > 0) {
      const totalAllocated = moneyBuckets.reduce((acc, b) => acc + (b.targetPercent || 0), 0);
      if (totalAllocated > 0) {
        for (const bucket of moneyBuckets) {
          const pct = bucket.targetPercent || 0;
          const share = (pct / totalAllocated) * tradeData.amountUSD;
          if (share > 0) {
            updateMoneyBucket(bucket.id, { currentAmount: bucket.currentAmount + share });
            addBucketActivity({
              bucketId: bucket.id,
              bucketName: bucket.name,
              type: "deposit",
              amount: share,
              date: new Date().toISOString(),
              note: `SELL ${tradeData.asset} — ${t("income")}`,
            });
          }
        }
      }
    }
  };

  const removeAsset = async (symbol: string) => {
    const sym = symbol.toUpperCase();
    if (!user) {
      deletedAssetSymbols.current.add(sym);
      setAssets(prev => {
        const newAssets = prev.filter(a => a.symbol.toUpperCase() !== sym);
        localStorage.setItem("fintrack-assets", JSON.stringify(newAssets));
        return newAssets;
      });
      setTrades(prev => {
        const newTrades = prev.filter(t => t.asset.toUpperCase() !== sym);
        localStorage.setItem("fintrack-trades", JSON.stringify(newTrades));
        return newTrades;
      });
      return;
    }
    try {
      // Option B: Soft delete all rows matching symbol
      await db.assets.softDeleteBySymbol(user.id, sym);
      
      // Delete all trades for this asset
      await db.trades.deleteBySymbol(user.id, sym);
      
      deletedAssetSymbols.current.add(sym);
      setAssets(prev => prev.filter(a => a.symbol.toUpperCase() !== sym));
      setTrades(prev => prev.filter(t => t.asset.toUpperCase() !== sym));
    } catch (err) {
      console.error("Failed to remove asset from Supabase", err);
    }
  };

  const updateAsset = async (symbol: string, updates: Partial<Asset>) => {
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
        if (updates.allocation !== undefined) supabaseUpdates.asset_type = updates.allocation;
        if (updates.is_active !== undefined) supabaseUpdates.is_active = updates.is_active;
        
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

  const removeTrade = async (id: number) => {
    const tradeToRemove = trades.find(t => t.id === id);
    if (!user || !tradeToRemove?.dbId) {
      setTrades(prev => {
        const newTrades = prev.filter(t => t.id !== id);
        localStorage.setItem("fintrack-trades", JSON.stringify(newTrades));
        return newTrades;
      });
      return;
    }
    try {
      await db.trades.delete(tradeToRemove.dbId);
      setTrades(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error("Failed to remove trade from Supabase", err);
    }
  };

  const addMoneyBucket = async (bucket: Omit<MoneyBucket, 'id'>) => {
    if (!user) {
      const id = Date.now().toString();
      setMoneyBuckets(prev => {
        const newBuckets = [...prev, { ...bucket, id }];
        localStorage.setItem("fintrack-buckets", JSON.stringify(newBuckets));
        return newBuckets;
      });
      return;
    }
    try {
      const { data } = await db.buckets.insert({
        user_id: user.id,
        name: bucket.name,
        target_percent: bucket.targetPercent,
        current_amount: bucket.currentAmount,
        color: bucket.color,
        icon: bucket.icon,
        linked_to_expenses: bucket.linkedToExpenses || false
      } as any);
      if (data) {
        setMoneyBuckets(prev => [...prev, { ...bucket, id: data.id }]);
      }
    } catch (err) {
      console.error("Failed to add bucket to Supabase", err);
    }
  };

  const updateMoneyBucket = async (id: string, updates: Partial<MoneyBucket>) => {
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
      if (updates.targetPercent !== undefined) supabaseUpdates.target_percent = updates.targetPercent;
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
    if (!user) {
      const id = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);
      setBucketActivities(prev => {
        const newActivities = [{ ...activity, id }, ...prev];
        localStorage.setItem("fintrack-bucket-activities", JSON.stringify(newActivities));
        return newActivities;
      });
      return;
    }
    try {
      const { data } = await db.bucketActivities.insert({
        user_id: user.id,
        bucket_id: activity.bucketId,
        type: activity.type,
        amount: activity.amount,
        note: activity.note || null,
        date: activity.date
      });
      if (data) {
        setBucketActivities(prev => [{ ...activity, id: data.id }, ...prev]);
      }
    } catch (err) {
      console.error("Failed to add bucket activity to Supabase", err);
    }
  };

  const addCashActivity = async (activityData: Omit<CashActivity, "id">) => {
    if (!user) {
      const id = Math.random().toString(36).substr(2, 9);
      setCashActivities(prev => {
        const newActivities = [...prev, { ...activityData, id }];
        localStorage.setItem("fintrack-cash-activities", JSON.stringify(newActivities));
        return newActivities;
      });
      return;
    }
    try {
      const { data } = await db.cashActivities.insert({
        user_id: user.id,
        type: activityData.type,
        amount: activityData.amountUSD,
        category: activityData.category,
        note: activityData.note || null,
        date: typeof activityData.date === 'string' && activityData.date.length === 10
          ? activityData.date
          : new Date(activityData.date).toISOString().split('T')[0]
      } as any);
      if (data) {
        setCashActivities(prev => [...prev, { ...activityData, id: data.id }]);
      }
    } catch (err) {
      console.error("Failed to add cash activity to Supabase", err);
    }
  };

  const removeCashActivity = async (id: string) => {
    if (!user) {
      setCashActivities(prev => {
        const newActivities = prev.filter(a => a.id !== id);
        localStorage.setItem("fintrack-cash-activities", JSON.stringify(newActivities));
        return newActivities;
      });
      return;
    }
    try {
      await db.cashActivities.delete(id);
      setCashActivities(prev => prev.filter(a => a.id !== id));
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
        asset_id: null,
        asset_name: t.asset,
        symbol: t.asset,
        type: t.type === "IMPORT" ? "BUY" : t.type,
        amount_usd: t.amountUSD,
        quantity: t.shares || 0,
        price_at_execution: t.pricePerUnit || 0,
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
      }
    } catch (err) {
      console.error("Failed to bulk add trades to Supabase", err);
    }
  };

  const addTradeFromBucket = async (tradeData: Omit<Trade, 'id'>, bucketId: string) => {
    const bucket = moneyBuckets.find(b => b.id === bucketId);
    if (!bucket) return;
    if (tradeData.amountUSD > bucket.currentAmount) {
      addToast(t("amountExceedsBalance"), 'error');
      return;
    }

    // Add the trade
    await addTrade({ ...tradeData, sourceBucketId: bucketId });

    // Deduct from bucket
    await updateMoneyBucket(bucketId, { currentAmount: bucket.currentAmount - tradeData.amountUSD });

    // Log activity
    await addBucketActivity({
      bucketId: bucket.id,
      bucketName: bucket.name,
      type: 'invest',
      amount: tradeData.amountUSD,
      date: new Date().toISOString(),
      note: `Trade ${tradeData.asset} — ${t('deductedFromBucket')}`,
    });
  };


  // Computed P/L metrics
  const totalInvested = React.useMemo(() => {
    return assets.reduce((acc, a) => acc + (a.avgCost || 0) * (a.shares || 0), 0);
  }, [assets]);

  const totalUnrealizedPL = React.useMemo(() => {
    const portfolioValue = assets.reduce((acc, a) => acc + a.valueUSD, 0);
    const costBasis = assets.reduce((acc, a) => acc + (a.avgCost || 0) * (a.shares || 0), 0);
    return portfolioValue - costBasis;
  }, [assets]);

  const totalRealizedPL = React.useMemo(() => {
    return assets.reduce((acc, a) => acc + (a.realizedPL || 0), 0);
  }, [assets]);

  const totalDividends = React.useMemo(() => {
    return assets.reduce((acc, a) => acc + (a.dividendTotal || 0), 0);
  }, [assets]);

  return (
    <AppContext.Provider value={{ 
      language, 
      currency, 
      setLanguage, 
      setCurrency, 
      t, 
      formatMoney,
      exchangeRates,
      trades,
      addTrade,
      cashActivities,
      addCashActivity,
      removeCashActivity,
      allocations,
      updateAllocation,
      assets,
      addAsset,
      bulkAddTrades,
      netWorthHistory,
      userProfile,
      setUserProfile,
      fetchAssetMarketData,
      removeAsset,
      updateAsset,
      reorderAssets,
      removeTrade,
      toasts,
      addToast,
      removeToast,
      darkMode,
      setDarkMode,
      notifications,
      addNotification,
      markNotificationRead,
      clearNotifications,
      notifPreferences,
      setNotifPreferences,
      moneyBuckets,
      addMoneyBucket,
      updateMoneyBucket,
      removeMoneyBucket,
      bucketActivities,
      addBucketActivity,
      addTradeFromBucket,
      dashboardWidgets,
      setDashboardWidgets,
      totalInvested,
      totalUnrealizedPL,
      totalRealizedPL,
      totalDividends
    }}>
      {children}
      
      {/* Global Toast Container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className="pointer-events-auto bg-[#1C1B1B] text-white border border-white/10 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-3 transition-all animate-in slide-in-from-right-8 fade-in"
          >
            {toast.type === 'success' && <div className="w-2 h-2 rounded-full bg-[#4EDEA3]" />}
            {toast.type === 'warning' && <div className="w-2 h-2 rounded-full bg-[#E9C349]" />}
            {toast.type === 'error' && <div className="w-2 h-2 rounded-full bg-[#FFB4AB]" />}
            {toast.type === 'info' && <div className="w-2 h-2 rounded-full bg-[#ADC6FF]" />}
            <p className="text-sm font-bold">{toast.message}</p>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
