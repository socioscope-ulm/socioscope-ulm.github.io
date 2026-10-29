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
 const names=new Map<string,Set<string>>();
 for(const e of pending){const key=cspNameKey(e.name),ids=names.get(key)||new Set<string>();ids.add(e.agentId||pendingAdmissionId(e));names.set(key,ids);}
 const identities=[...data.records.filter(r=>r.nni).map(r=>({name:r.name,nni:r.nni!,agency:r.agency})),...(data.cspIdentities||[])];
 const aliases=new Map<string,string>();
 for(const e of pending){
  const key=cspNameKey(e.name),matches=identities.filter(i=>cspNameKey(i.name)===key),ids=new Set(matches.map(i=>i.nni));
  if(names.get(key)?.size!==1||ids.size!==1)continue;
  // A different documented agency can indicate a homonym; keep the provisional
  // record for review instead of merging on a name alone.
  if(e.agency&&matches.every(i=>i.agency&&normalName(i.agency)!==normalName(e.agency)))continue;
  aliases.set(e.agentId||pendingAdmissionId(e),[...ids][0]);
 }
 return imports.map(i=>({...i,events:i.events.map(e=>{const nni=aliases.get(e.agentId||pendingAdmissionId(e));return isPendingAdmission(e)&&nni?{...e,agentId:nni,identityPending:false}:e;})}));
}
