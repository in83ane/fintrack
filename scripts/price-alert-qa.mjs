import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const repo = process.cwd(), out = path.join(repo, 'output/price-alerts'); mkdirSync(out, { recursive: true });
const require = createRequire(path.join(os.tmpdir(), 'fintrack-cashflow-qa/package.json'));
const { build } = require('esbuild'), { chromium } = require('playwright');
const { default: postcss } = await import('postcss'), { default: tailwind } = await import('@tailwindcss/postcss');
const css = (await postcss([tailwind()]).process(readFileSync('src/index.css', 'utf8'), { from: path.join(repo, 'src/index.css') })).css;
const fixture = path.join(repo, 'scripts/price-alert-fixture.tsx');
const bundle = await build({ entryPoints: [fixture], bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'context', setup(b) {
  b.onResolve({ filter: /^@\/src\/lib\/supabase$/ }, () => ({ path: path.join(repo,'scripts/price-alert-supabase-fixture.ts') }));
  b.onResolve({ filter: /^@\/src\/context\/AppContext$/ }, () => ({ path: 'context', namespace: 'qa' }));
  b.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({ contents: `export {useApp} from ${JSON.stringify(fixture)}`, loader: 'tsx', resolveDir: repo }));
} }] });
const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : req.url === '/qa.css' ? 'text/css' : 'text/html'); res.end(req.url === '/qa.js' ? bundle.outputFiles[0].contents : req.url === '/qa.css' ? css : '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>'); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
const errors = [], results = [];
try {
 for (const width of [390, 1280]) for (const theme of ['dark', 'light']) for (const lang of ['en', 'th']) {
  const context = await browser.newContext({ viewport: { width, height: 900 } }); const p = await context.newPage();
  await context.route('**/qa-email-status',route=>route.fulfill({json:{data:{configured:false,ready:false,recipientAllowed:false,schedulerHealthy:true,testMode:true},error:null}}));
  await context.route('**/qa-email-rows',route=>route.fulfill({json:{data:[],error:null}}));
  p.on('pageerror', e => errors.push(e.message)); let price = 90, fail = false, requests = 0;
  await context.route('**/api/market?**', route => { requests++; return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ results: [{ symbol: 'AAPL', price, quoteCurrency: 'USD', quoteTimestamp: Date.now() }] }) }); });
  await p.goto(`${base}/?lang=${lang}`); if (theme === 'light') await p.evaluate(() => document.documentElement.classList.add('light-mode'));
  await p.getByRole('button', { name: 'Manage price alerts', exact: true }).click();
  await p.locator('input[list]').fill('AAPL'); await p.locator('input[type=number]').fill('100');
  await p.getByRole('button', { name: lang === 'th' ? 'ราคาขึ้นถึง (≥)' : 'At or above (≥)', exact: true }).click();
  await p.getByRole('button', { name: lang === 'th' ? 'เพิ่มการแจ้งเตือน' : 'Add Alert', exact: true }).click();
  await p.getByText(lang === 'th' ? '(ปัจจุบัน:' : '(Now:', { exact: false }).waitFor();
  assert.equal(await p.locator('[data-testid=notifications] p').count(), 0);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await p.screenshot({ path: path.join(out, `${width}-${theme}-${lang}-watching.png`) });
  // Change portfolio without changing the alert. Missing holdings must not stop monitoring.
  await p.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Switch to empty portfolio').click());
  fail = true; await p.getByRole('button', { name: lang === 'th' ? 'ตรวจอีกครั้ง' : 'Check now' }).click();
  await p.getByText(lang === 'th' ? /การเชื่อมต่อขัดข้อง/ : /Connection failed/).waitFor();
  const second = await context.newPage();
  second.on('pageerror', e => errors.push(e.message));
  await second.goto(`${base}/?lang=${lang}`);
  await second.getByRole('button', { name: 'Manage price alerts', exact: true }).click();
  await second.getByRole('button', { name: lang === 'th' ? 'ตรวจอีกครั้ง' : 'Check now' }).waitFor();
  await second.getByText(lang === 'th' ? /การเชื่อมต่อขัดข้อง/ : /Connection failed/).waitFor();
  fail = false; price = 101;
  await Promise.all([p.evaluate(() => window.dispatchEvent(new Event('focus'))), second.evaluate(() => window.dispatchEvent(new Event('focus')))]);
  for (const page of [p, second]) await page.getByText(lang === 'th' ? 'แจ้งเตือนแล้ว (1)' : 'Triggered (1)', { exact: true }).waitFor();
  const count1 = await p.locator('[data-testid=notifications] p').count(), count2 = await second.locator('[data-testid=notifications] p').count();
  assert.equal(count1 + count2, 1, 'one delivery across two tabs');
  const winner = count1 ? p : second;
  assert.ok((await winner.locator('[data-testid=notifications]').textContent()).includes('101'));
  await second.close();
  await p.screenshot({ path: path.join(out, `${width}-${theme}-${lang}-triggered.png`) });
  await p.reload(); await p.getByRole('button', { name: 'Manage price alerts', exact: true }).click();
  await p.getByText(lang === 'th' ? 'แจ้งเตือนแล้ว (1)' : 'Triggered (1)', { exact: true }).waitFor();
  assert.equal(await p.locator('[data-testid=notifications] p').count(), 0, 'does not re-fire after reload');
  await p.getByRole('button', { name: `${lang === 'th' ? 'ลบการแจ้งเตือน' : 'Delete alert'} AAPL` }).click();
  await p.getByText(lang === 'th' ? 'ยังไม่มีการแจ้งเตือน' : 'No alerts yet', { exact: true }).waitFor();
  const persisted = await p.evaluate(() => JSON.parse(localStorage.getItem('fintrack-price-alerts:price-alert-qa%40example.test')));
  assert.deepEqual(persisted, []);
  results.push({ width, theme, lang, requests, notifications: 1, persistedDeletion: true }); await context.close();
 }
 assert.deepEqual(errors, []); console.log(JSON.stringify(results));
} finally { writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2)); await browser.close(); await new Promise(r => server.close(r)); }
