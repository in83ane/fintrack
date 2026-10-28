import { getNetWorthSeries, type NetWorthRange, type NetWorthScope } from './net-worth-series';
self.onmessage = (event:MessageEvent<{id:number;scope:NetWorthScope;range:NetWorthRange}>) => {
  const {id,scope,range}=event.data;
  try { self.postMessage({id,data:getNetWorthSeries(scope,range)}); }
  catch { self.postMessage({id,error:true}); }
};
