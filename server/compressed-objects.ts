import {gzipSync,gunzipSync} from 'node:zlib';

export type JSONRevision={revision:string;size:number;contentType:string};
const maxRawBytes=16*1024*1024;
const maxCacheBytes=4*1024*1024;
const headerLength=132; // SCJ1 + revision SHA-256 + uncompressed SHA-256.
const encoder=new TextEncoder(),decoder=new TextDecoder();
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export const compressibleJSON=(key:string)=>/^data\/(agents-seed|rup-seed|seed)\.json$/.test(key)||/^agents\/[^/]+\/records\.json$/.test(key);

// Derived files stay in the same private bucket. One fixed cache path per
// original prevents accumulation on overwrites. Revision and content hashes
// reject stale, damaged or concurrently overwritten copies.
export function createCompressedJSONReader(io:{
 metadata:(key:string)=>Promise<JSONRevision|null>;
 read:(key:string)=>Promise<Response>;
 write:(key:string,bytes:Uint8Array)=>Promise<void>;
}){
 return async(key:string):Promise<Response>=>{
  if(!compressibleJSON(key))return io.read(key);
  let meta:JSONRevision|null=null,cacheKey='',revisionHash='';
  try{
   meta=await io.metadata(key);
   if(!meta||!Number.isSafeInteger(meta.size)||meta.size<1024||meta.size>maxRawBytes)return io.read(key);
   cacheKey='derived-json/v1/'+await digest(encoder.encode(key))+'.bin';
   revisionHash=await digest(encoder.encode(meta.revision));
   const stored=await io.read(cacheKey);
   if(stored.ok){
    const length=Number(stored.headers.get('content-length'));
    if(!Number.isFinite(length)||length<=maxCacheBytes){
     const bytes=new Uint8Array(await stored.arrayBuffer());
     if(bytes.byteLength>headerLength&&bytes.byteLength<=maxCacheBytes&&decoder.decode(bytes.subarray(0,68))==='SCJ1'+revisionHash){
      const original=gunzipSync(bytes.subarray(headerLength),{maxOutputLength:meta.size});
      if(original.byteLength===meta.size&&await digest(original)===decoder.decode(bytes.subarray(68,headerLength))){
       return new Response(original,{headers:{'Content-Type':meta.contentType,'Content-Length':String(meta.size)}});
      }
     }
    }
   }
  }catch{ /* Unavailable metadata or invalid cache: use the original. */ }
  const original=await io.read(key);
  if(!meta||!cacheKey||!revisionHash||!original.ok)return original;
  // The original is read exactly once. A failed or unhelpful cache write
  // cannot change a successful response or trigger a second download.
  const bytes=new Uint8Array(await original.arrayBuffer());
  try{
   if(bytes.byteLength===meta.size){
    const compressed=gzipSync(bytes,{level:1});
    if(compressed.byteLength+headerLength<=maxCacheBytes&&compressed.byteLength+headerLength<bytes.byteLength*0.9){
     const current=await io.metadata(key);
     if(current?.revision===meta.revision&&current.size===meta.size){
      const header=encoder.encode('SCJ1'+revisionHash+await digest(bytes));
      const payload=new Uint8Array(header.byteLength+compressed.byteLength);
      payload.set(header);payload.set(compressed,header.byteLength);
      await io.write(cacheKey,payload);
     }
    }
   }
  }catch{ /* Compression is optional; preserve the canonical bytes. */ }
  return new Response(bytes,{status:original.status,headers:original.headers});
 };
}
