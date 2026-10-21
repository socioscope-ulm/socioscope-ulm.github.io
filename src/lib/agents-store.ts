import {accessError} from './access';
import {rupSeedText,packedText} from '../../server/seeds';
import {withRupCareer} from './rup';
import type {RupData} from './rup';
import {resources} from './store';

import {unpackAgentSeed,normalizeNNI,withConfirmedPresence} from './agents';
import type {AgentData,AgentRecord} from './agents';
let decoded:AgentData|undefined;
export function agentBase(){return decoded ||=unpackAgentSeed(JSON.parse(packedText));}
export async function agentAuth(request:Request,write=false){const denied=accessError(request,write);if(denied){const body=await denied.json() as {error:string};throw Object.assign(Error(body.error),{status:denied.status});}}
export const agentError=(e:any)=>Response.json({error:e?.message||'Opération impossible.'},{status:e?.status||500,headers:{'Cache-Control':'no-store'}});
export async function agentData(skipCareerEnrichment=false,focusAgentId?:string){const base=agentBase();const {db,bucket}=resources();const result=await db.prepare('SELECT * FROM agent_imports ORDER BY date,created').all<any>();const rup:RupData=skipCareerEnrichment?{sources:[],records:[]} as RupData:JSON.parse(rupSeedText);const data:AgentData={...base,records:[...base.records],sources:[...base.sources],events:base.events};for(const m of result.results){const detail=JSON.parse(m.detail||'{}');if(detail.kind==='rup'){if(!skipCareerEnrichment&&m.status==='validated'){const object=await bucket.get('agents/'+m.id+'/records.json');if(object){rup.sources.push({id:m.id,name:m.name,hash:m.hash,date:m.date,count:m.count,status:m.status});rup.records.push(...await object.json<any[]>());}}continue;}data.sources.push({id:m.id,name:m.name,hash:m.hash,date:m.date,label:m.date+' · '+m.name,sheet:'Import validé',primary:!!m.complete,...JSON.parse(m.detail||'{}'),confidence:'date choisie lors de l’import',seniorityDate:m.date,rows:m.count,agents:m.count,status:m.status});if(m.status==='validated'){const object=await bucket.get('agents/'+m.id+'/records.json');if(object){const rows=await object.json<AgentRecord[]>();data.records.push(...rows);}}}
const decisions=(await db.prepare('SELECT * FROM agent_decisions ORDER BY created,id').all<any>()).results;const links=new Map<string,string>();for(const d of decisions)if(d.kind==='link'&&d.target)links.set(d.agent,d.target);else if(d.kind==='unlink')links.delete(d.agent);data.records=data.records.map(r=>links.has(r.agentId)?{...r,agentId:links.get(r.agentId)!,nni:links.get(r.agentId),matchStatus:'rapprochement validé'}:r);if(focusAgentId){data.records=data.records.filter(r=>r.agentId===focusAgentId);data.events=data.events.filter(e=>e.agentId===focusAgentId);rup.records=rup.records.filter(r=>r.nni===focusAgentId);}return skipCareerEnrichment?{data:withConfirmedPresence(data,decisions),observedData:data,decisions}:{data:withRupCareer(withConfirmedPresence(data,decisions),rup),observedData:withRupCareer(data,rup),decisions};}
export async function decision(request:Request){await agentAuth(request,true);const b:any=await request.json();if(!['link','unlink','departure','absence','return','dismiss','restore','executive','executive_manual','executive_remove','executive_update'].includes(b.kind)||typeof b.agent!=='string'||b.agent.length>100||String(b.note||'').length>1000)throw Object.assign(Error('Décision invalide.'),{status:400});const {db}=resources();
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
