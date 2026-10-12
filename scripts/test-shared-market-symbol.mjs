import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('src/hooks/useSharedMarketSymbol.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function mount(requested, saved = '', fallback = '') {
  const state = [], effects = [], listeners = new Map();
  const storage = new Map([['fintrack-last-trade-symbol', saved]]);
  const window = {
    location: { href: `https://test.invalid/terminal?interval=60${requested ? `&symbol=${requested}` : ''}` },
    history: {
      state: { __NA: true, tree: ['fixture-route'] },
      replaceState(nextState, _title, url) {
        assert.equal(nextState, this.state, 'query updates preserve router history metadata');
        this.state = nextState;
        window.location.href = new URL(url, window.location.href).href;
      },
    },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: key => listeners.delete(key),
    dispatchEvent: event => listeners.get(event.type)?.(event),
  };
  const react = {
    useState: value => { const index = state.length; state.push(value); return [value, next => { state[index] = next; }]; },
    useCallback: fn => fn,
    useEffect: fn => effects.push(fn),
  };
  const exports = {};
  new Function('require', 'exports', 'window', 'CustomEvent', compiled)(() => react, exports, window,
    class { constructor(type, options) { this.type = type; this.detail = options.detail; } });
  const hook = exports.useSharedMarketSymbol(requested, fallback);
  const cleanup = effects.map(fn => fn());
  return { state, storage, window, hook, listeners, cleanup };
}
const a = mount('TSLA', 'NVDA');
assert.equal(a.state[0], 'TSLA', 'explicit navigation wins');
a.hook.selectSymbol(' nvda ');
assert.equal(a.state[0], 'NVDA');
assert.equal(a.storage.get('fintrack-last-trade-symbol'), 'NVDA');
assert.equal(new URL(a.window.location.href).searchParams.get('symbol'), 'NVDA');
assert.equal(new URL(a.window.location.href).searchParams.get('interval'), '60');
a.hook.selectSymbol('   ');
assert.equal(a.state[0], 'NVDA', 'empty search keeps selection');
assert.equal(mount('', 'NVDA', 'XAUUSD').state[0], 'NVDA', 'restore shared selection');
assert.equal(mount('', '', 'XAUUSD').state[0], 'XAUUSD');
assert.equal(mount('NVDA', 'NVDA').state[0], 'NVDA', 'refresh keeps latest URL selection');
a.listeners.get('storage')({ key: 'fintrack-last-trade-symbol', newValue: 'AAPL' });
assert.equal(a.state[0], 'AAPL');
assert.equal(new URL(a.window.location.href).searchParams.get('symbol'), 'AAPL');
a.listeners.get('storage')({ key: 'unrelated', newValue: 'MSFT' });
assert.equal(a.state[0], 'AAPL');
a.cleanup.forEach(fn => fn?.());
assert.equal(a.listeners.size, 0);
const plan = readFileSync('src/app/(app)/trade/plan/page.tsx', 'utf8');
const terminal = readFileSync('src/app/(app)/terminal/page.tsx', 'utf8');
assert.ok(plan.includes('/terminal?symbol=${encodeURIComponent(symbol)}'));
assert.ok(terminal.includes('/trade/plan?symbol=${encodeURIComponent(symbol)}'));
assert.ok(terminal.includes('<AdvancedChartWidget symbol={symbol}'));
assert.ok(!terminal.includes('setSymbol(profile.terminal_symbol)'));
for (const path of ['src/app/(app)/trade/plan/page.tsx', 'src/app/(app)/portfolio/[symbol]/page.tsx']) {
  const page = readFileSync(path, 'utf8');
  const links = page.match(/<Link\b[^>]*href=\{`\/terminal[^>]*>/g) || [];
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.ok(link.includes('replace={false}'), 'Terminal navigation must push history');
    assert.ok(!link.includes('target='), 'Terminal navigation stays in this tab');
  }
}
console.log('PASS: shared ticker persistence, URL refresh, cross-tab updates, empty input, cleanup and reciprocal navigation.');
