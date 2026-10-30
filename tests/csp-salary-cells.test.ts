import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverTitularisationCells} from '../src/lib/csp-salary-cells.ts';
import {prepareCsp,projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';
import type {CspEvent} from '../src/lib/csp.ts';
const e:CspEvent={id:'saved',kind:'titularisation',name:'EXEMPLE ALICE',effective:'2026-04-01',page:2,selected:true,note:'Annotation conservée'};
const fresh:CspEvent={...e,id:'parsed',gfBefore:8,gfAfter:8,nrBefore:130,nrAfter:130};
test('re-read fills only missing salary cells of the exact unpublished titularisation and is idempotent',()=>{
 const detail={events:[e,{...e,id:'published',approved:true}],perEventValidation:true};const before=structuredClone(detail);
 const result=recoverTitularisationCells(detail,'validated',[fresh]);
 assert.equal(result.events[0].nrBefore,130);assert.equal(result.events[0].gfAfter,8);assert.equal(result.events[0].id,'saved');assert.equal(result.events[0].approved,undefined);assert.equal(result.events[0].note,e.note);assert.deepEqual(result.events[1],detail.events[1]);assert.deepEqual(detail,before);assert.deepEqual(recoverTitularisationCells(result,'validated',[fresh]),result);
 for(const f of [{...fresh,page:3},{...fresh,effective:'2026-05-01'},{...fresh,name:'AUTRE PERSONNE'}])assert.deepEqual(recoverTitularisationCells(detail,'validated',[f]).events,detail.events);
 assert.deepEqual(recoverTitularisationCells(detail,'validated',[fresh,fresh]).events,detail.events);
 assert.deepEqual(recoverTitularisationCells({...detail,perEventValidation:false},'validated',[fresh]).events,detail.events);
 assert.match(recoverTitularisationCells({events:[{...e,nrBefore:140}]},'review',[fresh]).events[0].extractionIssue,/contredit/);
});
test('documented unchanged salary completes an existing admission before titularisation without salary gain or invented arrival',()=>{
 const data:any={sources:[{id:'annual',date:'2025-12-31',primary:true}],records:[],events:[],cspIdentities:[{name:e.name,nni:'Z00009',source:'rup',date:'2026-09-30'}]};
 const arrival:CspEvent={...e,id:'arrival',agentId:'Z00009',kind:'admission',newAgent:true,gfAfter:8,agency:'AGENCE FICTIVE',job:'EMPLOI FICTIF',approved:true};
 const prior={id:'rd',date:'2026-04-20',name:'RD fictif',status:'validated',events:[arrival]};
 const p=prepareCsp(data,[fresh],[prior])[0];assert.equal(p.state,'ready',p.problem);assert.equal(p.before?.nr,130);assert.equal(p.after?.nr,130);assert.equal(p.after?.gf,8);
 const result=projectCsp(data,[prior,{id:'odj',date:'2026-04-20',name:'ODJ fictif',status:'validated',events:[{...fresh,agentId:'Z00009',approved:true}]}],'2026-06-01');assert.equal(result.issues.length,0);const row=result.data.records.find(r=>r.source===CSP_SOURCE);assert.equal(row?.nr,130);assert.equal(row?.presence,'Titulaire');assert.equal(row?.entryUnit,arrival.effective);assert.equal(row?.nrDate,undefined);
});
