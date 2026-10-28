"use client";
import { Sk } from '@/src/components/skeleton';
import { useApp } from '@/src/context/AppContext';
import {AssetHeader,AssetChartToolbar,AssetChartFooter,ASSET_METRICS,JOURNEY_TITLE,StatCard} from './AssetChrome';
import { layout } from './skeleton-layout';
export default function AssetSkeleton(){const {t}=useApp();return <Sk.Root name="asset" className={layout.root}>
<AssetHeader identity={<div className="flex items-center gap-3 px-4"><Sk.Tile/><div className="space-y-2"><Sk.Line height={32} width={180}/><Sk.Line height={24} width={70}/></div></div>} price={<div className="flex flex-col items-end gap-2"><Sk.Line width={190} height={40}/><Sk.Line width={120} height={20}/><Sk.Line width={90} height={16}/></div>}/>
<div className={layout.grid}><div className="space-y-6 overflow-y-auto lg:col-span-2"><div className={layout.metrics}>{Object.values(ASSET_METRICS).map((m,i)=><StatCard key={m.key} label={t(m.key)} icon={m.icon} isActive={i===0}><Sk.Line height={24} width="70%"/><Sk.Line height={16} width="40%" className="mt-1"/></StatCard>)}</div><div className="rounded-[1.5rem] border border-white/5 bg-[#1C1B1B] p-6"><AssetChartToolbar/><Sk.Chart height={400}/><AssetChartFooter/></div></div><div className="flex flex-col overflow-hidden rounded-[1.5rem] border border-white/5 bg-[#1C1B1B]"><div className="border-b border-white/5 p-6"><h2 className="text-lg font-bold">{t(JOURNEY_TITLE)}</h2></div>{[0,1,2,3].map(i=><Sk.Row key={i} index={i} className="flex items-center gap-3 p-5"/>)}</div></div></Sk.Root>;}
