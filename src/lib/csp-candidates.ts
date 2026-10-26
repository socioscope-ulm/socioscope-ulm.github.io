import {acknowledgeCspDecisions} from './csp-acknowledgement.ts';
import {salaryReferenceChecks} from './csp-salary-reference.ts';
import {normalName} from './agents.ts';
import {cspNameKey} from './csp-rup.ts';
import {prepareCsp,salaryReferenceSupported} from './csp.ts';
import type {CspEvent,CspImport,CspPreview} from './csp.ts';
import type {AgentData,AgentRecord} from './agents.ts';

// Documents are evidence, including drafts. Only `prior` contains applicable
// approved movements. Import timestamps never determine CR/RD matching.
export function prepareCspDocuments(data:AgentData,events:CspEvent[],prior:CspImport[],date:string,documents:CspImport[]=[],current?:{id:string;name:string;documentType:'rd'|'cr'}):CspPreview[]{
 const evidence=current?[...documents.filter(d=>d.id!==current.id),{...current,date,status:'review',events}]:documents;
 if(current){const acknowledged=acknowledgeCspDecisions(evidence.map(d=>({...d,detail:{documentType:d.documentType,perEventValidation:true,events:d.events}})));events=acknowledged.find(d=>d.id===current.id)!.detail.events;}
 const context=prior.map(d=>({...d,events:d.events.filter(e=>!e.salaryReference||salaryReferenceSupported(e,evidence))}));
 const initial=prepareCsp(data,events,context,date);
 const checks=salaryReferenceChecks(data,events,date,evidence);
 // Keep independent annual references independent from documentary fallback.
 for(const p of initial){
  const ref=checks.references.get(p.id);
  if(ref&&!p.approved&&!['duplicate','covered'].includes(p.state)&&((p.before?.gf!==undefined&&p.before.gf!==ref.gf)||(p.before?.nr!==undefined&&p.before.nr!==ref.nr)))checks.problems.set(p.id,'Mesure salariale : la situation connue contredit les valeurs avant du CR. Vérifier la référence GF/NR.');
  if(p.before?.gf!==undefined&&p.before?.nr!==undefined)checks.references.delete(p.id);
 }
 const preview=checks.references.size||checks.problems.size?prepareCsp(data,events,context,date,checks):initial;
 const rd=documents.filter(d=>d.documentType!=='cr'&&d.date===date&&!d.status.startsWith('disabled'));
 // Resolve identities against the complete history above, then examine each RD
 // using only that person's history. Rebuilding the full name/snapshot indexes
 // for every candidature exceeded the Edge Function CPU limit on validation.
 const wanted=new Set(preview.filter(p=>p.candidacy&&p.selected&&p.agentId).map(p=>p.agentId!));
 const records=new Map<string,AgentRecord[]>();
 if(wanted.size)for(const r of data.records)if(wanted.has(r.agentId)){const rows=records.get(r.agentId)||[];rows.push(r);records.set(r.agentId,rows);}
 const scopedData=new Map<string,AgentData>();
 const forAgent=(id:string)=>{let scoped=scopedData.get(id);if(!scoped){scoped={...data,records:records.get(id)||[],cspIdentities:data.cspIdentities?.filter(i=>i.nni===id)};scopedData.set(id,scoped);}return scoped;};
 return preview.map(p=>{
  if(!p.candidacy||!p.selected)return p;
  const blocked=(problem:string):CspPreview=>({...p,state:'blocked',problem});
  if(p.extractionIssue)return blocked(p.extractionIssue);
  if(!p.reference)return blocked('Numéro de publication du poste absent : vérifier le CR.');
  const samePost=rd.flatMap(d=>d.events.filter(e=>!e.candidacy&&e.kind==='nomination'&&e.reference===p.reference).map(e=>({d,e})));
  const matches=samePost.filter(({e})=>e.selected&&cspNameKey(e.name)===cspNameKey(p.name));
  if(!matches.length)return blocked('En attente du RD : aucune nomination retenue et concordante pour ce candidat et ce poste.');
  if(!p.agentId)return blocked('Candidat non rapproché avec certitude : vérifier le NNI dans les RUP.');
  if((p.candidates?.length||0)>1&&matches.some(({e})=>!e.approved&&(!e.agentId||e.identityMethod==='rup'||e.identityMethod==='annual')))return blocked('Plusieurs NNI possibles pour la nomination du RD : confirmer son rapprochement RUP.');
  const checked=matches.map(({d,e})=>{
   // Keep earlier approved decisions from this same RD in the reference, but
   // exclude the matched decision so that its GF increase is never replayed.
   const own={...d,events:d.events.filter(other=>other.id!==e.id&&other.selected&&other.approved&&!other.candidacy)};
   const current:CspImport={id:'csp-current-approved',name:'Décisions déjà validées de ce document',date,status:'validated',events:events.filter(e=>e.approved&&e.selected&&!e.candidacy)};
   const context=[...prior.filter(i=>i.id!==d.id),own,current];
   const scopedContext=context.map(i=>({...i,events:i.events.filter(event=>event.agentId===p.agentId)}));
   const decision=prepareCsp(forAgent(p.agentId!),[e],scopedContext,d.date)[0];
   return {d,e,decision};
  });
  if(checked.some(({decision})=>decision.agentId!==p.agentId))return blocked('Le CR et le RD ne désignent pas le même NNI : vérifier le rapprochement RUP.');
  if(checked.some(({decision})=>!['ready','scheduled','covered','duplicate'].includes(decision.state)))return blocked('Nomination du RD à vérifier : '+checked.find(({decision})=>!['ready','scheduled','covered','duplicate'].includes(decision.state))!.decision.problem);
  const signature=({e,decision}:{e:CspEvent;decision:CspPreview})=>JSON.stringify([e.effective,e.gfDelta,e.gfAfter,e.nrAfter,e.nrConfirmed,normalName(e.agency),normalName(e.job),decision.after]);
  if(new Set(checked.map(signature)).size>1)return blocked('Plusieurs RD actifs donnent des nominations différentes pour ce poste et ce candidat.');
  const {d,e,decision}=checked[0];
  if(!e.agency||!e.job)return blocked('Destination de la nomination incomplète dans le RD : vérifier l’agence et l’emploi.');
  for(const [field,key] of [['gfBefore','gf'],['nrBefore','nr']] as const){
   const expected=e[field]??decision.before?.[key]??e.recordedBefore?.[key];
   if(p[field]!==undefined&&expected!==undefined&&p[field]!==expected)return blocked(`${key.toUpperCase()} du candidat dans le CR (${p[field]}) différent de la situation avant du RD (${expected}). Vérifier les documents.`);
  }
  for(const field of ['agency','job'] as const)if(p[field]&&e[field]&&normalName(p[field])!==normalName(e[field]))return blocked('Destination différente entre le CR et le RD : vérifier '+(field==='job'?'l’emploi.':'l’agence.'));
  return {...p,state:decision.state==='scheduled'?'scheduled':'ready',effective:e.effective,before:decision.before||e.recordedBefore,after:decision.after||e.recordedAfter,matchedRD:{id:d.id,eventId:e.id,name:d.name,page:e.page,approved:e.approved===true},problem:'Candidat retenu confirmé par le RD « '+d.name+' ». La prise de poste est appliquée uniquement par le RD validé, sans double comptage.'};
 });
}

// Backfill only the formerly ignored candidature rows. Existing decisions,
// annotations, PDF and approvals are left intact, even for fully validated CRs.
export function addCrCandidates(detail:any,status:string,candidates:CspEvent[]){
 const saved:CspEvent[]=detail.events||[],keys=new Set(saved.filter(e=>e.candidacy).map(e=>cspNameKey(e.name)+'|'+e.reference));
 const additions=candidates.filter(e=>{const key=cspNameKey(e.name)+'|'+e.reference;if(keys.has(key))return false;keys.add(key);return true;});
 const ids=new Set(saved.map(e=>e.id));
 const added=additions.map((e,ix)=>{let id=e.id;while(ids.has(id))id='candidate-'+ix+'-'+id;ids.add(id);const {approved,approvedAt,recordedBefore,recordedAfter,...candidate}=e;return {...candidate,id,candidacy:true,selected:true};});
 const old=saved.map(e=>status==='validated'&&!detail.perEventValidation&&e.selected?{...e,approved:true}:e);
 return {...detail,candidateVersion:1,perEventValidation:status==='validated'?true:detail.perEventValidation,events:[...old,...added]};
}

