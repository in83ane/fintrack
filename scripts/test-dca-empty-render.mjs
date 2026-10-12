import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise the actual JSX that previously crashed, including empty holdings.
const source = readFileSync(new URL('../src/components/DcaOrderSystem.tsx', import.meta.url), 'utf8');
const start = source.indexOf('{firstHeldPrice > 0 &&');
assert.ok(start > 0);
const end = source.indexOf('\n             )}', start);
assert.ok(end > start);
const jsx = source.slice(start, end + '\n             )}'.length);
const component = `function View({heldEntries, avgEntryPrice}) {
 const firstHeldPrice = heldEntries[0]?.price ?? 0;
 const formatVal = value => String(value);
 const breakEvenPrice = avgEntryPrice;
 const Info = () => null;
 return <div>${jsx}</div>;
}`;
const compiled = ts.transpileModule(component, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const View = new Function('React', `${compiled}; return View;`)(React);
const render = (heldEntries, avgEntryPrice) => renderToStaticMarkup(React.createElement(View, { heldEntries, avgEntryPrice }));
assert.equal(render([], 0), '<div></div>', 'empty list does not crash');
assert.equal(render([], 100), '<div></div>', 'transient empty list with old average does not crash');
assert.equal(render([{ price: 100 }], 0), '<div></div>', 'zero holding average does not show misleading profit');
assert.equal(render([{ price: 100 }], 100), '<div></div>', 'equal cost does not show reduction');
assert.match(render([{ price: 100 }], 90), /10\.0%/, 'valid reduction still renders');
console.log('DCA empty-state render regression passed (5 cases).');
