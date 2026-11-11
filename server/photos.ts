import {db,bucket,storageFetch} from './storage';
import {agentData} from '../src/lib/agents-store';
import {loadSeeds} from './seeds';
import {matchPhotoName,type PhotoAgent} from '../src/lib/photo-match';
async function catalog(){await loadSeeds(['agents-seed','rup-seed']);const {data}=await agentData(true);const byId=new Map<string,PhotoAgent>();for(const r of data.records)if(r.agentId&&r.name)byId.set(r.agentId,{id:r.agentId,name:r.name,agency:r.agency});return [...byId.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr'));}
export async function photoRoute(req:Request,path:string,admin:boolean){
 const p=new URL(req.url).searchParams;const json=(b:any,s=200)=>Response.json(b,{status:s});
 if(path==='/api/photos/image'&&req.method==='GET'){
  const row=await db.prepare('SELECT object_key FROM agent_photos WHERE '+(p.has('agent')?'agent_id=?':'id::text=?')).bind(p.get('agent')||p.get('id')||'').first<any>();
  if(!row)return new Response(null,{status:404});if(!p.has('agent')&&!admin)return json({error:'Administration uniquement.'},403);
  const r=await storageFetch(row.object_key);return new Response(r.body,{status:r.status,headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(!admin)return json({error:'Administration uniquement.'},403);
 if(req.method==='GET')return json({agents:await catalog(),photos:(await db.prepare('SELECT id,agent_id,detected_name,source_name,page,updated_at FROM agent_photos ORDER BY created_at DESC').all()).results});
 if(req.method==='POST'){
  const form=await req.formData();const file=form.get('photo');if(!(file instanceof File)||file.size>200000||file.size<4)return json({error:'Photo JPEG attendue (200 Ko maximum).'},400);
  const bytes=new Uint8Array(await file.arrayBuffer());if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return json({error:'Photo JPEG invalide.'},400);
  const id=crypto.randomUUID(),key='photos/'+id+'.jpg',name=String(form.get('name')||'').slice(0,200),source=String(form.get('source')||'Photo manuelle').slice(0,250);const agents=await catalog();
  const explicit=String(form.get('agent')||'');if(explicit&&!agents.some(a=>a.id===explicit))return json({error:'Agent inconnu.'},400);
  const candidates=matchPhotoName(name,agents);let agent=explicit||(form.get('certain')==='true'&&candidates.length===1?candidates[0].id:null);
  if(agent&&(await db.prepare('SELECT id FROM agent_photos WHERE agent_id=?').bind(agent).first()))agent=null;
  await bucket.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  try{await db.prepare('INSERT INTO agent_photos(id,agent_id,detected_name,source_name,page,object_key) VALUES (?::uuid,?,?,?,?,?)').bind(id,agent,name,source,Math.max(1,Number(form.get('page'))||1),key).run();}catch{await storageFetch(key,{method:'DELETE'});return json({error:'Attribution concurrente : relancer l’import.'},409);}
  return json({id,agent_id:agent});
 }
 const b=await req.json();if(!/^[a-f0-9-]{36}$/i.test(b.id||''))return json({error:'Photo invalide.'},400);
 const row=await db.prepare('SELECT * FROM agent_photos WHERE id=?::uuid').bind(b.id).first<any>();if(!row)return json({error:'Photo introuvable.'},404);
 if(req.method==='DELETE'){const deleted=await storageFetch(row.object_key,{method:'DELETE'});if(!deleted.ok&&deleted.status!==404)throw Error('Suppression du fichier impossible');await db.prepare('DELETE FROM agent_photos WHERE id=?::uuid').bind(b.id).run();return json({ok:true});}
 if(req.method==='PATCH'){
  const agent=String(b.agent||'');if(!(await catalog()).some(a=>a.id===agent))return json({error:'Agent inconnu.'},400);
  const existing=await db.prepare('SELECT id FROM agent_photos WHERE agent_id=? AND id<>?::uuid').bind(agent,b.id).first<any>();
  if(existing&&b.replace!==true)return json({error:'Cet agent possède déjà une photo. Confirmer le remplacement.'},409);
  await db.batch([...(existing?[db.prepare('UPDATE agent_photos SET agent_id=NULL,updated_at=now() WHERE id=?::uuid').bind(existing.id)]:[]),db.prepare('UPDATE agent_photos SET agent_id=?,updated_at=now() WHERE id=?::uuid').bind(agent,b.id)]);return json({ok:true});
 }
 return json({error:'Méthode non autorisée.'},405);
}
