import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('real handler checks session, membership and current role before any cached result',async()=>{
 const mock={enabled:true,role:'admin',cacheCalls:0,seedLoads:0,authOk:true};
 (globalThis as any).__cacheAuthTest=mock;
 const result=await build({entryPoints:[new URL('../server/index.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',plugins:[{
  name:'authenticated-cache-test',setup(b){
   b.onResolve({filter:/\/(storage|private-cache|seeds)(\.ts)?$/},args=>({path:args.path.split('/').at(-1)!.replace('.ts',''),namespace:'cache-test'}));
   b.onLoad({filter:/.*/,namespace:'cache-test'},args=>({contents:args.path==='storage'?`
    export const db={prepare(){return {bind(){return {async first(){const m=globalThis.__cacheAuthTest;return {email:'fixture@example.test',role:m.role,enabled:m.enabled,user_id:'fixture-user'};}};}};}};
    export const usage={record(){},async flush(){},async control(){return {suspended:false};}};
    export const bucket={};export const projectURL='https://fixture.supabase.co';export const serviceKey='fixture';export const env={DB:db,BUCKET:bucket};
   `:args.path==='private-cache'?`
    export async function cachedAgentRead(req,path,scope,compute){globalThis.__cacheAuthTest.cacheCalls++;return Response.json({cached:true,scope});}
   `:`
    export let seed={},packedText='',rupSeedText='';export async function loadSeeds(){globalThis.__cacheAuthTest.seedLoads++;throw Error('Historical data must not load on a hit');}
   `}));
  }
 }]});
 const priorDeno=(globalThis as any).Deno,priorFetch=globalThis.fetch;
 try{
  (globalThis as any).Deno={env:{get:()=>undefined},serve:()=>{}};
  globalThis.fetch=async()=>mock.authOk?Response.json({id:'fixture-user',email:'fixture@example.test',email_confirmed_at:'2026-01-01'}):new Response(null,{status:401});
  const {handler}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  const call=(headers={})=>handler(new Request('https://fixture.supabase.co/functions/v1/socioscope-api/api/agents',{headers}));
  assert.equal((await call()).status,401);assert.equal(mock.cacheCalls,0);
  mock.authOk=false;assert.equal((await call({Authorization:'Bearer fixture'})).status,401);assert.equal(mock.cacheCalls,0);
  mock.authOk=true;mock.enabled=false;assert.equal((await call({Authorization:'Bearer fixture'})).status,403);assert.equal(mock.cacheCalls,0);
  mock.enabled=true;
  const admin=await call({Authorization:'Bearer fixture'});assert.equal(admin.status,200);assert.equal((await admin.json()).scope,'fixture-user:admin');
  mock.role='viewer';const viewer=await call({Authorization:'Bearer fixture','x-socioscope-role':'admin'});assert.equal((await viewer.json()).scope,'fixture-user:viewer');
  assert.equal(mock.seedLoads,0);assert.equal(mock.cacheCalls,2);
 }finally{globalThis.fetch=priorFetch;(globalThis as any).Deno=priorDeno;delete (globalThis as any).__cacheAuthTest;}
});
