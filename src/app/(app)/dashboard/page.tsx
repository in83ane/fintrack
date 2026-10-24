"use client";

import { FinanceIcon } from "@/src/components/FinanceIcon";
import React, { useState, useMemo, useRef, useCallback } from "react";
import { TrendingUp, TrendingDown, Plus, Briefcase, Wallet, BarChart3, ArrowUpRight, ArrowDownLeft, Download, Upload, FileSpreadsheet, CheckCircle2, CircleAlert, ChevronDown, Star } from "lucide-react";
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
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-foreground/10 bg-foreground/[0.04]" aria-hidden="true">
    {failed ? <span className="text-xs font-bold text-info">{symbol.slice(0, 2)}</span> : (
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

const SPARKLINE_PADDING = { top: 16, right: 24, bottom: 32, left: 82 };

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

  const color = "var(--ft-accent)";
  const hov = hoveredIndex != null ? data[hoveredIndex] : null;

  if (data.length < 2) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center">
        <span className="text-gray-500 text-sm">{t("noChartData")}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="ft-chart w-full h-full relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full cursor-crosshair"
        role="img" aria-label="Net worth history. Use left and right arrow keys to explore values." tabIndex={0}
        onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setHoveredIndex(i => Math.max(0, Math.min(data.length - 1, (i ?? 0) + (e.key === "ArrowRight" ? 1 : -1)))); } }}
        onPointerMove={handleMouseMove}
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
            <line x1={SPARKLINE_PADDING.left} y1={cy(v)} x2={W - SPARKLINE_PADDING.right} y2={cy(v)} stroke="var(--ft-line)" strokeWidth={1} />
            <text x={SPARKLINE_PADDING.left - 6} y={cy(v) + 3} textAnchor="end" fill="var(--ft-muted)" fontSize={12} fontWeight={500}>
              {formatMoney(v).replace(/[฿$]\s*/, '')}
            </text>
          </g>
        ))}
        {xTicks.map((d, i) => (
          <text key={i} x={cx(d.index)} y={H - 6} textAnchor="middle" fill="var(--ft-muted)" fontSize={12} fontWeight={500}>
            {d.date}
          </text>
        ))}
        <path d={areaD} fill="url(#nw-grad)" />
        <path data-line pathLength={1} d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
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
            className="absolute top-1 left-1/2 -translate-x-1/2 bg-overlay border border-border rounded-xl px-3 py-1.5 shadow-xl pointer-events-none z-10"
          >
            <div className="text-xs text-gray-400">{hov.date}</div>
            <div className="text-sm font-bold text-foreground">{formatMoney(hov.value)}</div>
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
    t, formatMoney, currency, exchangeRates, trades, assets, language, marketQuotes,
    cashActivities, moneyBuckets, bucketActivities,
    totalInvested, totalUnrealizedPL, totalRealizedPL, totalDividends,
    fetchAssetMarketData, addAsset, addTrade,
    netWorthHistory, addToast, activePortfolio, activePortfolioId, isAllPortfolios,
    portfolios, createPortfolio, selectPortfolio, userProfile,
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
  const [showFavorites, setShowFavorites] = useState(false);
  const topMovers = useMemo(() => {
    const rows = assets.filter(a => a.is_active !== false);
    if (showFavorites) return rows.filter(a => a.isFavorite).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.symbol.localeCompare(b.symbol));
    return rows.filter(a => marketQuotes[a.symbol]?.dayChangePercent != null).sort((a, b) => Math.abs(marketQuotes[b.symbol]?.dayChangePercent ?? 0) - Math.abs(marketQuotes[a.symbol]?.dayChangePercent ?? 0)).slice(0, 4);
  }, [assets, marketQuotes, showFavorites]);

  const isEmpty = assets.length === 0 && trades.length === 0;
  const selectedBrokerLabel = isAllPortfolios ? (language === 'th' ? 'ทุกพอร์ต' : 'All portfolios') : activePortfolio?.name;

  // ─── FAB ──────────────────────────────────────────────────────────────
  const [range, setRange] = useState('ALL');
  const rangeDays: Record<string, number> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };
  const chartData = useMemo(() => {
    if (range === 'ALL') return netWorthHistory;
    const cutoff = Date.now() - rangeDays[range] * 86400000;
    return netWorthHistory.filter(point => { const date = Date.parse(point.date); return Number.isFinite(date) && date >= cutoff; });
  }, [range, netWorthHistory]);
  const allocation = useMemo(() => {
    const groups = new Map<string, number>();
    assets.filter(asset => asset.is_active !== false).forEach(asset => groups.set(asset.symbol, (groups.get(asset.symbol) || 0) + asset.valueUSD));
    return [...groups].sort((a,b) => b[1] - a[1]);
  }, [assets]);
  const allocationTotal = allocation.reduce((sum, entry) => sum + entry[1], 0);
  const hour = new Date().getHours();
  const greeting = language === 'th' ? (hour < 12 ? 'สวัสดีตอนเช้า' : hour < 18 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น') : (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
  const addMenu = useRef<HTMLDetailsElement>(null);
  const closeAddMenu = () => { if (addMenu.current) addMenu.current.open = false; };
  React.useEffect(() => { const close = (e: PointerEvent) => { if (!addMenu.current?.contains(e.target as Node)) closeAddMenu(); }; const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAddMenu(); }; document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape); return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); }; }, []);

  return (
    <div className="ft-dashboard pb-24">
      <div className="space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div><h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{greeting}{userProfile?.initials ? `, ${userProfile.initials}` : ''}.</h1>
            <p className="mt-2 text-sm text-muted">{selectedBrokerLabel} · {language === 'th' ? 'ภาพรวมสินทรัพย์และกิจกรรมของคุณ' : 'Your wealth and activity, in perspective.'}</p></div>
          <details ref={addMenu} className="relative z-20 shrink-0"><summary className="ft-button ft-primary list-none [&::-webkit-details-marker]:hidden"><Plus size={17}/>{language === 'th' ? 'เพิ่ม' : 'Add'}<ChevronDown size={15}/></summary>
            <div className="ft-menu absolute right-0 top-full mt-2">
              <button onClick={() => {closeAddMenu();setIsAddAssetOpen(true);}}><Briefcase size={17}/>{t('addAsset')}</button>
              <button onClick={() => {closeAddMenu();router.push('/trade/plan');}}><TrendingUp size={17}/>{language === 'th' ? 'วางแผนซื้อขาย' : 'Trade'}</button>
              <button onClick={() => {closeAddMenu();router.push('/budget');}}><Wallet size={17}/>{language === 'th' ? 'จัดสรรเงิน' : 'Distribute'}</button>
              <button onClick={() => {closeAddMenu();setIsImportOpen(true);}}><FileSpreadsheet size={17}/>{language === 'th' ? 'นำเข้า Excel' : 'Import Excel'}</button>
            </div>
          </details>
        </header>
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2.2fr)_minmax(260px,1fr)]">
          <section className="ft-panel min-w-0 overflow-hidden">
            <div className="ft-hero-summary flex flex-wrap items-end justify-between gap-5 px-5 py-6 sm:px-7">
              <div><h2 className="text-sm font-medium">{t('totalNetWorth')}</h2><p className="ft-number mt-2 text-4xl sm:text-5xl font-semibold" data-private><AnimatedNumber value={currentNetWorth} formatter={formatMoney}/></p></div>
              <span className="text-sm font-medium">{currency}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-7">
              <p className="flex items-center gap-2 text-sm"><span className={netWorthReturnPct >= 0 ? 'text-gain' : 'text-loss'}>{netWorthReturnPct >= 0 ? '+' : '−'}{Math.abs(netWorthReturnPct).toFixed(1)}%</span><span className="text-muted">{language === 'th' ? 'ผลตอบแทนสะสม' : 'Total return'}</span></p>
              <div className="ft-range flex gap-1 rounded-full bg-surface-2 p-1" role="group" aria-label="Chart range">{['1D','1W','1M','3M','1Y','ALL'].map(value => <button key={value} aria-pressed={range===value} className="relative rounded-full px-2.5 py-1.5 text-xs" onClick={() => setRange(value)}>{range===value && <motion.span layoutId="chart-range" className="absolute inset-0 rounded-full bg-primary" transition={{type:'spring',stiffness:400,damping:34}}/>}<span className={range===value ? 'relative text-primary-foreground' : 'relative text-muted'}>{value}</span></button>)}</div>
            </div>
            <div className="h-60 min-w-0 px-3 pt-6 sm:px-5"><NetWorthSparkline data={chartData} formatMoney={formatMoney} t={t}/></div>
            <p className="px-5 pb-4 text-xs text-muted sm:px-7">{language === 'th' ? 'มูลค่าตามประวัติที่บันทึก · ' : 'Recorded portfolio history · '}1 USD = {Number.isFinite(exchangeRates[currency]) ? exchangeRates[currency].toLocaleString('en-US',{maximumFractionDigits:4}) : '—'} {currency}</p>
          </section>
          <aside className="ft-panel flex flex-col p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{language === 'th' ? 'สัดส่วนการลงทุน' : 'Investment Mix'}</h2><span className="text-xs text-muted">{activePositions} {language === 'th' ? 'สินทรัพย์' : 'assets'}</span></div>
            {allocationTotal > 0 ? <><div className="mt-7 flex h-3 overflow-hidden rounded-full" aria-label="Holdings allocation">{allocation.map(([name,value],i)=><div key={name} title={`${name}: ${(value/allocationTotal*100).toFixed(1)}%`} style={{width:`${value/allocationTotal*100}%`,background:`var(--ft-series-${i%4})`}}/>)}</div><div className="mt-6 space-y-5">{allocation.map(([name,value],i)=><div key={name}><div className="flex justify-between gap-3 text-sm"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{background:`var(--ft-series-${i%4})`}}/>{name}</span><span className="tabular-nums">{(value/allocationTotal*100).toFixed(1)}%</span></div><p className="mt-1 pl-4 text-xs text-muted" data-private>{formatMoney(value)}</p></div>)}</div></> : <div className="flex-1 py-7"><Briefcase size={26} className="mb-4 text-primary"/><p className="text-sm font-medium">{language === 'th' ? 'ยังไม่มีสินทรัพย์ลงทุน' : 'Your investment mix starts here'}</p><p className="mt-2 text-sm leading-6 text-muted">{language === 'th' ? 'เพิ่มสินทรัพย์จากเมนูด้านบนเพื่อดูสัดส่วนพอร์ต' : 'Add an investment using the menu above to see how your holdings are distributed.'}</p></div>}
            <div className="mt-auto border-t border-border pt-5"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted">{language === 'th' ? 'ยอดใน Bucket' : 'Bucket balance'}</span><span className="font-semibold" data-private>{formatMoney(totalBucketValue)}</span></div><button className="mt-4 flex items-center gap-2 text-sm text-primary" onClick={()=>router.push('/portfolio')}>{language === 'th' ? 'ดูพอร์ตลงทุน' : 'View Portfolio'}<ArrowUpRight size={16}/></button></div>
          </aside>
        </div>
        {/* ─── Main Grid: P/L Metrics + Cashflow + Top Movers ─────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* P/L Summary (compact 6 metrics) */}
          <div className="ft-stat-strip lg:col-span-12 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-0 border-y border-border py-2">
            {[
              { label: t("totalInvested"), value: formatMoney(totalInvested), color: '#ADC6FF' },
              { label: t("unrealizedPL"), value: formatPnL(totalUnrealizedPL, formatMoney), color: totalUnrealizedPL >= 0 ? '#4EDEA3' : '#FFB4AB' },
              { label: t("realizedPL"), value: formatPnL(totalRealizedPL, formatMoney), color: totalRealizedPL >= 0 ? '#4EDEA3' : '#FFB4AB' },
              { label: t("dividends"), value: formatMoney(totalDividends), color: '#E9C349' },
              { label: 'Max DD', value: `-${maxDrawdown.toFixed(1)}%`, color: '#FFB4AB' },
              { label: 'PF', value: profitFactor === Number.POSITIVE_INFINITY ? '∞' : profitFactor.toFixed(2), color: profitFactor >= 1.5 ? '#4EDEA3' : '#9CA3AF' },
            ].map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.03 }}
                className="px-4 py-4">
                <p className="text-xs font-medium text-muted mb-2">{m.label}</p>
                <h3 className="text-base sm:text-lg font-semibold ft-number truncate" data-private>{m.value}</h3>
              </motion.div>
            ))}
          </div>

          {/* Cashflow + Recent */}
          <div className="lg:col-span-7 bg-surface rounded-2xl border border-border p-4 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="text-sm text-muted">{t("cashflowOverview")}</p>
                <h3 className="text-sm font-bold text-foreground">{t("netCashflow")}</h3>
              </div>
              <button aria-label={language === "th" ? "เพิ่มรายการเงินสด" : "Add cash entry"} onClick={() => setIsAddCashflowOpen(true)}
                className="w-7 h-7 rounded-full bg-foreground/5 flex items-center justify-center hover:bg-foreground/10 transition-colors">
                <Plus size={12} className="text-info" />
              </button>
            </div>

            <h2 className={cn("text-2xl font-bold tracking-tight mb-3", monthNet >= 0 ? "text-gain" : "text-loss")}>
              {monthNet >= 0 ? "+" : "-"}{formatEntryMoney(monthNet)}
            </h2>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="flex items-center gap-2 bg-foreground/5 px-3 py-2 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-gain" />
                <span className="text-xs text-gray-400 font-bold">{t("income")}</span>
                <span className="text-xs text-foreground font-bold ml-auto">{formatEntryMoney(monthIncome)}</span>
              </div>
              <div className="flex items-center gap-2 bg-foreground/5 px-3 py-2 rounded-xl">
                <div className="w-1.5 h-1.5 rounded-full bg-loss" />
                <span className="text-xs text-gray-400 font-bold">{t("expense")}</span>
                <span className="text-xs text-foreground font-bold ml-auto">{formatEntryMoney(monthExpense)}</span>
              </div>
            </div>

            {/* Recent Activities */}
            <div className="flex-1 space-y-1.5 overflow-y-auto">
              {recentActivities.map((act, idx) => {
                const isIncome = act.type === 'INCOME';
                return (
                  <div key={`${act.id}-${idx}`} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg hover:bg-foreground/5 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn("w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0",
                        isIncome ? "bg-gain/10" : "bg-loss/10"
                      )}>
                        {isIncome ? <ArrowDownLeft size={10} className="text-gain" /> : <ArrowUpRight size={10} className="text-loss" />}
                      </div>
                      <span className="text-foreground font-bold truncate">{act.category}</span>
                    </div>
                    <span className={cn("font-bold flex-shrink-0 ml-2", isIncome ? "text-gain" : "text-loss")}>
                      {isIncome ? "+" : "-"}{formatEntryMoney(act.amount)}
                    </span>
                  </div>
                );
              })}
            </div>

            <button onClick={() => router.push('/ledger')}
              className="w-full mt-3 py-2 rounded-xl border border-border text-xs font-bold uppercase tracking-wide text-gray-400 hover:bg-foreground/5 transition-all text-center">
              {language === 'th' ? 'ดูทั้งหมด' : 'View All'} →
            </button>
          </div>

          {/* Top Movers */}
          <div className="lg:col-span-5 bg-surface rounded-2xl border border-border p-4 flex flex-col">
            <div className="mb-3 flex flex-wrap gap-2 text-xs font-bold">
              <button type="button" aria-pressed={!showFavorites} onClick={() => setShowFavorites(false)} className={cn('rounded-lg px-2 py-2', !showFavorites ? 'bg-foreground/10 text-foreground' : 'text-gray-500')}>Top Movers · 1D</button>
              <button type="button" aria-pressed={showFavorites} onClick={() => setShowFavorites(true)} className={cn('rounded-lg px-2 py-2', showFavorites ? 'bg-amber-300/10 text-amber-300' : 'text-gray-500')}>★ Favorites ({assets.filter(a => a.is_active !== false && a.isFavorite).length})</button>
            </div>
            <div className="space-y-2 flex-1 max-h-96 overflow-y-auto">
              {topMovers.length === 0 && (
                <div className="flex-1 flex items-center justify-center py-8 text-gray-500 text-xs">{showFavorites ? 'กด ★ ที่ Portfolio เพื่อติดตามสินทรัพย์' : 'ยังไม่มีราคาเปลี่ยนแปลง 1 วัน'}</div>
              )}
              {topMovers.map(a => (
                <button key={`${a.portfolioId}:${a.symbol}`} onClick={() => router.push(`/portfolio`)}
                  className="w-full flex items-center justify-between gap-3 p-3 text-left rounded-xl bg-foreground/[0.02] hover:bg-foreground/[0.06] transition-all border border-transparent hover:border-border">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <TopMoverLogo key={a.symbol} symbol={a.symbol} />
                    <div className="min-w-0 text-left">
                      <span className="text-xs font-bold text-foreground block truncate">{a.symbol}</span>
                      <span className="text-xs text-gray-500 truncate block" title={a.name}>{a.name}</span>
                    </div>
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-right tabular-nums">
                    <span className="text-xs font-bold text-foreground block">{formatMoney(a.valueUSD)}</span>
                    <span className={cn("text-xs font-bold", Math.abs(marketQuotes[a.symbol]?.dayChangePercent ?? 0) < 0.005 ? 'text-gray-400' : (marketQuotes[a.symbol]?.dayChangePercent ?? 0) > 0 ? "text-gain" : "text-loss")}>
                      {marketQuotes[a.symbol]?.dayChangePercent == null ? '—' : `${(marketQuotes[a.symbol].dayChangePercent ?? 0) >= 0.005 ? '+' : ''}${Math.abs(marketQuotes[a.symbol].dayChangePercent ?? 0) < 0.005 ? '0.00' : marketQuotes[a.symbol].dayChangePercent!.toFixed(2)}%`} · 1D
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => router.push('/portfolio')}
              className="w-full mt-3 py-2 rounded-xl border border-border text-xs font-bold uppercase tracking-wide text-gray-400 hover:bg-foreground/5 transition-all text-center">
              {t("portfolio")} →
            </button>
          </div>
        </div>

        {/* ─── Modals ──────────────────────────────────────────────── */}
        <AddAssetModal variant="portfolio" isOpen={isAddAssetOpen} onClose={() => setIsAddAssetOpen(false)} />
        <AddCashflowModal isOpen={isAddCashflowOpen} onClose={() => setIsAddCashflowOpen(false)} />

        <Modal isOpen={isImportOpen} onClose={() => { setIsImportOpen(false); resetImport(); }} title={language === 'th' ? 'นำเข้าหุ้นจาก Excel' : 'Import investments from Excel'}>
          <p className="mb-3 text-xs text-gray-400">นำเข้าข้อมูลจากภายนอก: รายการซื้อในไฟล์บันทึกเป็นสินทรัพย์ที่ถืออยู่แล้ว โดยไม่ตัดเงินจากกระเป๋า</p>
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-foreground/[0.03] p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-gain/10 p-2 text-gain"><FileSpreadsheet size={18} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">{language === 'th' ? 'เริ่มจากไฟล์ตัวอย่าง' : 'Start with the template'}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-400">{language === 'th' ? 'ไฟล์จะใส่รายชื่อพอร์ตของคุณในช่อง Broker เป็น dropdown เลือกพอร์ตเดิมได้ทันที หรือพิมพ์ชื่อใหม่เพื่อให้ระบบสร้างพอร์ตตอนนำเข้า' : 'The Broker dropdown includes your existing portfolios. Select one to import into it, or type a new name to create a portfolio during import.'}</p>
                  <button type="button" onClick={downloadImportTemplate} disabled={isTemplateDownloading} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-foreground disabled:cursor-wait disabled:opacity-60"><Download size={14} />{isTemplateDownloading ? (language === 'th' ? 'กำลังสร้างไฟล์…' : 'Preparing file…') : (language === 'th' ? 'ดาวน์โหลดไฟล์ตัวอย่าง' : 'Download starter file')}</button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gain/20 bg-gain/5 p-3 text-xs text-gray-300">
              {language === 'th'
                ? 'ระบบจับคู่ชื่อ Broker ในไฟล์กับพอร์ตที่มีอยู่โดยไม่สนตัวพิมพ์เล็กใหญ่ หากไม่พบชื่อที่ตรงกัน ระบบจะสร้างพอร์ตลงทุนใหม่พร้อมบัญชีเงินสด THB และ USD ให้'
                : 'Broker names are matched to existing portfolios without case sensitivity. A name that is not found creates a new investment portfolio with THB and USD cash accounts.'}
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-5 py-7 text-center transition hover:border-gain/40 hover:bg-gain/5">
              <Upload size={25} className="text-gray-500" />
              <span className="text-sm font-bold text-foreground">{language === 'th' ? 'เลือกไฟล์ Excel เพื่อพรีวิว' : 'Choose an Excel file to preview'}</span>
              <span className="text-xs text-gray-500">XLSX, XLSM, XLS</span>
              <input type="file" accept={IMPORT_FILE_TYPES} onChange={handleStockFile} className="hidden" />
            </label>

            {importFileName && (
              <div className="rounded-xl border border-border bg-black/10 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><FileSpreadsheet size={15} className="text-gain" />{importFileName}</div>
                {importRows.length > 0 && <div className="mt-3 overflow-hidden rounded-lg border border-foreground/5">
                  <div className="grid grid-cols-[1fr_.85fr_.65fr_.85fr_.65fr_1fr] gap-2 bg-foreground/[0.04] px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-500"><span>Ticker</span><span>Action</span><span>Qty</span><span>Price</span><span>Currency</span><span>Broker</span></div>
                  {importRows.slice(0, 4).map(row => <div key={`${row.row}-${row.symbol}`} className="grid grid-cols-[1fr_.85fr_.65fr_.85fr_.65fr_1fr] gap-2 border-t border-foreground/5 px-3 py-2 text-xs text-gray-300"><span className="font-bold text-foreground">{row.symbol}</span><span>{row.type}</span><span>{row.shares.toLocaleString()}</span><span>{row.price.toLocaleString()}</span><span>{row.currency}</span><span className={row.broker ? 'truncate text-gray-300' : 'text-warning'}>{row.broker || (activePortfolio?.kind === 'trading' ? activePortfolio.name : 'ต้องระบุ')}</span></div>)}
                </div>}
                {importRows.length > 4 && <p className="mt-2 text-xs text-gray-500">{language === 'th' ? `และอีก ${importRows.length - 4} รายการ` : `and ${importRows.length - 4} more`}</p>}
              </div>
            )}

            {importErrors.length > 0 && <div className="rounded-xl border border-loss/20 bg-loss/5 p-3 text-xs text-loss"><div className="flex items-center gap-1.5 font-bold"><CircleAlert size={14} />{language === 'th' ? 'รายการที่ข้าม' : 'Rows skipped'}</div><ul className="mt-1.5 space-y-1 text-xs">{importErrors.slice(0, 3).map(error => <li key={error}>{error}</li>)}</ul></div>}

            {importStatus.type !== 'idle' && <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold", importStatus.type === 'success' ? 'border-gain/20 bg-gain/5 text-gain' : importStatus.type === 'error' ? 'border-loss/20 bg-loss/5 text-loss' : 'border-border bg-foreground/[0.03] text-gray-300')}>
              {importStatus.type === 'success' && <CheckCircle2 size={15} />}{importStatus.message}
            </div>}

            <div className="flex gap-3 pt-1">
              <button onClick={() => { setIsImportOpen(false); resetImport(); }} className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-bold text-gray-300 transition hover:bg-foreground/5">{language === 'th' ? 'ยกเลิก' : 'Cancel'}</button>
              <button onClick={importStocks} disabled={importRows.length === 0 || importStatus.type === 'importing'} className="flex-[1.5] rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{importStatus.type === 'importing' ? (language === 'th' ? 'กำลังนำเข้า…' : 'Importing…') : (language === 'th' ? `ยืนยัน ${importRows.length || ''} รายการ` : `Import ${importRows.length || ''} items`)}</button>
            </div>
            <p className="text-center text-xs leading-4 text-gray-600">{language === 'th' ? 'ไฟล์ XLSM จะอ่านเฉพาะข้อมูลในชีตและจะไม่เรียกใช้ macro' : 'XLSM files are read as worksheet data only; macros are never run.'}</p>
          </div>
        </Modal>
      </div>
    </div>
  );
}
