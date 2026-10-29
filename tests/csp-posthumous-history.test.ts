import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCsp,projectCsp,CSP_SOURCE,validateCspEvent} from '../src/lib/csp.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';

const data:AgentData={sources:[{id:'annual',name:'Photographie fictive',label:'Annuel',date:'2025-12-31',primary:true} as any],records:[{id:'fiction',name:'EXEMPLE CAMILLE',agentId:'Z00008',nni:'Z00008',source:'annual',row:1,gf:14,nr:240}],events:[],issues:[],updated:''};
const award:CspEvent={id:'award',name:'EXEMPLE CAMILLE',agentId:'Z00008',kind:'posthume',effective:'2026-02-01',nrBefore:240,nrSteps:2,page:1,selected:true};
const prior:CspImport={id:'rd-fiction',name:'RD fictif',date:'2026-02-10',status:'validated',events:[{...award,approved:true}]};

test('posthumous awards accept each supported NR count against documented historical reference',()=>{
 for(let count=1;count<=20;count++){
  const event={...award,id:'historical',nrSteps:count,nrAfter:240+count*5};
  assert.equal(validateCspEvent(event),true);
  const p=prepareCsp(data,[event],[prior])[0];
  if(count===2){assert.equal(p.state,'duplicate');continue;}
  assert.equal(p.state,'ready');assert.equal(p.before?.nr,240);assert.equal(p.after?.nr,240+count*5);
  assert.match(p.problem,/sans ajout au NR actuel/);
  const projection=projectCsp(data,[prior,{...prior,id:'odj-fiction',events:[{...event,approved:true}]}],'2026-06-01');
  assert.deepEqual(projection.issues,[]);
  assert.equal(projection.data.records.find(r=>r.source===CSP_SOURCE)?.nr,250);
 }
});

test('posthumous before/after values infer the count and contradictory values stay blocked',()=>{
 const event={...award,nrSteps:undefined,nrAfter:265};
 const p=prepareCsp(data,[event],[prior])[0];
 assert.equal(p.state,'ready');assert.equal(p.after?.nr,265);
 assert.equal(prepareCsp(data,[{...event,nrSteps:3}],[prior])[0].state,'blocked');
 assert.equal(prepareCsp(data,[{...event,gfBefore:11}],[prior])[0].state,'blocked');
 assert.equal(prepareCsp(data,[{...event,kind:'avancement'}],[prior])[0].state,'blocked');
});
