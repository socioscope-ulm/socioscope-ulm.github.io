import {accessError} from '../../../lib/access';
import {agentAuth,agentData,agentError} from '../../../lib/agents-store';
import {resources} from '../../../lib/store';
import {parseRupFile,rupCSV,rupStats} from '../../../lib/rup';
export async function GET(request:Request){try{await agentAuth(request);const {data}=await agentData();const rup=data.rup!;const matched=new Set(data.records.filter(r=>r.rupCareer).map(r=>r.nni));return Response.json({sources:rup.sources,stats:{...rupStats(rup),matched:matched.size},notes:['6 lignes sans NNI reconnu ont été écartées des fichiers fournis.','RUP 31 décembre 2022 : fichier chiffré, non intégré.','RUP 2024 : aucun fichier exploitable retrouvé.']},{headers:{'Cache-Control':'no-store'}});}catch(e){return agentError(e);}}
export async function POST(request:Request){const denied=accessError(request,true);if(denied)return denied;try{
 await agentAuth(request,true);const f=await request.formData();const file=f.get('file'),date=String(f.get('date')||'');
 if(!(file instanceof File)||!/\.(xlsx|xls|xlsm)$/i.test(file.name)||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Object.assign(Error('Choisir un RUP Excel et une date de référence valide.'),{status:400});
 const records=await parseRupFile(file,date);if(!records.length)throw Object.assign(Error('Aucun NNI reconnu dans ce RUP.'),{status:400});
 const bytes=await file.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const {data}=await agentData();const {db,bucket}=resources();if(data.rup!.sources.some(s=>s.hash===hash)||await db.prepare('SELECT id FROM agent_imports WHERE hash=?').bind(hash).first())throw Object.assign(Error('Ce fichier a déjà été intégré.'),{status:409});
 const id='rup-imp-'+crypto.randomUUID();await bucket.put('agents/'+id+'/records.json',JSON.stringify(records));await bucket.put('agents/'+id+'/original',rupCSV(records),{httpMetadata:{contentType:'text/csv;charset=utf-8'}});
 await db.prepare('INSERT INTO agent_imports (id,name,hash,date,created,status,count,complete,detail) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,file.name,hash,date,new Date().toISOString(),'validated',records.length,0,JSON.stringify({kind:'rup',sanitized:true})).run();
 return Response.json({id,count:records.length});
 }catch(e){return agentError(e);}}
