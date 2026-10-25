import {normalName,normalizeNNI,snapshot,formattedSnapshot} from './agents.ts';
import type {AgentData,AgentRecord,AgentSource} from './agents.ts';

export const CSP_SOURCE='csp-current';
export const cspKinds={admission:'Admission au stage',titularisation:'Titularisation',mutation:'Mutation d’office',reclassement:'Reclassement',avancement:'Avancement au choix',posthume:'Avancement à titre posthume',mesure:'Mesure salariale',nomination:'Nomination'};
export type CspKind=keyof typeof cspKinds;
export type CspEvent={id:string;name:string;agentId?:string;kind:CspKind;effective:string;page:number;pages?:number[];agency?:string;job?:string;team?:string;m3e?:string;location?:string;reference?:string;gfDelta?:number;nrSteps?:number;gfBefore?:number;gfAfter?:number;nrBefore?:number;nrAfter?:number;selected:boolean;approved?:boolean;approvedAt?:string;note?:string;nrConfirmed?:boolean;newAgent?:boolean;recordedBefore?:Partial<AgentRecord>;recordedAfter?:Partial<AgentRecord>};
export type CspImport={id:string;name:string;date:string;status:string;created?:string;events:CspEvent[]};
export type CspPreview=CspEvent&{state:string;problem:string;before?:Partial<AgentRecord>;after?:Partial<AgentRecord>;candidates?:{id:string;name:string;agency?:string}[]};
export function validDate(v:unknown):v is string {if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v&&v>='2000-01-01'&&v<='2100-12-31';}
export const parisToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const nameKey=(name:string)=>normalName(name).split(' ').sort().join(' ');
// A salary measure is one NR step unless an explicit count or absolute NR is supplied.
export const cspNRSteps=(e:CspEvent)=>e.nrSteps??(e.kind==='mesure'&&e.nrAfter===undefined?1:undefined);
export function cspKey(e:CspEvent){
 const identity=[e.agentId||nameKey(e.name),e.kind,e.effective],nrSteps=cspNRSteps(e);
 if(e.kind==='reclassement')return JSON.stringify([...identity,e.gfDelta??null]);
 if(['avancement','mesure','posthume'].includes(e.kind))return JSON.stringify([...identity,nrSteps??(e.nrBefore!==undefined&&e.nrAfter!==undefined?(e.nrAfter-e.nrBefore)/5:null),nrSteps===undefined&&e.nrBefore===undefined?e.nrAfter??null:null]);
 if(e.kind==='titularisation')return JSON.stringify(identity);
 if(e.kind==='nomination'&&e.reference)return JSON.stringify([...identity,e.reference]);
 return JSON.stringify([...identity,e.gfDelta??null,e.nrSteps??null,e.gfAfter??null,e.nrAfter??null,normalName(e.agency),normalName(e.job),normalName(e.team),e.m3e||'',e.reference||'']);
}
export function deduplicateCsp(events:CspEvent[]){const unique=new Map<string,CspEvent>();for(const e of events){const k=cspKey(e),prior=unique.get(k);if(prior)prior.pages=[...new Set([...(prior.pages||[prior.page]),...(e.pages||[e.page])])].sort((a,b)=>a-b);else unique.set(k,{...e,pages:e.pages||[e.page]});}return [...unique.values()];}
export function validateCspEvent(e:any):e is CspEvent {
 return !!e&&typeof e.id==='string'&&e.id.length<=100&&typeof e.name==='string'&&e.name.trim().length>2&&e.name.length<180&&Object.hasOwn(cspKinds,e.kind)&&(validDate(e.effective)||!e.selected&&e.effective==='')&&Number.isInteger(e.page)&&e.page>=1&&e.page<=250&&typeof e.selected==='boolean'&&(!e.agentId||normalizeNNI(e.agentId)===e.agentId)&&['agency','job','team','m3e','location','reference','note'].every(k=>e[k]===undefined||typeof e[k]==='string'&&e[k].length<=500)&&['gfDelta','nrSteps','gfBefore','gfAfter','nrBefore','nrAfter'].every(k=>e[k]===undefined||Number.isInteger(e[k])&&e[k]>=0&&e[k]<1000)&&['gfBefore','gfAfter'].every(k=>e[k]===undefined||e[k]>=1&&e[k]<=30)&&(e.gfDelta===undefined||e.gfDelta<=10)&&(e.nrSteps===undefined||e.nrSteps<=20)&&(!e.pages||Array.isArray(e.pages)&&e.pages.length<=250&&e.pages.every((p:any)=>Number.isInteger(p)&&p>=1&&p<=250))&&['newAgent','nrConfirmed'].every(k=>e[k]===undefined||typeof e[k]==='boolean');
}
export function latestAnnual(data:AgentData,asOf='2100-12-31'){const candidates=data.sources.filter(s=>!s.kind?.startsWith('csp')&&s.status!=='review'&&!s.status?.startsWith('disabled')&&s.date<=asOf);const complete=candidates.filter(s=>s.primary);return (complete.length?complete:candidates.filter(s=>s.status==='validated')).sort((a,b)=>b.date.localeCompare(a.date)||Number(formattedSnapshot(b))-Number(formattedSnapshot(a))||a.id.localeCompare(b.id))[0];}
function applyEvent(row:AgentRecord|undefined,e:CspEvent):{row?:AgentRecord;problem:string}{
 const nrSteps=cspNRSteps(e);
 const required=new Set<string>();if(nrSteps||e.kind==='reclassement')required.add('nr');if(e.gfDelta||e.kind==='reclassement')required.add('gf');if(e.gfBefore!==undefined)required.add('gf');if(e.nrBefore!==undefined)required.add('nr');
 const conflicts=((row as any)?.conflicts||[]).filter((field:string)=>required.has(field));
 if(conflicts.length)return {problem:'Valeur de départ contradictoire : '+conflicts.map((s:string)=>s.toUpperCase()).join(', ')+'. Renseigner une situation de référence fiable avant ce mouvement.'};
 if(!row&&!e.newAgent)return {problem:'Agent absent de la photographie : confirmer une arrivée dans l’ULM et renseigner son NNI.'};
 if(!row&&!['admission','nomination'].includes(e.kind))return {problem:'Ce mouvement ne permet pas de créer une arrivée.'};
 if(!row&&(!e.agentId||!e.agency||!e.job))return {problem:'Une arrivée exige un NNI, une agence et un emploi de destination.'};
 const after:AgentRecord={...(row||{id:'csp:'+e.id,agentId:e.agentId!,nni:e.agentId!,name:e.name,source:CSP_SOURCE,row:e.page}),name:row?.name||e.name};
 for(const [field,before] of [['gf',e.gfBefore],['nr',e.nrBefore]] as const)if(row&&before!==undefined&&row[field]!==before)return {problem:`${field.toUpperCase()} avant (${before}) différent de la situation connue (${row?.[field]??'inconnue'}). Vérifier l’ordre et les décisions déjà incluses.`};
 if(['avancement','mesure','posthume'].includes(e.kind)&&!nrSteps&&e.nrAfter===undefined)return {problem:'Nombre de NR non renseigné.'};
 if(e.kind==='mutation'&&e.gfDelta===undefined&&e.gfAfter===undefined)return {problem:'Évolution du GF non renseignée.'};
 let gf=row?.gf??(e.newAgent?e.gfBefore:undefined),nr=row?.nr??(e.newAgent?e.nrBefore:undefined);
 if(e.kind==='reclassement'){
  const delta=e.gfDelta??0;if(delta<1||gf===undefined||nr===undefined)return {problem:'GF et NR de départ nécessaires pour le reclassement.'};
  gf+=delta;nr+=delta*10;
 }else{
  if(e.gfDelta){if(gf===undefined)return {problem:'GF de départ inconnu.'};gf+=e.gfDelta;}
  if(nrSteps){if(nr===undefined)return {problem:'NR de départ inconnu.'};nr+=nrSteps*5;}
 }
 if(e.gfAfter!==undefined){if((e.gfDelta||e.kind==='reclassement')&&gf!==e.gfAfter)return {problem:'Le GF après contredit la progression indiquée.'};gf=e.gfAfter;}
 if(e.nrAfter!==undefined){if((nrSteps||e.kind==='reclassement')&&nr!==e.nrAfter)return {problem:'Le NR après contredit la progression indiquée.'};nr=e.nrAfter;}
 if(e.nrConfirmed&&nr===undefined)return {problem:'Impossible de confirmer un NR inchangé sans NR de départ connu.'};
 if(e.kind==='nomination'&&e.nrAfter===undefined&&!e.nrConfirmed)return {problem:'Nomination : renseigner le NR après ou confirmer explicitement un NR inchangé.'};
 if(e.kind==='mutation'&&e.gfDelta&&e.nrAfter===undefined&&!e.nrConfirmed)return {problem:'Mutation avec gain de GF : renseigner le NR après.'};
 if(!row&&gf===undefined)return {problem:'Renseigner le GF avant ou après de la personne arrivant dans l’ULM.'};
 if(e.kind==='admission'&&gf===undefined)return {problem:'GF d’admission à renseigner.'};
 if(gf!==undefined&&(gf<1||gf>30)||nr!==undefined&&(nr<1||nr>999))return {problem:'GF ou NR calculé hors limites.'};
 if(gf!==undefined){after.gf=gf;after.college=gf>=12?'cadres':gf>=7?'maitrise':'execution';if(row?.gf!==gf){after.gfDate=e.effective;after.gfYears=0;}}
 if(nr!==undefined){after.nr=nr;if(row?.nr!==nr){after.nrDate=e.effective;after.nrYears=0;}}
 if(['admission','mutation','nomination'].includes(e.kind)){if(e.agency)after.agency=e.agency;if(e.job){if(row?.job&&normalName(row.job)!==normalName(e.job)&&!e.m3e)delete after.m3e;after.job=e.job;}if(e.team)after.team=e.team;if(e.m3e)after.m3e=e.m3e;}
 if(e.kind==='titularisation')after.presence='Titulaire';
 if(!row){after.entryUnit=e.effective;if(e.kind==='admission')after.presence='Stagiaire';}
 return {row:after,problem:''};
}
export function prepareCsp(data:AgentData,events:CspEvent[],prior:CspImport[]=[],meetingDate=parisToday()):CspPreview[]{
 const base=latestAnnual(data);if(!base)return events.map(e=>({...e,state:'blocked',problem:'Aucune photographie annuelle de référence.'}));
 const histories=new Map<string,AgentRecord>();const dateById=new Map(data.sources.map(s=>[s.id,s.date]));
 for(const r of [...data.records].sort((a,b)=>(dateById.get(a.source)||'').localeCompare(dateById.get(b.source)||'')))if(r.nni)histories.set(r.agentId,r);
 const names=new Map<string,Set<string>>();for(const r of data.records)if(r.nni){const k=nameKey(r.name),ids=names.get(k)||new Set();ids.add(r.agentId);names.set(k,ids);}
 const resolved=events.map(e=>{const candidates=[...(names.get(nameKey(e.name))||[])].map(id=>({id,name:histories.get(id)!.name,agency:histories.get(id)?.agency}));return {...e,agentId:e.agentId||(candidates.length===1?candidates[0].id:undefined),candidates};});
 const existing=[...prior].sort((a,b)=>(a.created||'').localeCompare(b.created||'')).filter(i=>i.status==='validated').flatMap(i=>i.events.filter(e=>e.selected));const known=new Map(existing.map(e=>[cspKey(e),e]));
 const state=new Map(snapshot(data,base.id).map(r=>[r.agentId,r as AgentRecord]));
 const combined=[...existing.map(e=>({event:e,prior:true})),...resolved.map(e=>({event:e,prior:false}))].sort((a,b)=>a.event.effective.localeCompare(b.event.effective)||Number(b.prior)-Number(a.prior));
 const results=new Map<string,CspPreview>();const seen=new Set<string>();
 for(const {event:e,prior:isPrior} of combined){
  const key=cspKey(e);if(isPrior){if(e.effective>base.date&&!seen.has(key)){seen.add(key);const a=applyEvent(state.get(e.agentId!),e);if(a.row)state.set(e.agentId!,a.row);}continue;}
  const before=state.get(e.agentId!);const out:CspPreview={...e,before:before?summary(before):undefined,state:'ready',problem:''};
  if(!e.selected){out.state='excluded';out.problem='Écarté de cet import.';}
  else if(!e.agentId){out.state='blocked';out.problem=(e as CspPreview).candidates?.length?'Plusieurs agents possibles : choisir le NNI.':'Agent non rapproché : choisir le NNI ou confirmer une arrivée.';}
  else if(known.has(key)||seen.has(key)){const old=known.get(key);const conflict=old&&['gfAfter','nrAfter'].some(k=>{const prior=(old as any)[k]??(old.recordedAfter as any)?.[k==='gfAfter'?'gf':'nr'];return (e as any)[k]!==undefined&&prior!==undefined&&(e as any)[k]!==prior;});out.state=conflict?'blocked':'duplicate';out.problem=conflict?'Une autre version de cette décision indique une situation après différente. Corriger le relevé existant.':'Décision identique déjà présente : aucun cumul.';}
  else if(e.effective<=base.date){out.state='covered';out.problem='Antérieure ou égale à la photographie : conservée dans l’historique, sans réapplication.';}
  else {const applied=applyEvent(before,e);if(applied.problem){out.state='blocked';out.problem=applied.problem;}else{out.after=summary(applied.row!);state.set(e.agentId!,applied.row!);seen.add(key);if(e.effective>parisToday()){out.state='scheduled';out.problem='S’appliquera à sa date d’effet.';}}}
  results.set(e.id,out);
 }
 // The projected set is intentionally not returned: preview contains changed fields only.
 void meetingDate;
 return resolved.map(e=>results.get(e.id)!);
}
export function summary(r:Partial<AgentRecord>){return {gf:r.gf,nr:r.nr,agency:r.agency,job:r.job,team:r.team};}
export function projectCsp(data:AgentData,imports:CspImport[],asOf=parisToday(),attach=true):{data:AgentData;issues:{event:CspEvent;problem:string}[];base?:AgentSource}{
 const base=latestAnnual(data,asOf),active=imports.filter(i=>i.status==='validated');if(!base||!active.length||asOf<base.date)return {data,issues:[],base};
 const state=new Map(snapshot(data,base.id).map(r=>[r.agentId,r as AgentRecord]));const stages=new Map<string,Map<string,AgentRecord>>();const seen=new Set<string>();const issues:{event:CspEvent;problem:string}[]=[];
 const events=[...active].sort((a,b)=>(a.created||'').localeCompare(b.created||'')).flatMap((i,order)=>i.events.filter(e=>e.selected).map((e,index)=>({...e,importId:i.id,order,index}))).sort((a,b)=>a.effective.localeCompare(b.effective)||a.order-b.order||a.index-b.index);
 for(const e of events){if(e.effective<=base.date||e.effective>asOf)continue;const key=cspKey(e);if(seen.has(key))continue;seen.add(key);const result=applyEvent(state.get(e.agentId!),e);if(result.row){state.set(e.agentId!,result.row);const rows=stages.get(e.effective)||new Map<string,AgentRecord>();rows.set(e.agentId!,result.row);stages.set(e.effective,rows);}else issues.push({event:e,problem:result.problem});}
 if(!attach)return {data,issues,base};
 const source:AgentSource={...base,id:CSP_SOURCE,kind:'csp',baseSource:base.id,name:'Situation actualisée par les CSP',label:'Situation actualisée au '+asOf+' · CSP',date:asOf,seniorityDate:asOf,hash:'',primary:false,status:'validated',confidence:'Photographie du '+base.date+' + décisions CSP ; sorties non couvertes',rows:state.size,agents:state.size,sheet:'Décisions CSP'};
 const records=[...state.values()].map(r=>({...r,id:CSP_SOURCE+':'+r.agentId,source:CSP_SOURCE,originalSource:r.source,gfYears:r.gfDate?Math.max(0,(+new Date(asOf)-+new Date(r.gfDate))/(365.2425*86400000)):r.gfYears,nrYears:r.nrDate?Math.max(0,(+new Date(asOf)-+new Date(r.nrDate))/(365.2425*86400000)):r.nrYears,seniorityDate:r.seniorityDate||base.seniorityDate}));
 const stageSources:AgentSource[]=[],stageRecords:AgentRecord[]=[];
 for(const [date,rows] of stages){const id='csp-date:'+date;stageSources.push({...source,id,kind:'csp-event',date,seniorityDate:date,label:'Décisions CSP · effet au '+date,primary:false,rows:rows.size,agents:rows.size});for(const r of rows.values())stageRecords.push({...r,id:id+':'+r.agentId,source:id,originalSource:r.source,seniorityDate:r.seniorityDate||base.seniorityDate});}
 return {data:{...data,sources:[...data.sources,...stageSources,source],records:[...data.records,...stageRecords,...records]},issues,base};
}
