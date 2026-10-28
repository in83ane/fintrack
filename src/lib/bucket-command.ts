/** An uncertain response must replay the same request, timestamp, rates and IDs.
 * sessionStorage retains the request across a tab reload. No auth tokens stored.
 * After success, a new identical submission is a new intentional transaction. */
type Reply={data:any;error:any};
const writerSchemaErrors=new Set(['PGRST202','PGRST203','PGRST204','PGRST205','42883','42P01','42703']);
function errorCode(error:unknown):string {
 const code=error&&typeof error==='object'?(error as {code?:unknown}).code:undefined;
 return typeof code==='string'&&/^(?:PGRST\d{3}|[0-9A-Z]{5})$/.test(code)?code:'';
}

/** A schema rejection cannot be repaired by repeating a payment. Stop further
 * writer RPCs in this page until a reload after the release has been repaired.
 * Never fall back to direct table writes or change the idempotency payload. */
export function createBucketWriterTransport(rpc:(name:string,args:any)=>PromiseLike<Reply>){
 let unavailableCode='';
 return async(name:string,args:any):Promise<Reply>=>{
  if(unavailableCode)return {data:null,error:{code:unavailableCode}};
  const reply=await rpc(name,args);
  const code=errorCode(reply.error);
  if(writerSchemaErrors.has(code))unavailableCode=code;
  return reply;
 };
}
type Pending={owner:string;key:string;request_id:string;command:any;flight?:Promise<Reply>};
export function createBucketCommander(transport:(args:{request_id:string;command:any})=>Promise<Reply>,storage?:Pick<Storage,'getItem'|'setItem'>){
 const pending=new Map<string,Pending>();const storageKey='fintrack-bucket-pending-v1';
 const getStorage=()=>storage||(typeof window!=='undefined'?window.sessionStorage:undefined);
 let loaded=false;
 const load=()=>{if(loaded)return;loaded=true;try{for(const e of JSON.parse(getStorage()?.getItem(storageKey)||'[]'))pending.set(e.owner,e);}catch{/* Memory still protects retries when storage is unavailable. */}};
 const persist=()=>{try{getStorage()?.setItem(storageKey,JSON.stringify([...pending.values()].map(({flight,...e})=>e)));}catch{/* Private mode can deny storage. */}};
 return async(owner:string,command:any):Promise<Reply>=>{
  load();
  // New-record forms regenerate the clock/quote on submit. Retry the original
  // snapshot for the same business day and input, never a second debit.
  const intent={...command,...(command.rows?{rows:command.rows.map(({date,rate_at_time,...r}:any)=>({...r,date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date))}))}:{})};
  const key=JSON.stringify(intent);let entry=pending.get(owner);
  if(entry&&entry.key!==key)return {data:null,error:{message:'Pending uncertain payment. Retry the original details before starting another operation.'}};
  if(!entry){entry={owner,key,request_id:crypto.randomUUID(),command:{...command,...(command.rows?{rows:command.rows.map((r:any)=>({...r,id:r.id||crypto.randomUUID()}))}:{})}};pending.set(owner,entry);persist();}
  if(entry.flight)return entry.flight;
  const saved=entry;
  saved.flight=(async()=>{try{
   const result=await transport({request_id:saved.request_id,command:saved.command});
   if(!result.error||/^(?:[0-9]{2}|[A-Z][0-9]|XX)[0-9A-Z]{3}$/.test(result.error.code||'')||String(result.error.code||'').startsWith('PGRST')){pending.delete(owner);persist();}
   return result;
  }catch(error){return {data:null,error:{message:error instanceof Error?error.message:String(error)}};}finally{saved.flight=undefined;}})();
  return saved.flight;
 };
}

/** Exact cent allocation for new distributions; remainder goes to the last
 * nonzero-weight destination. Does not round or repair existing records. */
export function splitBucketMoney(amount:string,weights:number[]):number[]{
 if(!/^\d+(\.\d{1,2})?$/.test(amount))throw Error('Use at most two decimal places');
 const [whole,fraction='']=amount.split('.');const minor=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(minor>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Amount is too large');
 if(weights.some(w=>!Number.isFinite(w)||w<0))throw Error('Invalid weights');
 const units=weights.map(w=>BigInt(Math.round(w*10000))),total=units.reduce((a,b)=>a+b,0n);
 if(total<=0n)throw Error('Choose allocation targets');
 let last=units.length-1;while(last>=0&&units[last]===0n)last--;let spent=0n;
 return units.map((w,i)=>{const part=i===last?minor-spent:minor*w/total;spent+=part;return Number(part)/100;});
}

export function bucketWriteMessage(error:unknown,th:boolean){
 const message=typeof error==='string'?error:error&&typeof error==='object'&&typeof (error as {message?:unknown}).message==='string'?(error as {message:string}).message:'';
 const code=errorCode(error);
 if(writerSchemaErrors.has(code))return (th?'ระบบบันทึกยังไม่พร้อม กรุณาแจ้งผู้ดูแลเพื่อตรวจรุ่นฐานข้อมูล แล้วโหลดหน้าใหม่หลังแก้ไข':'Saving is unavailable. Ask the administrator to check the database release, then reload after the repair.')+` (${code})`;
 if(['PGRST301','PGRST302','PGRST303','28000','28P01'].includes(code))return (th?'เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่':'Your session has expired or is invalid. Sign in again.')+` (${code})`;
 if(code==='42501')return (th?'ไม่มีสิทธิ์บันทึกรายการนี้ กรุณาให้ผู้ดูแลตรวจสิทธิ์':'Saving is not permitted. Ask the administrator to check access permissions.')+` (${code})`;
 if(/Pending uncertain/i.test(message))return th?'ยังไม่ทราบผลรายการก่อนหน้า กรุณาลองส่งข้อมูลเดิมอีกครั้งก่อนทำรายการใหม่':'Previous payment status is uncertain. Retry its original details before a new operation.';
 if(/Insufficient/i.test(message))return th?'ยอดเงินไม่พอ รายการนี้ยังไม่ได้บันทึก กรุณาตรวจยอดล่าสุด':'Insufficient funds. Nothing was saved. Check the latest balance.';
 if(/Unlinked|Unresolved|mismatch: audit/i.test(message))return th?'ประวัติเดิมจับคู่ไม่ได้หรือยอดไม่ตรง ต้องตรวจสอบข้อมูลก่อน ระบบยังไม่ได้แก้ยอด':'Legacy records are unlinked, unresolved or inconsistent. Audit required; nothing changed.';
 if(/original source|linked|PLAN/i.test(message))return th?'รายการนี้ผูกกับ PLAN หรือการโอน กรุณาจัดการจากต้นทาง':'Manage this linked record from its original plan or transfer.';
 if(/Use deposit|currency is fixed/i.test(message))return th?'เปลี่ยนยอดด้วยฝาก/ถอนเท่านั้น และเปลี่ยนสกุลเงินของกระเป๋าเดิมไม่ได้':'Use deposit/withdraw to change a balance. Existing wallet currency is fixed.';
 return (th?'บันทึกไม่สำเร็จ กรุณาลองใหม่ด้วยข้อมูลเดิม':'Could not save. Retry with the same details.')+(code?` (${code})`:'');
}
