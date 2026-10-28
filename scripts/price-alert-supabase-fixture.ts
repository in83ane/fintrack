// Test adapter only: the production hook still executes its real CRUD/status code.
function query(table:string) {
  let operation='list',body:any=null,id='';
  const builder:any={
    select:()=>builder,order:()=>builder,limit:()=>builder,
    insert:(value:any)=>{operation='create';body=value;return builder;},
    delete:()=>{operation='delete';return builder;},
    eq:(key:string,value:string)=>{if(key==='id')id=value;return builder;},
    then:(resolve:any,reject:any)=>fetch('/qa-email-rows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table,operation,body,id})}).then(r=>r.json()).then(resolve,reject),
  };
  return builder;
}
export const supabase={from:query,functions:{invoke:async()=>fetch('/qa-email-status').then(r=>r.json())}};
