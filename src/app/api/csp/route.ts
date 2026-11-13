import {isPendingAdmission,resolvePendingAdmissions} from '../../../lib/csp-pending-admission';
import {recoverTitularisationCells} from '../../../lib/csp-salary-cells';
import {recoverCspPages,confirmCspPage} from '../../../lib/csp-recovery';
import {cspUnreadPages} from '../../../lib/csp-coverage';
import {cspAutomaticCompletion} from '../../../lib/csp-document-completion';
import {cspDocumentLabel} from '../../../lib/csp-document-label';
import {correctionEvents,planCspCorrection} from '../../../lib/csp-correction';
import {acknowledgeCspDecisions} from '../../../lib/csp-acknowledgement';
import {prepareCspDocuments,addCrCandidates} from '../../../lib/csp-candidates';
import {activeCspEvents,cspProgress,preserveApproved,restoreExcludedCsp,setCspCandidateOutcome} from '../../../lib/csp-validation';
import {agentAuth,agentData,cspIdentityData,agentError} from '../../../lib/agents-store';
import {resources} from '../../../lib/store';
import {cspKinds,cspKey,cspNonRetained,cspResolvedEvent,validateCspEvent,deduplicateCsp,validDate,latestAnnual,parisToday,projectCsp,CSP_SOURCE} from '../../../lib/csp';
import {manualNRImport,validateManualNR,manualNRReasons} from '../../../lib/csp-manual-nr';
import {calculateNRReport} from '../../../lib/csp-nr-report';
import {applyNRScopes,type NRScopeOverride} from '../../../lib/nr-allocation';
import {snapshot} from '../../../lib/agents';
import type {CspEvent} from '../../../lib/csp';
function fail(message:string,status=400):never{throw Object.assign(Error(message),{status});}
const parse=(row:any)=>{let detail:any={};try{detail=JSON.parse(row.detail||'{}');}catch{}return {...row,detail,rawDetail:detail,rawDetailText:row.detail};};
const metadata=(row:any)=>({id:row.id,name:row.name,date:row.date,status:row.status,automaticallyValidated:!!row.automaticallyValidated,count:row.count,documentType:row.detail.documentType==='cr'?'cr':'rd',created:row.created,duplicates:row.detail.duplicates||0,reports:row.detail.reports||[],unreadPages:cspUnreadPages(row.detail.reports).length,perEventValidation:!!row.detail.perEventValidation,candidateVersion:row.detail.candidateVersion||0,salaryCellsVersion:row.detail.salaryCellsVersion||0,corrections:(row.detail.corrections||[]).map((c:any)=>({eventId:c.eventId,reason:c.reason,at:c.at})),...cspProgress(row.status,row.detail)});
async function imports(){const rows=acknowledgeCspDecisions((await resources().db.prepare('SELECT * FROM agent_imports WHERE id LIKE ? ORDER BY date,created,id').bind('csp-%').all<any>()).results.map(parse).filter(r=>r.detail.kind==='csp'));return rows.map(row=>({...row,automaticallyValidated:cspAutomaticCompletion(row,rows)}));}
const currentDocument=(row:any)=>({id:row.id,name:row.name,status:row.status,documentType:row.detail.documentType==='cr'?'cr' as const:'rd' as const});
const documents=(rows:any[])=>rows.map(r=>({id:r.id,name:r.name,date:r.date,status:r.status,created:r.created,documentType:r.detail.documentType==='cr'?'cr' as const:'rd' as const,events:(r.detail.events||[]).map((e:CspEvent)=>r.status==='validated'&&!r.detail.perEventValidation&&e.selected?{...e,approved:true}:e)}));
function input(body:any){
 if(!body||!validDate(body.date)||!Array.isArray(body.events)||!body.events.length||body.events.length>3000||!body.events.every(validateCspEvent)||new Set(body.events.map((e:any)=>e.id)).size!==body.events.length)fail('Date ou décisions invalides. Corriger les dates et les valeurs avant l’enregistrement.');
 if(body.events.filter((e:any)=>e.selected).length===0)fail('Sélectionner au moins une décision.');
 return deduplicateCsp(body.events as CspEvent[]);
}
export async function GET(request:Request){try{
 await agentAuth(request);const p=new URL(request.url).searchParams,id=p.get('id');
 if(p.get('nrReport')==='1'){
  await agentAuth(request,true);
  const year=Number(p.get('year'));
  if(!Number.isInteger(year)||year<2020||year>2100)fail('Année de bilan NR invalide.');
  const docs=(await imports()).filter(row=>row.status==='validated').map(row=>({
   id:row.id,name:row.name,date:row.date,status:row.status,
   documentType:row.detail.documentType==='cr'?'cr':'rd',
   events:row.detail.events||[]
  }));
  const manualRows=(await resources().db.prepare("SELECT id,agent,note,created FROM agent_decisions WHERE kind='manual_nr' ORDER BY created DESC").all<any>()).results;
  for(const row of manualRows){
   try{
    const entry=JSON.parse(row.note||'{}');
    if(!validateManualNR(entry)||entry.agentId!==row.agent)continue;
    const manual=manualNRImport({...entry,id:row.id,created:row.created,actor:String(entry.actor||'administrateur')});
    docs.push({...manual,manual:true} as any);
   }catch{/* Une saisie historique illisible ne bloque pas le bilan. */}
  }
  const overrides=(await resources().db.prepare("SELECT id,agent,note,created FROM agent_decisions WHERE kind='nr_allocation' ORDER BY created,id").all<any>()).results.flatMap(row=>{try{const entry=JSON.parse(row.note||'{}');return typeof entry.rowId==='string'&&entry.agentId===row.agent&&['ulm','outside_ulm'].includes(entry.scope)?[entry as NRScopeOverride]:[];}catch{return [];}});
  return Response.json(applyNRScopes(calculateNRReport(docs,year),overrides),{headers:{'Cache-Control':'no-store'}});
 }

 if(p.get('manual')==='1'){
  await agentAuth(request,true);
  const entries=(await resources().db.prepare("SELECT id,agent,created,note FROM agent_decisions WHERE kind='manual_nr' ORDER BY created DESC LIMIT 200").all<any>()).results;
  return Response.json({reasons:manualNRReasons,entries:entries.flatMap(row=>{try{const entry=JSON.parse(row.note||'{}');return validateManualNR(entry)?[{...entry,id:row.id,created:row.created}]:[];}catch{return [];}})});
 }
 if(id){await agentAuth(request,true);const rows=await imports();const row=rows.find(r=>r.id===id);if(!row)fail('Relevé introuvable.',404);return Response.json({meta:metadata(row),events:row.detail.events||[]});}
 const rows=await imports();
 const q=(p.get('q')||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),kind=p.get('kind')||'',meeting=p.get('meeting')||'',agent=p.get('agent')||'';
 const offset=Math.max(0,Math.floor(Number(p.get('offset'))||0)),pageSize=60;
 const pending=rows.filter(r=>r.status==='validated').flatMap(r=>activeCspEvents(r.detail).filter(isPendingAdmission));
 let history=rows;
 if(pending.length){const {data:baseData}=await agentData(true,undefined,parisToday(),false);const data=await cspIdentityData(baseData,pending);const resolved=resolvePendingAdmissions(data,rows.map(r=>({...r,events:activeCspEvents(r.detail)})));history=rows.map((r,index)=>({...r,detail:{...r.detail,events:resolved[index].events,perEventValidation:false}}));}
 const rawManual=!meeting?(await resources().db.prepare("SELECT id,agent,note,created FROM agent_decisions WHERE kind='manual_nr' ORDER BY created DESC LIMIT 500").all<any>()).results:[];
 const manual=rawManual.flatMap(row=>{try{
  const data=JSON.parse(row.note||'{}');if(!validateManualNR(data)||row.agent!==data.agentId)return [];
  const imp=manualNRImport({...data,id:row.id,created:row.created,actor:String(data.actor||'administrateur')});
  const event=imp.events[0];return [{...event,manual:true,importId:imp.id,meetingDate:imp.date,document:'Avancement administratif manuel · '+manualNRReasons[data.reason]}];
 }catch{return [];}});
 const official=history.filter(r=>r.status==='validated'&&(!meeting||r.id===meeting)).flatMap(r=>activeCspEvents(r.detail).map(e=>({...e,importId:r.id,meetingDate:r.date,document:r.name})));
 const decisions=[...official,...manual].filter(e=>(!kind||e.kind===kind)&&(!agent||e.agentId===agent)&&(!q||(e.name+' '+e.agentId+' '+e.agency).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().includes(q))).sort((a,b)=>b.effective.localeCompare(a.effective)||a.name.localeCompare(b.name,'fr'));
 const unique=new Map<string,typeof decisions[number]>();for(const e of decisions)if(!unique.has(cspKey(e)))unique.set(cspKey(e),e);const list=[...unique.values()];
 return Response.json({imports:rows.map(metadata),total:list.length,records:list.slice(offset,offset+pageSize),kinds:cspKinds,pageSize});
}catch(e){return agentError(e);}}
export async function POST(request:Request){try{
 await agentAuth(request,true);const isForm=request.headers.get('content-type')?.startsWith('multipart/form-data');
 if(!isForm){const body=await request.json();const rows=await imports();const evidence=documents(rows);const saved=body.id?rows.find(r=>r.id===body.id):null;const events=preserveApproved(input(body),saved?.detail.events||[],saved?.status==='review'||saved?.status==='validated'&&saved.detail.perEventValidation===true,saved?.rawDetail?.events||[]);const {data:baseData,cspImports}=await agentData(true,undefined,parisToday(),false);const data=await cspIdentityData(baseData,[...events,...cspImports.flatMap(i=>i.events.filter(isPendingAdmission))]);const preview=prepareCspDocuments(data,events,cspImports.filter(i=>i.id!==body.id),body.date,evidence,saved?currentDocument(saved):{id:'csp-unsaved',name:'Document en cours',documentType:body.documentType==='cr'?'cr':'rd'});return Response.json({events:preview.map(e=>e.approved?{...e,state:e.acknowledgedByDocument?'duplicate':'validated',before:e.recordedBefore,after:e.recordedAfter,...(e.acknowledgedByDocument?{matchedDocument:e.acknowledgedByDocument}:{}),problem:e.acknowledgedByDocument?.cumulativeKind==='reclassement'?'Cumul reclassement et avancement confirmé : même résultat final, aucune nouvelle application.':e.acknowledgedByDocument?.cumulative?'Cumul nomination et avancement confirmé par le RD validé : même résultat final malgré un ordre différent, aucune nouvelle application.':e.acknowledgedByDocument?'Décision déjà validée dans le document '+cspDocumentLabel(e.acknowledgedByDocument.documentType)+' : reconnue automatiquement, sans nouvelle application.':'Décision déjà validée et intégrée.'}:e),base:latestAnnual(data),blocked:preview.filter(e=>e.selected&&!e.approved&&e.state==='blocked').length});}
 const f=await request.formData(),file=f.get('file'),raw=f.get('extraction');
 if(!(file instanceof File)||!file.size||file.size>20*1024*1024||!/\.pdf$/i.test(file.name)||typeof raw!=='string'||raw.length>1500000)fail('Choisir un PDF de moins de 20 Mo.');
 const body=JSON.parse(raw),events=preserveApproved(input(body),[],false);const bytes=await file.arrayBuffer();if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')fail('Le fichier n’est pas un PDF.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');const {db,bucket}=resources();
 const existing=await db.prepare('SELECT id FROM agent_imports WHERE hash=?').bind(hash).first<any>();if(existing)return Response.json({id:existing.id,existing:true});
 const {data:baseData,cspImports}=await agentData(true,undefined,parisToday(),false);const data=await cspIdentityData(baseData,[...events,...cspImports.flatMap(i=>i.events.filter(isPendingAdmission))]);const id='csp-'+crypto.randomUUID();const preview=prepareCspDocuments(data,events,cspImports,body.date,documents(await imports()),{id,name:file.name,documentType:body.documentType==='cr'?'cr':'rd'});
 const stored=events.map(e=>cspResolvedEvent(e,preview.find(p=>p.id===e.id)!));
 const reports=Array.isArray(body.reports)?body.reports.slice(0,250).map((r:any)=>({page:Number(r.page),section:String(r.section||'').slice(0,80),count:Number(r.count)||0,status:['read','empty','unsupported'].includes(r.status)?r.status:'unsupported',note:String(r.note||'').slice(0,200)})):[];
 const detail={kind:'csp',version:1,salaryCellsVersion:1,documentType:body.documentType==='cr'?'cr':'rd',candidateVersion:body.documentType==='cr'&&body.candidateVersion===1?1:0,events:stored,reports,duplicates:Math.max(0,Number(body.duplicates)||0),checked:false};
 await bucket.put('agents/'+id+'/original',bytes,{httpMetadata:{contentType:'application/pdf'}});
 await db.prepare('INSERT INTO agent_imports (id,name,hash,date,created,status,count,complete,detail) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,file.name.slice(0,240),hash,body.date,new Date().toISOString(),'review',stored.length,0,JSON.stringify(detail)).run();
 return Response.json({id,count:stored.length});
}catch(e){return agentError(e);}}
export async function PATCH(request:Request){try{
 await agentAuth(request,true);const b=await request.json();
 if(b.action==='set-nr-allocation'){
  if(typeof b.rowId!=='string'||b.rowId.length>250||typeof b.agentId!=='string'||b.agentId.length>100||!['ulm','outside_ulm','to_clarify'].includes(b.scope)||typeof b.reason!=='string'||b.reason.trim().length<12||b.reason.length>500||typeof b.agency!=='string'||b.agency.length>180||typeof b.relatedAgency!=='string'||b.relatedAgency.length>180)fail('Classement NR invalide. Indiquer une origine, une agence et un motif explicite.');
  const year=Number(b.year);
  if(!Number.isInteger(year)||year<2020||year>2100)fail('Année invalide.');
  const docs=(await imports()).filter(row=>row.status==='validated').map(row=>({id:row.id,name:row.name,date:row.date,status:row.status,documentType:row.detail.documentType==='cr'?'cr':'rd',events:row.detail.events||[]}));
  const manualRows=(await resources().db.prepare("SELECT id,agent,note,created FROM agent_decisions WHERE kind='manual_nr'").all<any>()).results;
  for(const row of manualRows){try{const entry=JSON.parse(row.note||'{}');if(!validateManualNR(entry)||entry.agentId!==row.agent)continue;docs.push({...manualNRImport({...entry,id:row.id,created:row.created,actor:String(entry.actor||'administrateur')}),manual:true} as any);}catch{}}
  const source=calculateNRReport(docs,year).rows.find(r=>r.id===b.rowId&&r.agentId===b.agentId&&r.nr!==null&&r.nr>0);
  if(!source)fail('Mouvement introuvable dans le bilan validé. Actualiser.',409);
  const scope=b.scope as 'ulm'|'outside_ulm'|'to_clarify';
  if(scope==='ulm'&&(!b.agency.trim()||['AGENCE NON RENSEIGNÉE','NON RENSEIGNÉE','SANS AGENCE'].includes(b.agency.trim().toUpperCase())))fail('Indiquer une agence fiable pour imputer ces NR à l’ULM.');
  const {db}=resources();const id='nr-allocation:'+encodeURIComponent(source.id);const existing=await db.prepare("SELECT id FROM agent_decisions WHERE id=? AND kind='nr_allocation'").bind(id).first<any>();
  if(scope==='to_clarify'){
   if(existing)await db.prepare("DELETE FROM agent_decisions WHERE id=? AND kind='nr_allocation'").bind(id).run();
   return Response.json({ok:true,scope:'to_clarify'});
  }
  const note=JSON.stringify({rowId:source.id,agentId:source.agentId,scope,agency:scope==='ulm'?b.agency.trim():'',relatedAgency:b.relatedAgency.trim(),reason:b.reason.trim(),updatedAt:new Date().toISOString(),updatedBy:String(request.headers.get('oai-authenticated-user-email')||'administrateur').slice(0,200)});
  await db.prepare("INSERT INTO agent_decisions (id,agent,kind,target,source,note,created) VALUES (?,?,'nr_allocation',NULL,'bilan-nr',?,?) ON CONFLICT(id) DO UPDATE SET note=excluded.note,created=excluded.created WHERE agent_decisions.kind='nr_allocation' AND agent_decisions.agent=excluded.agent").bind(id,source.agentId,note,new Date().toISOString()).run();
  return Response.json({ok:true,scope});
 }
 if(b.action==='manual-nr'){
  if(!validateManualNR(b.entry))fail('Renseigner un NNI, un GF, le NR avant, la date d’effet, un motif et une observation de 20 caractères minimum.');
  if(b.confirmed!==true)fail('Confirmer explicitement cet avancement manuel.');
  const entry=b.entry,created=new Date().toISOString(),actor=String(request.headers.get('oai-authenticated-user-email')||'administrateur').slice(0,200);
  if(entry.effective>parisToday()||entry.arrivalConfirmed&&entry.arrivalEffective>parisToday())fail('La date d’effet de l’avancement et la date d’arrivée doivent être passées.');
  const {data,cspImports}=await agentData(true,undefined,entry.effective,false);
  const names=new Set([...data.records.filter(r=>r.agentId===entry.agentId).map(r=>r.name),...cspImports.flatMap(i=>i.events.filter(e=>e.agentId===entry.agentId).map(e=>e.name))].map(v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase()));
  const entered=entry.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  if(names.size&&!names.has(entered))fail('Le nom indiqué ne correspond pas au NNI dans les sources de référence. Vérifier le rapprochement.');
  const duplicate=cspImports.some(i=>i.status==='validated'&&i.events.some(e=>e.agentId===entry.agentId&&e.effective===entry.effective&&
   e.kind==='avancement'&&e.nrBefore===entry.nrBefore&&e.nrAfter===entry.nrBefore+5));
  if(duplicate)fail('Cet avancement NR existe déjà pour cet agent et cette date.',409);
  const manual=manualNRImport({...entry,id:crypto.randomUUID(),created,actor});
  const projectionDate=entry.arrivalConfirmed?entry.arrivalEffective:entry.effective;
  const trial=projectCsp(data,[...cspImports,manual],projectionDate);
  const trouble=trial.issues.find(i=>manual.events.some(e=>e.id===i.event.id));
  if(trouble)fail('Avancement non applicable : '+trouble.problem+' Vérifier la situation de départ et les mutations précédentes.',409);
  const projected=snapshot(trial.data,CSP_SOURCE).find(row=>row.agentId===entry.agentId);
  if(!projected||projected.gf!==entry.gf||projected.nr<entry.nrBefore+5)
   fail('Impossible de confirmer la chaîne GF/NR. Vérifier les mouvements précédents, notamment une arrivée dans l’unité.',409);
  const note=JSON.stringify({...entry,actor,manual:true});
  const {db}=resources();
  const previous=await db.prepare("SELECT id,note FROM agent_decisions WHERE kind='manual_nr' AND agent=?").bind(entry.agentId).all<any>();
  if(previous.results.some(v=>{try{const old=JSON.parse(v.note||'{}');return old.effective===entry.effective&&old.nrBefore===entry.nrBefore&&old.gf===entry.gf;}catch{return false;}}))
   fail('Cet avancement manuel est déjà enregistré.',409);
  await db.prepare('INSERT INTO agent_decisions (id,agent,kind,target,source,note,created) VALUES (?,?,?,?,?,?,?)')
   .bind(manual.events[0].id,entry.agentId,'manual_nr',null,'admin-manual-nr',note,created).run();
  return Response.json({ok:true,id:manual.events[0].id,from:entry.nrBefore,to:entry.nrBefore+5,reason:manualNRReasons[entry.reason]});
 }
 if(typeof b.id!=='string'||!b.id.startsWith('csp-'))fail('Relevé invalide.');const {db}=resources();const row=(await imports()).find(r=>r.id===b.id);if(!row||row.detail.kind!=='csp')fail('Relevé introuvable.',404);
 if(b.action==='set-candidacy-outcome'){
  if(!['review','validated'].includes(row.status)||row.detail.documentType!=='cr'||row.status==='validated'&&!row.detail.perEventValidation||typeof b.eventId!=='string'||typeof b.nonRetained!=='boolean')fail('Choisir une candidature de l’ODJ actif et son classement.');
  const events=setCspCandidateOutcome(row.detail.events||[],b.eventId,b.nonRetained);
  const detail={...row.detail,events,candidacyOutcomes:[...(row.detail.candidacyOutcomes||[]),{eventId:b.eventId,nonRetained:b.nonRetained,at:new Date().toISOString(),actor:request.headers.get('oai-authenticated-user-email')}]};
  const changed=await db.prepare('UPDATE agent_imports SET detail=?,status=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),row.status,events.filter((e:CspEvent)=>e.selected).length,b.id,row.status,row.rawDetailText??JSON.stringify(row.rawDetail||row.detail)).run();
  if(changed.meta.changes!==1)fail('Le document a changé. Actualiser avant de classer la candidature.',409);
  return Response.json({ok:true,...cspProgress(row.status,detail)});
 }
 if(b.action==='restore-excluded'){
  if(!['review','validated'].includes(row.status)||b.checked!==true||!Array.isArray(b.eventIds)||b.eventIds.length>250||!b.eventIds.every((x:any)=>typeof x==='string'))fail('Confirmer les mouvements écartés à réintégrer.');
  const events=restoreExcludedCsp(row.detail.events||[],b.eventIds);
  const detail={...row.detail,events,perEventValidation:row.status==='validated'?true:row.detail.perEventValidation,
   restorations:[...(row.detail.restorations||[]),{ids:b.eventIds,at:new Date().toISOString(),reason:'Réintégration de décisions écartées pour contrôle et validation'}]};
  const changed=await db.prepare('UPDATE agent_imports SET detail=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),events.filter((e:CspEvent)=>e.selected).length,b.id,row.status,row.rawDetailText??JSON.stringify(row.rawDetail||row.detail)).run();
  if(changed.meta.changes!==1)fail('Le document a changé. Actualiser avant de réintégrer.',409);
  return Response.json({ok:true,restored:b.eventIds.length});
 }
 if(b.action==='confirm-page'){
  if(!['review','validated'].includes(row.status)||b.checked!==true||!Number.isInteger(b.page))fail('Confirmer la vérification complète de la page.');
  const confirmed=confirmCspPage(row.detail,b.page);
  const detail={...confirmed,pageReviews:[...(row.detail.pageReviews||[]),{page:b.page,at:new Date().toISOString(),actor:request.headers.get('oai-authenticated-user-email')}]};
  const changed=await db.prepare('UPDATE agent_imports SET detail=?,status=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),row.status,row.count,b.id,row.status,row.rawDetailText??JSON.stringify(row.rawDetail||row.detail)).run();
  if(changed.meta.changes!==1)fail('Le document a changé. Recharger.',409);return Response.json({ok:true});
 }
 if(b.action==='recover-salary-cells'){
  if(row.detail.documentType!=='cr'||!['review','validated'].includes(row.status)||!Array.isArray(b.events)||b.events.length>3000||!b.events.every(validateCspEvent))fail('Résultat de relecture des GF/NR invalide.');
  const detail=recoverTitularisationCells(row.detail,row.status,b.events);
  const changed=await db.prepare('UPDATE agent_imports SET detail=?,status=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),row.status,row.count,b.id,row.status,row.rawDetailText??JSON.stringify(row.rawDetail||row.detail)).run();
  if(changed.meta.changes!==1)fail('Le document a changé. Recharger avant de reprendre sa lecture.',409);
  return Response.json({ok:true});
 }
 if(b.action==='recover-pages'){
  if(!['review','validated'].includes(row.status))fail('Réactiver le document avant de reprendre sa lecture.',409);
  if(!Array.isArray(b.events)||b.events.length>3000||!b.events.every(validateCspEvent)||!Array.isArray(b.reports)||b.reports.length>250)fail('Résultat de relecture invalide.');
  let detail=recoverCspPages(row.detail,row.status,deduplicateCsp(b.events),b.reports);
  if(detail.events.length>3000)fail('Le document dépasse 3 000 décisions.');
  const {data:baseData,cspImports}=await agentData(true,undefined,parisToday(),false);
  const data=await cspIdentityData(baseData,detail.events);
  const checked=prepareCspDocuments(data,detail.events,cspImports.filter(i=>i.id!==b.id),row.date,documents(await imports()),currentDocument(row));
  detail={...detail,events:detail.events.map((e:CspEvent)=>e.approved?e:cspResolvedEvent(e,checked.find(p=>p.id===e.id)!))};
  const added=detail.events.length-(row.detail.events||[]).length;
  const changed=await db.prepare('UPDATE agent_imports SET detail=?,status=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),row.status,detail.events.filter((e:CspEvent)=>e.selected).length,b.id,row.status,row.rawDetailText??JSON.stringify(row.rawDetail||row.detail)).run();
  if(changed.meta.changes!==1)fail('Le document a changé. Recharger avant de reprendre sa lecture.',409);
  return Response.json({ok:true,added,unreadPages:cspUnreadPages(detail.reports).length});
 }
 if(b.action==='add-candidates'){
  if(row.detail.documentType!=='cr'||row.status.startsWith('disabled')||!Array.isArray(b.events)||b.events.length>3000||!b.events.every((e:any)=>validateCspEvent(e)&&e.candidacy===true&&e.kind==='nomination'))fail('Candidatures de l’ODJ invalides.');
  const detail=addCrCandidates(row.detail,row.status,deduplicateCsp(b.events));
  if(detail.events.length>3000)fail('Le ODJ dépasse 3 000 situations après récupération des candidatures.');
  const count=detail.events.filter((e:CspEvent)=>e.selected).length;
  const changed=await db.prepare('UPDATE agent_imports SET detail=?,status=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),row.status,count,b.id,row.status,row.rawDetailText??JSON.stringify(row.rawDetail||row.detail)).run();
  if(changed.meta.changes!==1)fail('Le relevé a changé. Recharger.',409);return Response.json({ok:true});
 }
 if(['preview-correction','correct-event'].includes(b.action)){
  if(!['review','validated'].includes(row.status))fail('Réactiver le document avant de corriger une décision.',409);
  if(typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>500)fail('Indiquer un motif de correction (500 caractères maximum).');
  if(!b.event||b.event.id!==b.eventId)fail('Choisir une seule décision à corriger.');
  const events=correctionEvents(row,b.event);
  const rows=await imports();
  const {data:baseData,cspImports}=await agentData(true,undefined,parisToday(),false);
  const data=await cspIdentityData(baseData,[...events,...cspImports.flatMap(i=>i.events.filter(isPendingAdmission))]);
  const plan=planCspCorrection(data,rows,row,b.event);
  const bytes=new TextEncoder().encode(JSON.stringify([rows.map(r=>[r.id,r.status,r.rawDetail]),b.event,b.reason.trim()]));
  const token=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(b.action==='preview-correction')return Response.json({decision:plan.decision,impact:plan.impact,token});
  if(b.token!==token)fail('La situation a changé ou la correction n’a pas été vérifiée. Vérifier de nouveau avant d’enregistrer.',409);
  const detail={...row.detail,events:plan.events,perEventValidation:true,corrections:[...(row.detail.corrections||[]),{eventId:b.eventId,reason:b.reason.trim(),at:new Date().toISOString(),actor:request.headers.get('oai-authenticated-user-email'),before:plan.original,after:plan.events.find(e=>e.id===b.eventId)}]};
  const changed=await db.prepare('UPDATE agent_imports SET detail=?,status=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),'validated',plan.events.filter(e=>e.selected).length,b.id,row.status,row.rawDetailText??JSON.stringify(row.rawDetail||row.detail)).run();
  if(changed.meta.changes!==1)fail('Le relevé a changé. Recharger avant de réessayer.',409);
  return Response.json({ok:true,...cspProgress('validated',detail)});
 }
 if(b.action==='disable'){
  const changed=await db.prepare("UPDATE agent_imports SET status='disabled:validated' WHERE id=? AND status='validated' AND detail=?").bind(b.id,row.rawDetailText??JSON.stringify(row.rawDetail||row.detail)).run();if(changed.meta.changes!==1)fail('Le relevé a changé. Recharger avant de réessayer.',409);return Response.json({ok:true});
 }
 const persistedApproved=new Set((row.rawDetail?.events||row.detail.events||[]).filter((e:CspEvent)=>e.approved).map((e:CspEvent)=>e.id));
 const newAcknowledgements=row.detail.events.some((e:CspEvent)=>e.approved&&e.acknowledgedByDocument&&!persistedApproved.has(e.id));
 const progress=cspProgress(row.status,row.detail);const partial=row.status==='validated'&&row.detail.perEventValidation===true&&(newAcknowledgements||progress.pending>0||row.detail.events.some((e:CspEvent)=>e.candidacy&&!e.approved));
 if(['validate','validate-state','validate-event'].includes(b.action)&&row.status!=='review'&&!partial)fail('Ce relevé est déjà validé ou désactivé. Recharger.',409);
 if(b.action==='enable'&&row.status!=='disabled:validated')fail('Ce relevé n’est pas désactivé.',409);
 if(b.action==='revise'){
  if(!['validated','disabled:validated'].includes(row.status))fail('Le relevé est déjà en cours de vérification.',409);
  const detail={...row.detail,perEventValidation:false,checked:false,events:preserveApproved(row.detail.events,[],false)};
  const changed=await db.prepare('UPDATE agent_imports SET detail=?,status=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),'review',row.count,b.id,row.status,row.rawDetailText??JSON.stringify(row.rawDetail||row.detail)).run();
  if(changed.meta.changes!==1)fail('Le relevé a changé. Recharger.',409);return Response.json({ok:true});
 }
 if(!['save','validate','validate-state','validate-event','enable'].includes(b.action))fail('Action inconnue.');
 if(b.action==='save'&&row.status!=='review'&&!partial)fail('Utiliser « Corriger » pour modifier des décisions déjà validées.',409);
 const events=b.action==='enable'?row.detail.events:preserveApproved(input({date:row.date,events:b.events}),row.detail.events||[],partial||row.status==='review',row.rawDetail?.events||[]);
 const {data:baseData,cspImports}=await agentData(true,undefined,parisToday(),false);const data=await cspIdentityData(baseData,[...events,...cspImports.flatMap(i=>i.events.filter(isPendingAdmission))]);const others=cspImports.filter(i=>i.id!==b.id);const evidence=documents(await imports());
 const preview=prepareCspDocuments(data,b.action==='enable'&&row.detail.perEventValidation?events.map((e:CspEvent)=>({...e,selected:e.selected&&e.approved===true})):events,others,row.date,evidence,currentDocument(row));
 // Identity resolution in the browser preview can make a recovered row
 // recognizable by its already approved counterpart on this request.
 // That is a successful documentary acknowledgement, not a second approval.
 const alreadyApproved=persistedApproved;
 const recognizedNow=new Set(preview.filter(e=>e.selected&&e.approved&&e.acknowledgedByDocument&&!alreadyApproved.has(e.id)).map(e=>e.id));
 let chosen=new Set<string>();
 if(['validate','validate-state','validate-event','enable'].includes(b.action)){
  if(b.checked!==true)fail('Confirmer la vérification des pages et des situations avant/après.');
  if(b.action==='validate-event'){
   if(typeof b.eventId!=='string')fail('Choisir la décision à valider.');
   const event=preview.find(e=>e.id===b.eventId);
   if(!event||!event.selected||cspNonRetained(event)||event.approved&&!recognizedNow.has(event.id))fail('Cette décision est absente, écartée ou déjà validée. Actualiser le relevé.',409);
   if(!event.approved&&!['ready','scheduled','covered','duplicate'].includes(event.state))fail('Cette décision reste à vérifier : '+event.problem);
   if(!event.approved)chosen=new Set([event.id]);
  }else if(b.action==='validate-state'){
   if(!['ready','scheduled','covered','duplicate'].includes(b.state))fail('Les décisions « À vérifier » doivent être corrigées avant validation.');
   chosen=new Set(preview.filter(e=>e.selected&&!e.approved&&e.state===b.state).map(e=>e.id));
   if(!chosen.size&&!recognizedNow.size)fail('Aucune décision restante dans cet état. Actualiser la vérification.',409);
  }else chosen=new Set(preview.filter(e=>e.selected&&!cspNonRetained(e)&&(b.action==='enable'?(!row.detail.perEventValidation||e.approved):!e.approved)).map(e=>e.id));
  // Recompute with ONLY approved decisions and this batch. A draft in another
  // state must never supply a prerequisite to a decision being published.
  const isolated=events.map((e:CspEvent)=>({...e,selected:e.selected&&(chosen.has(e.id)||(b.action==='enable'?e.approved||!row.detail.perEventValidation:e.approved===true))}));
  const checked=prepareCspDocuments(data,isolated,others,row.date,evidence,currentDocument(row));
  for(const e of checked)if(e.selected&&chosen.has(e.id)){
   if(e.state==='blocked')fail('Ce groupe contient une décision restant à vérifier : '+e.problem);
   const full=preview.find(p=>p.id===e.id)!;
   if(JSON.stringify(e.before)!==JSON.stringify(full.before)||JSON.stringify(e.after)!==JSON.stringify(full.after))fail('Ce groupe dépend de décisions encore en attente. Valider d’abord les décisions prêtes correspondantes.');
  }
 }
 const now=new Date().toISOString();
 const stored=events.map((e:CspEvent)=>{if(e.approved)return e;const p=preview.find(p=>p.id===e.id)!;return {...cspResolvedEvent(e,p),...(chosen.has(e.id)?{approved:true,approvedAt:now,recordedBefore:p.before,recordedAfter:p.after}:{})};});
 const publishing=b.action!=='save';const detail={...row.detail,events:stored,perEventValidation:publishing||row.detail.perEventValidation===true,checked:b.checked===true,validatedAt:publishing?now:row.detail.validatedAt,actor:request.headers.get('oai-authenticated-user-email')};
 const status=publishing?'validated':row.status;const changed=await db.prepare('UPDATE agent_imports SET detail=?,status=?,count=? WHERE id=? AND status=? AND detail=?').bind(JSON.stringify(detail),status,stored.filter((e:CspEvent)=>e.selected).length,b.id,row.status,row.rawDetailText??JSON.stringify(row.rawDetail||row.detail)).run();
 if(changed.meta.changes!==1)fail('Le relevé a changé dans une autre fenêtre. Recharger avant de réessayer.',409);
 return Response.json({ok:true,status,validated:chosen.size,recognized:recognizedNow.size,...cspProgress(status,detail)});
}catch(e){return agentError(e);}}

