import {cspNameKey,findCspRupIdentities} from './csp-rup';
import type {CspEvent} from './csp';
import {activeCspEvents} from './csp-validation';
import {projectCsp,parisToday} from './csp';
import type {CspImport} from './csp';
import {accessError} from './access';
import {rupSeedText,packedText,loadSeeds} from '../../server/seeds';
import {withRupCareer,withRupSex} from './rup';
import type {RupData} from './rup';
import {resources} from './store';

import {unpackAgentSeed,normalizeNNI,withConfirmedPresence} from './agents';
import type {AgentData,AgentRecord} from './agents';
let decoded:AgentData|undefined;
export function agentBase(){return decoded ||=unpackAgentSeed(JSON.parse(packedText));}
export async function agentAuth(request:Request,write=false){const denied=accessError(request,write);if(denied){const body=await denied.json() as {error:string};throw Object.assign(Error(body.error),{status:denied.status});}}
export const agentError=(e:any)=>Response.json({error:e?.message||'Opération impossible.'},{status:e?.status||500,headers:{'Cache-Control':'no-store'}});
export async function agentData(skipCareerEnrichment=false,focusAgentId?:string,asOf=parisToday(),includeCsp=true){const base=agentBase();const {db,bucket}=resources();const result=await db.prepare('SELECT * FROM agent_imports ORDER BY date,created').all<any>();const rup:RupData=includeCsp?JSON.parse(rupSeedText):{sources:[],records:[]};const disabled=includeCsp?(await db.prepare('SELECT source_id FROM rup_source_exclusions').all<{source_id:string}>()).results:[];const disabledIds=new Set(disabled.map(x=>x.source_id));rup.sources=rup.sources.filter(x=>!disabledIds.has(x.id));rup.records=rup.records.filter(x=>!disabledIds.has(x.source));const data:AgentData={...base,records:[...base.records],sources:[...base.sources],events:base.events};const cspImports:CspImport[]=[];for(const m of result.results){const detail=JSON.parse(m.detail||'{}');if(detail.kind==='csp'){cspImports.push({id:m.id,name:m.name,date:m.date,status:m.status,created:m.created,documentType:detail.documentType==='cr'?'cr':'rd',evidenceEvents:detail.events||[],events:activeCspEvents(detail)});continue;}if(detail.kind==='rup'){if(includeCsp&&m.status==='validated'&&!disabledIds.has(m.id)){const object=await bucket.get('agents/'+m.id+'/records.json');if(object){rup.sources.push({id:m.id,name:m.name,hash:m.hash,date:m.date,count:m.count,status:m.status});rup.records.push(...await object.json<any[]>());}}continue;}data.sources.push({id:m.id,name:m.name,hash:m.hash,date:m.date,label:m.date+' · '+m.name,sheet:'Import validé',primary:!!m.complete,...JSON.parse(m.detail||'{}'),confidence:'date choisie lors de l’import',seniorityDate:m.date,rows:m.count,agents:m.count,status:m.status});if(m.status==='validated'){const object=await bucket.get('agents/'+m.id+'/records.json');if(object){const rows=await object.json<AgentRecord[]>();data.records.push(...rows);}}}
const decisions=(await db.prepare('SELECT * FROM agent_decisions ORDER BY created,id').all<any>()).results;const links=new Map<string,string>();for(const d of decisions)if(d.kind==='link'&&d.target)links.set(d.agent,d.target);else if(d.kind==='unlink')links.delete(d.agent);data.records=data.records.map(r=>links.has(r.agentId)?{...r,agentId:links.get(r.agentId)!,nni:links.get(r.agentId),matchStatus:'rapprochement validé'}:r);
 const corrections:Record<string,{date:string;source:string;row:number|null;contract:string;reason:string;actor:string;created:string}>={};
 for(const d of decisions){
  const agent=links.get(d.agent)||d.agent;
  if(d.kind==='career_auto'){delete corrections[agent];continue;}
  if(d.kind!=='career_rup')continue;
  try{const v=JSON.parse(d.note||'{}');if(typeof v.date==='string'&&(typeof v.row==='number'||v.row===null)&&typeof d.source==='string'&&typeof v.reason==='string')corrections[agent]={date:v.date,source:d.source,row:v.row,contract:String(v.contract||''),reason:v.reason,actor:String(v.actor||''),created:d.created};}catch{}
 }
 rup.corrections=corrections;
 if(focusAgentId){data.records=data.records.filter(r=>r.agentId===focusAgentId);data.events=data.events.filter(e=>e.agentId===focusAgentId);rup.records=rup.records.filter(r=>r.nni===focusAgentId);}// Enrich sex only once; presence records inherit it from their source.
 // Historical observed records are used for movement comparisons, where
 // career dates are irrelevant and should not trigger another RUP traversal.
 const observedData=includeCsp?withRupSex(data,rup):data;
 const present=withConfirmedPresence(observedData,decisions);
 const projected=includeCsp?projectCsp(present,focusAgentId?cspImports.map(i=>({...i,events:i.events.filter(e=>e.agentId===focusAgentId)})):cspImports,asOf):{data:present,issues:[]};
 if(includeCsp&&projected.data!==present){const known=new Set(present.records.map(r=>r.agentId));const fresh=projected.data.records.filter(r=>r.nni&&!known.has(r.agentId));if(fresh.length){const ids=new Set(fresh.map(r=>r.nni));const enriched=withRupSex({...projected.data,records:fresh},{...rup,records:rup.records.filter(r=>ids.has(r.nni))});const byId=new Map(enriched.records.map(r=>[r.id,r]));projected.data={...projected.data,records:projected.data.records.map(r=>byId.get(r.id)||r)};}}
 return {data:skipCareerEnrichment?projected.data:withRupCareer(projected.data,rup),observedData,decisions,cspImports,cspIssues:projected.issues};}
export async function decision(request:Request){await agentAuth(request,true);const b:any=await request.json();if(!['link','unlink','departure','absence','return','dismiss','restore','executive','executive_manual','executive_remove','executive_update','career_rup','career_auto'].includes(b.kind)||typeof b.agent!=='string'||b.agent.length>100||String(b.note||'').length>1000)throw Object.assign(Error('Décision invalide.'),{status:400});const {db}=resources();
if(b.kind==='career_rup'||b.kind==='career_auto'){
 const nni=normalizeNNI(b.agent);
 if(!nni||nni!==b.agent)throw Object.assign(Error('La correction exige une identité NNI rapprochée.'),{status:400});
 const reason=String(b.note||'').trim();
 if(reason.length<5||reason.length>1000)throw Object.assign(Error('Indiquer un motif de correction (5 à 1 000 caractères).'),{status:400});
 // Validate against the selected ACTIVE RUP itself, not against a full
 // enrichment of every historical situation. Reused labels are not IDs.
 const {bucket}=resources();
 let source:string|null=null;let note='';
 if(b.kind==='career_rup'){
  if(typeof b.source!=='string'||typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||(b.row!==null&&b.row!==undefined&&(!Number.isInteger(b.row)||b.row<1)))throw Object.assign(Error('Choisir une date et une référence RUP valides.'),{status:400});
  if(await db.prepare('SELECT source_id FROM rup_source_exclusions WHERE source_id=?').bind(b.source).first())throw Object.assign(Error('La référence RUP choisie est désactivée. Choisir un import actif.'),{status:400});
  const rup=JSON.parse(rupSeedText) as RupData;
  let matching:any[]=[];
  if(rup.sources.some(s=>s.id===b.source)){
   matching=rup.records.filter(r=>r.source===b.source&&r.nni===nni);
  }else{
   const imported=await db.prepare('SELECT status,detail FROM agent_imports WHERE id=?').bind(b.source).first<any>();
   let detail:any={};try{detail=JSON.parse(imported?.detail||'{}');}catch{}
   if(imported?.status!=='validated'||detail.kind!=='rup')throw Object.assign(Error('La référence RUP sélectionnée n’est pas un import actif validé.'),{status:400});
   const object=await bucket.get('agents/'+b.source+'/records.json');
   if(!object)throw Object.assign(Error('Les lignes du RUP actif sont introuvables.'),{status:404});
   matching=(await object.json<any[]>()).filter(r=>r.nni===nni);
  }
  const row=Number.isInteger(b.row)?b.row:null;
  const contract=String(b.contract||'').trim();
  const verified=matching.find(r=>r.entreeIEG===b.date&&(row===null?String(r.contrat||'').trim()===contract:r.row===row));
  if(!verified)throw Object.assign(Error('La date et la ligne choisies ne correspondent pas aux données du RUP actif pour cet agent.'),{status:400});
  source=b.source;
  note=JSON.stringify({date:verified.entreeIEG,row:Number.isInteger(verified.row)?verified.row:null,contract:String(verified.contrat||'').trim(),reason,actor:request.headers.get('oai-authenticated-user-email')||''});
 }else note=JSON.stringify({reason,actor:request.headers.get('oai-authenticated-user-email')||''});
 const id=crypto.randomUUID();
 const write=await db.prepare('INSERT INTO agent_decisions (id,agent,kind,target,source,note,created) VALUES (?,?,?,?,?,?,?)').bind(id,nni,b.kind,null,source,note,new Date().toISOString()).run();
 if(write.meta.changes!==1)throw Object.assign(Error('La correction n’a pas été enregistrée.'),{status:503});
 return {ok:true,kind:b.kind,id};
}
// A confirmed departure or a return to "to review" must not require loading
// all careers, RUP files and computed individual histories.
if(b.kind==='departure'||b.kind==='absence'){
 const original=agentBase();
 const source=original.sources.find(s=>s.id===b.source);
 const imported=source?null:await db.prepare('SELECT id,status,detail FROM agent_imports WHERE id=?').bind(b.source).first<any>();
 const isPrimary=source?!!source.primary:!!imported&&imported.status==='validated'&&!!JSON.parse(imported.detail||'{}').complete;
 if(!source&&!imported)throw Object.assign(Error('Photographie introuvable.'),{status:400});
 if(b.kind==='departure'&&!isPrimary)throw Object.assign(Error('Un fichier partiel ne permet pas de confirmer un départ.'),{status:400});
 const known=original.records.some(r=>r.agentId===b.agent)||(await db.prepare('SELECT id FROM agent_decisions WHERE agent=?').bind(b.agent).first());
 if(!known&&!imported)throw Object.assign(Error('Agent introuvable.'),{status:400});
 await db.prepare('INSERT INTO agent_decisions (id,agent,kind,target,source,note,created) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),b.agent,b.kind,null,b.source,String(b.note||''),new Date().toISOString()).run();
 return {ok:true};
}
const {observedData:data}=await agentData(true);if(!(b.kind==='executive_manual'&&b.agent.startsWith('exec-manual-')&&b.agent.length<=100)&&!(data.records.some(r=>r.agentId===b.agent)||agentBase().records.some(r=>r.agentId===b.agent)||(await resources().db.prepare('SELECT id FROM agent_decisions WHERE agent=?').bind(b.agent).first()))||!data.sources.some(s=>s.id===b.source))throw Object.assign(Error('Agent ou source introuvable.'),{status:400});if(b.kind==='departure'&&!data.sources.find(s=>s.id===b.source)?.primary)throw Object.assign(Error('Un fichier partiel ne permet pas de confirmer un départ.'),{status:400});if(b.kind==='link'&&(!b.agent.startsWith('pending-')||normalizeNNI(b.target)!==b.target||!data.records.some(r=>r.nni===b.target)))throw Object.assign(Error('Choisir un NNI existant pour ce rapprochement.'),{status:400});if(b.kind==='executive'){
 const agentRows=data.records.filter(r=>r.agentId===b.agent);
 if(!agentRows.some(r=>r.gf===19))throw Object.assign(Error('La conversion depuis les absences exige une situation historique GF 19.'),{status:400});
}
if(b.kind==='executive_manual'){
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>180||typeof b.origin!=='string'||b.origin.length>180||typeof b.startDate!=='string'||(b.startDate!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate)))throw Object.assign(Error('Renseigner un nom valide, une origine et une date au format attendu.'),{status:400});
 if((await resources().db.prepare('SELECT id FROM agent_decisions WHERE agent=?').bind(b.agent).first()))throw Object.assign(Error('Identifiant de fiche déjà utilisé.'),{status:409});
}
if(b.kind==='executive_update'){
 const previous=(await resources().db.prepare("SELECT kind,source FROM agent_decisions WHERE agent=? AND kind IN ('executive','executive_manual','executive_remove','executive_update') ORDER BY created,id").bind(b.agent).all<any>()).results;
 let active=false;for(const d of previous){if(d.kind==='executive_remove')active=false;else active=true;}
 if(!active||!previous.length)throw Object.assign(Error('Fiche de cadre dirigeant inactive ou introuvable.'),{status:400});
 if(previous.at(-1)?.source!==b.source)throw Object.assign(Error('Source de fiche incohérente.'),{status:400});
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>180||typeof b.origin!=='string'||b.origin.length>180||typeof b.startDate!=='string'||typeof b.exitDate!=='string'||![b.startDate,b.exitDate].every((d:string)=>!d||/^\d{4}-\d{2}-\d{2}$/.test(d))||(b.startDate&&b.exitDate&&b.exitDate<b.startDate))throw Object.assign(Error('Nom, dates ou entité incorrects ; la sortie doit suivre l’arrivée.'),{status:400});
}
if(b.kind==='executive_remove'){
 const previous=await resources().db.prepare("SELECT id FROM agent_decisions WHERE agent=? AND kind IN ('executive','executive_manual')").bind(b.agent).first();
 if(!previous)throw Object.assign(Error('Cadre dirigeant introuvable.'),{status:400});
}
let note=b.note||'';
if(b.kind==='executive_update')note=JSON.stringify({name:b.name.trim(),origin:b.origin.trim(),startDate:b.startDate,exitDate:b.exitDate,note:String(b.note||'').trim()});
if(b.kind==='executive_manual')note=JSON.stringify({name:b.name.trim(),origin:b.origin.trim(),startDate:b.startDate,note:String(b.note||'').trim()});
if(b.kind==='executive')note=JSON.stringify({name:data.records.find(r=>r.agentId===b.agent)?.name||'',startDate:b.startDate||'',note:String(b.note||'').trim()});
if(b.kind==='return'){
 const src=data.sources.find(s=>s.id===b.source)!;
 const prior=data.records.filter(r=>r.agentId===b.agent&&r.nni&&(data.sources.find(s=>s.id===r.source)?.date||'9999')<src.date);
 if(src.status==='review'||!prior.length||data.records.some(r=>r.agentId===b.agent&&r.source===b.source))throw Object.assign(Error('La présence se confirme pour un agent identifié absent de cette photographie.'),{status:400});
 const v=b.presence;
 if(!v||typeof b.note!=='string'||!b.note.trim()||!Number.isInteger(v.gf)||v.gf<1||v.gf>30||!Number.isInteger(v.nr)||v.nr<1||v.nr>1000||typeof v.agency!=='string'||v.agency.length>180)throw Object.assign(Error('Renseigner le motif, un GF et un NR valides et une agence (180 caractères maximum).'),{status:400});
 note=JSON.stringify({note:b.note.trim(),presence:{gf:v.gf,nr:v.nr,agency:v.agency.trim()}});
}
await resources().db.prepare('INSERT INTO agent_decisions (id,agent,kind,target,source,note,created) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),b.agent,b.kind,b.target||null,b.source,note,new Date().toISOString()).run();return {ok:true};}


export async function cspIdentityData(data:AgentData,events:CspEvent[]){
 const known=new Map<string,Set<string>>();for(const r of data.records)if(r.nni){const key=cspNameKey(r.name),ids=known.get(key)||new Set<string>();ids.add(r.nni);known.set(key,ids);}
 const names=events.filter(e=>!e.approved&&e.selected&&(e.candidacy||e.kind==='admission'||e.kind==='mutation'&&e.newAgent||e.kind==='mesure'||e.identityMethod==='rup'||!e.agentId&&known.get(cspNameKey(e.name))?.size!==1)).map(e=>e.name);if(!names.length)return data;
 await loadSeeds(['rup-seed']);
 const {db,bucket}=resources();const imports=(await db.prepare('SELECT id,name,date,status,detail FROM agent_imports ORDER BY date DESC,created DESC').all<any>()).results;
 const excluded=(await db.prepare('SELECT source_id FROM rup_source_exclusions').all<{source_id:string}>()).results.map(r=>r.source_id);
 const cspIdentities=await findCspRupIdentities(JSON.parse(rupSeedText),imports,excluded,names,async id=>{const object=await bucket.get('agents/'+id+'/records.json');return object?await object.json<any[]>():[];});
 return {...data,cspIdentities};
}

