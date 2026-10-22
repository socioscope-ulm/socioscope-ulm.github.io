import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {agentPayroll} from '../src/lib/agent-payroll.ts';
import {normalizeAgentSex} from '../src/lib/agents.ts';

const source={id:'s2025',name:'Situation individuelle 2025',label:'Décembre 2025',hash:'x',date:'2025-12-31',sheet:'agents',primary:true,confidence:'validée',seniorityDate:'2025-12-31',rows:4,agents:4,status:'validated'};
const agents=[
 {id:'a',agentId:'A12345',nni:'A12345',name:'Agent A',gf:15,nr:200,college:'cadres',sex:'F',agency:'AMTC'},
 {id:'b',agentId:'B12345',nni:'B12345',name:'Agent B',gf:15,nr:205,college:'cadres',sex:'H',agency:'AMTC'},
 {id:'c',agentId:'C12345',nni:'C12345',name:'Agent C',gf:8,nr:100,college:'maitrise',sex:'Femme',agency:'AMTC'},
 {id:'d',agentId:'D12345',nni:'D12345',name:'Agent D',gf:8,nr:100,college:'maitrise',sex:'',agency:'AMTC'}
].map(r=>({...r,source:'s2025',row:1,iegYears:20,seniorityDate:'2025-12-31'}));
const fixture={sources:[source],records:agents,events:[],issues:[],updated:'2026-10-21'};
const rates={'1.24':{'200':Array(12).fill(20000),'205':Array(12).fill(23000),'100':Array(12).fill(14000)}};
const config={rates,bonuses:{'15':6000,'8':4000},gridDate:'2025-12-31',bonusReferenceYear:2025,gridId:'grille',bonusId:'primes'};
const calc=(college='',sex='')=>agentPayroll(fixture as any,'s2025','agency',config,{college,sex})!;

test('Default payroll preserves unfiltered totals and original salary levels',()=>{
 const all=calc();
 assert.equal(all.total,4);
 assert.equal(all.covered,4);
 assert.equal(all.monthlyCents,20000+23000+14000+14000);
 assert.equal(all.annualBonusCents,6000+6000+4000+4000);
 assert.equal(all.annual13Cents,all.monthlyCents*13);
 assert.equal(all.annual13WithBonusesCents,all.annual13Cents+all.annualBonusCents);
 assert.equal(all.rows.length,4);
});
test('Selecting a college recalculates all payroll totals and groups',()=>{
 const cadres=calc('cadres');
 assert.equal(cadres.total,2);
 assert.equal(cadres.monthlyCents,43000);
 assert.equal(cadres.annualBonusCents,12000);
 assert.equal(cadres.annual12WithBonusesCents,43000*12+12000);
 assert.equal(cadres.colleges.length,1);
 assert.equal(cadres.colleges[0].label,'cadres');
 assert.equal(cadres.colleges[0].agents,2);
 assert.equal(cadres.agencies[0].monthlyCents,43000);
 assert.deepEqual(cadres.rows.map(r=>r.nni),['A12345','B12345']);
});
test('Selecting sex and college applies the same subset to totals, detailed rows and exports',()=>{
 const femaleCadres=calc('cadres','femmes');
 assert.equal(femaleCadres.total,1);
 assert.equal(femaleCadres.covered,1);
 assert.equal(femaleCadres.monthlyCents,20000);
 assert.equal(femaleCadres.annualBonusCents,6000);
 assert.equal(femaleCadres.annual13WithBonusesCents,20000*13+6000);
 assert.deepEqual(femaleCadres.rows.map(r=>r.nni),['A12345']);
 assert.equal(femaleCadres.rows[0].sex,'femmes');
 const maleCadres=calc('cadres','hommes');
 assert.equal(maleCadres.monthlyCents,23000);
 assert.deepEqual(maleCadres.rows.map(r=>r.nni),['B12345']);
});
test('Unknown sexes are excluded from sex-specific calculations without inventing values',()=>{
 const femaleMaitrise=calc('maitrise','femmes');
 assert.equal(femaleMaitrise.monthlyCents,14000);
 assert.equal(femaleMaitrise.total,1);
 assert.equal(femaleMaitrise.sexKnown,1);
 assert.equal(femaleMaitrise.sexTotal,2);
 const maleMaitrise=calc('maitrise','hommes');
 assert.equal(maleMaitrise.total,0);
 assert.equal(maleMaitrise.monthlyCents,0);
 assert.deepEqual(maleMaitrise.rows,[]);
 assert.equal(normalizeAgentSex(''),null);
});
test('Global filters are forwarded to employment analyses and payroll while preserving payroll exports',()=>{
 const dashboard=readFileSync(new URL('../src/app/dashboard.tsx',import.meta.url),'utf8');
 const agents=readFileSync(new URL('../src/app/agents.tsx',import.meta.url),'utf8');
 const route=readFileSync(new URL('../src/app/api/agents/route.ts',import.meta.url),'utf8');
 assert.match(dashboard,/forcedView="payroll" filterCollege=\{college\} filterSex=\{sex\}/);
 assert.match(agents,/college:\['payroll','hourly','analysis','families'\]\.includes\(view\)\?/);
 assert.match(agents,/sex:\['payroll','hourly','analysis','families'\]\.includes\(view\)\?/);
 assert.match(agents,/\[source,view,q,agency,college,filterCollege,filterSex/);
 assert.match(dashboard,/forcedView=\{emploiView\} filterCollege=\{college\} filterSex=\{sex\}/);
 assert.match(route,/agentFamilies\(data,source,p\.get\('agency'\)\|\|'',p\.get\('m3e'\)\|\|'',p\.get\('college'\)\|\|'',p\.get\('sex'\)\|\|''\)/);
 assert.match(agents,/detailRows=useMemo\(\(\)=>\[\.\.\.data\.rows\]/);
 assert.match(agents,/Exporter les agents filtrés/);
 assert.match(route,/college:p\.get\('college'\)\|\|'',sex:p\.get\('sex'\)\|\|''/);
 assert.match(route,/if\(result&&p\.get\('agent'\)\)/);
});
