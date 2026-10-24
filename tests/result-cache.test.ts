import test from 'node:test';
import assert from 'node:assert/strict';
import {createCachedRead,resultCacheKey,cacheableAgentRead} from '../server/result-cache.ts';
import type {ResultStore} from '../server/result-cache.ts';

function fixture(){
 let revision='1',enabled=true,reads=0;
 const entries=new Map<string,{revision:string;owner:string|null;payload:string|null;contentType:string|null}>();
 const store:ResultStore={
  async read(key){reads++;const c=entries.get(key);return {revision,enabled,payload:c?.revision===revision?c.payload:null,contentType:c?.contentType||null};},
  async claim(key,r,owner){const c=entries.get(key);if(!enabled||r!==revision||c?.revision===r)return false;entries.set(key,{revision:r,owner,payload:null,contentType:null});return true;},
  async write(key,r,owner,payload,contentType){const c=entries.get(key);if(enabled&&r===revision&&c?.owner===owner)entries.set(key,{revision:r,owner:null,payload,contentType});},
  async release(key,owner){if(entries.get(key)?.owner===owner)entries.delete(key);}
 };
 return {store,entries,bump:()=>revision=String(Number(revision)+1),disable:()=>enabled=false,get reads(){return reads;}};
}
const req=(query='view=analysis&college=cadres&sex=F',method='GET')=>new Request('https://socioscope-ulm.github.io/api/agents?'+query,{method});
const cached=(store:ResultStore,extra={})=>createCachedRead(store,'test-build',{pollDelays:[],...extra});

test('a new worker reuses the exact computed result without reading historical files',async()=>{
 const f=fixture();let downloads=0;
 const original='{"total":2,"nrMean":202.5,"pay":123.4500}';
 const compute=async()=>{downloads++;return new Response(original,{headers:{'Content-Type':'application/json'}});};
 assert.equal(await (await cached(f.store)(req(),'/api/agents','user:admin',compute)).text(),original);
 const response=await cached(f.store)(req(),'/api/agents','user:admin',compute);
 assert.equal(response.headers.get('X-Socioscope-Cache'),'HIT');assert.equal(await response.text(),original);assert.equal(downloads,1);
});

test('cache keys preserve each filter, source, page, user, role and deployment',async()=>{
 const key=(query:string,scope='user:admin',namespace='build')=>resultCacheKey(namespace,'/api/agents',query,scope);
 const a=await key('view=analysis&sex=F&college=cadres&source=2025');
 assert.equal(a,await key('source=2025&college=cadres&sex=F&view=analysis'));
 for(const query of ['view=analysis&sex=H&college=cadres&source=2025','view=analysis&sex=F&college=maitrise&source=2025','view=analysis&sex=F&college=cadres&source=2024','view=analysis&sex=F&college=cadres&source=2025&offset=100'])assert.notEqual(a,await key(query));
 assert.notEqual(a,await key('view=analysis&sex=F&college=cadres&source=2025','other:admin'));
 assert.notEqual(a,await key('view=analysis&sex=F&college=cadres&source=2025','user:viewer'));
 assert.notEqual(a,await key('view=analysis&sex=F&college=cadres&source=2025','user:admin','new-build'));
});

test('import or decision invalidation takes effect on the next request',async()=>{
 const f=fixture();let n=0;const compute=async()=>Response.json({total:++n});const read=cached(f.store);
 assert.deepEqual(await (await read(req(),'/api/agents','u',compute)).json(),{total:1});
 f.bump();assert.deepEqual(await (await read(req(),'/api/agents','u',compute)).json(),{total:2});
 assert.deepEqual(await (await cached(f.store)(req(),'/api/agents','u',compute)).json(),{total:2});assert.equal(n,2);
});

test('a calculation spanning a modification is never stored as a current result',async()=>{
 const f=fixture();const read=cached(f.store);let n=0;
 await read(req(),'/api/agents','u',async()=>{n++;f.bump();return Response.json({old:true});});
 assert.equal(f.entries.size,0);
 assert.deepEqual(await (await read(req(),'/api/agents','u',async()=>{n++;return Response.json({fresh:true});})).json(),{fresh:true});assert.equal(n,2);
});

test('concurrent workers share one calculation through a short database lease',async()=>{
 const f=fixture();let computations=0;let finish!:()=>void;
 const ready=new Promise<void>(r=>finish=r);const compute=async()=>{computations++;await ready;return Response.json({total:4});};
 const first=cached(f.store)(req(),'/api/agents','u',compute);
 // A separate cache instance models a second cold worker.
 const second=cached(f.store,{pollDelays:[0],sleep:async()=>{finish();await first;}})(req(),'/api/agents','u',compute);
 const [a,b]=await Promise.all([first,second]);assert.equal(computations,1);assert.equal(await a.text(),await b.text());
 assert.equal(b.headers.get('X-Socioscope-Cache'),'HIT');
});

test('an unavailable cache falls back to a normal calculation once',async()=>{
 const f=fixture();f.store.read=async()=>{throw Error('unavailable');};let n=0;
 const r=await cached(f.store)(req(),'/api/agents','u',async()=>{n++;return Response.json({ok:true});});
 assert.equal(r.status,200);assert.equal(r.headers.get('X-Socioscope-Cache'),'BYPASS');assert.equal(n,1);
});

test('a cache write failure does not hide a successful calculation',async()=>{
 const f=fixture();f.store.write=async()=>{throw Error('full');};
 const r=await cached(f.store)(req(),'/api/agents','u',async()=>Response.json({ok:true}));
 assert.deepEqual(await r.json(),{ok:true});assert.equal(f.entries.size,0);
});

test('disabled cache bypasses saved data and propagates calculation errors without retrying',async()=>{
 const f=fixture();f.disable();let n=0;
 await assert.rejects(cached(f.store)(req(),'/api/agents','u',async()=>{n++;throw Error('calculation');}));assert.equal(n,1);
});

test('error responses, CSV exports and oversized results are never saved',async()=>{
 for(const compute of [async()=>Response.json({error:'absent'},{status:404}),async()=>new Response('agent;heures\n',{headers:{'Content-Type':'text/csv'}}),async()=>Response.json({payload:'x'.repeat(100)})]){
  const f=fixture();let n=0;const run=async()=>{n++;return compute();};const read=cached(f.store,{maxBytes:20});
  await read(req(),'/api/agents','u',run);await read(req(),'/api/agents','u',run);assert.equal(n,2);assert.equal(f.entries.size,0);
 }
});

test('a failed calculation releases its lease so a retry can proceed',async()=>{
 const f=fixture();const read=cached(f.store);
 await assert.rejects(read(req(),'/api/agents','u',async()=>{throw Error('failure');}));assert.equal(f.entries.size,0);
 assert.equal((await read(req(),'/api/agents','u',async()=>Response.json({ok:true}))).status,200);
});

test('mutations, admin imports, files and sessions cannot enter the result cache',async()=>{
 for(const [method,path]of [['POST','/api/agents'],['GET','/api/agents/import'],['GET','/api/agents/decision'],['GET','/api/agents/files/a'],['GET','/api/session'],['GET','/api/members'],['GET','/sources/a'],['HEAD','/api/agents']])assert.equal(cacheableAgentRead(method,path),false);
 assert.equal(cacheableAgentRead('GET','/api/agents/C74243'),true);
 const f=fixture();await cached(f.store)(req('','POST'),'/api/agents','u',async()=>Response.json({ok:true}));assert.equal(f.reads,0);
});

test('a stalled worker cannot block a screen indefinitely',async()=>{
 const f=fixture();f.store.claim=async()=>false;let n=0;
 const r=await cached(f.store)(req(),'/api/agents','u',async()=>{n++;return Response.json({ok:true});});assert.equal(n,1);assert.equal(r.headers.get('X-Socioscope-Cache'),'BUSY');
});
