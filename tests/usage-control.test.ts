import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createUsageService,recordStorageTransfer} from '../server/usage.ts';

test('usage batches bytes atomically, distinguishes unknown transfers and retries failed writes',async()=>{
 const batches:any[]=[];let fail=true;
 const db={prepare(){return {bind(value:string){return {async run(){if(fail)throw Error('Transient');batches.push(JSON.parse(value));}};}};}};
 const service=createUsageService(db,()=>new Date('2026-10-25T12:00:00Z'));
 service.record('api',100);service.record('api',50);service.record('api');
 recordStorageTransfer(service,new Response(null,{headers:{'cf-cache-status':'HIT','content-length':'200'}}));
 recordStorageTransfer(service,new Response(null,{headers:{'cf-cache-status':'MISS','content-length':'20'}}));
 recordStorageTransfer(service,new Response(null));
 await service.flush();assert.equal(batches.length,0);
 fail=false;service.record('api',5);await service.flush();assert.equal(batches.length,1);
 const row=(bucket:string)=>batches[0].find((r:any)=>r.bucket===bucket);
 assert.deepEqual(row('api'),{day:'2026-10-25',bucket:'api',bytes:155,requests:4,unmeasured:1});
 assert.equal(row('storage_cached').bytes,200);assert.equal(row('storage_uncached').bytes,20);assert.equal(row('storage_unknown').unmeasured,1);
 await service.flush();assert.equal(batches.length,1);
});

test('a concurrent flush cannot lose new counts or double-count the previous batch',async()=>{
 const batches:any[]=[];let release!:()=>void;
 const db={prepare(){return {bind(value:string){return {async run(){batches.push(JSON.parse(value));if(batches.length===1)await new Promise<void>(r=>{release=r;});}};}};}};
 const service=createUsageService(db);
 service.record('api',10);const first=service.flush();service.record('api',20);await service.flush();release();await first;
 assert.equal(batches.reduce((n,b)=>n+b[0].bytes,0),30);
 await service.flush();assert.equal(batches.length,2);
});

test('real handler suspends every viewer route before cache or historical reads and always exempts the verified administrator',async()=>{
 const mock={enabled:true,role:'viewer',suspended:true,cacheCalls:0,seedLoads:0,authOk:true};
 (globalThis as any).__usageGateTest=mock;
 const result=await build({entryPoints:[new URL('../server/index.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'usage-auth-test',setup(b){
  b.onResolve({filter:/\/(storage|private-cache|seeds)(\.ts)?$/},a=>({path:a.path.split('/').at(-1)!.replace('.ts',''),namespace:'usage-auth'}));
  b.onLoad({filter:/.*/,namespace:'usage-auth'},a=>({contents:a.path==='storage'?`
   const m=globalThis.__usageGateTest;
   export const db={prepare(){return {bind(){return {async first(){return {email:'fixture@example.test',role:m.role,enabled:m.enabled,user_id:'fixture-user'};}};}};}};
   export const usage={record(){},async flush(){},async control(){return {suspended:m.suspended};},async setSuspended(value){m.suspended=value;return {suspended:value};},async report(){return {settings:{suspended:m.suspended},rows:[]};}};
   export const bucket={async get(){throw Error('Blocked file must not load');}};export const projectURL='https://fixture.supabase.co';export const serviceKey='fixture';export const env={DB:db,BUCKET:bucket};
  `:a.path==='private-cache'?`
   export async function cachedAgentRead(req,path,scope,compute){globalThis.__usageGateTest.cacheCalls++;return Response.json({cached:true,scope});}
  `:`export let seed={},packedText='',rupSeedText='';export async function loadSeeds(){globalThis.__usageGateTest.seedLoads++;throw Error('Historical read forbidden');}`}));
 }}]});
 const priorDeno=(globalThis as any).Deno,priorFetch=globalThis.fetch;
 try{
  (globalThis as any).Deno={env:{get:()=>undefined},serve:()=>{}};
  globalThis.fetch=async()=>mock.authOk?Response.json({id:'fixture-user',email:'fixture@example.test',email_confirmed_at:'2026-01-01'}):new Response(null,{status:401});
  const {handler}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  const call=(path:string,init:any={})=>handler(new Request('https://fixture.supabase.co/functions/v1/socioscope-api'+path,{...init,headers:{Authorization:'Bearer fixture',...init.headers}}));
  for(const path of ['/api/data','/api/agents?view=export','/api/agents/C12345','/api/agents/files/import','/api/files/original','/sources/private.pdf','/api/prime-settings']){
   const response=await call(path,{headers:{'x-socioscope-role':'admin'}});assert.equal(response.status,423,path);assert.equal((await response.json()).code,'CONSULTATION_SUSPENDED');
  }
  assert.equal(mock.cacheCalls,0);assert.equal(mock.seedLoads,0);
  const session=await call('/api/session');assert.equal((await session.json()).consultationSuspended,true);
  assert.equal((await call('/api/usage')).status,403);
  assert.equal((await call('/api/usage',{method:'PATCH',body:JSON.stringify({suspended:false})})).status,403);assert.equal(mock.suspended,true);
  mock.role='admin';
  assert.equal((await call('/api/agents')).status,200);assert.equal(mock.cacheCalls,1);
  assert.equal((await (await call('/api/session')).json()).consultationSuspended,false);
  assert.equal((await call('/api/usage')).status,200);
  assert.equal((await call('/api/usage',{method:'PATCH',body:JSON.stringify({suspended:'false'})})).status,400);
  assert.equal((await call('/api/usage',{method:'PATCH',body:JSON.stringify({suspended:false})})).status,200);
  mock.role='viewer';assert.equal((await call('/api/agents')).status,200);assert.equal(mock.cacheCalls,2);
  mock.enabled=false;assert.equal((await call('/api/session')).status,403);
  mock.enabled=true;mock.authOk=false;assert.equal((await call('/api/session')).status,401);
 }finally{globalThis.fetch=priorFetch;(globalThis as any).Deno=priorDeno;delete (globalThis as any).__usageGateTest;}
});
