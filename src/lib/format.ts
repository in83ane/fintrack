import { format } from 'date-fns';

export function getPnLColor(value: number): string {
  if (value > 0) return 'text-gain'; // Match the app's standard green
  if (value < 0) return 'text-loss'; // Match the app's standard red
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

/** Display rounding owns the sign: -0 and a negative rounded zero are zero. */
export function formatFixed(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = value.toFixed(decimals);
  return Number(rounded) === 0 ? (0).toFixed(decimals) : rounded;
}
export function formatPercent(value: number, decimals: number = 2): string {
  const rounded = formatFixed(value, decimals);
  return rounded === '—' ? rounded : `${Number(rounded) > 0 ? '+' : ''}${rounded}%`;
}

export function formatProfessionalDate(dateString: string | Date): string {
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return format(date, 'dd MMM yyyy');
  } catch (e) {
    return 'Invalid Date';
  }
}
