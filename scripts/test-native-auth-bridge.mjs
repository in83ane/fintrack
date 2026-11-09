import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/native-auth-bridge.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, setTimeout, clearTimeout });
const { getNativeAuthBridge, signInWithNativeBridge } = exports;
assert.equal(await getNativeAuthBridge({}), null);
const calls = [];
const bridge = { callHandler: async (name, ...args) => {
  calls.push([name, ...args]);
  return name === 'fintrackCapabilities' ? { nativeGoogle: true } : { status: 'success' };
} };
// Regression: a default Safari user-agent does not contain FinTrackNative.
assert.equal(await getNativeAuthBridge({ flutter_inappwebview: bridge, navigator: { userAgent: 'Mozilla/5.0 Safari/605.1.15' } }), bridge);
assert.equal((await signInWithNativeBridge(bridge, 'https://app.example/auth/native/start?challenge=fixture')).status, 'success');
assert.equal(calls[0][0], 'fintrackCapabilities');
assert.equal(calls[1][0], 'fintrackGoogleAuth');
await assert.rejects(getNativeAuthBridge({ __fintrackNative: { version: '1.1.1' } }), /NATIVE_APP_UPDATE_REQUIRED/);
await assert.rejects(getNativeAuthBridge({ flutter_inappwebview: { callHandler: async () => ({ nativeGoogle: false }) } }), /NATIVE_APP_UPDATE_REQUIRED/);
await assert.rejects(getNativeAuthBridge({ flutter_inappwebview: { callHandler: () => new Promise(() => {}) } }, 10), /NATIVE_APP_UPDATE_REQUIRED/);
assert.equal((await signInWithNativeBridge({ callHandler: async () => ({ status: 'cancelled' }) }, 'unused')).status, 'cancelled');
await assert.rejects(signInWithNativeBridge({ callHandler: async () => ({ status: 'error' }) }, 'unused'), /NATIVE_OAUTH_FAILED/);
console.log('PASS native bridge: default Safari UA, actual capability dispatch, old/missing/unresponsive bridge fails closed, cancellation, regular web preserved.');
