import test from 'node:test';
import assert from 'node:assert/strict';
import {extractCspPages} from '../src/lib/csp-extract.ts';
import {recoverCspPages,confirmCspPage} from '../src/lib/csp-recovery.ts';
import {cspUnreadPages,cspPageWarning} from '../src/lib/csp-coverage.ts';
import {cspAutomaticCompletion} from '../src/lib/csp-document-completion.ts';
import type {CspPage,CspTextItem} from '../src/lib/csp-extract.ts';
import type {CspEvent} from '../src/lib/csp.ts';
const item=(str:string,x:number,y:number,width=30):CspTextItem=>({str,x,y,width,height:8});
const page=(headers:CspTextItem[]):CspPage=>({page:6,width:842,height:595,items:[item('CSP du 24/03/2026',570,530,160),item('AVANCEMENT AU CHOIX',40,480,200),...headers,item('EXEMPLE CAMILLE',60,380,100),item('8',480,380),item('150',530,380),item('155',630,380),item('01/02/2026',750,380,60)]});
const otherHeaders=[item('GF',480,420),item('ANCIEN NR',530,420),item('NOUVEAU NR',630,420),item('DATE D’EFFET',750,420)];
const old:CspEvent={id:'existing',name:'EXEMPLE ALICE',kind:'avancement',effective:'2026-01-01',page:1,selected:true,nrSteps:1,approved:true,note:'Annotation conservée'};
const unread={page:6,section:'avancement',status:'unsupported',count:0,note:'En-tête du tableau non reconnu.'};

test('ODJ handles name headers with ET, accents, horizontal fragments and wrapped labels',()=>{
 for(const names of [[item('NOM ET PRÉNOM',60,420,100)],[item('NOM',60,420),item('PRENOM',93,420,50)],[item('NOM',60,420),item('PRENOM',60,402,60)]]){
  const r=extractCspPages([page([...names,...otherHeaders])],'cr');assert.equal(r.events.length,1);assert.equal(r.events[0].name,'EXEMPLE CAMILLE');assert.equal(r.events[0].nrSteps,1);assert.equal(r.events[0].nrBefore,150);assert.equal(r.events[0].nrAfter,155);assert.equal(r.events[0].extractionIssue,undefined);
 }
});
test('a recognized avancement with an unreadable header keeps recoverable people without inventing GF/NR',()=>{
 for(const type of ['cr','rd'] as const){
  const r=extractCspPages([page([])],type);assert.equal(r.events.length,1);assert.equal(r.events[0].kind,'avancement');assert.equal(r.events[0].name,'EXEMPLE CAMILLE');assert.equal(r.events[0].effective,'2026-02-01');assert.equal(r.events[0].nrSteps,undefined);assert.match(r.events[0].extractionIssue!,/compléter/);assert.equal(cspUnreadPages(r.reports).length,1);assert.match(cspPageWarning(r.reports[0]),/Avancement au choix/);
 }
 const blank=page([]);blank.items=blank.items.filter(i=>i.str!=='EXEMPLE CAMILLE');assert.equal(extractCspPages([blank],'cr').events.length,0);
 const ambiguous=page([]);ambiguous.items.push(item('01/03/2026',650,380,60));assert.equal(extractCspPages([ambiguous],'cr').events.length,0);
});
test('recovery only adds rows from unread pages, keeps approvals and annotations, and is idempotent',()=>{
 const detail={events:[old],reports:[{...unread,page:1,status:'read'},unread],perEventValidation:true};const unchanged=structuredClone(detail);
 const fresh={...old,id:old.id,name:'EXEMPLE CAMILLE',page:6,effective:'2026-02-01',approved:true};
 const next=recoverCspPages(detail,'validated',[fresh,{...fresh,id:'forged',page:7}], [{...unread,status:'read',count:1}]);
 assert.deepEqual(detail,unchanged);assert.deepEqual(next.events[0],old);assert.equal(next.events.length,2);assert.equal(next.events[1].approved,undefined);assert.notEqual(next.events[1].id,old.id);assert.equal(cspUnreadPages(next.reports).length,0);assert.equal(next.perEventValidation,true);
 assert.equal(recoverCspPages(next,'validated',[fresh],[{...unread,status:'read',count:1}]).events.length,2);
 const legacy=recoverCspPages({...detail,perEventValidation:false,events:[{...old,approved:undefined}]},'validated',[fresh],[{...unread,status:'read',count:1}]);assert.equal(legacy.events[0].approved,true);assert.equal(legacy.events[1].approved,undefined);
});
test('recognized but unread pages prevent automatic document completion even when known decisions match',()=>{
 const proof={id:'rd',name:'RD',eventId:'one',page:1,documentType:'rd' as const};
 const row={id:'odj',status:'review',detail:{documentType:'cr',reports:[unread],events:[{...old,acknowledgedByDocument:proof}]}};
 assert.equal(cspAutomaticCompletion(row,[row,{id:'rd',status:'validated',detail:{documentType:'rd'}}]),false);
 assert.match(cspPageWarning(unread),/Aucune décision/);
});

test('manual completion of a partially read page requires its known decisions to be treated',()=>{
 const detail={events:[{...old,page:6,approved:false}],reports:[unread]};assert.throws(()=>confirmCspPage(detail,6));
 const ready={...detail,events:[{...old,page:6}]};const confirmed=confirmCspPage(ready,6);assert.equal(cspUnreadPages(confirmed.reports).length,0);assert.equal(cspUnreadPages(ready.reports).length,1);assert.deepEqual(confirmed.events,ready.events);
});
