import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCspDocuments} from '../src/lib/csp-candidates.ts';
import {acknowledgeCspDecisions} from '../src/lib/csp-acknowledgement.ts';
import {activeCspEvents,preserveApproved} from '../src/lib/csp-validation.ts';
import {projectCsp,cspResolvedEvent,CSP_SOURCE} from '../src/lib/csp.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';
import type {AgentData} from '../src/lib/agents.ts';
const person={name:'EXEMPLE CAMILLE',agentId:'Z00008'};
const data:AgentData={sources:[{id:'annual',primary:true,date:'2025-12-31'} as any],records:[{...person,id:'one',nni:person.agentId,source:'annual',row:1,gf:8,nr:150,agency:'AGENCE ACTUELLE'}],events:[],issues:[],updated:''};
const full:CspEvent={...person,id:'full',kind:'reclassement',page:1,selected:true,effective:'2026-03-01',gfBefore:8,gfAfter:9,nrBefore:150,nrAfter:160,gfDelta:1};
const short:CspEvent={...person,id:'short',kind:'reclassement',page:1,selected:true,effective:full.effective,agency:'AGENCE ACTUELLE 1'};
const odj:CspImport={id:'odj',name:'ODJ fictif',date:'2026-04-01',status:'review',documentType:'cr',events:[full]};
const rd:CspImport={id:'rd',name:'RD fictif',date:odj.date,status:'review',documentType:'rd',events:[short]};
const preview=(documents=[odj,rd],e=short,reference=data)=>prepareCspDocuments(reference,[e],[],rd.date,documents,{id:rd.id,name:rd.name,documentType:'rd',status:'review'})[0];
const publish=(p:ReturnType<typeof preview>)=>({...rd,status:'validated',events:[{...cspResolvedEvent(short,p),approved:true,recordedBefore:p.before,recordedAfter:p.after}]});

test('draft ODJ prepares the short RD automatically in either import order without approving anything',()=>{
 for(const documents of [[odj,rd],[rd,odj]]){
  const p=preview(documents);assert.equal(p.state,'ready');assert.equal(p.gfDelta,1);assert.equal(p.after?.gf,9);assert.equal(p.after?.nr,160);assert.match(p.problem,/automatiquement/);assert.equal(p.approved,undefined);
  assert.equal(projectCsp(data,documents,'2026-10-01').data.records.find(r=>r.source===CSP_SOURCE),undefined);
 }
 assert.equal(preview([rd]).state,'blocked');
 const unresolved={...short,agentId:undefined};assert.equal(preview([{...odj,events:[{...full,agentId:undefined}]},{...rd,events:[unresolved]}],unresolved).state,'ready');
});

test('validation stores documentary proof, applies the award once, and later closes its ODJ without another movement',()=>{
 const validated=publish(preview());
 const p=projectCsp(data,[odj,validated],'2026-10-01');assert.deepEqual(p.issues,[]);const row=p.data.records.find(r=>r.source===CSP_SOURCE)!;assert.equal(row.gf,9);assert.equal(row.nr,160);assert.equal(row.agency,'AGENCE ACTUELLE');
 const acknowledged=acknowledgeCspDecisions([odj,validated].map(d=>({...d,detail:{documentType:d.documentType,perEventValidation:true,events:d.events}})));
 assert.equal(acknowledged[0].detail.events[0].approved,true);assert.equal(acknowledged[0].detail.events[0].acknowledgedByDocument?.id,rd.id);assert.equal(activeCspEvents(acknowledged[0].detail).length,0);
 const duplicate={...odj,status:'validated',events:[{...full,approved:true}]};assert.equal(projectCsp(data,[validated,duplicate],'2026-10-01').data.records.find(r=>r.source===CSP_SOURCE)?.nr,160);
});

test('incomplete, disabled or contradictory evidence cannot prepare a missing GF count',()=>{
 for(const source of [{...odj,status:'disabled:validated'},{...odj,date:'2026-04-02'},{...odj,events:[{...full,gfAfter:undefined}]},{...odj,events:[{...full,nrAfter:165}]},{...odj,events:[{...full,extractionIssue:'Lecture incertaine'}]},{...odj,events:[{...full,agentId:'Z00009'}]}])assert.equal(preview([source,rd]).state,'blocked');
 for(const patch of [{gfBefore:7},{nrBefore:145},{gfAfter:10},{nrAfter:165},{nrSteps:1},{gfDelta:2}])assert.equal(preview([odj,rd],{...short,...patch}).state,'blocked');
 assert.equal(preview([odj,rd,{...odj,id:'other',events:[{...full,nrBefore:155,nrAfter:165}]}]).state,'blocked');
 const conflicting={...data,records:[150,155].map((nr,i)=>({...data.records[0],id:'r'+i,nr}))};assert.equal(preview([odj,rd],short,conflicting).state,'blocked');
 const forged={...short,reclassementReference:preview().reclassementReference};assert.equal(preserveApproved([forged],[],false)[0].reclassementReference,undefined);
});

test('changing or disabling the ODJ invalidates the borrowed reference rather than replaying it',()=>{
 const published=publish(preview());
 for(const source of [{...odj,status:'disabled:validated'},{...odj,events:[{...full,nrBefore:155,nrAfter:165}]}]){
  const p=projectCsp(data,[source,published],'2026-10-01');assert.equal(p.issues.length,1);assert.equal(p.data.records.find(r=>r.source===CSP_SOURCE)?.nr,150);
 }
});


test('an ODJ cannot use itself as a documentary fallback for its own missing annual starting salary',()=>{
 const incomplete={...data,records:[{...data.records[0],gf:undefined}]};
 const p=prepareCspDocuments(incomplete,[full],[],odj.date,[odj,rd],{id:odj.id,name:odj.name,documentType:'cr',status:'review'})[0];
 assert.equal(p.reclassementReference,undefined);assert.equal(p.state,'blocked');
});
