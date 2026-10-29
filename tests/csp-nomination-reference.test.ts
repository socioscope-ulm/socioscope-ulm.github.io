import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCspDocuments} from '../src/lib/csp-candidates.ts';
import {cspResolvedEvent,projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';
import {preserveApproved} from '../src/lib/csp-validation.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';
const person={name:'EXEMPLE CAMILLE',agentId:'Z00009'};
const data:AgentData={sources:[{id:'annual',name:'Annuel fictif',date:'2025-12-31',primary:true} as any],records:[],events:[],issues:[],updated:'',cspIdentities:[{name:person.name,nni:person.agentId,source:'rup-fiction',date:'2026-09-30'}]};
const candidate:CspEvent={...person,id:'candidate',page:1,kind:'nomination',candidacy:true,selected:true,effective:'',reference:'26-00007.01',agency:'AGENCE FICTIVE',job:'EMPLOI FICTIF',gfBefore:10,nrBefore:155};
const retained:CspEvent={...person,id:'retained',page:2,kind:'nomination',selected:true,effective:'2026-08-01',reference:candidate.reference,agency:candidate.agency,job:candidate.job,gfDelta:0};
const odj:CspImport={id:'odj',name:'ODJ fictif',date:'2026-06-15',documentType:'cr',status:'review',events:[candidate]};
const rd:CspImport={id:'rd',name:'RD fictif',date:odj.date,documentType:'rd',status:'review',events:[retained]};
const preview=(ref=data,event=retained,docs=[odj,rd])=>prepareCspDocuments(ref,[event],[],rd.date,docs,{id:rd.id,name:rd.name,documentType:'rd',status:rd.status})[0];
const saved=(p:ReturnType<typeof preview>)=>({...rd,status:'validated',events:[{...cspResolvedEvent(retained,p),approved:true,recordedBefore:p.before,recordedAfter:p.after}]});

test('concordant ODJ and retained GF-constant RD become ready, including an arrival confirmed by a later active RUP',()=>{
 const p=preview();assert.equal(p.state,'ready');assert.deepEqual(p.before,{gf:10,nr:155});assert.equal(p.after?.gf,10);assert.equal(p.after?.nr,155);assert.ok(p.nominationReference?.arrivalConfirmed);
 const c=prepareCspDocuments(data,[candidate],[],odj.date,[rd,odj],{id:odj.id,name:odj.name,documentType:'cr',status:odj.status})[0];assert.equal(c.state,'ready');assert.equal(c.after?.nr,155);
 assert.equal(projectCsp(data,[odj,rd],'2026-10-01').data.records.length,0);
 const published=saved(p);const output=projectCsp(data,[odj,published],'2026-10-01');assert.deepEqual(output.issues,[]);
 const row=output.data.records.find(r=>r.source===CSP_SOURCE)!;assert.equal(row.gf,10);assert.equal(row.nr,155);assert.equal(row.entryUnit,'2026-08-01');assert.equal(row.agency,candidate.agency);
 const approvedOdj={...odj,status:'validated',events:[{...candidate,approved:true}]};assert.equal(projectCsp(data,[approvedOdj,published],'2026-10-01').data.records.filter(r=>r.source===CSP_SOURCE).length,1);
 assert.equal(projectCsp(data,[odj,published],'2026-07-01').data.records.length,0);
});

test('missing internal GF/NR can be completed, +1 or +2 GF retain the +2 NR rule, and complete references stay independent',()=>{
 const internal={...data,records:[{id:'known',source:'annual',row:1,...person,nni:person.agentId,gf:10}]};
 for(const gfDelta of [1,2]){const p=preview(internal,{...retained,gfDelta});assert.equal(p.state,'ready');assert.equal(p.after?.gf,10+gfDelta);assert.equal(p.after?.nr,165);}
 const known={...internal,records:[{...internal.records[0],nr:155}]};const p=preview(known);assert.equal(p.state,'ready');assert.equal(p.nominationReference,undefined);
 const conflicting={...internal,records:[{...internal.records[0],gf:11}]};assert.equal(preview(conflicting).state,'blocked');
 const salaryConflict={...internal,records:[150,155].map((nr,i)=>({...internal.records[0],id:'conflict-'+i,nr}))};assert.equal(preview(salaryConflict).state,'blocked');
 const externalGain=preview(data,{...retained,gfDelta:1});assert.equal(externalGain.state,'blocked');
 const explicit=preview(data,{...retained,gfDelta:1,nrAfter:165});assert.equal(explicit.state,'ready');assert.equal(explicit.after?.nr,165);
});

test('missing or stale RUP presence is insufficient to infer an arrival; manual arrival confirmation remains available',()=>{
 for(const ref of [{...data,cspIdentities:[]},{...data,cspIdentities:[{...data.cspIdentities![0],date:'2026-07-01'}]}])assert.equal(preview(ref).state,'blocked');
 const oldRup={...data,cspIdentities:[{...data.cspIdentities![0],date:'2026-07-01'}]};assert.equal(preview(oldRup,{...retained,newAgent:true}).state,'ready');
 const ambiguous={...data,cspIdentities:[...data.cspIdentities!,{...data.cspIdentities![0],nni:'Z00010'}]};assert.equal(preview(ambiguous).state,'blocked');
});

test('contradictory or disabled documentary evidence stays blocked and invalidates an approved dependent projection',()=>{
 for(const source of [{...odj,status:'disabled:validated'},{...odj,date:'2026-06-16'},{...odj,events:[{...candidate,reference:'OTHER'}]},{...odj,events:[{...candidate,extractionIssue:'Lecture incertaine'}]},{...odj,events:[{...candidate,agency:'AUTRE AGENCE'}]},{...odj,events:[{...candidate,nrBefore:undefined}]}])assert.equal(preview(data,retained,[source,rd]).state,'blocked');
 assert.equal(preview(data,{...retained,nrBefore:160}).state,'blocked');
 assert.equal(preview(data,retained,[odj,{...odj,id:'other',events:[{...candidate,nrBefore:160}]},rd]).state,'blocked');
 const published=saved(preview());
 for(const source of [{...odj,status:'disabled:validated'},{...odj,events:[{...candidate,nrBefore:160}]}]){const p=projectCsp(data,[source,published],'2026-10-01');assert.equal(p.issues.length,1);assert.equal(p.data.records.length,0);}
 assert.equal(preserveApproved([{...retained,nominationReference:preview().nominationReference}],[],false)[0].nominationReference,undefined);
});
