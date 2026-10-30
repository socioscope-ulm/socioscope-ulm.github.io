import {cspNameKey} from './csp-rup.ts';
import type {AgentData,AgentRecord} from './agents.ts';
import type {CspEvent,CspImport} from './csp.ts';

type Index={byName:Map<string,Set<string>>;byId:Map<string,AgentRecord[]>};
// Validation previews and their isolated publication check share one immutable
// record array. Index it once, retaining every homonym and every historical row.
const indexes=new WeakMap<AgentRecord[],Index>();
function index(records:AgentRecord[]):Index{
 const cached=indexes.get(records);if(cached)return cached;
 const byName=new Map<string,Set<string>>(),byId=new Map<string,AgentRecord[]>(),keys=new Map<string,string>();
 for(const row of records){
  const rows=byId.get(row.agentId)||[];rows.push(row);byId.set(row.agentId,rows);
  if(!row.nni)continue;
  let key=keys.get(row.name);if(key===undefined){key=cspNameKey(row.name);keys.set(row.name,key);}
  const ids=byName.get(key)||new Set<string>();ids.add(row.agentId);byName.set(key,ids);
 }
 const result={byName,byId};indexes.set(records,result);return result;
}

export function scopeCspPreparation(data:AgentData,events:CspEvent[],prior:CspImport[]){
 const names=new Set(events.map(e=>cspNameKey(e.name))),ids=new Set(events.map(e=>e.agentId).filter((id):id is string=>!!id));
 const refs=index(data.records);
 for(const name of names)for(const id of refs.byName.get(name)||[])ids.add(id);
 const identities=(data.cspIdentities||[]).filter(i=>names.has(cspNameKey(i.name))||ids.has(i.nni));
 for(const i of identities)ids.add(i.nni);
 const records=[...ids].flatMap(id=>refs.byId.get(id)||[]);
 // Keep sources unchanged: an absent person must not change which annual
 // photograph is the reference or turn a partial file into a complete one.
 return {data:{...data,records,cspIdentities:identities},prior:prior.map(d=>({...d,events:d.events.filter(e=>ids.has(e.agentId||'')||names.has(cspNameKey(e.name)))}))};
}
