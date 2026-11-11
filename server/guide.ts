import {db,bucket} from './storage';

// The guide is a single private document, administered in "Bilans & imports".
// A fixed key means that every user always receives the currently published
// edition, without an additional publicly accessible Storage URL.
const GUIDE_KEY='guides/guide-utilisation-socioscope-ulm.pdf';
const GUIDE_FILENAME='Guide_Socioscope_ULM.pdf';
export const GUIDE_LIMIT_BYTES=8*1024*1024;

type Metadata={updated_at:string;size:string|null};
function response(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}
async function current(){
 const row=await db.prepare(`SELECT updated_at::text AS updated_at,metadata->>'size' AS size
 FROM storage.objects WHERE bucket_id='socioscope-private' AND name=?`).bind(GUIDE_KEY).first<Metadata>();
 return row?{available:true,updatedAt:row.updated_at,size:Number(row.size||0),filename:GUIDE_FILENAME}:{available:false,updatedAt:null,size:0,filename:GUIDE_FILENAME};
}
export function validGuidePdf(bytes:Uint8Array){
 if(bytes.byteLength<20||bytes.byteLength>GUIDE_LIMIT_BYTES)return false;
 const decoder=new TextDecoder();
 const prefix=decoder.decode(bytes.subarray(0,5));
 const suffix=decoder.decode(bytes.subarray(Math.max(0,bytes.length-2048)));
 return prefix==='%PDF-'&&/%%EOF\s*$/.test(suffix);
}
export async function guideRoute(request:Request,path:string,isAdmin:boolean){
 if(request.method==='GET'&&path==='/api/guide')return response(await current());
 if(request.method==='GET'&&path==='/api/guide/file'){
  const available=await current();
  if(!available.available)return response({error:'Le guide d’utilisation n’a pas encore été publié par l’administrateur.'},404);
  const doc=await bucket.get(GUIDE_KEY);
  if(!doc)return response({error:'Le fichier du guide est momentanément indisponible.'},503);
  const headers=new Headers({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${GUIDE_FILENAME}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  if(available.size>0)headers.set('Content-Length',String(available.size));
  return new Response(doc.body,{status:200,headers});
 }
 if(path==='/api/guide'&&request.method==='POST'){
  if(!isAdmin)return response({error:'Import réservé à l’administrateur.'},403);
  const form=await request.formData();
  const file=form.get('file');
  if(!(file instanceof File))return response({error:'Sélectionner un fichier PDF.'},400);
  if(file.size>GUIDE_LIMIT_BYTES)return response({error:'Guide trop volumineux (8 Mo maximum).'},413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!validGuidePdf(bytes))return response({error:'Le document doit être un PDF valide et complet.'},400);
  await bucket.put(GUIDE_KEY,bytes,{httpMetadata:{contentType:'application/pdf'}});
  return response({ok:true,guide:await current()});
 }
 return response({error:'Méthode non autorisée.'},405);
}
