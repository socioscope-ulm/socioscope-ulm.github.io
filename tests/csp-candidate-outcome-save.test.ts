import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgeCspDecisions} from '../src/lib/csp-acknowledgement.ts';
import {activeCspEvents,cspProgress,preserveApproved,setCspCandidateOutcome} from '../src/lib/csp-validation.ts';
import type {CspEvent} from '../src/lib/csp.ts';
const admission:CspEvent={id:'original',name:'FICTIF LUCIE',agentId:'Z90123',kind:'admission',selected:true,effective:'2026-06-01',page:1,pages:[1],agency:'AGENCE FICTIVE',job:'EMPLOI FICTIF',gfAfter:8,nrAfter:125,newAgent:true,approved:true,recordedAfter:{gf:8,nr:125,agency:'AGENCE FICTIVE',job:'EMPLOI FICTIF'}};
const recovered:CspEvent={id:'recovered',name:admission.name,kind:'admission',selected:true,effective:admission.effective,page:1,pages:[1],agency:admission.agency,job:admission.job,gfAfter:8};
const candidates:CspEvent[]=Array.from({length:7},(_,i)=>({id:'candidate-'+i,name:'FICTIF CANDIDAT '+String.fromCharCode(65+i),kind:'nomination',candidacy:true,selected:true,effective:'',page:i+2,reference:'POSTE-FICTIF-'+i}));
const odj={id:'odj',name:'ODJ fictif',date:'2026-06-15',status:'validated',detail:{documentType:'cr',perEventValidation:true,events:[admission,...candidates]}};
const rd={id:'rd',name:'RD fictif',date:odj.date,status:'validated',detail:{documentType:'rd',perEventValidation:true,events:[recovered]}};

test('recovered RD admissions are recognized on read and seven vacant-post candidates are treated immediately',()=>{
 const original=structuredClone([odj,rd]);const result=acknowledgeCspDecisions([odj,rd]);
 const e=result[1].detail.events[0];assert.equal(e.agentId,admission.agentId);assert.equal(e.approved,true);assert.equal(e.acknowledgedByDocument?.id,odj.id);
 assert.equal(cspProgress('validated',result[1].detail).pending,0);assert.equal(activeCspEvents(result[1].detail).length,0);
 assert.ok(result[0].detail.events.filter(e=>e.candidacy).every(e=>e.nonRetainedByRD?.reason==='unfilled-post'));
 assert.equal(cspProgress('validated',result[0].detail).pending,0);assert.equal(activeCspEvents(result[0].detail).length,1);assert.deepEqual([odj,rd],original);
 const repeated=acknowledgeCspDecisions(result);assert.deepEqual(repeated,result);
 const disabled=acknowledgeCspDecisions([result[0],{...result[1],status:'disabled:validated'}]);assert.ok(disabled[0].detail.events.filter(e=>e.candidacy).every(e=>!e.nonRetainedByRD));
});

test('a recovered admission cannot take an identity from ambiguous, disabled, chained or contradictory evidence',()=>{
 for(const source of [{...odj,status:'disabled:validated'},{...odj,status:'review'},{...odj,date:'2026-06-16'},...[
  {...admission,approved:false},{...admission,acknowledgedByDocument:{id:'other',name:'Autre',eventId:'proof',page:1,documentType:'rd' as const}},
 ].map(e=>({...odj,detail:{...odj.detail,events:[e,...candidates]}})),{...odj,detail:{...odj.detail,events:[admission,{...admission,id:'ambiguous'},...candidates]}}]){
  const result=acknowledgeCspDecisions([source,rd]);assert.equal(result[1].detail.events[0].approved,undefined);
 }
 for(const patch of [{agentId:'Z90124'},{gfAfter:9},{nrAfter:130},{agency:'AUTRE AGENCE'},{job:'AUTRE EMPLOI'},{effective:'2026-07-01'},{extractionIssue:'Incertain'}])assert.equal(acknowledgeCspDecisions([odj,{...rd,detail:{...rd.detail,events:[{...recovered,...patch}]}}])[1].detail.events[0].approved,undefined);
});

test('a stale recovered row can be restored to its trusted derived acknowledgement without accepting changed facts',()=>{
 const acknowledged=acknowledgeCspDecisions([odj,rd])[1].detail.events[0];
 assert.equal(preserveApproved([recovered],[acknowledged],true,[recovered])[0],acknowledged);
 for(const patch of [{gfAfter:9},{nrAfter:130},{agentId:'Z90124'},{agency:'AUTRE AGENCE'}])assert.throws(()=>preserveApproved([{...recovered,...patch}],[acknowledged],true,[recovered]),/Corriger/);
});

test('manual non-retention persists as a documentary outcome and can be reopened without publishing movements',()=>{
 const events=[admission,candidates[0]];const closed=setCspCandidateOutcome(events,candidates[0].id,true);
 assert.equal(closed[0],admission);assert.equal(closed[1].nonRetained,true);assert.equal(closed[1].approved,undefined);
 assert.equal(cspProgress('validated',{events:closed,perEventValidation:true}).pending,0);assert.equal(activeCspEvents({events:closed,perEventValidation:true}).length,1);
 assert.equal(setCspCandidateOutcome(closed,candidates[0].id,false)[1].nonRetained,false);
 for(const e of [admission,{...candidates[0],approved:true},{...candidates[0],nonRetainedByRD:{id:'rd',name:'RD fictif',documentType:'rd' as const,reason:'unfilled-post' as const}}])assert.throws(()=>setCspCandidateOutcome([e],e.id,true),/candidature/);
});
