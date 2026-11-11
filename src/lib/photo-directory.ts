import {normalizeNNI} from './agents';
import type {PhotoAgent} from './photo-match';

export type PhotoDirectoryRow={agentId?:string;name?:string;agency?:string};
export type PhotoDirectoryLink={agent:string;kind:string;target?:string|null};
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

