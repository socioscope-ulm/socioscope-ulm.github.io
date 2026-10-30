import {normalName,normalizeNNI} from './agents.ts';
import {cspNameKey} from './csp-rup.ts';
import type {AgentData} from './agents.ts';
import type {CspEvent,CspImport} from './csp.ts';

// This key is an internal reference, never a NNI. The same documented arrival
// in two documents shares a key; different entry dates remain distinct.
export function pendingAdmissionId(e:Pick<CspEvent,'name'|'effective'|'agency'|'job'>){
 const name=cspNameKey(e.name),identity=[name,normalName(e.agency),normalName(e.job)].join('|');let hash=2166136261;for(const c of identity)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 return 'pending-csp-'+name.replaceAll(' ','_').slice(0,50)+'-'+hash.toString(16)+'-'+e.effective;
}
export function isPendingAdmission(e:CspEvent){return (e.kind==='admission'||e.kind==='nomination')&&e.newAgent===true&&e.identityPending===true&&!normalizeNNI(e.agentId);}

// Reconciliation is derived from active evidence. Stored approvals and their
// original audit trail stay intact; disabling a RUP removes its identity proof.
export function resolvePendingAdmissions(data:AgentData,imports:CspImport[]):CspImport[]{
 const pending=imports.filter(i=>i.status==='validated').flatMap(i=>i.events.filter(isPendingAdmission));
 if(!pending.length)return imports;
 const keys=new Map<string,string>();const nameKey=(name:string)=>{let key=keys.get(name);if(key===undefined){key=cspNameKey(name);keys.set(name,key);}return key;};
 const names=new Map<string,Set<string>>();
 for(const e of pending){const key=nameKey(e.name),ids=names.get(key)||new Set<string>();ids.add(e.agentId||pendingAdmissionId(e));names.set(key,ids);}
 // Resolve all pending arrivals in one pass, rather than normalizing the
 // entire annual history again for each provisional admission.
 const identities=new Map<string,{nni:string;agency?:string}[]>();
 const add=(name:string,nni:string,agency?:string)=>{const key=nameKey(name);if(!names.has(key))return;const rows=identities.get(key)||[];rows.push({nni,agency});identities.set(key,rows);};
 for(const row of data.records)if(row.nni)add(row.name,row.nni,row.agency);
 for(const row of data.cspIdentities||[])add(row.name,row.nni,row.agency);
 const aliases=new Map<string,string>();
 for(const e of pending){
  const key=nameKey(e.name),matches=identities.get(key)||[],ids=new Set(matches.map(i=>i.nni));
  if(names.get(key)?.size!==1||ids.size!==1)continue;
  // A different documented agency can indicate a homonym; keep the provisional
  // record for review instead of merging on a name alone.
  if(e.agency&&matches.every(i=>i.agency&&normalName(i.agency)!==normalName(e.agency)))continue;
  aliases.set(e.agentId||pendingAdmissionId(e),[...ids][0]);
 }
 return imports.map(i=>({...i,events:i.events.map(e=>{const nni=aliases.get(e.agentId||pendingAdmissionId(e));return isPendingAdmission(e)&&nni?{...e,agentId:nni,identityPending:false}:e;})}));
}
