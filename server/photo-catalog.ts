import {agentBase} from '../src/lib/agents-store';
import {normalizeNNI} from '../src/lib/agents';
import {loadSeeds} from './seeds';
import {db,bucket} from './storage';
import type {PhotoAgent} from '../src/lib/photo-match';

// Photos need identity, name and agency only. Never replay CSP career movements,
// RUP histories or payroll for every image uploaded or manually assigned.
type CatalogRow={agentId?:string;name?:string;agency?:string};
type ImportRow={id:string;detail:any};
type LinkRow={agent:string;kind:string;target?:string|null};
const detailOf=(value:any)=>typeof value==='string'?JSON.parse(value||'{}'):value||{};

export function assemblePhotoCatalog(
 base:CatalogRow[],imports:{detail:any;records?:CatalogRow[]}[],links:LinkRow[]
):PhotoAgent[]{
 const aliases=new Map<string,string>();
 for(const decision of links){
  if(decision.kind==='link'&&decision.target)aliases.set(decision.agent,decision.target);
  else if(decision.kind==='unlink')aliases.delete(decision.agent);
 }
 const catalog=new Map<string,PhotoAgent>();
 const put=(row:CatalogRow,overwrite=true)=>{
  if(!row.agentId||!row.name?.trim())return;
  const id=aliases.get(row.agentId)||row.agentId;
  if(overwrite||!catalog.has(id))catalog.set(id,{id,name:row.name,agency:row.agency||undefined});
 };
 base.forEach(row=>put(row));
 for(const item of imports){
  const detail=detailOf(item.detail);
  if(detail.kind==='rup')continue;
  if(detail.kind==='csp'){
   // A confirmed arrival with a permanent professional identity may be absent
   // from annual files. Never infer identities from a candidature or PDF name.
   for(const event of detail.events||[]){
    if(event.newAgent!==true||event.selected===false||event.approved!==true||
       event.candidacy||!event.agentId||normalizeNNI(event.agentId)!==event.agentId)continue;
    put({agentId:event.agentId,name:event.name,agency:event.agency},false);
   }
  }else for(const row of item.records||[])put(row);
 }
 return [...catalog.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
}

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
export const photoCatalog=createPhotoCatalogLoader(async()=>{
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
 return assemblePhotoCatalog(agentBase().records,details,decisions.results);
});
