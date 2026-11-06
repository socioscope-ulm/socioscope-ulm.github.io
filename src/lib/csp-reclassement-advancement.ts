import {cspExtractionIssue,cspNRSteps} from './csp.ts';
import {cspNameKey} from './csp-rup.ts';
import type {CspEvent} from './csp.ts';
type Document={date:string;status:string;detail:{perEventValidation?:boolean;events?:CspEvent[]}};
type Salary={gf:number;nr:number};
const salary=(r:any):Salary|undefined=>Number.isInteger(r?.gf)&&Number.isInteger(r?.nr)?{gf:r.gf,nr:r.nr}:undefined;
const same=(a:Salary,b:Salary)=>a.gf===b.gf&&a.nr===b.nr;
const explicit=(e:CspEvent,a:Salary,b:Salary)=>[['gfBefore',a.gf],['nrBefore',a.nr],['gfAfter',b.gf],['nrAfter',b.nr]].every(([k,v])=>(e as any)[k]===undefined||(e as any)[k]===v);
// One independently approved reclassement and one approved NR award may be
// printed in opposite orders in ODJ/RD. Prove both chains arithmetically; retain
// the original documents and acknowledge the award without replaying it.
export function reclassementAdvancement(target:CspEvent,award:CspEvent,date:string,documents:Document[]){
 const steps=cspNRSteps(award),before=salary(award.recordedBefore),after=salary(award.recordedAfter);
 if(target.candidacy||!['avancement','mesure'].includes(target.kind)||target.kind!==award.kind||!target.agentId||target.agentId!==award.agentId||
  cspNameKey(target.name)!==cspNameKey(award.name)||target.effective!==award.effective||cspNRSteps(target)!==steps||!steps||target.gfDelta||award.gfDelta||
  target.nrConfirmed||award.nrConfirmed||!award.approved||award.acknowledgedByDocument||award.acknowledgedByRD||cspExtractionIssue(target)||cspExtractionIssue(award)||
  !before||!after||after.gf!==before.gf||after.nr!==before.nr+steps*5||!explicit(award,before,after)||target.gfBefore===undefined||target.nrBefore===undefined||target.nrAfter===undefined)return;
 const matches=new Map<string,{before:Salary;after:Salary}>();
 for(const doc of documents.filter(d=>d.status==='validated'&&d.date===date))for(const e of doc.detail.events||[]){
  if(e.kind!=='reclassement'||!e.selected||doc.detail.perEventValidation&&!e.approved||e.acknowledgedByDocument||e.acknowledgedByRD||cspExtractionIssue(e)||
   e.agentId!==target.agentId||cspNameKey(e.name)!==cspNameKey(target.name)||e.effective!==target.effective||!e.gfDelta)continue;
  const a=salary(e.recordedBefore),b=salary(e.recordedAfter);
  if(!a||!b||b.gf!==a.gf+e.gfDelta||b.nr!==a.nr+e.gfDelta*10||!explicit(e,a,b))continue;
  let alternate:Salary;
  if(same(b,before))alternate=a;
  else if(same(after,a))alternate={gf:before.gf+e.gfDelta,nr:before.nr+e.gfDelta*10};
  else continue;
  const end={gf:alternate.gf,nr:alternate.nr+steps*5};
  if(!explicit(target,alternate,end))continue;
  matches.set(JSON.stringify([a,b]),{before:alternate,after:end});
 }
 if(matches.size!==1)return;
 return {advance:award,advanceState:[...matches.values()][0],kind:'reclassement' as const};
}
