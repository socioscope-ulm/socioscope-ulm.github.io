import {accessError} from '../../../lib/access';
import {agentAuth,agentData,agentError} from '../../../lib/agents-store';
import {resources} from '../../../lib/store';
import {parseRupFile,rupCSV,rupStats} from '../../../lib/rup';
import {normalizeAgentSex} from '../../../lib/agents';
import {rupSeedText} from '../../../../server/seeds';
export async function GET(request:Request){try{await agentAuth(request);const {data}=await agentData();const rup=data.rup!;const matched=new Set(data.records.filter(r=>r.rupCareer).map(r=>r.nni));const years=[...new Set(rup.sources.map(s=>Number(String(s.date).slice(0,4))).filter(Number.isFinite))].sort((a,b)=>a-b).map(year=>{const sourceIds=new Set(rup.sources.filter(s=>Number(String(s.date).slice(0,4))===year).map(s=>s.id));const rows=rup.records.filter(r=>sourceIds.has(r.source));const unique=new Map<string,Set<string>>();for(const r of rows){if(!r.nni)continue;const set=unique.get(r.nni)||new Set<string>();const sex=normalizeAgentSex(r.genre);if(sex)set.add(sex);unique.set(r.nni,set);}return {year,files:sourceIds.size,agents:unique.size,genreKnown:[...unique.values()].filter(v=>v.size===1).length,genreConflicts:[...unique.values()].filter(v=>v.size>1).length};});return Response.json({sources:rup.sources,years,stats:{...rupStats(rup),matched:matched.size},notes:['6 lignes sans NNI reconnu ont été écartées des fichiers fournis.','RUP 31 décembre 2022 : fichier chiffré, non intégré.','RUP 2024 : aucun fichier exploitable retrouvé.']},{headers:{'Cache-Control':'no-store'}});}catch(e){return agentError(e);}}
export async function POST(request:Request){const denied=accessError(request,true);if(denied)return denied;try{
 await agentAuth(request,true);const f=await request.formData();const file=f.get('file'),date=String(f.get('date')||'');
 if(!(file instanceof File)||!/\.(xlsx|xls|xlsm)$/i.test(file.name)||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Object.assign(Error('Choisir un RUP Excel et une date de référence valide.'),{status:400});
 const records=await parseRupFile(file,date);if(!records.length)throw Object.assign(Error('Aucun NNI reconnu dans ce RUP.'),{status:400});
 const bytes=await file.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 // L'import ne doit pas recalculer les milliers de fiches et carrieres pour
 // verifier les doublons : cela provoquait des echecs de ressources (546).
 const {db,bucket}=resources();
 const archived=JSON.parse(rupSeedText) as {sources:{id:string;hash?:string;date:string}[];records:{source:string;nni:string;contrat:string}[]};
 const imported=await db.prepare("SELECT id,hash,date,status,detail FROM agent_imports").all<any>();
 const existing=imported.results.filter((r:any)=>{try{return JSON.parse(r.detail||'{}').kind==='rup'&&r.status==='validated';}catch{return false;}});
 if(archived.sources.some(r=>r.hash===hash)||imported.results.some((r:any)=>r.hash===hash))
  throw Object.assign(Error('Ce fichier a déjà été intégré.'),{status:409});
 const sameSeed=archived.sources.filter(r=>r.date===date);
 const sameImported=existing.filter((r:any)=>r.date===date);
 const incoming=new Set(records.map(r=>r.nni+'|'+r.contrat));
 const prior=new Set(archived.records.filter(r=>sameSeed.some(x=>x.id===r.source)).map(r=>r.nni+'|'+r.contrat));
 for(const src of sameImported){
   const stored=await bucket.get('agents/'+src.id+'/records.json');
   if(stored)for(const r of await stored.json<any[]>())prior.add(r.nni+'|'+r.contrat);
 }
 const overlap=[...incoming].filter(k=>prior.has(k)).length;
 if(overlap>0)throw Object.assign(Error('Un RUP existe déjà pour cette date : '+overlap+' agent(s)/contrat(s) commun(s). Import bloqué pour éviter les doublons.'),{status:409});
 const id='rup-imp-'+crypto.randomUUID();await bucket.put('agents/'+id+'/records.json',JSON.stringify(records));await bucket.put('agents/'+id+'/original',rupCSV(records),{httpMetadata:{contentType:'text/csv;charset=utf-8'}});
 await db.prepare('INSERT INTO agent_imports (id,name,hash,date,created,status,count,complete,detail) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,file.name,hash,date,new Date().toISOString(),'validated',records.length,0,JSON.stringify({kind:'rup',sanitized:true})).run();
 return Response.json({id,count:records.length});
 }catch(e){return agentError(e);}}
