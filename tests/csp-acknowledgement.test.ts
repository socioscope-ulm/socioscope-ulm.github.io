import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgeCspDecisions} from '../src/lib/csp-acknowledgement.ts';
import {activeCspEvents,cspProgress,preserveApproved} from '../src/lib/csp-validation.ts';
import {cspResolvedEvent} from '../src/lib/csp.ts';
import type {CspEvent} from '../src/lib/csp.ts';

const base:CspEvent={id:'event',name:'EXEMPLE ALICE',agentId:'A12345',kind:'avancement',effective:'2026-01-01',page:2,selected:true,nrSteps:1};
const document=(id:string,type:'cr'|'rd',event:CspEvent,status='validated')=>({id,name:type.toUpperCase()+' mars',date:'2026-03-24',status,detail:{documentType:type,perEventValidation:true,events:[event],reports:[{page:2,note:'Conservé'}]}});
const approved=(event:CspEvent):CspEvent=>({...event,approved:true,approvedAt:'2026-10-26T10:00:00Z'});

test('all actual decision types are acknowledged in either direction, including a draft counterpart',()=>{
 const events:CspEvent[]=[
  base,{...base,kind:'mesure'}, {...base,kind:'posthume',nrSteps:2},
  {...base,kind:'titularisation',nrSteps:undefined},
  {...base,kind:'reclassement',nrSteps:undefined,gfDelta:1,gfBefore:9,gfAfter:10,nrBefore:150,nrAfter:160},
  {...base,kind:'mutation',nrSteps:undefined,gfDelta:0,agency:'AMT EST',job:'Technicien',gfBefore:9,gfAfter:9,nrBefore:150,nrAfter:150},
  {...base,kind:'admission',nrSteps:undefined,gfAfter:8,nrAfter:100,agency:'AMT EST',job:'Technicien',newAgent:true},
  {...base,kind:'nomination',nrSteps:undefined,gfDelta:1,gfBefore:9,gfAfter:10,nrBefore:150,nrAfter:160,agency:'AMT EST',job:'Responsable',reference:'26-001'},
 ];
 for(const event of events)for(const from of ['cr','rd'] as const)for(const status of ['review','validated']){
  const source=document('source',from,approved(event));const target=document('target',from==='cr'?'rd':'cr',{...event,id:'other'},status);
  const original=structuredClone([source,target]);const result=acknowledgeCspDecisions([source,target]);const e=result[1].detail.events[0];
  assert.equal(e.approved,true,event.kind+' '+from+' '+status);assert.equal(e.acknowledgedByDocument?.documentType,from);assert.equal(e.acknowledgedByDocument?.id,'source');
  assert.equal(cspProgress(status,result[1].detail).pending,0);assert.equal(cspProgress(status,result[1].detail).approved,1);
  assert.equal(activeCspEvents(result[1].detail).length,0);assert.equal(activeCspEvents(result[0].detail).length,1);assert.deepEqual([source,target],original);
 }
});

test('a relative RD and detailed ODJ match only when all explicit GF/NR values agree with the validated evidence',()=>{
 const source=document('rd','rd',approved({...base,recordedBefore:{gf:11,nr:185},recordedAfter:{gf:11,nr:190}}));
 const detailed={...base,id:'cr-event',gfBefore:11,nrBefore:185,nrAfter:190};
 assert.equal(acknowledgeCspDecisions([source,document('cr','cr',detailed)])[1].detail.events[0].approved,true);
 for(const patch of [{gfBefore:10},{nrBefore:180},{nrAfter:195},{nrSteps:2},{effective:'2026-02-01'},{agentId:'B12345'},{extractionIssue:'Incertain'}]){
  assert.equal(acknowledgeCspDecisions([source,document('cr','cr',{...detailed,...patch})])[1].detail.events[0].approved,undefined);
 }
 const reverse=acknowledgeCspDecisions([document('cr','cr',approved(detailed)),document('rd','rd',base)]);assert.equal(reverse[1].detail.events[0].approved,true);
 // Synthetic contradictory references: same +1 NR and date do not establish identity.
 const contradicted=document('rd','rd',approved({...base,recordedBefore:{gf:9,nr:150},recordedAfter:{gf:9,nr:155}}));
 assert.equal(acknowledgeCspDecisions([contradicted,document('cr','cr',{...base,gfBefore:10,nrBefore:160,nrAfter:165})])[1].detail.events[0].approved,undefined);
});

test('different destinations, meetings, draft sources, and unselected events never clear pending',()=>{
 const move={...base,kind:'mutation' as const,nrSteps:undefined,gfDelta:0,agency:'AMT EST',job:'Technicien'};
 const target=document('cr','cr',move);
 const sources=[document('rd','rd',approved({...move,agency:'AMT OUEST'})),document('rd','rd',approved({...move,job:'Responsable'})),document('rd','rd',move,'review'),document('rd','rd',approved({...move,selected:false})),document('rd','cr',approved(move)),{...document('rd','rd',approved(move)),date:'2026-04-24'}];
 for(const source of sources)assert.equal(acknowledgeCspDecisions([source,target])[1].detail.events[0].approved,undefined);
 // A candidature is evidence about a candidate, not the nomination decision.
 const candidate={...base,kind:'nomination' as const,candidacy:true,reference:'26-001'};
 assert.equal(acknowledgeCspDecisions([document('rd','rd',approved({...candidate,candidacy:false})),document('cr','cr',candidate)])[1].detail.events[0].approved,undefined);
});

test('acknowledgements cannot form chains or survive source disabling; client-provided proofs are discarded',()=>{
 const source=document('cr','cr',approved(base)),target=document('rd','rd',{...base,id:'target'});
 const result=acknowledgeCspDecisions([source,target]);const e=result[1].detail.events[0];
 assert.deepEqual(acknowledgeCspDecisions(result),result);
 const disabled=acknowledgeCspDecisions([{...source,status:'disabled:validated'},result[1]]);assert.equal(disabled[1].detail.events[0].approved,undefined);
 const fake={...base,approved:true,acknowledgedByDocument:{id:'rd',eventId:'two',name:'RD',page:2,documentType:'rd' as const}};
 const cycle=acknowledgeCspDecisions([document('cr','cr',fake),document('rd','rd',{...fake,acknowledgedByDocument:{...fake.acknowledgedByDocument,id:'cr',documentType:'cr'}})]);
 assert.ok(cycle.every(d=>!d.detail.events[0].approved));assert.equal(preserveApproved([fake],[],false)[0].acknowledgedByDocument,undefined);
 const client=cspResolvedEvent(target.detail.events[0],{...e,state:'duplicate',problem:''});assert.equal(client.approved,true);assert.equal(client.acknowledgedByDocument?.documentType,'cr');
});
