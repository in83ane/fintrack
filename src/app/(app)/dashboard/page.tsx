"use client";

import { FinanceIcon } from "@/src/components/FinanceIcon";
import React, { useState, useMemo, useRef, useCallback } from "react";
import { TrendingUp, TrendingDown, Plus, Briefcase, Wallet, BarChart3, ArrowUpRight, ArrowDownLeft, Download, Upload, FileSpreadsheet, CheckCircle2, CircleAlert } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useApp } from "@/src/context/AppContext";
import { AddAssetModal } from "@/src/components/AddAssetModal";
import { AddCashflowModal } from "@/src/components/AddCashflowModal";
import { AnimatedNumber } from "@/src/components/AnimatedNumber";
import { Modal } from "@/src/components/Modal";
import * as XLSX from "xlsx";
import { formatPnL, getPnLColor, formatPercent } from "@/src/lib/format";
import { calcMaxDrawdown, calcProfitFactor } from "@/src/lib/finance";
import { useRouter } from "next/navigation";

// ─── Net Worth Sparkline ──────────────────────────────────────────────────────

function TopMoverLogo({ symbol }: { symbol: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]" aria-hidden="true">
    {failed ? <span className="text-[10px] font-bold text-[#ADC6FF]">{symbol.slice(0, 2)}</span> : (
      <img src={`https://assets.parqet.com/logos/symbol/${encodeURIComponent(symbol)}?format=png`} alt="" width={32} height={32} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-contain p-1" />
    )}
  </span>;
}

interface NetWorthPoint {
  date: string;
  value: number;
}

type ImportStatus = { type: 'idle' | 'ready' | 'importing' | 'success' | 'error'; message: string };

type StockImportRow = {
  row: number;
  symbol: string;
  date: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND';
  shares: number;
  price: number;
  fees: number;
  currency: 'USD' | 'THB';
  broker?: string;
  portfolioId?: string;
};

const IMPORT_FILE_TYPES = '.xlsx,.xlsm,.xls';

function normaliseImportHeader(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
}

function readImportNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function readImportText(row: Record<string, unknown>, aliases: string[]) {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.includes(normaliseImportHeader(key))) return String(value ?? '').trim();
  }
  return '';
}

function readImportValue(row: Record<string, unknown>, aliases: string[]) {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.includes(normaliseImportHeader(key))) return value;
  }
  return '';
}

function readImportDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString();
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normaliseTradeAction(value: string): StockImportRow['type'] | null {
  const action = value.trim().toUpperCase();
  if (['BUY', 'PURCHASE', 'ซื้อ'].includes(action)) return 'BUY';
  if (['SELL', 'SALE', 'ขาย'].includes(action)) return 'SELL';
  if (['DIVIDEND', 'ปันผล'].includes(action)) return 'DIVIDEND';
  return null;
}

function parseStockImport(buffer: ArrayBuffer): { rows: StockImportRow[]; errors: string[] } {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const holdingsSheet = workbook.SheetNames.find(name => normaliseImportHeader(name) === 'holdings') || workbook.SheetNames[0];
  if (!holdingsSheet) throw new Error('ไม่พบชีตสำหรับนำเข้า');

  const sheet = workbook.Sheets[holdingsSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  const headerIndex = matrix.findIndex(values => values.some(value => ['symbol', 'ticker', 'code'].includes(normaliseImportHeader(value))));
  if (headerIndex < 0) throw new Error('ไม่พบหัวคอลัมน์ Ticker');
  const headers = matrix[headerIndex].map(value => String(value ?? ''));
  const rawRows = matrix.slice(headerIndex + 1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  const errors: string[] = [];
  const rows = rawRows.flatMap((raw, index) => {
    const symbol = readImportText(raw, ['symbol', 'ticker', 'code']).toUpperCase();
    const date = readImportDate(readImportValue(raw, ['tradedate', 'date', 'transactiondate']));
    const type = normaliseTradeAction(readImportText(raw, ['action', 'type', 'side']));
    const shares = readImportNumber(readImportText(raw, ['shares', 'quantity', 'units']));
    const price = readImportNumber(readImportText(raw, ['price', 'avgcost', 'averagecost', 'cost', 'purchaseprice']));
    const fees = readImportNumber(readImportText(raw, ['fees', 'fee', 'commission']));
    const currencyValue = readImportText(raw, ['currency']).toUpperCase();
    const currency: StockImportRow['currency'] = currencyValue === 'THB' ? 'THB' : 'USD';
    const hasAnyValue = Object.values(raw).some(value => String(value ?? '').trim() !== '');
    const sheetRow = headerIndex + index + 2;

    if (!hasAnyValue) return [];
    if (!symbol || !date || !type || price <= 0 || (type !== 'DIVIDEND' && shares <= 0)) {
      errors.push(`แถว ${sheetRow}: ต้องมี Trade_Date, Ticker, Action และ Price ที่ถูกต้อง (Quantity จำเป็นสำหรับ Buy/Sell)`);
      return [];
    }
    return [{
      row: sheetRow,
      symbol,
      date,
      type,
      shares,
      price,
      fees,
      currency,
      broker: readImportText(raw, ['broker', 'portfolio']) || undefined,
    }];
  });

  if (rawRows.length > 0 && rows.length === 0 && errors.length === 0) {
    errors.push('ไม่พบรายการที่มีข้อมูลครบ กรุณาตรวจชื่อคอลัมน์ในไฟล์ตัวอย่าง');
  }
  return { rows, errors };
}

const SPARKLINE_PADDING = { top: 8, right: 16, bottom: 24, left: 50 };

function NetWorthSparkline({ data, formatMoney, t }: { data: NetWorthPoint[]; formatMoney: (n: number) => string; t: (k: string) => string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [dims, setDims] = React.useState({ width: 800, height: 160 });

  const W = dims.width;
  const H = dims.height;

  React.useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDims({ width: rect.width, height: rect.height });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const { pathD, areaD, cx, cy, yTicks, xTicks, isPositive } = useMemo(() => {
    if (data.length < 2) return { pathD: "", areaD: "", cx: () => 0, cy: () => 0, yTicks: [], xTicks: [], isPositive: true };
    const values = data.map(d => d.value);
    const minP = Math.min(...values);
    const maxP = Math.max(...values);
    const padding = (maxP - minP) * 0.1;
    const adjMin = Math.max(0, minP - padding);
    const adjMax = maxP + padding;
    const range = adjMax - adjMin || 1;
    const n = data.length;

    const cx = (i: number) => SPARKLINE_PADDING.left + (i / (n - 1)) * (W - SPARKLINE_PADDING.left - SPARKLINE_PADDING.right);
    const cy = (p: number) => SPARKLINE_PADDING.top + (1 - (p - adjMin) / range) * (H - SPARKLINE_PADDING.top - SPARKLINE_PADDING.bottom);

    const yTicks = Array.from({ length: 3 }, (_, i) => adjMin + (i / 2) * range);
    const xCount = Math.min(5, n);
    const step = Math.floor((n - 1) / (xCount - 1)) || 1;
    const xTicks = Array.from({ length: xCount }, (_, i) => {
      const idx = Math.min(i * step, n - 1);
      return { ...data[idx], index: idx };
    });

    const points = data.map((d, i) => ({ x: cx(i), y: cy(d.value) }));
    let pathD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      pathD += ` C ${cpx.toFixed(1)} ${prev.y.toFixed(1)}, ${cpx.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(H - SPARKLINE_PADDING.bottom).toFixed(1)} L ${points[0].x.toFixed(1)} ${(H - SPARKLINE_PADDING.bottom).toFixed(1)} Z`;
    const isPositive = data[data.length - 1].value >= data[0].value;
    return { pathD, areaD, cx, cy, yTicks, xTicks, isPositive };
  }, [data, W, H]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const chartWidth = W - SPARKLINE_PADDING.left - SPARKLINE_PADDING.right;
    const relX = Math.max(0, Math.min(mouseX - SPARKLINE_PADDING.left, chartWidth));
    const idx = Math.round((relX / chartWidth) * (data.length - 1));
    setHoveredIndex(Math.max(0, Math.min(idx, data.length - 1)));
  }, [data.length, W]);

  const color = isPositive ? "#4EDEA3" : "#FFB4AB";
  const hov = hoveredIndex != null ? data[hoveredIndex] : null;

  if (data.length < 2) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center">
        <span className="text-gray-500 text-sm">{t("noChartData")}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={SPARKLINE_PADDING.left} y1={cy(v)} x2={W - SPARKLINE_PADDING.right} y2={cy(v)} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
            <text x={SPARKLINE_PADDING.left - 6} y={cy(v) + 3} textAnchor="end" fill="#6B7280" fontSize={9} fontWeight={500}>
              {formatMoney(v).replace(/[฿$]\s*/, '')}
            </text>
          </g>
        ))}
        {xTicks.map((d, i) => (
          <text key={i} x={cx(d.index)} y={H - 6} textAnchor="middle" fill="#6B7280" fontSize={9} fontWeight={500}>
            {d.date}
          </text>
        ))}
        <path d={areaD} fill="url(#nw-grad)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hov && hoveredIndex !== null && (
          <g>
            <line x1={cx(hoveredIndex)} y1={SPARKLINE_PADDING.top} x2={cx(hoveredIndex)} y2={H - SPARKLINE_PADDING.bottom} stroke="rgba(173,198,255,0.25)" strokeWidth={1} strokeDasharray="3,3" />
            <circle cx={cx(hoveredIndex)} cy={cy(hov.value)} r={5} fill={color} opacity={0.3} />
            <circle cx={cx(hoveredIndex)} cy={cy(hov.value)} r={3.5} fill={color} stroke="#0f1115" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      <AnimatePresence>
        {hov && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-1 left-1/2 -translate-x-1/2 bg-[#1e1e1e]/95 backdrop-blur-sm border border-border rounded-xl px-3 py-1.5 shadow-xl pointer-events-none z-10"
          >
            <div className="text-[10px] text-gray-400">{hov.date}</div>
            <div className="text-sm font-bold text-white">{formatMoney(hov.value)}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGE — Essential Only
// ═══════════════════════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const {
    t, formatMoney, currency, exchangeRates, trades, assets, language,
    cashActivities, moneyBuckets, bucketActivities,
    totalInvested, totalUnrealizedPL, totalRealizedPL, totalDividends,
    fetchAssetMarketData, addAsset, addTrade,
    netWorthHistory, addToast, activePortfolio, activePortfolioId, isAllPortfolios,
    portfolios, createPortfolio, selectPortfolio,
  } = useApp();
  const router = useRouter();
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [isAddCashflowOpen, setIsAddCashflowOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>({ type: 'idle', message: '' });
  const [importRows, setImportRows] = useState<StockImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [isTemplateDownloading, setIsTemplateDownloading] = useState(false);
  const tradingPortfolios = useMemo(() => portfolios.filter(portfolio => portfolio.kind === 'trading'), [portfolios]);

  const resetImport = () => {
    setImportStatus({ type: 'idle', message: '' });
    setImportRows([]);
    setImportErrors([]);
    setImportFileName('');
  };

  const handleStockFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { rows, errors } = parseStockImport(await file.arrayBuffer());
      setImportRows(rows);
      setImportErrors(errors);
      setImportFileName(file.name);
      setImportStatus(rows.length > 0
        ? { type: 'ready', message: `พบ ${rows.length} รายการ พร้อมตรวจสอบก่อนบันทึก` }
        : { type: 'error', message: 'ไม่พบรายการที่พร้อมนำเข้า' });
    } catch {
      setImportRows([]);
      setImportErrors(['อ่านไฟล์ไม่ได้ กรุณาใช้ไฟล์ XLSX, XLSM หรือ XLS ที่มีหัวคอลัมน์ตามไฟล์ตัวอย่าง']);
      setImportStatus({ type: 'error', message: 'ไม่สามารถอ่านไฟล์นี้ได้' });
    }
    e.target.value = '';
  };

  const downloadImportTemplate = async () => {
    setIsTemplateDownloading(true);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'FinTrack';
      workbook.created = new Date();

      const tradesSheet = workbook.addWorksheet('Trades', { views: [{ state: 'frozen', ySplit: 4 }] });
      tradesSheet.mergeCells('A1:H1');
      tradesSheet.getCell('A1').value = 'FinTrack trade import';
      tradesSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      tradesSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF164E43' } };
      tradesSheet.getCell('A1').alignment = { vertical: 'middle' };
      tradesSheet.getRow(1).height = 28;
      tradesSheet.mergeCells('A2:H2');
      tradesSheet.getCell('A2').value = 'Add one completed trade per row. Choose an existing Broker from the list or type a new name to create that portfolio during import.';
      tradesSheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } };
      tradesSheet.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
      tradesSheet.getRow(2).height = 34;

      const headers = ['Trade_Date', 'Ticker', 'Action', 'Quantity', 'Price', 'Fees', 'Currency', 'Broker'];
      tradesSheet.getRow(4).values = headers;
      tradesSheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      tradesSheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      tradesSheet.getRow(4).alignment = { horizontal: 'center', vertical: 'middle' };
      tradesSheet.getRow(4).height = 22;
      [14, 14, 14, 12, 14, 12, 12, 24].forEach((width, index) => { tradesSheet.getColumn(index + 1).width = width; });
      tradesSheet.getColumn(1).numFmt = 'yyyy-mm-dd';
      tradesSheet.getColumn(4).numFmt = '#,##0.########';
      tradesSheet.getColumn(5).numFmt = '#,##0.00';
      tradesSheet.getColumn(6).numFmt = '#,##0.00';
      tradesSheet.autoFilter = 'A4:H4';

      const brokerList = workbook.addWorksheet('Broker options');
      const brokerNames = tradingPortfolios.map(portfolio => portfolio.name.trim()).filter(Boolean);
      brokerList.getCell('A1').value = 'Broker';
      brokerNames.forEach((name, index) => { brokerList.getCell(index + 2, 1).value = name; });
      if (brokerNames.length === 0) brokerList.getCell('A2').value = 'Type a new broker name';
      brokerList.state = 'veryHidden';
      const brokerFormula = `INDIRECT("'Broker options'!$A$2:$A$${Math.max(2, brokerNames.length + 1)}")`;
      for (let row = 5; row <= 504; row++) {
        tradesSheet.getCell(`H${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          showErrorMessage: false,
          formulae: [brokerFormula],
        };
        tradesSheet.getCell(`C${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Buy,Sell,Dividend"'],
        };
        tradesSheet.getCell(`G${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"USD,THB"'],
        };
      }

      const guideSheet = workbook.addWorksheet('Guide');
      guideSheet.getColumn(1).width = 18;
      guideSheet.getColumn(2).width = 58;
      guideSheet.getColumn(4).width = 20;
      guideSheet.getColumn(5).width = 58;
      guideSheet.mergeCells('A1:E1');
      guideSheet.getCell('A1').value = 'How to fill in your trade history';
      guideSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      guideSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF164E43' } };
      guideSheet.getCell('A1').alignment = { vertical: 'middle' };
      guideSheet.getRow(1).height = 28;
      guideSheet.getRow(3).values = ['Column', 'What to enter', '', 'Broker', 'How FinTrack uses it'];
      ['A3', 'B3', 'D3', 'E3'].forEach(cell => {
        guideSheet.getCell(cell).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        guideSheet.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      });
      const fieldGuide = [
        ['Trade_Date', 'Date of the completed transaction. Use YYYY-MM-DD.'],
        ['Ticker', 'Ticker or fund code, for example NVDA or PTT.BK.'],
        ['Action', 'Buy, Sell, or Dividend.'],
        ['Quantity', 'Units traded. Use 0 for a cash dividend.'],
        ['Price', 'Price per unit. For a cash dividend, enter its total received amount.'],
        ['Fees / Currency', 'Optional commission. Currency can be USD or THB.'],
      ];
      const brokerGuide = [
        ['Existing broker', 'Select it from the Broker dropdown. A matching name imports into that existing portfolio.'],
        ['New broker', 'Type a new broker name in the Broker column. FinTrack creates that investment portfolio during import.'],
        ['Blank broker', 'Leave it blank only when a broker is selected in FinTrack. Otherwise, enter a broker name.'],
        ['Investment name / market', 'FinTrack identifies these automatically from the ticker.'],
        ['Supported files', 'XLSX, XLSM, XLS. Macros are never run.'],
      ];
      for (let index = 0; index < 6; index++) {
        const row = index + 4;
        guideSheet.getCell(row, 1).value = fieldGuide[index]?.[0] || '';
        guideSheet.getCell(row, 2).value = fieldGuide[index]?.[1] || '';
        guideSheet.getCell(row, 4).value = brokerGuide[index]?.[0] || '';
        guideSheet.getCell(row, 5).value = brokerGuide[index]?.[1] || '';
        for (const column of [1, 2, 4, 5]) {
          const cell = guideSheet.getCell(row, column);
          cell.alignment = { vertical: 'top', wrapText: true };
          cell.border = { top: { style: 'thin', color: { argb: 'FFD1D5DB' } }, bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
        }
      }

      const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fintrack-trade-import.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to create import template', error);
      addToast(language === 'th' ? 'สร้างไฟล์ตัวอย่างไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' : 'Could not create the starter file. Please try again.', 'error');
    } finally {
      setIsTemplateDownloading(false);
    }
  };

  const importStocks = async () => {
    if (importRows.length === 0) return;

    setImportStatus({ type: 'importing', message: 'กำลังบันทึกรายการลงทุน…' });
    let imported = 0;
    let failed = 0;
    let missingBroker = 0;
    const importedRows: StockImportRow[] = [];
    const brokerPortfolios = new Map(tradingPortfolios.map(portfolio => [portfolio.name.trim().toLocaleLowerCase(), portfolio]));
    const createdBrokerNames = new Set<string>();
    const fallbackBrokerName = activePortfolio?.kind === 'trading' ? activePortfolio.name : '';
    const marketDataBySymbol = new Map<string, { price?: number; name?: string; changePercent?: number; quoteCurrency?: string; chartData?: { time: number; price: number }[] } | null>();
    for (const item of importRows) {
      const brokerName = item.broker?.trim() || fallbackBrokerName;
      if (!brokerName) {
        missingBroker++;
        continue;
      }
      try {
        const brokerKey = brokerName.toLocaleLowerCase();
        let targetPortfolio = brokerPortfolios.get(brokerKey);
        if (!targetPortfolio) {
          const createdPortfolio = await createPortfolio(brokerName);
          if (!createdPortfolio) throw new Error('Could not create the new broker portfolio');
          targetPortfolio = createdPortfolio;
          brokerPortfolios.set(brokerKey, createdPortfolio);
          createdBrokerNames.add(createdPortfolio.name);
        }
        if (!marketDataBySymbol.has(item.symbol)) {
          try {
            marketDataBySymbol.set(item.symbol, await fetchAssetMarketData(item.symbol));
          } catch (marketError) {
            console.warn(`Could not refresh ${item.symbol}; using the imported price as its initial value.`, marketError);
            marketDataBySymbol.set(item.symbol, null);
          }
        }
        const rate = item.currency === 'THB' ? (exchangeRates.THB || 1) : 1;
        const priceUSD = item.price / rate;
        const amountLocal = item.type === 'DIVIDEND' ? item.price : item.price * item.shares;
        const saved = await addTrade({
          asset: item.symbol,
          // File imports describe external history, not a new cash purchase.
          type: item.type === 'BUY' ? 'IMPORT' : item.type,
          amountUSD: amountLocal / rate,
          originalAmount: amountLocal,
          date: item.date,
          rateAtTime: rate,
          currency: item.currency,
          shares: item.shares,
          pricePerUnit: priceUSD,
          fees: item.fees / rate,
          tag: 'Excel import',
          portfolioId: targetPortfolio.id,
        });
        if (!saved) { failed++; continue; }
        importedRows.push({ ...item, portfolioId: targetPortfolio.id });
        imported++;
      } catch (error) {
        console.error(`Failed to import ${item.symbol}:`, error);
        failed++;
      }
    }
    const importedPositions = Array.from(new Set(importedRows.map(item => `${item.portfolioId}::${item.symbol}`)));
    for (const importedPosition of importedPositions) {
      const [portfolioId, symbol] = importedPosition.split('::');
      const combinedTrades = [
        ...trades.filter(trade => trade.portfolioId === portfolioId && trade.asset.toUpperCase() === symbol),
        ...importedRows.filter(item => item.portfolioId === portfolioId && item.symbol === symbol).map(item => {
          const rate = item.currency === 'THB' ? (exchangeRates.THB || 1) : 1;
          const amountLocal = item.type === 'DIVIDEND' ? item.price : item.price * item.shares;
          return { type: item.type, shares: item.shares, amountUSD: amountLocal / rate, fees: item.fees / rate, date: item.date };
        }),
      ].sort((a, b) => a.date.localeCompare(b.date));
      const position = combinedTrades.reduce((current, trade) => {
        const quantity = trade.shares || 0;
        if (trade.type === 'BUY' || trade.type === 'IMPORT') {
          current.cost += trade.amountUSD + (trade.fees || 0);
          current.quantity += quantity;
        } else if (trade.type === 'SELL' && current.quantity > 0) {
          const sold = Math.min(quantity, current.quantity);
          current.cost -= (sold / current.quantity) * current.cost;
          current.quantity -= sold;
        }
        return current;
      }, { quantity: 0, cost: 0 });
      if (position.quantity <= 0) continue;
      const marketData = marketDataBySymbol.get(symbol) || null;
      const isThai = marketData?.quoteCurrency === 'THB' || symbol.endsWith('.BK') || symbol.endsWith('.TH');
      const currentPriceUSD = marketData?.price ? (isThai ? marketData.price / (exchangeRates.THB || 1) : marketData.price) : position.cost / position.quantity;
      await addAsset({
        name: marketData?.name || symbol,
        symbol,
        valueUSD: currentPriceUSD * position.quantity,
        change: marketData?.changePercent || 0,
        allocation: ['BTC', 'ETH', 'SOL', 'USDT', 'DOGE', 'XRP'].includes(symbol) ? 'Alternatives' : 'Equities',
        shares: position.quantity,
        avgCost: position.cost / position.quantity,
        currency: isThai ? 'THB' : 'USD',
        chartData: marketData?.chartData,
        portfolioId,
      });
    }
    selectPortfolio(activePortfolioId);
    if (imported > 0) {
      const summary = `นำเข้า ${imported} รายการ${createdBrokerNames.size ? ` · สร้าง ${createdBrokerNames.size} โบรกเกอร์ใหม่` : ''}${missingBroker ? ` · ข้าม ${missingBroker} รายการที่ไม่ระบุโบรกเกอร์` : ''}${failed ? ` · ไม่สำเร็จ ${failed} รายการ` : ''}`;
      setImportStatus({ type: 'success', message: summary });
      addToast(summary, failed ? 'warning' : 'success');
    } else {
      setImportStatus({ type: 'error', message: missingBroker ? 'กรุณาระบุ Broker ในไฟล์ หรือเลือกโบรกเกอร์ก่อนนำเข้า' : 'ยังไม่มีรายการใดถูกบันทึก กรุณาลองใหม่อีกครั้ง' });
    }
  };

  // ─── Derived Data ──────────────────────────────────────────────────────
  const currentNetWorth = netWorthHistory[netWorthHistory.length - 1]?.value || 0;
  const totalProfit = totalUnrealizedPL + totalRealizedPL + totalDividends;
  const initialCapital = currentNetWorth - totalProfit;
  const netWorthReturnPct = initialCapital > 0 ? (totalProfit / initialCapital) * 100 : 0;
  const activePositions = assets.filter(a => a.is_active !== false).length;
  const totalBucketValue = moneyBuckets.reduce((s, b) => s + (b.currentAmount / (exchangeRates[b.currency || 'USD'] || 1)), 0);

  const getEntryAmount = (entry: { amountUSD?: number; amount?: number }) => entry.amountUSD ?? entry.amount ?? 0;
  const formatEntryMoney = (v: number) => formatMoney(Math.abs(v));

  // Monthly cashflow — compare using local date to avoid UTC offset issues (UTC+7)
  const now2 = new Date();
  const currentYear = now2.getFullYear();
  const currentMonth = now2.getMonth(); // 0-indexed
  const monthIncome = cashActivities.filter(a => {
    const d = new Date(a.date);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth && a.type === 'INCOME';
  }).reduce((s, a) => s + getEntryAmount(a), 0);
  const monthExpense = cashActivities.filter(a => {
    const d = new Date(a.date);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth && (a.type === 'EXPENSE' || a.type === 'WITHDRAW') && !a.isTransfer;
  }).reduce((s, a) => s + getEntryAmount(a), 0);
  const monthNet = monthIncome - monthExpense;

  // P/L metrics
  const { grossProfit, grossLoss } = useMemo(() => {
    let gp = 0, gl = 0;
    assets.forEach(a => {
      if (a.realizedPL && a.realizedPL > 0) gp += a.realizedPL;
      if (a.realizedPL && a.realizedPL < 0) gl += Math.abs(a.realizedPL);
      const unreal = a.valueUSD - (a.avgCost || 0) * (a.shares || 0);
      if (unreal > 0) gp += unreal;
      if (unreal < 0) gl += Math.abs(unreal);
    });
    return { grossProfit: gp, grossLoss: gl };
  }, [assets]);
  const profitFactor = calcProfitFactor(grossProfit, grossLoss);
  const maxDrawdown = calcMaxDrawdown(netWorthHistory.map(h => h.value));

  // Recent activities (merged cash + bucket)
  const recentActivities = useMemo(() => {
    const merged = [
      ...cashActivities.map(a => ({ id: a.id, type: a.type, amount: getEntryAmount(a), category: a.category || '', note: a.note || '', date: a.date, source: 'cash' as const })),
      ...bucketActivities.map(a => ({
        id: a.id,
        type: (a.type === 'deposit' || a.type === 'income_split' || a.type === 'profit_split') ? 'INCOME' : 'EXPENSE',
        amount: getEntryAmount(a),
        category: a.bucketName || a.type,
        note: a.note || '',
        date: a.date,
        source: 'bucket' as const,
      })),
    ];
    return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);
  }, [cashActivities, bucketActivities]);

  // Top movers
  const topMovers = useMemo(() => {
    return [...assets].filter(a => a.is_active !== false).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 4);
  }, [assets]);

  const isEmpty = assets.length === 0 && trades.length === 0;
  const selectedBrokerLabel = isAllPortfolios ? (language === 'th' ? 'ทุกพอร์ต' : 'All portfolios') : activePortfolio?.name;

  // ─── FAB ──────────────────────────────────────────────────────────────
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <div className="relative isolate min-h-[calc(100dvh-4rem)] overflow-hidden py-7 sm:py-8 pb-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(ellipse_at_42%_0%,rgba(22,138,108,0.14),transparent_63%),radial-gradient(ellipse_at_88%_12%,rgba(91,105,184,0.13),transparent_52%)]" />
      <div className="relative z-10 mx-auto w-full max-w-7xl space-y-5 px-4 sm:px-6 lg:px-8">

      {/* ─── Greeting ─────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4EDEA3]">{selectedBrokerLabel}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {language === 'th' ? 'ภาพรวมการลงทุน' : 'Investment overview'}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4EDEA3]" />
            {language === 'th' ? 'อัปเดตตามพอร์ตที่เลือก' : 'Shown for the selected portfolio'}
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {language === 'th' ? 'เพิ่มสินทรัพย์ทีละรายการ หรือนำเข้าจากไฟล์ Excel ได้ในไม่กี่ขั้นตอน' : 'Add investments one at a time or import an Excel file in a few steps.'}
        </p>
      </motion.div>

      {/* ─── Empty State ──────────────────────────────────────────────── */}
      {isEmpty && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-[#172522] via-[#151a19] to-[#171827] p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-[#4EDEA3]/10 blur-3xl" />
          <div className="relative grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#4EDEA3]/20 bg-[#4EDEA3]/10 text-[#4EDEA3]"><Briefcase size={20} /></div>
              <h2 className="text-xl font-bold text-white">{language === 'th' ? 'เริ่มติดตามพอร์ตของคุณ' : 'Start tracking your portfolio'}</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-gray-400">{language === 'th' ? 'เลือกโบรกเกอร์ก่อน แล้วเพิ่มสินทรัพย์เองหรือนำเข้าหลายรายการจาก Excel ได้ทันที' : 'Choose a broker first, then add an investment manually or import multiple rows from Excel.'}</p>
            </div>
            <div className="flex flex-col gap-2 sm:min-w-56">
              <button onClick={() => setIsImportOpen(true)} className="flex items-center justify-center gap-2 rounded-xl bg-[#4EDEA3] px-4 py-3 text-sm font-bold text-[#062c25] transition hover:brightness-110"><FileSpreadsheet size={17} />{language === 'th' ? 'นำเข้าจาก Excel' : 'Import from Excel'}</button>
              <button onClick={() => setIsAddAssetOpen(true)} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"><Plus size={17} />{language === 'th' ? 'เพิ่มทีละรายการ' : 'Add one investment'}</button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Quick Stats (4 cards) ─────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: language === 'th' ? 'สินทรัพย์' : 'Assets', value: activePositions.toString(), icon: <Briefcase size={16} />, color: '#ADC6FF', onClick: () => router.push('/portfolio') },
          { label: language === 'th' ? 'กำไร/ขาดทุน' : "P/L", value: `${totalUnrealizedPL >= 0 ? '+' : ''}${formatMoney(totalUnrealizedPL)}`, icon: <BarChart3 size={16} />, color: totalUnrealizedPL >= 0 ? '#4EDEA3' : '#FFB4AB', onClick: () => router.push('/portfolio') },
          { label: language === 'th' ? 'เงินในกระเป๋า' : 'Buckets', value: formatMoney(totalBucketValue), icon: <Wallet size={16} />, color: '#E9C349', onClick: () => router.push('/budget') },
          { label: language === 'th' ? 'เดือนนี้' : 'This Month', value: `${monthNet >= 0 ? '+' : ''}${formatEntryMoney(monthNet)}`, icon: <TrendingUp size={16} />, color: monthNet >= 0 ? '#4EDEA3' : '#FFB4AB', onClick: () => router.push('/cashflow') },
        ].map((stat, i) => (
          <motion.button key={i} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={stat.onClick}
            className="bg-surface/50 backdrop-blur-xl rounded-2xl p-4 border border-border text-left hover:border-white/10 transition-all group">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>{stat.icon}</div>
            </div>
            <div className="text-lg font-bold text-white tracking-tight truncate">{stat.value}</div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{stat.label}</div>
          </motion.button>
        ))}
      </motion.div>

      {/* ─── Net Worth Hero + Chart ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-surface/50 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 relative overflow-hidden border border-border shadow-xl"
      >
        <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4 relative z-10">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t("totalNetWorth")}</span>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tighter text-white leading-none">
              <AnimatedNumber value={currentNetWorth} formatter={(v) => formatMoney(v)} />
            </h1>
            <div className="flex items-center gap-2">
              <div className={cn("flex items-center gap-1", getPnLColor(netWorthReturnPct))}>
                {netWorthReturnPct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                <span className="text-xs sm:text-sm font-bold">{formatPercent(netWorthReturnPct, 1)}</span>
              </div>
              <span className="text-gray-500 text-[10px] font-medium uppercase">
                Rate: 1 USD = {Number.isFinite(exchangeRates[currency]) ? exchangeRates[currency].toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'} {currency}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsAddAssetOpen(true)}
              className="px-4 py-2 bg-white/5 text-[#ADC6FF] border border-[#ADC6FF]/30 rounded-xl font-black text-xs flex items-center gap-1.5 hover:bg-[#ADC6FF]/10 transition-all"
            >
              <Plus size={14} /> {t("addAsset") || "Add Asset"}
            </button>
            <button
              onClick={() => router.push('/trade/plan')}
              className="px-4 py-2 bg-[#4EDEA3]/10 text-[#4EDEA3] border border-[#4EDEA3]/30 rounded-xl font-black text-xs flex items-center gap-1.5 hover:bg-[#4EDEA3]/20 transition-all"
            >
              <TrendingUp size={14} /> {t("trade") || "Trade"}
            </button>
            <button
              onClick={() => router.push('/budget')}
              className="px-4 py-2 bg-[#E9C349]/10 text-[#E9C349] border border-[#E9C349]/30 rounded-xl font-black text-xs flex items-center gap-1.5 hover:bg-[#E9C349]/20 transition-all"
            >
              <Wallet size={14} /> {t("distribute") || "Distribute"}
            </button>
            <button
              onClick={() => setIsImportOpen(true)}
              className="px-4 py-2 bg-white/5 text-gray-300 border border-border rounded-xl font-black text-xs flex items-center gap-1.5 hover:bg-white/10 transition-all"
            >
              <FileSpreadsheet size={14} /> {language === 'th' ? 'นำเข้า Excel' : 'Import Excel'}
            </button>
          </div>
        </div>
        <div className="h-40 sm:h-44 min-w-0" style={{ minHeight: 160 }}>
          <NetWorthSparkline data={netWorthHistory} formatMoney={formatMoney} t={t} />
        </div>
      </motion.div>

      {/* ─── Main Grid: P/L Metrics + Cashflow + Top Movers ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* P/L Summary (compact 6 metrics) */}
        <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: t("totalInvested"), value: formatMoney(totalInvested), color: '#ADC6FF' },
            { label: t("unrealizedPL"), value: formatPnL(totalUnrealizedPL, formatMoney), color: totalUnrealizedPL >= 0 ? '#4EDEA3' : '#FFB4AB' },
            { label: t("realizedPL"), value: formatPnL(totalRealizedPL, formatMoney), color: totalRealizedPL >= 0 ? '#4EDEA3' : '#FFB4AB' },
            { label: t("dividends"), value: formatMoney(totalDividends), color: '#E9C349' },
            { label: 'Max DD', value: `-${maxDrawdown.toFixed(1)}%`, color: '#FFB4AB' },
            { label: 'PF', value: profitFactor === Number.POSITIVE_INFINITY ? '∞' : profitFactor.toFixed(2), color: profitFactor >= 1.5 ? '#4EDEA3' : '#9CA3AF' },
          ].map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.03 }}
              className="bg-surface/50 p-3 sm:p-4 rounded-2xl border border-border">
              <p className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: m.color }}>{m.label}</p>
              <h3 className="text-sm sm:text-lg font-bold text-white tracking-tight truncate">{m.value}</h3>
            </motion.div>
          ))}
        </div>

        {/* Cashflow + Recent */}
        <div className="lg:col-span-4 bg-surface/50 rounded-2xl border border-border p-4 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className="text-[10px] text-[#ADC6FF] uppercase tracking-wide font-bold">{t("cashflowOverview")}</span>
              <h3 className="text-sm font-bold text-white">{t("netCashflow")}</h3>
            </div>
            <button onClick={() => setIsAddCashflowOpen(true)}
              className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
              <Plus size={12} className="text-[#ADC6FF]" />
            </button>
          </div>

          <h2 className={cn("text-2xl font-bold tracking-tight mb-3", monthNet >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
            {monthNet >= 0 ? "+" : "-"}{formatEntryMoney(monthNet)}
          </h2>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-[#4EDEA3]" />
              <span className="text-[10px] text-gray-400 font-bold">{t("income")}</span>
              <span className="text-xs text-white font-bold ml-auto">{formatEntryMoney(monthIncome)}</span>
            </div>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl">
              <div className="w-1.5 h-1.5 rounded-full bg-[#FFB4AB]" />
              <span className="text-[10px] text-gray-400 font-bold">{t("expense")}</span>
              <span className="text-xs text-white font-bold ml-auto">{formatEntryMoney(monthExpense)}</span>
            </div>
          </div>

          {/* Recent Activities */}
          <div className="flex-1 space-y-1.5 overflow-y-auto">
            {recentActivities.map((act, idx) => {
              const isIncome = act.type === 'INCOME';
              return (
                <div key={`${act.id}-${idx}`} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn("w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0",
                      isIncome ? "bg-[#4EDEA3]/10" : "bg-[#FFB4AB]/10"
                    )}>
                      {isIncome ? <ArrowDownLeft size={10} className="text-[#4EDEA3]" /> : <ArrowUpRight size={10} className="text-[#FFB4AB]" />}
                    </div>
                    <span className="text-white font-bold truncate">{act.category}</span>
                  </div>
                  <span className={cn("font-bold flex-shrink-0 ml-2", isIncome ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {isIncome ? "+" : "-"}{formatEntryMoney(act.amount)}
                  </span>
                </div>
              );
            })}
          </div>

          <button onClick={() => router.push('/ledger')}
            className="w-full mt-3 py-2 rounded-xl border border-border text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:bg-white/5 transition-all text-center">
            {language === 'th' ? 'ดูทั้งหมด' : 'View All'} →
          </button>
        </div>

        {/* Top Movers */}
        <div className="lg:col-span-3 bg-surface/50 rounded-2xl border border-border p-4 flex flex-col">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide font-bold mb-3">Top Movers</span>
          <div className="space-y-2 flex-1">
            {topMovers.length === 0 && (
              <div className="flex-1 flex items-center justify-center py-8 text-gray-600 text-xs">No active assets</div>
            )}
            {topMovers.map(a => (
              <button key={a.symbol} onClick={() => router.push(`/portfolio`)}
                className="w-full flex items-center justify-between gap-3 p-3 text-left rounded-xl bg-white/[0.02] hover:bg-white/[0.06] transition-all border border-transparent hover:border-border">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <TopMoverLogo key={a.symbol} symbol={a.symbol} />
                  <div className="min-w-0 text-left">
                    <span className="text-xs font-bold text-white block truncate">{a.symbol}</span>
                    <span className="text-[9px] text-gray-500 truncate block" title={a.name}>{a.name}</span>
                  </div>
                </div>
                <div className="shrink-0 whitespace-nowrap text-right tabular-nums">
                  <span className="text-xs font-bold text-white block">{formatMoney(a.valueUSD)}</span>
                  <span className={cn("text-[10px] font-bold", a.change >= 0 ? "text-[#4EDEA3]" : "text-[#FFB4AB]")}>
                    {a.change >= 0 ? '+' : ''}{a.change.toFixed(2)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => router.push('/portfolio')}
            className="w-full mt-3 py-2 rounded-xl border border-border text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:bg-white/5 transition-all text-center">
            {t("portfolio")} →
          </button>
        </div>
      </div>

      {/* ─── FAB ──────────────────────────────────────────────────── */}
      <div className="hidden sm:flex fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 flex-col items-end gap-2">
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col gap-2 items-end"
            >
              {[
                { label: language === 'th' ? 'บันทึกรายได้' : 'Log Income', bg: '#4EDEA3', icon: 'wallet', onClick: () => { setIsAddCashflowOpen(true); setFabOpen(false); } },
                { label: language === 'th' ? 'บันทึกรายจ่าย' : 'Log Expense', bg: '#FFB4AB', icon: 'expense', onClick: () => { setIsAddCashflowOpen(true); setFabOpen(false); } },
                { label: language === 'th' ? 'เพิ่มสินทรัพย์' : 'Add Asset', bg: '#ADC6FF', icon: 'investment', onClick: () => { setIsAddAssetOpen(true); setFabOpen(false); } },
                { label: language === 'th' ? 'เทรด' : 'Trade', bg: '#E9C349', icon: 'lightning', onClick: () => { router.push('/trade/plan'); setFabOpen(false); } },
              ].map((action, i) => (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={action.onClick}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-xl text-[#0E0E0E] text-xs font-bold tracking-wide hover:brightness-110 active:scale-95 transition-all"
                  style={{ backgroundColor: action.bg }}
                >
                  <span><FinanceIcon name={action.icon} size={16} /></span>
                  <span>{action.label}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          onClick={() => setFabOpen(v => !v)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          className="w-14 h-14 rounded-full bg-[#ADC6FF] text-[#00285d] shadow-2xl shadow-[#ADC6FF]/30 flex items-center justify-center transition-all"
        >
          <motion.span animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ duration: 0.2 }} className="text-2xl font-bold leading-none">
            +
          </motion.span>
        </motion.button>
      </div>

      {/* ─── Modals ──────────────────────────────────────────────── */}
      <AddAssetModal variant="portfolio" isOpen={isAddAssetOpen} onClose={() => setIsAddAssetOpen(false)} />
            <AddCashflowModal isOpen={isAddCashflowOpen} onClose={() => setIsAddCashflowOpen(false)} />

      <Modal isOpen={isImportOpen} onClose={() => { setIsImportOpen(false); resetImport(); }} title={language === 'th' ? 'นำเข้าหุ้นจาก Excel' : 'Import investments from Excel'}>
        <p className="mb-3 text-xs text-gray-400">นำเข้าข้อมูลจากภายนอก: รายการซื้อในไฟล์บันทึกเป็นสินทรัพย์ที่ถืออยู่แล้ว โดยไม่ตัดเงินจากกระเป๋า</p>
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl bg-[#4EDEA3]/10 p-2 text-[#4EDEA3]"><FileSpreadsheet size={18} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{language === 'th' ? 'เริ่มจากไฟล์ตัวอย่าง' : 'Start with the template'}</p>
                <p className="mt-1 text-xs leading-5 text-gray-400">{language === 'th' ? 'ไฟล์จะใส่รายชื่อพอร์ตของคุณในช่อง Broker เป็น dropdown เลือกพอร์ตเดิมได้ทันที หรือพิมพ์ชื่อใหม่เพื่อให้ระบบสร้างพอร์ตตอนนำเข้า' : 'The Broker dropdown includes your existing portfolios. Select one to import into it, or type a new name to create a portfolio during import.'}</p>
                <button type="button" onClick={downloadImportTemplate} disabled={isTemplateDownloading} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#4EDEA3] hover:text-white disabled:cursor-wait disabled:opacity-60"><Download size={14} />{isTemplateDownloading ? (language === 'th' ? 'กำลังสร้างไฟล์…' : 'Preparing file…') : (language === 'th' ? 'ดาวน์โหลดไฟล์ตัวอย่าง' : 'Download starter file')}</button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#4EDEA3]/20 bg-[#4EDEA3]/5 p-3 text-xs text-gray-300">
            {language === 'th'
              ? 'ระบบจับคู่ชื่อ Broker ในไฟล์กับพอร์ตที่มีอยู่โดยไม่สนตัวพิมพ์เล็กใหญ่ หากไม่พบชื่อที่ตรงกัน ระบบจะสร้างพอร์ตลงทุนใหม่พร้อมบัญชีเงินสด THB และ USD ให้'
              : 'Broker names are matched to existing portfolios without case sensitivity. A name that is not found creates a new investment portfolio with THB and USD cash accounts.'}
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-5 py-7 text-center transition hover:border-[#4EDEA3]/40 hover:bg-[#4EDEA3]/5">
            <Upload size={25} className="text-gray-500" />
            <span className="text-sm font-bold text-white">{language === 'th' ? 'เลือกไฟล์ Excel เพื่อพรีวิว' : 'Choose an Excel file to preview'}</span>
            <span className="text-[11px] text-gray-500">XLSX, XLSM, XLS</span>
            <input type="file" accept={IMPORT_FILE_TYPES} onChange={handleStockFile} className="hidden" />
          </label>

          {importFileName && (
            <div className="rounded-xl border border-border bg-black/10 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-white"><FileSpreadsheet size={15} className="text-[#4EDEA3]" />{importFileName}</div>
              {importRows.length > 0 && <div className="mt-3 overflow-hidden rounded-lg border border-white/5">
                <div className="grid grid-cols-[1fr_.85fr_.65fr_.85fr_.65fr_1fr] gap-2 bg-white/[0.04] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-500"><span>Ticker</span><span>Action</span><span>Qty</span><span>Price</span><span>Currency</span><span>Broker</span></div>
                {importRows.slice(0, 4).map(row => <div key={`${row.row}-${row.symbol}`} className="grid grid-cols-[1fr_.85fr_.65fr_.85fr_.65fr_1fr] gap-2 border-t border-white/5 px-3 py-2 text-xs text-gray-300"><span className="font-bold text-white">{row.symbol}</span><span>{row.type}</span><span>{row.shares.toLocaleString()}</span><span>{row.price.toLocaleString()}</span><span>{row.currency}</span><span className={row.broker ? 'truncate text-gray-300' : 'text-[#E9C349]'}>{row.broker || (activePortfolio?.kind === 'trading' ? activePortfolio.name : 'ต้องระบุ')}</span></div>)}
              </div>}
              {importRows.length > 4 && <p className="mt-2 text-[11px] text-gray-500">{language === 'th' ? `และอีก ${importRows.length - 4} รายการ` : `and ${importRows.length - 4} more`}</p>}
            </div>
          )}

          {importErrors.length > 0 && <div className="rounded-xl border border-[#FFB4AB]/20 bg-[#FFB4AB]/5 p-3 text-xs text-[#FFB4AB]"><div className="flex items-center gap-1.5 font-bold"><CircleAlert size={14} />{language === 'th' ? 'รายการที่ข้าม' : 'Rows skipped'}</div><ul className="mt-1.5 space-y-1 text-[11px]">{importErrors.slice(0, 3).map(error => <li key={error}>{error}</li>)}</ul></div>}

          {importStatus.type !== 'idle' && <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold", importStatus.type === 'success' ? 'border-[#4EDEA3]/20 bg-[#4EDEA3]/5 text-[#4EDEA3]' : importStatus.type === 'error' ? 'border-[#FFB4AB]/20 bg-[#FFB4AB]/5 text-[#FFB4AB]' : 'border-border bg-white/[0.03] text-gray-300')}>
            {importStatus.type === 'success' && <CheckCircle2 size={15} />}{importStatus.message}
          </div>}

          <div className="flex gap-3 pt-1">
            <button onClick={() => { setIsImportOpen(false); resetImport(); }} className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-bold text-gray-300 transition hover:bg-white/5">{language === 'th' ? 'ยกเลิก' : 'Cancel'}</button>
            <button onClick={importStocks} disabled={importRows.length === 0 || importStatus.type === 'importing'} className="flex-[1.5] rounded-xl bg-[#4EDEA3] px-4 py-3 text-sm font-bold text-[#062c25] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{importStatus.type === 'importing' ? (language === 'th' ? 'กำลังนำเข้า…' : 'Importing…') : (language === 'th' ? `ยืนยัน ${importRows.length || ''} รายการ` : `Import ${importRows.length || ''} items`)}</button>
          </div>
          <p className="text-center text-[10px] leading-4 text-gray-600">{language === 'th' ? 'ไฟล์ XLSM จะอ่านเฉพาะข้อมูลในชีตและจะไม่เรียกใช้ macro' : 'XLSM files are read as worksheet data only; macros are never run.'}</p>
        </div>
      </Modal>
      </div>
    </div>
  );
}
