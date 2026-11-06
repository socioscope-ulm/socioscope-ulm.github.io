import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgeCspDecisions} from '../src/lib/csp-acknowledgement.ts';
import {activeCspEvents,cspProgress} from '../src/lib/csp-validation.ts';
import {projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent} from '../src/lib/csp.ts';
const person={name:'FICTIF ANAEL',agentId:'Z90123'};
const common={...person,page:1,pages:[1],selected:true,effective:'2026-01-01'};
const classification:CspEvent={...common,id:'classification',kind:'reclassement',gfBefore:7,nrBefore:110,gfAfter:8,nrAfter:120,gfDelta:1,approved:true,recordedBefore:{gf:7,nr:110},recordedAfter:{gf:8,nr:120}};
const target:CspEvent={...common,id:'odj-award',kind:'avancement',gfBefore:7,nrBefore:110,nrAfter:115,nrSteps:1};
const award:CspEvent={...common,id:'rd-award',kind:'avancement',nrSteps:1,approved:true,recordedBefore:{gf:8,nr:120},recordedAfter:{gf:8,nr:125}};
const odj={id:'odj',name:'ODJ fictif',date:'2026-09-15',status:'validated',detail:{documentType:'cr',perEventValidation:true,events:[classification,target]}};
const rd={id:'rd',name:'RD fictif',date:odj.date,status:'validated',detail:{documentType:'rd',perEventValidation:true,events:[award]}};
const data:AgentData={sources:[{id:'annual',date:'2025-12-31',primary:true} as any],records:[{id:'row',source:'annual',row:1,...person,nni:person.agentId,gf:7,nr:110}],events:[],issues:[],updated:''};

test('an ODJ NR award quoting the pre-reclassement salary is recognized as the same already approved RD award',()=>{
 const original=structuredClone([odj,rd]);const rows=acknowledgeCspDecisions([odj,rd]);const e=rows[0].detail.events[1];
 assert.equal(e.approved,true);assert.equal(e.acknowledgedByDocument?.id,rd.id);assert.equal(e.acknowledgedByDocument?.cumulative,true);assert.equal(e.acknowledgedByDocument?.cumulativeKind,'reclassement');
 assert.equal(e.recordedBefore?.gf,7);assert.equal(e.recordedBefore?.nr,110);assert.equal(e.recordedAfter?.nr,115);assert.equal(cspProgress('validated',rows[0].detail).pending,0);
 const docs=rows.map(r=>({...r,documentType:r.detail.documentType as 'cr'|'rd',events:activeCspEvents(r.detail)}));
 const result=projectCsp(data,[...docs].reverse(),'2026-10-01');assert.deepEqual(result.issues,[]);const person=result.data.records.find(r=>r.source===CSP_SOURCE)!;assert.equal(person.gf,8);assert.equal(person.nr,125);assert.deepEqual([odj,rd],original);
 assert.deepEqual(acknowledgeCspDecisions(rows),rows);
});

test('recognition requires exact approved same-day salary proofs from the same meeting and is withdrawn when a source is disabled',()=>{
 for(const change of [{...classification,approved:false},{...classification,effective:'2026-02-01'},{...classification,recordedAfter:{gf:8,nr:125}},{...classification,agentId:'Z90124'},{...classification,extractionIssue:'Incertain'}]){
  const rows=acknowledgeCspDecisions([{...odj,detail:{...odj.detail,events:[change,target]}},rd]);assert.equal(rows[0].detail.events[1].approved,undefined);
 }
 for(const doc of [{...rd,status:'review'},{...rd,date:'2026-09-16'},{...rd,status:'disabled:validated'},{...rd,detail:{...rd.detail,events:[{...award,recordedAfter:{gf:8,nr:130}}]}}])assert.equal(acknowledgeCspDecisions([odj,doc])[0].detail.events[1].approved,undefined);
 const wrong={...odj,detail:{...odj.detail,events:[classification,{...target,nrAfter:120}]}};assert.equal(acknowledgeCspDecisions([wrong,rd])[0].detail.events[1].approved,undefined);
 const matched=acknowledgeCspDecisions([odj,rd]);assert.equal(acknowledgeCspDecisions([matched[0],{...matched[1],status:'disabled:validated'}])[0].detail.events[1].approved,undefined);
});
