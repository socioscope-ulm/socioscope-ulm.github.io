import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
test('CSP API validates roles, previews without writes, saves one PDF, rejects incomplete decisions and protects concurrent changes',async()=>{
 const m={rows:[] as any[],puts:[] as string[],queries:[] as string[]};(globalThis as any).__cspAPI=m;
 const b=await build({entryPoints:[new URL('../src/app/api/csp/route.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'csp-fixture',setup(build){
  build.onResolve({filter:/\/(store|agents-store)(\.ts)?$/},a=>({path:a.path.split('/').at(-1)!.replace('.ts',''),namespace:'csp-test'}));
  build.onLoad({filter:/.*/,namespace:'csp-test'},a=>({resolveDir:new URL('..',import.meta.url).pathname,contents:a.path==='agents-store'?`
   import {accessError} from '${new URL('../src/lib/access.ts',import.meta.url).pathname}';
   export async function agentAuth(req,write=false){const error=accessError(req,write);if(error)throw Object.assign(Error((await error.json()).error),{status:error.status});}
   export const agentError=e=>Response.json({error:e.message},{status:e.status||500});
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
});
