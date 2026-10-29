import {normalName} from './agents.ts';
import {cspNameKey} from './csp-rup.ts';
import {validDate} from './csp.ts';
import type {AgentData} from './agents.ts';
import type {CspEvent,CspImport,CspNominationReference} from './csp.ts';

// ODJ values are documentary starting facts. They never approve a candidature,
// replace a conflicting annual salary, or invent an increase for an external agent.
export function nominationReferenceChecks(data:AgentData,events:CspEvent[],date:string,documents:CspImport[]){
 const references=new Map<string,CspNominationReference>(),problems=new Map<string,string>();
 const active=documents.filter(d=>d.date===date&&!d.status.startsWith('disabled'));
 const names=new Map<string,Set<string>>();
 for(const r of data.records)if(r.nni){const k=cspNameKey(r.name),ids=names.get(k)||new Set<string>();ids.add(r.agentId);names.set(k,ids);}
 for(const r of data.cspIdentities||[]){const k=cspNameKey(r.name),ids=names.get(k)||new Set<string>();ids.add(r.nni);names.set(k,ids);}
 for(const e of events){
  if(e.kind!=='nomination'||e.candidacy||!e.selected||e.approved||e.extractionIssue||!e.reference||!validDate(e.effective)||e.gfDelta===undefined||!e.agency||!e.job)continue;
  const k=cspNameKey(e.name),ids=names.get(k);if(ids?.size!==1)continue;
  const nni=[...ids][0];if(e.agentId&&e.agentId!==nni)continue;
  const rd=active.filter(d=>d.documentType!=='cr').flatMap(d=>d.events.filter(v=>!v.candidacy&&v.id===e.id&&v.selected&&v.kind==='nomination'&&v.reference===e.reference&&cspNameKey(v.name)===k).map(event=>({document:d,event})));
  if(rd.length!==1)continue;
  const candidates=active.filter(d=>d.documentType==='cr').flatMap(d=>d.events.filter(v=>v.candidacy&&v.selected&&!v.nonRetained&&!v.nonRetainedByRD&&v.reference===e.reference&&cspNameKey(v.name)===k).map(event=>({document:d,event})));
  if(!candidates.length)continue;
  if(candidates.some(({event:v})=>v.extractionIssue||v.agentId&&v.agentId!==nni||v.gfBefore===undefined||v.nrBefore===undefined||v.agency&&normalName(v.agency)!==normalName(e.agency)||v.job&&normalName(v.job)!==normalName(e.job))||new Set(candidates.map(({event:v})=>JSON.stringify([v.gfBefore,v.nrBefore]))).size!==1){
   problems.set(e.id,'Nomination : identité, destination ou GF/NR contradictoires ou incomplets dans les candidatures ODJ de cette séance.');continue;
  }
  const first=candidates[0],gf=first.event.gfBefore!,nr=first.event.nrBefore!;
  if(e.gfBefore!==undefined&&e.gfBefore!==gf||e.nrBefore!==undefined&&e.nrBefore!==nr){problems.set(e.id,'Nomination : les GF/NR avant du RD contredisent ceux du candidat dans l’ODJ.');continue;}
  const rup=(data.cspIdentities||[]).filter(r=>r.nni===nni&&cspNameKey(r.name)===k).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const proof=(v:typeof first)=>({id:v.document.id,name:v.document.name,eventId:v.event.id,page:v.event.page});
  references.set(e.id,{nni,gf,nr,effective:e.effective,meetingDate:date,reference:e.reference,gfDelta:e.gfDelta,cr:proof(first),rd:proof(rd[0]),...(rup?{rup:{source:rup.source,date:rup.date}}:{}),arrivalConfirmed:!!rup&&rup.date>=e.effective});
 }
 return {references,problems};
}

export function nominationReferenceSupported(e:CspEvent,documents:CspImport[]):boolean{
 const r=e.nominationReference;if(!r)return true;
 if(e.kind!=='nomination'||e.candidacy||r.nni!==e.agentId||r.effective!==e.effective||r.reference!==e.reference||r.gfDelta!==e.gfDelta||r.arrivalConfirmed&&(!r.rup||r.rup.date<e.effective))return false;
 const get=(proof:CspNominationReference['cr'],cr:boolean)=>{
  const d=documents.find(d=>d.id===proof.id&&d.date===r.meetingDate&&!d.status.startsWith('disabled')&&(d.documentType==='cr')===cr);
  return d&&(d.evidenceEvents||d.events).find(v=>v.id===proof.eventId&&v.selected&&!v.extractionIssue&&v.kind==='nomination'&&!!v.candidacy===cr&&v.reference===r.reference&&cspNameKey(v.name)===cspNameKey(e.name)&&(!v.agentId||v.agentId===r.nni));
 };
 const cr=get(r.cr,true),rd=get(r.rd,false);
 return !!cr&&!!rd&&!cr.nonRetained&&!cr.nonRetainedByRD&&cr.gfBefore===r.gf&&cr.nrBefore===r.nr&&rd.effective===r.effective&&rd.gfDelta===r.gfDelta&&[cr,rd].every(v=>(v.gfBefore===undefined||v.gfBefore===r.gf)&&(v.nrBefore===undefined||v.nrBefore===r.nr)&&(!v.agency||normalName(v.agency)===normalName(e.agency))&&(!v.job||normalName(v.job)===normalName(e.job)))&&['nrAfter','nrSteps','nrConfirmed'].every(k=>(rd as any)[k]===(e as any)[k]);
}
