import {preserveApproved,activeCspEvents} from './csp-validation.ts';
import {acknowledgeCspDecisions} from './csp-acknowledgement.ts';
import {prepareCspDocuments} from './csp-candidates.ts';
import {projectCsp,parisToday,cspResolvedEvent,validateCspEvent} from './csp.ts';
import type {CspEvent} from './csp.ts';
import type {AgentData} from './agents.ts';
const invalid=(message:string)=>Object.assign(Error(message),{status:400});
export function correctionEvents(row:any,event:CspEvent){
 const saved:CspEvent[]=row.detail.events||[];
 const old=saved.find(e=>e.id===event.id);
 if(!old||!validateCspEvent(event)||old.kind!==event.kind||!!old.candidacy!==!!event.candidacy)throw invalid('Décision absente ou type de décision modifié.');
 if(old.acknowledgedByDocument||old.acknowledgedByRD)throw invalid('Corriger la décision dans son document d’origine.');
 const draft=preserveApproved([event],[],false)[0];
 return saved.map(e=>e.id===event.id?draft:row.status==='validated'&&!row.detail.perEventValidation&&e.selected?{...e,approved:true}:e);
}
const document=(r:any)=>({id:r.id,name:r.name,date:r.date,status:r.status,created:r.created,documentType:r.detail.documentType==='cr'?'cr' as const:'rd' as const,events:r.detail.events||[]});
function applicable(rows:any[]){return acknowledgeCspDecisions(rows).map(r=>({...document(r),events:activeCspEvents(r.detail)}));}
export function planCspCorrection(data:AgentData,rows:any[],row:any,event:CspEvent){
 const events=correctionEvents(row,event),others=applicable(rows).filter(r=>r.id!==row.id);
 const source={...document(row),events};
 const documents=[...rows.filter(r=>r.id!==row.id).map(document),source];
 const preview=prepareCspDocuments(data,events,others,row.date,documents,source);
 const decision=preview.find(e=>e.id===event.id)!;
 if(!decision.selected||!['ready','scheduled','covered','duplicate','not-retained'].includes(decision.state))throw invalid(decision.problem||'Cette décision reste à vérifier.');
 // Pending decisions never supply prerequisites to a published correction.
 const isolated=events.map(e=>({...e,selected:e.selected&&(e.id===event.id||e.approved===true)}));
 const check=prepareCspDocuments(data,isolated,others,row.date,documents,source).find(e=>e.id===event.id)!;
 if(check.state==='blocked'||JSON.stringify([check.before,check.after])!==JSON.stringify([decision.before,decision.after]))throw invalid('La correction dépend d’une décision encore en attente. Valider cette décision d’abord.');
 const original=row.detail.events.find((e:CspEvent)=>e.id===event.id);
 // Never leave a validated dependent movement with an obsolete before/after.
 // A linked chain requires a grouped revision, while independent approvals stay intact.
 const resultChanged=['gf','nr','agency','job','team'].some(k=>(original.recordedAfter as any)?.[k]!==((decision.after as any)?.[k]));
 if(resultChanged){
  const ordered=applicable(rows).filter(d=>d.status==='validated').sort((a,b)=>(a.created||'').localeCompare(b.created||''));
  const chain=ordered.flatMap(d=>d.events.map(e=>({d,e}))).sort((a,b)=>a.e.effective.localeCompare(b.e.effective));
  const index=chain.findIndex(v=>v.d.id===row.id&&v.e.id===event.id);
  const dependent=chain.find((v,i)=>i>index&&index>=0&&v.e.agentId===original.agentId&&!(v.d.id===row.id&&v.e.id===event.id));
  if(dependent)throw invalid('Une autre décision validée de cet agent dépend de cette situation : '+dependent.d.name+' · page '+dependent.e.page+'. Réviser les mouvements liés ensemble pour conserver des valeurs avant/après cohérentes.');
 }
 const now=new Date().toISOString();
 const stored=events.map(e=>e.id===event.id?{...cspResolvedEvent(e,decision),approved:true,approvedAt:now,recordedBefore:decision.before,recordedAfter:decision.after}:e);
 const next={...row,status:'validated',detail:{...row.detail,perEventValidation:true,events:stored}};
 const before=projectCsp(data,applicable(rows),parisToday()),after=projectCsp(data,applicable(rows.map(r=>r.id===row.id?next:r)),parisToday());
 const issueKey=(i:any)=>JSON.stringify([i.event.agentId,i.event.id,i.problem]);
 const known=new Set(before.issues.map(issueKey));
 const added=after.issues.filter(i=>!known.has(issueKey(i)));
 if(added.length)throw invalid('Une autre décision deviendrait incohérente : '+added[0].event.name+' · '+added[0].problem+' Utiliser la révision du document pour corriger les mouvements liés ensemble.');
 const identities=new Set([event.agentId,decision.agentId,row.detail.events.find((e:CspEvent)=>e.id===event.id)?.agentId].filter(Boolean));
 const state=(p:any)=>p.data.records.filter((r:any)=>r.source==='csp-current'&&identities.has(r.agentId)).map((r:any)=>({agentId:r.agentId,name:r.name,gf:r.gf,nr:r.nr,agency:r.agency,job:r.job})).sort((a:any,b:any)=>a.agentId.localeCompare(b.agentId));
 return {events:stored,decision,impact:{before:state(before),after:state(after)},original:row.detail.events.find((e:CspEvent)=>e.id===event.id)};
}
