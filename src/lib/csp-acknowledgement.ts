import {reclassementEvent} from './csp-reclassement-reference.ts';
import {cumulativeNomination} from './csp-cumulative.ts';
import {resolveNominationOutcomes} from './csp-nomination-outcomes.ts';
import {cspNameKey} from './csp-rup.ts';
import {normalName} from './agents.ts';
import {cspExtractionIssue,cspKey,cspNRSteps,validDate} from './csp.ts';
import type {CspEvent,CspAcknowledgement} from './csp.ts';

type Document={id:string;name:string;date:string;status:string;detail:{documentType?:string;perEventValidation?:boolean;events?:CspEvent[];[key:string]:unknown};[key:string]:unknown};
const type=(row:Document)=>row.detail.documentType==='cr'?'cr':'rd';
const eligible=(e:CspEvent)=>e.selected&&!e.candidacy&&!cspExtractionIssue(e)&&!!e.agentId&&validDate(e.effective);
const key=(date:string,e:CspEvent)=>JSON.stringify([date,e.agentId,cspNameKey(e.name),e.kind,e.effective]);
const identity=(date:string,e:CspEvent)=>JSON.stringify([date,e.agentId,cspNameKey(e.name),e.kind]);
const acknowledgement=(e:CspEvent)=>e.acknowledgedByDocument||e.acknowledgedByRD;
const rdNameKey=(date:string,e:CspEvent)=>JSON.stringify([date,cspNameKey(e.name),e.kind]);
// Recognition of an ODJ by an already approved RD is display-only.
// The original ODJ row stays untouched, including its notes and audit trail.
function odjConfirmedByRd<T extends Document>(row:T,e:CspEvent,verified:Map<string,{row:T;event:CspEvent}[]>):CspEvent|undefined{
 if(type(row)!=='cr'||!['review','validated'].includes(row.status)||!e.selected||e.approved||cspExtractionIssue(e)||e.nonRetained||e.nonRetainedByRD)return;
 if(!e.candidacy&&e.kind!=='admission')return;
 const candidates=(verified.get(rdNameKey(row.date,e))||[]).filter(({event:rd})=>!e.candidacy||rd.reference===e.reference);
 // Conflicting or repeated approvals cannot silently establish a correspondence.
 if(candidates.length!==1)return;
 const {row:source,event:rd}=candidates[0];
 if(e.agentId&&e.agentId!==rd.agentId)return;
 const same=(field:'agency'|'job'|'team')=>!e[field]||!!rd[field]&&normalName(e[field]!)===normalName(rd[field]!);
 if(!same('agency')||!same('job')||!same('team'))return;
 if(e.candidacy){
  if(e.kind!=='nomination'||!e.reference||!validDate(rd.effective)||e.effective!==''&&e.effective!==rd.effective||e.gfBefore===undefined||e.nrBefore===undefined)return;
  const gfBefore=rd.gfBefore??rd.recordedBefore?.gf??(rd.gfDelta===0?rd.recordedAfter?.gf:undefined);
  const nrBefore=rd.nrBefore??rd.recordedBefore?.nr??(rd.gfDelta===0&&!cspNRSteps(rd)?rd.recordedAfter?.nr:undefined);
  if(gfBefore!==e.gfBefore||nrBefore!==e.nrBefore)return;
 }else{
  if(rd.kind!=='admission'||rd.newAgent!==true||!validDate(e.effective)||e.effective!==rd.effective||e.gfAfter===undefined||e.gfAfter!==(rd.gfAfter??rd.recordedAfter?.gf))return;
  if(e.nrAfter!==undefined&&e.nrAfter!==(rd.nrAfter??rd.recordedAfter?.nr))return;
  if(e.gfBefore!==undefined&&e.gfBefore!==(rd.gfBefore??rd.recordedBefore?.gf))return;
  if(e.nrBefore!==undefined&&e.nrBefore!==(rd.nrBefore??rd.recordedBefore?.nr))return;
 }
 const proof:CspAcknowledgement={id:source.id,eventId:rd.id,name:source.name,page:rd.page,documentType:'rd'};
 return {...e,approved:true,approvedAt:rd.approvedAt,recordedBefore:rd.recordedBefore,recordedAfter:rd.recordedAfter,acknowledgedByDocument:proof};
}

const clear=(e:CspEvent):CspEvent=>{
 if(!acknowledgement(e))return e;
 const {acknowledgedByDocument,acknowledgedByRD,approved,approvedAt,recordedBefore,recordedAfter,...pending}=e;return pending;
};
function facts(e:CspEvent){
 const gfBefore=e.gfBefore??e.recordedBefore?.gf,nrBefore=e.nrBefore??e.recordedBefore?.nr;
 const gfAfter=e.gfAfter??e.recordedAfter?.gf??(gfBefore!==undefined?gfBefore+(e.gfDelta||0):undefined);
 const steps=cspNRSteps(e);
 const nrAfter=e.nrAfter??e.recordedAfter?.nr??(nrBefore!==undefined?nrBefore+(e.kind==='reclassement'?(e.gfDelta||0)*10:(steps||0)*5):undefined);
 return {gfBefore,nrBefore,gfAfter,nrAfter};
}
function identical(target:CspEvent,source:CspEvent){
 target=reclassementEvent(target);source=reclassementEvent(source);
 const known=facts(source);
 // A short RD may omit the GF count. An already approved, fully documented
 // counterpart can establish this same decision, never another movement.
 const incompleteReclassement=target.kind==='reclassement'&&source.kind==='reclassement'&&target.gfDelta===undefined&&
  (source.gfDelta??0)>0&&known.gfBefore!==undefined&&known.gfAfter!==undefined&&known.nrBefore!==undefined&&known.nrAfter!==undefined&&
  known.gfAfter===known.gfBefore+source.gfDelta!&&known.nrAfter>=known.nrBefore&&(known.nrAfter-known.nrBefore)%5===0&&
  (source.reclassementNRConfirmed||known.nrAfter===known.nrBefore+source.gfDelta!*10)&&
  (source.nrSteps===undefined||source.nrSteps===(known.nrAfter-known.nrBefore)/5)&&
  (target.nrSteps===undefined||target.nrSteps===(known.nrAfter-known.nrBefore)/5);
 if(!incompleteReclassement&&(cspKey(target)!==cspKey(source)||(target.gfDelta??0)!==(source.gfDelta??0)))return false;
 if(['titularisation','mutation','admission'].includes(target.kind)&&cspNRSteps(target)!==cspNRSteps(source))return false;
 for(const field of ['gfBefore','nrBefore','gfAfter','nrAfter'] as const)if(target[field]!==undefined&&target[field]!==known[field])return false;
 for(const [field,part,key] of [['gfBefore','recordedBefore','gf'],['nrBefore','recordedBefore','nr'],['gfAfter','recordedAfter','gf'],['nrAfter','recordedAfter','nr']] as const){
  if(source[field]!==undefined&&source[part]?.[key]!==undefined&&source[field]!==source[part]![key])return false;
 }
 for(const field of ['agency','job','team','m3e','reference'] as const){
  // Location columns on a reclassement are observations, not destinations.
  if(target.kind==='reclassement'&&field!=='reference')continue;
  const proposed=target[field];if(!proposed)continue;
  const documented=source[field]??(field==='reference'?undefined:source.recordedAfter?.[field]);
  if(!documented||normalName(proposed)!==normalName(documented))return false;
 }
 if(target.kind!=='reclassement'&&target.location&&normalName(target.location)!==normalName(source.location))return false;
 if(target.nrConfirmed&&!source.nrConfirmed&&source.nrAfter===undefined)return false;
 return true;
}

// Recomputed from original approvals on every read. An acknowledgement can
// never approve another document or publish a second career movement.
export function acknowledgeCspDecisions<T extends Document>(rows:T[]):T[]{
 const confirmed=new Map<string,{row:T;event:CspEvent}[]>(),dates=new Map<string,Set<string>>(),verified=new Map<string,{row:T;event:CspEvent}[]>();
 for(const row of rows)if(row.status==='validated')for(const event of row.detail.events||[]){
  if(!eligible(event)||acknowledgement(event)||row.detail.perEventValidation&&!event.approved)continue;
  if(type(row)==='rd'){
   const k=rdNameKey(row.date,event),values=verified.get(k)||[];values.push({row,event});verified.set(k,values);
  }
  const k=key(row.date,event),matches=confirmed.get(k)||[];matches.push({row,event});confirmed.set(k,matches);
  const id=identity(row.date,event),values=dates.get(id)||new Set<string>();values.add(event.effective);dates.set(id,values);
 }
 return resolveNominationOutcomes(rows.map(row=>({...row,detail:{...row.detail,events:(row.detail.events||[]).map(original=>{
  const e=clear(original);
  const linked=odjConfirmedByRd(row,e,verified);
  if(linked)return linked;
  if(!['review','validated'].includes(row.status)||row.status==='validated'&&!row.detail.perEventValidation||e.approved||!eligible(e))return e;
  const candidates=(confirmed.get(key(row.date,e))||[]).filter(m=>m.row.id!==row.id&&type(m.row)!==type(row));
  const cumulative=candidates.map(m=>identical(e,m.event)?undefined:cumulativeNomination(e,row.detail.events||[],{status:m.row.status,documentType:type(m.row),events:m.row.detail.events||[]}));
  if(!candidates.length||e.kind==='titularisation'&&dates.get(identity(row.date,e))?.size!==1||candidates.some((m,i)=>!identical(e,m.event)&&!(cumulative[i]?.advance.id===m.event.id)))return e;
  const signatures=new Set(candidates.map(m=>JSON.stringify(facts(m.event))));if(signatures.size!==1)return e;
  const match=candidates[0];
  const proof:CspAcknowledgement={id:match.row.id,eventId:match.event.id,name:match.row.name,page:match.event.page,documentType:type(match.row),...(cumulative[0]?{cumulative:true}:{})};
  return {...e,approved:true,approvedAt:match.event.approvedAt,recordedBefore:cumulative[0]?.advanceState.before||match.event.recordedBefore,recordedAfter:cumulative[0]?.advanceState.after||match.event.recordedAfter,acknowledgedByDocument:proof};
 })}})));
}
