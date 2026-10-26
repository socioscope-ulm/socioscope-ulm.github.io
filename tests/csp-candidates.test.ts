import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCspDocuments,addCrCandidates} from '../src/lib/csp-candidates.ts';
import {validateCspEvent,projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';
import {activeCspEvents,cspProgress} from '../src/lib/csp-validation.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';
import type {AgentData} from '../src/lib/agents.ts';
const data:AgentData={sources:[{id:'annual',date:'2025-12-31',primary:true,name:'Annual',label:'Annual',sheet:'',seniorityDate:'2025-12-31',hash:'',rows:1,agents:1,confidence:''}],records:[{id:'one',source:'annual',row:1,name:'EXEMPLE ALICE',nni:'A12345',agentId:'A12345',gf:9,nr:140,agency:'AMT CENTRE',job:'Technicien'}],events:[],issues:[],updated:'',cspIdentities:[{name:'EXEMPLE ALICE',nni:'A12345',source:'rup-2026',date:'2026-09-30'}]};
const candidate:CspEvent={id:'candidate',candidacy:true,kind:'nomination',name:'EXEMPLE ALICE',page:1,selected:true,effective:'',reference:'26-00001.01',job:'TECHNICIEN CONFIRME',agency:'AMT EST',gfBefore:9,nrBefore:140,note:'Note déjà saisie'};
const nomination:CspEvent={id:'appointment',kind:'nomination',name:'EXEMPLE ALICE',agentId:'A12345',page:2,selected:true,effective:'2026-04-01',reference:candidate.reference,job:candidate.job,agency:candidate.agency,gfDelta:0,approved:true,recordedBefore:{gf:9,nr:140},recordedAfter:{gf:9,nr:140,job:candidate.job,agency:candidate.agency}};
const rd:CspImport={id:'csp-rd',name:'RD mars',date:'2026-03-24',documentType:'rd',created:'2026-03-25',status:'validated',events:[nomination]};
const cr:CspImport={id:'csp-cr',name:'CR mars',date:rd.date,documentType:'cr',created:'2026-10-26',status:'review',events:[candidate]};
const preview=(documents:CspImport[],c: CspEvent=candidate,reference=data)=>prepareCspDocuments(reference,[c],documents.filter(d=>d.status==='validated'),rd.date,documents)[0];
test('March CR candidature waits while old RD is disabled and becomes ready when the same RD is reactivated',()=>{
 assert.equal(validateCspEvent(candidate),true);
 const disabled={...rd,status:'disabled:validated'};
 const before=preview([disabled,cr]);assert.equal(before.state,'blocked');assert.match(before.problem,/attente du RD/);
 const ready=preview([rd,cr]);assert.equal(ready.state,'ready');assert.equal(ready.matchedRD?.id,rd.id);assert.equal(ready.matchedRD?.eventId,nomination.id);assert.equal(ready.identityMethod,'rup');assert.equal(ready.effective,'2026-04-01');assert.equal(ready.after?.agency,'AMT EST');
 assert.equal(preview([cr,rd]).state,'ready');assert.equal(preview([{...rd,created:'2026-11-01'},cr]).state,'ready');assert.equal(preview([disabled,cr]).state,'blocked');assert.equal(candidate.effective,'');assert.equal(candidate.note,'Note déjà saisie');
});
test('draft RD can prepare the matching without applying any candidature, and approved CR never duplicates a validated nomination',()=>{
 assert.equal(preview([{...rd,status:'review',events:[{...nomination,approved:undefined}]},cr]).state,'ready');
 const acknowledged={...candidate,agentId:'A12345',approved:true,effective:nomination.effective};
 assert.deepEqual(activeCspEvents({events:[acknowledged],perEventValidation:true}),[]);
 const projected=projectCsp(data,[rd,{...cr,status:'validated',events:[acknowledged]}],'2026-10-26');assert.equal(projected.issues.length,0);const r=projected.data.records.find(r=>r.source===CSP_SOURCE)!;assert.equal(r.gf,9);assert.equal(r.nr,140);assert.equal(r.agency,'AMT EST');
 assert.equal(projectCsp(data,[{...cr,status:'validated',events:[acknowledged]}],'2026-10-26').data.records.find(r=>r.source===CSP_SOURCE)?.agency,'AMT CENTRE');
 assert.equal(cspProgress('validated',{events:[acknowledged],perEventValidation:true}).approved,1);
});
test('only retained candidates, same post and same CSP match; other candidates remain waiting',()=>{
 for(const d of [{...rd,date:'2026-04-24'},{...rd,events:[{...nomination,reference:'26-00002.01'}]},{...rd,events:[{...nomination,selected:false}]},{...rd,events:[{...nomination,name:'AUTRE BOB'}]}])assert.equal(preview([d]).state,'blocked');
 assert.equal(preview([rd],{...candidate,reference:''}).state,'blocked');
});
test('ambiguous or conflicting identities, destinations and situations remain blocked',()=>{
 assert.match(preview([rd],{...candidate,nrBefore:135}).problem,/NR du candidat/);
 assert.match(preview([rd],{...candidate,agency:'AMT OUEST'}).problem,/Destination différente/);
 assert.equal(preview([rd],{...candidate,job:'AUTRE EMPLOI'}).state,'blocked');
 const ambiguous={...data,cspIdentities:[...data.cspIdentities!,{name:candidate.name,nni:'B12345',source:'rup',date:'2026-09-30'}]};assert.equal(preview([rd],candidate,ambiguous).state,'blocked');
 assert.equal(preview([rd],{...candidate,extractionIssue:'Lecture incertaine'}).state,'blocked');
});
test('GF increases still require a known NR after; CR candidate NR is never treated as NR after',()=>{
 const changed={...rd,events:[{...nomination,gfDelta:1,nrAfter:undefined,approved:undefined,recordedBefore:undefined,recordedAfter:undefined}]};assert.match(preview([changed]).problem,/NR après/);
 const complete={...changed,events:[{...changed.events[0],nrAfter:145}]};const ready=preview([complete]);assert.equal(ready.state,'ready');assert.equal(ready.after?.gf,10);assert.equal(ready.after?.nr,145);
 const conflict={...rd,id:'csp-other',events:[{...nomination,effective:'2026-05-01'}]};assert.match(preview([rd,conflict]).problem,/Plusieurs RD/);
});
test('same RD earlier approved movements are retained when checking the nomination without replaying it',()=>{
 const advance={...nomination,id:'advance',kind:'avancement' as const,effective:'2026-01-01',gfDelta:undefined,nrSteps:1,reference:undefined};
 const d={...rd,events:[advance,{...nomination,nrBefore:145}]};assert.equal(preview([d],{...candidate,nrBefore:145}).state,'ready');
});
test('backfill preserves original annotations and approvals, adds only candidates and is idempotent for a validated legacy CR',()=>{
 const existing={...nomination,id:'existing',note:'Annotation conservée'};const detail={documentType:'cr',events:[existing],reports:[{page:1,note:'Page contrôlée'}],checked:true};const old=structuredClone(detail);
 const updated=addCrCandidates(detail,'validated',[candidate]);assert.deepEqual(detail,old);assert.equal(updated.candidateVersion,1);assert.equal(updated.perEventValidation,true);assert.equal(updated.events[0].approved,true);assert.equal(updated.events[0].note,existing.note);assert.equal(updated.events[1].approved,undefined);assert.equal(updated.reports[0].note,'Page contrôlée');assert.equal(cspProgress('validated',updated).pending,1);
 assert.equal(addCrCandidates(updated,'validated',[candidate]).events.length,2);
});

test('validation checks all candidate identities once without rebuilding unrelated agent histories for every match',()=>{
 let reads=0;const records=Array.from({length:2000},(_,i)=>({id:'r'+i,source:'annual',row:i,agentId:'A'+String(i).padStart(5,'0'),nni:'A'+String(i).padStart(5,'0'),get name(){reads++;return 'EXEMPLE PERSONNE '+i;},gf:9,nr:140,agency:'AMT CENTRE',job:'Technicien'}));
 const bulk={...data,records,cspIdentities:[]};
 const candidates=records.slice(0,30).map((r,i)=>({...candidate,id:'c'+i,name:r.name,reference:'26-'+String(i).padStart(5,'0')+'.01'}));
 const nominations=candidates.map((c,i)=>({...nomination,id:'n'+i,name:c.name,agentId:records[i].agentId,reference:c.reference}));
 reads=0;const result=prepareCspDocuments(bulk,candidates,[],rd.date,[{...rd,events:nominations}]);
 assert.equal(result.length,30);assert.ok(result.every(p=>p.state==='ready'));
 // Each whole history is indexed once; adding candidates must not multiply
 // that work by the number of matching nominations (the former CPU overflow).
 assert.ok(reads<records.length*4,`Unrelated histories reread ${reads} times`);
});

test('focusing a candidate history does not resolve an ambiguous RD identity by accident',()=>{
 const ambiguous={...data,cspIdentities:[...data.cspIdentities!,{name:candidate.name,nni:'B12345',source:'rup-latest',date:'2026-09-30'}]};
 const manual={...candidate,agentId:'A12345',identityMethod:'manual' as const};
 const unresolved={...rd,events:[{...nomination,approved:undefined,agentId:undefined}]};
 assert.equal(preview([unresolved],manual,ambiguous).state,'blocked');
});

test('non-retained candidates close without NNI, without creating agents or changing an existing career; reopening restores checks',()=>{
 for(const c of [candidate,{...candidate,name:'EXEMPLE INCONNU',agentId:undefined}]){
  const closed={...c,nonRetained:true};
  assert.equal(validateCspEvent(closed),true);
  assert.equal(preview([],closed).state,'not-retained');
  assert.equal(cspProgress('review',{events:[closed]}).pending,0);
  assert.equal(cspProgress('validated',{events:[closed],perEventValidation:true}).partial,false);
  assert.deepEqual(activeCspEvents({events:[closed],perEventValidation:true}),[]);
  const projected=projectCsp(data,[{...cr,status:'validated',events:[closed]}],'2026-10-26');
  assert.equal(projected.data.records.filter(r=>r.source===CSP_SOURCE).length,1);
  assert.equal(projected.data.records.find(r=>r.source===CSP_SOURCE)?.agency,'AMT CENTRE');
  assert.equal(preview([],{...closed,nonRetained:false}).state,'blocked');
 }
 assert.equal(validateCspEvent({...nomination,nonRetained:true}),false);
 assert.equal(validateCspEvent({...candidate,nonRetained:'true'}),false);
});
