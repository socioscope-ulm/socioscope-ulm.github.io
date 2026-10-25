import {activeCspEvents,cspProgress,preserveApproved} from '../../../lib/csp-validation';
import {agentAuth,agentData,agentError} from '../../../lib/agents-store';
import {resources} from '../../../lib/store';
import {cspKinds,prepareCsp,cspKey,validateCspEvent,deduplicateCsp,validDate,latestAnnual,parisToday} from '../../../lib/csp';
import type {CspEvent} from '../../../lib/csp';
function fail(message:string,status=400):never{throw Object.assign(Error(message),{status});}
const parse=(row:any)=>{let detail:any={};try{detail=JSON.parse(row.detail||'{}');}catch{}return {...row,detail};};
const metadata=(row:any)=>({id:row.id,name:row.name,date:row.date,status:row.status,count:row.count,created:row.created,duplicates:row.detail.duplicates||0,reports:row.detail.reports||[],perEventValidation:!!row.detail.perEventValidation,...cspProgress(row.status,row.detail)});
async function imports(){return (await resources().db.prepare('SELECT * FROM agent_imports WHERE id LIKE ? ORDER BY date,created,id').bind('csp-%').all<any>()).results.map(parse).filter(r=>r.detail.kind==='csp');}
function input(body:any){
 if(!body||!validDate(body.date)||!Array.isArray(body.events)||!body.events.length||body.events.length>3000||!body.events.every(validateCspEvent)||new Set(body.events.map((e:any)=>e.id)).size!==body.events.length)fail('Date ou décisions invalides. Corriger les dates et les valeurs avant l’enregistrement.');
 if(body.events.filter((e:any)=>e.selected).length===0)fail('Sélectionner au moins une décision.');
 return deduplicateCsp(body.events as CspEvent[]);
}
export async function GET(request:Request){try{
 await agentAuth(request);const p=new URL(request.url).searchParams,rows=await imports(),id=p.get('id');
 if(id){await agentAuth(request,true);const row=rows.find(r=>r.id===id);if(!row)fail('Relevé introuvable.',404);return Response.json({meta:metadata(row),events:row.detail.events||[]});}
 const q=(p.get('q')||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),kind=p.get('kind')||'',meeting=p.get('meeting')||'',agent=p.get('agent')||'';
 const offset=Math.max(0,Math.floor(Number(p.get('offset'))||0)),pageSize=60;
 const decisions=rows.filter(r=>r.status==='validated'&&(!meeting||r.id===meeting)).flatMap(r=>activeCspEvents(r.detail).filter(e=>(!kind||e.kind===kind)&&(!agent||e.agentId===agent)&&(!q||(e.name+' '+e.agentId+' '+e.agency).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().includes(q))).map(e=>({...e,importId:r.id,meetingDate:r.date,document:r.name}))).sort((a,b)=>b.effective.localeCompare(a.effective)||a.name.localeCompare(b.name,'fr'));
 const unique=new Map<string,typeof decisions[number]>();for(const e of decisions)if(!unique.has(cspKey(e)))unique.set(cspKey(e),e);const list=[...unique.values()];
 return Response.json({imports:rows.map(metadata),total:list.length,records:list.slice(offset,offset+pageSize),kinds:cspKinds,pageSize});
}catch(e){return agentError(e);}}
export async function POST(request:Request){try{
 await agentAuth(request,true);const isForm=request.headers.get('content-type')?.startsWith('multipart/form-data');
 if(!isForm){const body=await request.json();const saved=body.id?(await imports()).find(r=>r.id===body.id):null;const events=preserveApproved(input(body),saved?.detail.events||[],saved?.status==='validated'&&saved.detail.perEventValidation===true);const {data,cspImports}=await agentData(true,undefined,parisToday(),false);const preview=prepareCsp(data,events,cspImports.filter(i=>i.id!==body.id),body.date);return Response.json({events:preview.map(e=>e.approved?{...e,state:'validated',before:e.recordedBefore,after:e.recordedAfter,problem:'Décision déjà validée et intégrée.'}:e),base:latestAnnual(data),blocked:preview.filter(e=>e.selected&&!e.approved&&e.state==='blocked').length});}
 const f=await request.formData(),file=f.get('file'),raw=f.get('extraction');
 if(!(file instanceof File)||!file.size||file.size>20*1024*1024||!/\.pdf$/i.test(file.name)||typeof raw!=='string'||raw.length>1500000)fail('Choisir un PDF de moins de 20 Mo.');
 const body=JSON.parse(raw),events=preserveApproved(input(body),[],false);const bytes=await file.arrayBuffer();if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')fail('Le fichier n’est pas un PDF.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');const {db,bucket}=resources();
 const existing=await db.prepare('SELECT id FROM agent_imports WHERE hash=?').bind(hash).first<any>();if(existing)return Response.json({id:existing.id,existing:true});
 const {data,cspImports}=await agentData(true,undefined,parisToday(),false);const preview=prepareCsp(data,events,cspImports,body.date);
 const stored=events.map(e=>({...e,agentId:preview.find(p=>p.id===e.id)?.agentId}));
 const id='csp-'+crypto.randomUUID();const reports=Array.isArray(body.reports)?body.reports.slice(0,250).map((r:any)=>({page:Number(r.page),section:String(r.section||'').slice(0,80),count:Number(r.count)||0,status:['read','empty','unsupported'].includes(r.status)?r.status:'unsupported',note:String(r.note||'').slice(0,200)})):[];
 const detail={kind:'csp',version:1,events:stored,reports,duplicates:Math.max(0,Number(body.duplicates)||0),checked:false};
 await bucket.put('agents/'+id+'/original',bytes,{httpMetadata:{contentType:'application/pdf'}});
 await db.prepare('INSERT INTO agent_imports (id,name,hash,date,created,status,count,complete,detail) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,file.name.slice(0,240),hash,body.date,new Date().toISOString(),'review',stored.length,0,JSON.stringify(detail)).run();
 return Response.json({id,count:stored.length});
}catch(e){return agentError(e);}}
export async function PATCH(request:Request){try{
 await agentAuth(request,true);const b=await request.json();if(typeof b.id!=='string'||!b.id.startsWith('csp-'))fail('Relevé invalide.');const {db}=resources();const row=parse(await db.prepare('SELECT * FROM agent_imports WHERE id=?').bind(b.id).first<any>()||{});if(row.detail.kind!=='csp')fail('Relevé introuvable.',404);
 if(b.action==='disable'){
  const changed=await db.prepare("UPDATE agent_imports SET status='disabled:validated' WHERE id=? AND status='validated' AND detail=?").bind(b.id,JSON.stringify(row.detail)).run();if(changed.meta.changes!==1)fail('Le relevé a changé. Recharger avant de réessayer.',409);return Response.json({ok:true});
 }
 const progress=cspProgress(row.status,row.detail);const partial=row.status==='validated'&&row.detail.perEventValidation===true&&progress.pending>0;
 if(['validate','validate-state'].includes(b.action)&&row.status!=='review'&&!partial)fail('Ce relevé est déjà validé ou désactivé. Recharger.',409);
 if(b.action==='enable'&&row.status!=='disabled:validated')fail('Ce relevé n’est pas désactivé.',409);
 if(b.action==='revise'){
  if(!['validated','disabled:validated'].includes(row.status))fail('Le relevé est déjà en cours de vérification.',409);
  const detail={...row.detail,perEventValidation:false,checked:false,events:preserveApproved(row.detail.events,[],false)};
  const changed=await db.prepare('UPDATE agent_imports SET detail=?,status=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),'review',row.count,b.id,row.status,JSON.stringify(row.detail)).run();
  if(changed.meta.changes!==1)fail('Le relevé a changé. Recharger.',409);return Response.json({ok:true});
 }
 if(!['save','validate','validate-state','enable'].includes(b.action))fail('Action inconnue.');
 if(b.action==='save'&&row.status!=='review'&&!partial)fail('Utiliser « Corriger » pour modifier des décisions déjà validées.',409);
 const events=b.action==='enable'?row.detail.events:preserveApproved(input({date:row.date,events:b.events}),row.detail.events||[],partial);
 const {data,cspImports}=await agentData(true,undefined,parisToday(),false);const others=cspImports.filter(i=>i.id!==b.id);
 const preview=prepareCsp(data,b.action==='enable'&&row.detail.perEventValidation?events.map((e:CspEvent)=>({...e,selected:e.selected&&e.approved===true})):events,others,row.date);
 let chosen=new Set<string>();
 if(['validate','validate-state','enable'].includes(b.action)){
  if(b.checked!==true)fail('Confirmer la vérification des pages et des situations avant/après.');
  if(b.action==='validate-state'){
   if(!['ready','scheduled','covered','duplicate'].includes(b.state))fail('Les décisions « À vérifier » doivent être corrigées avant validation.');
   chosen=new Set(preview.filter(e=>e.selected&&!e.approved&&e.state===b.state).map(e=>e.id));
   if(!chosen.size)fail('Aucune décision restante dans cet état. Actualiser la vérification.',409);
  }else chosen=new Set(preview.filter(e=>e.selected&&(b.action==='enable'?(!row.detail.perEventValidation||e.approved):!e.approved)).map(e=>e.id));
  // Recompute with ONLY approved decisions and this batch. A draft in another
  // state must never supply a prerequisite to a decision being published.
  const isolated=events.map((e:CspEvent)=>({...e,selected:e.selected&&(chosen.has(e.id)||(b.action==='enable'?e.approved||!row.detail.perEventValidation:e.approved===true))}));
  const checked=prepareCsp(data,isolated,others,row.date);
  for(const e of checked)if(e.selected&&chosen.has(e.id)){
   if(e.state==='blocked')fail('Ce groupe contient une décision restant à vérifier : '+e.problem);
   const full=preview.find(p=>p.id===e.id)!;
   if(JSON.stringify(e.before)!==JSON.stringify(full.before)||JSON.stringify(e.after)!==JSON.stringify(full.after))fail('Ce groupe dépend de décisions encore en attente. Valider d’abord les décisions prêtes correspondantes.');
  }
 }
 const now=new Date().toISOString();
 const stored=events.map((e:CspEvent)=>{if(e.approved)return e;const p=preview.find(p=>p.id===e.id)!;return {...e,agentId:p.agentId,...(chosen.has(e.id)?{approved:true,approvedAt:now,recordedBefore:p.before,recordedAfter:p.after}:{})};});
 const publishing=b.action!=='save';const detail={...row.detail,events:stored,perEventValidation:publishing||row.detail.perEventValidation===true,checked:b.checked===true,validatedAt:publishing?now:row.detail.validatedAt,actor:request.headers.get('oai-authenticated-user-email')};
 const status=publishing?'validated':row.status;const changed=await db.prepare('UPDATE agent_imports SET detail=?,status=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),status,stored.filter((e:CspEvent)=>e.selected).length,b.id,row.status,JSON.stringify(row.detail)).run();
 if(changed.meta.changes!==1)fail('Le relevé a changé dans une autre fenêtre. Recharger avant de réessayer.',409);
 return Response.json({ok:true,status,validated:chosen.size,...cspProgress(status,detail)});
}catch(e){return agentError(e);}}
