import {accessError} from '../../../lib/access';
import {resources,base} from '../../../lib/store';
export async function POST(request:Request){const denied=accessError(request,true);if(denied)return denied;try{if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origine non autorisée.'},{status:403});const f=await request.formData();const file=f.get('file');const raw=f.get('extraction');if(!(file instanceof File)||typeof raw!=='string')return Response.json({error:'Fichier et extraction requis.'},{status:400});if(file.size>20*1024*1024||raw.length>8*1024*1024)return Response.json({error:'Fichier trop volumineux (20 Mo maximum).'}, {status:413});if(!/\.(pdf|xls|xlsx|csv)$/i.test(file.name))return Response.json({error:'Format non pris en charge.'},{status:400});const data=JSON.parse(raw);if(!Array.isArray(data.rows)||!Array.isArray(data.pages)||!Array.isArray(data.observations)||data.rows.length>15000||data.pages.length>200)return Response.json({error:'Extraction invalide ou trop grande.'},{status:400});const {db,bucket}=resources();const bytes=await file.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');const existing=base.documents.find(d=>d.hash===hash)||await db.prepare('SELECT id,name FROM imports WHERE hash = ?').bind(hash).first<any>();if(existing)return Response.json({error:'Ce bilan est déjà présent : '+existing.name,existing:existing.id},{status:409});const id='imp-'+crypto.randomUUID();for(const r of data.rows)r.source=id;for(const r of data.pages)r.source=id;for(const r of data.observations)r.source=id;await bucket.put('imports/'+id+'/original',bytes,{httpMetadata:{contentType:file.type||'application/octet-stream'}});await bucket.put('imports/'+id+'/extraction.json',JSON.stringify(data));await db.prepare('INSERT INTO imports (id,name,hash,created,status,years,records,revision) VALUES (?,?,?,?,?,?,?,?)').bind(id,file.name,hash,new Date().toISOString(),'review',JSON.stringify(data.years||[]),'[]',0).run();return Response.json({id,name:file.name,rows:data.rows.length,candidates:data.observations.length});}catch(e){return Response.json({error:e instanceof Error?e.message:'Import impossible'},{status:500});}}

export async function PATCH(request:Request){
 const denied=accessError(request,true);if(denied)return denied;
 try{
  const body=await request.json() as {id?:string;action?:string};
  const id=String(body.id||''),action=body.action;
  if(!id.startsWith('imp-')||!['disable','enable'].includes(String(action)))return Response.json({error:'Action invalide.'},{status:400});
  const {db}=resources();const current=await db.prepare('SELECT id,status FROM imports WHERE id=?').bind(id).first<any>();
  if(!current)return Response.json({error:'Document importé non trouvé.'},{status:404});
  if(action==='disable'){
   if(current.status.startsWith('disabled:'))return Response.json({ok:true,status:current.status});
   await db.prepare('UPDATE imports SET status=? WHERE id=?').bind('disabled:'+current.status,id).run();
   return Response.json({ok:true,status:'disabled:'+current.status});
  }
  if(!current.status.startsWith('disabled:'))return Response.json({error:'Ce document n’est pas désactivé.'},{status:409});
  const restored=current.status.slice('disabled:'.length);
  if(!['review','validated'].includes(restored))return Response.json({error:'État précédent inconnu.'},{status:409});
  await db.prepare('UPDATE imports SET status=? WHERE id=?').bind(restored,id).run();
  return Response.json({ok:true,status:restored});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Modification impossible'},{status:500});}
}
