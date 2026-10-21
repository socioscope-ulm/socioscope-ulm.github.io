import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salaryComparison} from '../src/lib/salary-comparison.ts';
import type {Observation} from '../src/lib/model.ts';
const o=(metric:string,year:number,value:number,sex='ensemble',college='ensemble'):Observation=>({metric,year,value,sex,college,source:'test',page:1,unit:metric==='remuneration'?'euros':'pourcent',population:'test',verified:true});
test('compares annual salary changes with published global rates, retaining zeros',()=>{
 const [r]=salaryComparison([o('remuneration',2024,2000),o('remuneration',2025,2100),o('inflation',2025,1.5),o('snb',2025,0)],2025,2025);
 assert.ok(Math.abs(r.salary!-5)<1e-10);assert.equal(r.inflation,1.5);assert.equal(r.snb,0);
 assert.equal(r.previous?.year,2024);
});
test('does not interpolate missing years or treat zero salary as a valid average',()=>{
 const rows=salaryComparison([o('remuneration',2023,2000),o('remuneration',2025,2200),o('remuneration',2026,0)],2024,2027);
 assert.deepEqual(rows.map(r=>r.salary),[null,null,null,null]);
 assert.equal(rows[0].inflation,null);assert.equal(rows[0].snb,null);
});
test('filters salary population while retaining national and branch references',()=>{
 const data=[o('remuneration',2024,3000,'femmes','cadres'),o('remuneration',2025,3300,'femmes','cadres'),o('remuneration',2025,9000),o('inflation',2025,2),o('snb',2025,1)];
 const [r]=salaryComparison(data,2025,2025,'femmes','cadres');
 assert.ok(Math.abs(r.salary!-10)<1e-10);assert.equal(r.inflation,2);assert.equal(r.snb,1);
 assert.equal(salaryComparison(data,2025,2025,'hommes','cadres')[0].salary,null);
});
test('recalculates from newly validated and revised observations, including a new year',()=>{
 const data=[o('remuneration',2024,2000),o('remuneration',2025,2100)];
 const before=salaryComparison(data,2025,2026);
 const after=salaryComparison([...data.filter(r=>r.year!==2025),o('remuneration',2025,2200),o('remuneration',2026,2420),o('inflation',2026,2),o('snb',2026,3)],2025,2026);
 assert.equal(before[1].salary,null);assert.ok(Math.abs(after[0].salary!-10)<1e-10);assert.ok(Math.abs(after[1].salary!-10)<1e-10);
 assert.equal(after[1].inflation,2);assert.equal(after[1].snb,3);
});
