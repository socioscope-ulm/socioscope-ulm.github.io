import test from 'node:test';import assert from 'node:assert/strict';
import {findCspRupIdentities} from '../src/lib/csp-rup.ts';
import {prepareCsp,projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';import {snapshot} from '../src/lib/agents.ts';
import type {AgentData} from '../src/lib/agents.ts';import type {CspEvent} from '../src/lib/csp.ts';
const base:AgentData={sources:[{id:'old',date:'2024-12-31',seniorityDate:'2024-12-31',name:'Old',label:'Old',primary:true,hash:'',sheet:'',confidence:'',rows:2,agents:2},{id:'annual',date:'2025-12-31',seniorityDate:'2025-12-31',name:'Annual',label:'Annual',primary:true,hash:'',sheet:'',confidence:'',rows:1,agents:1}],records:[{id:'a',agentId:'A12345',nni:'A12345',name:'TEST ALICE',source:'annual',row:1,gf:9,nr:200},{id:'past',agentId:'B12345',nni:'B12345',name:'TEST BOB',source:'old',row:1,gf:8,nr:180}],events:[],issues:[],updated:''};
const admission:CspEvent={id:'new',name:'NOUVELLE CLAIRE',kind:'admission',effective:'2026-04-01',gfAfter:8,agency:'AMTE',job:'Technicien',page:1,selected:true};
const row=(source:string,nom:string,prenom:string,nni:string)=>({source,nom,prenom,nni});
const source=(id:string,date:string,status='validated')=>({id,date,status,detail:'{"kind":"rup"}'});
test('latest active RUP supplies NNI, confirms admission and makes it ready without inventing NR',async()=>{
 let reads:string[]=[];const found=await findCspRupIdentities({sources:[],records:[]},[source('latest','2026-09-30'),source('older','2026-03-31'),source('draft','2026-10-01','review')],[],['NOUVELLE CLAIRE'],async id=>{reads.push(id);return [row(id,'NOUVELLE','CLAIRE','C12345')] as any;});
 assert.deepEqual(reads,['latest']);const p=prepareCsp({...base,cspIdentities:found},[admission])[0];assert.equal(p.state,'ready');assert.equal(p.agentId,'C12345');assert.equal(p.newAgent,true);assert.equal(p.identityMethod,'rup');assert.equal(p.identityDate,'2026-09-30');assert.equal(p.after?.nr,undefined);
 const projected=projectCsp(base,[{id:'rd',name:'RD',date:'2026-06-01',status:'validated',events:[p]}],'2026-10-01');assert.equal(snapshot(projected.data,CSP_SOURCE).length,2);
});
test('a newly imported RUP resolves a formerly missing NNI; disabled sources and draft RUP are ignored',async()=>{
 assert.equal(prepareCsp(base,[admission])[0].state,'blocked');const seed:any={sources:[{id:'disabled',name:'Disabled',date:'2026-10-01',status:'validated'}],records:[row('disabled','NOUVELLE','CLAIRE','D12345')]};
 const ids=await findCspRupIdentities(seed,[source('new','2026-09-30')],['disabled'],[admission.name],async id=>[row(id,'NOUVELLE','CLAIRE','C12345')] as any);assert.equal(ids.length,1);assert.equal(ids[0].nni,'C12345');assert.equal(prepareCsp({...base,cspIdentities:ids},[admission])[0].state,'ready');
});
test('older active RUP is consulted only for names missing from the newest; same-date homonyms remain blocked',async()=>{
 const reads:string[]=[];const ids=await findCspRupIdentities({sources:[],records:[]},[source('new','2026-09-30'),source('old','2025-12-31')],[],[admission.name],async id=>{reads.push(id);return id==='old'?[row(id,'NOUVELLE','CLAIRE','C12345')] as any:[];});assert.deepEqual(reads,['new','old']);assert.equal(ids[0].source,'old');
 const ambiguous=await findCspRupIdentities({sources:[],records:[]},[source('a','2026-09-30'),source('b','2026-09-30')],[],[admission.name],async id=>[row(id,'NOUVELLE','CLAIRE',id==='a'?'C12345':'D12345')] as any);const p=prepareCsp({...base,cspIdentities:ambiguous},[admission])[0];assert.equal(p.state,'blocked');assert.equal(p.agentId,undefined);
});
test('GF constant is ready without pretending the document confirms an unchanged NR',()=>{
 const e:CspEvent={...admission,id:'constant',agentId:'A12345',name:'TEST ALICE',kind:'nomination',gfAfter:undefined,gfDelta:0};const p=prepareCsp(base,[e])[0];assert.equal(p.state,'ready');assert.equal(p.after?.gf,9);assert.equal(p.after?.nr,200);assert.equal(p.nrConfirmed,undefined);assert.equal(p.after?.nrProvisional,true);assert.match(p.problem,/dernière valeur connue/);
 const explicit=prepareCsp(base,[{...e,nrAfter:210}])[0];assert.equal(explicit.after?.nr,210);assert.equal(explicit.after?.nrProvisional,undefined);
});
test('posthumous decisions are ready from historical identity without resurrecting an absent agent',()=>{
 const e:CspEvent={id:'post',name:'TEST BOB',kind:'posthume',effective:'2026-01-01',nrSteps:2,page:1,selected:true};const p=prepareCsp(base,[e])[0];assert.equal(p.state,'ready');assert.equal(p.agentId,'B12345');assert.equal(p.after?.nr,190);
 const projected=projectCsp(base,[{id:'rd',name:'RD',date:'2026-03-24',status:'validated',events:[p]}],'2026-06-01');assert.equal(projected.issues.length,0);assert.equal(snapshot(projected.data,CSP_SOURCE).length,1);assert.equal(snapshot(projected.data,CSP_SOURCE)[0].agentId,'A12345');
 const historical=prepareCsp(base,[{...e,effective:'2025-12-01'}])[0];assert.equal(historical.state,'ready');assert.match(historical.problem,/sans réapplication/);
});
