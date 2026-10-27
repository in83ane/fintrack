// Read-only HTTP check. Uses only the app's public key; never logs credentials.
// node --env-file=.env --env-file=.env.local scripts/plan-api-exposure-check.mjs
const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!base||!key)throw Error('Load the intended project public URL/key before running this check');
const response=await fetch(new URL('/rest/v1/',base),{headers:{apikey:key,'Accept-Profile':'plan_private',...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`}:{})}});
const body=await response.json();
const excluded=response.status===406&&body.code==='PGRST106';
console.log(JSON.stringify({project:new URL(base).hostname,httpStatus:response.status,code:body.code,privateSchemaExcluded:excluded}));
if(!excluded)throw Error('Could not confirm exclusion. Check Data API Exposed schemas; do not treat other errors as proof.');
