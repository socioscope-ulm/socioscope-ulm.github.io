import {cspNameKey} from './csp-rup.ts';
import {validDate} from './csp.ts';
import type {CspEvent} from './csp.ts';

type Document={id:string;name:string;date:string;status:string;detail:{documentType?:string;perEventValidation?:boolean;events?:CspEvent[];[key:string]:unknown};[key:string]:unknown};
const simple=(e:CspEvent)=>e.kind==='titularisation'&&e.selected&&!e.candidacy&&!e.extractionIssue&&!!e.agentId&&validDate(e.effective)&&
 ['gfBefore','gfAfter','nrBefore','nrAfter','gfDelta','nrSteps'].every(k=>(e as any)[k]===undefined);
const key=(date:string,e:CspEvent)=>JSON.stringify([date,e.agentId,cspNameKey(e.name),e.effective]);

// This is a derived acknowledgement, not a second approval of the movement.
// Recompute on every read, so disabling or correcting the RD restores pending.
export function acknowledgeTitularisations<T extends Document>(rows:T[]):T[]{
 const confirmed=new Map<string,{row:T;event:CspEvent}>(),dates=new Map<string,Set<string>>();
 const identity=(date:string,e:CspEvent)=>JSON.stringify([date,e.agentId,cspNameKey(e.name)]);
 for(const row of rows)if(row.status==='validated'&&row.detail.documentType!=='cr')for(const event of row.detail.events||[]){
  if(simple(event)&&(!row.detail.perEventValidation||event.approved)&&!event.acknowledgedByRD){confirmed.set(key(row.date,event),{row,event});const k=identity(row.date,event),values=dates.get(k)||new Set<string>();values.add(event.effective);dates.set(k,values);}
 }
 return rows.map(row=>{
  if(row.detail.documentType!=='cr')return row;
  const events=(row.detail.events||[]).map(original=>{
   let e=original;
   if(e.acknowledgedByRD){const {acknowledgedByRD,approved,approvedAt,recordedBefore,recordedAfter,...pending}=e;e=pending;}
   if(row.status!=='validated'||!row.detail.perEventValidation||e.approved||!simple(e))return e;
   const match=confirmed.get(key(row.date,e));if(!match||dates.get(identity(row.date,e))?.size!==1)return e;
   return {...e,approved:true,approvedAt:match.event.approvedAt,recordedBefore:match.event.recordedBefore,recordedAfter:match.event.recordedAfter,
    acknowledgedByRD:{id:match.row.id,eventId:match.event.id,name:match.row.name,page:match.event.page}};
  });
  return {...row,detail:{...row.detail,events}};
 });
}
