import postgres from 'npm:postgres@3.4.7';
import {createObjectCache} from './object-cache';
import {createCompressedJSONReader} from './compressed-objects';
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:3,idle_timeout:20,connect_timeout:15,connection:{search_path:'socioscope,public'}});
export const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'))[0] as string;
export const projectURL=Deno.env.get('SUPABASE_URL')!;
function statement(sqlText:string,values:any[]=[],client:any=sql){
 let index=0;const query=sqlText.replace(/\?/g,()=>'$'+(++index));
 const run=async<T=any>()=>{const result=await client.unsafe(query,values);return {results:Array.from(result) as T[],meta:{changes:result.count||0}};};
 return {sqlText,values,bind:(...args:any[])=>statement(sqlText,args,client),all:<T=any>()=>run<T>(),first:async<T=any>():Promise<T|null>=>((await run<T>()).results[0]??null),run};
}
export const db={prepare:(s:string)=>statement(s),batch:async(items:any[])=>await sql.begin(async tx=>{const results=[];for(const item of items)results.push(await statement(item.sqlText,item.values,tx).run());return results;})};
export async function storageFetch(key:string,init?:RequestInit){return await fetch(projectURL+'/storage/v1/object/socioscope-private/'+key.split('/').map(encodeURIComponent).join('/'),{...init,headers:{apikey:serviceKey,authorization:'Bearer '+serviceKey,...init?.headers}});}
export const jsonStorageFetch=createCompressedJSONReader({
 async metadata(key){
  const row=await db.prepare(`SELECT version::text AS version,updated_at::text AS updated,metadata->>'size' AS size,metadata->>'mimetype' AS mime
   FROM storage.objects WHERE bucket_id='socioscope-private' AND name=?`).bind(key).first<any>();
  return row?.version&&row.updated?{revision:JSON.stringify([row.version,row.updated,row.size]),size:Number(row.size),contentType:row.mime||'application/json'}:null;
 },
 read:storageFetch,
 async write(key,bytes){
  const response=await storageFetch(key,{method:'POST',headers:{'x-upsert':'true','content-type':'application/octet-stream'},body:bytes});
  if(!response.ok)throw Error('Copie compressée indisponible.');
 }
});
const recordCache=createObjectCache(async key=>{
 const r=await jsonStorageFetch(key);if(r.status===404||r.status===400)return null;if(!r.ok)throw Error('Lecture du fichier impossible.');
 return {bytes:await r.arrayBuffer(),contentType:r.headers.get('content-type')||'application/octet-stream'};
});
export const bucket={
 async put(key:string,value:any,options?:any){recordCache.invalidate(key);try{const r=await storageFetch(key,{method:'POST',headers:{'x-upsert':'true','content-type':options?.httpMetadata?.contentType||'application/octet-stream'},body:value});if(!r.ok)throw Error('Enregistrement du fichier impossible.');}finally{recordCache.invalidate(key);}},
 async get(key:string){const stored=await recordCache.get(key);if(!stored)return null;const {bytes,contentType}=stored;return {body:bytes,json:async<T>()=>JSON.parse(new TextDecoder().decode(bytes)) as T,writeHttpMetadata:(h:Headers)=>h.set('Content-Type',contentType)};}
};
export const env={DB:db,BUCKET:bucket};
