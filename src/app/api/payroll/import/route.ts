import {accessError} from '../../../../lib/access';
import {agentAuth,agentError} from '../../../../lib/agents-store';
import {resources} from '../../../../lib/store';
import {validateReference} from '../../../../lib/payroll-reference';
import {validateAnnualBonusDetails,annualBonusLabel} from '../../../../lib/bonus-tables';
const bad=(message:string,status=400)=>Object.assign(Error(message),{status});
const sha256=async(value:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value.buffer as ArrayBuffer))).map(v=>v.toString(16).padStart(2,'0')).join('');
const validDate=(date:unknown)=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>='2000-01-01'&&date<='2100-12-31'&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;

export async function POST(request:Request){
 const denied=accessError(request,true);if(denied)return denied;
 try{
  await agentAuth(request,true);
  const multipart=(request.headers.get('content-type')||'').includes('multipart/form-data');
  let file:File|null=null;let b:any;
  if(multipart){
   const form=await request.formData();const f=form.get('file'),raw=form.get('extraction');
   if(f instanceof File&&f.size>0)file=f;
   if(typeof raw!=='string'||raw.length>900000)throw bad('Tableau invalide ou trop volumineux.');
   b=JSON.parse(raw);
  }else if((request.headers.get('content-type')||'').includes('application/json')){
   const text=await request.text();if(text.length>900000)throw bad('Tableau trop volumineux.');
   b=JSON.parse(text);
   if(b.kind!=='bonus-detail')throw bad('La saisie sans fichier est réservée aux primes détaillées.');
  }else throw bad('Format de requête non pris en charge.');
  if(!b||!validDate(b.date))throw bad('Date de référence invalide.');
  if(file&&(file.size>20*1024*1024||!/\.(pdf|png|jpe?g|csv|xlsx?|xlsm)$/i.test(file.name)))throw bad('Choisir un PDF, une image, un Excel ou un CSV de moins de 20 Mo.');
  let payload=b.payload;
  if(b.kind==='bonus-detail'){
   if(!validateAnnualBonusDetails(payload)||b.date!==String(payload.paymentYear)+'-01-01')throw bad('Années ou tableau de primes invalides : GF 2 à 11 RPEM, GF 12 à 19 RPC et PVPA.');
   payload={...payload,sourceName:file?.name||payload.sourceName||'Saisie manuelle',hasOriginal:!!file,entryMode:file?'file':'manual'};
   if(!validateAnnualBonusDetails(payload))throw bad('Tableau de primes invalide.');
  }else{
   if(!file)throw bad('Choisir le document original.');
   if(!validateReference(b.kind,payload))throw bad('Date ou tableau invalide. Une grille doit contenir tous les échelons 4 à 12 pour chaque NR.');
  }
  const text=new TextEncoder().encode(b.kind==='bonus-detail'?JSON.stringify({kind:b.kind,date:b.date,payload:{...payload,sourceName:undefined,hasOriginal:undefined,entryMode:undefined}}):'');
  const bytes=file?new Uint8Array(await file.arrayBuffer()):text;
  const hash=await sha256(bytes);
  const {db,bucket}=resources();
  if(await db.prepare('SELECT id FROM payroll_imports WHERE hash=? AND kind=?').bind(hash,b.kind).first())throw bad('Ce tableau a déjà été reçu pour ce type de référence.',409);
  const id='payroll-'+crypto.randomUUID();
  if(file)await bucket.put('payroll/'+id+'/original',bytes,{httpMetadata:{contentType:file.type||'application/octet-stream'}});
  const name=b.kind==='bonus-detail'?annualBonusLabel(payload.paymentYear,payload.objectiveYear):file!.name;
  await db.prepare('INSERT INTO payroll_imports (id,kind,name,hash,date,created,status,payload) VALUES (?,?,?,?,?,?,?,?)')
   .bind(id,b.kind,name,hash,b.date,new Date().toISOString(),'review',JSON.stringify(payload)).run();
  return Response.json({id,kind:b.kind});
 }catch(e){return agentError(e);}
}
