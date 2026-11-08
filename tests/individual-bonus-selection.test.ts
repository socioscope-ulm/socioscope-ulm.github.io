import test from 'node:test';
import assert from 'node:assert/strict';
import {selectNearestAnnualBonusReference} from '../src/lib/payroll-reference.ts';

const refs=[
 {id:'old2025',kind:'bonus-detail',status:'validated',date:'2025-01-01',created:'',payload:{paymentYear:2025,objectiveYear:2024}},
 {id:'new2026',kind:'bonus-detail',status:'validated',date:'2026-01-01',created:'',payload:{paymentYear:2026,objectiveYear:2025}},
 {id:'draft2024',kind:'bonus-detail',status:'review',date:'2024-01-01',created:'',payload:{paymentYear:2024,objectiveYear:2023}},
 {id:'grid',kind:'grid',status:'validated',date:'2026-01-01',created:'',payload:{}}
] as any;

test('December 2025 uses bonuses paid in 2025, not 2026',()=>{
 assert.equal(selectNearestAnnualBonusReference(refs,'2025-12-31')?.id,'old2025');
});
test('2026 uses bonuses paid in 2026',()=>{
 assert.equal(selectNearestAnnualBonusReference(refs,'2026-01-01')?.id,'new2026');
});
test('for older dates without any reference use earliest known payment year',()=>{
 assert.equal(selectNearestAnnualBonusReference(refs,'2020-12-31')?.id,'old2025');
});
test('for future dates without any reference use latest known payment year',()=>{
 assert.equal(selectNearestAnnualBonusReference(refs,'2028-12-31')?.id,'new2026');
});
test('unvalidated references are excluded',()=>{
 assert.equal(selectNearestAnnualBonusReference(refs,'2024-12-31')?.id,'old2025');
});
test('for multiple years equally near prefer earlier year',()=>{
 const ties=[refs[0],{...refs[1],payload:{...refs[1].payload,paymentYear:2027}}];
 assert.equal(selectNearestAnnualBonusReference(ties as any,'2026-12-31')?.id,'old2025');
});
test('same payment year prefers latest objective year',()=>{
 const same=[refs[0],{...refs[1],payload:{paymentYear:2025,objectiveYear:2025}}];
 assert.equal(selectNearestAnnualBonusReference(same as any,'2025-12-31')?.id,'new2026');
});
test('does not mutate references or fabricate an absent reference',()=>{
 const input=JSON.stringify(refs);
 assert.equal(selectNearestAnnualBonusReference(refs,'not-a-date'),undefined);
 assert.equal(selectNearestAnnualBonusReference([], '2025-12-31'),undefined);
 assert.equal(JSON.stringify(refs),input);
});
