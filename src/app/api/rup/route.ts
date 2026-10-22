import {accessError} from '../../../lib/access';
import {agentAuth,agentData,agentError} from '../../../lib/agents-store';
import {resources} from '../../../lib/store';
import {rupCSV,rupStats} from '../../../lib/rup';
import {normalizeAgentSex} from '../../../lib/agents';
import {rupSeedText} from '../../../../server/seeds';
export async function GET(request:Request){try{
 await agentAuth(request);
 // La liste de RUP doit rester legere : ne jamais charger les fiches agents,
 // les historiques de carriere ni recalculer la masse salariale.
 const {db,bucket}=resources();
 const rup=JSON.parse(rupSeedText) as {sources:any[];records:any[]};
 const excluded=(await db.prepare('SELECT source_id FROM rup_source_exclusions').all<{source_id:string}>()).results.map(x=>x.source_id);
 const excludedIds=new Set(excluded);
 rup.sources=rup.sources.filter(x=>!excludedIds.has(x.id));rup.records=rup.records.filter(x=>!excludedIds.has(x.source));
 const imports=await db.prepare('SELECT id,name,hash,date,status,count,detail FROM agent_imports').all<any>();
 for(const m of imports.results){
   let detail:any;try{detail=JSON.parse(m.detail||'{}');}catch{continue;}
   if(detail.kind!=='rup'||m.status!=='validated'||excludedIds.has(m.id))continue;
   const object=await bucket.get('agents/'+m.id+'/records.json');
   if(!object)continue;
   rup.sources.push({id:m.id,name:m.name,hash:m.hash,date:m.date,count:m.count,status:m.status});
   rup.records.push(...await object.json<any[]>());
 }
 const annual=new Map<number,{year:number;files:number;agents:Set<string>;sexes:Map<string,Set<string>>}>();
 for(const src of rup.sources){
   const year=Number(String(src.date).slice(0,4));if(!Number.isFinite(year))continue;
   if(!annual.has(year))annual.set(year,{year,files:0,agents:new Set(),sexes:new Map()});
   annual.get(year)!.files++;
 }
 const yearsToSources=new Map(rup.sources.map(s=>[s.id,Number(String(s.date).slice(0,4))]));
 for(const r of rup.records){
   const year=yearsToSources.get(r.source),a=annual.get(year!);if(!a||!r.nni)continue;
   a.agents.add(r.nni);const values=a.sexes.get(r.nni)||new Set<string>();
   const sex=normalizeAgentSex(r.genre);if(sex)values.add(sex);a.sexes.set(r.nni,values);
 }
 // Determiner un sexe fiable pour un NNI sur l'ensemble des millesimes.
 // Ne pas confondre sexe present dans un fichier et sexe reconstitue.
 const sexesByNNI=new Map<string,Set<string>>();
 for(const r of rup.records){
  if(!r.nni)continue;
  const sex=normalizeAgentSex(r.genre);if(!sex)continue;
  const set=sexesByNNI.get(r.nni)||new Set<string>();set.add(sex);sexesByNNI.set(r.nni,set);
 }
 const years=[...annual.values()].sort((a,b)=>a.year-b.year).map(a=>{
  let direct=0,recovered=0,conflicts=0;
  for(const nni of a.agents){
   const local=a.sexes.get(nni)||new Set<string>();
   const historical=sexesByNNI.get(nni)||new Set<string>();
   if(historical.size>1){conflicts++;continue;}
   if(local.size===1)direct++;
   else if(local.size===0&&historical.size===1)recovered++;
  }
  return {year:a.year,files:a.files,agents:a.agents.size,genreKnown:direct,genreRecovered:recovered,genreConflicts:conflicts};
 });
 const stats=rupStats(rup);
 return Response.json({sources:rup.sources,excluded,years,stats:{...stats,matched:null},notes:[]},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return agentError(e);}}
export async function POST(request:Request){const denied=accessError(request,true);if(denied)return denied;try{
 await agentAuth(request,true);
 const f=await request.formData();
 const filename=String(f.get('filename')||''),date=String(f.get('date')||''),raw=f.get('extraction');
 if(!/\.(xlsx|xls|xlsm)$/i.test(filename)||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||typeof raw!=='string'||raw.length>5000000)throw Object.assign(Error('RUP ou date de référence invalide.'),{status:400});
 const records=JSON.parse(raw);
 if(!Array.isArray(records)||!records.length||records.length>10000||!records.every((r:any)=>r&&typeof r.nni==='string'&&/^[A-Z0-9]{5,12}$/.test(r.nni)&&typeof r.contrat==='string'&&typeof r.genre==='string'&&r.genre.length<=80&&typeof r.nom==='string'&&typeof r.prenom==='string'&&typeof r.source==='string'))throw Object.assign(Error('Données RUP non conformes.'),{status:400});
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))).map(v=>v.toString(16).padStart(2,'0')).join('');
 // L'import ne doit pas recalculer les milliers de fiches et carrieres pour
 // verifier les doublons : cela provoquait des echecs de ressources (546).
 const {db,bucket}=resources();
 const archived=JSON.parse(rupSeedText) as {sources:{id:string;hash?:string;date:string}[];records:{source:string;nni:string;contrat:string}[]};
 const imported=await db.prepare("SELECT id,hash,date,status,detail FROM agent_imports").all<any>();
 const existing=imported.results.filter((r:any)=>{try{return JSON.parse(r.detail||'{}').kind==='rup'&&r.status==='validated';}catch{return false;}});
 const excludedForHash=new Set((await db.prepare('SELECT source_id FROM rup_source_exclusions').all<{source_id:string}>()).results.map(r=>r.source_id));
 if(archived.sources.some(r=>r.hash===hash&&!excludedForHash.has(r.id))||imported.results.some((r:any)=>r.hash===hash&&!excludedForHash.has(r.id)))
  throw Object.assign(Error('Ce fichier a déjà été intégré.'),{status:409});
 const excludedIds=new Set((await db.prepare('SELECT source_id FROM rup_source_exclusions').all<{source_id:string}>()).results.map(x=>x.source_id));
 const sameSeed=archived.sources.filter(r=>r.date===date&&!excludedIds.has(r.id));
 const sameImported=existing.filter((r:any)=>r.date===date&&!excludedIds.has(r.id));
 const incoming=new Set(records.map(r=>r.nni+'|'+r.contrat));
 const prior=new Set(archived.records.filter(r=>sameSeed.some(x=>x.id===r.source)).map(r=>r.nni+'|'+r.contrat));
 for(const src of sameImported){
   const stored=await bucket.get('agents/'+src.id+'/records.json');
   if(stored)for(const r of await stored.json<any[]>())prior.add(r.nni+'|'+r.contrat);
 }
 const overlap=[...incoming].filter(k=>prior.has(k)).length;
 if(overlap>0)throw Object.assign(Error('Un RUP existe déjà pour cette date : '+overlap+' agent(s)/contrat(s) commun(s). Import bloqué pour éviter les doublons.'),{status:409});
 const id='rup-imp-'+crypto.randomUUID();await bucket.put('agents/'+id+'/records.json',JSON.stringify(records.map((r:any)=>({...r,source:id}))));await bucket.put('agents/'+id+'/original',rupCSV(records.map((r:any)=>({...r,source:id}))),{httpMetadata:{contentType:'text/csv;charset=utf-8'}});
 await db.prepare('INSERT INTO agent_imports (id,name,hash,date,created,status,count,complete,detail) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,filename,hash,date,new Date().toISOString(),'validated',records.length,0,JSON.stringify({kind:'rup',sanitized:true})).run();
 return Response.json({id,count:records.length});
 }catch(e){return agentError(e);}}

export async function DELETE(request:Request){const denied=accessError(request,true);if(denied)return denied;try{
 await agentAuth(request,true);const body=await request.json() as {id?:string};
 const id=String(body.id||'');const archived=JSON.parse(rupSeedText) as {sources:{id:string;name:string}[]};
 const imported=await resources().db.prepare('SELECT id,detail FROM agent_imports WHERE id=?').bind(id).first<any>();
 const isImport=imported&&JSON.parse(imported.detail||'{}').kind==='rup';
 if(!archived.sources.some(x=>x.id===id)&&!isImport)throw Object.assign(Error('RUP non reconnu.'),{status:404});
 await resources().db.prepare('INSERT INTO rup_source_exclusions(source_id) VALUES (?) ON CONFLICT(source_id) DO NOTHING').bind(id).run();
 return Response.json({ok:true,id,archived:true});
 }catch(e){return agentError(e);}}
export async function PATCH(request:Request){const denied=accessError(request,true);if(denied)return denied;try{
 await agentAuth(request,true);const body=await request.json() as {id?:string};const id=String(body.id||'');
 await resources().db.prepare('DELETE FROM rup_source_exclusions WHERE source_id=?').bind(id).run();
 return Response.json({ok:true,id});
 }catch(e){return agentError(e);}}
