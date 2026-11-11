import { cashflowCategoryKey, localCashflowDay, transactionMoney, type CashflowRecord } from './cashflow-selectors';

export const expenseCategories = ['food', 'transport', 'utilities', 'entertainment', 'shopping', 'health', 'education', 'coffee', 'travel', 'investment', 'other'];
export const incomeCategories = ['salary', 'freelance', 'investment', 'dividend', 'gift', 'rental', 'other'];
export type TrackerKind = 'EXPENSE' | 'INCOME';
export const trackerKind = (tracker: ExpenseTracker): TrackerKind => tracker.kind ?? 'EXPENSE';
export type TrackerChoice = { activity_id: string; decision: 'include' | 'skip' };
export type ExpenseLine = { id: string; day: string; label: string; minor: number };
export type ExpenseTracker = {
  kind?: TrackerKind;
  choices?: TrackerChoice[];
  id: string; name: string; category: string; keywords: string[];
  opening_amount: number; currency: 'THB' | 'USD'; opening_fx: number;
};

export function normalizeComment(value: string) {
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
}
export function parseKeywords(value: string) {
  return [...new Set(value.split(/[,，\n]/u).map(normalizeComment).filter(Boolean))];
}
export function summarizeTracker(tracker: ExpenseTracker, records: readonly CashflowRecord[], trackers: readonly ExpenseTracker[], rates: Record<string,number>) {
  const category = cashflowCategoryKey(tracker.category);
  const keywords = tracker.keywords.map(normalizeComment);
  const kind = trackerKind(tracker);
  const openings = [tracker, ...(!keywords.length ? trackers.filter(item => trackerKind(item) === kind && item.id !== tracker.id && item.keywords.length && cashflowCategoryKey(item.category) === category) : [])];
  return summarizeExpenses(records.filter(record => isLedgerTrackerRecord(record,kind) && cashflowCategoryKey(record.category) === category),
    tracker.currency, rates, openings, keywords, tracker.choices);
}

export function isLedgerTrackerRecord(record: CashflowRecord, kind: TrackerKind) {
  return !record.isTransfer && (kind === 'INCOME' ? ['INCOME','DEPOSIT'] : ['EXPENSE','WITHDRAW']).includes(record.type);
}

export function spendingByCategory(records: readonly CashflowRecord[], trackers: readonly ExpenseTracker[], currency: ExpenseTracker['currency'], rates: Record<string,number>, kind: TrackerKind = 'EXPENSE') {
  const categories = new Map<string,{ key: string; label: string; records: CashflowRecord[]; openings: ExpenseTracker[] }>();
  function category(label?: string) {
    const key = cashflowCategoryKey(label);
    let group = categories.get(key);
    if (!group) {
      group = { key, label: label?.trim() || 'other', records: [], openings: [] };
      categories.set(key,group);
    }
    return group;
  }
  for (const record of records) {
    if (isLedgerTrackerRecord(record,kind)) category(record.category).records.push(record);
  }
  for (const tracker of trackers) {
    if (trackerKind(tracker) === kind && tracker.opening_amount > 0) category(tracker.category).openings.push(tracker);
  }
  return [...categories.values()].map(group => ({
    key: group.key, label: (kind === 'INCOME' ? incomeCategories : expenseCategories).includes(group.key) ? group.key : group.label,
    ...summarizeExpenses(group.records,currency,rates,group.openings),
  })).sort((a,b) => b.totalMinor - a.totalMinor || a.key.localeCompare(b.key));
}

function summarizeExpenses(records: readonly CashflowRecord[], currency: ExpenseTracker['currency'], rates: Record<string,number>,
  openings: readonly ExpenseTracker[], keywords: string[] = [], decisions: TrackerChoice[] = []) {
  const groups = new Map<string, { label: string; minor: number; count: number }>();
  const rows: ExpenseLine[] = [], suggestions: ExpenseLine[] = [], skipped: ExpenseLine[] = [];
  const choices = new Map(decisions.map(choice => [choice.activity_id, choice.decision]));
  const scope = { currency, exchangeRates: rates };
  let ledgerMinor = 0, missing = 0;
  for (const record of records) {
    // Ledger appends the source wallet after the user's comment.
    const label = (record.note || '').replace(/(?:^|\s+\|\s+)Paid from: .+$/iu,'').trim();
    const key = normalizeComment(label);
    const decision = choices.get(String(record.id));
    const included = !keywords.length || (decision !== 'skip' && (decision === 'include' || keywords.some(word => key.includes(word))));
    const money = transactionMoney(record, scope);
    if (!money) { if (included) missing++; continue; }
    const line = { id: String(record.id), day: localCashflowDay(record.date), label, minor: money.minor };
    if (!included) {
      (decision === 'skip' ? skipped : suggestions).push(line);
      continue;
    }
    const group = groups.get(key) || { label, minor: 0, count: 0 };
    group.minor += money.minor;
    group.count++;
    groups.set(key, group);
    ledgerMinor += money.minor;
    rows.push(line);
  }
  const openingItems = openings
    .filter(item => item.opening_amount > 0).map(item => ({
      id: item.id, name: item.name, minor: transactionMoney({ type: 'EXPENSE',date:'',originalAmount:item.opening_amount,currency:item.currency,fxRateTHB:item.opening_fx },scope)!.minor,
    }));
  const openingMinor = openingItems.reduce((sum,item) => sum + item.minor,0);
  const newest = (a: ExpenseLine,b: ExpenseLine) => b.day.localeCompare(a.day) || a.id.localeCompare(b.id);
  return { suggestions: suggestions.sort(newest), skipped: skipped.sort(newest), ledgerMinor, openingMinor, openingItems, totalMinor: ledgerMinor + openingMinor, missing,
    groups: [...groups.values()].sort((a,b) => b.minor-a.minor), rows: rows.sort(newest) };
}
