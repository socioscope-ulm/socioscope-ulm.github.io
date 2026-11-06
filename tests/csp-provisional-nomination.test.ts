import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCspDocuments} from '../src/lib/csp-candidates.ts';
import {cspResolvedEvent,projectCsp,CSP_SOURCE,validateCspEvent} from '../src/lib/csp.ts';
import {pendingAdmissionId} from '../src/lib/csp-pending-admission.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';
const data:AgentData={sources:[{id:'annual',date:'2025-12-31',primary:true} as any],records:[],events:[],issues:[],updated:''};
const candidate:CspEvent={id:'candidate',name:'FICTIF NOEMIE',kind:'nomination',page:1,selected:true,candidacy:true,effective:'',reference:'POSTE-FICTIF-01',agency:'AGENCE FICTIVE',job:'EMPLOI FICTIF',gfBefore:8,nrBefore:125};
const retained:CspEvent={id:'retained',name:candidate.name,kind:'nomination',page:2,selected:true,effective:'2026-04-01',reference:candidate.reference,agency:candidate.agency,job:candidate.job,gfDelta:1};
const odj:CspImport={id:'odj',name:'ODJ fictif',date:'2026-03-10',documentType:'cr',status:'review',events:[candidate]};
const rd:CspImport={id:'rd',name:'RD fictif',date:odj.date,documentType:'rd',status:'review',events:[retained]};
const preview=(event=retained,docs=[odj,rd],ref=data)=>prepareCspDocuments(ref,[event],[],rd.date,docs,{id:rd.id,name:rd.name,documentType:'rd',status:'review'})[0];

test('one or two GF gains can create one provisional arrival from concordant ODJ/RD and replay the documented salary once',()=>{
 for(const gfDelta of [1,2]){
  const event={...retained,gfDelta};const p=preview(event);
  assert.equal(p.state,'ready',p.problem);assert.equal(p.agentId,pendingAdmissionId(p));
  assert.equal(p.after?.gf,8+gfDelta);assert.equal(p.after?.nr,135);
  const stored={...cspResolvedEvent(event,p),approved:true,recordedBefore:p.before,recordedAfter:p.after};
  assert.equal(stored.gfBefore,8);assert.equal(stored.nrBefore,125);assert.equal(stored.nrSteps,2);assert.equal(validateCspEvent(stored),true);
  const published={...rd,status:'validated',events:[stored]};
  const result=projectCsp(data,[published],'2026-05-01');assert.deepEqual(result.issues,[]);
  const rows=result.data.records.filter(r=>r.source===CSP_SOURCE);assert.equal(rows.length,1);assert.equal(rows[0].gf,8+gfDelta);assert.equal(rows[0].nr,135);assert.equal(rows[0].nni,undefined);
  assert.equal(projectCsp(data,[published],'2026-03-01').data.records.length,0);
  const real={...data,cspIdentities:[{name:candidate.name,nni:'Z90123',source:'rup-fiction',date:'2026-05-01',agency:candidate.agency}]};
  const reconciled=projectCsp(real,[published],'2026-06-01');assert.deepEqual(reconciled.issues,[]);
  const person=reconciled.data.records.find(r=>r.source===CSP_SOURCE)!;assert.equal(person.nni,'Z90123');assert.equal(person.gf,8+gfDelta);assert.equal(person.nr,135);
 }
});

test('explicit NR instructions override the default; contradictions and incomplete or ambiguous evidence remain blocked',()=>{
 for(const [patch,nr] of [[{nrAfter:145},145],[{nrSteps:1},130],[{nrConfirmed:true},125]] as const){
  const p=preview({...retained,...patch});assert.equal(p.state,'ready',p.problem);assert.equal(p.after?.nr,nr);
 }
 for(const event of [{...retained,gfDelta:undefined},{...retained,gfDelta:3},{...retained,gfAfter:20},{...retained,gfBefore:7},{...retained,nrBefore:120}])assert.equal(preview(event).state,'blocked');
 for(const source of [{...odj,status:'disabled:validated'},{...odj,date:'2026-03-11'},{...odj,events:[{...candidate,nrBefore:undefined}]},{...odj,events:[{...candidate,extractionIssue:'Lecture incertaine'}]},{...odj,events:[{...candidate,agency:'AUTRE AGENCE'}]}])assert.equal(preview(retained,[source,rd]).state,'blocked');
 assert.equal(preview(retained,[odj,{...odj,id:'other'},rd]).state,'blocked');
 const ambiguous={...data,cspIdentities:['Z90123','Z90124'].map(nni=>({name:candidate.name,nni,source:'rup-fiction',date:'2026-05-01'}))};
 assert.equal(preview(retained,[odj,rd],ambiguous).state,'blocked');
});
