import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCsp,projectCsp,CSP_SOURCE,cspResolvedEvent} from '../src/lib/csp.ts';
import {prepareCspDocuments} from '../src/lib/csp-candidates.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';
const person={name:'EXEMPLE ADELE',agentId:'Z00007'};
const empty:AgentData={sources:[{id:'annual',date:'2025-12-31',primary:true} as any],records:[],events:[],issues:[],updated:'',cspIdentities:[{name:person.name,nni:person.agentId,source:'rup-fictif',date:'2026-09-30'}]};
const transfer:CspEvent={...person,id:'transfer',kind:'mutation',effective:'2026-05-01',selected:true,page:1,gfDelta:0,gfBefore:7,gfAfter:7,nrBefore:110,nrAfter:110,agency:'AGENCE FICTIVE',team:'SERVICE FICTIF',job:'-'};
const document=(events:CspEvent[]):CspImport=>({id:'rd',name:'RD fictif',documentType:'rd',status:'validated',date:'2026-04-20',events});
const current=(p:ReturnType<typeof projectCsp>)=>p.data.records.filter(r=>r.source===CSP_SOURCE);
test('an interunit transfer requires explicit arrival confirmation and never invents identity or salary increases',()=>{
 assert.equal(prepareCsp(empty,[transfer])[0].state,'blocked');
 const arrival={...transfer,newAgent:true};const p=prepareCsp(empty,[arrival])[0];assert.equal(p.state,'ready');assert.equal(p.after?.gf,7);assert.equal(p.after?.nr,110);assert.equal(p.after?.job,undefined);
 assert.equal(current(projectCsp(empty,[document([arrival])],'2026-04-30')).length,0);
 const applied=current(projectCsp(empty,[document([arrival])],'2026-05-02'));assert.equal(applied.length,1);assert.equal(applied[0].entryUnit,'2026-05-01');assert.equal(applied[0].entryIEG,undefined);assert.equal(applied[0].gf,7);assert.equal(applied[0].nr,110);
 const twice=current(projectCsp(empty,[document([arrival]),{...document([arrival]),id:'odj',documentType:'cr'}],'2026-05-02'));assert.equal(twice.length,1);assert.equal(twice[0].nr,110);
 for(const patch of [{gfDelta:1},{nrSteps:1},{gfAfter:8},{nrAfter:115},{gfBefore:undefined,gfAfter:undefined},{agentId:undefined}])assert.equal(prepareCsp({...empty,cspIdentities:[]},[{...arrival,...patch}])[0].state,'blocked');
 const unknown=prepareCsp(empty,[{...arrival,nrBefore:undefined,nrAfter:undefined}])[0];assert.equal(unknown.state,'ready');assert.equal(unknown.after?.nr,undefined);
});
test('internal transfers keep the existing salary, entry date and job; confirmed arrival never duplicates a known agent',()=>{
 const data={...empty,records:[{id:'known',row:1,source:'annual',...person,nni:person.agentId,gf:7,nr:110,entryUnit:'2020-01-01',job:'EMPLOI FICTIF'}]};
 const internal=current(projectCsp(data,[document([transfer])],'2026-05-02'));assert.equal(internal.length,1);assert.equal(internal[0].gf,7);assert.equal(internal[0].nr,110);assert.equal(internal[0].entryUnit,'2020-01-01');assert.equal(internal[0].job,'EMPLOI FICTIF');
 const confirmed=current(projectCsp(data,[document([{...transfer,newAgent:true}])],'2026-05-02'));assert.equal(confirmed.length,1);assert.equal(confirmed[0].entryUnit,'2026-05-01');
});
test('after manual confirmation, a concordant active ODJ can complete the missing constant GF and NR of the RD',()=>{
 const odj={...document([transfer]),id:'odj',documentType:'cr' as const,status:'review'};
 const pending={...transfer,gfBefore:undefined,gfAfter:undefined,nrBefore:undefined,nrAfter:undefined,newAgent:true};
 const preview=prepareCspDocuments(empty,[pending],[],odj.date,[odj],{id:'rd',name:'RD fictif',documentType:'rd'})[0];assert.equal(preview.state,'ready',preview.problem);assert.equal(preview.after?.nr,110);assert.equal(preview.gfBefore,7);
 const saved=cspResolvedEvent(pending,preview);assert.equal(saved.gfBefore,7);assert.equal(saved.gfAfter,7);assert.equal(saved.nrBefore,110);assert.equal(saved.nrAfter,110);
 assert.equal(prepareCspDocuments(empty,[{...pending,newAgent:false}],[],odj.date,[odj])[0].state,'blocked');
 for(const other of [{...odj,status:'disabled:validated'},{...odj,date:'2026-03-20'},{...odj,events:[{...transfer,agentId:'Z00008'}]},{...odj,events:[{...transfer,agency:'AUTRE AGENCE'}]},{...odj,events:[{...transfer,team:'AUTRE SERVICE'}]}])assert.equal(prepareCspDocuments(empty,[pending],[],odj.date,[other])[0].state,'blocked');
 const contradiction=prepareCspDocuments(empty,[pending],[],odj.date,[{...odj,events:[{...transfer,nrAfter:115}]}])[0];assert.equal(contradiction.state,'blocked');assert.match(contradiction.problem,/contradictoire/);
});
