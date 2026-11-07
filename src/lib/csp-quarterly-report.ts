/** Rapport CSP cadres par date de séance, sans modification des validations. */
export type QuarterlyEvent = {
 id:string; name:string; agentId?:string; kind:string; effective:string;
 page?:number; pages?:number[]; selected?:boolean; approved?:boolean;
 candidacy?:boolean; nonRetained?:boolean; nonRetainedByRD?:unknown;
 acknowledgedByRD?:unknown; acknowledgedByDocument?:unknown;
 gfBefore?:number; gfAfter?:number; nrBefore?:number; nrAfter?:number;
 nrSteps?:number; gfDelta?:number; agency?:string; job?:string; reference?:string;
 note?:string; extractionIssue?:string;
 recordedBefore?:{gf?:number;nr?:number;agency?:string;job?:string};
 recordedAfter?:{gf?:number;nr?:number;agency?:string;job?:string;nrProvisional?:boolean};
};
export type QuarterlyDocument = {
 id:string; name:string; date:string; status:string; documentType:'cr'|'rd';
 perEventValidation?:boolean; events:QuarterlyEvent[];
};
export type QuarterlySource = {id:string;ref:string;name:string;date:string;type:'ODJ'|'RD';status:string};
export type QuarterlyRow = {
 id:string; name:string; kind:string; meeting:string; effective:string;
 agency:string; job:string; gfBefore:string; gfAfter:string;
 nrBefore:string; nrAfter:string; nrSteps:string; source:string;
 notes:string; sources:string[]; estimated:boolean;
};
export type QuarterlyCandidate = {id:string;name:string;meeting:string;agency:string;job:string;reference:string;reason:string;source:string};
export type QuarterlyReport = {
 year:number;quarter:number;sources:QuarterlySource[];
 rows:QuarterlyRow[];candidates:QuarterlyCandidate[];
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
function compatible(g:Group,item:Item){
 const e=item.e;
 if(g.items.some(i=>i.doc.id===item.doc.id))return false;
 for(const old of g.items){
  const a=old.e;
  if(a.reference&&e.reference&&norm(a.reference)!==norm(e.reference))return false;
  if(a.kind==='nomination'&&a.job&&e.job&&norm(a.job)!==norm(e.job))return false;
  if(['avancement','mesure','posthume'].includes(a.kind)){
   const first=nrGain(a),second=nrGain(e);
   if(filled(first)&&filled(second)&&first!==second)return false;
   if(filled(numeric(a,'nrBefore'))&&filled(numeric(e,'nrBefore'))&&numeric(a,'nrBefore')!==numeric(e,'nrBefore'))return false;
   if(filled(numeric(a,'nrAfter'))&&filled(numeric(e,'nrAfter'))&&numeric(a,'nrAfter')!==numeric(e,'nrAfter'))return false;
  }
 }
 return true;
}
function toRow(g:Group):QuarterlyRow{
 const priority=[...g.items].sort((a,b)=>evidence(b.e)-evidence(a.e)||Number(b.doc.documentType==='rd')-Number(a.doc.documentType==='rd'));
 const first=priority[0].e;
 const pick=(k:'gfBefore'|'gfAfter'|'nrBefore'|'nrAfter')=>{
  for(const x of priority){const n=numeric(x.e,k);if(n!==undefined)return n;}return undefined;
 };
 const beforeGF=pick('gfBefore'),afterGF=pick('gfAfter');
 const beforeNR=pick('nrBefore');let afterNR=pick('nrAfter');
 const steps=priority.map(x=>nrGain(x.e)).find(filled);
 let estimated=false;
 if(afterNR===undefined&&beforeNR!==undefined&&steps!==undefined&&Number.isInteger(steps)&&steps>=0&&['avancement','mesure','posthume'].includes(first.kind)){
  afterNR=beforeNR+steps*5;estimated=true;
 }
 const sourceRefs=[...new Set(g.items.map(x=>x.ref+' p.'+(x.e.page||'?')))];
 const agency=priority.map(x=>x.e.recordedAfter?.agency||x.e.agency||x.e.recordedBefore?.agency||'').find(Boolean)||'—';
 const job=priority.map(x=>x.e.job||x.e.recordedAfter?.job||'').find(Boolean)||'';
 const checks:string[]=[];
 for(const k of ['gfBefore','gfAfter','nrBefore','nrAfter'] as const){
  const nums=[...new Set(g.items.map(x=>numeric(x.e,k)).filter(filled))];
  if(nums.length>1)checks.push('Écart '+k+' entre documents');
 }
 for(const x of g.items){
  if(x.e.recordedAfter?.nrProvisional)checks.push('NR après provisoire dans '+x.ref);
  const note=String(x.e.note||'');
  const staleNominationNote=x.e.kind==='nomination'&&/v[eé]rifier les situations avant\/apr[eè]s.*NR apr[eè]s doit [eê]tre renseign[eé]/i.test(note)&&numeric(x.e,'nrAfter')!==undefined;
  const warn=[x.e.extractionIssue,staleNominationNote?'':note].filter(Boolean).join(' ; ');
  if(/v[eé]rifier|non reconnu|incoh[eé]ren|manquan|[eé]cart/i.test(warn))checks.push('Contrôle '+x.ref);
 }
 const date=g.items[0].doc.date;
 return {id:g.base+':'+g.items[0].e.id,name:first.name,kind:first.kind,
  meeting:date,effective:first.effective||'',
  agency,job,gfBefore:fmt(beforeGF),gfAfter:fmt(afterGF),
  nrBefore:fmt(beforeNR),nrAfter:fmt(afterNR)+(estimated?'*':''),
  nrSteps:steps===undefined||!Number.isInteger(steps)?'—':String(steps),
  source:sourceRefs.join(', '),sources:[...new Set(g.items.map(x=>x.ref))],
  notes:[...new Set(checks)].join(' ; '),estimated};
}
export function calculateQuarterlyReport(documents:QuarterlyDocument[],year:number,quarter:number):QuarterlyReport{
 const {start,end}=quarterBounds(year,quarter);
 const docs=documents.filter(d=>isCadresDocument(d.name)&&d.date>=start&&d.date<end)
  .sort((a,b)=>a.date.localeCompare(b.date)||
   Number(a.documentType==='rd')-Number(b.documentType==='rd')||a.name.localeCompare(b.name,'fr'));
 const sources=docs.map((d,i)=>({id:d.id,ref:'D'+String(i+1).padStart(2,'0'),
  name:d.name,date:d.date,type:d.documentType==='cr'?'ODJ' as const:'RD' as const,status:d.status}));
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
   if(doc.status!=='validated'||doc.perEventValidation===true&&e.approved!==true||e.nonRetained||e.nonRetainedByRD||e.acknowledgedByDocument||e.acknowledgedByRD||!kindLabels[e.kind])continue;
   const base=norm(e.agentId||e.name)+'|'+e.kind+'|'+e.effective;
   const item={doc,ref,e};
   let g=groups.find(x=>x.base===base&&compatible(x,item));
   if(!g){g={base,items:[]};groups.push(g);}
   g.items.push(item);
  }
 }
 const rows=groups.map(toRow).sort((a,b)=>a.meeting.localeCompare(b.meeting)||
  kindOrder.indexOf(a.kind)-kindOrder.indexOf(b.kind)||a.name.localeCompare(b.name,'fr')||a.effective.localeCompare(b.effective));
 const pending=docs.filter(d=>d.status!=='validated');
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
 if(checkCount)alerts.push(checkCount+' mouvement(s) présentant un NR provisoire, une donnée à contrôler ou une divergence documentaire : voir les détails du rapport.');
 if(rows.some(r=>r.estimated))alerts.push('Un astérisque (*) signale un NR après calculé à partir du nombre de NR attribués.');
 if(!docs.length)alerts.push('Aucun document CSP cadres enregistré pour ce trimestre.');
 return {year,quarter,sources,rows,candidates:[...candidates.values()].sort((a,b)=>a.meeting.localeCompare(b.meeting)||a.name.localeCompare(b.name,'fr')),alerts,pendingDocuments,meetingDates:meetings};
}