const request=(body:unknown)=>fetch('/qa-db',{method:'POST',body:JSON.stringify(body)}).then(r=>r.json());
export const supabase={rpc:(name:string,body:unknown)=>request({operation:'rpc',name,body}),from:(table:string)=>{
 let operation='select',body:any=null;const filters:any[]=[],orders:any[]=[];let range=[0,999];
 const b:any={select:()=>b,order:(key:string,options:any)=>{orders.push([key,options]);return b;},range:(a:number,z:number)=>{range=[a,z];return b;},eq:(key:string,value:any)=>{filters.push(['eq',key,value]);return b;},gte:(key:string,value:any)=>{filters.push(['gte',key,value]);return b;},lte:(key:string,value:any)=>{filters.push(['lte',key,value]);return b;},insert:(v:any)=>{operation='insert';body=v;return b;},update:(v:any)=>{operation='update';body=v;return b;},delete:()=>{operation='delete';return b;},then:(yes:any,no:any)=>request({table,operation,body,filters,orders,range}).then(yes,no)};return b;
}};
