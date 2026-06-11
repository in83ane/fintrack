import { format } from 'date-fns';

export function getPnLColor(value: number): string {
  if (value > 0) return 'text-[#4EDEA3]'; // Match the app's standard green
  if (value < 0) return 'text-[#FFB4AB]'; // Match the app's standard red
  return 'text-slate-400';
}

export function formatPnL(value: number, formatter: (val: number) => string): string {
  const sign = value > 0 ? '+' : '';
  // Avoid duplicating negative signs if the formatter includes it
  const absValueFormatter = (val: number) => {
    const formatted = formatter(val);
    return value < 0 && formatted.startsWith('-') ? formatted.slice(1) : formatted;
  };
  return `${sign}${value < 0 ? '-' : ''}${absValueFormatter(Math.abs(value))}`;
}

export function formatPercent(value: number, decimals: number = 2): string {
  if (isNaN(value) || !isFinite(value)) return '0.00%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatProfessionalDate(dateString: string | Date): string {
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return format(date, 'dd MMM yyyy');
  } catch (e) {
    return 'Invalid Date';
  }
}
