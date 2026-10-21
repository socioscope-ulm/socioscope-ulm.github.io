const ALLOWED='https://socioscope-ulm.github.io';
const TARGET='https://ovssjbldmsowzojeftyr.supabase.co/functions/v1/socioscope-api';
const cors={'Access-Control-Allow-Origin':ALLOWED,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Expose-Headers':'Content-Disposition,Content-Type','Cache-Control':'no-store','Vary':'Origin'};
Deno.serve(async req=>{
 if(req.headers.get('origin')!==ALLOWED)return new Response('Forbidden',{status:403});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!req.headers.get('authorization')?.startsWith('Bearer '))return Response.json({error:'Connexion requise.'},{status:401,headers:cors});
 const url=new URL(req.url);
 const prefix='/socioscope-bridge';
 if(!url.pathname.startsWith(prefix+'/'))return new Response('Not found',{status:404,headers:cors});
 const headers=new Headers(req.headers);
 headers.set('origin','https://fnme-pointage.github.io');
 for(const k of ['host','content-length','x-forwarded-for','x-forwarded-host'])headers.delete(k);
 try{
  const r=await fetch(TARGET+url.pathname.slice(prefix.length)+url.search,{method:req.method,headers,redirect:'manual',...(!['GET','HEAD'].includes(req.method)?{body:req.body}:{})});
  const h=new Headers(r.headers);
  for(const [k,v]of Object.entries(cors))h.set(k,v);
  h.delete('content-length');
  return new Response(r.body,{status:r.status,headers:h});
 }catch{return Response.json({error:'Service indisponible.'},{status:502,headers:cors});}
});