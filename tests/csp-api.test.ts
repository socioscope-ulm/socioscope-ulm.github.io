import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
test('CSP API validates roles, previews without writes, saves one PDF, rejects incomplete decisions and protects concurrent changes',async()=>{
 const m={rows:[] as any[],puts:[] as string[],queries:[] as string[]};(globalThis as any).__cspAPI=m;
 const b=await build({entryPoints:[new URL('../src/app/api/csp/route.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'csp-fixture',setup(build){
  build.onResolve({filter:/\/(store|agents-store)(\.ts)?$/},a=>({path:a.path.split('/').at(-1)!.replace('.ts',''),namespace:'csp-test'}));
  build.onLoad({filter:/.*/,namespace:'csp-test'},a=>({resolveDir:new URL('..',import.meta.url).pathname,contents:a.path==='agents-store'?`
   import {accessError} from '${new URL('../src/lib/access.ts',import.meta.url).pathname}';
   export async function agentAuth(req,write=false){const error=accessError(req,write);if(error)throw Object.assign(Error((await error.json()).error),{status:error.status});}
   export const agentError=e=>Response.json({error:e.message},{status:e.status||500});
   export async function cspIdentityData(data){return {...data,cspIdentities:globalThis.__cspAPI.identities||[]};}
   export async function agentData(){return {cspImports:globalThis.__cspAPI.rows.map(r=>({...r,...JSON.parse(r.detail)})),data:{sources:[{id:'annual',primary:true,date:'2025-12-31',seniorityDate:'2025-12-31',label:'Annual'}],records:[{id:'one',agentId:'A12345',nni:'A12345',name:'TEST ALICE',source:'annual',row:1,gf:9,nr:200,agency:'AMTC'}],events:[],issues:[],updated:''}};}
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
 const e={id:'one',name:'TEST ALICE',kind:'nomination',effective:'2026-01-01',gfDelta:1,page:1,selected:true};
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
 // CR documents use the same workflow, persist their type and cannot approve
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

 // A duplicate is acknowledged without losing the original approved record.
 const prior={...m.rows[0],id:'csp-prior',status:'validated',detail:JSON.stringify({kind:'csp',events:[{...ready,approved:true}]})};
 m.rows=[prior,{id:individualId,date:'2026-03-24',status:'review',count:1,detail:JSON.stringify({kind:'csp',events:[ready]})}];
 response=await route.PATCH(request({id:individualId,action:'validate-event',eventId:ready.id,checked:true,events:[ready]},'PATCH'));assert.equal(response.status,200);assert.equal(JSON.parse(m.rows[1].detail).events[0].approved,true);

});
