import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
const vite = await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const { matchPayrollRows, isExactPayrollMatch } = await vite.ssrLoadModule('/lib/payroll-matching.ts');
const difference = (course,row)=>Math.abs(course.amount-row.amount);
test('a discrepancy cannot steal an exact match later in the PDF',()=>{
 const courses=[{amount:30},{amount:50}];
 const rows=[{amount:31},{amount:30}];
 const result=matchPayrollRows(courses,rows,()=>true,difference);
 assert.equal(result.assigned.get(1),0);
 assert.equal(result.assigned.get(0),1);
});
test('equal amounts remain separate and identified rides retain a match',()=>{
 const courses=[{amount:30},{amount:30,id:'A'}];
 const rows=[{amount:30,id:'A'},{amount:30,id:'B'}];
 const result=matchPayrollRows(courses,rows,(c,r)=>!c.id||c.id===r.id,difference);
 assert.equal(result.assigned.get(0),1);
 assert.equal(result.assigned.get(1),0);
 assert.equal(result.used.size,2);
});
test('extra PDF lines are not matched twice to the same ride',()=>{
 const result=matchPayrollRows([{amount:30}],[{amount:30},{amount:30}],()=>true,difference);
 assert.equal(result.assigned.size,1);
 assert.equal(result.used.size,1);
});

test('a one-cent difference is a real discrepancy, not an exact match',()=>{
 assert.equal(isExactPayrollMatch(0),true);
 assert.equal(isExactPayrollMatch(0.00000000001),true);
 assert.equal(isExactPayrollMatch(0.01),false);
 assert.equal(isExactPayrollMatch(0.019999999999),false);
 const result=matchPayrollRows([{amount:15.80},{amount:15.81}],[{amount:15.81}],()=>true,difference);
 assert.equal(result.assigned.get(0),1);
});
test('one-cent different only course is matched as discrepancy, not an exact match',()=>{
 const result=matchPayrollRows([{amount:15.80}],[{amount:15.81}],()=>true,difference);
 assert.equal(result.assigned.get(0),0);
 assert.equal(isExactPayrollMatch(difference({amount:15.80},{amount:15.81})),false);
});
