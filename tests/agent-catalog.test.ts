import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentCatalogLoader} from '../src/lib/agent-catalog.ts';

test('concurrent catalog consumers share one request but receive independent data',async()=>{
 let calls=0;let finish!:(data:any)=>void;
 const load=createAgentCatalogLoader(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
 const first=load(),second=load();await Promise.resolve();assert.equal(calls,1);
 finish({sources:[{id:'one'}]});const [a,b]=await Promise.all([first,second]);
 a.sources[0].id='changed';assert.equal(b.sources[0].id,'one');
});

test('completed catalogs are not retained and a failed read can be retried',async()=>{
 let calls=0;
 const load=createAgentCatalogLoader(async()=>{calls++;if(calls===1)throw Error('Unavailable');return {revision:calls};});
 const a=load(),b=load();await assert.rejects(a,/Unavailable/);await assert.rejects(b,/Unavailable/);assert.equal(calls,1);
 assert.deepEqual(await load(),{revision:2});assert.deepEqual(await load(),{revision:3});
});
