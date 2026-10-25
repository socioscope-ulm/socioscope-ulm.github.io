import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createCompressedJSONReader,compressibleJSON} from '../server/compressed-objects.ts';

const key='data/agents-seed.json';
function fixture(){
 const state={revision:'v1',text:JSON.stringify({records:Array.from({length:300},(_,i)=>({id:i,name:'Fixture répétée',gf:8,nr:100}))}),originalReads:0,cacheReads:0,writes:0,metadataCalls:0,metadataFails:false,cacheFails:false,writeFails:false,status:200,changeDuringRead:false};
 const stored=new Map<string,Uint8Array>();
 const io={
  async metadata(){state.metadataCalls++;if(state.metadataFails)throw Error('Database unavailable');return {revision:state.revision,size:Buffer.byteLength(state.text),contentType:'application/json'};},
  async read(path:string){
   if(path.startsWith('derived-json/')){state.cacheReads++;if(state.cacheFails)throw Error('Cache unavailable');const bytes=stored.get(path);return bytes?new Response(bytes,{headers:{'Content-Length':String(bytes.length)}}):new Response(null,{status:404});}
   state.originalReads++;if(state.changeDuringRead)state.revision='v2';return new Response(state.text,{status:state.status,headers:{'Content-Type':'application/json'}});
  },
  async write(path:string,bytes:Uint8Array){state.writes++;if(state.writeFails)throw Error('Write unavailable');stored.set(path,bytes.slice());}
 };
 return {state,stored,io,read:createCompressedJSONReader(io)};
}

test('a fresh worker reuses compressed bytes and returns the exact original UTF-8 JSON',async()=>{
 const {state,stored,io,read}=fixture();
 assert.equal(await (await read(key)).text(),state.text);assert.equal(state.originalReads,1);assert.equal(state.writes,1);
 const bytes=[...stored.values()][0];assert.ok(bytes.length<Buffer.byteLength(state.text)/4);
 const response=await createCompressedJSONReader(io)(key);
 assert.equal(await response.text(),state.text);assert.equal(response.headers.get('content-type'),'application/json');assert.equal(state.originalReads,1);assert.equal(state.writes,1);
});

test('an overwritten original invalidates the copy even when its byte length is unchanged',async()=>{
 const {state,stored,read}=fixture();await read(key);
 state.revision='v2';state.text=state.text.replaceAll('Fixture','Updated');
 assert.equal(await (await read(key)).text(),state.text);assert.equal(state.originalReads,2);assert.equal(stored.size,1);
 await read(key);assert.equal(state.originalReads,2);
});

test('an original changed during download cannot populate a cache with the old revision',async()=>{
 const {state,stored,read}=fixture();state.changeDuringRead=true;
 assert.equal(await (await read(key)).text(),state.text);assert.equal(stored.size,0);assert.equal(state.writes,0);
});

test('damaged gzip bytes and a mismatched content digest fall back to the original',async()=>{
 for(const index of [70,-1]){
  const {state,stored,read}=fixture();await read(key);
  const cacheKey=[...stored.keys()][0],bytes=stored.get(cacheKey)!;bytes[index<0?bytes.length-1:index]^=255;
  assert.equal(await (await read(key)).text(),state.text);assert.equal(state.originalReads,2);
 }
});

test('a wrong revision header cannot be mistaken for a current original',async()=>{
 const {state,stored,read}=fixture();await read(key);
 [...stored.values()][0][8]^=1;
 assert.equal(await (await read(key)).text(),state.text);assert.equal(state.originalReads,2);
});

test('an expanded payload beyond the canonical size is rejected',async()=>{
 const {state,read}=fixture();await read(key);
 state.text='x'.repeat(2000);
 assert.equal(await (await read(key)).text(),state.text);assert.equal(state.originalReads,2);
});

test('database, cache and write failures preserve the original bytes without duplicate downloads',async()=>{
 for(const field of ['metadataFails','cacheFails','writeFails'] as const){
  const {state,read}=fixture();state[field]=true;
  assert.equal(await (await read(key)).text(),state.text);assert.equal(state.originalReads,1);
 }
});

test('failed original responses are returned unchanged and never cached',async()=>{
 const {state,stored,read}=fixture();state.status=503;
 assert.equal((await read(key)).status,503);assert.equal(state.originalReads,1);assert.equal(stored.size,0);
});

test('original documents and arbitrary JSON paths bypass compression and metadata lookup',async()=>{
 const {state,read}=fixture();
 for(const path of ['sources/document.pdf','agents/example/original.xlsx','imports/example/extraction.json','derived-json/v1/example.bin','data/other.json']){
  assert.equal(compressibleJSON(path),false);await read(path);
 }
 assert.equal(state.metadataCalls,0);assert.equal(state.writes,0);
 for(const path of [key,'data/rup-seed.json','data/seed.json','agents/rup-imp-example/records.json'])assert.equal(compressibleJSON(path),true);
});

test('very small, oversized and noncompressible JSON are not copied',async()=>{
 const small=fixture();small.state.text='{}';await small.read(key);assert.equal(small.state.writes,0);
 const large=fixture();large.io.metadata=async()=>({revision:'v1',size:17*1024*1024,contentType:'application/json'});await createCompressedJSONReader(large.io)(key);assert.equal(large.state.writes,0);
 const noise=fixture();const bytes=randomBytes(4096);
 noise.io.metadata=async()=>({revision:'v1',size:bytes.length,contentType:'application/json'});
 const baseRead=noise.io.read;
 noise.io.read=async path=>path.startsWith('derived-json/')?baseRead(path):new Response(bytes);
 await createCompressedJSONReader(noise.io)(key);assert.equal(noise.state.writes,0);
});
