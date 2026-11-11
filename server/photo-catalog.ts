import {agentBase} from '../src/lib/agents-store';
import {loadSeeds} from './seeds';
import {db,bucket} from './storage';
import type {PhotoAgent} from '../src/lib/photo-match';
import {assemblePhotoCatalog} from '../src/lib/photo-directory';

// Photos need identity, name and agency only. Never replay CSP career movements,
// RUP histories or payroll for every image uploaded or manually assigned.
type CatalogRow={agentId?:string;name?:string;agency?:string};
type ImportRow={id:string;detail:any};
type LinkRow={agent:string;kind:string;target?:string|null};
const detailOf=(value:any)=>typeof value==='string'?JSON.parse(value||'{}'):value||{};

// Reuse a read-only catalog for a short time in the same Edge worker.
// Failed reads are retried; updates to annual imports become visible promptly.
export function createPhotoCatalogLoader(read:()=>Promise<PhotoAgent[]>,ttl=30_000,now=Date.now){
 let saved:PhotoAgent[]|undefined,expires=0,pending:Promise<PhotoAgent[]>|undefined;
 return async()=>{
  if(saved&&now()<expires)return saved;
  if(!pending){
   const task=Promise.resolve().then(read);
   pending=task.then(value=>{saved=value;expires=now()+ttl;return value;})
    .finally(()=>{pending=undefined;});
  }
  return pending;
 };
}
// Share the small, non-sensitive agent directory across Edge isolates in the
// existing private result cache. Each request checks the database first, avoiding
// repeated downloads of multi-megabyte historical seed files on cold workers.
// Short expiry keeps newly validated imports and identity links fresh.
async function persistedCatalog():Promise<PhotoAgent[]|null>{
 const row=await db.prepare(`SELECT payload FROM socioscope.result_cache WHERE cache_key='photo-agent-directory-v1'
  AND expires_at>now() AND payload IS NOT NULL`).first<{payload:string}>();
 if(!row)return null;
 try{
  const value=JSON.parse(row.payload);
  return Array.isArray(value)&&value.every(a=>typeof a.id==='string'&&typeof a.name==='string')?value:null;
 }catch{return null;}
}
async function saveCatalog(value:PhotoAgent[]){
 await db.prepare(`INSERT INTO socioscope.result_cache(cache_key,revision,payload,content_type,expires_at,created_at)
  SELECT 'photo-agent-directory-v1',revision,?,'application/json',now()+interval '2 minutes',now()
  FROM socioscope.result_cache_state WHERE singleton=true
  ON CONFLICT(cache_key) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,
    content_type=excluded.content_type,expires_at=excluded.expires_at,created_at=excluded.created_at,
    lease_owner=NULL,lease_until=NULL`).bind(JSON.stringify(value)).run();
}
export const photoCatalog=createPhotoCatalogLoader(async()=>{
 const hit=await persistedCatalog().catch(()=>null);
 if(hit)return hit;
 await loadSeeds(['agents-seed']);
 const [imports,decisions]=await Promise.all([
  db.prepare("SELECT id,detail FROM agent_imports WHERE status='validated' ORDER BY date,created").all<ImportRow>(),
  db.prepare("SELECT agent,kind,target FROM agent_decisions WHERE kind IN ('link','unlink') ORDER BY created,id").all<LinkRow>()
 ]);
 const details:{detail:any;records?:CatalogRow[]}[]=[];
 for(const item of imports.results){
  const detail=detailOf(item.detail);
  if(detail.kind==='rup')continue;
  if(detail.kind==='csp'){details.push({detail});continue;}
  const object=await bucket.get('agents/'+item.id+'/records.json');
  if(object)details.push({detail,records:await object.json<CatalogRow[]>()});
 }
 const resolved=assemblePhotoCatalog(agentBase().records,details,decisions.results);
 await saveCatalog(resolved).catch(()=>{});
 return resolved;
});
