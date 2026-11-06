import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCspDocuments} from '../src/lib/csp-candidates.ts';
import {cspResolvedEvent,projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';
const data:AgentData={sources:[{id:'annual',date:'2025-12-31',primary:true} as any],records:[],events:[],issues:[],updated:'',cspIdentities:[{name:'FICTIF SAMUEL',nni:'Z90123',source:'rup-fiction',date:'2026-09-30'}]};
const candidate:CspEvent={id:'candidate',name:'FICTIF SAMUEL',agentId:'Z90123',kind:'nomination',page:1,selected:true,candidacy:true,effective:'',reference:'POSTE-FICTIF-02',agency:'AGENCE FICTIVE',job:'TECHNICIEN FICTIF',team:'EQUIPE FICTIVE',gfBefore:8,nrBefore:125};
const retained:CspEvent={...candidate,id:'retained',candidacy:undefined,effective:'2026-07-01',agency:'',gfDelta:0,gfAfter:8,nrAfter:125,nrConfirmed:true,newAgent:true};
const odj:CspImport={id:'odj',name:'ODJ fictif',date:'2026-06-01',documentType:'cr',status:'review',events:[candidate]};
const rd:CspImport={id:'rd',name:'RD fictif',date:odj.date,documentType:'rd',status:'review',events:[retained]};
const preview=(event=retained,docs=[odj,rd])=>prepareCspDocuments(data,[event],[],rd.date,docs,{id:rd.id,name:rd.name,documentType:'rd',status:'review'})[0];

test('a missing RD agency is recovered only from a unique concordant ODJ candidature and persisted for projection',()=>{
 const p=preview();assert.equal(p.state,'ready',p.problem);assert.equal(p.agency,candidate.agency);assert.equal(retained.agency,'');
 const stored={...cspResolvedEvent(retained,p),approved:true,recordedBefore:p.before,recordedAfter:p.after};assert.equal(stored.agency,candidate.agency);
 const published={...rd,status:'validated',events:[stored]};const result=projectCsp(data,[odj,published],'2026-10-01');assert.deepEqual(result.issues,[]);
 const row=result.data.records.find(r=>r.source===CSP_SOURCE)!;assert.equal(row.agency,candidate.agency);assert.equal(row.nni,'Z90123');assert.equal(row.gf,8);assert.equal(row.nr,125);
 const candidatePreview=prepareCspDocuments(data,[candidate],[],odj.date,[odj,rd],{id:odj.id,name:odj.name,documentType:'cr',status:'review'})[0];assert.equal(candidatePreview.state,'ready',candidatePreview.problem);
});

test('missing evidence, contradictory facts and ambiguous destinations cannot complete the RD agency',()=>{
 for(const source of [{...odj,status:'disabled:validated'},{...odj,date:'2026-06-02'},...[
  {agency:''},{agency:'AUTRE AGENCE',job:'AUTRE EMPLOI'},{agentId:'Z90124'},{gfBefore:9},{nrBefore:130},{extractionIssue:'Lecture incertaine'},{selected:false}
 ].map(patch=>({...odj,events:[{...candidate,...patch}]}))]){
  const p=preview(retained,[source,rd]);assert.equal(p.agency,'');assert.equal(p.state,'blocked');
 }
 assert.equal(preview(retained,[odj,{...odj,id:'other'},rd]).agency,'');
 const explicit=preview({...retained,agency:'AUTRE AGENCE'});assert.equal(explicit.agency,'AUTRE AGENCE');assert.equal(explicit.state,'blocked');
});
