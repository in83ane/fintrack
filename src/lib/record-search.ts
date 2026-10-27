import { localCashflowDay, displayCashflowCategory } from './cashflow-selectors';

/** One matcher for Ledger and Cash Flow; ISO dates, localized dates and free text. */
export function matchesRecord(query:string, record:{date?:string;occurredAt?:string;note?:string;category?:string;type?:string;asset?:string;symbol?:string}, extra:string[]=[]):boolean {
  const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50));
  const tokens=normalize(query).trim().split(/\s+/).filter(Boolean);
  if(!tokens.length)return true;
  const date=record.date||record.occurredAt||'';
  let dates='';
  if(date&&Number.isFinite(Date.parse(date))) {
    const d=new Date(date),day=localCashflowDay(date),[y,m,n]=day.split('-');
    dates=[day,`${n}/${m}/${y}`,`${Number(n)}/${Number(m)}/${Number(y)+543}`,...['th-TH','en-US'].flatMap(locale=>['short','long'].map(month=>d.toLocaleDateString(locale,{timeZone:'Asia/Bangkok',year:'numeric',month:month as 'short'|'long',day:'numeric'})))].join(' ');
  }
  const haystack=normalize([record.note,record.category,record.type,record.asset,record.symbol,dates,...extra,displayCashflowCategory(record.category||'','th'),displayCashflowCategory(record.category||'','en')].filter(Boolean).join(' '));
  return tokens.every(token=>haystack.includes(token));
}
