/** Calendar-only PLAN rules. UTC is used for date arithmetic, never for the user's day. */
export type PlanFrequency = 'daily' | 'weekdays' | 'weekly_target' | 'monthly';
export type PlanStatus = 'active' | 'paused' | 'archived';
export interface PlanRule {
  starts_on: string;
  ends_on: string | null;
  frequency: PlanFrequency;
  days_of_week: number[]; // ISO: Monday = 1, Sunday = 7
  weekly_target: number;
  monthly_day: number;
  status: PlanStatus;
}
export interface PlanVersion { effective_on: string; rule: PlanRule }
export interface DailyPlan extends PlanRule {
  id: string; name: string; amount: number; amount_period: 'day' | 'month';
  bucket_id: string | null; currency: string | null; archived: boolean;
  has_money_history: boolean;
}
/** Temporary phase-1 gate. Remove only when the phase-2 money allocator is verified. */
export function blocksMonthlyMoneyRule(plan: { amount: number; amount_period: 'day' | 'month'; frequency: PlanFrequency }): boolean {
  return plan.amount > 0 && plan.amount_period === 'month' && plan.frequency !== 'daily';
}
export function validPlanDate(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const value = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === day;
}
export function shiftPlanDate(day: string, count: number): string {
  if (!validPlanDate(day)) throw new Error('Invalid calendar date');
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function planWeekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
  return shiftPlanDate(day, 1 - weekday);
}
export function validatePlanRule(rule: PlanRule): string | null {
  if (!validPlanDate(rule.starts_on) || (rule.ends_on !== null && (!validPlanDate(rule.ends_on) || rule.ends_on < rule.starts_on))) return 'dates';
  if (!['daily', 'weekdays', 'weekly_target', 'monthly'].includes(rule.frequency)) return 'frequency';
  if (!['active', 'paused', 'archived'].includes(rule.status)) return 'status';
  if (!Array.isArray(rule.days_of_week) || rule.days_of_week.some(d => !Number.isInteger(d) || d < 1 || d > 7) || new Set(rule.days_of_week).size !== rule.days_of_week.length) return 'weekdays';
  if (rule.frequency === 'weekdays' && rule.days_of_week.length === 0) return 'weekdays';
  if (!Number.isInteger(rule.weekly_target) || rule.weekly_target < 1 || rule.weekly_target > 7) return 'weekly_target';
  if (!Number.isInteger(rule.monthly_day) || rule.monthly_day < 1 || rule.monthly_day > 31) return 'monthly_day';
  return null;
}
export function ruleOnDay(current: PlanRule, versions: readonly PlanVersion[], day: string): PlanRule {
  let match: PlanVersion | undefined;
  for (const version of versions) if (version.effective_on <= day && (!match || version.effective_on > match.effective_on)) match = version;
  return match?.rule ?? current;
}
export function isPlanDay(rule: PlanRule, day: string): boolean {
  if (!validPlanDate(day) || day < rule.starts_on || (rule.ends_on !== null && day > rule.ends_on) || rule.status !== 'active') return false;
  const date = new Date(`${day}T00:00:00Z`);
  if (rule.frequency === 'weekdays') return rule.days_of_week.includes(date.getUTCDay() || 7);
  if (rule.frequency === 'monthly') {
    const monthEnd = new Date(date);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
    const last = monthEnd.getUTCDate();
    return date.getUTCDate() === Math.min(rule.monthly_day, last);
  }
  return true; // Flexible weekly goals allow every day, including checks over the quota.
}
/** Explicit bounded viewport: an endless rule never generates an endless list. */
export function planDates(rule: PlanRule, from: string, to: string, versions: readonly PlanVersion[] = []): string[] {
  if (!validPlanDate(from) || !validPlanDate(to) || from > to) throw new Error('Invalid calendar range');
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (span > 3660) throw new Error('Calendar range is too large');
  const result: string[] = [];
  for (let day = from; day <= to; day = shiftPlanDate(day, 1)) {
    if (isPlanDay(ruleOnDay(rule, versions, day), day)) result.push(day);
    if (day === to) break;
  }
  return result;
}
export function weeklyPlanProgress(rule: PlanRule, dates: readonly string[], day: string) {
  const start = planWeekStart(day), end = shiftPlanDate(start, 6);
  const count = new Set(dates.filter(d => d >= start && d <= end)).size;
  return { count, credited: Math.min(count, rule.weekly_target), target: rule.weekly_target, complete: count >= rule.weekly_target };
}
