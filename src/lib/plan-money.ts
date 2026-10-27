import { planDates, planWeekStart, ruleOnDay, type PlanRule, type PlanVersion } from './plan-recurrence';

/** Never parse monetary input via floating-point multiplication. */
export function planMinor(value: string): bigint {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw new Error('Invalid money');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function planMajor(value: bigint): string {
  const negative = value < 0n; const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export interface PlanMonthSchedule { days: string[]; groups: Record<string, { days: string[]; quota: number }>; required: number }
/** Month-clipped ISO weeks. Pauses/before-start dates never contribute capacity. */
export function planMonthSchedule(rule: PlanRule, month: string, versions: readonly PlanVersion[] = []): PlanMonthSchedule {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid month');
  const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const days = planDates(rule, `${month}-01`, end.toISOString().slice(0,10), versions);
  const groups: PlanMonthSchedule['groups'] = {};
  for (const day of days) {
    const current = ruleOnDay(rule, versions, day);
    const key = current.frequency === 'weekly_target' ? `week:${planWeekStart(day)}` : day;
    const group = groups[key] ??= { days: [], quota: 0 };
    group.days.push(day);
    group.quota = current.frequency === 'weekly_target' ? Math.min(current.weekly_target, group.days.length) : 1;
  }
  return { days, groups, required: Object.values(groups).reduce((n,g) => n+g.quota,0) };
}
/** Snapshots already recorded are immutable. The completing check gets the remainder. */
export function planSplitAmount(target: bigint, required: number, existing: readonly bigint[]): bigint {
  if (target < 0n || !Number.isSafeInteger(required) || required < 1 || existing.some(n=>n<0n)) throw new Error('Invalid allocation');
  if (existing.length >= required) return 0n;
  const remaining = target - existing.reduce((sum,n)=>sum+n,0n);
  if (remaining < 0n) throw new Error('Recorded money exceeds target');
  if (existing.length === required - 1) return remaining;
  const share = target / BigInt(required);
  return share < remaining ? share : remaining;
}
