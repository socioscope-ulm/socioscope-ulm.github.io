import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCsp,projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';

const data:AgentData={sources:[{id:'annual',name:'Annuel fictif',date:'2025-12-31',primary:true} as any],records:[{id:'fiction',name:'EXEMPLE CAMILLE',agentId:'Z00008',nni:'Z00008',source:'annual',row:1,gf:8,nr:150,nrDate:'2023-02-01'}],events:[],issues:[],updated:''};
const reclassification:CspEvent={id:'retroactive',name:'EXEMPLE CAMILLE',agentId:'Z00008',kind:'reclassement',effective:'2025-02-01',gfDelta:1,gfBefore:8,gfAfter:9,nrBefore:150,nrAfter:150,reclassementNRConfirmed:true,extractionIssue:'progression NR différente de la règle de reclassement. Vérifier le document et corriger la ligne.',page:1,selected:true,approved:true};
const proof:CspImport={id:'odj-earlier',name:'ODJ fictif validé',date:'2026-04-10',status:'validated',events:[reclassification]};
const award:CspEvent={id:'award',name:'EXEMPLE CAMILLE',agentId:'Z00008',kind:'avancement',effective:'2026-02-01',gfBefore:9,nrBefore:150,nrAfter:155,nrSteps:1,page:2,selected:true};
const later=(events:CspEvent[]):CspImport=>({id:'odj-later',name:'ODJ fictif suivant',date:'2026-04-20',status:'validated',events});
const current=(p:ReturnType<typeof projectCsp>)=>p.data.records.find(r=>r.source===CSP_SOURCE)!;

test('validated retroactive reclassement makes the later NR award ready and applies it once at its effective date',()=>{
 const unchanged=structuredClone(data);
 const p=prepareCsp(data,[award],[proof])[0];
 assert.equal(p.state,'ready');assert.equal(p.before?.gf,9);assert.equal(p.before?.nr,150);assert.equal(p.after?.gf,9);assert.equal(p.after?.nr,155);assert.match(p.problem,/rétroactive/);
 const imports=[proof,later([{...award,approved:true}])];
 const projection=projectCsp(data,imports,'2026-06-01');
 assert.deepEqual(projection.issues,[]);assert.equal(current(projection).gf,9);assert.equal(current(projection).nr,155);assert.equal(current(projection).gfDate,'2025-02-01');assert.equal(current(projection).nrDate,'2026-02-01');
 assert.equal(current(projectCsp(data,imports,'2026-01-20')).nr,150);
 assert.deepEqual(data,unchanged);assert.equal(projection.data.records.find(r=>r.source==='annual')?.gf,8);
 const duplicate={...later([{...award,approved:true}]),id:'rd-copy'};
 assert.equal(current(projectCsp(data,[...imports,duplicate],'2026-06-01')).nr,155);
});

test('pending, disabled, mismatched, stale or contradictory documentary proofs never bypass the salary checks',()=>{
 const variants=[{...proof,status:'review'},{...proof,status:'disabled:validated'},{...proof,date:'2025-12-01'},{...proof,events:[{...reclassification,approved:undefined}]},{...proof,events:[{...reclassification,agentId:'Z00009'}]},{...proof,events:[{...reclassification,extractionIssue:'GF avant illisible'}]},{...proof,events:[{...reclassification,gfAfter:10}]},{...proof,events:[{...reclassification,nrAfter:155}]},{...proof,events:[{...reclassification,nrBefore:145}]}];
 for(const prior of [[],...variants.map(v=>[v]),[proof,{...proof,id:'contradictory',events:[{...reclassification,gfAfter:10,gfDelta:2}]}]])assert.equal(prepareCsp(data,[award],prior)[0].state,'blocked');
 const disabled=projectCsp(data,[{...proof,status:'disabled:validated'},later([{...award,approved:true}])],'2026-06-01');assert.equal(disabled.issues.length,1);assert.equal(current(disabled).nr,150);
 assert.equal(prepareCsp({...data,records:[{...data.records[0],nr:160}]},[award],[proof])[0].state,'blocked');
});

test('an already reflected reclassement is not replayed and a future approved award is a real prerequisite',()=>{
 const updated={...data,records:[{...data.records[0],gf:9}]};
 assert.equal(prepareCsp(updated,[award],[proof])[0].after?.nr,155);
 assert.equal(current(projectCsp(updated,[proof,later([{...award,approved:true}])],'2026-06-01')).nr,155);
 const next={...award,id:'next',effective:'2026-03-01',nrBefore:155,nrAfter:160};
 assert.equal(prepareCsp(data,[next],[proof,later([{...award,approved:true}])])[0].after?.nr,160);
 assert.equal(prepareCsp(data,[next],[proof])[0].state,'blocked');
});


test('a documentary salary reference cannot restore an obsolete assignment from a historical nomination',()=>{
 const present={...data,records:[{...data.records[0],agency:'AGENCE ACTUELLE',job:'EMPLOI ACTUEL',team:'EQUIPE ACTUELLE'}]};
 const previous={...proof,events:[{...reclassification,kind:'nomination' as const,reclassementNRConfirmed:undefined,extractionIssue:undefined,agency:'ANCIENNE AGENCE',job:'ANCIEN EMPLOI',team:'ANCIENNE EQUIPE'}]};
 const projected=projectCsp(present,[previous,later([{...award,approved:true}])],'2026-06-01');
 assert.deepEqual(projected.issues,[]);assert.equal(current(projected).nr,155);assert.equal(current(projected).gf,9);
 assert.equal(current(projected).agency,'AGENCE ACTUELLE');assert.equal(current(projected).job,'EMPLOI ACTUEL');assert.equal(current(projected).team,'EQUIPE ACTUELLE');
});

test('same-day advancement is applied before GF-only repositioning even if reclassement is listed first',()=>{
 const base:AgentData={...data,records:[{...data.records[0],gf:12,nr:205}],sources:data.sources};
 const gain:CspEvent={id:'gain',name:'EXEMPLE CAMILLE',agentId:'Z00008',kind:'avancement',effective:'2026-01-01',gfBefore:12,nrBefore:205,nrAfter:210,nrSteps:1,page:6,selected:true};
 const gfOnly:CspEvent={id:'gf-only',name:'EXEMPLE CAMILLE',agentId:'Z00008',kind:'reclassement',effective:'2026-01-01',gfBefore:12,gfAfter:13,nrBefore:210,nrAfter:210,nrSteps:0,gfDelta:1,reclassementNRConfirmed:true,page:4,selected:true};
 const preview=prepareCsp(base,[gfOnly,gain],[],'2026-09-11');
 assert.deepEqual(preview.map(e=>e.state),['ready','ready']);
 assert.equal(preview[0].before?.nr,210);assert.equal(preview[0].after?.gf,13);
 assert.equal(preview[0].after?.nr,210);
 const imports:CspImport[]=[
  {id:'reclassement-first',name:'GF seul',date:'2026-09-11',created:'2026-09-11T08:00:00Z',status:'validated',events:[{...gfOnly,approved:true}]},
  {id:'avancement-second',name:'Avancement',date:'2026-09-11',created:'2026-09-11T09:00:00Z',status:'validated',events:[{...gain,approved:true}]}
 ];
 const result=projectCsp(base,imports,'2026-10-30');
 assert.deepEqual(result.issues,[]);
 const row=result.data.records.find(r=>r.source===CSP_SOURCE);
 assert.equal(row?.gf,13);assert.equal(row?.nr,210);
 const reverse=projectCsp(base,imports.toReversed(),'2026-10-30');
 assert.deepEqual(reverse.issues,[]);assert.equal(reverse.data.records.find(r=>r.source===CSP_SOURCE)?.nr,210);
});
