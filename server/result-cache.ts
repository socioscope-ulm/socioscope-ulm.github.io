export type CacheSnapshot={revision:string;enabled:boolean;payload:string|null;contentType:string|null};
export interface ResultStore{
 read(key:string):Promise<CacheSnapshot>;
 claim(key:string,revision:string,owner:string):Promise<boolean>;
 write(key:string,revision:string,owner:string,payload:string,contentType:string):Promise<void>;
 release(key:string,owner:string):Promise<void>;
}

export function cacheableAgentRead(method:string,path:string){
 return method==='GET'&&(path==='/api/agents'||/^\/api\/agents\/[^/]+$/.test(path)&&!['import','decision','files'].includes(path.split('/').at(-1)!));
}

export async function resultCacheKey(namespace:string,path:string,query:string,scope:string){
 const params=new URLSearchParams(query);params.sort();
 const bytes=new TextEncoder().encode(JSON.stringify([namespace,scope,path,params.toString()]));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}

// The caller MUST authenticate the session and current membership before this
// function. Both user ID and current role are part of scope. No HTTP auth state
// is cached. This module intentionally has no dependency on historical files.
export function createCachedRead(store:ResultStore,namespace:string,options:{sleep?:(ms:number)=>Promise<void>;pollDelays?:number[];report?:(status:string)=>void;maxBytes?:number}={}){
 const sleep=options.sleep||((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
 const report=options.report||(()=>{});
 const mark=(r:Response,status:string)=>{report(status);const h=new Headers(r.headers);h.set('X-Socioscope-Cache',status);h.set('Cache-Control','no-store');return new Response(r.body,{status:r.status,headers:h});};
 return async(request:Request,path:string,scope:string,compute:()=>Promise<Response>):Promise<Response>=>{
  if(!cacheableAgentRead(request.method,path))return compute();
  const key=await resultCacheKey(namespace,path,new URL(request.url).search,scope);
  const owner=crypto.randomUUID();let snapshot:CacheSnapshot;let owns=false;
  const hit=(s:CacheSnapshot)=>s.enabled&&s.payload!==null?mark(new Response(s.payload,{headers:{'Content-Type':s.contentType||'application/json'}}),'HIT'):null;
  try{
   snapshot=await store.read(key);
  }catch{return mark(await compute(),'BYPASS');}
  if(!snapshot.enabled)return mark(await compute(),'DISABLED');
  try{
   const cached=hit(snapshot);if(cached)return cached;
   owns=await store.claim(key,snapshot.revision,owner);
   if(!owns){
    for(const delay of options.pollDelays||[80,160,250,400,600,800]){
     await sleep(delay);snapshot=await store.read(key);
     if(!snapshot.enabled)break;
     const cached=hit(snapshot);if(cached)return cached;
     owns=await store.claim(key,snapshot.revision,owner);if(owns)break;
    }
   }
  }catch{return mark(await compute(),'BYPASS');}
  if(!owns)return mark(await compute(),'BUSY');
  let response:Response;
  try{response=await compute();}catch(error){await store.release(key,owner).catch(()=>{});throw error;}
  try{
   const contentType=response.headers.get('content-type')||'';
   if(response.status===200&&contentType.includes('application/json')){
    const payload=await response.clone().text();
    // Store exactly the original bytes, avoiding JSONB numeric/ordering changes.
    if(new TextEncoder().encode(payload).byteLength<=(options.maxBytes??2*1024*1024)){
     await store.write(key,snapshot!.revision,owner,payload,contentType);
    }
   }
  }catch{report('STORE_ERROR');}
  finally{await store.release(key,owner).catch(()=>{});}
  return mark(response,'MISS');
 };
}
