"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "th";
export type Currency = "USD" | "THB" | "JPY" | "EUR";

export interface Trade {
  id: number;
  asset: string;
  type: "BUY" | "SELL";
  amountUSD: number;
  date: string;
  rateAtTime: number;
  currency: string;
}

export interface Allocation {
  label: string;
  value: number;
  color: string;
}

export interface Asset {
  name: string;
  symbol: string;
  valueUSD: number;
  change: number;
  allocation: string;
  shares?: number; // Added to enable accurate real-time portfolio tracking
  avgCost?: number; // Added to track cost basis for PnL
  chartData?: {time: number, price: number}[]; // Stores intraday or historical chart
  intradayData?: {time: number, price: number}[]; // Intraday data for 1d sparkline
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
  allocations: Allocation[];
  updateAllocation: (label: string, value: number) => void;
  assets: Asset[];
  addAsset: (asset: Asset) => void;
  bulkAddTrades: (trades: Omit<Trade, "id">[]) => void;
  netWorthHistory: { date: string; value: number }[];
  userProfile?: { email: string; avatarUrl: string; initials: string };
  setUserProfile: (profile: { email: string; avatarUrl: string; initials: string } | undefined) => void;
  fetchAssetMarketData: (symbol: string) => Promise<any>;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    dashboard: "Dashboard",
    portfolio: "Portfolio",
    settings: "Settings",
    rebalance: "Rebalance",
    management_engine: "MANAGEMENT ENGINE",
    target_allocation: "Target Allocation",
    current_vs_target: "Current vs Target Drift",
    suggested_trades: "Suggested Trade Execution",
    execute_all: "Execute All Trades",
    total_impact: "Total Impact",
    markets: "Markets",
    insights: "Insights",
    rebalance_now: "REBALANCE",
    calculate: "CALCULATE REBALANCE",
    asset_class: "Asset Class",
    current: "Current",
    target: "Target",
    delta: "Delta",
    history: "Transaction History",
    profit_loss: "Profit/Loss (Historical)",
    calendar: "Calendar",
    buy: "BUY",
    sell: "SELL",
    add_trade: "Add Trade",
    asset_name: "Asset Name",
    amount_usd: "Amount (USD)",
    confirm: "Confirm",
    cancel: "Cancel",
    search_placeholder: "Search assets, trades...",
    import_csv: "Import CSV",
    upload_csv_desc: "Upload a .csv file to bulk import your trade history.",
    select_file: "Select File",
    import_success: "Trades imported successfully!",
    transactions: "Transactions",
    pricing: "Pricing",
    premium_tier: "Premium Tier",
    market_price_and_cost: "Price / Avg Cost",
    intraday_trend: "Intraday Trend",
    holdings: "Holdings",
    total_return: "Total Return",
    elite_access: "Elite Access",
    upgrade_desc: "Upgrade to Gold for AI-powered insights.",
    upgrade_now: "Upgrade Now",
    support: "Support",
    logout: "Logout",
    
    // Landing Page
    features_nav: "Features",
    pricing_nav: "Pricing",
    login_btn: "Login",
    get_started_btn: "Get Started",
    go_to_dashboard: "Go to Dashboard",
    future_of_wealth: "The Future of Wealth Management",
    master_your: "Master Your",
    financial_destiny: "Financial Destiny",
    hero_desc: "Unified investment intelligence for the modern era. Track, analyze, and optimize your entire portfolio in one sophisticated interface.",
    start_your_journey: "Start Your Journey",
    view_pricing: "View Pricing",
    engineered_for_excellence: "Engineered for Excellence",
    everything_you_need: "Everything you need to dominate the markets",
    real_time_tracking: "Real-time Tracking",
    real_time_desc: "Monitor your assets across all exchanges and wallets with zero latency.",
    institutional_security: "Institutional Security",
    security_desc: "Military-grade encryption and multi-factor authentication for your peace of mind.",
    ai_insights_feature: "AI Insights",
    ai_desc: "Leverage advanced machine learning to identify trends and optimize your strategy.",
    global_markets_feature: "Global Markets",
    global_desc: "Access data from over 100+ global exchanges and 10,000+ financial instruments.",
    asset_allocation_feature: "Asset Allocation",
    allocation_desc: "Visualize your diversification and rebalance your portfolio with one click.",
    advanced_reporting: "Advanced Reporting",
    reporting_desc: "Generate professional-grade tax and performance reports in seconds.",
    choose_your_tier: "Choose Your Tier",
    transparent_pricing: "Transparent pricing for every stage of growth",
    starter: "Starter",
    starter_desc: "Perfect for individuals just starting their investment journey.",
    pro: "Pro",
    pro_desc: "Advanced tools for serious investors looking for an edge.",
    enterprise: "Enterprise",
    enterprise_desc: "Custom solutions for institutional-grade portfolio management.",
    most_popular: "Most Popular",
    per_month: "/month",
    start_for_free: "Start for Free",
    contact_sales: "Contact Sales",
    ready_to_redefine: "Ready to redefine your",
    financial_future: "financial future?",
    join_thousands: "Join thousands of elite investors who trust FinTrack for their portfolio management.",
    get_started_now: "Get Started Now",
    product: "Product",
    company: "Company",
    about: "About",
    blog: "Blog",
    careers: "Careers",
    contact: "Contact",
    security: "Security",
    privacy_policy_doc: "Privacy Policy",
    terms_of_service_doc: "Terms of Service",
    footer_tagline: "The ultimate portfolio management platform for the modern investor. Precision, security, and intelligence in one unified dashboard.",
    all_rights_reserved: "All rights reserved.",

    feature_starter_1: "Up to 5 Portfolio Assets",
    feature_starter_2: "Basic Performance Tracking",
    feature_starter_3: "Daily Market Updates",
    feature_starter_4: "Community Support",
    feature_starter_5: "Standard Security",
    feature_pro_1: "Unlimited Portfolio Assets",
    feature_pro_2: "Real-time Analytics",
    feature_pro_3: "AI-Powered Insights",
    feature_pro_4: "Priority Support",
    feature_pro_5: "Advanced Risk Analysis",
    feature_pro_6: "Custom Export Formats",
    feature_ent_1: "Multi-User Collaboration",
    feature_ent_2: "Dedicated Account Manager",
    feature_ent_3: "Custom API Access",
    feature_ent_4: "White-label Reports",
    feature_ent_5: "SLA Guarantee",
    feature_ent_6: "Advanced Compliance Tools",

    // Chart Time Periods
    chart_1d: "1D",
    chart_5d: "5D",
    chart_1w: "1W",
    chart_1m: "1M",
    chart_6m: "6M",
    chart_ytd: "YTD",
    chart_1y: "1Y",
    chart_5y: "5Y",
    performance_title: "Performance",
    live_price: "Live Price",
    avg_cost: "Avg Cost",
    close: "Close",
    investment_journey: "Investment Journey",
    initial_purchase: "Initial Purchase",
    milestone_10: "+10% Milestone",
    milestone_25: "+25% Milestone",
    current_position: "Current Position",
    target_50: "Target: +50%",
    bought_shares: "Bought {shares} shares at {price}",
    holding_shares: "Holding {shares} shares worth {value}",
    first_milestone: "First major profit milestone reached",
    strong_performance: "Strong performance milestone",
    target_price: "Target price: {price}",
    no_historical_data: "No historical data available",
  },
  th: {
    dashboard: "แผงควบคุม",
    portfolio: "พอร์ตโฟลิโอ",
    settings: "ตั้งค่า",
    rebalance: "ปรับสมดุล",
    management_engine: "ระบบจัดการการลงทุน",
    target_allocation: "เป้าหมายการจัดสรรสินทรัพย์",
    current_vs_target: "การเบี่ยงเบนจากเป้าหมาย",
    suggested_trades: "รายการซื้อขายที่แนะนำ",
    execute_all: "ดำเนินการซื้อขายทั้งหมด",
    total_balance: "ยอดเงินคงเหลือ",
    total_net_worth: "ยอดทรัพย์สินสุทธิ",
    quick_actions: "เมนูด่วน",
    quick_transfer: "โอนเงินด่วน",
    recent_activity: "กิจกรรมล่าสุด",
    view_all: "ดูทั้งหมด",
    portfolio_health: "สุขภาพพอร์ต",
    monthly_profit: "กำไร/ขาดทุน รายเดือน",
    asset_allocation: "สัดส่วนสินทรัพย์",
    value: "มูลค่า",
    share: "สัดส่วน",
    market_cap: "มูลค่าตลาด",
    "24h_change": "การเปลี่ยนแปลง 24 ชม.",
    notifications: "การแจ้งเตือน",
    profile_settings: "การตั้งค่าโปรไฟล์",
    global_performance: "ผลการดำเนินงาน",
    growth_velocity: "อัตราการเติบโต",
    security_logs: "บันทึกความปลอดภัย",
    vault_activity: "กิจกรรมพอร์ตโฟลิโอ",
    manual_entry: "บันทึกด้วยตนเอง",
    bulk_import: "นำเข้าข้อมูลทีละมาก",
    csv_format_example: "ตัวอย่างรูปแบบ CSV",
    view_full_audit: "ดูประวัติทั้งหมด",
    optimal_rebalancing_msg: "\"ระบบตั้งค่าจุดแจ้งเตือน Rebalance ไว้ที่ความคลาดเคลื่อน 3% ระบบจะแนะนำการซื้อขายเมื่อสัดส่วนเกินขีดจำกัดนี้เท่านั้น\"",
    market_volatility_msg: "ความผันผวนของตลาดต่ำ เป็นช่วงเวลาที่เหมาะสำหรับการปรับสมดุลพอร์ต",
    harvesting_gains: "ทำกำไรได้",
    reduce_over_exposure: "ลดความเสี่ยงจากการถือครองมากเกินไป",
    increase_allocation: "เพิ่มสัดส่วนการลงทุน",
    rate_at_trade: "อัตราแลกเปลี่ยนขณะทำรายการ",
    current_rate: "อัตราแลกเปลี่ยนปัจจุบัน",
    initial_investment: "เงินลงทุนเริ่มต้น",
    current_value: "มูลค่าปัจจุบัน",
    asset_inventory: "คลังสินทรัพย์",
    add_asset: "เพิ่มสินทรัพย์",
    allocation_by_risk: "สัดส่วนตามความเสี่ยง",
    high_risk: "ความเสี่ยงสูง",
    moderate_risk: "ปานกลาง",
    conservative_risk: "ความเสี่ยงต่ำ",
    asset: "สินทรัพย์",
    performance_audit: "ตรวจสอบผลการดำเนินงาน",
    monthly_win_rate: "อัตราการชนะรายเดือน",
    max_drawdown: "การขาดทุนสูงสุด",
    net_fintrack_profit: "กำไรสุทธิ FinTrack",
    audit_detail: "รายละเอียดการตรวจสอบ",
    verified: "ตรวจสอบแล้ว",
    spot_trade: "การซื้อขาย Spot",
    finalized: "สรุปยอดแล้ว",
    download_full_ledger: "ดาวน์โหลดบัญชีทั้งหมด",
    market_correlations: "ความสัมพันธ์ของตลาด",
    macro_alignment: "ความสอดคล้องระดับมหภาค",
    risk_exposure: "ความเสี่ยงที่เปิดรับ",
    trades_count: "รายการ",
    select_date: "เลือกวันที่",
    no_activity: "ไม่มีกิจกรรมในวันนี้",
    transactions: "ธุรกรรมเงินสด",
    manage_cash_flow: "จัดการกระแสเงินสด",
    export_csv: "ส่งออก CSV",
    add_new: "เพิ่มรายการ",
    total_income: "รายรับรวม",
    total_expenses: "รายจ่ายรวม",
    search_transactions: "ค้นหาธุรกรรม...",
    all: "ทั้งหมด",
    income: "รายรับ",
    expense: "รายจ่าย",
    date: "วันที่",
    description: "รายละเอียด",
    category: "หมวดหมู่",
    amount: "จำนวนเงิน",
    actions: "การจัดการ",
    loading_transactions: "กำลังโหลดข้อมูล...",
    no_transactions_found: "ไม่พบข้อมูลธุรกรรม",
    add_transaction: "เพิ่มธุรกรรม",
    confirm_transaction: "ยืนยันการทำรายการ",
    transaction_added: "ทำรายการสำเร็จ",
    transaction_deleted: "ลบรายการแล้ว",
    imported_transactions: "นำเข้าข้อมูลสำเร็จ",
    total_impact: "ผลกระทบรวม",
    
    // Landing Page
    features_nav: "ฟีเจอร์",
    pricing_nav: "ราคา",
    login_btn: "เข้าสู่ระบบ",
    get_started_btn: "เริ่มต้นใช้งาน",
    go_to_dashboard: "เข้าสู่แดชบอร์ด",
    future_of_wealth: "อนาคตของการบริหารความมั่งคั่ง",
    master_your: "ควบคุม",
    financial_destiny: "อนาคตทางการเงินของคุณ",
    hero_desc: "ระบบอัจฉริยะแบบบูรณาการสำหรับการลงทุนยุคใหม่ ติดตาม วิเคราะห์ และปรับพอร์ทในจอเดียว",
    start_your_journey: "เริ่มต้นการเดินทาง",
    view_pricing: "ดูราคา",
    engineered_for_excellence: "ออกแบบมาเพื่อความเป็นเลิศ",
    everything_you_need: "ทุกสิ่งที่คุณต้องการเพื่อคว้าชัยในตลาด",
    real_time_tracking: "ติดตามผลแบบเรียลไทม์",
    real_time_desc: "ติดตามสินทรัพย์ข้ามกระดานเทรดและกระเป๋าเงินได้อย่างลื่นไหลไร้ความหน่วง",
    institutional_security: "ความปลอดภัยขั้นสูง",
    security_desc: "เข้ารหัสระดับกองทัพและยืนยันตัวตนหลายชั้นเพื่อความอุ่นใจอย่างที่สุด",
    ai_insights_feature: "เจาะลึกข้อมูลด้วย AI",
    ai_desc: "ใช้ Machine Learning ค้นหาแนวโน้มและปรับกลยุทธ์ของคุณดั่งเซียน",
    global_markets_feature: "การเงินทั่วโลกระดับปรมาจารย์",
    global_desc: "เข้าถึงข้อมูลจากกว่า 100+ แหล่งข้อมูลทั่วโลกและตราสารนับหมื่น",
    asset_allocation_feature: "กระจายพอร์ตระดับบอส",
    allocation_desc: "ปรับพอร์ตให้สมดุลและกระจายความเสี่ยงด้วยเทคโนโลยีชั้นยอด",
    advanced_reporting: "ระบบรายงานชั้นครู",
    reporting_desc: "สร้างรายงานระดับโปรและผลประกอบการได้ฉับไว",
    choose_your_tier: "เลือกแพ็คเกจของคุณ",
    transparent_pricing: "ราคาที่โปร่งใสสำหรับการลงทุนทุกระดับ",
    starter: "Starter",
    starter_desc: "เหมาะสำหรับรายย่อยที่เพิ่งเริ่มลงทุนและต้องการเครื่องมือช่วยเหลือ",
    pro: "Pro",
    pro_desc: "เครื่องมือขั้นสูงสำหรับนักลงทุนมืออาชีพที่มองหาความได้เปรียบ",
    enterprise: "Enterprise",
    enterprise_desc: "โซลูชันยกระดับปรับแต่งได้อิสระเพื่อบริหารพอร์ตระดับสถาบัน",
    most_popular: "ยอดนิยม",
    per_month: "/เดือน",
    start_for_free: "เริ่มใช้งานฟรี",
    contact_sales: "ติดต่อทีมขาย",
    ready_to_redefine: "พร้อมรึยังที่จะยกระดับ",
    financial_future: "อนาคตทั้งหมดของคุณ?",
    join_thousands: "เข้าร่วมกับนักลงทุนระดับแนวหน้านับพันที่ไว้วางใจให้ FinTrack โอบอุ้มพอร์ทให้",
    get_started_now: "เริ่มต้นตอนนี้เลย",
    product: "ผลิตภัณฑ์",
    company: "บริษัท",
    about: "เกี่ยวกับเรา",
    blog: "อัปเดต",
    careers: "ร่วมงานกับเรา",
    contact: "ติดต่อเรา",
    security: "ความปลอดภัย",
    privacy_policy_doc: "นโยบายความเป็นส่วนตัว",
    terms_of_service_doc: "ข้อตกลงในการใช้งาน",
    footer_tagline: "สุดยอดแพลตฟอร์มบริหารพอร์ตสำหรับผู้ลงทุนยุคใหม่ แม่นยำ ปลอดภัย และอัจฉริยะในแดชบอร์ดเดียว",
    all_rights_reserved: "สงวนลิขสิทธิ์",

    feature_starter_1: "รองรับสูงสุด 5 สินทรัพย์",
    feature_starter_2: "ติดตามผลประกอบการพื้นฐาน",
    feature_starter_3: "อัปเดตตลาดรายวัน",
    feature_starter_4: "สนับสนุนโดยคอมมูนิตี้",
    feature_starter_5: "ความปลอดภัยแบบมาตรฐาน",
    feature_pro_1: "รองรับสินทรัพย์ไร้รันิมิต",
    feature_pro_2: "วิเคราะห์เรียลไทม์",
    feature_pro_3: "เจาะลึกข้อมูลด้วยขุมพลัง AI",
    feature_pro_4: "ทีมซัพพอร์ตด่วนพิเศษ",
    feature_pro_5: "วิเคราะห์ความเสี่ยงประเมินลึก",
    feature_pro_6: "รูปแบบส่งออกแบบอิสระตามใจ",
    feature_ent_1: "ร่วมจัดการพอร์ตหลายผู้ใช้งานรวด",
    feature_ent_2: "ผู้จัดการบัญชีบิลส่วนพระองค์",
    feature_ent_3: "เชื่อมต่อประยุกต์ API อิสระกว้าง",
    feature_ent_4: "รายงานแบรนด์ตัวเองระดับมือโปร",
    feature_ent_5: "การันตีระบบเสถียรดั่งเพชร 99%",
    feature_ent_6: "เครื่องมือระดับสถาบันระดับเซียน",

    // Chart Time Periods
    chart_1d: "1วัน",
    chart_5d: "5วัน",
    chart_1w: "1สด.",
    chart_1m: "1ด.",
    chart_6m: "6ด.",
    chart_ytd: "YTD",
    chart_1y: "1ปี",
    chart_5y: "5ปี",
    performance_title: "ผลการดำเนินงาน",
    live_price: "ราคาปัจจุบัน",
    avg_cost: "ต้นทุนเฉลี่ย",
    close: "ปิด",
    investment_journey: "การลงทุนของคุณ",
    initial_purchase: "ซื้อครั้งแรก",
    milestone_10: "เหนือเป้า +10%",
    milestone_25: "เหนือเป้า +25%",
    current_position: "สถานะปัจจุบัน",
    target_50: "เป้าหมาย: +50%",
    bought_shares: "ซื้อ {shares} หุ้น ที่ราคา {price}",
    holding_shares: "ถือ {shares} หุ้น มูลค่า {value}",
    first_milestone: "บรรลุเป้าหมายกำไรครั้งแรก",
    strong_performance: "ผลงานแกร่งผ่านเป้า",
    target_price: "ราคาเป้าหมาย: {price}",
    no_historical_data: "ไม่มีข้อมูลย้อนหลัง",

    insights: "ข้อมูลเชิงลึก",
    rebalance_now: "ปรับสมดุล",
    calculate: "คำนวณการปรับสมดุล",
    asset_class: "ประเภทสินทรัพย์",
    current: "ปัจจุบัน",
    target: "เป้าหมาย",
    delta: "ส่วนต่าง",
    history: "ประวัติการทำรายการ",
    profit_loss: "กำไร/ขาดทุน (ตามอัตราแลกเปลี่ยนย้อนหลัง)",
    calendar: "ปฏิทิน",
    buy: "ซื้อ",
    sell: "ขาย",
    add_trade: "เพิ่มรายการ",
    asset_name: "ชื่อสินทรัพย์",
    amount_usd: "จำนวน (USD)",
    confirm: "ยืนยัน",
    cancel: "ยกเลิก",
    search_placeholder: "ค้นหาสินทรัพย์, รายการ...",
    import_csv: "นำเข้า CSV",
    upload_csv_desc: "อัปโหลดไฟล์ .csv เพื่อนำเข้าประวัติการซื้อขายจำนวนมาก",
    select_file: "เลือกไฟล์",
    import_success: "นำเข้าข้อมูลสำเร็จ!",
    transactions: "ธุรกรรมเงิน",
    pricing: "ราคาแพ็กเกจ",
    premium_tier: "สมาชิกพรีเมียม",
    market_price_and_cost: "ราคาปัจจุบัน / ต้นทุน",
    intraday_trend: "แนวโน้มรายวัน",
    holdings: "จำนวนถือครอง",
    total_return: "ผลตอบแทนรวม",
    elite_access: "สิทธิพิเศษขั้นสูงสุด",
    upgrade_desc: "อัปเกรดเป็น Gold เพื่อรับบทวิเคราะห์จาก AI",
    upgrade_now: "อัปเกรดเลย",
    support: "ศูนย์ช่วยเหลือ",
    logout: "ออกจากระบบ",
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

  // Initialize lang from localStorage safely on client side
  useEffect(() => {
    try {
      const stored = localStorage.getItem("preferred-lang") as Language;
      if (stored === "en" || stored === "th") {
        setLanguage(stored);
      }
    } catch {}
  }, []);

  // Sync HTML lang attribute and save to localStorage
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("preferred-lang", language);
    } catch {}
  }, [language]);

  const [trades, setTrades] = useState<Trade[]>([
    { id: 1, asset: "BTC", type: "BUY", amountUSD: 5000, date: "2024-01-15", rateAtTime: 34.5, currency: "THB" },
    { id: 2, asset: "ETH", type: "BUY", amountUSD: 3000, date: "2024-02-10", rateAtTime: 35.2, currency: "THB" },
  ]);
  const [allocations, setAllocations] = useState<Allocation[]>([
    { label: "Equities", value: 60, color: "#ADC6FF" },
    { label: "Fixed Income", value: 25, color: "#E9C349" },
    { label: "Alternatives", value: 10, color: "#4EDEA3" },
    { label: "Cash", value: 5, color: "#6B7280" },
  ]);
  const [assets, setAssets] = useState<Asset[]>([
    { name: "Apple Inc.", symbol: "AAPL", valueUSD: 45200, change: +2.4, allocation: "15.2%", shares: 300.33, avgCost: 110.50 },
    { name: "Microsoft Corp.", symbol: "MSFT", valueUSD: 38100, change: +1.1, allocation: "12.8%", shares: 92.45, avgCost: 280.00 },
    { name: "Bitcoin", symbol: "BTC", valueUSD: 24500, change: -4.2, allocation: "8.2%", shares: 0.354, avgCost: 35000 },
    { name: "Vanguard Total Bond", symbol: "BND", valueUSD: 18900, change: -0.1, allocation: "6.4%", shares: 258.9, avgCost: 75.00 },
    { name: "Tesla, Inc.", symbol: "TSLA", valueUSD: 12400, change: +5.8, allocation: "4.2%", shares: 62.5, avgCost: 250.00 },
  ]);

  const [netWorthHistory] = useState([
    { date: "2023-10", value: 1840000 },
    { date: "2023-11", value: 1920000 },
    { date: "2023-12", value: 2150000 },
    { date: "2024-01", value: 2420000 },
    { date: "2024-02", value: 2680000 },
    { date: "2024-03", value: 2840192 },
  ]);

  const [userProfile, setUserProfile] = useState<{ email: string; avatarUrl: string; initials: string } | undefined>();

  // Helper to read cookie by name
  const getCookie = (name: string): string | null => {
    if (typeof document === "undefined") return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
    return null;
  };

  // Use useEffect to try to get the user email securely, or generate default avatarUrl
  useEffect(() => {
    try {
      // Priority 1: Check for user_email cookie (set by OAuth callback)
      const userEmailCookie = getCookie("user_email");
      // Priority 2: Check localStorage for remembered email
      const rememberedEmail = localStorage.getItem("remembered-email");

      const email = userEmailCookie || rememberedEmail;

      if (email) {
        const initials = email.substring(0, 2).toUpperCase();
        setUserProfile({
          email: email,
          initials,
          avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${email}&backgroundColor=1C1B1B`,
        });
        // Sync to localStorage for future page loads
        if (userEmailCookie && !rememberedEmail) {
          localStorage.setItem("remembered-email", userEmailCookie);
        }
        // Clear the cookie after reading (one-time use)
        if (userEmailCookie) {
          document.cookie = "user_email=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        }
      } else {
        setUserProfile({
          email: "user@fintrack.app",
          initials: "US",
          avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=fintrack&backgroundColor=1C1B1B`,
        });
      }
    } catch (e) {
      // Ignored
    }
  }, []);

  // Fetch Live Market Data
  useEffect(() => {
    let mounted = true;
    const fetchMarketData = async () => {
      try {
        const mapToMarketSymbol = (sym: string) => {
          if (['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'].includes(sym.toUpperCase())) return `${sym.toUpperCase()}-USD`;
          return sym.toUpperCase();
        };

        // We fetch for whatever is currently in the assets array initially
        setAssets(currentAssets => {
          if (currentAssets.length === 0) return currentAssets;
          
          const symbolsQuery = currentAssets.map(a => mapToMarketSymbol(a.symbol)).join(',');
          
          fetch(`/api/market?symbols=${symbolsQuery}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (mounted && data?.results && Array.isArray(data.results)) {
                setAssets(prev => prev.map(asset => {
                  const marketSym = mapToMarketSymbol(asset.symbol);
                  const liveData = data.results.find((r: any) => r.symbol === marketSym);
                  if (liveData) {
                    // Adjust valueUSD if shares exist to be accurate, else just update change percentage
                    const calculatedValue = asset.shares ? (asset.shares * liveData.price) : asset.valueUSD;
                    return {
                      ...asset,
                      change: Number(liveData.changePercent.toFixed(2)),
                      valueUSD: calculatedValue,
                      name: liveData.name || asset.name,
                      chartData: liveData.chartData || asset.chartData,
                      intradayData: liveData.intradayData || asset.intradayData,
                    };
                  }
                  return asset;
                }));
              }
            }).catch(e => console.error("Market APi Error", e));
            
          return currentAssets;
        });
      } catch (err) {
        // Silently fail UI demo if external API breaks
      }
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 60000); // 1 minute auto-refresh

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

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
    });

    let formatted = formatter.format(convertedAmount);
    // User-friendly fix for TH locale showing "US$" which looks chaotic.
    if (language === "th" && (originalCurrency || currency) === "USD") {
      formatted = formatted.replace("US$", "$");
    }
    return formatted;
  };

  const addTrade = (trade: Omit<Trade, "id">) => {
    setTrades(prev => [{ ...trade, id: Date.now() }, ...prev]);
  };

  const updateAllocation = (label: string, value: number) => {
    setAllocations(prev => prev.map(a => a.label === label ? { ...a, value } : a));
  };

  const addAsset = (asset: Asset) => {
    setAssets(prev => [asset, ...prev]);
  };

  const bulkAddTrades = (newTrades: Omit<Trade, "id">[]) => {
    const tradesWithIds = newTrades.map((t, i) => ({ ...t, id: Date.now() + i }));
    setTrades(prev => [...tradesWithIds, ...prev]);
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
      trades,
      addTrade,
      allocations,
      updateAllocation,
      assets,
      addAsset,
      bulkAddTrades,
      netWorthHistory,
      userProfile,
      setUserProfile,
      fetchAssetMarketData
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
