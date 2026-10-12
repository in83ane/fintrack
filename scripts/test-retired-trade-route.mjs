import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../src/app/(app)/trade/[[...symbol]]/layout.tsx');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
new Function('require','exports',compiled)(name => {
  assert.equal(name,'next/navigation');
  return {redirect: destination => { throw {destination}; }};
}, exports);
for (const symbol of [undefined,['TSLA'],['NVDA'],['AAPL'],['PTT.BK'],['any','nested']]) {
  assert.throws(() => exports.default({params:{symbol}, children:'retired UI'}), e => e.destination === '/terminal');
}
const plan = read('../src/app/(app)/trade/plan/page.tsx');
assert.ok(!plan.includes('href="/terminal"'));
assert.ok(!plan.includes('กลับไป Terminal'));
const portfolio = read('../src/app/(app)/portfolio/page.tsx');
assert.match(portfolio, /(?:ราคา|ข้อมูล) ณ เวลา/);
assert.ok(!portfolio.includes('https://frankfurter.dev'));
assert.ok(!portfolio.includes('https://www.exchangerate-api.com'));
assert.ok(!portfolio.includes('อัปเดตเรท'));
const palette = read('../src/components/CommandPalette.tsx');
assert.ok(palette.includes('/trade/plan?symbol=${encodeURIComponent(a.symbol)}'));
console.log('PASS: retired catch-all redirects, no plan back link, palette destination, timestamp label and no provider links.');
