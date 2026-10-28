// Probe only as anon, with deliberately invalid arguments and no user JWT.
// Ready means PostgREST finds the exact RPC and denies anonymous execution.
// This does not certify signed-JWT behavior, data audits or concurrency coverage.
const probes=[
 ['write_bucket_cash',{request_id:null,command:{}}],
 ['save_cash_bucket',{request_id:null,bucket_id:null,details:{},opening_rate:null}],
 ['remove_empty_cash_bucket',{bucket_id:null}],
];
export async function assertBucketWriterApiReady({url,key,fetcher=fetch}){
 let endpoint;
 try{endpoint=new URL(url);}catch{throw Error('BUCKET_RELEASE_INVALID_TARGET');}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash
  ||endpoint.pathname!=='/'||!key)throw Error('BUCKET_RELEASE_INVALID_TARGET');
 for(const [name,args] of probes){
  let response,body;
  try{
   response=await fetcher(new URL(`/rest/v1/rpc/${name}`,endpoint),{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(args),
   });
   body=await response.json();
  }catch{throw Error(`BUCKET_RELEASE_UNREACHABLE: ${name}`);}
  if(![401,403].includes(response.status)||body?.code!=='42501'
   ||body?.message!==`permission denied for function ${name}`){
   const code=/^(?:PGRST\d{3}|[0-9A-Z]{5})$/.test(body?.code||'')?body.code:'UNEXPECTED_RESPONSE';
   throw Error(`BUCKET_RELEASE_NOT_READY: ${name} (${code})`);
  }
 }
 return {passed:probes.length};
}
