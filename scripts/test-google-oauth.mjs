import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

function load(path, dependencies) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: name => {
      if (!(name in dependencies)) throw Error('Unexpected dependency: ' + name);
      return dependencies[name];
    },
    URL, Response, Headers, AbortSignal, fetch, process: { env: { NODE_ENV: 'production' } },
  }, { filename: path });
  return exports;
}
const helpers = load('src/lib/oauth-pkce.ts', {});
const native = load('src/lib/native-oauth.ts', {});
const { oauthAuthOptions, oauthRequestOrigin, OAUTH_VERIFIER_COOKIE } = helpers;
assert.equal(oauthRequestOrigin('https://app.example', 'app.example'), 'https://app.example');
assert.equal(oauthRequestOrigin('http://localhost:3000', 'localhost:3000'), 'http://localhost:3000');
for (const [origin, host] of [[null, null], ['https://evil.example', 'app.example'],
  ['http://app.example', 'app.example'], ['https://user:pass@app.example', 'app.example']]) {
  assert.throws(() => oauthRequestOrigin(origin, host));
}
let jar, writes, expectedVerifier, exchanges, rejectExchange, exchangeThrows;
const store = {
  get: name => jar.has(name) ? { value: jar.get(name) } : undefined,
  set: (name, value, options) => {
    writes.push({ name, value, options });
    if (options.maxAge === 0) jar.delete(name); else jar.set(name, value);
  },
};
function reset() {
  jar = new Map(); writes = []; exchanges = 0; rejectExchange = false; exchangeThrows = false;
}
reset();
const route = load('src/app/auth/callback/route.ts', {
  'next/server': { NextResponse: { redirect: url => ({ status: 307, headers: new Headers({ location: String(url) }) }) } },
  'next/headers': { cookies: async () => store },
  '@/src/lib/env': { getSupabaseUrl: () => 'https://auth.example', getSupabaseAnonKey: () => 'test-public-key' },
  '@/src/lib/oauth-pkce': helpers,
  '@/src/lib/native-oauth': native,
  '@supabase/supabase-js': { createClient: (url, key, options) => createClient(url, key, {
    ...options,
    global: { fetch: async (url, init) => {
      exchanges++;
      assert.match(String(url), /token\?grant_type=pkce/);
      const body = JSON.parse(init.body);
      assert.equal(body.code_verifier, expectedVerifier);
      assert.equal(body.auth_code, 'test-code');
      if (exchangeThrows) throw new Error('Network failure');
      if (rejectExchange) return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Rejected' }), { status: 400 });
      return new Response(JSON.stringify({
        access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer',
        user: { id: 'fixture-user', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  }) },
});
async function start() {
  const client = createClient('https://auth.example', 'test-public-key', {
    auth: oauthAuthOptions(store, true),
    global: { fetch: () => { throw Error('Start must not access network'); } },
  });
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://app.example/auth/callback', skipBrowserRedirect: true },
  });
  assert.equal(error, null);
  expectedVerifier = JSON.parse(jar.get(OAUTH_VERIFIER_COOKIE));
  const url = new URL(data.url);
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(expectedVerifier).digest('base64url'));
  assert.equal(url.searchParams.get('redirect_to'), 'https://app.example/auth/callback');
  const cookie = writes.find(w => w.name === OAUTH_VERIFIER_COOKIE);
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.sameSite, 'lax');
  assert.equal(cookie.options.maxAge, 600);
}
const callback = path => route.GET({ url: 'https://app.example' + path, nextUrl: new URL('https://app.example' + path) });
await start();
const success = await callback('/auth/callback?code=test-code&returnUrl=//evil.example');
assert.equal(success.headers.get('location'), 'https://app.example/dashboard');
assert.equal(success.headers.get('cache-control'), 'no-store');
assert.equal(jar.get('session'), 'fixture-access');
assert.equal(jar.get('refresh_token'), 'fixture-refresh');
assert.equal(jar.has(OAUTH_VERIFIER_COOKIE), false);
assert.equal(jar.has('fintrack-oauth'), false, 'No SDK session JSON is stored in a cookie');
assert.equal(exchanges, 1);
for (const name of ['session', 'refresh_token']) {
  const cookie = writes.find(w => w.name === name);
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.sameSite, 'lax');
}
const replay = await callback('/auth/callback?code=test-code');
assert.match(replay.headers.get('location'), /oauth_expired#$/);
assert.equal(exchanges, 1, 'Replayed code without verifier must not be exchanged');

for (const [path, reason] of [['/auth/callback', 'missing_code'],
  ['/auth/callback?error=access_denied', 'oauth_failed'], ['/auth/callback?code=test-code', 'oauth_expired']]) {
  reset();
  const response = await callback(path);
  assert.equal(response.headers.get('location'), 'https://app.example/login?error=' + reason + '#');
  assert.equal(exchanges, 0);
  assert.equal(jar.has('session'), false);
}
reset(); await start(); rejectExchange = true;
const denied = await callback('/auth/callback?code=test-code');
assert.match(denied.headers.get('location'), /session_exchange_failed#$/);
assert.equal(jar.has('session'), false);
assert.equal(jar.has(OAUTH_VERIFIER_COOKIE), false);
const login = readFileSync('src/app/login/page.tsx', 'utf8');
assert.ok(!login.includes('supabase.auth.signInWithOAuth'));
assert.ok(!login.includes('setSessionAction'));
assert.ok(login.includes('window.location.assign(result.redirectUrl)'));
assert.ok(login.includes('OAUTH_RESTART_REQUIRED'));
assert.ok(login.includes('callbackErrors.includes(reason)'));
const callbackSource = readFileSync('src/app/auth/callback/route.ts', 'utf8');
assert.ok(!callbackSource.includes('redirectUrl.hash'));
assert.ok(!callbackSource.includes('get("state")'));
assert.ok(callbackSource.includes('AbortSignal.timeout(15_000)'));
// The system authentication browser has a different cookie jar from WebView.
class NativeResponse {
  constructor(body, options) { this.status = options.status; this.headers = new Headers(options.headers); }
  static redirect(url) { return { status: 302, headers: new Headers({ location: String(url) }) }; }
}
const nativeStart = load('src/app/auth/native/start/route.ts', {
  'next/server': { NextResponse: NativeResponse },
  'next/headers': { cookies: async () => store },
  '@/src/lib/env': { getSupabaseUrl: () => 'https://auth.example' },
  '@/src/lib/native-oauth': native,
});
reset(); await start();
const appJar = new Map(jar);
const challenge = createHash('sha256').update(expectedVerifier).digest('base64url');
const state = 's'.repeat(43);
const startUrl = native.nativeBrowserStart('https://app.example',
  `https://auth.example/auth/v1/authorize?code_challenge=${challenge}&code_challenge_method=s256`);
assert.equal(new URL(startUrl).pathname, '/auth/native/start');
jar = new Map(); writes = [];
const url = new URL(`${startUrl}&state=${state}`);
const started = await nativeStart.GET({ url: url.href, nextUrl: url });
const authorization = new URL(started.headers.get('location'));
assert.equal(authorization.origin, 'https://auth.example');
assert.equal(authorization.searchParams.get('redirect_to'), 'https://app.example/auth/callback');
assert.equal(authorization.searchParams.get('code_challenge'), challenge);
assert.equal(jar.get(native.NATIVE_OAUTH_COOKIE), state);
const nativeCookie = writes.find(w => w.name === native.NATIVE_OAUTH_COOKIE);
assert.equal(nativeCookie.options.httpOnly, true);
assert.equal(nativeCookie.options.secure, true);
assert.equal(nativeCookie.options.path, '/auth/callback');
assert.equal(nativeCookie.options.maxAge, 600);
const returned = await callback('/auth/callback?code=test-code&access_token=not-forwarded');
const nativeUrl = new URL(returned.headers.get('location'));
assert.equal(nativeUrl.protocol, 'app.fintrack.oauth:');
assert.equal(nativeUrl.searchParams.get('state'), state);
assert.equal(nativeUrl.searchParams.get('code'), 'test-code');
assert.equal(nativeUrl.searchParams.has('access_token'), false);
assert.equal(exchanges, 0, 'Browser must never exchange the app PKCE code');
assert.equal(jar.has(native.NATIVE_OAUTH_COOKIE), false);
assert.equal(jar.has('session'), false);
jar = appJar;
const nativeSuccess = await callback('/auth/callback?code=test-code');
assert.equal(nativeSuccess.headers.get('location'), 'https://app.example/dashboard');
assert.equal(jar.get('session'), 'fixture-access');
assert.equal(exchanges, 1);
const nativeReplay = await callback('/auth/callback?code=test-code');
assert.match(nativeReplay.headers.get('location'), /oauth_expired#$/);
assert.equal(exchanges, 1);
for (const query of ['', '?challenge=bad&state=' + state, `?challenge=${challenge}&state=${state}&state=duplicate`]) {
  const bad = new URL('https://app.example/auth/native/start' + query);
  assert.equal((await nativeStart.GET({ url: bad.href, nextUrl: bad })).status, 400);
}
for (const query of ['error=access_denied', 'code=a&code=b', 'code=%0A', '']) {
  jar = new Map([[native.NATIVE_OAUTH_COOKIE, state]]);
  const deniedNative = new URL((await callback('/auth/callback?' + query)).headers.get('location'));
  assert.equal(deniedNative.searchParams.get('error'), 'oauth_failed');
  assert.equal(deniedNative.searchParams.has('code'), false);
}
console.log('PASS Google OAuth: real SDK PKCE challenge, HttpOnly verifier, callback without provider state, session cookies, no token URL, no open redirect, missing/expired/replayed/denied flows and login recovery. No live account used.');
console.log('PASS native OAuth: separate browser/WebView cookies, same HTTPS redirect, code-only return, one-time app exchange, invalid/duplicate state and cancellation.');
