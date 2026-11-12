import {annotationForCspKind} from './csp-annotation-rules.ts';
/** Rapport CSP cadres par date de séance, sans modification des validations. */
export type QuarterlyEvent = {
 id:string; name:string; agentId?:string; kind:string; effective:string;
 page?:number; pages?:number[]; selected?:boolean; approved?:boolean;
 candidacy?:boolean; nonRetained?:boolean; nonRetainedByRD?:unknown;
 acknowledgedByRD?:unknown; acknowledgedByDocument?:unknown;
 gfBefore?:number; gfAfter?:number; nrBefore?:number; nrAfter?:number;
 nrSteps?:number; gfDelta?:number; agency?:string; job?:string; reference?:string;
 note?:string; movementReason?:string; observations?:string; extractionIssue?:string;
 recordedBefore?:{gf?:number;nr?:number;agency?:string;job?:string};
 recordedAfter?:{gf?:number;nr?:number;agency?:string;job?:string;nrProvisional?:boolean};
};
export type QuarterlyDocument = {
 id:string; name:string; date:string; status:string; documentType:'cr'|'rd';
 perEventValidation?:boolean; automaticallyValidated?:boolean; events:QuarterlyEvent[];
};
export type QuarterlySource = {id:string;ref:string;name:string;date:string;type:'ODJ'|'RD';status:string;automaticallyValidated?:boolean};
export type QuarterlyRow = {
 id:string; name:string; kind:string; meeting:string; effective:string;
 agency:string; job:string; movementReason:string; observations:string; gfBefore:string; gfAfter:string;
 nrBefore:string; nrAfter:string; nrSteps:string; source:string;
 notes:string; resolvedNotes?:string; sources:string[]; estimated:boolean;
};
export type QuarterlyCandidate = {id:string;name:string;meeting:string;agency:string;job:string;reference:string;reason:string;source:string};
export type PreviouslyReportedMovement = {
 name:string;kind:string;effective:string;meeting:string;originalMeeting:string;
 originalDocument:string;currentDocument:string;effectOutsideOriginalQuarter:boolean;
};
export type QuarterlyReport = {
 year:number;quarter:number;sources:QuarterlySource[];
 rows:QuarterlyRow[];candidates:QuarterlyCandidate[];
 previouslyReported:PreviouslyReportedMovement[];
 alerts:string[];pendingDocuments:number;meetingDates:string[];
};
export const kindLabels:Record<string,string>={
 admission:'Admission au stage',titularisation:'Titularisation',mutation:"Mutation d'office",
 reclassement:'Reclassement',avancement:'Avancement au choix',
 posthume:'Avancement à titre posthume',mesure:'Mesure salariale',nomination:'Nomination'
};
export const kindOrder=['admission','titularisation','mutation','reclassement','avancement','mesure','nomination','posthume'];
const norm=(v:unknown)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
export const isCadresDocument=(name:string)=>/\bCSP CADRES\b/.test(norm(name));
const filled=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const numeric=(e:QuarterlyEvent,k:'gfBefore'|'gfAfter'|'nrBefore'|'nrAfter')=>{
 const direct=e[k];if(filled(direct))return direct;
 const record=(k.endsWith('Before')?e.recordedBefore:e.recordedAfter);
 const alt=k.startsWith('gf')?record?.gf:record?.nr;
 return filled(alt)?alt:undefined;
};
const nrGain=(e:QuarterlyEvent)=>filled(e.nrSteps)?e.nrSteps:
 filled(numeric(e,'nrBefore'))&&filled(numeric(e,'nrAfter'))?
 (numeric(e,'nrAfter')!-numeric(e,'nrBefore')!)/5:undefined;
const evidence=(e:QuarterlyEvent)=>['gfBefore','gfAfter','nrBefore','nrAfter'].filter(k=>filled(numeric(e,k as 'gfBefore'))).length+
 (e.reference?1:0)+(e.job?1:0)+(e.agency?1:0);
const fmt=(v:number|undefined)=>v===undefined?'—':String(v);
export function quarterBounds(year:number,quarter:number){
 if(!Number.isInteger(year)||year<2020||year>2100||!Number.isInteger(quarter)||quarter<1||quarter>4)throw Error('Année ou trimestre invalide.');
 const m=(quarter-1)*3+1;
 const start=String(year)+'-'+String(m).padStart(2,'0')+'-01';
 const end=m===10?String(year+1)+'-01-01':String(year)+'-'+String(m+3).padStart(2,'0')+'-01';
 return {start,end};
}
type Item={doc:QuarterlyDocument;ref:string;e:QuarterlyEvent};
type Group={base:string;items:Item[]};
// Le libellé du RD vaut confirmation d'une nomination à GF/NR constants,
// uniquement en présence du bordereau ODJ correspondant.
const gfConstant=(e:QuarterlyEvent)=>e.kind==='nomination'&&(e.gfDelta===0||/\bGF\s+CONSTANT(?:E|S)?\b/i.test(norm(e.note)));
const sameNomination=(a:QuarterlyEvent,b:QuarterlyEvent)=>a.kind==='nomination'&&b.kind==='nomination'&&
 norm(a.agentId||a.name)===norm(b.agentId||b.name)&&
 (!a.reference||!b.reference||norm(a.reference)===norm(b.reference))&&
 (!a.job||!b.job||norm(a.job)===norm(b.job))&&
 // La date d'effet n'est pas toujours renseignée dans les candidatures ODJ.
 (!a.effective||!b.effective||a.effective===b.effective);
// Some RDs put the already-attributed NR in "NR before" while the ODJ
// has the actual NR before/after and the same NR+ count. This is not a
// second advancement. Match only across ODJ/RD for one meeting, one person,
// one effective date and one consistent award; never merge two ODJ or two RDs.
function shiftedAdvancement(odj:Item,rd:Item){
 if(odj.doc.documentType!=='cr'||rd.doc.documentType!=='rd'||
  odj.doc.date!==rd.doc.date||odj.e.kind!=='avancement'||rd.e.kind!=='avancement'||
  odj.e.effective!==rd.e.effective||
  norm(odj.e.agentId||odj.e.name)!==norm(rd.e.agentId||rd.e.name))return false;
 const stepOdj=nrGain(odj.e),stepRd=nrGain(rd.e);
 const before=numeric(odj.e,'nrBefore'),after=numeric(odj.e,'nrAfter');
 const rdBefore=numeric(rd.e,'nrBefore'),rdAfter=numeric(rd.e,'nrAfter');
 const odjGF=numeric(odj.e,'gfBefore'),rdGF=numeric(rd.e,'gfBefore');
 return filled(stepOdj)&&Number.isInteger(stepOdj)&&stepOdj>0&&
  stepOdj===stepRd&&filled(before)&&filled(after)&&after-before===stepOdj*5&&
  rdBefore===after&&rdAfter===undefined&&
  (!filled(odjGF)||!filled(rdGF)||odjGF===rdGF)&&
  (!odj.e.reference||!rd.e.reference||norm(odj.e.reference)===norm(rd.e.reference));
}
function shiftedPair(a:Item,b:Item){
 return shiftedAdvancement(a,b)||shiftedAdvancement(b,a);
}
function compatible(g:Group,item:Item){
 const e=item.e;
 if(g.items.some(i=>i.doc.id===item.doc.id))return false;
 for(const old of g.items){
  const a=old.e;
  if(old.doc.date!==item.doc.date)return false;
  if(a.reference&&e.reference&&norm(a.reference)!==norm(e.reference))return false;
  if(a.kind==='nomination'&&a.job&&e.job&&norm(a.job)!==norm(e.job))return false;
  if(['avancement','mesure','posthume'].includes(a.kind)){
   const first=nrGain(a),second=nrGain(e);
   if(filled(first)&&filled(second)&&first!==second)return false;
   if(shiftedPair(old,item))continue;
   if(filled(numeric(a,'nrBefore'))&&filled(numeric(e,'nrBefore'))&&numeric(a,'nrBefore')!==numeric(e,'nrBefore'))return false;
   if(filled(numeric(a,'nrAfter'))&&filled(numeric(e,'nrAfter'))&&numeric(a,'nrAfter')!==numeric(e,'nrAfter'))return false;
  }
 }
 return true;
}
function toRow(g:Group):QuarterlyRow{
 const priority=[...g.items].sort((a,b)=>evidence(b.e)-evidence(a.e)||Number(b.doc.documentType==='rd')-Number(a.doc.documentType==='rd'));
 const first=priority[0].e;
 const shifted=g.items.flatMap(a=>g.items.map(b=>({a,b}))).find(({a,b})=>shiftedAdvancement(a,b));
 const confirmation=g.items.find(x=>x.doc.documentType==='rd'&&gfConstant(x.e));
 const odjEvidence=confirmation?g.items.find(x=>x.doc.documentType==='cr'&&sameNomination(x.e,confirmation.e)&&
  filled(numeric(x.e,'gfBefore'))&&filled(numeric(x.e,'nrBefore'))&&
  (!filled(numeric(x.e,'gfAfter'))||numeric(x.e,'gfAfter')===numeric(x.e,'gfBefore'))&&
  (!filled(numeric(x.e,'nrAfter'))||numeric(x.e,'nrAfter')===numeric(x.e,'nrBefore'))):undefined;
 const constantValue=(k:'gfBefore'|'gfAfter'|'nrBefore'|'nrAfter')=>{
  if(!odjEvidence||!confirmation)return undefined;
  const before=k.endsWith('Before');
  const fromOdj=numeric(odjEvidence.e,k);
  const initial=numeric(odjEvidence.e,k.startsWith('gf')?'gfBefore':'nrBefore');
  return before?(fromOdj??initial):(initial??fromOdj);
 };
 const pick=(k:'gfBefore'|'gfAfter'|'nrBefore'|'nrAfter')=>{
  const confirmed=constantValue(k);if(confirmed!==undefined)return confirmed;
  // The verified ODJ has the true starting/ending NR of this single award.
  if(shifted&&k.startsWith('nr'))return numeric(shifted.a.e,k);
  for(const x of priority){const n=numeric(x.e,k);if(n!==undefined)return n;}return undefined;
 };
 // Admission au stage et titularisation ne modifient pas le GF.
 // Les sources peuvent ne renseigner qu'une seule des deux valeurs :
 // compléter uniquement le côté manquant pour le CR (aucune écriture en base).
 const originalBeforeGF=pick('gfBefore'),originalAfterGF=pick('gfAfter');
 const constantStageGF=first.kind==='admission'||first.kind==='titularisation';
 const knownStageGF=constantStageGF
  ?first.kind==='admission'?(originalAfterGF??originalBeforeGF):(originalBeforeGF??originalAfterGF)
  :undefined;
 const beforeGF=originalBeforeGF??knownStageGF;
 const afterGF=originalAfterGF??knownStageGF;
 const beforeNR=pick('nrBefore');let afterNR=pick('nrAfter');
 const steps=priority.map(x=>nrGain(x.e)).find(filled);
 let estimated=false;
 if(afterNR===undefined&&beforeNR!==undefined&&steps!==undefined&&Number.isInteger(steps)&&steps>=0&&['avancement','mesure','posthume'].includes(first.kind)){
  afterNR=beforeNR+steps*5;estimated=true;
 }
 const sourceRefs=[...new Set(g.items.map(x=>x.ref+' p.'+(x.e.page||'?')))];
 const agency=priority.map(x=>x.e.recordedAfter?.agency||x.e.agency||x.e.recordedBefore?.agency||'').find(Boolean)||'—';
 const job=priority.map(x=>x.e.job||x.e.recordedAfter?.job||'').find(Boolean)||'';
 // Documentary Motif / Observations are taken exclusively from the ODJ.
 // An RD note must never replace a printed ODJ cell and can be a different
 // type of control message. A missing ODJ cell is reported, not fabricated.
 const requiredAnnotation=annotationForCspKind(first.kind);
 const annotation=(key:'movementReason'|'observations')=>{
  if(requiredAnnotation!==key)return '—';
  const odj=g.items.filter(x=>x.doc.documentType==='cr')
   .map(x=>String(x.e[key]||'').trim()).filter(Boolean);
  const distinct=odj.filter((value,i)=>odj.findIndex(other=>norm(other)===norm(value))===i);
  return distinct.length?distinct.join('\n'):'—';
 };
 const checks:string[]=[],resolved:string[]=[];
 // Ne jamais masquer un éventuel écart réel GF sur ces mouvements.
 if(constantStageGF&&filled(originalBeforeGF)&&filled(originalAfterGF)&&originalBeforeGF!==originalAfterGF){
  checks.push('Incohérence GF pour '+kindLabels[first.kind]+' : GF avant '+originalBeforeGF+' différent du GF après '+originalAfterGF+'. Les documents sources doivent être vérifiés.');
 }
 if(constantStageGF&&knownStageGF===undefined){
  checks.push('GF absent des documents pour '+kindLabels[first.kind]+' : impossible de compléter les GF avant et après sans valeur source.');
 }
 const location=(x:Item)=>x.ref+' · '+x.doc.name+' · page '+(x.e.page||'?');
 const labels={gfBefore:'GF avant',gfAfter:'GF après',nrBefore:'NR avant',nrAfter:'NR après'};
 for(const k of ['gfBefore','gfAfter','nrBefore','nrAfter'] as const){
  const nums=[...new Set(g.items.map(x=>numeric(x.e,k)).filter(filled))];
  // RD's "NR before" may echo ODJ's "NR after": not a real conflict.
  if(nums.length>1&&!(shifted&&k==='nrBefore'&&
   nums.length===2&&nums.includes(numeric(shifted.a.e,'nrBefore')!)&&nums.includes(numeric(shifted.a.e,'nrAfter')!)))
   checks.push('Divergence '+labels[k]+' : '+g.items.filter(x=>numeric(x.e,k)!==undefined).map(x=>numeric(x.e,k)+' dans '+location(x)).join(' / '));
 }
 for(const x of g.items){
  const where=location(x);
  if(x.e.recordedAfter?.nrProvisional&&!odjEvidence)checks.push('NR après provisoire ('+fmt(numeric(x.e,'nrAfter'))+') : valeur conservée sans confirmation explicite du NR. Le mouvement est validé. Source : '+where);
  let note=String(x.e.note||'');
  // Remove only the known obsolete instruction, never the rest of a warning.
  const generic=/v[eé]rifier les situations avant\/apr[eè]s\s*;\s*le NR apr[eè]s doit [eê]tre renseign[eé]\.?/i;
  if(x.e.kind==='nomination'&&generic.test(note)&&(numeric(x.e,'nrAfter')!==undefined&&!x.e.recordedAfter?.nrProvisional||!!odjEvidence)){
   note=note.replace(generic,'').trim();
   resolved.push('Ancienne demande de renseignement du NR : NR après désormais renseigné ('+(odjEvidence?constantValue('nrAfter'):numeric(x.e,'nrAfter'))+'). Source : '+where);
  }
  if(x.e.extractionIssue)checks.push('Anomalie de lecture : '+x.e.extractionIssue+'. Source : '+where);
  if(odjEvidence&&/GF\s+constant/i.test(note))note=note.replace(/GF\s+constant(?:e|s)?/ig,'').trim();
  if(/v[eé]rifier|non reconnu|incoh[eé]ren|manquan|[eé]cart/i.test(note))checks.push('Note à relire (ne signifie pas que le NR est provisoire) : '+note+'. Source : '+where);
 }
 const date=g.items[0].doc.date;
 return {id:g.base+':'+g.items[0].e.id,name:first.name,kind:first.kind,
  meeting:date,effective:first.effective||'',
  agency,job,movementReason:annotation('movementReason'),observations:annotation('observations'),
  gfBefore:fmt(beforeGF),gfAfter:fmt(afterGF),
  nrBefore:fmt(beforeNR),nrAfter:fmt(afterNR)+(estimated?'*':''),
  nrSteps:steps===undefined||!Number.isInteger(steps)?'—':String(steps),
  source:sourceRefs.join(', '),sources:[...new Set(g.items.map(x=>x.ref))],
  notes:[...new Set(checks)].join('\n'),resolvedNotes:[...new Set(resolved)].join('\n'),estimated};
}
// A movement belongs to the first validated CSP that presented the same
// documented decision. An effective date in a later quarter does not create
// a new decision. Compare the actual transition before suppressing a row:
// the same agent can genuinely receive a second award on the same effective date.
function samePreviouslyReportedMovement(prior:Group,current:Group){
 const older=prior.items[0],later=current.items[0];
 if(!older||!later||older.doc.date>=later.doc.date||!older.e.effective||
   prior.base!==current.base)return false;
 const a=toRow(prior),b=toRow(current);
 const refs=(g:Group)=>[...new Set(g.items.map(x=>norm(x.e.reference)).filter(Boolean))];
 const leftRefs=refs(prior),rightRefs=refs(current);
 if(leftRefs.length&&rightRefs.length&&!leftRefs.some(x=>rightRefs.includes(x)))return false;
 const referenceMatch=leftRefs.some(x=>rightRefs.includes(x));
 if(a.kind==='nomination'||a.kind==='mutation'){
  const olderJobs=prior.items.map(x=>norm(x.e.job)).filter(Boolean);
  const laterJobs=current.items.map(x=>norm(x.e.job)).filter(Boolean);
  if(olderJobs.length&&laterJobs.length&&!olderJobs.some(x=>laterJobs.includes(x)))return false;
  if(a.kind==='mutation'&&a.agency!=='—'&&b.agency!=='—'&&norm(a.agency)!==norm(b.agency))return false;
 }
 const gains=(g:Group,key:'nrSteps'|'gfDelta')=>g.items.map(x=>x.e[key]).filter(filled);
 for(const key of ['nrSteps','gfDelta'] as const){
  const earlier=gains(prior,key),now=gains(current,key);
  if(earlier.length&&now.length&&!earlier.some(x=>now.includes(x)))return false;
 }
 const value=(v:string)=>/^\d+\*?$/.test(v)?Number.parseInt(v,10):undefined;
 const fields=['gfBefore','gfAfter','nrBefore','nrAfter'] as const;
 const matches=new Set<string>();
 for(const field of fields){
  const x=value(a[field]),y=value(b[field]);
  if(x!==undefined&&y!==undefined){
   if(x!==y)return false;
   matches.add(field);
  }
 }
 const sameNR=matches.has('nrBefore')&&matches.has('nrAfter');
 const sameGF=matches.has('gfBefore')&&matches.has('gfAfter');
 const sameNRResult=matches.has('nrAfter');
 const sameGFResult=matches.has('gfAfter');
 // NR-changing movements require a proven matching progression, or a
 // shared reference plus consistent numeric evidence. A bare NR quoted in a
 // later RD may be the starting point of a *new* award: never infer a duplicate.
 if(['avancement','mesure','posthume'].includes(a.kind))
  return sameNR||(referenceMatch&&(matches.has('nrBefore')||sameNRResult));
 if(a.kind==='reclassement')
  return (sameGF&&(sameNR||sameNRResult))||
   (referenceMatch&&(sameGFResult||sameNR));
 // Admission / titularisation / nomination / mutation: enough matching
 // GF/NR values, or a shared position reference with a confirmed value.
 return (sameNR&&(matches.has('gfBefore')||sameGFResult||referenceMatch))||
  (sameGF&&sameNRResult)||
  (referenceMatch&&(sameGFResult||sameNRResult)&&matches.size>=2);
}
const quarterKey=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)
 ?v.slice(0,4)+'-T'+Math.ceil(Number(v.slice(5,7))/3):'';
const isValidatedMovement=(doc:QuarterlyDocument,e:QuarterlyEvent)=>
 e.selected===true&&!e.candidacy&&doc.status==='validated'&&
 (!doc.perEventValidation||e.approved===true)&&
 !e.nonRetained&&!e.nonRetainedByRD&&!e.acknowledgedByDocument&&!e.acknowledgedByRD&&
 !!kindLabels[e.kind];
const groupMovements=(items:Item[])=>{
 const groups:Group[]=[];
 for(const item of items){
  const base=norm(item.e.agentId||item.e.name)+'|'+item.e.kind+'|'+item.e.effective;
  let g=groups.find(x=>x.base===base&&compatible(x,item));
  if(!g){g={base,items:[]};groups.push(g);}
  g.items.push(item);
 }
 return groups;
};
export function calculateQuarterlyReport(documents:QuarterlyDocument[],year:number,quarter:number):QuarterlyReport{
 const {start,end}=quarterBounds(year,quarter);
 const docs=documents.filter(d=>isCadresDocument(d.name)&&d.date>=start&&d.date<end)
  .sort((a,b)=>a.date.localeCompare(b.date)||
   Number(a.documentType==='rd')-Number(b.documentType==='rd')||a.name.localeCompare(b.name,'fr'));
 // Reuse the server's completion result: it checks active validation proofs,
 // unresolved events and unread pages. This never promotes events for export.
 const completedAutomatically=(d:QuarterlyDocument)=>d.status==='review'&&d.automaticallyValidated===true;
 const sources=docs.map((d,i)=>({id:d.id,ref:'D'+String(i+1).padStart(2,'0'),
  name:d.name,date:d.date,type:d.documentType==='cr'?'ODJ' as const:'RD' as const,status:d.status,automaticallyValidated:completedAutomatically(d)}));
 const groups:Group[]=[];const candidates=new Map<string,QuarterlyCandidate>();const alerts:string[]=[];
 for(let index=0;index<docs.length;index++){
  const doc=docs[index],ref=sources[index].ref;
  for(const e of doc.events||[]){
   if(!e.selected)continue;
   if(e.candidacy){
    if(!(e.nonRetained||e.nonRetainedByRD))continue;
    const key=norm(e.agentId||e.name)+'|'+norm(e.reference||e.job)+'|'+doc.date;
    if(!candidates.has(key))candidates.set(key,{id:key,name:e.name,meeting:doc.date,agency:e.agency||'—',
     job:e.job||'',reference:e.reference||'',source:ref+' p.'+(e.page||'?'),
     reason:typeof e.nonRetainedByRD==='object'&&e.nonRetainedByRD!==null&&(e.nonRetainedByRD as {reason?:string}).reason==='unfilled-post'?'Poste non pourvu':'Non retenu'});
    continue;
   }
   if(!isValidatedMovement(doc,e))continue;
   const base=norm(e.agentId||e.name)+'|'+e.kind+'|'+e.effective;
   const item={doc,ref,e};
   let g=groups.find(x=>x.base===base&&compatible(x,item));
   if(!g){g={base,items:[]};groups.push(g);}
   g.items.push(item);
  }
 }
 // Compléter uniquement pour le calcul du CR les nominations confirmées « GF constant ».
 // Les événements ODJ acquittés par le RD ne sont pas des mouvements supplémentaires.
 for(const group of groups){
  const rd=group.items.find(x=>x.doc.documentType==='rd'&&gfConstant(x.e)&&x.e.kind==='nomination');
  if(!rd)continue;
  const candidates=docs.flatMap((d,i)=>d.documentType==='cr'&&d.date===rd.doc.date&&
   (d.status==='validated'||d.status==='review'&&d.automaticallyValidated===true)?
   (d.events||[]).filter(e=>e.selected&&!e.nonRetained&&!e.nonRetainedByRD&&sameNomination(e,rd.e)&&
    (d.status==='validated'&&(!d.perEventValidation||e.approved===true)||!!e.acknowledgedByRD||!!e.acknowledgedByDocument))
    .map(e=>({doc:d,ref:sources[i].ref,e})):[]);
  if(candidates.length===1&&!group.items.some(x=>x.doc.id===candidates[0].doc.id))group.items.push(candidates[0]);
 }
 // Compare with validated decisions from preceding CSPs, including CSPs of
 // earlier quarters. This is a read-only export filter, never an agent update.
 // Also avoid repeating one decision in two meetings of this same quarter.
 const olderDocs=documents.filter(d=>isCadresDocument(d.name)&&d.date<start&&d.status==='validated')
  .sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'fr'));
 const historical=groupMovements(olderDocs.flatMap(d=>(d.events||[])
  .filter(e=>isValidatedMovement(d,e)).map(e=>({doc:d,ref:'ARCHIVE',e}))));
 const previouslyReported:PreviouslyReportedMovement[]=[];
 const retained:Group[]=[];
 for(const group of groups){
  const matching=[...historical,...retained].find(old=>samePreviouslyReportedMovement(old,group));
  if(!matching){retained.push(group);continue;}
  const original=matching.items[0].doc,duplicate=group.items[0].doc;
  previouslyReported.push({
   name:group.items[0].e.name,kind:group.items[0].e.kind,
   effective:group.items[0].e.effective,meeting:duplicate.date,
   originalMeeting:original.date,originalDocument:original.name,
   currentDocument:duplicate.name,
   effectOutsideOriginalQuarter:!!quarterKey(group.items[0].e.effective)&&
    quarterKey(group.items[0].e.effective)!==quarterKey(original.date)
  });
 }
 // Documentary-only ODJ information may still be present when a RD
 // confirmed the decision while the ODJ remains "À vérifier".
 // These ODJ fields are display-only. They cannot validate a decision,
 // create a movement, or change a single GF/NR value.
 const reportRow=(group:Group):QuarterlyRow=>{
  const row=toRow(group),field=annotationForCspKind(row.kind);
  if(!field||row[field]!=='—')return row;
  const base=group.items[0].e,meeting=group.items[0].doc.date;
  const match=(other:QuarterlyEvent)=>{
   if(other.kind!==base.kind||other.effective!==base.effective||
      norm(other.agentId||other.name)!==norm(base.agentId||base.name)||
      other.selected===false||other.candidacy||other.nonRetained||other.nonRetainedByRD)return false;
   if(base.reference&&other.reference&&norm(base.reference)!==norm(other.reference))return false;
   return group.items.every(x=>['gfBefore','gfAfter','nrBefore','nrAfter'].every(k=>{
    const key=k as 'gfBefore'|'gfAfter'|'nrBefore'|'nrAfter';
    const a=numeric(x.e,key),b=numeric(other,key);
    return a===undefined||b===undefined||a===b;
   }));
  };
  const matches=docs.filter(d=>d.documentType==='cr'&&d.date===meeting&&['review','validated'].includes(d.status))
   .flatMap(d=>(d.events||[]).filter(e=>match(e)&&!!String(e[field]||'').trim()).map(e=>({e,d})));
  if(matches.length!==1)return row;
  return {...row,[field]:String(matches[0].e[field]).trim()};
 };
 const rows=retained.map(reportRow).sort((a,b)=>a.meeting.localeCompare(b.meeting)||
  kindOrder.indexOf(a.kind)-kindOrder.indexOf(b.kind)||a.name.localeCompare(b.name,'fr')||a.effective.localeCompare(b.effective));
 const pending=docs.filter(d=>d.status!=='validated'&&!completedAutomatically(d));
 const pendingDocuments=pending.length;
 const formatted=(d:string)=>d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
 if(pendingDocuments)alerts.push(pendingDocuments+' document(s) encore en vérification : '+pending.map(d=>(d.documentType==='cr'?'ODJ':'RD')+' du '+formatted(d.date)).join(', ')+'. Les décisions confirmées dans un autre document validé restent prises en compte.');
 const meetings=[...new Set(docs.map(d=>d.date))];
 for(const meeting of meetings){
  const xs=sources.filter(s=>s.date===meeting);
  const missing=!xs.some(s=>s.type==='ODJ')?'ODJ':!xs.some(s=>s.type==='RD')?'RD':'';
  if(missing)alerts.push('Séance du '+formatted(meeting)+' : '+missing+' non associé dans les documents CSP cadres enregistrés à cette date. Les mouvements déjà validés restent dans le rapport.');
 }
 const checkCount=rows.filter(r=>!!r.notes).length;
 if(checkCount)alerts.push(checkCount+' mouvement(s) signalé(s) : NR provisoire, divergence documentaire, anomalie de lecture ou note à relire. Voir la liste complète des contrôles documentaires ; tous ne sont pas des NR provisoires.');
 if(rows.some(r=>r.estimated))alerts.push('Un astérisque (*) signale un NR après calculé à partir du nombre de NR attribués.');
 if(!docs.length)alerts.push('Aucun document CSP cadres enregistré pour ce trimestre.');
 return {year,quarter,sources,rows,candidates:[...candidates.values()].sort((a,b)=>a.meeting.localeCompare(b.meeting)||a.name.localeCompare(b.name,'fr')),previouslyReported,alerts,pendingDocuments,meetingDates:meetings};
}