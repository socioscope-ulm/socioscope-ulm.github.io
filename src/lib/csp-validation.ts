import {cspNonRetained,validDate} from './csp.ts';
import type {CspEvent} from './csp.ts';
export function activeCspEvents(detail:{events?:CspEvent[];perEventValidation?:boolean}):CspEvent[]{return (detail.events||[]).filter(e=>e.selected&&!e.candidacy&&!e.acknowledgedByRD&&!e.acknowledgedByDocument&&(!detail.perEventValidation||e.approved===true));}
export function cspProgress(status:string,detail:{events?:CspEvent[];perEventValidation?:boolean}){
 const selected=(detail.events||[]).filter(e=>e.selected&&!cspNonRetained(e));const approved=selected.filter(e=>status==='validated'&&(!detail.perEventValidation||e.approved===true)||status==='review'&&!!e.acknowledgedByDocument).length;
 return {approved,pending:status==='validated'&&detail.perEventValidation?selected.length-approved:status==='review'?selected.length-approved:0,partial:status==='validated'&&!!detail.perEventValidation&&selected.length>approved};
}
const business=(e:CspEvent)=>JSON.stringify(Object.entries(e).filter(([k,v])=>v!==undefined&&!['approved','approvedAt','recordedBefore','recordedAfter','acknowledgedByRD','acknowledgedByDocument','nonRetainedByRD'].includes(k)).sort(([a],[b])=>a.localeCompare(b)));
export function preserveApproved(incoming:CspEvent[],saved:CspEvent[],enabled:boolean):CspEvent[]{
 if(!enabled)return incoming.map(e=>{const {approved,approvedAt,recordedBefore,recordedAfter,salaryReference,nominationReference,reclassementReference,acknowledgedByRD,acknowledgedByDocument,nonRetainedByRD,...draft}=e;return draft;});
 const protectedRows=new Map(saved.filter(e=>e.approved).map(e=>[e.id,e]));
 for(const [id,old] of protectedRows){const candidate=incoming.find(e=>e.id===id);if(!candidate||business(candidate)!==business(old))throw Object.assign(Error('Une décision déjà validée a été modifiée. Utiliser « Corriger » pour la réviser.'),{status:409});}
 return incoming.map(e=>protectedRows.get(e.id)||preserveApproved([e],[],false)[0]);
}


// Re-include only explicitly chosen, unapproved individual movements.
// Never interpret an excluded movement as a rejected candidacy or approve it implicitly.
export function restorableCspEvents(events:CspEvent[]):CspEvent[]{return events.filter(e=>!e.selected&&!e.approved&&!e.candidacy&&!cspNonRetained(e)&&!e.acknowledgedByDocument&&!e.acknowledgedByRD&&validDate(e.effective));}
export function restoreExcludedCsp(events:CspEvent[],ids:string[]):CspEvent[]{
 const eligible=new Set(restorableCspEvents(events).map(e=>e.id));
 if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!eligible.has(id)))throw Object.assign(Error('Choisir uniquement des décisions écartées, datées et non validées.'),{status:400});
 const wanted=new Set(ids);return events.map(e=>wanted.has(e.id)?{...e,selected:true}:e);
}
