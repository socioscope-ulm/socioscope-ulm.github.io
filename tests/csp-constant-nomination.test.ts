import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCspDocuments} from '../src/lib/csp-candidates.ts';
import {acknowledgeCspDecisions} from '../src/lib/csp-acknowledgement.ts';
import {constantNominationAdvancement} from '../src/lib/csp-constant-nomination.ts';
import {activeCspEvents} from '../src/lib/csp-validation.ts';
import {projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';
const person={name:'FICTIF ROMAIN',agentId:'Z90123'};
const data:AgentData={sources:[{id:'annual',date:'2025-12-31',primary:true} as any],records:[{id:'row',source:'annual',row:1,...person,nni:person.agentId,gf:7,nr:110,agency:'AGENCE ORIGINE'}],events:[],issues:[],updated:''};
const award:CspEvent={...person,id:'award',kind:'avancement',page:1,effective:'2026-01-01',selected:true,approved:true,nrSteps:1,gfBefore:7,nrBefore:110,nrAfter:115,recordedBefore:{gf:7,nr:110},recordedAfter:{gf:7,nr:115}};
const candidate:CspEvent={...person,id:'candidate',kind:'nomination',candidacy:true,page:2,effective:'',selected:true,gfBefore:7,nrBefore:110,agency:'AGENCE DESTINATION',job:'EMPLOI FICTIF',reference:'POSTE-FICTIF'};
const nomination:CspEvent={...person,id:'nomination',kind:'nomination',page:3,effective:'2026-09-01',selected:true,approved:true,gfDelta:0,agency:candidate.agency,job:candidate.job,reference:candidate.reference,recordedBefore:{gf:7,nr:115},recordedAfter:{gf:7,nr:115,agency:candidate.agency,job:candidate.job}};
const odj:CspImport={id:'odj',name:'ODJ fictif',date:'2026-06-01',status:'validated',documentType:'cr',events:[award,candidate]};
const rd:CspImport={id:'rd',name:'RD fictif',date:odj.date,status:'validated',documentType:'rd',events:[nomination]};
function preview(source=odj,target=candidate,appointment=nomination){const rdDoc={...rd,events:[appointment]};return prepareCspDocuments(data,[...source.events.filter(e=>e.id!==candidate.id),target],[{...source,events:[award]},rdDoc],odj.date,[source,rdDoc],{id:source.id,name:source.name,documentType:'cr',status:source.status}).find(e=>e.id===target.id)!;}

test('an earlier independent NR award explains the old candidature NR for a later salary-constant nomination',()=>{
 const p=preview();assert.equal(p.state,'ready',p.problem);assert.equal(p.after?.nr,115);assert.match(p.problem,/avancement validé/);
 const result=projectCsp(data,[{...odj,events:[award]},rd],'2026-10-01');assert.deepEqual(result.issues,[]);assert.equal(result.data.records.find(r=>r.source===CSP_SOURCE)?.nr,115);
});

test('the same RD award with a detailed location is recognized without counting its NR a second time',()=>{
 const rdAward={...award,id:'rd-award',approved:undefined,agency:'SERVICE FICTIF / AGENCE ORIGINE',gfBefore:undefined,nrBefore:undefined,nrAfter:undefined,recordedBefore:{gf:7,nr:115},recordedAfter:undefined};
 const docs=[{...odj,detail:{documentType:'cr',perEventValidation:true,events:odj.events}},{...rd,detail:{documentType:'rd',perEventValidation:true,events:[rdAward,nomination]}}];
 const acknowledged=acknowledgeCspDecisions(docs);assert.equal(acknowledged[1].detail.events[0].acknowledgedByDocument?.id,odj.id);
 const result=projectCsp(data,acknowledged.map(d=>({...d,events:activeCspEvents(d.detail)})),'2026-10-01');assert.deepEqual(result.issues,[]);assert.equal(result.data.records.find(r=>r.source===CSP_SOURCE)?.nr,115);
});

test('a salary discrepancy still blocks without the exact approved award of this meeting',()=>{
 for(const bad of [{...award,approved:false},{...award,recordedAfter:{gf:7,nr:120}},{...award,effective:'2026-10-01'},{...award,agentId:'Z90124'},{...award,extractionIssue:'Incertain'}]){
  const p=preview({...odj,events:[bad,candidate]});assert.equal(p.state,'blocked');
 }
 assert.equal(constantNominationAdvancement(candidate,{...nomination,state:'ready',problem:'',before:{gf:7,nr:115},after:{gf:7,nr:115}},odj.date,[{...odj,date:'2026-06-02'}]),undefined);
 assert.equal(preview(odj,{...candidate,nrBefore:105}).state,'blocked');
});
