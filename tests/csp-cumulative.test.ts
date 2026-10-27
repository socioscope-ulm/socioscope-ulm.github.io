import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgeCspDecisions} from '../src/lib/csp-acknowledgement.ts';
import {prepareCspDocuments} from '../src/lib/csp-candidates.ts';
import {projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';
import {activeCspEvents,cspProgress} from '../src/lib/csp-validation.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';
import type {AgentData} from '../src/lib/agents.ts';
// Entirely fictitious identity, reference and salary scenario.
const identity={name:'EXEMPLE ADELE',agentId:'Z00007'};
const base:AgentData={sources:[{id:'annual',date:'2025-12-31',primary:true} as any],records:[{id:'r',source:'annual',row:1,...identity,nni:identity.agentId,gf:7,nr:110,agency:'AGENCE FICTIVE',job:'EMPLOI FICTIF'}],events:[],issues:[],updated:''};
function fixture(gf:number,steps:number){
 const common={...identity,effective:'2026-06-01',page:1,selected:true,approved:true};
 const advance:CspEvent={...common,id:'rd-advance',kind:'avancement',nrSteps:steps,recordedBefore:{gf:7,nr:110},recordedAfter:{gf:7,nr:110+steps*5}};
 const appointment:CspEvent={...common,id:'rd-appointment',kind:'nomination',reference:'POSTE-SYNTHETIQUE',gfDelta:gf,nrSteps:2,nrAfter:120+steps*5,gfAfter:7+gf,agency:'AGENCE FICTIVE',job:'EMPLOI FICTIF',recordedBefore:{gf:7,nr:110+steps*5},recordedAfter:{gf:7+gf,nr:120+steps*5}};
 const candidate:CspEvent={...common,id:'cr-candidate',kind:'nomination',candidacy:true,reference:appointment.reference,effective:'',gfBefore:7,nrBefore:110,approved:undefined};
 const salary:CspEvent={...common,id:'cr-advance',kind:'avancement',nrSteps:steps,gfBefore:7+gf,nrBefore:120,nrAfter:120+steps*5,approved:undefined};
 const rd={id:'csp-rd',name:'RD fictif',date:'2026-05-20',status:'validated',detail:{documentType:'rd',perEventValidation:true,events:[advance,appointment]}};
 const cr={id:'csp-cr',name:'CR fictif',date:rd.date,status:'review',detail:{documentType:'cr',perEventValidation:true,events:[candidate,salary]}};
 const document=(d:typeof cr):CspImport=>({...d,documentType:d.detail.documentType as 'cr'|'rd',events:d.detail.events});
 return {rd,cr,document,advance,appointment,candidate,salary};
}
test('nomination (+1 or +2 GF, +2 NR) cumulates with +1 or +2 NR even when CR and RD describe opposite orders',()=>{
 for(const gf of [1,2])for(const steps of [1,2]){
  const {rd,cr,document}=fixture(gf,steps),original=structuredClone([rd,cr]);
  const matched=acknowledgeCspDecisions([rd,cr]);const salary=matched[1].detail.events[1];
  assert.equal(salary.approved,true);assert.equal(salary.acknowledgedByDocument?.cumulative,true);assert.equal(salary.recordedBefore?.nr,120);assert.equal(salary.recordedAfter?.nr,120+steps*5);
  assert.equal(cspProgress('review',matched[1].detail).pending,1);
  const preview=prepareCspDocuments(base,cr.detail.events,[document(rd)],cr.date,[document(rd),document(cr)],{id:cr.id,name:cr.name,documentType:'cr'});
  assert.equal(preview[0].state,'ready');assert.match(preview[0].problem,/Cumul nomination/);assert.equal(preview[0].after?.nr,120+steps*5);
  const projected=projectCsp(base,matched.map(d=>({...document(d),events:activeCspEvents(d.detail)})),'2026-10-26');
  assert.deepEqual(projected.issues,[]);const final=projected.data.records.find(r=>r.source===CSP_SOURCE)!;assert.equal(final.gf,7+gf);assert.equal(final.nr,120+steps*5);
  assert.deepEqual([rd,cr],original);
  const disabled=acknowledgeCspDecisions([{...rd,status:'disabled:validated'},matched[1]]);assert.equal(disabled[1].detail.events[1].approved,undefined);
 }
});
test('cumulative reconciliation requires a validated complete pair and never hides a contradictory amount or another meeting',()=>{
 const {rd,cr}=fixture(1,2);
 for(const source of [{...rd,status:'review'},{...rd,date:'2026-06-20'},{...rd,detail:{...rd.detail,events:[rd.detail.events[0]]}},{...rd,detail:{...rd.detail,events:rd.detail.events.map(e=>e.kind==='nomination'?{...e,recordedAfter:{gf:8,nr:135}}:e)}}]){
  assert.equal(acknowledgeCspDecisions([source,cr])[1].detail.events[1].approved,undefined);
 }
 const wrong={...cr,detail:{...cr.detail,events:cr.detail.events.map(e=>e.kind==='avancement'?{...e,nrAfter:135}:e)}};
 assert.equal(acknowledgeCspDecisions([rd,wrong])[1].detail.events[1].approved,undefined);
});
test('relative RD movements already cumulate without relying on the ordering of nomination and advancement',()=>{
 for(const gf of [1,2])for(const steps of [1,2]){
  const {rd,document}=fixture(gf,steps);
  const events=rd.detail.events.map(e=>({ ...e,recordedBefore:undefined,recordedAfter:undefined,gfAfter:undefined,nrAfter:undefined,nrSteps:e.kind==='nomination'?undefined:steps}));
  for(const order of [events,[...events].reverse()]){
   const result=projectCsp(base,[{...document(rd),events:order}],'2026-10-26');assert.deepEqual(result.issues,[]);
   const final=result.data.records.find(r=>r.source===CSP_SOURCE)!;assert.equal(final.gf,7+gf);assert.equal(final.nr,120+steps*5);
  }
 }
});

test('saved CR acknowledgement does not replay salary before the original dated RD when checking the remaining candidature',()=>{
 const {rd,cr,document}=fixture(1,1);
 const original={...document(rd),created:'2026-05-21T10:00:00Z'};
 const saved={...acknowledgeCspDecisions([rd,cr])[1],status:'validated'};
 const current={...document(saved),created:'2026-06-02T10:00:00Z'};
 const applicable=[{...original,events:activeCspEvents(rd.detail)},{...current,events:activeCspEvents(saved.detail)}];
 const preview=prepareCspDocuments(base,saved.detail.events,applicable,saved.date,[original,current],{id:current.id,name:current.name,status:current.status,documentType:'cr'});
 assert.equal(preview[0].state,'ready',preview[0].problem);
 assert.equal(preview[0].after?.nr,125);
 const isolated=saved.detail.events.map(e=>({...e,selected:e.id==='cr-candidate'||e.approved===true}));
 const checked=prepareCspDocuments(base,isolated,applicable.filter(d=>d.id!==current.id),saved.date,[original,current],{id:current.id,name:current.name,status:current.status,documentType:'cr'});
 assert.equal(checked[0].state,'ready',checked[0].problem);
 assert.deepEqual(checked[0].after,preview[0].after);
 const projected=projectCsp(base,applicable,'2026-10-26');
 assert.deepEqual(projected.issues,[]);
 assert.equal(projected.data.records.find(r=>r.source===CSP_SOURCE)?.nr,125);
});
