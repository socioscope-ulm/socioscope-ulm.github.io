import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCsp,projectCsp,cspResolvedEvent,CSP_SOURCE,validateCspEvent} from '../src/lib/csp.ts';
import {pendingAdmissionId,resolvePendingAdmissions} from '../src/lib/csp-pending-admission.ts';
import {snapshot} from '../src/lib/agents.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspEvent,CspImport} from '../src/lib/csp.ts';
const data:AgentData={sources:[{id:'annual',date:'2025-12-31',primary:true} as any],records:[],events:[],issues:[],updated:''};
const arrival:CspEvent={id:'arrival',name:'FICTIF ALEX',kind:'admission',page:1,selected:true,effective:'2026-02-01',newAgent:true,identityPending:true,gfAfter:7,agency:'AGENCE TEST',job:'EMPLOI TEST'};
const stored=()=>({...cspResolvedEvent(arrival,prepareCsp(data,[arrival])[0]),approved:true});
const imported=(event=stored()):CspImport=>({id:'csp-fiction',name:'RD fictif',status:'validated',date:'2026-03-01',events:[event]});
const current=(d:AgentData)=>snapshot(d,CSP_SOURCE);
test('verified admission without NNI validates and creates a visible stage record, without invented NNI or NR',()=>{
 const p=prepareCsp(data,[arrival])[0];assert.equal(p.state,'ready');assert.match(p.problem,/sans NNI/);assert.equal(p.agentId,pendingAdmissionId(arrival));assert.equal(validateCspEvent(stored()),true);
 const projected=projectCsp(data,[imported()],'2026-05-01');assert.equal(projected.issues.length,0);const rows=current(projected.data);assert.equal(rows.length,1);assert.equal(rows[0].nni,undefined);assert.equal(rows[0].nr,undefined);assert.equal(rows[0].gf,7);assert.equal(rows[0].presence,'Stagiaire');assert.equal(rows[0].entryUnit,arrival.effective);assert.match(rows[0].matchStatus!,/NNI à compléter/);
 assert.equal(data.records.length,0);
});
test('arrival checkbox alone still requires identity; provisional admission still requires GF, job, agency and extraction verification',()=>{
 for(const patch of [{identityPending:false},{newAgent:false},{gfAfter:undefined},{agency:undefined},{job:undefined},{extractionIssue:'Lecture contradictoire'}])assert.equal(prepareCsp(data,[{...arrival,...patch}])[0].state,'blocked',JSON.stringify(patch));
 assert.equal(validateCspEvent({...arrival,kind:'avancement'}),false);assert.equal(validateCspEvent({...stored(),agentId:'pending-csp-fake'}),false);
 assert.equal(validateCspEvent({...arrival,identityPending:'yes'}),false);
});
test('same admission in two documents does not create two agents; disabled and scheduled events do not add premature arrivals',()=>{
 const i=imported();const double=projectCsp(data,[i,{...i,id:'csp-second',events:[{...i.events[0],id:'other',page:2}]}],'2026-05-01');assert.equal(current(double.data).length,1);
 assert.equal(prepareCsp(data,[arrival],[i])[0].state,'duplicate');assert.equal(current(projectCsp(data,[i],'2026-01-01').data).length,0);assert.equal(projectCsp(data,[{...i,status:'disabled:validated'}]).data,data);
});
test('a later unambiguous RUP reconciles the same admission to a real NNI without changing its stored approval',()=>{
 const original=imported(),copy=structuredClone(original);const proof={name:'ALEX FICTIF',nni:'Z90123',source:'rup-fiction',date:'2026-09-01',agency:'AGENCE TEST'};
 const withRup={...data,cspIdentities:[proof]};const projected=projectCsp(withRup,[original],'2026-10-01');const rows=current(projected.data);assert.equal(rows.length,1);assert.equal(rows[0].agentId,proof.nni);assert.equal(rows[0].nni,proof.nni);assert.equal(rows[0].entryUnit,arrival.effective);assert.deepEqual(original,copy);
 assert.equal(resolvePendingAdmissions(withRup,[original])[0].events[0].agentId,proof.nni);
 assert.equal(current(projectCsp(data,[original],'2026-10-01').data)[0].nni,undefined);
});
test('homonyms, contradictory NNIs, multiple arrivals and incompatible agencies prevent automatic merging',()=>{
 const proof={name:arrival.name,nni:'Z90123',source:'rup-fiction',date:'2026-09-01',agency:arrival.agency};
 for(const identities of [[proof,{...proof,nni:'Z90124'}],[{...proof,agency:'AUTRE AGENCE'}]]){
  const rows=current(projectCsp({...data,cspIdentities:identities},[imported()],'2026-10-01').data);assert.equal(rows.length,1);assert.equal(rows[0].nni,undefined);
 }
 const second={...stored(),id:'other',effective:'2026-03-01'};second.agentId=pendingAdmissionId(second);
 const rows=current(projectCsp({...data,cspIdentities:[proof]},[imported(),{...imported(second),id:'second'}],'2026-10-01').data);assert.equal(rows.length,2);assert.ok(rows.every(r=>!r.nni));
 const homonym={...stored(),id:'homonym',agency:'AUTRE AGENCE'};homonym.agentId=pendingAdmissionId(homonym);assert.notEqual(homonym.agentId,stored().agentId);
 const separate=current(projectCsp({...data,cspIdentities:[proof]},[imported(),{...imported(homonym),id:'homonym'}],'2026-10-01').data);assert.equal(separate.length,2);assert.ok(separate.every(r=>!r.nni));
 const ambiguous={...data,cspIdentities:[proof,{...proof,nni:'Z90124'}]};assert.equal(prepareCsp(ambiguous,[arrival])[0].state,'blocked');
});
test('a newer annual photograph containing the reconciled agent does not duplicate the admission',()=>{
 const observed={id:'row',agentId:'Z90123',nni:'Z90123',source:'new',row:1,name:arrival.name,gf:7,agency:arrival.agency};
 const newer={...data,sources:[...data.sources,{id:'new',primary:true,date:'2026-09-01'} as any],records:[observed]};
 const rows=current(projectCsp(newer,[imported()],'2026-10-01').data);assert.equal(rows.length,1);assert.equal(rows[0].nni,'Z90123');
});
test('the real agent loader reconciles imported RUP identities before filtering a single agent profile',async()=>{
 const {build}=await import('esbuild');
 const f={event:stored(),rupStatus:'validated',disabled:false};(globalThis as any).__pendingAdmissionLoader=f;
 const packed={...data,recordFields:[],eventFields:[],strings:[]};
 const bundle=await build({entryPoints:[new URL('../src/lib/agents-store.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'pending-loader',setup(build){
  build.onResolve({filter:/\/(store|seeds)(\.ts)?$/},a=>({path:a.path.split('/').at(-1)!.replace('.ts',''),namespace:'pending-loader'}));
  build.onLoad({filter:/.*/,namespace:'pending-loader'},a=>({contents:a.path==='seeds'?`
   export const packedText=${JSON.stringify(JSON.stringify(packed))};export const rupSeedText='{"sources":[],"records":[]}';export async function loadSeeds(){}
  `:`export function resources(){const f=globalThis.__pendingAdmissionLoader;return {db:{prepare(query){return {async all(){return {results:query.includes('agent_imports')?[
   {id:'csp-fixture',name:'RD fictif',date:'2026-03-01',status:'validated',detail:JSON.stringify({kind:'csp',events:[f.event],perEventValidation:true})},
   {id:'rup-fixture',name:'RUP fictif',date:'2026-09-01',status:f.rupStatus,detail:'{"kind":"rup"}'}
  ]:query.includes('rup_source_exclusions')&&f.disabled?[{source_id:'rup-fixture'}]:[]}}}}},bucket:{async get(){return {async json(){return [{source:'rup-fixture',nni:'Z90123',nom:'FICTIF',prenom:'ALEX',agence:'AGENCE TEST',contrat:'',entreeIEG:null}]}}}}};}`}));
 }}]});
 const {agentData}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 let loaded=await agentData(true,'Z90123','2026-10-01');assert.equal(loaded.cspIssues.length,0);assert.equal(current(loaded.data).length,1);assert.equal(current(loaded.data)[0].nni,'Z90123');assert.equal(loaded.cspImports[0].events[0].agentId,'Z90123');
 loaded=await agentData(true,undefined,'2026-10-01');assert.equal(current(loaded.data).length,1);
 for(const patch of [{disabled:true},{disabled:false,rupStatus:'review'}]){Object.assign(f,patch);loaded=await agentData(true,undefined,'2026-10-01');assert.equal(current(loaded.data).length,1);assert.equal(current(loaded.data)[0].nni,undefined);}
});
