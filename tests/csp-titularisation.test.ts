import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgeTitularisations} from '../src/lib/csp-titularisation.ts';
import {activeCspEvents,cspProgress,preserveApproved} from '../src/lib/csp-validation.ts';
import {cspResolvedEvent} from '../src/lib/csp.ts';
import type {CspEvent} from '../src/lib/csp.ts';

const event:CspEvent={id:'one',kind:'titularisation',name:'EXEMPLE ALICE',agentId:'A12345',effective:'2024-12-16',selected:true,page:2,note:'Annotation conservée'};
const rd={id:'rd',name:'RD mars',date:'2026-03-24',status:'validated',detail:{documentType:'rd',perEventValidation:true,events:[{...event,approved:true,approvedAt:'2026-10-25T15:30:20Z'}]}};
const cr={id:'cr',name:'ODJ mars',date:rd.date,status:'validated',detail:{documentType:'cr',perEventValidation:true,events:[event],reports:[{page:2,note:'Page contrôlée'}]}};

test('25 exact titularisations leave pending automatically without mutating stored documents or replaying an event',()=>{
 const events=Array.from({length:25},(_,i)=>({...event,id:'e'+i,name:'EXEMPLE '+i,agentId:'A'+String(i).padStart(5,'0')}));
 const rows=[{...rd,detail:{...rd.detail,events:events.map(e=>({...e,approved:true}))}},{...cr,detail:{...cr.detail,events}}];const original=structuredClone(rows);
 const matched=acknowledgeTitularisations(rows);const details=matched[1].detail;
 assert.equal(cspProgress('validated',details).approved,25);assert.equal(cspProgress('validated',details).pending,0);assert.equal(activeCspEvents(details).length,0);assert.equal(activeCspEvents(matched[0].detail).length,25);
 assert.ok(details.events.every(e=>e.approved&&e.acknowledgedByDocument?.id==='rd'));
 assert.deepEqual(rows,original);assert.deepEqual(acknowledgeTitularisations(matched),matched);assert.deepEqual(details.reports,cr.detail.reports);
});

test('only selected, approved, identical RD evidence matches, regardless of import order',()=>{
 const result=acknowledgeTitularisations([cr,rd]);assert.equal(result[0].detail.events[0].acknowledgedByDocument?.id,'rd');
 const variants=[{...rd,status:'review'},{...rd,status:'disabled:validated'},{...rd,date:'2026-04-24'},...[
  {agentId:'B12345'},{name:'EXEMPLE BOB'},{effective:'2024-12-17'},{approved:false},{selected:false},{extractionIssue:'Incertain'},
 ].map(patch=>({...rd,detail:{...rd.detail,events:[{...rd.detail.events[0],...patch}]}}))];
 for(const other of variants)assert.equal(acknowledgeTitularisations([cr,other])[0].detail.events[0].approved,undefined);
 for(const patch of [{extractionIssue:'Lecture incertaine'},{nrBefore:150},{selected:false},{kind:'avancement' as const}]){
  const changed={...cr,detail:{...cr.detail,events:[{...event,...patch}]}};assert.equal(acknowledgeTitularisations([changed,rd])[0].detail.events[0].approved,undefined);
 }
 const contradictory={...rd,id:'rd-other',detail:{...rd.detail,events:[{...rd.detail.events[0],effective:'2024-12-17'}]}};
 assert.equal(acknowledgeTitularisations([cr,rd,contradictory])[0].detail.events[0].approved,undefined);
});

test('disabling or correcting the RD removes derived acknowledgement and restores pending without touching independent approvals',()=>{
 const matched=acknowledgeTitularisations([cr,rd]);
 for(const other of [{...rd,status:'disabled:validated'},{...rd,detail:{...rd.detail,events:[{...rd.detail.events[0],effective:'2025-01-01'}]}}]){
  const restored=acknowledgeTitularisations([matched[0],other])[0];assert.deepEqual(restored,cr);assert.equal(cspProgress(restored.status,restored.detail).pending,1);
 }
 const independent={...cr,detail:{...cr.detail,events:[{...event,approved:true}]}};assert.deepEqual(acknowledgeTitularisations([independent])[0],independent);
});

test('client-supplied acknowledgements are discarded and server matches survive preview round trips',()=>{
 const matched=acknowledgeTitularisations([cr,rd])[0].detail.events[0];
 assert.deepEqual(preserveApproved([matched],[],false),[event]);
 assert.equal(preserveApproved([event],[matched],true)[0],matched);
 const result=cspResolvedEvent(event,{...matched,state:'duplicate',problem:'Reconnu automatiquement'});assert.equal(result.approved,true);assert.equal(result.acknowledgedByDocument?.id,'rd');
});
