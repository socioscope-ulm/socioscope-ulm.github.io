import test from 'node:test';
import assert from 'node:assert/strict';
import {agentFamilies} from '../src/lib/agent-families.ts';
import {agentProgression} from '../src/lib/agent-progression.ts';
import {matchesAgentCohort} from '../src/lib/agents.ts';

const src=(id:string,date:string)=>({id,date,name:id,label:date,hash:id,sheet:'agents',primary:true,confidence:'validée',seniorityDate:date,rows:4,agents:4,status:'validated'});
const sources=[src('s2024','2024-12-31'),src('s2025','2025-12-31')];
const people=[
 {id:'A12345',team:'SERVICE MACHINES TOURNANTES',college:'cadres',sex:'F',gf:15,nr:205,fromGF:14,fromNR:200},
 {id:'B12345',team:'SERVICE MACHINES TOURNANTES',college:'cadres',sex:'H',gf:15,nr:205,fromGF:15,fromNR:205},
 {id:'C12345',team:'SERVICE MACHINES STATIQUES',college:'maitrise',sex:'Femme',gf:8,nr:100,fromGF:8,fromNR:100},
 {id:'D12345',team:'SERVICE MACHINES STATIQUES',college:'cadres',sex:'',gf:14,nr:195,fromGF:14,fromNR:195}
];
const records=sources.flatMap((s,si)=>people.map((p,i)=>({
 id:s.id+':'+p.id,agentId:p.id,nni:p.id,name:p.id,row:i+1,source:s.id,
 gf:si?p.gf:p.fromGF,nr:si?p.nr:p.fromNR,team:p.team,college:p.college,sex:p.sex,
 gfDate:si&&p.id==='A12345'?'2025-01-01':'2024-01-01',
 nrDate:si&&p.id==='A12345'?'2025-01-01':'2024-01-01',
 iegYears:si?25:24,seniorityDate:s.date
})));
const fixture={sources,records,events:[],issues:[],updated:'2026-10-22'} as any;
const stats=(college='',sex='')=>agentFamilies(fixture,'s2025','','',college,sex)!;
const family=(data:any,id:string)=>data.summaries.find((r:any)=>r.id===id);

test('all identified employees remain present without filters',()=>{
 const data=stats();
 assert.equal(data.classified,4);
 assert.equal(family(data,'tournantes').agents,2);
 assert.equal(family(data,'statiques').agents,2);
});
test('femmes and cadres intersect, rather than overriding each other',()=>{
 const data=stats('cadres','femmes');
 assert.equal(data.classified,1);
 assert.equal(family(data,'tournantes').agents,1);
 assert.equal(family(data,'statiques').agents,0);
 const byYear=data.timeline.filter((r:any)=>r.source==='s2024'||r.source==='s2025');
 assert.deepEqual(byYear.map((r:any)=>r.tournantes),[1,1]);
 assert.equal(data.sexKnown,3);
 assert.equal(data.sexTotal,4);
});
test('men and women are not inferred for unidentified sex',()=>{
 assert.equal(stats('cadres','hommes').classified,1);
 assert.equal(stats('cadres').classified,3);
 assert.equal(stats('maitrise','femmes').classified,1);
 assert.equal(stats('maitrise','hommes').classified,0);
});
test('college falls back to GF only when source college is missing',()=>{
 assert.equal(matchesAgentCohort({college:undefined,sex:'F',gf:13},'cadres','femmes'),true);
 assert.equal(matchesAgentCohort({college:'maitrise',sex:'F',gf:13},'cadres','femmes'),false);
});
test('the once-calculated progression agrees with the original per-family subset',()=>{
 const data=stats('cadres','femmes');
 const chosen=records.filter((r:any)=>r.agentId==='A12345');
 const expected=agentProgression({...fixture,records:chosen},'s2025')!;
 const actual=family(data,'tournantes').progression;
 assert.deepEqual(actual.gf,expected.gf);
 assert.deepEqual(actual.nr,expected.nr);
});
