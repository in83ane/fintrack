import React from 'react';
import {Sk} from './skeleton';
export function LedgerRowsSkeleton({label}:{label:string}) { return <Sk.Root name="ledger-rows" data-ledger-loading aria-label={label}>{[0,1].map(g=><section key={g} className="mb-6"><div className="mb-2 flex h-[19px] items-center justify-between"><Sk.Line width={g?110:145} height={12}/><Sk.Line width={65} height={12}/></div><div className="overflow-hidden rounded-2xl border border-border bg-surface">{[0,1,2,3].map(i=><Sk.Row key={i} index={i+g} className="ledger-row pointer-events-none h-[73px]"/>)}</div></section>)}</Sk.Root>; }
