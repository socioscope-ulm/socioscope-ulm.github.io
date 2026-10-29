import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
test('CSP API validates roles, previews without writes, saves one PDF, rejects incomplete decisions and protects concurrent changes',async()=>{
 const m={rows:[] as any[],puts:[] as string[],queries:[] as string[],identities:[] as any[]};(globalThis as any).__cspAPI=m;
 const b=await build({entryPoints:[new URL('../src/app/api/csp/route.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'csp-fixture',setup(build){
  build.onResolve({filter:/\/(store|agents-store)(\.ts)?$/},a=>({path:a.path.split('/').at(-1)!.replace('.ts',''),namespace:'csp-test'}));
  build.onLoad({filter:/.*/,namespace:'csp-test'},a=>({resolveDir:new URL('..',import.meta.url).pathname,contents:a.path==='agents-store'?`
   import {accessError} from '${new URL('../src/lib/access.ts',import.meta.url).pathname}';
   export async function agentAuth(req,write=false){const error=accessError(req,write);if(error)throw Object.assign(Error((await error.json()).error),{status:error.status});}
   export const agentError=e=>Response.json({error:e.message},{status:e.status||500});
   export async function cspIdentityData(data){return {...data,cspIdentities:globalThis.__cspAPI.identities||[]};}
   export async function agentData(){return {cspImports:globalThis.__cspAPI.rows.map(r=>{const d=JSON.parse(r.detail);return {...r,...d,evidenceEvents:d.events,events:d.events.filter(e=>e.selected&&!e.candidacy&&!e.acknowledgedByDocument&&!e.acknowledgedByRD&&(!d.perEventValidation||e.approved===true))};}),data:{sources:[{id:'annual',primary:true,date:'2025-12-31',seniorityDate:'2025-12-31',label:'Annual'}],records:[{id:'one',agentId:'A12345',nni:'A12345',name:'TEST ALICE',source:'annual',row:1,gf:9,nr:200,agency:'AMTC'}],events:[],issues:[],updated:''}};}
  `:`
   export function resources(){const m=globalThis.__cspAPI;return {bucket:{async put(key){m.puts.push(key);}},db:{prepare(query){let args=[];const stmt={bind(...a){args=a;return stmt;},async all(){m.queries.push(query);return {results:m.rows};},async first(){m.queries.push(query);return query.includes('hash=')?m.rows.find(r=>r.hash===args[0]):m.rows.find(r=>r.id===args[0]);},async run(){m.queries.push(query);
    if(query.startsWith('INSERT')){const [id,name,hash,date,created,status,count,complete,detail]=args;m.rows.push({id,name,hash,date,created,status,count,complete,detail});return {meta:{changes:1}};}
    if(query.includes('SET detail=')){const [detail,status,count,id,oldStatus,oldDetail]=args;const r=m.rows.find(r=>r.id===id&&r.status===oldStatus&&r.detail===oldDetail);if(!r)return {meta:{changes:0}};Object.assign(r,{detail,status,count});return {meta:{changes:1}};}
    if(query.includes("SET status='disabled:validated'")){const r=m.rows.find(r=>r.id===args[0]&&r.status==='validated'&&r.detail===args[1]);if(!r)return {meta:{changes:0}};r.status='disabled:validated';return {meta:{changes:1}};}
    if(query.includes("SET status='review'")){const r=m.rows.find(r=>r.id===args[0]&&r.status===args[1]&&r.detail===args[2]);if(!r)return {meta:{changes:0}};r.status='review';return {meta:{changes:1}};}
    throw Error('Unexpected mutation '+query);
   }};return stmt;}}};}
  `}));
 }}]});
 const route=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
 const headers={'oai-authenticated-user-id':'fixture','oai-authenticated-user-email':'fixture@example.test','x-socioscope-role':'admin','Content-Type':'application/json'};
 const request=(body:any,method='POST',role='admin')=>new Request('https://fixture.test/api/csp',{method,headers:{...headers,'x-socioscope-role':role},body:JSON.stringify(body)});
 const e={id:'one',name:'TEST ALICE',kind:'nomination',effective:'2026-01-01',gfDelta:3,page:1,selected:true};
 assert.equal((await route.POST(request({date:'2026-03-24',events:[e]},'POST','viewer'))).status,403);
 assert.equal((await route.POST(new Request('https://fixture.test/api/csp',{method:'POST',body:'{}'}))).status,401);
 let preview=await (await route.POST(request({date:'2026-03-24',events:[e]}))).json();assert.equal(preview.blocked,1);assert.equal(preview.events[0].agentId,'A12345');assert.equal(m.rows.length,0);assert.equal(m.puts.length,0);
 // Use automatically generated multipart boundary, never force a Content-Type.
 const send=async()=>{const f=new FormData();f.append('file',new File(['%PDF-fixture'],'rd.pdf',{type:'application/pdf'}));f.append('extraction',JSON.stringify({date:'2026-03-24',events:[e],reports:[]}));const h=new Headers(headers);h.delete('Content-Type');return route.POST(new Request('https://fixture.test/api/csp',{method:'POST',headers:h,body:f}));};
 const saved=await (await send()).json();assert.ok(saved.id);assert.equal(m.puts.length,1);assert.equal(m.rows[0].status,'review');
 assert.equal((await (await send()).json()).existing,true);assert.equal(m.puts.length,1);
 assert.equal((await route.PATCH(request({id:saved.id,action:'validate',checked:true,events:[e]},'PATCH'))).status,400);assert.equal(m.rows[0].status,'review');
 const resolved={...e,agentId:'A12345',nrAfter:205};assert.equal((await route.PATCH(request({id:saved.id,action:'validate',checked:true,events:[resolved]},'PATCH'))).status,200);assert.equal(m.rows[0].status,'validated');
 assert.equal(JSON.parse(m.rows[0].detail).events[0].recordedAfter.nr,205);
 assert.equal((await route.PATCH(request({id:saved.id,action:'validate',checked:true,events:[resolved]},'PATCH'))).status,409);
 assert.equal((await route.PATCH(request({id:saved.id,action:'save',events:[resolved]},'PATCH'))).status,409);
 assert.equal((await route.PATCH(request({id:saved.id,action:'disable'},'PATCH'))).status,200);assert.equal(m.rows[0].status,'disabled:validated');
 assert.equal((await route.PATCH(request({id:saved.id,action:'enable',checked:true},'PATCH'))).status,200);
 assert.equal((await route.PATCH(request({id:saved.id,action:'revise'},'PATCH'))).status,200);assert.equal(m.rows[0].status,'review');
 assert.equal(m.puts.length,1);assert.ok(m.queries.filter(q=>q.startsWith('UPDATE')).every(q=>q.includes('WHERE id=?')&&q.includes('detail=?')));
 // Mixed RD: commit ready decisions without publishing the unresolved nomination.
 m.rows=[];m.puts=[];
 const ready={id:'advance',name:'TEST ALICE',agentId:'A12345',kind:'avancement',effective:'2026-01-01',nrSteps:1,page:1,selected:true};
 const pending={...e,id:'appointment',agentId:'A12345',effective:'2026-03-01'};
 const form=new FormData();form.append('file',new File(['%PDF-batch-fixture'],'rd-batch.pdf',{type:'application/pdf'}));form.append('extraction',JSON.stringify({date:'2026-03-24',events:[ready,pending],reports:[]}));const uploadHeaders=new Headers(headers);uploadHeaders.delete('Content-Type');
 const batch=await (await route.POST(new Request('https://fixture.test/api/csp',{method:'POST',headers:uploadHeaders,body:form}))).json();
 let response=await route.PATCH(request({id:batch.id,action:'validate-state',state:'blocked',checked:true,events:[ready,pending]},'PATCH'));assert.equal(response.status,400);
 response=await route.PATCH(request({id:batch.id,action:'validate-state',state:'ready',checked:true,events:[ready,pending]},'PATCH'));assert.equal(response.status,200);let report=await response.json();assert.equal(report.validated,1);assert.equal(report.approved,1);assert.equal(report.pending,1);assert.equal(report.partial,true);
 let stored=JSON.parse(m.rows[0].detail);assert.equal(stored.events[0].approved,true);assert.equal(stored.events[0].recordedAfter.nr,205);assert.equal(stored.events[1].approved,undefined);assert.equal(stored.events[1].selected,true);assert.equal(m.rows[0].status,'validated');assert.equal(m.puts.length,1);
 const listing=await (await route.GET(new Request('https://fixture.test/api/csp',{headers}))).json();assert.equal(listing.records.length,1);assert.equal(listing.records[0].id,'advance');assert.equal(listing.imports[0].partial,true);
 const checked=await (await route.POST(request({id:batch.id,date:'2026-03-24',events:stored.events}))).json();assert.equal(checked.events[0].state,'validated');assert.equal(checked.events[1].state,'blocked');
 const tampered=stored.events.map((e:any)=>e.approved?{...e,nrSteps:2}:e);assert.equal((await route.PATCH(request({id:batch.id,action:'save',events:tampered},'PATCH'))).status,409);
 assert.equal((await route.PATCH(request({id:batch.id,action:'save',events:stored.events},'PATCH'))).status,200);assert.equal(m.rows[0].status,'validated');
 const corrected=stored.events.map((e:any)=>e.id==='appointment'?{...e,nrAfter:210}:e);
 response=await route.PATCH(request({id:batch.id,action:'validate-state',state:'ready',checked:true,events:corrected},'PATCH'));assert.equal(response.status,200);report=await response.json();assert.equal(report.validated,1);assert.equal(report.pending,0);assert.equal(report.approved,2);assert.equal(report.partial,false);
 stored=JSON.parse(m.rows[0].detail);assert.equal(stored.events[0].recordedAfter.nr,205);assert.equal(stored.events[1].recordedBefore.nr,205);assert.equal(stored.events[1].recordedAfter.nr,210);assert.equal(m.puts.length,1);
 // Existing approved data is kept when reactivating a partially validated RD.
 stored.events[1].approved=false;m.rows[0].detail=JSON.stringify(stored);
 assert.equal((await route.PATCH(request({id:batch.id,action:'disable'},'PATCH'))).status,200);
 response=await route.PATCH(request({id:batch.id,action:'enable',checked:true},'PATCH'));assert.equal(response.status,200);assert.equal((await response.json()).pending,1);assert.equal(JSON.parse(m.rows[0].detail).events[1].approved,false);

 // A future group cannot depend on an earlier ready decision still in draft.
 const future={...pending,id:'future',effective:'2099-01-01',nrAfter:220};
 m.rows[0].status='review';m.rows[0].detail=JSON.stringify({kind:'csp',events:[ready,future],reports:[]});
 response=await route.PATCH(request({id:batch.id,action:'validate-state',state:'scheduled',checked:true,events:[ready,future]},'PATCH'));assert.equal(response.status,400);assert.equal(m.rows[0].status,'review');assert.match((await response.json()).error,/dépend/);

 // A new admission found in the RUP is persisted with automatic NNI/arrival,
 // not only displayed as ready in the temporary preview.
 m.rows=[];(m as any).identities=[{name:'NOUVELLE CLAIRE',nni:'C12345',source:'rup-latest',date:'2026-09-30'}];
 const admitted={id:'arrival',name:'NOUVELLE CLAIRE',kind:'admission',effective:'2026-04-01',gfAfter:8,agency:'AMTE',job:'Technicien',page:1,selected:true};
 const admissionForm=new FormData();admissionForm.append('file',new File(['%PDF-admission-fixture'],'admission.pdf',{type:'application/pdf'}));admissionForm.append('extraction',JSON.stringify({date:'2026-03-24',events:[admitted],reports:[]}));
 const arrival=await (await route.POST(new Request('https://fixture.test/api/csp',{method:'POST',headers:uploadHeaders,body:admissionForm}))).json();
 assert.equal(JSON.parse(m.rows[0].detail).events[0].newAgent,true);assert.equal(JSON.parse(m.rows[0].detail).events[0].agentId,'C12345');
 response=await route.PATCH(request({id:arrival.id,action:'validate-state',state:'ready',checked:true,events:[admitted]},'PATCH'));assert.equal(response.status,200);const approvedAdmission=JSON.parse(m.rows[0].detail).events[0];assert.equal(approvedAdmission.approved,true);assert.equal(approvedAdmission.newAgent,true);assert.equal(approvedAdmission.identityMethod,'rup');assert.equal(approvedAdmission.recordedAfter.gf,8);assert.equal(approvedAdmission.recordedAfter.nr,undefined);

 // Validate a single decision in an existing draft; preserve all notes and other rows.
 (m as any).identities=[];
 const individualId='csp-individual';
 const annotated={...pending,note:'NR à confirmer auprès du document',agency:'Agence saisie manuellement'};
 m.rows=[{id:individualId,name:'Brouillon conservé.pdf',date:'2026-03-24',status:'review',count:2,detail:JSON.stringify({kind:'csp',events:[ready,annotated],reports:[{page:1,note:'Contrôle déjà saisi'}]})}];
 const originalDetail=m.rows[0].detail,originalPuts=m.puts.length;
 response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:annotated.id,checked:true,events:[ready,annotated]},'PATCH'));assert.equal(response.status,400);assert.equal(m.rows[0].detail,originalDetail);
 response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:'missing',checked:true,events:[ready,annotated]},'PATCH'));assert.equal(response.status,409);
 response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:ready.id,checked:false,events:[ready,annotated]},'PATCH'));assert.equal(response.status,400);
 response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:ready.id,checked:true,events:[ready,annotated]},'PATCH','viewer'));assert.equal(response.status,403);
 response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:ready.id,checked:true,events:[ready,annotated]},'PATCH'));assert.equal(response.status,200);report=await response.json();assert.equal(report.validated,1);assert.equal(report.pending,1);
 stored=JSON.parse(m.rows[0].detail);for(const [key,value] of Object.entries(annotated))assert.deepEqual(stored.events[1][key],value);assert.equal(stored.events[1].approved,undefined);assert.equal(stored.reports[0].note,'Contrôle déjà saisi');assert.equal(stored.events[0].recordedAfter.nr,205);assert.equal(m.puts.length,originalPuts);
 const oneCorrected=stored.events.map((event:any)=>event.id===annotated.id?{...event,nrAfter:210}:event);
 response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:annotated.id,checked:true,events:oneCorrected},'PATCH'));assert.equal(response.status,200);assert.equal((await response.json()).pending,0);
 stored=JSON.parse(m.rows[0].detail);assert.equal(stored.events[1].note,annotated.note);assert.equal(stored.events[1].agency,annotated.agency);assert.equal(stored.events[0].recordedAfter.nr,205);
 response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:ready.id,checked:true,events:stored.events},'PATCH'));assert.equal(response.status,409);
 // Scheduled and historical decisions can also be approved individually.
 for(const effective of ['2099-01-01','2025-01-01']){
  const target={...ready,effective};m.rows=[{id:individualId,date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',events:[target]})}];
  response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:target.id,checked:true,events:[target]},'PATCH'));assert.equal(response.status,200);assert.equal((await response.json()).validated,1);
 }
 // A single future decision must not borrow an unapproved prerequisite.
 m.rows=[{id:individualId,date:'2026-03-24',status:'review',count:2,detail:JSON.stringify({kind:'csp',events:[ready,future]})}];
 response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:future.id,checked:true,events:[ready,future]},'PATCH'));assert.equal(response.status,400);assert.match((await response.json()).error,/dépend/);
 // ODJ documents use the same workflow, persist their type and cannot approve
 // extraction conflicts until the administrator has reviewed and corrected them.
 const crEvent={...ready,extractionIssue:'Deux versions de la situation sont présentes.'};
 m.rows=[];const crForm=new FormData();crForm.append('file',new File(['%PDF-cr-fixture'],'cr.pdf',{type:'application/pdf'}));crForm.append('extraction',JSON.stringify({date:'2026-03-24',documentType:'cr',events:[crEvent],reports:[]}));
 const crResponse=await route.POST(new Request('https://fixture.test/api/csp',{method:'POST',headers:uploadHeaders,body:crForm}));assert.equal(crResponse.status,200);const crBatch=await crResponse.json();
 assert.equal(JSON.parse(m.rows[0].detail).documentType,'cr');
 const crMeta=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crBatch.id,{headers}))).json();assert.equal(crMeta.meta.documentType,'cr');
 response=await route.PATCH(request({id:crBatch.id,action:'validate-event',eventId:ready.id,checked:true,events:[crEvent]},'PATCH'));assert.equal(response.status,400);
 response=await route.PATCH(request({id:crBatch.id,action:'validate-event',eventId:ready.id,checked:true,events:[{...crEvent,extractionIssue:undefined}]},'PATCH'));assert.equal(response.status,200);assert.equal(JSON.parse(m.rows[0].detail).documentType,'cr');
 assert.equal((await route.PATCH(request({id:crBatch.id,action:'disable'},'PATCH'))).status,200);
 assert.equal((await route.PATCH(request({id:crBatch.id,action:'enable',checked:true},'PATCH'))).status,200);

 // Backfill a previously imported ODJ after a partially validated March RD.
 // Activation order does not matter; PDF and approved rows remain unchanged.
 const rdId='csp-march-rd',crId='csp-march-cr';
 const named={...ready,name:'TEST ALICE',pages:[1],approved:true,note:'Annotation validée conservée'};
 const picked={id:'picked',name:'TEST ALICE',agentId:'A12345',kind:'nomination',effective:'2026-04-01',gfDelta:0,nrBefore:205,agency:'AMTE',job:'Responsable',reference:'26-00001.01',page:2,selected:true,approved:true};
 const candidature={id:'candidate',name:'TEST ALICE',kind:'nomination',candidacy:true,effective:'',gfBefore:9,nrBefore:205,agency:'AMTE',job:'Responsable',reference:picked.reference,page:5,selected:true};
 m.rows=[{id:rdId,date:'2026-03-24',name:'RD mars.pdf',status:'disabled:validated',count:1,detail:JSON.stringify({kind:'csp',events:[picked],perEventValidation:true})},{id:crId,date:'2026-03-24',name:'ODJ mars.pdf',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',events:[named],reports:[{page:1,note:'Annotation de page'}]})}];
 const beforeBackfillPuts=m.puts.length;
 response=await route.PATCH(request({id:crId,action:'add-candidates',events:[candidature]},'PATCH','viewer'));assert.equal(response.status,403);
 response=await route.PATCH(request({id:crId,action:'add-candidates',events:[candidature]},'PATCH'));assert.equal(response.status,200);
 let crDetail=JSON.parse(m.rows[1].detail);assert.equal(crDetail.events.length,2);assert.equal(crDetail.events[0].note,named.note);assert.equal(crDetail.events[0].approved,true);assert.equal(crDetail.events[1].approved,undefined);assert.equal(crDetail.reports[0].note,'Annotation de page');assert.equal(crDetail.candidateVersion,1);assert.equal(m.puts.length,beforeBackfillPuts);
 response=await route.PATCH(request({id:crId,action:'add-candidates',events:[candidature]},'PATCH'));assert.equal(response.status,200);assert.equal(JSON.parse(m.rows[1].detail).events.length,2);
 let candidaturePreview=await (await route.POST(request({id:crId,date:'2026-03-24',events:crDetail.events}))).json();assert.ok(candidaturePreview.events,JSON.stringify(candidaturePreview));assert.equal(candidaturePreview.events.find((e:any)=>e.candidacy).state,'blocked');
 response=await route.PATCH(request({id:rdId,action:'enable',checked:true},'PATCH'));assert.equal(response.status,200);
 candidaturePreview=await (await route.POST(request({id:crId,date:'2026-03-24',events:crDetail.events}))).json();const linked=candidaturePreview.events.find((e:any)=>e.candidacy);assert.equal(linked.state,'ready');assert.equal(linked.matchedRD.id,rdId);assert.equal(linked.after.nr,205);
 response=await route.PATCH(request({id:crId,action:'validate-event',eventId:candidature.id,checked:true,events:crDetail.events},'PATCH'));assert.equal(response.status,200);assert.equal((await response.json()).pending,0);assert.equal(m.puts.length,beforeBackfillPuts);
 const decisionsOnly=await (await route.GET(new Request('https://fixture.test/api/csp',{headers}))).json();assert.equal(decisionsOnly.records.filter((e:any)=>e.candidacy).length,0);
 assert.equal(JSON.parse(m.rows[1].detail).events[0].note,named.note);
 // A duplicate is acknowledged without losing the original approved record.
 const prior={...m.rows[0],id:'csp-prior',status:'validated',detail:JSON.stringify({kind:'csp',events:[{...ready,approved:true}]})};
 m.rows=[prior,{id:individualId,date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',events:[ready]})}];
 response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:ready.id,checked:true,events:[ready]},'PATCH'));assert.equal(response.status,200);assert.equal(JSON.parse(m.rows[1].detail).events[0].approved,true);

 // ODJ/RD salary references are regenerated server-side during individual and
 // state validation; drafts, annotations, PDFs and existing approvals survive.
 // Fictional identity and salary figures; no production personnel data.
 const salaryRD={id:'salary-rd',name:'EXEMPLE BOB',agentId:'Z00001',identityMethod:'rup',kind:'mesure',effective:'2026-01-01',nrSteps:1,page:50,selected:true,note:'Motif conservé'};
 const salaryCR={...salaryRD,id:'salary-cr',gfBefore:8,nrBefore:120,nrAfter:125,page:40};
 (m as any).identities=[{name:salaryRD.name,nni:'Z00001',source:'rup-active',date:'2026-09-30',agency:'AMT OUEST'}];
 m.rows=[{id:rdId,name:'RD mars.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',perEventValidation:true,events:[salaryRD]})},{id:crId,name:'ODJ mars.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[salaryCR],reports:[{page:40,note:'Vérifié'}]})}];
 const noWrites=m.puts.length;
 const salaryPreview=await (await route.POST(request({id:rdId,date:'2026-03-24',events:[salaryRD]}))).json();assert.equal(salaryPreview.events[0].state,'ready');assert.equal(salaryPreview.events[0].before.nr,120);assert.equal(salaryPreview.events[0].after.nr,125);
 response=await route.PATCH(request({id:rdId,action:'validate-event',eventId:salaryRD.id,checked:true,events:[salaryRD]},'PATCH'));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const accepted=JSON.parse(m.rows[0].detail).events[0];assert.equal(accepted.approved,true);assert.equal(accepted.recordedBefore.gf,8);assert.equal(accepted.recordedAfter.nr,125);assert.equal(accepted.salaryReference.cr.id,crId);assert.equal(accepted.salaryReference.rd.id,rdId);assert.equal(accepted.note,'Motif conservé');
 assert.equal(JSON.parse(m.rows[1].detail).events[0].approved,undefined);assert.equal(m.puts.length,noWrites);
 const automaticSalary=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();assert.equal(automaticSalary.meta.pending,0);assert.equal(automaticSalary.events[0].acknowledgedByDocument.id,rdId);assert.equal(automaticSalary.events[0].approved,true);assert.equal(JSON.parse(m.rows[0].detail).events[0].recordedAfter.nr,125);assert.equal(JSON.parse(m.rows[1].detail).reports[0].note,'Vérifié');

 // Exact titularisations are acknowledged on read, without database writes;
 // an authorized later save compares the original stored detail, not the view.
 const titular={id:'titular',name:'TEST ALICE',agentId:'A12345',kind:'titularisation',effective:'2024-12-16',page:2,pages:[2],selected:true,note:'Note conservée'};
 const unresolved={...pending,id:'still-pending'};
 m.rows=[{id:rdId,name:'RD mars.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',perEventValidation:true,events:[{...titular,approved:true}]})},{id:crId,name:'ODJ mars.pdf',date:'2026-03-24',status:'validated',count:2,detail:JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[titular,unresolved],reports:[{page:2,note:'Page conservée'}]})}];
 const raw=m.rows[1].detail;const writes=m.queries.filter(q=>q.startsWith('UPDATE')).length;
 const acknowledged=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();assert.equal(acknowledged.meta.approved,1);assert.equal(acknowledged.meta.pending,1);assert.equal(acknowledged.events[0].acknowledgedByDocument.id,rdId);assert.equal(m.rows[1].detail,raw);assert.equal(m.queries.filter(q=>q.startsWith('UPDATE')).length,writes);
 const previewAcknowledged=await (await route.POST(request({id:crId,date:'2026-03-24',events:[titular,unresolved]}))).json();assert.ok(previewAcknowledged.events,JSON.stringify(previewAcknowledged));assert.equal(previewAcknowledged.events[0].state,'duplicate');assert.equal(previewAcknowledged.events[0].approved,true);assert.equal(previewAcknowledged.events[0].matchedDocument.id,rdId);assert.equal(m.rows[1].detail,raw);
 response=await route.PATCH(request({id:crId,action:'save',events:[titular,unresolved]},'PATCH'));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));assert.equal(JSON.parse(m.rows[1].detail).events[0].acknowledgedByDocument.id,rdId);
 const listingAcknowledged=await (await route.GET(new Request('https://fixture.test/api/csp',{headers}))).json();assert.equal(listingAcknowledged.records.filter(e=>e.kind==='titularisation').length,1);
 response=await route.PATCH(request({id:rdId,action:'disable'},'PATCH'));assert.equal(response.status,200);
 const restored=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();assert.equal(restored.events[0].approved,undefined);assert.equal(restored.meta.pending,2);assert.equal(restored.events[0].note,'Note conservée');

 // Validate in the ODJ first: the draft RD must immediately leave pending too.
 const crFirst={...ready,id:'cr-first',pages:[1],gfBefore:9,nrBefore:200,nrAfter:205};
 const rdSecond={...ready,id:'rd-second',pages:[1]};
 m.rows=[{id:crId,name:'ODJ premier.pdf',date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',events:[crFirst]})},{id:rdId,name:'RD second.pdf',date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',events:[rdSecond]})}];
 response=await route.PATCH(request({id:crId,action:'validate-event',eventId:crFirst.id,checked:true,events:[crFirst]},'PATCH'));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const reverseMatch=await (await route.GET(new Request('https://fixture.test/api/csp?id='+rdId,{headers}))).json();assert.equal(reverseMatch.meta.approved,1);assert.equal(reverseMatch.meta.pending,0);assert.equal(reverseMatch.events[0].acknowledgedByDocument.documentType,'cr');
 const reversePreview=await (await route.POST(request({id:rdId,date:'2026-03-24',events:[rdSecond]}))).json();assert.equal(reversePreview.events[0].state,'duplicate');assert.equal(reversePreview.events[0].matchedDocument.id,crId);
 response=await route.PATCH(request({id:rdId,action:'save',events:[rdSecond]},'PATCH'));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 assert.equal(JSON.parse(m.rows[1].detail).events[0].acknowledgedByDocument.id,crId);
 response=await route.PATCH(request({id:crId,action:'disable'},'PATCH'));assert.equal(response.status,200);
 const reverseRestored=await (await route.GET(new Request('https://fixture.test/api/csp?id='+rdId,{headers}))).json();assert.equal(reverseRestored.meta.pending,1);assert.equal(reverseRestored.events[0].approved,undefined);

 // Close an unknown candidate after the other decision is approved, then reopen
 // it without revising or withdrawing the already applied decision.
 const unknown={id:'unknown-candidate',name:'EXEMPLE INCONNU',kind:'nomination',candidacy:true,effective:'',page:1,selected:true,reference:'SYNTHETIC-POST'};
 const approvedDecision={...ready,pages:[1],approved:true,recordedBefore:{gf:9,nr:200},recordedAfter:{gf:9,nr:205}};
 m.rows=[{id:crId,name:'ODJ fictif.pdf',date:'2026-03-24',status:'validated',count:2,detail:JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[approvedDecision,unknown]})}];
 response=await route.PATCH(request({id:crId,action:'save',events:[approvedDecision,{...unknown,nonRetained:true}]},'PATCH'));
 assert.equal(response.status,200);report=await response.json();assert.equal(report.pending,0);assert.equal(report.approved,1);
 let closure=JSON.parse(m.rows[0].detail);assert.equal(closure.events[1].approved,undefined);assert.equal(closure.events[1].nonRetained,true);assert.deepEqual(closure.events[0],approvedDecision);
 const closedPreview=await (await route.POST(request({id:crId,date:'2026-03-24',events:closure.events}))).json();assert.equal(closedPreview.events[1].state,'not-retained');assert.equal(closedPreview.blocked,0);
 response=await route.PATCH(request({id:crId,action:'save',events:[approvedDecision,{...unknown,nonRetained:false}]},'PATCH'));
 assert.equal(response.status,200);assert.equal((await response.json()).pending,1);assert.deepEqual(JSON.parse(m.rows[0].detail).events[0],approvedDecision);

 // An internal RD award of either one or two GF provides exactly two NR
 // steps; the matching ODJ candidate uses the same calculation without applying it.
 for(const delta of [1,2]){
  const internal={id:'internal-nomination',name:'TEST ALICE',agentId:'A12345',kind:'nomination',effective:'2026-04-01',gfDelta:delta,page:1,pages:[1],selected:true,reference:'SYNTHETIC-INTERNAL',agency:'AMTE',job:'EMPLOI FICTIF'};
  const candidacy={id:'internal-candidate',name:internal.name,kind:'nomination',candidacy:true,effective:'',page:1,pages:[1],selected:true,reference:internal.reference,gfBefore:9,nrBefore:200};
  m.rows=[{id:rdId,name:'RD fictif.pdf',date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',events:[internal]})},{id:crId,name:'ODJ fictif.pdf',date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',events:[candidacy]})}];
  for(const [id,events] of [[rdId,[internal]],[crId,[candidacy]]] as const){const prepared=await (await route.POST(request({id,date:'2026-03-24',events}))).json();assert.equal(prepared.events[0].state,'ready');assert.equal(prepared.events[0].after.gf,9+delta);assert.equal(prepared.events[0].after.nr,210);}
  response=await route.PATCH(request({id:rdId,action:'validate-event',eventId:internal.id,events:[internal],checked:true},'PATCH'));assert.equal(response.status,200);
  const validated=JSON.parse(m.rows[0].detail).events[0];assert.equal(validated.recordedAfter.nr,210);assert.equal(validated.recordedAfter.gf,9+delta);
 }

 // Reading existing CRs automatically classifies non-winners without a write.
 const selectedCandidate={id:'chosen-cr',name:'EXEMPLE LAURE',agentId:'Z00001',kind:'nomination',candidacy:true,effective:'',page:1,pages:[1],selected:true,reference:'POSTE-AUTOMATIQUE'};
 const notChosen={...selectedCandidate,id:'other-cr',name:'TEST ALICE',agentId:'A12345'};
 const unknownCandidate={...selectedCandidate,id:'external-cr',name:'EXEMPLE BOB',agentId:undefined};
 const appointment={...selectedCandidate,id:'chosen-rd',candidacy:false,effective:'2026-04-01',newAgent:true,gfAfter:8,nrAfter:120,agency:'AMTE',job:'EMPLOI FICTIF',approved:true};
 m.rows=[{id:rdId,name:'RD fictif.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',perEventValidation:true,events:[appointment]})},{id:crId,name:'ODJ fictif.pdf',date:'2026-03-24',status:'review',count:3,detail:JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[selectedCandidate,notChosen,unknownCandidate]})}];
 const originalRows=structuredClone(m.rows);
 let auto=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();
 assert.equal(auto.meta.pending,1);assert.equal(auto.meta.approved,0);assert.equal(auto.events[0].nonRetainedByRD,undefined);
 for(const item of auto.events.slice(1)){assert.equal(item.nonRetainedByRD.id,rdId);assert.equal(item.approved,undefined);assert.equal(item.nonRetained,undefined);}
 assert.deepEqual(m.rows,originalRows);
 const autoPreview=await (await route.POST(request({id:crId,date:'2026-03-24',events:auto.events}))).json();assert.equal(autoPreview.events[1].state,'not-retained');assert.equal(autoPreview.events[2].state,'not-retained');
 response=await route.PATCH(request({id:crId,action:'validate-event',eventId:notChosen.id,events:auto.events,checked:true},'PATCH'));assert.equal(response.status,409);
 response=await route.PATCH(request({id:crId,action:'save',events:auto.events},'PATCH'));assert.equal(response.status,200);assert.equal((await response.json()).pending,1);
 response=await route.PATCH(request({id:rdId,action:'disable'},'PATCH'));assert.equal(response.status,200);
 auto=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();assert.equal(auto.meta.pending,3);assert.ok(auto.events.every((v:any)=>!v.nonRetainedByRD));

 // Independent validation: an award remains published while an administrative
 // transfer quoting the pre-award salary can be validated on its own.
 const award={id:'separate-award',name:'TEST ALICE',agentId:'A12345',kind:'avancement',effective:'2026-01-01',nrSteps:1,gfBefore:9,nrBefore:200,nrAfter:205,page:1,selected:true};
 const transfer={id:'separate-transfer',name:'TEST ALICE',agentId:'A12345',kind:'mutation',effective:'2026-02-01',gfDelta:0,nrSteps:0,gfBefore:9,gfAfter:9,nrBefore:200,nrAfter:200,agency:'AMTE',page:2,selected:true};
 m.rows=[{id:rdId,name:'RD fictif.pdf',date:'2026-03-24',status:'review',count:2,detail:JSON.stringify({kind:'csp',documentType:'rd',events:[award,transfer]})}];
 response=await route.PATCH(request({id:rdId,action:'validate-event',eventId:award.id,events:[award,transfer],checked:true},'PATCH'));assert.equal(response.status,200);
 let separate=JSON.parse(m.rows[0].detail).events;const publishedAward=structuredClone(separate[0]);assert.equal(publishedAward.recordedAfter.nr,205);assert.equal(separate[1].approved,undefined);
 preview=await (await route.POST(request({id:rdId,date:'2026-03-24',events:separate}))).json();assert.equal(preview.events[1].state,'ready');assert.equal(preview.events[1].after.nr,205);
 response=await route.PATCH(request({id:rdId,action:'validate-event',eventId:transfer.id,events:separate,checked:true},'PATCH'));assert.equal(response.status,200);assert.equal((await response.json()).pending,0);
 separate=JSON.parse(m.rows[0].detail).events;assert.deepEqual(separate[0],publishedAward);assert.equal(separate[1].approved,true);assert.equal(separate[1].recordedBefore.nr,205);assert.equal(separate[1].recordedAfter.nr,205);assert.equal(separate[1].recordedAfter.agency,'AMTE');
 response=await route.PATCH(request({id:rdId,action:'validate-event',eventId:transfer.id,events:separate,checked:true},'PATCH'));assert.equal(response.status,409);

 // A completed RD also closes the sole ODJ candidature on an unfilled post.
 const vacantCandidate={id:'vacant-candidate',name:'EXEMPLE CANDIDAT',kind:'nomination',candidacy:true,effective:'',page:1,reference:'POSTE-NON-POURVU-FICTIF',selected:true};
 m.rows=[{id:rdId,name:'RD fictif.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',perEventValidation:true,events:[{...award,approved:true}]})},{id:crId,name:'ODJ fictif.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[vacantCandidate]})}];
 const beforeVacant=structuredClone(m.rows);
 let vacant=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();assert.equal(vacant.meta.pending,0);assert.equal(vacant.events[0].nonRetainedByRD.reason,'unfilled-post');assert.equal(vacant.events[0].approved,undefined);assert.deepEqual(m.rows,beforeVacant);
 preview=await (await route.POST(request({id:crId,date:'2026-03-24',events:vacant.events}))).json();assert.equal(preview.events[0].state,'not-retained');assert.equal(preview.events[0].after,undefined);
 // The RD can be complete through acknowledgements of original ODJ approvals.
 // Previewing that validated ODJ must preserve its evidentiary status.
 const originalSalary={...award,id:'original-cr-award',pages:[1],approved:true,recordedBefore:{gf:9,nr:200},recordedAfter:{gf:9,nr:205}};
 const rdSalary={...originalSalary,id:'acknowledged-rd-award',acknowledgedByDocument:{id:crId,eventId:originalSalary.id,name:'ODJ fictif.pdf',page:1,documentType:'cr'}};
 m.rows[0].detail=JSON.stringify({kind:'csp',documentType:'rd',perEventValidation:true,events:[rdSalary]});
 m.rows[1].detail=JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[originalSalary,vacantCandidate]});
 vacant=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();assert.equal(vacant.meta.pending,0);assert.equal(vacant.events[1].nonRetainedByRD.reason,'unfilled-post');
 preview=await (await route.POST(request({id:crId,date:'2026-03-24',events:vacant.events}))).json();assert.equal(preview.events[1].state,'not-retained');assert.equal(preview.events[1].nonRetainedByRD.reason,'unfilled-post');assert.equal(preview.events[0].approved,true);
 response=await route.PATCH(request({id:rdId,action:'revise'},'PATCH'));assert.equal(response.status,200);
 vacant=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();assert.equal(vacant.meta.pending,1);assert.equal(vacant.events[1].nonRetainedByRD,undefined);

 {
 // A one-decision correction previews without writes and keeps other approvals.
 const untouched={...award,id:'unaffected',name:'TEST BOB',agentId:'B12345',effective:'2026-01-02',approved:true,recordedBefore:{gf:8,nr:180},recordedAfter:{gf:8,nr:185}};
 m.rows=[{id:rdId,name:'RD fictif.pdf',date:'2026-03-24',status:'validated',count:2,detail:JSON.stringify({kind:'csp',documentType:'rd',perEventValidation:true,events:[originalSalary,untouched]})}];
 const correctionPrior=structuredClone(m.rows);
 const correction={...originalSalary,nrSteps:2,nrAfter:210};
 const body={id:rdId,eventId:correction.id,event:correction,reason:'Vérification du document fictif'};
 assert.equal((await route.PATCH(request({...body,action:'preview-correction'},'PATCH','viewer'))).status,403);
 response=await route.PATCH(request({...body,action:'preview-correction'},'PATCH'));
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const proposed=await response.json();assert.equal(proposed.decision.after.nr,210);assert.deepEqual(m.rows,correctionPrior);
 assert.equal((await route.PATCH(request({...body,action:'correct-event',token:'stale'},'PATCH'))).status,409);assert.deepEqual(m.rows,correctionPrior);
 assert.equal((await route.PATCH(request({...body,action:'correct-event',token:proposed.token,reason:'Changed'},'PATCH'))).status,409);
 response=await route.PATCH(request({...body,action:'correct-event',token:proposed.token},'PATCH'));assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const corrected=JSON.parse(m.rows[0].detail);assert.equal(m.rows[0].status,'validated');assert.equal(corrected.events[0].recordedAfter.nr,210);assert.deepEqual(corrected.events[1],untouched);assert.equal(corrected.corrections[0].before.recordedAfter.nr,205);assert.equal(corrected.corrections[0].reason,body.reason);
 assert.equal((await route.PATCH(request({...body,action:'preview-correction',reason:''},'PATCH'))).status,400);
 // A later explicit salary must not silently become invalid.
 const dependent={...award,id:'dependent',effective:'2026-03-01',nrBefore:205,nrAfter:210,approved:true,recordedBefore:{gf:9,nr:205},recordedAfter:{gf:9,nr:210}};
 m.rows[0].detail=JSON.stringify({kind:'csp',documentType:'rd',perEventValidation:true,events:[originalSalary,dependent]});
 const unchanged=structuredClone(m.rows);
 response=await route.PATCH(request({...body,action:'preview-correction'},'PATCH'));assert.equal(response.status,400);assert.match((await response.json()).error,/incohérente|dépend/);assert.deepEqual(m.rows,unchanged);

 }
 {
 // A single acknowledged ODJ decision closes its document automatically,
 // without persisting another approval or another movement.
 const decision={id:'completion',name:'TEST ALICE',agentId:'A12345',kind:'titularisation',effective:'2026-01-01',page:1,selected:true};
 m.rows=[{id:rdId,name:'RD fictif.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',perEventValidation:true,events:[{...decision,approved:true}]})},{id:crId,name:'ODJ fictif.pdf',date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',events:[decision]})}];
 const originalRows=structuredClone(m.rows);
 const get=()=>route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}));
 let view=await (await get()).json();assert.equal(view.meta.automaticallyValidated,true);assert.equal(view.meta.pending,0);assert.deepEqual(m.rows,originalRows);
 const list=await (await route.GET(new Request('https://fixture.test/api/csp',{headers}))).json();assert.equal(list.imports.find(i=>i.id===crId).automaticallyValidated,true);assert.equal(list.total,1);
 assert.equal((await route.PATCH(request({id:rdId,action:'disable'},'PATCH'))).status,200);
 view=await (await get()).json();assert.equal(view.meta.automaticallyValidated,false);assert.equal(view.meta.pending,1);
 }

 {
 // A mutation cannot create an arrival until its interunit nature is confirmed.
 const incoming={id:'interunit',name:'EXEMPLE ARRIVANTE',agentId:'Z00009',kind:'mutation',effective:'2026-05-01',page:1,selected:true,gfDelta:0,gfBefore:7,gfAfter:7,nrBefore:110,nrAfter:110,agency:'AGENCE FICTIVE'};
 m.rows=[{id:rdId,name:'RD fictif.pdf',date:'2026-04-20',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',events:[incoming]})}];
 let r=await route.PATCH(request({id:rdId,action:'validate-event',eventId:incoming.id,events:[incoming],checked:true},'PATCH'));assert.equal(r.status,400);
 r=await route.PATCH(request({id:rdId,action:'validate-event',eventId:incoming.id,events:[{...incoming,newAgent:true}],checked:true},'PATCH'));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));
 const stored=JSON.parse(m.rows[0].detail).events[0];assert.equal(stored.newAgent,true);assert.equal(stored.recordedAfter.gf,7);assert.equal(stored.recordedAfter.nr,110);assert.equal(m.rows[0].status,'validated');
 }

 {
 // A historical posthumous count remains independently validatable after an earlier award.
 const previous={id:'previous-posthumous',name:'TEST ALICE',agentId:'A12345',kind:'posthume',effective:'2026-02-01',nrBefore:200,nrSteps:1,page:1,selected:true,approved:true};
 const pending={...previous,id:'pending-posthumous',nrSteps:5,nrAfter:225,approved:undefined};
 m.rows=[{id:rdId,name:'RD fictif.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',perEventValidation:true,events:[previous]})},{id:crId,name:'ODJ fictif.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[pending]})}];
 const unchangedRD=structuredClone(m.rows[0]);
 const p=await (await route.POST(request({id:crId,date:'2026-03-24',events:[pending]}))).json();
 assert.equal(p.events[0].state,'ready');assert.equal(p.events[0].before.nr,200);assert.equal(p.events[0].after.nr,225);
 const r=await route.PATCH(request({id:crId,action:'validate-event',eventId:pending.id,events:[pending],checked:true},'PATCH'));
 assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).pending,0);
 assert.equal(JSON.parse(m.rows[1].detail).events[0].recordedAfter.nr,225);assert.deepEqual(m.rows[0],unchangedRD);
 }

 {
 // Explicit manual exception is checked, persisted and projected through the normal individual validation.
 const manual={id:'manual-reclassement',name:'TEST ALICE',agentId:'A12345',kind:'reclassement',effective:'2026-04-01',gfDelta:1,gfBefore:9,gfAfter:10,nrBefore:200,nrAfter:200,page:1,selected:true,extractionIssue:'progression NR différente de la règle de reclassement. Vérifier le document et corriger la ligne.'};
 m.rows=[{id:crId,name:'ODJ fictif.pdf',date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[manual]})}];
 const validate=(event:any)=>route.PATCH(request({id:crId,action:'validate-event',eventId:event.id,events:[event],checked:true},'PATCH'));
 assert.equal((await validate(manual)).status,400);
 const confirmed={...manual,reclassementNRConfirmed:true};
 const preview=await (await route.POST(request({id:crId,date:'2026-03-24',events:[confirmed]}))).json();
 assert.equal(preview.events[0].state,'ready');assert.equal(preview.events[0].after.nr,200);
 const saved=await validate(confirmed);assert.equal(saved.status,200,JSON.stringify(await saved.clone().json()));
 const stored=JSON.parse(m.rows[0].detail).events[0];
 assert.equal(stored.reclassementNRConfirmed,true);assert.equal(stored.approved,true);
 assert.equal(stored.recordedAfter.gf,10);assert.equal(stored.recordedAfter.nr,200);
 const reopened=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();
 assert.equal(reopened.events[0].reclassementNRConfirmed,true);
 }

 {
 // A later NR award must be individually validated, stored and reread, not merely given a documentary reference.
 const retro={id:'retroactive-proof',name:'TEST ALICE',agentId:'A12345',kind:'reclassement',effective:'2025-03-01',gfDelta:1,gfBefore:9,gfAfter:10,nrBefore:200,nrAfter:200,reclassementNRConfirmed:true,page:1,selected:true,approved:true};
 const increment={id:'following-nr',name:'TEST ALICE',agentId:'A12345',kind:'avancement',effective:'2026-02-01',gfBefore:10,nrBefore:200,nrAfter:205,nrSteps:1,page:2,selected:true};
 m.rows=[{id:rdId,name:'ODJ rétroactif fictif.pdf',date:'2026-04-05',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[retro]})},{id:crId,name:'ODJ suivant fictif.pdf',date:'2026-04-12',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[increment]})}];
 const untouched=structuredClone(m.rows[0]);
 const p=await (await route.POST(request({id:crId,date:'2026-04-12',events:[increment]}))).json();
 assert.equal(p.events[0].state,'ready');assert.equal(p.events[0].before.gf,10);assert.equal(p.events[0].after.nr,205);
 const r=await route.PATCH(request({id:crId,action:'validate-event',eventId:increment.id,events:[increment],checked:true},'PATCH'));
 assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).pending,0);
 const stored=JSON.parse(m.rows[1].detail).events[0];
 assert.equal(stored.approved,true);assert.equal(stored.recordedBefore.gf,10);assert.equal(stored.recordedBefore.nr,200);assert.equal(stored.recordedAfter.gf,10);assert.equal(stored.recordedAfter.nr,205);
 assert.deepEqual(m.rows[0],untouched);
 const reopened=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();
 assert.equal(reopened.events[0].approved,true);assert.equal(reopened.events[0].recordedAfter.nr,205);
 }

 {
 // The actual individual-validation route must store and reload a nomination's ODJ reference.
 const person={name:'EXEMPLE ARRIVANTE',agentId:'Z00009'};
 const candidate={...person,id:'new-candidate',page:1,kind:'nomination',candidacy:true,selected:true,effective:'',reference:'26-00008.01',agency:'AGENCE FICTIVE',job:'EMPLOI FICTIF',gfBefore:10,nrBefore:155};
 const appointment={...person,id:'new-appointment',page:2,kind:'nomination',selected:true,effective:'2026-08-01',reference:candidate.reference,agency:candidate.agency,job:candidate.job,gfDelta:0};
 m.identities=[{name:person.name,nni:person.agentId,source:'rup-fiction',date:'2026-09-30'}];
 m.rows=[{id:crId,name:'ODJ fictif.pdf',date:'2026-06-15',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',candidateVersion:1,events:[candidate]})},{id:rdId,name:'RD fictif.pdf',date:'2026-06-15',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',events:[appointment]})}];
 const untouched=structuredClone(m.rows[0]);
 const preview=await (await route.POST(request({id:rdId,date:'2026-06-15',events:[appointment]}))).json();
 assert.equal(preview.events[0].state,'ready');assert.equal(preview.events[0].after.nr,155);assert.ok(preview.events[0].nominationReference);
 const candidatePreview=await (await route.POST(request({id:crId,date:'2026-06-15',events:[candidate]}))).json();assert.equal(candidatePreview.events[0].state,'ready');
 const response=await route.PATCH(request({id:rdId,action:'validate-event',eventId:appointment.id,events:[appointment],checked:true},'PATCH'));
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 const stored=JSON.parse(m.rows[1].detail).events[0];assert.equal(stored.approved,true);assert.equal(stored.recordedBefore.gf,10);assert.equal(stored.recordedAfter.nr,155);assert.equal(stored.nominationReference.cr.id,crId);assert.deepEqual(m.rows[0],untouched);
 const reopened=await (await route.GET(new Request('https://fixture.test/api/csp?id='+rdId,{headers}))).json();assert.equal(reopened.events[0].nominationReference.nni,person.agentId);
 const readAgain=await (await route.POST(request({id:rdId,date:'2026-06-15',events:reopened.events}))).json();assert.equal(readAgain.events[0].state,'validated');assert.equal(readAgain.events[0].after.nr,155);
 m.identities=[];
 }

 {
 // A completed ODJ makes the short RD read as already treated; GET never writes a second approval.
 const complete={id:'complete-reclassification',name:'TEST ALICE',agentId:'A12345',kind:'reclassement',effective:'2026-02-01',gfBefore:9,gfAfter:10,nrBefore:200,nrAfter:210,gfDelta:1,page:1,selected:true,approved:true,recordedBefore:{gf:9,nr:200},recordedAfter:{gf:10,nr:210,agency:'AMTC'}};
 const incomplete={id:'short-reclassification',name:complete.name,agentId:complete.agentId,kind:'reclassement',effective:complete.effective,page:1,selected:true,agency:'AMTC 1'};
 m.rows=[{id:crId,name:'ODJ fictif.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',perEventValidation:true,events:[complete]})},{id:rdId,name:'RD fictif.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',perEventValidation:true,events:[incomplete]})}];
 const unchanged=structuredClone(m.rows);
 const result=await (await route.GET(new Request('https://fixture.test/api/csp?id='+rdId,{headers}))).json();
 assert.equal(result.meta.pending,0);assert.equal(result.events[0].approved,true);assert.equal(result.events[0].acknowledgedByDocument.id,crId);assert.equal(result.events[0].recordedAfter.nr,210);assert.deepEqual(m.rows,unchanged);
 const listing=await (await route.GET(new Request('https://fixture.test/api/csp',{headers}))).json();assert.equal(listing.total,1);
 assert.equal((await route.PATCH(request({id:crId,action:'disable'},'PATCH'))).status,200);
 const reopened=await (await route.GET(new Request('https://fixture.test/api/csp?id='+rdId,{headers}))).json();assert.equal(reopened.meta.pending,1);assert.equal(reopened.events[0].approved,undefined);
 }

 {
 // Complete ODJ facts prepare an unvalidated short RD and survive individual publication and reread.
 const full={id:'full-draft',name:'TEST ALICE',agentId:'A12345',kind:'reclassement',effective:'2026-02-01',page:1,selected:true,gfBefore:9,gfAfter:10,nrBefore:200,nrAfter:210,gfDelta:1};
 const short={id:'short-draft',name:full.name,kind:'reclassement',effective:full.effective,page:1,selected:true,agency:'AMTC 1'};
 m.rows=[{id:crId,name:'ODJ fictif.pdf',date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'cr',candidateVersion:1,events:[full]})},{id:rdId,name:'RD fictif.pdf',date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',events:[short]})}];
 const unchanged=structuredClone(m.rows);
 const p=await (await route.POST(request({id:rdId,date:'2026-03-24',events:[short]}))).json();assert.equal(p.events[0].state,'ready');assert.equal(p.events[0].gfDelta,1);assert.equal(p.events[0].after.nr,210);assert.deepEqual(m.rows,unchanged);
 const r=await route.PATCH(request({id:rdId,action:'validate-event',eventId:short.id,events:[short],checked:true},'PATCH'));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));
 const stored=JSON.parse(m.rows[1].detail).events[0];assert.equal(stored.approved,true);assert.equal(stored.recordedAfter.gf,10);assert.equal(stored.recordedAfter.nr,210);assert.equal(stored.reclassementReference.cr.id,crId);assert.deepEqual(m.rows[0],unchanged[0]);
 const reopened=await (await route.GET(new Request('https://fixture.test/api/csp?id='+rdId,{headers}))).json();assert.equal(reopened.events[0].reclassementReference.gfDelta,1);
 const odj=await (await route.GET(new Request('https://fixture.test/api/csp?id='+crId,{headers}))).json();assert.equal(odj.events[0].acknowledgedByDocument.id,rdId);
 }

 {
 // Re-read only failed pages, preserve published decisions, and keep unread coverage explicit.
 const existing={id:'existing-read',name:'TEST ALICE',agentId:'A12345',kind:'avancement',effective:'2026-01-01',nrSteps:1,page:1,selected:true,approved:true,recordedBefore:{gf:9,nr:200},recordedAfter:{gf:9,nr:205},note:'Annotation conservée'};
 const report={page:6,section:'avancement',status:'unsupported',count:0,note:'En-tête non reconnu.'};
 const recovered={id:'recovered',name:'TEST ALICE',agentId:'A12345',kind:'avancement',effective:'2026-02-01',nrSteps:1,page:6,selected:true,approved:true};
 m.rows=[{id:rdId,name:'RD fictif.pdf',date:'2026-03-24',status:'validated',count:1,detail:JSON.stringify({kind:'csp',documentType:'rd',perEventValidation:true,events:[existing],reports:[report]})}];
 const result=await route.PATCH(request({id:rdId,action:'recover-pages',events:[recovered],reports:[{...report,status:'read',count:1}]},'PATCH'));
 assert.equal(result.status,200,JSON.stringify(await result.clone().json()));assert.equal((await result.json()).added,1);
 const detail=JSON.parse(m.rows[0].detail);assert.deepEqual(detail.events[0],existing);assert.equal(detail.events[1].approved,undefined);assert.equal(m.rows[0].status,'validated');
 const opened=await (await route.GET(new Request('https://fixture.test/api/csp?id='+rdId,{headers}))).json();assert.equal(opened.meta.pending,1);assert.equal(opened.meta.unreadPages,0);
 assert.equal((await route.PATCH(request({id:rdId,action:'recover-pages',events:[recovered],reports:[report]},'PATCH','viewer'))).status,403);
 }

});

