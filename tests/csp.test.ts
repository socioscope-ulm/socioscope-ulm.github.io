import test from 'node:test';
import assert from 'node:assert/strict';
import {CSP_SOURCE,deduplicateCsp,prepareCsp,projectCsp,latestAnnual,validDate,validateCspEvent} from '../src/lib/csp.ts';
import {snapshot,defaultMovementPhotographs} from '../src/lib/agents.ts';
import {agentProgression} from '../src/lib/agent-progression.ts';
import {agentPayroll} from '../src/lib/agent-payroll.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';
const source={id:'annual',date:'2025-12-31',seniorityDate:'2025-12-31',name:'Annual',label:'Annual',sheet:'Rows',hash:'',primary:true,rows:2,agents:2,confidence:''};
const base:AgentData={sources:[source],records:[{id:'a',source:'annual',row:1,agentId:'A12345',nni:'A12345',name:'DUPONT ALICE',gf:9,nr:200,gfDate:'2021-01-01',nrDate:'2023-01-01',agency:'AMTC',job:'Technicien',college:'maitrise',sex:'F',entryIEG:'2000-01-01'},{id:'b',source:'annual',row:2,agentId:'B12345',nni:'B12345',name:'MARTIN BOB',gf:8,nr:180,agency:'AMTE',college:'maitrise'}],events:[],issues:[],updated:''};
const event=(overrides:Partial<CspEvent>={}):CspEvent=>({id:'one',name:'DUPONT ALICE',agentId:'A12345',kind:'reclassement',effective:'2026-01-01',gfDelta:1,page:1,selected:true,...overrides});
const imported=(events:CspEvent[],overrides:Partial<CspImport>={}):CspImport=>({id:'csp-one',name:'RD',date:'2026-03-24',status:'validated',created:'2026-03-25',events,...overrides});
const current=(data:AgentData,id='A12345')=>snapshot(data,CSP_SOURCE).find(r=>r.agentId===id)!;

test('reclassement is +1 GF and +10 NR; avancement +1 NR is +5; observations and unmentioned agents remain intact',()=>{
 const copy=structuredClone(base);const events=[event(),event({id:'two',kind:'avancement',gfDelta:undefined,nrSteps:1,effective:'2026-02-01',agency:'OLD OBSERVED AGENCY'})];
 const p=projectCsp(base,[imported(events)],'2026-03-24');assert.equal(current(p.data).gf,10);assert.equal(current(p.data).nr,215);assert.equal(current(p.data).agency,'AMTC');assert.equal(current(p.data,'B12345').nr,180);assert.deepEqual(base,copy);assert.equal(snapshot(p.data,'annual')[0].nr,200);
 const history=agentProgression(p.data,CSP_SOURCE,true)!;assert.equal(history.passages?.nr.length,2);assert.equal(history.passages?.gf.length,1);
});
test('nominations require explicit NR after or a deliberate unchanged confirmation; no inferred NR from GF',()=>{
 const e=event({kind:'nomination',gfDelta:1,agency:'AMTE',job:'Responsable'});assert.equal(prepareCsp(base,[e])[0].state,'blocked');
 let p=projectCsp(base,[imported([{...e,nrAfter:200}])],'2026-06-01');assert.equal(current(p.data).nr,200);assert.equal(current(p.data).gf,10);assert.equal(current(p.data).agency,'AMTE');
 p=projectCsp(base,[imported([{...e,nrAfter:225}])],'2026-06-01');assert.equal(current(p.data).nr,225);
 p=projectCsp(base,[imported([{...e,nrConfirmed:true}])],'2026-06-01');assert.equal(current(p.data).nr,200);
});
test('effective date controls application, future and covered decisions do not inflate annual data',()=>{
 const events=[event({effective:'2025-12-01'}),event({id:'later',effective:'2026-09-01'})];
 assert.equal(current(projectCsp(base,[imported(events)],'2026-03-24').data).nr,200);
 assert.equal(current(projectCsp(base,[imported(events)],'2026-10-01').data).nr,210);
 assert.equal(prepareCsp(base,[events[0]])[0].state,'covered');
 const newer={...base,sources:[source,{...source,id:'new',date:'2026-12-31',seniorityDate:'2026-12-31'}],records:[...base.records,{...base.records[0],source:'new',gf:10,nr:210}]};
 assert.equal(current(projectCsp(newer,[imported(events)],'2027-01-01').data).nr,210);
 assert.equal(current(projectCsp(newer,[imported(events)],'2026-10-01').data).nr,210);
});
test('complete annual photograph wins over a newer partial file; projections never become annual movement references',()=>{
 const data={...base,sources:[...base.sources,{...source,id:'partial',primary:false,status:'validated',date:'2026-04-01'}]};assert.equal(latestAnnual(data)?.id,'annual');
 const p=projectCsp(data,[imported([event()])],'2026-06-01');assert.equal(defaultMovementPhotographs(p.data.sources).latest?.id,'annual');
});
test('same decision on two pages or imports applies once, but distinct salary reasons can accumulate',()=>{
 const e=event({kind:'posthume',gfDelta:undefined,nrSteps:2});const compact=deduplicateCsp([e,{...e,id:'again',page:2}]);assert.equal(compact.length,1);assert.deepEqual(compact[0].pages,[1,2]);
 const p=projectCsp(base,[imported([e]),imported([e],{id:'second',created:'2026-04-01'})],'2026-06-01');assert.equal(current(p.data).nr,210);
 assert.equal(prepareCsp(base,[e],[imported([e])])[0].state,'duplicate');
 const plus=event({id:'different',kind:'mesure',gfDelta:undefined,nrSteps:1});assert.equal(current(projectCsp(base,[imported([e,plus])],'2026-06-01').data).nr,215);
});
test('disabled and draft RD do not affect projections; disabling an earlier prerequisite exposes an explicit inconsistency',()=>{
 assert.equal(projectCsp(base,[imported([event()],{status:'review'})]).data,base);assert.equal(projectCsp(base,[imported([event()],{status:'disabled:validated'})]).data,base);
 const e=event({id:'second',kind:'nomination',effective:'2026-04-01',gfDelta:0,gfBefore:10,nrBefore:210,nrAfter:220});
 const result=projectCsp(base,[imported([e])],'2026-06-01');assert.equal(result.issues.length,1);assert.equal(current(result.data).nr,200);
});
test('ambiguous names require explicit NNI and missing agents cannot become arrivals from salary-only decisions',()=>{
 const ambiguous={...base,records:[...base.records,{...base.records[1],name:'DUPONT ALICE'}]};assert.equal(prepareCsp(ambiguous,[event({agentId:undefined})])[0].state,'blocked');
 assert.equal(prepareCsp(base,[event({agentId:undefined,name:'ALICE DUPONT'})])[0].agentId,'A12345');
 assert.equal(prepareCsp(base,[event({agentId:'C12345',newAgent:true})])[0].state,'blocked');
 const arrival=event({id:'new',kind:'admission',agentId:'C12345',newAgent:true,name:'NOUVELLE CLAIRE',gfDelta:undefined,gfAfter:8,agency:'AMTE',job:'Technicien'});const p=projectCsp(base,[imported([arrival])],'2026-06-01');assert.equal(snapshot(p.data,CSP_SOURCE).length,3);assert.equal(current(p.data,'C12345').nr,undefined);
});
test('updated payroll and exports share GF, NR, college, sex filters and agency residence; annual payroll is unchanged',()=>{
 const e=event({kind:'nomination',gfDelta:3,nrAfter:220,agency:'AMTE',job:'Cadre'});const p=projectCsp(base,[imported([e])],'2026-06-01');
 const config={rates:{'1.24':{'200':Array(12).fill(20000)},'1.245':{'220':Array(12).fill(24000)}},bonuses:{'9':100,'12':200},gridDate:'2026-01-01',bonusReferenceYear:2025};
 const annual=agentPayroll(p.data,'annual','agency',config,{sex:'femmes'})!,actual=agentPayroll(p.data,CSP_SOURCE,'agency',config,{sex:'femmes',college:'cadres'})!;
 assert.equal(annual.rows[0].nr,200);assert.equal(actual.rows.length,1);assert.equal(actual.rows[0].gf,12);assert.equal(actual.rows[0].nr,220);assert.equal(actual.rows[0].residence,'1.245');assert.equal(actual.rows[0].monthlyCents,24000);
});
test('invalid date, values, identifiers and an incomplete relative decision cannot be accepted',()=>{
 assert.equal(validDate('2026-02-30'),false);assert.equal(validateCspEvent(event({agentId:'arbitrary'})),false);assert.equal(validateCspEvent(event({gfDelta:-1})),false);assert.equal(validateCspEvent(event({selected:false,effective:''})),true);
 assert.equal(prepareCsp(base,[event({gfDelta:undefined})])[0].state,'blocked');assert.equal(prepareCsp(base,[event({kind:'avancement',gfDelta:undefined,nrSteps:undefined})])[0].state,'blocked');
});

test('partial validation publishes only approved events and retains legacy fully validated imports',async()=>{
 const {activeCspEvents,cspProgress}=await import('../src/lib/csp-validation.ts');
 const ready=event({kind:'avancement',gfDelta:undefined,nrSteps:1,approved:true});const pending=event({id:'pending',kind:'nomination',effective:'2026-04-01',gfDelta:1});
 const detail={perEventValidation:true,events:[ready,pending]};assert.deepEqual(cspProgress('validated',detail),{approved:1,pending:1,partial:true});
 const p=projectCsp(base,[imported(activeCspEvents(detail))],'2026-06-01');assert.equal(current(p.data).nr,205);assert.equal(current(p.data).gf,9);assert.equal(p.issues.length,0);
 assert.equal(activeCspEvents({events:[ready,pending]}).length,2);assert.equal(activeCspEvents(detail).length,1);
});
