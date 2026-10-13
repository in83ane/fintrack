import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const compile = s => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const url = s => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const ledger = url(compile(read('../src/lib/cost-basis-ledger.ts')));
const { decimal } = await import(url(compile(read('../src/lib/fx.ts')).replace("'./cost-basis-ledger'", JSON.stringify(ledger))));
const source = read('../src/app/(app)/portfolio/page.tsx');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['nf', 'moneyDisplaySign', 'useMoneyText', 'HoldingTableRow'];
const code = compile(ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(ast)).join('\n'));
let hidden = false;
const Icon = () => null;
const Star = Icon;
const deps = { React, decimal, useContext: () => hidden, useCallback: f => f, HideContext: {}, MASK: '***', holdingValue: h => h.price * h.shares, holdingCost: h => h.avgCost * h.shares, cn: (...s) => s.join(' '), convert: v => v, GripVertical: Icon, AssetLogo: Icon, Pencil: Icon, X: Icon };
const { Row, text } = new Function('Star', ...Object.keys(deps), code + '\nreturn { Row: HoldingTableRow, text: useMoneyText };')(Star, ...Object.values(deps));
for (const [value, expected, color] of [[0,'0.00','gray-400'],[-0,'0.00','gray-400'],[1e-10,'0.00','gray-400'],[-1e-10,'0.00','gray-400'],[0.0049,'0.00','gray-400'],[-0.0049,'0.00','gray-400'],[0.005,'+0.01','#4EDEA3'],[-0.005,'-0.01','#FFB4AB'],[91.35,'+91.35','#4EDEA3'],[-45,'-45.00','#FFB4AB']]) {
  assert.equal(text()(value, 'USD', true), `${expected} USD`);
  const holding = { id: '1', symbol: 'TEST', name: 'Test', shares: 1, price: 150, avgCost: 100, currency: 'USD', realizedPL: value };
  const html = renderToStaticMarkup(React.createElement(Row, { holding, total: 150, rate: 33.53, color: '', groupName: '', onEdit() {}, onRemove() {} }));
  const cell = html.match(/<td\b[^>]*>.*?กำไรที่ขายแล้ว.*?<\/td>/g)?.[0];
  // Extract the specific cell rather than matching colors in unrealized/total columns.
  const realized = html.split('</td>')[5];
  assert.ok(cell);
  assert.ok(realized.includes(`text-${color.startsWith('#') ? `[${color}]` : color}`));
  assert.ok(realized.includes(`${expected} USD`));
  assert.equal(holding.realizedPL, value, 'display never mutates financial values');
}
for (const [dayChange, dayChangePercent, expectedMoney, expectedPercent] of [[5, 5, '+10.00 USD', '+5.00%'], [-5, -5, '-10.00 USD', '-5.00%'], [0, 0, '0.00 USD', '0.00%'], [null, null, '—', '—']]) {
  const holding = { id: 'daily', symbol: 'TEST', name: 'Test', shares: 2, price: 105, avgCost: 50, currency: 'USD', dayChange, dayChangePercent, isFavorite: true };
  const html = renderToStaticMarkup(React.createElement(Row, { holding, total: 210, rate: 33.53, color: '', groupName: '', onEdit() {}, onRemove() {} }));
  const daily = html.split('</td>')[3];
  assert.ok(daily.includes(expectedMoney));
  assert.ok(daily.includes(expectedPercent));
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(daily.includes(dayChange > 0 ? 'bg-[#4EDEA3]/10' : dayChange < 0 ? 'bg-[#FFB4AB]/10' : 'bg-white/5'));
  assert.ok(!html.includes('ลากจัดลำดับ TEST'), 'drag handle is hidden outside custom mode');
  const custom = renderToStaticMarkup(React.createElement(Row, { holding, total: 210, rate: 33.53, color: '', groupName: '', onReorder() {} }));
  assert.ok(custom.includes('ลากจัดลำดับ TEST'));
}
hidden = true;
assert.equal(text()(91.35, 'USD', true), '*** USD');
console.log('PASS realized P/L: actual row render, neutral rounded zero, signed half-cent boundaries, profit/loss colors, hidden mode, immutable values.');
