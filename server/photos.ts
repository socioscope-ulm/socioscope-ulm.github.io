import {db,bucket,storageFetch} from './storage';
import {photoCatalog} from './photo-catalog';
import {matchPhotoName,type PhotoAgent} from '../src/lib/photo-match';
import {commitPhotoAssignment} from '../src/lib/photo-assignment';
const catalog=photoCatalog;
export async function photoRoute(req:Request,path:string,admin:boolean){
 const p=new URL(req.url).searchParams;const json=(b:any,s=200)=>Response.json(b,{status:s});
 if(path==='/api/photos/image'&&req.method==='GET'){
  const row=await db.prepare('SELECT object_key FROM agent_photos WHERE '+(p.has('agent')?'agent_id=?':'id::text=?')).bind(p.get('agent')||p.get('id')||'').first<any>();
  if(!row)return new Response(null,{status:404});if(!p.has('agent')&&!admin)return json({error:'Administration uniquement.'},403);
  const r=await storageFetch(row.object_key);return new Response(r.body,{status:r.status,headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(!admin)return json({error:'Administration uniquement.'},403);
 if(req.method==='GET')return json({agents:await catalog(),photos:(await db.prepare('SELECT id,agent_id,detected_name,source_name,page,updated_at FROM agent_photos ORDER BY created_at DESC').all()).results});
 if(req.method==='PUT'){
  // Update a previously attached Etat-Major portrait in place. Never stage
  // an unassigned record, and never replace a portrait from another agency.
  const form=await req.formData();const file=form.get('photo');
  const agent=String(form.get('agent')||''),name=String(form.get('name')||'').trim().slice(0,200);
  const source=String(form.get('source')||''),expectedSource=String(form.get('expectedSource')||'');
  const oldSource='Trombinoscope Etat-Major ULM - oct2026.pdf';
  const newSource='Trombinoscope Etat-Major ULM - nov2026.pdf';
  if(source!==newSource||expectedSource!==oldSource)
   return json({error:'Remplacement réservé à la nouvelle archive de l’état-major.'},400);
  if(!(file instanceof File)||file.size>200000||file.size<4)return json({error:'Photo JPEG attendue (200 Ko maximum).'},400);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return json({error:'Photo JPEG invalide.'},400);
  const agents=await catalog();
  const matches=matchPhotoName(name,agents);
  if(matches.length!==1||matches[0].id!==agent)return json({error:'Correspondance agent non unique, remplacement refusé.'},409);
  const previous=await db.prepare('SELECT id,object_key,source_name FROM agent_photos WHERE agent_id=?').bind(agent).first<any>();
  if(!previous||previous.source_name!==oldSource)return json({error:'Photo existante modifiée ou autre source : remplacement refusé.'},409);
  const key='photos/'+crypto.randomUUID()+'.jpg';
  try{await bucket.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});}catch{return json({error:'Enregistrement du nouveau portrait impossible. L’ancienne photo est conservée.'},503);}
  try{
   const changed=await db.prepare('UPDATE agent_photos SET object_key=?,detected_name=?,source_name=?,page=?,updated_at=now() WHERE id=?::uuid AND object_key=? AND source_name=? RETURNING id')
    .bind(key,name,source,Math.max(1,Number(form.get('page'))||1),previous.id,previous.object_key,oldSource).first<any>();
   if(!changed){
    await storageFetch(key,{method:'DELETE'}).catch(()=>{});
    return json({error:'Cette photo a changé pendant l’import. Ancienne attribution conservée.'},409);
   }
  }catch{
   await storageFetch(key,{method:'DELETE'}).catch(()=>{});
   return json({error:'Remplacement impossible, ancien portrait conservé.'},503);
  }
  try{const removed=await storageFetch(previous.object_key,{method:'DELETE'});
   if(!removed.ok&&removed.status!==404)console.warn('Old Etat-Major portrait cleanup failed',removed.status);
  }catch{console.warn('Old Etat-Major portrait cleanup unavailable');}
  return json({ok:true,agent_id:agent,replaced:true});
 }
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
  const existing=await db.prepare('SELECT id,object_key FROM agent_photos WHERE agent_id=? AND id<>?::uuid').bind(agent,b.id).first<any>();
  if(existing&&b.replace!==true)return json({error:'Cet agent possède déjà une photo. Confirmer le remplacement.'},409);
  // A confirmed replacement retires the old photo instead of sending it
  // back into the manual assignment queue. The database swap is atomic.
  const obsoleteKey=await commitPhotoAssignment(db,b.id,agent,existing);
  if(obsoleteKey){
   // Removing an old storage object is best-effort after committing the
   // database transaction: a storage outage must not undo a valid photo.
   try{
    const removed=await storageFetch(obsoleteKey,{method:'DELETE'});
    if(!removed.ok&&removed.status!==404)console.warn('Old agent photo cleanup failed',removed.status);
   }catch{console.warn('Old agent photo cleanup unavailable');}
  }
  return json({ok:true});
 }
 return json({error:'Méthode non autorisée.'},405);
}
