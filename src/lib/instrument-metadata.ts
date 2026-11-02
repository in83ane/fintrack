/** Categories are persisted independently of the source trade's currency. */
export function assetAllocation(allocation?: string | null, type?: string | null, symbol?: string) {
  if (symbol?.toUpperCase() === 'X-SPACE') return 'Funds';
  if ([allocation,type].some(value => value && ['fund','funds','mutual_fund'].includes(value.toLowerCase()))) return 'Funds';
  for (const value of [allocation, type]) {
    if (value && ['gold', 'alternatives', 'fixed income', 'cash', 'equities'].includes(value.toLowerCase())) {
      return ({gold:'Gold',alternatives:'Alternatives','fixed income':'Fixed Income',cash:'Cash',equities:'Equities'} as Record<string,string>)[value.toLowerCase()];
    }
  }
  return 'Equities';
}

/** Preserve every wallet; two USD accounts are not duplicate records. */
export function portfolioCashCards<T extends {id:string; portfolioId:string; name:string; currency:string; kind:string}>(accounts: T[], balances: {accountId:string; balance:number}[]) {
  const amounts = new Map(balances.map(balance => [balance.accountId, balance.balance]));
  return [...new Map(accounts.filter(a => a.kind === 'cash' && ['USD','THB'].includes(a.currency)).map(a => [a.id,a])).values()]
    .map(a => ({id:a.id,brokerId:a.portfolioId,name:a.name,currency:a.currency as 'USD'|'THB',balance:amounts.get(a.id) || 0}));
}

export function holdingGroupPlacement(holding:{brokerId:string; market:string}, previous:string[]|undefined, groups:{id:string;brokerId:string;isDefault:boolean;market?:string}[], defaultId:string) {
  if (!previous) return [defaultId];
  const valid = previous.filter(id => groups.some(g => g.id===id && g.brokerId===holding.brokerId && (!g.isDefault || g.market===holding.market)));
  // Repair a saved stock placement after the instrument becomes a fund.
  const wrongCategory = previous.some(id => groups.some(g => g.id===id && g.isDefault && g.market!==holding.market));
  if (wrongCategory && !valid.includes(defaultId)) valid.push(defaultId);
  // An intentional empty placement stays empty during price refreshes.
  return valid;
}
