import {createAccountLink} from './invite';
import * as route0 from '../src/app/api/agents/[id]/route';
import * as route1 from '../src/app/api/agents/decision/route';
import * as route2 from '../src/app/api/agents/files/[id]/route';
import * as route3 from '../src/app/api/agents/import/[id]/route';
import * as route4 from '../src/app/api/agents/import/route';
import * as route5 from '../src/app/api/agents/route';
import * as route6 from '../src/app/api/data/route';
import * as route7 from '../src/app/api/files/[id]/route';
import * as route8 from '../src/app/api/import/route';
import * as route9 from '../src/app/api/payroll/files/[id]/route';
import * as route10 from '../src/app/api/payroll/import/[id]/route';
import * as route11 from '../src/app/api/payroll/import/route';
import * as route12 from '../src/app/api/payroll/route';
import * as route13 from '../src/app/api/review/[id]/route';
import * as route14 from '../src/app/api/rows/route';
import * as route15 from '../src/app/api/rup/route';
import {db,bucket,projectURL,serviceKey} from './storage';
import {loadSeeds} from './seeds';import {initializeBase} from '../src/lib/store';
const CLIENT_ORIGIN='https://fnme-pointage.github.io';
const ALLOWED_ORIGINS=new Set([CLIENT_ORIGIN,'https://socioscope-ulm.github.io']);
const routes:any[]=[[new RegExp('^/api/agents/decision$'),route1],[new RegExp('^/api/agents/import$'),route4],[new RegExp('^/api/payroll/import$'),route11],[new RegExp('^/api/agents$'),route5],[new RegExp('^/api/data$'),route6],[new RegExp('^/api/import$'),route8],[new RegExp('^/api/payroll$'),route12],[new RegExp('^/api/rows$'),route14],[new RegExp('^/api/rup$'),route15],[new RegExp('^/api/agents/files/([^/]+)$'),route2],[new RegExp('^/api/agents/import/([^/]+)$'),route3],[new RegExp('^/api/payroll/files/([^/]+)$'),route9],[new RegExp('^/api/payroll/import/([^/]+)$'),route10],[new RegExp('^/api/agents/([^/]+)$'),route0],[new RegExp('^/api/files/([^/]+)$'),route7],[new RegExp('^/api/review/([^/]+)$'),route13]];
const json=(body:any,status=200)=>Response.json(body,{status});
export async function handler(req:Request){
 const origin=req.headers.get('origin');const cors:any={'Access-Control-Allow-Origin':origin&&ALLOWED_ORIGINS.has(origin)?origin:CLIENT_ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Expose-Headers':'Content-Disposition,Content-Type','Cache-Control':'no-store','Vary':'Origin'};
 const finish=(r:Response)=>{const h=new Headers(r.headers);for(const [k,v]of Object.entries(cors))h.set(k,String(v));return new Response(r.body,{status:r.status,headers:h});};
 if(origin&&!ALLOWED_ORIGINS.has(origin))return finish(json({error:'Origine non autorisée.'},403));
 if(req.method==='OPTIONS')return finish(new Response(null,{status:204}));
 try{
 const authorization=req.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer '))return finish(json({error:'Connexion requise.'},401));
 const verification=await fetch(projectURL+'/auth/v1/user',{headers:{apikey:serviceKey,authorization}});
 if(!verification.ok)return finish(json({error:'Session expirée. Veuillez vous reconnecter.'},401));
 const user=await verification.json();if(!user.id||!user.email_confirmed_at)return finish(json({error:'Veuillez confirmer votre adresse mail.'},403));
 const email=String(user.email||'').toLowerCase();
 const member=await db.prepare('SELECT email,role,enabled,user_id FROM members WHERE email=?').bind(email).first<any>();
 if(!member?.enabled || member.user_id&&member.user_id!==user.id)return finish(json({error:'Votre adresse ne dispose pas d’un accès au Socioscope.'},403));
 if(!member.user_id)await db.prepare('UPDATE members SET user_id=? WHERE email=? AND user_id IS NULL').bind(user.id,email).run();
 const u=new URL(req.url);const path=u.pathname.replace(/^\/socioscope-api(?=\/|$)/,'').replace(/^\/functions\/v1\/socioscope-api(?=\/|$)/,'')||'/';
 if(path==='/api/session')return finish(json({email,role:member.role}));
 if(!['GET','HEAD'].includes(req.method)&&member.role!=='admin')return finish(json({error:'Modification réservée à l’administrateur.'},403));
 if(path==='/api/members/link'&&req.method==='POST'){
  if(member.role!=='admin')return finish(json({error:'Administration uniquement.'},403));
  const body=await req.json();const target=String(body.email||'').trim().toLowerCase();
  const allowed=await db.prepare('SELECT enabled FROM members WHERE email=?').bind(target).first<any>();
  if(!allowed?.enabled)return finish(json({error:'Autoriser cette adresse avant de créer un lien.'},400));
  return finish(await createAccountLink(req,projectURL,serviceKey,target,body.type==='recovery'?'recovery':'invite'));
 }
 if(path==='/api/members'){
  if(member.role!=='admin')return finish(json({error:'Administration uniquement.'},403));
  if(req.method==='GET')return finish(json({members:(await db.prepare('SELECT email,role,enabled,user_id FROM members ORDER BY role,email').all()).results}));
  if(req.method==='POST'){const b=await req.json();const e=String(b.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)||e.length>254)return finish(json({error:'Adresse mail invalide.'},400));if(e==='fnme.pointage@gmail.com')return finish(json({error:'Le compte administrateur est conservé.'},400));await db.prepare("INSERT INTO members(email,role,enabled) VALUES (?,'viewer',?) ON CONFLICT(email) DO UPDATE SET enabled=EXCLUDED.enabled WHERE members.role='viewer'").bind(e,b.enabled!==false).run();return finish(json({ok:true}));}
 }
 if(path.startsWith('/sources/')){const key=path.slice(1);if(key.includes('..')||key.split('/').length!==2)return finish(json({error:'Fichier invalide.'},400));const f=await bucket.get(key);if(!f)return finish(json({error:'Fichier introuvable.'},404));const h=new Headers();f.writeHttpMetadata(h);h.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(path.split('/').at(-1)!));return finish(new Response(f.body,{headers:h}));}
 await loadSeeds();initializeBase();
 for(const [pattern,route]of routes){const match=path.match(pattern);if(!match)continue;const fn=route[req.method];if(!fn)return finish(json({error:'Méthode non autorisée.'},405));
  const h=new Headers(req.headers);h.delete('oai-authenticated-user-id');h.delete('oai-authenticated-user-email');h.delete('x-socioscope-role');h.set('oai-authenticated-user-id',user.id);h.set('oai-authenticated-user-email',email);h.set('x-socioscope-role',member.role);
  const internal=new Request(CLIENT_ORIGIN+path+u.search,{method:req.method,headers:h,...(!['GET','HEAD'].includes(req.method)?{body:await req.arrayBuffer()}:{})});
  return finish(await fn(internal,{params:Promise.resolve({id:match[1]?decodeURIComponent(match[1]):''})}));
 }
 return finish(json({error:'Page introuvable.'},404));
 }catch(error){console.error('Socioscope request failed',error instanceof Error?error.name:'Error');return finish(json({error:'Service momentanément indisponible. Réessayer dans quelques instants.'},503));}
}
Deno.serve(handler);
