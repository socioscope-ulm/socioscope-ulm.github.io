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
 if(cspKey(target)!==cspKey(source)||(target.gfDelta??0)!==(source.gfDelta??0))return false;
 if(['titularisation','mutation','admission'].includes(target.kind)&&cspNRSteps(target)!==cspNRSteps(source))return false;
 const known=facts(source);
 for(const field of ['gfBefore','nrBefore','gfAfter','nrAfter'] as const)if(target[field]!==undefined&&target[field]!==known[field])return false;
 for(const [field,part,key] of [['gfBefore','recordedBefore','gf'],['nrBefore','recordedBefore','nr'],['gfAfter','recordedAfter','gf'],['nrAfter','recordedAfter','nr']] as const){
  if(source[field]!==undefined&&source[part]?.[key]!==undefined&&source[field]!==source[part]![key])return false;
 }
 for(const field of ['agency','job','team','m3e','reference'] as const){
  const proposed=target[field];if(!proposed)continue;
  const documented=source[field]??(field==='reference'?undefined:source.recordedAfter?.[field]);
  if(!documented||normalName(proposed)!==normalName(documented))return false;
 }
 if(target.location&&normalName(target.location)!==normalName(source.location))return false;
 if(target.nrConfirmed&&!source.nrConfirmed&&source.nrAfter===undefined)return false;
 return true;
}

// Recomputed from original approvals on every read. An acknowledgement can
// never approve another document or publish a second career movement.
export function acknowledgeCspDecisions<T extends Document>(rows:T[]):T[]{
 const confirmed=new Map<string,{row:T;event:CspEvent}[]>(),dates=new Map<string,Set<string>>();
 for(const row of rows)if(row.status==='validated')for(const event of row.detail.events||[]){
  if(!eligible(event)||acknowledgement(event)||row.detail.perEventValidation&&!event.approved)continue;
  const k=key(row.date,event),matches=confirmed.get(k)||[];matches.push({row,event});confirmed.set(k,matches);
  const id=identity(row.date,event),values=dates.get(id)||new Set<string>();values.add(event.effective);dates.set(id,values);
 }
 return resolveNominationOutcomes(rows.map(row=>({...row,detail:{...row.detail,events:(row.detail.events||[]).map(original=>{
  const e=clear(original);
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
