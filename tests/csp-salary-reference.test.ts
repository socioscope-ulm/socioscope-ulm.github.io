import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCspDocuments} from '../src/lib/csp-candidates.ts';
import {prepareCsp,projectCsp,cspResolvedEvent,CSP_SOURCE} from '../src/lib/csp.ts';
import {activeCspEvents,preserveApproved} from '../src/lib/csp-validation.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';

// Entirely synthetic fixtures: invented identity, identifiers and salary values.
const measure:CspEvent={id:'fixture-rd',kind:'mesure',name:'EXEMPLE ALICE',page:4,agentId:'Z00001',nrSteps:1,selected:true,effective:'2026-01-01',identityMethod:'rup',identitySource:'rup-2026',identityDate:'2026-09-30',note:'Annotation conservée'};
const crEvent:CspEvent={...measure,id:'fixture-cr',page:3,gfBefore:8,nrBefore:120,nrAfter:125};
const rd:CspImport={id:'rd',documentType:'rd',name:'RD mars',date:'2026-03-24',status:'validated',events:[measure]};
const cr:CspImport={id:'cr',documentType:'cr',name:'CR mars',date:rd.date,status:'validated',events:[crEvent]};
const data:AgentData={sources:[{id:'annual',date:'2025-12-31',seniorityDate:'2025-12-31',primary:true,name:'Annual',label:'Annual',sheet:'',hash:'',confidence:'',rows:0,agents:0}],records:[],events:[],issues:[],updated:'',cspIdentities:[{name:measure.name,nni:'Z00001',source:'rup-2026',date:'2026-09-30',agency:'AMT OUEST'}]};
const current=(d:CspImport)=>({id:d.id,name:d.name,documentType:d.documentType!});
const preview=(d=rd,base=data,documents=[rd,cr])=>prepareCspDocuments(base,d.events,[],rd.date,documents,current(d))[0];

test('Synthetic salary measure uses a documented starting reference and RD +1 NR, in either document and either import order',()=>{
 assert.equal(prepareCsp(data,[measure])[0].state,'blocked');
 const original=structuredClone({data,rd,cr});
 for(const d of [rd,cr])for(const docs of [[rd,cr],[cr,rd]]){
  const p=preview(d,data,docs);assert.equal(p.state,'ready',p.problem);assert.equal(p.before?.gf,8);assert.equal(p.before?.nr,120);assert.equal(p.after?.gf,8);assert.equal(p.after?.nr,125);assert.equal(p.newAgent,undefined);assert.equal(p.salaryReference?.cr.page,3);assert.equal(p.salaryReference?.rd.page,4);assert.equal(p.note,'Annotation conservée');assert.match(p.problem,/CR.*RD.*RUP/);
 }
 assert.deepEqual({data,rd,cr},original);
});

test('approved evidence persists and CR/RD apply once; annual photographs and entry dates stay untouched',()=>{
 const approve=(d:CspImport)=>{const p=preview(d);return {...d,evidenceEvents:d.events,events:[{...cspResolvedEvent(d.events[0],p),approved:true,recordedBefore:p.before,recordedAfter:p.after}]};};
 const r=approve(rd),c=approve(cr);
 for(const documents of [[r,c],[c,r],[r,{...cr,events:[],evidenceEvents:cr.events}]]){
  const result=projectCsp(data,documents,'2026-10-26');assert.equal(result.issues.length,0);
  const rows=result.data.records.filter(r=>r.source===CSP_SOURCE);assert.equal(rows.length,1);assert.equal(rows[0].nr,125);assert.equal(rows[0].gf,8);assert.equal(rows[0].entryIEG,undefined);assert.equal(rows[0].entryUnit,undefined);assert.equal(rows[0].gfDate,undefined);assert.equal(rows[0].nrDate,'2026-01-01');assert.equal(result.data.records.filter(r=>r.source==='annual').length,0);
 }
 for(const doc of [{...cr,status:'disabled:validated'},{...cr,events:[{...crEvent,nrAfter:130}]}]){
  const result=projectCsp(data,[r,doc],'2026-10-26');assert.equal(result.issues.length,1);assert.equal(result.data.records.filter(r=>r.source===CSP_SOURCE).length,0);
 }
 // A draft supplies documentary facts without publishing its own measure.
 assert.equal(activeCspEvents({events:[crEvent],perEventValidation:true}).length,0);
});

test('missing fields can be completed but known numeric conflicts are never overwritten',()=>{
 const row={id:'one',agentId:measure.agentId!,nni:measure.agentId,name:measure.name,source:'annual',row:1,gf:8,nr:undefined,entryIEG:'2020-01-01',agency:'AMT OUEST'};
 const missing={...data,records:[row]};assert.equal(preview(rd,missing).state,'ready');
 const conflicting={...data,records:[{...row,nr:115}]};assert.equal(preview(cr,conflicting).state,'blocked');assert.equal(preview(rd,conflicting).state,'blocked');
 const noDependency={...data,records:[{...row,nr:120}]};assert.equal(preview(rd,noDependency).state,'ready');assert.equal(preview(rd,noDependency).salaryReference,undefined);
 const divergent={...data,records:[{...row,nr:115},{...row,id:'two',nr:120}]};assert.equal(preview(rd,divergent).state,'blocked');
});

test('disabled or unrelated evidence, incomplete CR, ambiguous NNI, and CR/RD contradictions remain blocked',()=>{
 const cases=[
  [{...cr,status:'disabled:validated'},rd],
  [cr,{...rd,status:'disabled:validated'}],
  [rd,{...cr,date:'2026-04-24'}],
  [rd,{...cr,events:[{...crEvent,effective:'2026-02-01'}]}],
  [rd,{...cr,events:[{...crEvent,nrBefore:undefined}]}],
  [rd,{...cr,events:[{...crEvent,nrAfter:130}]}],
  [rd,{...cr,events:[{...crEvent,gfAfter:12}]}],
  [rd,{...cr,events:[{...crEvent,extractionIssue:'Lecture incertaine'}]}],
  [rd,{...cr,events:[{...crEvent,agentId:'A12345'}]}],
  [rd,{...cr,events:[{...crEvent,selected:false}]}],
 ];
 for(const docs of cases)assert.equal(prepareCspDocuments(data,[measure],[],rd.date,docs)[0].state,'blocked');
 const ambiguous={...data,cspIdentities:[...data.cspIdentities!,{...data.cspIdentities![0],nni:'A12345'}]};assert.equal(preview(rd,ambiguous).state,'blocked');
 assert.equal(preview(rd,{...data,cspIdentities:[]}).state,'blocked');
});

test('client-supplied reference is discarded; partial validation rechecks current document edits',()=>{
 const proof=preview().salaryReference!;const forged={...measure,salaryReference:proof};
 assert.equal(prepareCsp(data,[forged])[0].state,'blocked');assert.equal(preserveApproved([forged],[],false)[0].salaryReference,undefined);
 const edited={...cr,events:[{...crEvent,nrAfter:130}]};assert.equal(preview(edited).state,'blocked');
 const isolated=preview({...rd,events:[measure,{...measure,id:'unselected',name:'AUTRE NOM',selected:false}]});assert.equal(isolated.state,'ready');
 const saved={...measure,salaryReference:proof,approved:true};assert.equal(preserveApproved([saved],[saved],true)[0],saved);
});
