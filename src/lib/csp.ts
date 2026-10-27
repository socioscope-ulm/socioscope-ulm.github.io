import {cspNameKey} from './csp-rup.ts';
import {normalName,normalizeNNI,snapshot,formattedSnapshot} from './agents.ts';
import type {AgentData,AgentRecord,AgentSource} from './agents.ts';

export const CSP_SOURCE='csp-current';
export const cspKinds={admission:'Admission au stage',titularisation:'Titularisation',mutation:'Mutation d’office',reclassement:'Reclassement',avancement:'Avancement au choix',posthume:'Avancement à titre posthume',mesure:'Mesure salariale',nomination:'Nomination'};
export type CspKind=keyof typeof cspKinds;
export type CspSalaryReference={nni:string;gf:number;nr:number;nrAfter:number;steps:number;effective:string;agency?:string;rup:{source:string;date:string};cr:{id:string;name:string;eventId:string;page:number};rd:{id:string;name:string;eventId:string;page:number}};
export type CspSalaryChecks={references:Map<string,CspSalaryReference>;problems:Map<string,string>};
export type CspAcknowledgement={id:string;eventId:string;name:string;page:number;documentType:'cr'|'rd';cumulative?:boolean};
export type CspNonRetentionProof=Omit<CspAcknowledgement,'eventId'|'page'>&{eventId?:string;page?:number;reason?:'unfilled-post'};
export type CspEvent={acknowledgedByDocument?:CspAcknowledgement;acknowledgedByRD?:{id:string;eventId:string;name:string;page:number};salaryReference?:CspSalaryReference;id:string;name:string;agentId?:string;kind:CspKind;effective:string;page:number;pages?:number[];agency?:string;job?:string;team?:string;m3e?:string;location?:string;reference?:string;gfDelta?:number;nrSteps?:number;gfBefore?:number;gfAfter?:number;nrBefore?:number;nrAfter?:number;identityMethod?:'rup'|'annual'|'manual';identitySource?:string;identityDate?:string;selected:boolean;candidacy?:boolean;nonRetained?:boolean;nonRetainedByRD?:CspNonRetentionProof;approved?:boolean;approvedAt?:string;note?:string;nrConfirmed?:boolean;extractionIssue?:string;newAgent?:boolean;recordedBefore?:Partial<AgentRecord>;recordedAfter?:Partial<AgentRecord>};
export type CspImport={id:string;name:string;date:string;status:string;created?:string;events:CspEvent[];documentType?:'rd'|'cr';evidenceEvents?:CspEvent[]};
export type CspPreview=CspEvent&{state:string;problem:string;matchedDocument?:CspAcknowledgement;matchedRD?:{id:string;eventId:string;name:string;page:number;approved:boolean};before?:Partial<AgentRecord>;after?:Partial<AgentRecord>;candidates?:{id:string;name:string;agency?:string}[]};
export const cspNonRetained=(e:CspEvent)=>!!(e.nonRetained||e.nonRetainedByRD);
export function validDate(v:unknown):v is string {if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v&&v>='2000-01-01'&&v<='2100-12-31';}
export const parisToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const nameKey=cspNameKey;
// A salary measure is one NR step unless an explicit count or absolute NR is supplied.
export const cspNRSteps=(e:CspEvent)=>e.nrSteps??(e.kind==='posthume'&&e.nrBefore!==undefined&&e.nrAfter!==undefined&&e.nrAfter>e.nrBefore&&(e.nrAfter-e.nrBefore)%5===0?(e.nrAfter-e.nrBefore)/5:e.kind==='mesure'&&e.nrAfter===undefined?1:undefined);
export function cspKey(e:CspEvent){
 if(e.candidacy)return JSON.stringify(['candidacy',nameKey(e.name),e.reference||'',e.agency||'']);
 const identity=[e.agentId||nameKey(e.name),e.kind,e.effective],nrSteps=cspNRSteps(e);
 if(e.kind==='reclassement')return JSON.stringify([...identity,e.gfDelta??null]);
 if(['avancement','mesure','posthume'].includes(e.kind))return JSON.stringify([...identity,nrSteps??(e.nrBefore!==undefined&&e.nrAfter!==undefined?(e.nrAfter-e.nrBefore)/5:null),nrSteps===undefined&&e.nrBefore===undefined?e.nrAfter??null:null]);
 if(e.kind==='titularisation')return JSON.stringify(identity);
 if(e.kind==='nomination'&&e.reference)return JSON.stringify([...identity,e.reference]);
 return JSON.stringify([...identity,e.gfDelta??(e.kind==='mutation'?0:null),e.nrSteps??null,(['admission','mutation'].includes(e.kind)?null:e.gfAfter??null),(['admission','mutation'].includes(e.kind)?null:e.nrAfter??null),normalName(e.agency),normalName(e.job),normalName(e.team),e.m3e||'',e.reference||'']);
}
export function deduplicateCsp(events:CspEvent[]){const unique=new Map<string,CspEvent>();for(const e of events){const k=cspKey(e),prior=unique.get(k);if(prior){prior.pages=[...new Set([...(prior.pages||[prior.page]),...(e.pages||[e.page])])].sort((a,b)=>a-b);if(['gfBefore','gfAfter','nrBefore','nrAfter'].some(k=>(prior as any)[k]!==undefined&&(e as any)[k]!==undefined&&(prior as any)[k]!== (e as any)[k]))prior.extractionIssue='Le document présente plusieurs situations avant/après différentes pour cette décision (pages '+prior.pages.join(', ')+'). Vérifier les versions avant validation.';}else unique.set(k,{...e,pages:e.pages||[e.page]});}return [...unique.values()];}
export function validateCspEvent(e:any):e is CspEvent {
 return !!e&&typeof e.id==='string'&&e.id.length<=100&&typeof e.name==='string'&&e.name.trim().length>2&&e.name.length<180&&Object.hasOwn(cspKinds,e.kind)&&(validDate(e.effective)||(e.candidacy===true||!e.selected)&&e.effective==='')&&Number.isInteger(e.page)&&e.page>=1&&e.page<=250&&typeof e.selected==='boolean'&&(!e.candidacy||e.kind==='nomination')&&(!e.nonRetained||e.candidacy===true)&&(e.nonRetained===undefined||typeof e.nonRetained==='boolean')&&(!e.agentId||normalizeNNI(e.agentId)===e.agentId)&&['agency','job','team','m3e','location','reference','note','extractionIssue'].every(k=>e[k]===undefined||typeof e[k]==='string'&&e[k].length<=500)&&['gfDelta','nrSteps','gfBefore','gfAfter','nrBefore','nrAfter'].every(k=>e[k]===undefined||Number.isInteger(e[k])&&e[k]>=0&&e[k]<1000)&&['gfBefore','gfAfter'].every(k=>e[k]===undefined||e[k]>=1&&e[k]<=30)&&(e.gfDelta===undefined||e.gfDelta<=10)&&(e.nrSteps===undefined||e.nrSteps<=20)&&(!e.pages||Array.isArray(e.pages)&&e.pages.length<=250&&e.pages.every((p:any)=>Number.isInteger(p)&&p>=1&&p<=250))&&['newAgent','nrConfirmed','candidacy'].every(k=>e[k]===undefined||typeof e[k]==='boolean');
}
export function latestAnnual(data:AgentData,asOf='2100-12-31'){const candidates=data.sources.filter(s=>!s.kind?.startsWith('csp')&&s.status!=='review'&&!s.status?.startsWith('disabled')&&s.date<=asOf);const complete=candidates.filter(s=>s.primary);return (complete.length?complete:candidates.filter(s=>s.status==='validated')).sort((a,b)=>b.date.localeCompare(a.date)||Number(formattedSnapshot(b))-Number(formattedSnapshot(a))||a.id.localeCompare(b.id))[0];}
// Fixed award for an internal nomination: one or two GF both give two NR
// steps (+10), only when the document has no explicit NR instruction.
function nominationNRSteps(e:CspEvent,row:Partial<AgentRecord>|undefined){return e.kind==='nomination'&&!e.candidacy&&[1,2].includes(e.gfDelta??0)&&!!row&&row.gf!==undefined&&row.nr!==undefined&&e.nrAfter===undefined&&e.nrSteps===undefined&&!e.nrConfirmed?2:undefined;}
// An administrative transfer may quote the salary before a separate award.
// Accept that reference only when the preceding applied salary chain proves it;
// the transfer always retains the current salary, never the quoted old NR.
function applyEvent(row:AgentRecord|undefined,e:CspEvent,salaryHistory:AgentRecord[]=[]):{row?:AgentRecord;problem:string}{
 if(e.candidacy)return {problem:'Candidature de l’ODJ : en attente de confirmation par un RD.'};
 if(e.extractionIssue)return {problem:e.extractionIssue};
 if(e.kind==='mutation'&&e.job&&/^[-–—\s]+$/.test(e.job))e={...e,job:undefined};
 const nrSteps=cspNRSteps(e)??nominationNRSteps(e,row);
 if(row&&e.kind==='mutation'&&!e.gfDelta&&!nrSteps&&
  (e.gfBefore===undefined||e.gfAfter===undefined||e.gfBefore===e.gfAfter)&&
  salaryHistory.some(old=>old.agentId===row.agentId&&['gfBefore','gfAfter','nrBefore','nrAfter'].every(field=>(e as any)[field]===undefined||(e as any)[field]===(old as any)[field.startsWith('gf')?'gf':'nr']||field==='nrAfter'&&e.nrAfter===row.nr)))
  e={...e,gfBefore:e.gfBefore===undefined?undefined:row.gf,gfAfter:e.gfAfter===undefined?undefined:row.gf,nrBefore:e.nrBefore===undefined?undefined:row.nr,nrAfter:e.nrAfter===undefined?undefined:row.nr};
 const required=new Set<string>();if(nrSteps||e.kind==='reclassement')required.add('nr');if(e.gfDelta||e.kind==='reclassement')required.add('gf');if(e.gfBefore!==undefined)required.add('gf');if(e.nrBefore!==undefined)required.add('nr');
 const conflicts=((row as any)?.conflicts||[]).filter((field:string)=>required.has(field));
 if(conflicts.length)return {problem:'Valeur de départ contradictoire : '+conflicts.map((s:string)=>s.toUpperCase()).join(', ')+'. Renseigner une situation de référence fiable avant ce mouvement.'};
 if(!row&&!e.newAgent)return {problem:'Agent absent de la photographie : confirmer une arrivée dans l’ULM et renseigner son NNI.'};
 if(!row&&!['admission','nomination','mutation'].includes(e.kind))return {problem:'Ce mouvement ne permet pas de créer une arrivée.'};
 if(!row&&(!e.agentId||!e.agency||e.kind!=='mutation'&&!e.job))return {problem:e.kind==='mutation'?'Une arrivée par mutation exige un NNI et une agence de destination.':'Une arrivée exige un NNI, une agence et un emploi de destination.'};
 const after:AgentRecord={...(row||{id:'csp:'+e.id,agentId:e.agentId!,nni:e.agentId!,name:e.name,source:CSP_SOURCE,row:e.page}),name:row?.name||e.name};
 for(const [field,before] of [['gf',e.gfBefore],['nr',e.nrBefore]] as const)if(row&&before!==undefined&&row[field]!==before)return {problem:`${field.toUpperCase()} avant (${before}) différent de la situation connue (${row?.[field]??'inconnue'}). Vérifier l’ordre et les décisions déjà incluses.`};
 if(['avancement','mesure','posthume'].includes(e.kind)&&!nrSteps&&e.nrAfter===undefined)return {problem:'Nombre de NR non renseigné.'};
 if(e.kind==='mutation'&&(e.gfDelta||nrSteps||(row?(e.gfAfter!==undefined&&e.gfAfter!==row.gf)||(e.nrAfter!==undefined&&e.nrAfter!==row.nr):(e.gfBefore!==undefined&&e.gfAfter!==undefined&&e.gfBefore!==e.gfAfter)||(e.nrBefore!==undefined&&e.nrAfter!==undefined&&e.nrBefore!==e.nrAfter))))return {problem:'Mutation d’office : le GF et le NR sont conservés. Vérifier les valeurs contradictoires renseignées.'};
 let gf=row?.gf??(e.newAgent?(e.gfBefore??(e.kind==='mutation'?e.gfAfter:undefined)):undefined),nr=row?.nr??(e.newAgent?(e.nrBefore??(e.kind==='mutation'?e.nrAfter:undefined)):undefined);
 if(e.kind==='reclassement'){
  const delta=e.gfDelta??0;if(delta<1||gf===undefined||nr===undefined)return {problem:'GF et NR de départ nécessaires pour le reclassement.'};
  gf+=delta;nr+=delta*10;
 }else{
  if(e.gfDelta){if(gf===undefined)return {problem:'GF de départ inconnu.'};gf+=e.gfDelta;}
  if(nrSteps){if(nr===undefined)return {problem:'NR de départ inconnu.'};nr+=nrSteps*5;}
 }
 if(e.gfAfter!==undefined){if((e.gfDelta||e.kind==='reclassement')&&gf!==e.gfAfter)return {problem:'Le GF après contredit la progression indiquée.'};gf=e.gfAfter;}
 if(e.nrAfter!==undefined){if((nrSteps||e.kind==='reclassement')&&nr!==e.nrAfter)return {problem:'Le NR après contredit la progression indiquée.'};nr=e.nrAfter;}
 if(e.kind==='nomination'&&e.gfDelta===0&&gf===undefined)return {problem:'GF de départ inconnu : impossible de confirmer un GF constant.'};
 if(e.nrConfirmed&&nr===undefined)return {problem:'Impossible de confirmer un NR inchangé sans NR de départ connu.'};
 if(e.kind==='nomination'&&e.gfDelta!==0&&e.nrAfter===undefined&&!e.nrConfirmed&&!nominationNRSteps(e,row))return {problem:'Nomination : renseigner le NR après ou confirmer explicitement un NR inchangé.'};
 if(!row&&gf===undefined)return {problem:'Renseigner le GF avant ou après de la personne arrivant dans l’ULM.'};
 if(e.kind==='admission'&&gf===undefined)return {problem:'GF d’admission à renseigner.'};
 if(gf!==undefined&&(gf<1||gf>30)||nr!==undefined&&(nr<1||nr>999))return {problem:'GF ou NR calculé hors limites.'};
 if(gf!==undefined){after.gf=gf;after.college=gf>=12?'cadres':gf>=7?'maitrise':'execution';if(row?.gf!==gf){after.gfDate=e.effective;after.gfYears=0;}}
 if(nr!==undefined){after.nr=nr;if(row?.nr!==nr){after.nrDate=e.effective;after.nrYears=0;}}
 if(['admission','mutation','nomination'].includes(e.kind)){if(e.agency)after.agency=e.agency;if(e.job){if(row?.job&&normalName(row.job)!==normalName(e.job)&&!e.m3e)delete after.m3e;after.job=e.job;}if(e.team)after.team=e.team;if(e.m3e)after.m3e=e.m3e;}
 if(e.kind==='nomination'&&e.gfDelta===0&&e.nrAfter===undefined&&e.nrSteps===undefined&&!e.nrConfirmed&&nr!==undefined)after.nrProvisional=true;
 if(e.nrAfter!==undefined||e.nrSteps!==undefined||e.nrConfirmed)delete after.nrProvisional;
 if(e.kind==='titularisation')after.presence='Titulaire';
 if(!row||e.kind==='mutation'&&e.newAgent){after.entryUnit=e.effective;if(e.kind==='admission')after.presence='Stagiaire';}
 return {row:after,problem:''};
}
function rememberSalary(history:Map<string,AgentRecord[]>,before:AgentRecord|undefined,after:AgentRecord|undefined,e:CspEvent){
 if(!before||!after||before.gf===after.gf&&before.nr===after.nr)return;
 if(!['avancement','mesure','posthume'].includes(e.kind)||before.gf!==after.gf){history.delete(e.agentId!);return;}
 const rows=history.get(e.agentId!)||[];rows.push(before);history.set(e.agentId!,rows);
}
export function prepareCsp(data:AgentData,events:CspEvent[],prior:CspImport[]=[],meetingDate=parisToday(),salaryChecks?:CspSalaryChecks):CspPreview[]{
 const base=latestAnnual(data);if(!base)return events.map(e=>({...e,state:'blocked',problem:'Aucune photographie annuelle de référence.'}));
 const histories=new Map<string,AgentRecord>();const dateById=new Map(data.sources.map(s=>[s.id,s.date]));
 for(const r of [...data.records].sort((a,b)=>(dateById.get(a.source)||'').localeCompare(dateById.get(b.source)||'')))if(r.nni)histories.set(r.agentId,r);
 const names=new Map<string,Set<string>>();for(const r of data.records)if(r.nni){const k=nameKey(r.name),ids=names.get(k)||new Set();ids.add(r.agentId);names.set(k,ids);}
 const evidence=new Map<string,NonNullable<AgentData['cspIdentities']>[number]>();
 for(const identity of data.cspIdentities||[]){const k=nameKey(identity.name),ids=names.get(k)||new Set<string>();ids.add(identity.nni);names.set(k,ids);evidence.set(k+'|'+identity.nni,identity);}
 const resolved=events.map(e=>{
  const candidates=[...(names.get(nameKey(e.name))||[])].map(id=>({id,name:histories.get(id)?.name||e.name,agency:histories.get(id)?.agency||evidence.get(nameKey(e.name)+'|'+id)?.agency}));
  const automatic=e.identityMethod==='rup'||e.identityMethod==='annual';const agentId=e.approved?e.agentId:!automatic&&e.agentId?e.agentId:candidates.length===1?candidates[0].id:undefined;
  const proof=agentId?evidence.get(nameKey(e.name)+'|'+agentId):undefined;const certain=candidates.length===1&&candidates[0].id===agentId;
  return {...e,salaryReference:e.approved?e.salaryReference:salaryChecks?.references.get(e.id),...(!e.approved&&e.kind==='mutation'?{gfDelta:e.gfDelta??0,...(e.note==='Évolution GF non reconnue : vérifier la ligne.'?{note:undefined}:{})}:{}),agentId,candidates,...(!e.approved&&certain?{identityMethod:(e.identityMethod==='manual'&&e.agentId?'manual':proof?'rup':'annual') as CspEvent['identityMethod'],identitySource:proof?.source,identityDate:proof?.date,...(e.kind==='admission'?{newAgent:true}:{})}:{})};
 });
 const existing=[...prior].sort((a,b)=>(a.created||'').localeCompare(b.created||'')).filter(i=>i.status==='validated').flatMap(i=>i.events.filter(e=>e.selected&&!e.candidacy));const known=new Map(existing.map(e=>[cspKey(e),e]));
 const state=new Map(snapshot(data,base.id).map(r=>[r.agentId,r as AgentRecord]));
 const combined=[...existing.map(e=>({event:e,prior:true})),...resolved.map(e=>({event:e,prior:false}))].sort((a,b)=>a.event.effective.localeCompare(b.event.effective)||Number(b.prior)-Number(a.prior));
 const results=new Map<string,CspPreview>();const seen=new Set<string>();const salaryHistory=new Map<string,AgentRecord[]>();
 for(const {event:e,prior:isPrior} of combined){
  const key=cspKey(e);if(isPrior){if(e.effective>base.date&&!seen.has(key)){seen.add(key);const current=state.get(e.agentId!);const historical=e.kind==='posthume'?cspHistoricalRecord(data,e.agentId!,e.effective):undefined;const posthume=posthumousReference(current,e,historical);const before=salaryReferenceRow(posthume.before,e);const a=applyEvent(before,e,salaryHistory.get(e.agentId!));if(!posthume.historicalOnly)rememberSalary(salaryHistory,before,a.row,e);if(a.row&&!posthume.historicalOnly)state.set(e.agentId!,a.row);}continue;}
  const current=state.get(e.agentId!);const historical=e.kind==='posthume'?cspHistoricalRecord(data,e.agentId!,e.effective):undefined;const posthume=posthumousReference(current,e,historical);const historicalPosthume=posthume.historicalOnly;const before=salaryReferenceRow(posthume.before,e);const out:CspPreview={...e,before:before?summary(before):undefined,state:'ready',problem:''};
  if(e.candidacy&&cspNonRetained(e)){out.state='not-retained';out.problem=e.nonRetainedByRD?.reason==='unfilled-post'?'Traité automatiquement : le RD entièrement validé « '+e.nonRetainedByRD.name+' » ne comporte aucune nomination pour ce poste. Candidature non retenue, poste non pourvu ; aucun effet sur la situation RH.':e.nonRetainedByRD?'Traité automatiquement : le RD « '+e.nonRetainedByRD.name+' » désigne un ou plusieurs autres candidats pour ce poste. Aucun effet sur la situation RH.':'Candidature clôturée sans nomination : aucun effet sur la situation de l’agent. Conservée dans le bordereau.';}
  else if(!e.selected){out.state='excluded';out.problem='Écarté de cet import.';}
  else if(e.candidacy){out.state='blocked';out.problem='En attente du RD : aucune prise de poste confirmée.';}
  else if(e.extractionIssue){out.state='blocked';out.problem=e.extractionIssue;}
  else if(!e.agentId){out.state='blocked';out.problem=(e as CspPreview).candidates?.length?'Plusieurs agents possibles : choisir le NNI.':'Agent non rapproché : choisir le NNI ou confirmer une arrivée.';}
  else if(salaryChecks?.problems.has(e.id)){out.state='blocked';out.problem=salaryChecks.problems.get(e.id)!;}
  else if(known.has(key)||seen.has(key)){const old=known.get(key);const conflict=old&&['gfAfter','nrAfter'].some(k=>{const prior=(old as any)[k]??(old.recordedAfter as any)?.[k==='gfAfter'?'gf':'nr'];return (e as any)[k]!==undefined&&prior!==undefined&&(e as any)[k]!==prior;});out.state=conflict?'blocked':'duplicate';out.problem=conflict?'Une autre version de cette décision indique une situation après différente. Corriger le relevé existant.':'Décision identique déjà présente : aucun cumul.';}
  else if(e.effective<=base.date){out.state=['admission','posthume','mutation'].includes(e.kind)||e.gfDelta===0?'ready':'covered';out.problem='Antérieure ou égale à la photographie : conservée dans l’historique, sans réapplication.';}
  else {const applied=applyEvent(before,e,salaryHistory.get(e.agentId!));rememberSalary(salaryHistory,before,applied.row,e);if(applied.problem){out.state='blocked';out.problem=applied.problem;}else{out.after=summary(applied.row!);if(!historicalPosthume&&(e.kind!=='posthume'||state.has(e.agentId!)))state.set(e.agentId!,applied.row!);seen.add(key);if(e.effective>parisToday()){out.state='scheduled';out.problem='S’appliquera à sa date d’effet.';}else if(nominationNRSteps(e,before))out.problem='Nomination interne : +'+e.gfDelta+' GF et +2 NR (soit +10), calculés à partir de la situation connue.';else if(e.kind==='mutation')out.problem=e.newAgent?'Mutation interunités : arrivée dans l’ULM confirmée au '+e.effective+'. Aucun gain de GF ni de NR.'+(applied.row?.nr===undefined?' NR d’entrée inconnu : rémunération non calculable.':''):'Mutation d’office interne : GF et NR conservés.';else if(e.salaryReference)out.problem='Référence GF/NR établie par l’ODJ (page '+e.salaryReference.cr.page+'), mesure confirmée par le RD (page '+e.salaryReference.rd.page+'), identité confirmée par le RUP. Une seule application.';else if(applied.row?.nrProvisional)out.problem='GF constant : NR non précisé dans le RD, dernière valeur connue conservée.';}}
  results.set(e.id,out);
 }
 // The projected set is intentionally not returned: preview contains changed fields only.
 void meetingDate;
 return resolved.map(e=>results.get(e.id)!);
}
export function summary(r:Partial<AgentRecord>){return {gf:r.gf,nr:r.nr,agency:r.agency,job:r.job,team:r.team,...(r.nrProvisional?{nrProvisional:true}:{})};}
export function projectCsp(data:AgentData,imports:CspImport[],asOf=parisToday(),attach=true):{data:AgentData;issues:{event:CspEvent;problem:string}[];base?:AgentSource}{
 const base=latestAnnual(data,asOf),active=imports.filter(i=>i.status==='validated');if(!base||!active.length||asOf<base.date)return {data,issues:[],base};
 const state=new Map(snapshot(data,base.id).map(r=>[r.agentId,r as AgentRecord]));const stages=new Map<string,Map<string,AgentRecord>>();const salaryHistory=new Map<string,AgentRecord[]>();const seen=new Set<string>();const issues:{event:CspEvent;problem:string}[]=[];
 const events=[...active].sort((a,b)=>(a.created||'').localeCompare(b.created||'')).flatMap((i,order)=>i.events.filter(e=>e.selected&&!e.candidacy).map((e,index)=>({...e,importId:i.id,order,index}))).sort((a,b)=>a.effective.localeCompare(b.effective)||a.order-b.order||a.index-b.index);
 for(const e of events){if(e.effective<=base.date||e.effective>asOf)continue;const key=cspKey(e);if(seen.has(key))continue;seen.add(key);const present=state.has(e.agentId!);if(e.salaryReference&&!salaryReferenceSupported(e,imports)){issues.push({event:e,problem:'Référence ODJ/RD de la mesure salariale désactivée ou modifiée : vérifier la décision.'});continue;}const current=state.get(e.agentId!);const historical=e.kind==='posthume'?cspHistoricalRecord(data,e.agentId!,e.effective):undefined;const posthume=posthumousReference(current,e,historical);const before=salaryReferenceRow(posthume.before,e);const result=applyEvent(before,e,salaryHistory.get(e.agentId!));if(!posthume.historicalOnly)rememberSalary(salaryHistory,before,result.row,e);if(result.row){if(e.kind==='posthume'&&!present)continue;if(posthume.historicalOnly)continue;state.set(e.agentId!,result.row);const rows=stages.get(e.effective)||new Map<string,AgentRecord>();rows.set(e.agentId!,result.row);stages.set(e.effective,rows);}else issues.push({event:e,problem:result.problem});}
 if(!attach)return {data,issues,base};
 const source:AgentSource={...base,id:CSP_SOURCE,kind:'csp',baseSource:base.id,name:'Situation actualisée par les CSP',label:'Situation actualisée au '+asOf+' · CSP',date:asOf,seniorityDate:asOf,hash:'',primary:false,status:'validated',confidence:'Photographie du '+base.date+' + décisions CSP ; sorties non couvertes',rows:state.size,agents:state.size,sheet:'Décisions CSP'};
 const records=[...state.values()].map(r=>({...r,id:CSP_SOURCE+':'+r.agentId,source:CSP_SOURCE,originalSource:r.source,gfYears:r.gfDate?Math.max(0,(+new Date(asOf)-+new Date(r.gfDate))/(365.2425*86400000)):r.gfYears,nrYears:r.nrDate?Math.max(0,(+new Date(asOf)-+new Date(r.nrDate))/(365.2425*86400000)):r.nrYears,seniorityDate:r.seniorityDate||base.seniorityDate}));
 const stageSources:AgentSource[]=[],stageRecords:AgentRecord[]=[];
 for(const [date,rows] of stages){const id='csp-date:'+date;stageSources.push({...source,id,kind:'csp-event',date,seniorityDate:date,label:'Décisions CSP · effet au '+date,primary:false,rows:rows.size,agents:rows.size});for(const r of rows.values())stageRecords.push({...r,id:id+':'+r.agentId,source:id,originalSource:r.source,seniorityDate:r.seniorityDate||base.seniorityDate});}
 return {data:{...data,sources:[...data.sources,...stageSources,source],records:[...data.records,...stageRecords,...records]},issues,base};
}

// A posthumous award is recorded against its documented historical NR,
// not added again to a later/current NR already held by the agent.
function posthumousReference(current:AgentRecord|undefined,e:CspEvent,historical?:AgentRecord){
 if(e.kind!=='posthume'||!current||e.nrBefore===undefined||current.nr===e.nrBefore)return {before:current||historical,historicalOnly:false};
 const steps=cspNRSteps(e);
 if(!steps||steps<1||e.nrAfter===undefined||e.nrAfter!==e.nrBefore+steps*5)return {before:current,historicalOnly:false};
 if(e.gfBefore!==undefined&&current.gf!==undefined&&historical?.gf!==e.gfBefore&&current.gf!==e.gfBefore)return {before:current,historicalOnly:false};
 const before=historical?.nr===e.nrBefore?historical:{...current,nr:e.nrBefore};
 return {before,historicalOnly:true};
}
function cspHistoricalRecord(data:AgentData,agentId:string,asOf:string){
 const sources=data.sources.filter(s=>!s.kind?.startsWith('csp')&&s.status!=='review'&&!s.status?.startsWith('disabled')&&s.date<=asOf).sort((a,b)=>b.date.localeCompare(a.date)||Number(b.primary)-Number(a.primary));
 for(const source of sources){const rows=data.records.filter(r=>r.agentId===agentId&&r.source===source.id);if(rows.length)return snapshot({...data,records:rows},source.id)[0];}
}
export function cspResolvedEvent(e:CspEvent,p:CspPreview):CspEvent{return {...e,nonRetainedByRD:p.nonRetainedByRD,...(p.acknowledgedByDocument?{acknowledgedByDocument:p.acknowledgedByDocument,approved:true,approvedAt:p.approvedAt,recordedBefore:p.recordedBefore,recordedAfter:p.recordedAfter}:{}),...(!e.approved&&e.kind==='mutation'?{gfDelta:p.gfDelta,note:p.note,...(e.newAgent?{gfBefore:p.gfBefore,gfAfter:p.gfAfter,nrBefore:p.nrBefore,nrAfter:p.nrAfter}: {})}:{}),agentId:p.agentId,newAgent:p.newAgent,identityMethod:p.identityMethod,identitySource:p.identitySource,identityDate:p.identityDate,salaryReference:e.approved?e.salaryReference:p.salaryReference};}


// This is a reference for one validated salary decision, never a backdated
// annual photograph, an arrival, or an IEG seniority date.
function salaryReferenceRow(row:AgentRecord|undefined,e:CspEvent):AgentRecord|undefined{
 const ref=e.salaryReference;if(e.kind!=='mesure'||!ref||ref.nni!==e.agentId||ref.effective!==e.effective)return row;
 if(row)return {...row,gf:row.gf??ref.gf,nr:row.nr??ref.nr};
 return {id:'csp-reference:'+e.id,agentId:ref.nni,nni:ref.nni,name:e.name,source:CSP_SOURCE,row:e.page,gf:ref.gf,nr:ref.nr,agency:ref.agency};
}
export function salaryReferenceSupported(e:CspEvent,documents:CspImport[]):boolean{
 const r=e.salaryReference;if(!r)return true;
 if(e.kind!=='mesure'||r.nni!==e.agentId||r.effective!==e.effective||r.nrAfter!==r.nr+r.steps*5)return false;
 const get=(proof:CspSalaryReference['cr'],type:'cr'|'rd')=>{
  const d=documents.find(d=>d.id===proof.id&&!d.status.startsWith('disabled')&&(d.documentType==='cr'?'cr':'rd')===type);
  return d&&(d.evidenceEvents||d.events).find(v=>v.id===proof.eventId&&v.selected&&!v.candidacy&&!v.extractionIssue&&v.kind==='mesure'&&nameKey(v.name)===nameKey(e.name)&&(!v.agentId||v.agentId===e.agentId)&&v.effective===r.effective);
 };
 const cr=get(r.cr,'cr'),rd=get(r.rd,'rd');
 return !!cr&&!!rd&&cr.gfBefore===r.gf&&cr.nrBefore===r.nr&&cr.nrAfter===r.nrAfter&&[cr,rd].every(v=>cspNRSteps(v)===r.steps&&(v.gfDelta??0)===0&&(v.gfBefore===undefined||v.gfBefore===r.gf)&&(v.gfAfter===undefined||v.gfAfter===r.gf)&&(v.nrBefore===undefined||v.nrBefore===r.nr)&&(v.nrAfter===undefined||v.nrAfter===r.nrAfter));
}
