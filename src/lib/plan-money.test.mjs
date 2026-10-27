import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=(file,replacements={})=>{let source=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [a,b] of Object.entries(replacements))source=source.replaceAll(`from '${a}'`,`from '${b}'`);return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;};
const {planMinor,planMajor,planMonthSchedule,planSplitAmount}=await import(url('./plan-money.ts',{'./plan-recurrence':url('./plan-recurrence.ts')}));
const rule={starts_on:'2023-01-01',ends_on:null,status:'active',frequency:'weekly_target',days_of_week:[],weekly_target:3,monthly_day:31};
const complete=(schedule,target=10001n)=>{const amounts=[];for(let i=0;i<schedule.required;i++)amounts.push(planSplitAmount(target,schedule.required,amounts));assert.equal(amounts.reduce((a,b)=>a+b,0n),target);return amounts;};
test('money strings are parsed as integer minor units without binary rounding',()=>{
 for(const value of ['0.01','0.29','100.00','999999999999.99'])assert.equal(planMajor(planMinor(value)),value);
 for(const value of ['NaN','Infinity','1e3','-1','1.001',''])assert.throws(()=>planMinor(value));
});
test('midweek start and partial week quota use min(X, actual available days)',()=>{
 const s=planMonthSchedule({...rule,starts_on:'2026-10-30'},'2026-10');assert.equal(s.required,2);complete(s);
});
test('leap February and weeks spanning years are clipped per month',()=>{
 for(const month of ['2024-02','2024-12','2025-01']){const s=planMonthSchedule(rule,month);assert.ok(s.days.every(d=>d.startsWith(month)));complete(s);}
 assert.ok(planMonthSchedule(rule,'2024-02').days.includes('2024-02-29'));
 const dec=planMonthSchedule(rule,'2024-12'),jan=planMonthSchedule(rule,'2025-01');assert.equal(dec.groups['week:2024-12-30'].quota,2);assert.equal(jan.groups['week:2024-12-30'].quota,3);
});
test('midweek pause days do not contribute quota; all completed amounts equal target',()=>{
 const versions=[{effective_on:'2023-01-01',rule},{effective_on:'2026-10-06',rule:{...rule,status:'paused'}},{effective_on:'2026-10-11',rule}];
 const s=planMonthSchedule(rule,'2026-10',versions);assert.equal(s.groups['week:2026-10-05'].quota,2);assert.equal(s.days.includes('2026-10-07'),false);complete(s);
});
test('exact targets for all 12 months, daily/selected weekdays/monthly/weekly rules',()=>{
 for(let month=1;month<=12;month++)for(const frequency of ['daily','weekdays','monthly','weekly_target']){
  const s=planMonthSchedule({...rule,frequency,days_of_week:[1,3,5]},`2024-${String(month).padStart(2,'0')}`);complete(s);complete(s,1n);
 }
});
test('remainder is on the last actual check; undo/recheck keeps earlier snapshots',()=>{
 assert.equal(planSplitAmount(10000n,3,[]),3333n);assert.equal(planSplitAmount(10000n,3,[3333n,3333n]),3334n);
 assert.equal(planSplitAmount(10000n,3,[3333n,3334n]),3333n);
 assert.equal(planSplitAmount(10000n,3,[3333n,3333n,3334n]),0n);
});
