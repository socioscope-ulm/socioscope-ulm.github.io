import test from 'node:test';
import assert from 'node:assert/strict';
import {extractCspPages} from '../src/lib/csp-extract.ts';
import {advancementTitleDate} from '../src/lib/csp-beneficiary-advancements.ts';
import {prepareCsp,projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';
import {recoverCspPages} from '../src/lib/csp-recovery.ts';
import type {CspPage,CspTextItem} from '../src/lib/csp-extract.ts';
import type {AgentData} from '../src/lib/agents.ts';
const item=(str:string,x:number,y:number,width=100):CspTextItem=>({str,x,y,width,height:10});
const people=['EXEMPLE ALICE','FICTIF CAMILLE','TEST MORGAN'];
const page=(title='EVOLUTION DE LA REMUNERATION - AVANCEMENT AU CHOIX AU 1ER FEVRIER 2026'):CspPage=>({page:6,width:842,height:595,items:[item('CSP du 02/10/2026',500,560,180),item('Forclusion 25/10/2026',500,540,180),item('ACCORD PARCOURS DES MANDATES - ACCORD MOYENS BENEVOLES',35,500,650),item(title,35,480,700),item('BENEFICIAIRES',280,430,110),item('NOMBRE DE NR',685,430,110),...people.flatMap((name,i)=>[item(name,45,390-i*45,180),item(String(i+1),730,390-i*45,8)])]});
const data:AgentData={sources:[{id:'annual',primary:true,date:'2025-12-31'} as any],records:people.map((name,i)=>({id:'row'+i,name,nni:'Z0000'+i,agentId:'Z0000'+i,source:'annual',row:i,gf:8,nr:150+i*10})),events:[],issues:[],updated:''};

test('beneficiary/count tables read each person and apply the title date as normal avancements in ODJ and RD',()=>{
 for(const type of ['cr','rd'] as const){
  const r=extractCspPages([page()],type);assert.equal(r.events.length,3);assert.equal(r.date,'2026-10-02');assert.deepEqual(r.events.map(e=>e.name),people);assert.deepEqual(r.events.map(e=>e.nrSteps),[1,2,3]);assert.ok(r.events.every(e=>e.kind==='avancement'&&e.effective==='2026-02-01'&&!e.extractionIssue));assert.equal(r.reports[0].status,'read');
  const prepared=prepareCsp(data,r.events);assert.ok(prepared.every(e=>e.state==='ready'));assert.deepEqual(prepared.map(e=>e.after?.nr),[155,170,185]);
  const doc={id:type,name:'Document fictif',date:r.date,status:'validated',events:prepared.map(e=>({...e,approved:true}))};
  const p=projectCsp(data,[doc,{...doc,id:type+'-duplicate'}],'2026-10-03');assert.deepEqual(p.issues,[]);assert.deepEqual(p.data.records.filter(r=>r.source===CSP_SOURCE).map(r=>r.nr),[155,170,185]);
 }
});

test('French ordinals, numeric dates and plural titles are supported without using CSP or forclusion dates',()=>{
 for(const title of ['AVANCEMENT AU CHOIX AU 1er février 2026','AVANCEMENTS AU CHOIX AU 1 ER FEVRIER 2026','AVANCEMENT AU CHOIX AU 01/02/2026']){assert.equal(advancementTitleDate(title),'2026-02-01');assert.equal(extractCspPages([page(title)]).events.length,3);}
 for(const title of ['AVANCEMENT AU CHOIX','AVANCEMENT AU CHOIX AU 31 FEVRIER 2026','AVANCEMENT AU CHOIX AU 1ER FEVRIER 2026 ET AU 1ER MARS 2026']){const r=extractCspPages([page(title)]);assert.equal(r.events.length,0);assert.equal(r.reports[0].status,'unsupported');assert.match(r.reports[0].note,/date d’effet commune/);}
});

test('split count headers and wrapped compound names do not split one beneficiary into two agents',()=>{
 const p=page();p.items=p.items.filter(i=>i.str!=='NOMBRE DE NR'&&i.str!==people[0]);p.items.push(item('NOMBRE',680,430,50),item('DE',735,430,15),item('NR',755,430,20),item('EXEMPLE',45,395,70),item('JEAN PHILIPPE',45,383,110));
 const r=extractCspPages([p]);assert.equal(r.events.length,3);assert.equal(r.events[0].name,'EXEMPLE JEAN PHILIPPE');assert.equal(r.events[0].nrSteps,1);
});

test('missing or invalid counts stay attached to the identified beneficiary for verification',()=>{
 const p=page();p.items=p.items.filter(i=>!(i.x===730&&i.str==='2')).map(i=>i.x===730&&i.str==='3'?{...i,str:'235'}:i);
 const r=extractCspPages([p]);assert.equal(r.events.length,3);assert.equal(r.events[0].nrSteps,1);assert.equal(r.events[1].nrSteps,undefined);assert.equal(r.events[2].nrSteps,undefined);assert.ok(r.events.slice(1).every(e=>e.extractionIssue));
});

test('re-reading a failed page adds automatically parsed awards but never duplicates an already entered person/award',()=>{
 const r=extractCspPages([page()]);const entered={...r.events[0],id:'manual-existing',agentId:'Z00000',approved:true,note:'Annotation conservée'};
 const old={events:[entered],perEventValidation:true,reports:[{page:6,section:'avancement',status:'unsupported',count:0}]};
 const recovered=recoverCspPages(old,'validated',r.events,r.reports);assert.equal(recovered.events.length,3);assert.deepEqual(recovered.events[0],entered);assert.ok(recovered.events.slice(1).every(e=>!e.approved));assert.equal(recovered.reports[0].status,'read');assert.equal(recovered.reports[0].count,3);
 assert.equal(recoverCspPages(recovered,'validated',r.events,r.reports).events.length,3);
});


test('a ten-person compact table reads every count without reducing the page to a manual placeholder',()=>{
 const names=['ALPHA','BETA','GAMMA','DELTA','EPSILON','ZETA','ETA','THETA','IOTA','KAPPA'].map(n=>'EXEMPLE '+n);
 const p=page();p.items=p.items.filter(i=>i.y>=430);p.items.push(...names.flatMap((n,i)=>[item(n,45,390-i*29,180),item('1',730,390-i*29,8)]));
 const r=extractCspPages([p]);assert.equal(r.events.length,10);assert.deepEqual(r.events.map(e=>e.name),names);assert.ok(r.events.every(e=>e.nrSteps===1&&e.effective==='2026-02-01'&&!e.extractionIssue));
});

test('a different manual award on the same single-row source is flagged rather than added as another gain',()=>{
 const r=extractCspPages([page()]);
 for(const approved of [true,false]){
  const entered={...r.events[0],id:'manual-existing',agentId:'Z00000',nrSteps:2,approved,note:'Annotation conservée'};
  const recovered=recoverCspPages({events:[entered],perEventValidation:true,reports:[{page:6,section:'avancement',status:'unsupported',count:0}]},'validated',r.events,r.reports);
  assert.equal(recovered.events.length,3);assert.equal(recovered.events[0].nrSteps,2);assert.equal(recovered.events[0].note,entered.note);assert.equal(recovered.reports[0].status,'unsupported');
  if(approved)assert.deepEqual(recovered.events[0],entered);else assert.match(recovered.events[0].extractionIssue!,/diffère/);
 }
});


test('PDF text fragments in the beneficiary and NR-count headings are reconstructed',()=>{
 const p=page();p.items=p.items.filter(i=>i.str!=='BENEFICIAIRES'&&i.str!=='NOMBRE DE NR');
 p.items.push(item('BENE',280,430,30),item('FICIAIRES',310,430,75),item('NOM',685,430,27),item('BRE',712,430,25),item('DE',742,430,15),item('NR',762,430,20));
 const r=extractCspPages([p]);assert.equal(r.events.length,3);assert.deepEqual(r.events.map(e=>e.nrSteps),[1,2,3]);assert.ok(r.events.every(e=>e.effective==='2026-02-01'));
});
