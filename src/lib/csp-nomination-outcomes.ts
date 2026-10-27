import {cspNameKey} from './csp-rup.ts';
import {normalName} from './agents.ts';
import {validDate} from './csp.ts';
import type {CspEvent,CspAcknowledgement,CspNonRetentionProof} from './csp.ts';
type Document={id:string;name:string;date:string;status:string;detail:{documentType?:string;events?:CspEvent[];[key:string]:unknown};[key:string]:unknown};
const post=(date:string,reference:string)=>JSON.stringify([date,reference.trim()]);
const active=(d:Document)=>['review','validated'].includes(d.status);
const complete=(d:Document)=>d.status==='validated'&&!!d.detail.events?.some(e=>e.selected)&&d.detail.events.every(e=>!e.selected||!e.candidacy&&!e.extractionIssue&&validDate(e.effective)&&(!d.detail.perEventValidation||e.approved===true));
// This is a documentary disposition, never an approval or a career movement.
// Rebuild it on every read so that withdrawing/correcting the RD reopens the CR.
export function resolveNominationOutcomes<T extends Document>(rows:T[]):T[]{
 const nominations=new Map<string,{row:T;event:CspEvent}[]>();
 for(const row of rows)if(active(row)&&row.detail.documentType!=='cr'&&validDate(row.date))for(const event of row.detail.events||[]){
  if(event.kind!=='nomination'||event.candidacy||!event.selected||!event.reference)continue;
  const key=post(row.date,event.reference),group=nominations.get(key)||[];group.push({row,event});nominations.set(key,group);
 }
 return rows.map(row=>{
 const candidates=new Map<string,CspEvent[]>();
 for(const c of row.detail.events||[])if(c.candidacy&&c.reference){const key=post(cspNameKey(c.name),c.reference),group=candidates.get(key)||[];group.push(c);candidates.set(key,group);}
 return {...row,detail:{...row.detail,events:(row.detail.events||[]).map(original=>{
  const {nonRetainedByRD,...e}=original;
  if(!active(row)||row.detail.documentType!=='cr'||!e.candidacy||!e.selected||e.approved||e.nonRetained||e.extractionIssue||!e.reference?.trim())return e;
  const group=nominations.get(post(row.date,e.reference))||[];
  if(!group.length){
   const sources=rows.filter(d=>d.id!==row.id&&active(d)&&d.detail.documentType!=='cr'&&d.date===row.date&&validDate(d.date));
   // Absence is evidence only after every active RD of this meeting is fully
   // validated. A missing post reference or an unselected nomination on this
   // post remains ambiguous and must not be interpreted as a vacant post.
   if(!sources.length||sources.some(d=>!complete(d)||(d.detail.events||[]).some(v=>v.kind==='nomination'&&!v.candidacy&&(!v.reference?.trim()||v.reference.trim()===e.reference!.trim()))))return e;
   const source=sources[0];const proof:CspNonRetentionProof={id:source.id,name:source.name,documentType:'rd',reason:'unfilled-post'};
   return {...e,nonRetainedByRD:proof};
  }
  if(group.some(m=>m.event.extractionIssue||!validDate(m.event.effective)||!cspNameKey(m.event.name)))return e;
  const signature=(v:CspEvent)=>JSON.stringify([cspNameKey(v.name),v.agentId,v.effective,v.gfDelta,v.gfBefore,v.gfAfter,v.nrBefore,v.nrAfter,v.nrSteps,v.nrConfirmed,normalName(v.agency),normalName(v.job)]);
  // Multiple nominees on the same post are legitimate. Contradictions are
  // different versions of one nominee, or different complete lists across RDs.
  const byName=new Map<string,Set<string>>(),byDocument=new Map<string,Set<string>>();
  for(const m of group){const name=cspNameKey(m.event.name),value=signature(m.event),versions=byName.get(name)||new Set<string>(),list=byDocument.get(m.row.id)||new Set<string>();versions.add(value);list.add(value);byName.set(name,versions);byDocument.set(m.row.id,list);}
  if([...byName.values()].some(versions=>versions.size!==1)||new Set([...byDocument.values()].map(list=>JSON.stringify([...list].sort()))).size!==1)return e;
  // Require every nominee to be present on this CR post. Never infer rejection
  // merely from the absence of an appointment for the current candidate.
  for(const {event:winner} of group){
   const winners=candidates.get(post(cspNameKey(winner.name),e.reference))||[];
   if(!winners.length||winners.some(c=>!c.selected||c.nonRetained||c.extractionIssue||c.agentId&&winner.agentId&&c.agentId!==winner.agentId)||new Set(winners.map(c=>c.agentId).filter(Boolean)).size>1)return e;
   if(cspNameKey(e.name)===cspNameKey(winner.name)||e.agentId&&winner.agentId&&e.agentId===winner.agentId)return e;
   for(const field of ['agency','job'] as const)if(e[field]&&winner[field]&&normalName(e[field])!==normalName(winner[field]))return e;
  }
  const match=group[0],winner=match.event;
  const proof:CspAcknowledgement={id:match.row.id,name:match.row.name,eventId:winner.id,page:winner.page,documentType:'rd'};
  return {...e,nonRetainedByRD:proof};
 })}};});
}
