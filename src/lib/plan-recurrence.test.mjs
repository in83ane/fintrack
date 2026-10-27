import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('./plan-recurrence.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {blocksMonthlyMoneyRule,planDates,isPlanDay,ruleOnDay,weeklyPlanProgress,validatePlanRule,validPlanDate}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const base={starts_on:'2024-01-01',ends_on:null,frequency:'daily',days_of_week:[],weekly_target:3,monthly_day:31,status:'active'};
test('temporary gate blocks every non-daily monthly money combination, including editing',()=>{
 for(const frequency of ['weekdays','weekly_target','monthly']){
  assert.equal(blocksMonthlyMoneyRule({amount:100,amount_period:'month',frequency}),true);
  assert.equal(blocksMonthlyMoneyRule({amount:100,amount_period:'day',frequency}),false);
  assert.equal(blocksMonthlyMoneyRule({amount:0,amount_period:'month',frequency}),false);
 }
 assert.equal(blocksMonthlyMoneyRule({amount:100,amount_period:'month',frequency:'daily'}),false);
});
test('endless daily rules generate only the requested month, including leap day',()=>{
 assert.equal(planDates(base,'2024-02-01','2024-02-29').length,29);
 assert.equal(planDates(base,'2025-02-01','2025-02-28').length,28);
 assert.throws(()=>planDates(base,'2024-01-01','2040-01-01'));
});
test('selected weekdays use ISO Monday through Sunday, across year boundary',()=>{
 assert.deepEqual(planDates({...base,frequency:'weekdays',days_of_week:[1,7]},'2024-12-29','2025-01-06'),['2024-12-29','2024-12-30','2025-01-05','2025-01-06']);
});
test('monthly day 31 clamps to the last day instead of skipping short months',()=>{
 const rule={...base,frequency:'monthly'};
 assert.deepEqual(planDates(rule,'2024-01-01','2024-04-30'),['2024-01-31','2024-02-29','2024-03-31','2024-04-30']);
 assert.equal(isPlanDay(rule,'2025-02-28'),true);
});
test('weekly quota allows extra dates but credits at most the target',()=>{
 const rule={...base,frequency:'weekly_target'};
 const days=['2024-12-30','2024-12-31','2025-01-01','2025-01-02','2025-01-02','2025-01-06'];
 assert.deepEqual(weeklyPlanProgress(rule,days,'2025-01-05'),{count:4,credited:3,target:3,complete:true});
 assert.equal(isPlanDay(rule,'2025-01-04'),true);
});
test('pauses and edits preserve the old schedule; resume day is eligible',()=>{
 const versions=[{effective_on:'2024-01-01',rule:base},{effective_on:'2024-02-03',rule:{...base,status:'paused'}},{effective_on:'2024-02-06',rule:base}];
 assert.deepEqual(planDates(base,'2024-02-01','2024-02-07',versions),['2024-02-01','2024-02-02','2024-02-06','2024-02-07']);
 assert.equal(ruleOnDay(base,versions,'2024-02-04').status,'paused');
});
test('bounds, invalid dates and input validation',()=>{
 assert.equal(validPlanDate('2026-02-30'),false);
 assert.equal(validPlanDate('2026-10-27'),true);
 assert.equal(validatePlanRule(base),null);
 for(const patch of [{ends_on:'2023-12-31'},{frequency:'weekdays'},{days_of_week:[1,1]},{weekly_target:0},{weekly_target:8},{monthly_day:32}])assert.notEqual(validatePlanRule({...base,...patch}),null);
 assert.deepEqual(planDates({...base,starts_on:'2024-02-03',ends_on:'2024-02-05'},'2024-02-01','2024-02-07'),['2024-02-03','2024-02-04','2024-02-05']);
});
test('calendar-day results are independent of the process timezone',()=>{
 const before=process.env.TZ;
 try {for(const zone of ['UTC','Asia/Bangkok','America/Los_Angeles']){process.env.TZ=zone;assert.deepEqual(planDates({...base,frequency:'monthly'},'2024-02-01','2024-02-29'),['2024-02-29']);}} finally {if(before===undefined)delete process.env.TZ;else process.env.TZ=before;}
});
