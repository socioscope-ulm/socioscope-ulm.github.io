import {cspNRSteps,validDate} from './csp.ts';
import {cspNameKey} from './csp-rup.ts';
import type {CspEvent,CspImport,CspSalaryChecks,CspSalaryReference} from './csp.ts';
import type {AgentData} from './agents.ts';

// Drafts may supply documentary facts, never an unapproved salary movement.
// The caller replaces the current document with the submitted events first.
export function salaryReferenceChecks(data:AgentData,events:CspEvent[],date:string,documents:CspImport[]):CspSalaryChecks{
 const references=new Map<string,CspSalaryReference>(),problems=new Map<string,string>();
 if(!events.some(e=>e.kind==='mesure'&&e.selected&&!e.approved)||!data.cspIdentities?.length)return {references,problems};
 const identities=new Map<string,NonNullable<AgentData['cspIdentities']>>();
 const names=new Map<string,Set<string>>();
 for(const row of data.records)if(row.nni){const key=cspNameKey(row.name),ids=names.get(key)||new Set<string>();ids.add(row.agentId);names.set(key,ids);}
 for(const identity of data.cspIdentities||[]){
  const key=cspNameKey(identity.name),rows=identities.get(key)||[];rows.push(identity);identities.set(key,rows);
  const ids=names.get(key)||new Set<string>();ids.add(identity.nni);names.set(key,ids);
 }
 const active=documents.filter(d=>d.date===date&&!d.status.startsWith('disabled'));
 for(const e of events){
  if(e.kind!=='mesure'||e.candidacy||!e.selected||e.approved||e.extractionIssue||!validDate(e.effective))continue;
  const name=cspNameKey(e.name),ids=names.get(name),rup=identities.get(name)||[];
  if(ids?.size!==1||!rup.length||new Set(rup.map(r=>r.nni)).size!==1)continue;
  const nni=rup[0].nni;if(!ids.has(nni)||e.agentId&&e.agentId!==nni)continue;
  const matching=active.flatMap(d=>d.events.filter(v=>v.selected&&!v.candidacy&&v.kind==='mesure'&&cspNameKey(v.name)===name&&v.effective===e.effective).map(v=>({d,e:v})));
  const cr=matching.filter(v=>v.d.documentType==='cr'),rd=matching.filter(v=>v.d.documentType!=='cr');
  if(!cr.length||!rd.length)continue;
  const complete=cr.filter(({e:v})=>v.gfBefore!==undefined&&v.nrBefore!==undefined&&v.nrAfter!==undefined);
  if(!complete.length)continue;
  const first=complete[0],gf=first.e.gfBefore!,nr=first.e.nrBefore!,nrAfter=first.e.nrAfter!,steps=cspNRSteps(first.e);
  const conflict=[...matching.map(v=>v.e),e].some(v=>v.extractionIssue||v.agentId&&v.agentId!==nni||cspNRSteps(v)!==steps||(v.gfDelta??0)!==0||v.gfBefore!==undefined&&v.gfBefore!==gf||v.gfAfter!==undefined&&v.gfAfter!==gf||v.nrBefore!==undefined&&v.nrBefore!==nr||v.nrAfter!==undefined&&v.nrAfter!==nrAfter);
  if(!steps||nrAfter!==nr+steps*5||conflict){problems.set(e.id,'Mesure salariale : valeurs ODJ/RD contradictoires ou progression NR incohérente. Vérifier les documents.');continue;}
  const proof=(v:typeof first)=>({id:v.d.id,name:v.d.name,eventId:v.e.id,page:v.e.page});
  references.set(e.id,{nni,gf,nr,nrAfter,steps,effective:e.effective,agency:rup[0].agency,rup:{source:rup[0].source,date:rup[0].date},cr:proof(first),rd:proof(rd[0])});
 }
 return {references,problems};
}
