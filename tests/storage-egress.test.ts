import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeedLoader,seedsForPath} from '../server/seed-loader.ts';
import {createObjectCache} from '../server/object-cache.ts';

test('each API family loads only the historical data it uses',()=>{
 for(const path of ['/api/agents','/api/agents/C74243','/api/agents/decision','/api/agents/import/example'])assert.deepEqual(seedsForPath(path),['agents-seed','rup-seed']);
 assert.deepEqual(seedsForPath('/api/agents/import'),['agents-seed']);
 assert.deepEqual(seedsForPath('/api/rup'),['rup-seed']);
 for(const path of ['/api/data','/api/rows','/api/import','/api/review/example'])assert.deepEqual(seedsForPath(path),['seed']);
 for(const path of ['/api/payroll','/api/payroll/import','/api/payroll/import/example','/api/payroll/files/example','/api/agents/files/example','/api/files/example','/api/session','/unknown'])assert.deepEqual(seedsForPath(path),[]);
});

test('parallel seed loads deduplicate; failed file retries preserve successful files',async()=>{
 const reads:string[]=[];const published=new Map();let fail=true;
 const load=createSeedLoader(async key=>{reads.push(key);if(key.includes('rup-seed')&&fail)throw Error('offline');return key;},(name,text)=>published.set(name,text));
 await assert.rejects(load(['agents-seed','rup-seed']));
 fail=false;
 await Promise.all([load(['agents-seed','rup-seed']),load(['agents-seed','rup-seed'])]);
 assert.equal(reads.filter(k=>k.includes('agents-seed')).length,1);
 assert.equal(reads.filter(k=>k.includes('rup-seed')).length,2);
 assert.equal(published.size,2);
 await load([]);assert.equal(reads.length,3);
});

const object=(text:string)=>({bytes:new TextEncoder().encode(text).buffer,contentType:'application/json'});
test('records share download bytes but each JSON consumer gets independent data',async()=>{
 let reads=0;const cache=createObjectCache(async()=>{reads++;return object('[{"nni":"C74243"}]');});
 const key='agents/rup-imp-example/records.json';
 const [a,b]=await Promise.all([cache.get(key),cache.get(key)]);
 assert.equal(reads,1);assert.deepEqual(a,b);
 const decode=(v:any)=>JSON.parse(new TextDecoder().decode(v.bytes));
 const mutated=decode(a);mutated[0].nni='changed';assert.equal(decode(await cache.get(key))[0].nni,'C74243');assert.equal(reads,1);
 cache.invalidate(key);await cache.get(key);assert.equal(reads,2);
});

test('cache expires, evicts by byte budget, and bypasses original files',async()=>{
 let time=0;let reads=0;const cache=createObjectCache(async()=>{reads++;return object('1234');},8,100,()=>time);
 const a='agents/a/records.json',b='agents/b/records.json',c='agents/c/records.json';
 await cache.get(a);await cache.get(b);await cache.get(a);assert.equal(reads,2);
 await cache.get(c);await cache.get(b);assert.equal(reads,4);
 time=100;await cache.get(b);assert.equal(reads,5);
 await cache.get('agents/a/original');await cache.get('agents/a/original');assert.equal(reads,7);
});

test('missing, oversized or failed objects do not poison the cache',async()=>{
 let reads=0;const cache=createObjectCache(async()=>{reads++;if(reads===1)throw Error('offline');if(reads===2)return null;return object('oversized');},2);
 const key='agents/a/records.json';await assert.rejects(cache.get(key));assert.equal(await cache.get(key),null);await cache.get(key);await cache.get(key);assert.equal(reads,4);
});

test('invalidating an inflight read prevents it from repopulating the cache',async()=>{
 let resolve!:(value:any)=>void;let reads=0;
 const cache=createObjectCache(async()=>{reads++;return reads===1?await new Promise<any>(r=>resolve=r):object('new');});
 const key='agents/a/records.json';const old=cache.get(key);cache.invalidate(key);await cache.get(key);resolve(object('old'));await old;
 assert.equal(new TextDecoder().decode((await cache.get(key))!.bytes),'new');assert.equal(reads,2);
});
