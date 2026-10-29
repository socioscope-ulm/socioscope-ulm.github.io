import {cspNameKey} from './csp-rup.ts';
import {validDate} from './csp.ts';
import type {CspEvent,CspImport,CspReclassementReference} from './csp.ts';
const fields=['gfBefore','gfAfter','nrBefore','nrAfter','gfDelta'] as const;
const same=(v:CspEvent,e:CspEvent)=>v.selected&&!v.candidacy&&v.kind==='reclassement'&&!!e.agentId&&(!v.agentId||v.agentId===e.agentId)&&cspNameKey(v.name)===cspNameKey(e.name)&&v.effective===e.effective;
// Draft documentary facts can prepare a decision; they never approve it.
export function reclassementReferenceChecks(events:CspEvent[],date:string,documents:CspImport[]){
 const references=new Map<string,CspReclassementReference>(),problems=new Map<string,string>();
 const active=documents.filter(d=>d.date===date&&!d.status.startsWith('disabled'));
 for(const e of events){
  if(e.kind!=='reclassement'||!e.selected||e.approved||e.extractionIssue||!e.agentId||!validDate(e.effective))continue;
  const rd=active.filter(d=>d.documentType!=='cr').flatMap(d=>d.events.filter(v=>v.id===e.id&&same(v,e)).map(event=>({document:d,event})));
  if(rd.length!==1)continue;
  const candidates=active.filter(d=>d.documentType==='cr').flatMap(d=>d.events.filter(v=>same(v,e)).map(event=>({document:d,event})));
  if(!candidates.length)continue;
  const complete=candidates.filter(({event:v})=>!v.extractionIssue&&v.gfBefore!==undefined&&v.gfAfter!==undefined&&v.nrBefore!==undefined&&v.nrAfter!==undefined&&v.gfDelta!==undefined&&v.gfDelta>0&&v.gfAfter===v.gfBefore+v.gfDelta&&v.nrAfter===v.nrBefore+v.gfDelta*10);
  if(complete.length!==candidates.length||new Set(complete.map(({event:v})=>JSON.stringify(fields.map(k=>v[k])))).size!==1){problems.set(e.id,'Reclassement : valeurs avant/après incomplètes, contradictoires ou non conformes à la règle dans les ODJ de cette séance.');continue;}
  const first=complete[0],v=first.event;
  if(fields.some(k=>e[k]!==undefined&&e[k]!==v[k])||e.nrSteps!==undefined&&e.nrSteps!==v.gfDelta!*2){problems.set(e.id,'Reclassement : les valeurs explicites du RD contredisent celles de l’ODJ.');continue;}
  const proof=(r:typeof first)=>({id:r.document.id,name:r.document.name,eventId:r.event.id,page:r.event.page});
  references.set(e.id,{nni:e.agentId,effective:e.effective,meetingDate:date,gfBefore:v.gfBefore!,gfAfter:v.gfAfter!,nrBefore:v.nrBefore!,nrAfter:v.nrAfter!,gfDelta:v.gfDelta!,cr:proof(first),rd:proof(rd[0])});
 }
 return {references,problems};
}
export function reclassementEvent<T extends CspEvent>(e:T):T{
 const r=e.reclassementReference;if(!r||e.kind!=='reclassement'||r.nni!==e.agentId||r.effective!==e.effective)return e;
 return {...e,...Object.fromEntries(fields.map(k=>[k,e[k]??r[k]]))};
}
export function reclassementReferenceSupported(e:CspEvent,documents:CspImport[]):boolean{
 const r=e.reclassementReference;if(!r)return true;
 if(e.kind!=='reclassement'||r.nni!==e.agentId||r.effective!==e.effective||r.gfDelta<1||r.gfAfter!==r.gfBefore+r.gfDelta||r.nrAfter!==r.nrBefore+r.gfDelta*10)return false;
 const get=(proof:CspReclassementReference['cr'],cr:boolean)=>{
  const d=documents.find(d=>d.id===proof.id&&d.date===r.meetingDate&&!d.status.startsWith('disabled')&&(d.documentType==='cr')===cr);
  return d&&(d.evidenceEvents||d.events).find(v=>v.id===proof.eventId&&same(v,e)&&!v.extractionIssue);
 };
 const cr=get(r.cr,true),rd=get(r.rd,false);
 return !!cr&&!!rd&&fields.every(k=>cr[k]===r[k]&&(rd[k]===undefined||rd[k]===r[k])&&(e[k]===undefined||e[k]===r[k]))&&(e.nrSteps===undefined||e.nrSteps===r.gfDelta*2);
}
