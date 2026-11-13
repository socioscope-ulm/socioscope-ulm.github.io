import {db,bucket,storageFetch} from './storage';
import {TROMBINOSCOPE_AGENCIES,isTrombinoscopeAgency} from '../src/lib/trombinoscope';

const MAX_PDF_BYTES=20*1024*1024;
const json=(value:unknown,status=200)=>Response.json(value,{status});
const own=(rows:any[])=>TROMBINOSCOPE_AGENCIES.map(a=>{
 const row=rows.find(x=>x.agency===a.code);
 return {agency:a.code,label:a.label,available:!!row,filename:row?.filename||null,
  period:row?.period||null,updatedAt:row?.updated_at||null,sizeBytes:row?Number(row.size_bytes):null};
});
const metadataSql='SELECT agency,filename,period,object_key,size_bytes,updated_at FROM trombinoscope_documents';

export async function trombinoscopeRoute(req:Request,path:string,admin:boolean):Promise<Response>{
 const match=path.match(/^\/api\/trombinoscopes(?:\/([A-Z]+)(\/file)?)?$/);
 if(!match)return json({error:'Adresse de trombinoscope inconnue.'},404);
 const agency=match[1]||'';
 if(!agency){
  if(req.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const rows=(await db.prepare(metadataSql).all()).results;
  return json({agencies:own(rows)});
 }
 if(!isTrombinoscopeAgency(agency))return json({error:'Agence inconnue.'},404);
 const row=await db.prepare(metadataSql+' WHERE agency=?').bind(agency).first<any>();
 if(match[2]){
  if(req.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  if(!row)return json({error:'Aucun organigramme publié pour cette agence.'},404);
  const stored=await storageFetch(row.object_key);
  if(!stored.ok)return json({error:'Document indisponible.'},stored.status===404?404:503);
  const disposition="inline; filename*=UTF-8''"+encodeURIComponent(row.filename);
  const headers=new Headers({'Content-Type':'application/pdf','Content-Disposition':disposition,
   'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  const size=stored.headers.get('Content-Length');
  if(size&&/^\d+$/.test(size))headers.set('Content-Length',size);
  return new Response(stored.body,{status:200,headers});
 }
 if(req.method==='GET')return row?json(own([row])[TROMBINOSCOPE_AGENCIES.findIndex(a=>a.code===agency)]):json({error:'Aucun document pour cette agence.'},404);
 if(!admin)return json({error:'Gestion des trombinoscopes réservée à l’administration.'},403);
 if(req.method==='PUT'){
  const length=Number(req.headers.get('content-length')||0);
  if(length>MAX_PDF_BYTES+100_000)return json({error:'PDF trop volumineux : 20 Mo maximum.'},413);
  const form=await req.formData().catch(()=>null);
  const file=form?.get('file');
  const period=String(form?.get('period')||'').trim();
  if(!(file instanceof File)||file.size<8||file.size>MAX_PDF_BYTES
    ||!file.name.toLowerCase().endsWith('.pdf')
    ||!(file.type==='application/pdf'||file.type==='application/octet-stream'||!file.type))
    return json({error:'Sélectionner un PDF de 20 Mo maximum.'},400);
  if(period.length>90)return json({error:'Intitulé de la version trop long.'},400);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const header=new TextDecoder().decode(bytes.subarray(0,5));
  if(header!=='%PDF-')return json({error:'Le fichier sélectionné n’est pas un PDF valide.'},400);
  const filename=file.name.replace(/[\u0000-\u001f\u007f\\/]/g,'').trim().slice(0,180)||agency+'.pdf';
  const objectKey='trombinoscopes/'+agency+'/'+crypto.randomUUID()+'.pdf';
  try{await bucket.put(objectKey,bytes,{httpMetadata:{contentType:'application/pdf'}});}
  catch{return json({error:'Impossible d’enregistrer le PDF dans le stockage privé.'},503);}
  try{
   await db.prepare(`INSERT INTO trombinoscope_documents(agency,filename,period,object_key,size_bytes,updated_at)
   VALUES (?,?,?,?,?,now())
   ON CONFLICT(agency) DO UPDATE SET filename=excluded.filename,period=excluded.period,
    object_key=excluded.object_key,size_bytes=excluded.size_bytes,updated_at=now()`).bind(agency,filename,period||null,objectKey,file.size).run();
  }catch{
   await storageFetch(objectKey,{method:'DELETE'}).catch(()=>{});
   return json({error:'Enregistrement de la référence impossible, ancien document conservé.'},503);
  }
  if(row?.object_key&&row.object_key!==objectKey){
   try{const del=await storageFetch(row.object_key,{method:'DELETE'});
    if(!del.ok&&del.status!==404)console.warn('Previous trombinoscope cleanup failed',del.status);
   }catch{console.warn('Previous trombinoscope cleanup unavailable');}
  }
  return json({ok:true,agency,filename,period:period||null,sizeBytes:file.size});
 }
 if(req.method==='DELETE'){
  if(!row)return json({error:'Document introuvable.'},404);
  await db.prepare('DELETE FROM trombinoscope_documents WHERE agency=?').bind(agency).run();
  try{const del=await storageFetch(row.object_key,{method:'DELETE'});
   if(!del.ok&&del.status!==404)console.warn('Trombinoscope storage cleanup failed',del.status);
  }catch{console.warn('Trombinoscope storage cleanup unavailable');}
  return json({ok:true,agency});
 }
 return json({error:'Méthode non autorisée.'},405);
}
