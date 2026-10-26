import {cspNonRetained} from './csp.ts';
import type {CspEvent} from './csp.ts';
export function activeCspEvents(detail:{events?:CspEvent[];perEventValidation?:boolean}):CspEvent[]{return (detail.events||[]).filter(e=>e.selected&&!e.candidacy&&!e.acknowledgedByRD&&!e.acknowledgedByDocument&&(!detail.perEventValidation||e.approved===true));}
export function cspProgress(status:string,detail:{events?:CspEvent[];perEventValidation?:boolean}){
 const selected=(detail.events||[]).filter(e=>e.selected&&!cspNonRetained(e));const approved=selected.filter(e=>status==='validated'&&(!detail.perEventValidation||e.approved===true)||status==='review'&&!!e.acknowledgedByDocument).length;
 return {approved,pending:status==='validated'&&detail.perEventValidation?selected.length-approved:status==='review'?selected.length-approved:0,partial:status==='validated'&&!!detail.perEventValidation&&selected.length>approved};
}
const business=(e:CspEvent)=>JSON.stringify(Object.entries(e).filter(([k,v])=>v!==undefined&&!['approved','approvedAt','recordedBefore','recordedAfter','acknowledgedByRD','acknowledgedByDocument','nonRetainedByRD'].includes(k)).sort(([a],[b])=>a.localeCompare(b)));
export function preserveApproved(incoming:CspEvent[],saved:CspEvent[],enabled:boolean):CspEvent[]{
 if(!enabled)return incoming.map(e=>{const {approved,approvedAt,recordedBefore,recordedAfter,salaryReference,acknowledgedByRD,acknowledgedByDocument,nonRetainedByRD,...draft}=e;return draft;});
 const protectedRows=new Map(saved.filter(e=>e.approved).map(e=>[e.id,e]));
 for(const [id,old] of protectedRows){const candidate=incoming.find(e=>e.id===id);if(!candidate||business(candidate)!==business(old))throw Object.assign(Error('Une décision déjà validée a été modifiée. Utiliser « Corriger » pour la réviser.'),{status:409});}
 return incoming.map(e=>protectedRows.get(e.id)||preserveApproved([e],[],false)[0]);
}

