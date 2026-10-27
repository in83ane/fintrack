import React from 'react';
import { cn } from '@/src/lib/utils';
import { decimal, formatAmount, isFxCurrency } from '@/src/lib/fx';
import type { Decimal } from '@/src/lib/cost-basis-ledger';

/** Portfolio's money typography, shared without importing its page or hide state. */
export function MoneyValue({value,exactValue,cur,className,decimalClass='text-[0.6em]',curClass='text-[0.5em]',symbol=false}: {
  value:number; exactValue?:Decimal|null; cur:string; className?:string; decimalClass?:string; curClass?:string; symbol?:boolean;
}) {
  if (!isFxCurrency(cur) || (exactValue===undefined&&!Number.isFinite(value))) return <span className={className}>unresolved</span>;
  if(exactValue===null) return <span className={className}>— <span className={curClass}>{cur}</span></span>;
  const [int,dec]=(exactValue===undefined?Math.abs(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):formatAmount(exactValue).replace('-','')).split('.');
  const negative=exactValue===undefined?value<0:exactValue.cmp(decimal('0'))<0;
  return <span className={cn('tabular-nums',className)}>{negative&&Number(`${int.replaceAll(',','')}.${dec}`)!==0?'-':''}{symbol?(cur==='THB'?'฿':'$'):''}{int}<span className={cn('font-semibold',decimalClass)}>.{dec}</span>{!symbol&&<> <span className={cn('font-bold',curClass)}>{cur}</span></>}</span>;
}
