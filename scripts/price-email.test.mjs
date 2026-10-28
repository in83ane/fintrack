import test from 'node:test';
import assert from 'node:assert/strict';
import {emailConfiguration,recipientAllowed,targetQuote,emailPayload,retryDecision,sendEmail,marketSymbol} from '../supabase/functions/price-email-alerts/core.js';
const alert={id:'test-alert',symbol:'AAPL',currency:'USD',target_price:100,direction:'above',current_price:101,triggered_at:'2026-10-27T00:00:00Z',quote_at:'2026-10-26T23:59:00Z',locale:'en',note:'personal target'};
test('no key or recipient means disabled; default sender only accepts verified owner email',()=>{
 assert.equal(emailConfiguration(()=>undefined).configured,false);
 assert.equal(emailConfiguration(k=>({RESEND_API_KEY:'test'})[k]).configured,false);
 const config=emailConfiguration(k=>({RESEND_API_KEY:'test',RESEND_TEST_RECIPIENT:'Me@host.dev'})[k]);
 assert.equal(config.configured,true);assert.equal(config.testMode,true);
 assert.equal(recipientAllowed({email:'me@host.dev',email_confirmed_at:'now'},config),true);
 assert.equal(recipientAllowed({email:'other@host.dev',email_confirmed_at:'now'},config),false);
 assert.equal(recipientAllowed({email:'me@host.dev'},config),false);
});
test('real custom sender still requires verified recipient account',()=>{
 const config=emailConfiguration(k=>({RESEND_API_KEY:'test',RESEND_FROM:'FinTrack <alerts@host.dev>'})[k]);
 assert.equal(config.configured,true);assert.equal(config.testMode,false);
 assert.equal(recipientAllowed({email:'user@host.dev',email_confirmed_at:'now'},config),true);
});
test('price checks convert native currency and reject missing FX or invalid quotes',()=>{
 assert.deepEqual(targetQuote(alert,{price:3400,currency:'THB'},34),{price:100,hit:true});
 assert.deepEqual(targetQuote({...alert,currency:'THB',target_price:3400},{price:100,currency:'USD'},34),{price:3400,hit:true});
 assert.equal(targetQuote(alert,{price:3400,currency:'THB'},null),null);
 assert.equal(targetQuote(alert,{price:100,currency:'JPY'},34),null);
 for(const price of [0,-1,NaN,Infinity])assert.equal(targetQuote(alert,{price,currency:'USD'},34),null);
 assert.equal(targetQuote({...alert,direction:'below'},{price:100,currency:'USD'},34).hit,true);
});
test('crypto aliases preserve source symbol matching',()=>{
 assert.equal(marketSymbol('btc'),'BTC-USD');assert.equal(marketSymbol('ptt.bk'),'PTT.BK');
});
test('email content is plain text, localized and uses only the supplied verified address',()=>{
 const payload=emailPayload({...alert,note:'<script>not HTML</script>'},'delivered@resend.dev','FinTrack <onboarding@resend.dev>');
 assert.deepEqual(payload.to,['delivered@resend.dev']);assert.equal(payload.html,undefined);
 assert.ok(payload.text.includes('$101.00'));assert.ok(payload.text.includes('Asia/Bangkok'));
 const thai=emailPayload({...alert,locale:'th'},'delivered@resend.dev','sender');
 assert.ok(thai.subject.includes('ถึงราคาแจ้งเตือน'));
});
test('free provider limits skip delivery instead of charging or switching providers',()=>{
 assert.deepEqual(retryDecision(429,new Date().toISOString()),{status:'skipped',last_error:'provider_limit_reached'});
});
test('retries stop before the provider 24h idempotency window expires',()=>{
 const now=Date.now();
 assert.equal(retryDecision(0,new Date(now-23*3600_000).toISOString(),now).status,'failed');
 assert.equal(retryDecision(503,new Date(now).toISOString(),now).status,'pending');
 for(const code of [400,401,403,409,422])assert.equal(retryDecision(code,new Date(now).toISOString(),now).status,'failed');
});
test('same immutable payload and idempotency key on retry; no actual email sent in tests',async()=>{
 const calls=[],payload=emailPayload(alert,'delivered@resend.dev','sender');
 const fake=async(url,options)=>{calls.push({url,...options});return Response.json({id:'provider-id'});};
 for(let i=0;i<2;i++)assert.deepEqual(await sendEmail(alert,payload,'test-key',fake),{ok:true,id:'provider-id'});
 assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
 assert.equal(calls[0].url,'https://api.resend.com/emails');
});


test('verified-domain mode accepts different verified accounts even when an old test recipient remains configured',()=>{
 const config=emailConfiguration(k=>({RESEND_API_KEY:'test',RESEND_FROM:'FinTrack <alerts@host.dev>',RESEND_TEST_RECIPIENT:'owner@host.dev'})[k]);
 const users=[{email:'first@gmail.com',email_confirmed_at:'now'},{email:'second@outlook.com',email_confirmed_at:'now'}];
 for(const user of users)assert.equal(recipientAllowed(user,config),true);
 const messages=users.map(user=>emailPayload(alert,user.email,config.from));
 assert.deepEqual(messages.map(message=>message.to),[['first@gmail.com'],['second@outlook.com']]);
 assert.equal(recipientAllowed({email:'unverified@gmail.com'},config),false);
});
