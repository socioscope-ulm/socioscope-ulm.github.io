import {normalName} from './agents.ts';
import {cspNameKey} from './csp-rup.ts';
import {cspNRSteps} from './csp.ts';
import type {CspEvent} from './csp.ts';
type Salary={gf:number;nr:number};
type Source={status:string;documentType?:string;events:CspEvent[]};
const same=(a:Salary,b:Salary)=>a.gf===b.gf&&a.nr===b.nr;
const salary=(v:any):Salary|undefined=>Number.isInteger(v?.gf)&&Number.isInteger(v?.nr)?{gf:v.gf,nr:v.nr}:undefined;
const person=(a:CspEvent,b:CspEvent)=>!!a.agentId&&a.agentId===b.agentId&&cspNameKey(a.name)===cspNameKey(b.name);
const explicit=(e:CspEvent,before:Salary,after:Salary)=>[['gfBefore',before.gf],['nrBefore',before.nr],['gfAfter',after.gf],['nrAfter',after.nr]].every(([key,value])=>(e as any)[key]===undefined||(e as any)[key]===value);
// Two independently validated RD decisions may commute: the CR can describe
// nomination then advancement while the RD records advancement then nomination.
// Accept only a complete, arithmetically proven pair with the same final total.
export function cumulativeNomination(target:CspEvent,targets:CspEvent[],source:Source){
 if(!(target.candidacy||['avancement','mesure'].includes(target.kind)))return;
 if(source.status!=='validated'||source.documentType==='cr'||!target.agentId)return;
 const nominations=source.events.filter(e=>e.selected&&!e.candidacy&&e.kind==='nomination'&&person(e,target));
 const candidate=targets.filter(e=>e.selected&&e.candidacy&&!e.nonRetained&&!e.nonRetainedByRD&&person(e,target)&&nominations.some(n=>n.reference&&e.reference===n.reference));
 if(candidate.length!==1)return;
 const crNomination=candidate[0],matches=nominations.filter(n=>n.reference===crNomination.reference);
 if(matches.length!==1)return;const nomination=matches[0];
 const group=source.events.filter(e=>e.selected&&!e.candidacy&&person(e,target)&&e.effective===nomination.effective);
 if(group.length!==2||group.some(e=>!e.approved||e.acknowledgedByDocument||e.acknowledgedByRD||e.extractionIssue))return;
 const advance=group.find(e=>['avancement','mesure'].includes(e.kind));
 if(!advance||![1,2].includes(nomination.gfDelta??0)||![1,2].includes(cspNRSteps(advance)??0)||advance.gfDelta||advance.nrConfirmed||nomination.nrConfirmed)return;
 const beforeNom=salary(nomination.recordedBefore),afterNom=salary(nomination.recordedAfter),beforeAdvance=salary(advance.recordedBefore),afterAdvance=salary(advance.recordedAfter);
 if(!beforeNom||!afterNom||!beforeAdvance||!afterAdvance)return;
 const gf=nomination.gfDelta!,steps=cspNRSteps(advance)!;
 if(afterNom.gf-beforeNom.gf!==gf||afterNom.nr-beforeNom.nr!==10||afterAdvance.gf!==beforeAdvance.gf||afterAdvance.nr-beforeAdvance.nr!==steps*5)return;
 if(nomination.nrSteps!==undefined&&nomination.nrSteps!==2||!explicit(nomination,beforeNom,afterNom)||!explicit(advance,beforeAdvance,afterAdvance))return;
 let before:Salary,after:Salary;
 if(same(afterNom,beforeAdvance)){before=beforeNom;after=afterAdvance;}
 else if(same(afterAdvance,beforeNom)){before=beforeAdvance;after=afterNom;}
 else return;
 const crAdvances=targets.filter(e=>e.selected&&!e.candidacy&&person(e,target)&&e.effective===advance.effective);
 if(crAdvances.length!==1)return;const crAdvance=crAdvances[0];
 if(crAdvance.kind!==advance.kind||cspNRSteps(crAdvance)!==steps||crAdvance.gfDelta||crAdvance.nrConfirmed||crNomination.nrConfirmed||crAdvance.extractionIssue||crNomination.extractionIssue)return;
 if(target.id!==crAdvance.id&&target.id!==crNomination.id)return;
 for(const field of ['agency','job','team','m3e'] as const){
  if(crNomination[field]&&normalName(crNomination[field])!==normalName(nomination[field]??nomination.recordedAfter?.[field]))return;
  if(crAdvance[field]&&![advance[field],advance.recordedAfter?.[field],nomination[field],nomination.recordedAfter?.[field]].some(v=>v&&normalName(v)===normalName(crAdvance[field])))return;
 }
 if(crNomination.gfBefore===undefined||crNomination.nrBefore===undefined||crAdvance.gfBefore===undefined||crAdvance.nrBefore===undefined||crAdvance.nrAfter===undefined)return;
 if(crNomination.effective&&crNomination.effective!==nomination.effective||crNomination.gfDelta!==undefined&&crNomination.gfDelta!==gf)return;
 for(const sequence of [[crNomination,crAdvance],[crAdvance,crNomination]]){
  let current=before;const states=new Map<string,{before:Salary;after:Salary}>();let valid=true;
  for(const e of sequence){const next={gf:current.gf+(e.candidacy?gf:0),nr:current.nr+(e.candidacy?10:steps*5)};if(!explicit(e,current,next)){valid=false;break;}states.set(e.id,{before:current,after:next});current=next;}
  if(valid&&same(current,after))return {before,after,nomination,advance,nominationState:states.get(crNomination.id)!,advanceState:states.get(crAdvance.id)!};
 }
}
