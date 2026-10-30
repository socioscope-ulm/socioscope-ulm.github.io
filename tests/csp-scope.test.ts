import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeCspPreparation} from '../src/lib/csp-scope.ts';
import {prepareCspDocuments} from '../src/lib/csp-candidates.ts';
import {prepareCsp} from '../src/lib/csp.ts';
import type {AgentData,AgentRecord} from '../src/lib/agents.ts';
import type {CspEvent} from '../src/lib/csp.ts';
const event:CspEvent={id:'measure',name:'FICTIF ALICE',kind:'mesure',effective:'2026-02-01',page:1,selected:true,nrSteps:1};
const record:AgentRecord={id:'row',agentId:'Z00001',nni:'Z00001',name:event.name,source:'annual',row:1,gf:8,nr:100};
const data:AgentData={sources:[{id:'old',date:'2024-12-31',primary:true},{id:'annual',date:'2025-12-31',primary:true}] as any,records:[{...record,id:'old-row',source:'old'},record,{...record,id:'unrelated',name:'AUTRE FICTIF',agentId:'Z00002',nni:'Z00002'}],events:[],issues:[],updated:''};

test('scoping keeps every historical row, source and same-agent movement, and removes unrelated histories',()=>{
 const prior=[{id:'rd',name:'RD fictif',date:'2026-01-01',status:'validated',events:[{...event,agentId:'Z00001',effective:'2026-01-01',approved:true},{...event,id:'other',agentId:'Z00002',name:'AUTRE FICTIF'}]}];
 const original=structuredClone({data,prior});
 const scoped=scopeCspPreparation(data,[event],prior);
 assert.equal(scoped.data.records.length,2);assert.equal(scoped.data.sources,data.sources);assert.equal(scoped.prior[0].events.length,1);assert.equal(scoped.prior[0].events[0],prior[0].events[0]);
 const expected=prepareCsp(data,[event],prior,'2026-02-01')[0];const actual=prepareCspDocuments(data,[event],prior,'2026-02-01')[0];assert.deepEqual(actual,expected);assert.equal(actual.after?.nr,110);assert.deepEqual({data,prior},original);
});
test('same-name identities and renamed historical records remain complete and ambiguous NNIs stay blocked',()=>{
 const renamed={...record,id:'alias',source:'old',name:'ANCIEN NOM FICTIF'};
 const homonym={...record,id:'homonym',agentId:'Z00003',nni:'Z00003'};
 const base={...data,records:[...data.records,renamed,homonym],cspIdentities:[{name:event.name,nni:'Z00004',source:'rup',date:'2026-09-30'}]};
 const scoped=scopeCspPreparation(base,[event],[]);assert.equal(scoped.data.records.length,4);assert.ok(scoped.data.records.includes(renamed));assert.equal(scoped.data.cspIdentities?.length,1);
 const preview=prepareCspDocuments(base,[event],[],'2026-02-01')[0];assert.equal(preview.state,'blocked');assert.equal(preview.candidates?.length,3);
});
test('isolated validation reuses the full-history index without rescanning unrelated names',()=>{
 let reads=0;
 const unrelated=Array.from({length:4000},(_,i)=>({...record,id:'unused-'+i,agentId:'A'+String(i).padStart(5,'0'),nni:'A'+String(i).padStart(5,'0'),get name(){reads++;return 'AUTRE FICTIF '+i;}}));
 const large={...data,records:[...data.records,...unrelated]};
 scopeCspPreparation(large,[event],[]);const initial=reads;assert.ok(initial>=4000);
 const result=scopeCspPreparation(large,[{...event,selected:false}],[]);assert.equal(reads,initial);assert.equal(result.data.records.length,2);
});
test('manual NNI keeps its full differently named history and pending same-name arrivals stay in the prerequisite chain',()=>{
 const manual={...event,agentId:'Z00002',identityMethod:'manual' as const};const pending={...event,id:'pending',kind:'admission' as const,agentId:'pending-csp-fixture',newAgent:true,identityPending:true,approved:true};
 const scoped=scopeCspPreparation(data,[manual],[{id:'prior',name:'RD fictif',date:'2026-01-01',status:'validated',events:[pending]}]);
 assert.equal(scoped.data.records.length,3);assert.equal(scoped.prior[0].events[0],pending);
});
