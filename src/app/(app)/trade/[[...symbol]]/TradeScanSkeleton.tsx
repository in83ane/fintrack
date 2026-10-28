"use client";
import {Sk} from '@/src/components/skeleton';
import {layout} from './skeleton-layout';
export function TradeScanSkeleton(){return <Sk.Root name="trade-scan" className={layout.scan}>{[0,1,2,3].map(i=><Sk.Card key={i} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4"><div className="flex justify-between"><Sk.Line width={70}/><Sk.Pill width={45} height={20}/></div><Sk.Line width={120} height={28} className="mt-1"/><Sk.Line width={85} height={14} className="mt-1"/><Sk.Block height={4} className="mt-1"/></Sk.Card>)}</Sk.Root>;}
