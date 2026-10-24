import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/context/AppContext.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('context.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let initializer;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='translations')initializer=node.initializer.getText(tree);ts.forEachChild(node,visit);}visit(tree);
const translations=new Function(`return (${initializer})`)();
const expected={allWallets:'All wallets',unassigned:'Unassigned',incomeExpense:'Income & Expense',transfers:'Transfers',investments:'Investments',noteOptional:'Note (optional)',saveRecord:'Save record',SAVERECORD:'Save record'};
for(const [key,value] of Object.entries(expected)){assert.equal(translations.en[key],value);assert.ok(translations.th[key]&&translations.th[key]!==key);}
console.log('PASS requested Ledger translations exist in both existing locale dictionaries.');
