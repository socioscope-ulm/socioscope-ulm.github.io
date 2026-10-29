import {UNHEADED_ADVANCEMENT} from './csp-unheaded-avancement.ts';
import {cspNameKey} from './csp-rup.ts';
import {cspKinds,cspKey,cspNonRetained,validateCspEvent} from './csp.ts';
import {preserveApproved} from './csp-validation.ts';
import {cspUnreadPages} from './csp-coverage.ts';
import type {CspEvent} from './csp.ts';
export function recoverCspPages(detail:any,status:string,incoming:CspEvent[],reports:any[]){
 const targets=new Map(cspUnreadPages(detail.reports).map(r=>[r.page,r]));
 const old:CspEvent[]=(detail.events||[]).map((e:CspEvent)=>status==='validated'&&!detail.perEventValidation&&e.selected?{...e,approved:true}:e);
 const keys=new Set(old.map(cspKey)),ids=new Set(old.map(e=>e.id));
 const additions:CspEvent[]=[];
 for(const event of incoming){
  const target=targets.get(event.page);if(!target||!Object.hasOwn(cspKinds,target.section)||event.kind!==target.section||!validateCspEvent(event)||keys.has(cspKey(event)))continue;
  const prior=old.find(e=>e.page===event.page&&e.kind===event.kind&&e.effective===event.effective&&cspNameKey(e.name)===cspNameKey(event.name)&&(e.extractionIssue?.startsWith(UNHEADED_ADVANCEMENT)||event.extractionIssue?.startsWith(UNHEADED_ADVANCEMENT)));
  if(prior){
   if(!prior.approved&&prior.extractionIssue?.startsWith(UNHEADED_ADVANCEMENT)&&!event.extractionIssue){
    const next={...prior,extractionIssue:undefined};
    for(const k of ['gfBefore','gfAfter','nrBefore','nrAfter','gfDelta','nrSteps'] as const)if(next[k]===undefined&&event[k]!==undefined)next[k]=event[k];
    const conflict=['gfBefore','gfAfter','nrBefore','nrAfter','gfDelta','nrSteps'].some(k=>(prior as any)[k]!==undefined&&(event as any)[k]!==undefined&&(prior as any)[k]!== (event as any)[k]);
    if(conflict)next.extractionIssue='Les valeurs saisies diffèrent de la relecture du PDF. Vérifier cette décision.';
    old[old.indexOf(prior)]=next;
   }
   continue;
  }
  let e=preserveApproved([event],[],false)[0],id=e.id;while(ids.has(id))id='recovered-'+event.page+'-'+id;
  e={...e,id};ids.add(id);keys.add(cspKey(e));additions.push(e);
 }
 const updated=(detail.reports||[]).map((oldReport:any)=>{
  if(!targets.has(oldReport.page))return oldReport;
  const fresh=reports.find(r=>r.page===oldReport.page&&r.section===oldReport.section);
  const extracted=incoming.filter(e=>e.page===oldReport.page&&e.kind===oldReport.section&&validateCspEvent(e));
  if(!fresh||!extracted.length)return oldReport;
  if(fresh.status!=='read')return {...oldReport,count:extracted.length,note:String(fresh.note||oldReport.note||'Lecture encore incomplète.').slice(0,500)};
  return {...oldReport,status:'read',count:extracted.length,note:String(fresh.note||'Lecture reprise avec succès.').slice(0,500)};
 });
 return {...detail,events:[...old,...additions],reports:updated,perEventValidation:status==='validated'?true:detail.perEventValidation};
}

export function confirmCspPage(detail:any,page:number){
 const report=(detail.reports||[]).find((r:any)=>r.page===page&&r.status==='unsupported');
 const events:CspEvent[]=(detail.events||[]).filter((e:CspEvent)=>e.page===page);
 if(!report||!events.some(e=>e.selected)||events.some(e=>e.selected&&!e.approved&&!cspNonRetained(e)))throw Object.assign(Error('Vérifier et traiter les décisions de cette page avant de confirmer sa lecture complète.'),{status:400});
 return {...detail,reports:detail.reports.map((r:any)=>r===report?{...r,status:'read',note:'Page entièrement vérifiée manuellement ; décisions traitées.'}:r)};
}
