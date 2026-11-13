/** Lecture comptable des NR gagnés : aucun effet sur la projection ou la validation CSP. */
export type NRReportEvent = {
  id:string; name:string; agentId?:string; kind:string; effective:string; selected?:boolean;
  approved?:boolean; candidacy?:boolean; nonRetained?:boolean; nonRetainedByRD?:unknown;
  acknowledgedByDocument?:{id?:string;eventId?:string;[key:string]:unknown}; acknowledgedByRD?:unknown;
  agency?:string; job?:string; team?:string; reference?:string; gfDelta?:number;
  gfBefore?:number; gfAfter?:number; nrBefore?:number; nrAfter?:number; nrSteps?:number;
  recordedBefore?:{gf?:number;nr?:number;agency?:string};
  recordedAfter?:{gf?:number;nr?:number;agency?:string;nrProvisional?:boolean};
};
export type NRReportDocument = {id:string;name:string;date:string;status:string;events:NRReportEvent[];manual?:boolean};
export type NRReportRow = {
 id:string;agentId:string;name:string;effective:string;agency:string;
 kind:string;motif:string;beforeNR:number|null;afterNR:number|null;
 beforeGF:number|null;afterGF:number|null;nr:number|null;source:'csp'|'manual';
 documentId:string;document:string;meetingDate:string;justification:'écart NR'|'nombre de NR déclaré'|'à vérifier';
};
const labels:Record<string,string>={avancement:'Avancement au choix',reclassement:'Reclassement',nomination:'Nomination',mesure:'Mesure salariale',posthume:'Avancement à titre posthume'};
const hasNR=(x:unknown):x is number=>typeof x==='number'&&Number.isInteger(x)&&x>=0&&x<=1000&&x%5===0;
const hasGF=(x:unknown):x is number=>typeof x==='number'&&Number.isInteger(x)&&x>=0&&x<=30;
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const agencyOf=(e:NRReportEvent)=>String(e.recordedBefore?.agency||e.recordedAfter?.agency||e.agency||'').trim()||'Agence non renseignée';

/** Les pièces ODJ/RD reconnues ne sont jamais réattribuées. */
export function calculateNRReport(documents:NRReportDocument[],year:number):{year:number;rows:NRReportRow[];totalCsp:number;totalManual:number;total:number;toVerify:number;agents:number}{
 const rows:NRReportRow[]=[];
 const signatures=new Set<string>();
 // An approved ODJ candidacy may establish the starting NR of its *exact*
 // approved RD decision. This is an accounting-only reconciliation: the
 // source events and their provisional fields are never modified.
 const odjByRd=new Map<string,{doc:NRReportDocument;event:NRReportEvent}[]>();
 for(const odj of documents.filter(d=>d.status==='validated'&&!d.manual))
  for(const candidate of odj.events||[]){
   const link=candidate.acknowledgedByDocument;
   if(candidate.kind!=='nomination'||candidate.candidacy!==true||candidate.selected!==true||
      candidate.approved!==true||!link?.id||!link?.eventId)continue;
   const key=JSON.stringify([link.id,link.eventId]);
   const matches=odjByRd.get(key)||[];
   matches.push({doc:odj,event:candidate});odjByRd.set(key,matches);
  }
 for(const doc of [...documents.filter(d=>!d.manual),...documents.filter(d=>d.manual)]){
  if(doc.status!=='validated')continue;
  for(const e of doc.events||[]){
   if(e.selected!==true||e.approved!==true||e.candidacy||e.nonRetained||e.nonRetainedByRD||e.acknowledgedByDocument||e.acknowledgedByRD||!Object.hasOwn(labels,e.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(e.effective)||Number(e.effective.slice(0,4))!==year)continue;
   let beforeNR:number|null=hasNR(e.recordedBefore?.nr)?e.recordedBefore.nr:hasNR(e.nrBefore)?e.nrBefore:null;
   const afterNR=hasNR(e.recordedAfter?.nr)?e.recordedAfter.nr:hasNR(e.nrAfter)?e.nrAfter:null;
   const beforeGF=hasGF(e.recordedBefore?.gf)?e.recordedBefore.gf:hasGF(e.gfBefore)?e.gfBefore:null;
   const afterGF=hasGF(e.recordedAfter?.gf)?e.recordedAfter.gf:hasGF(e.gfAfter)?e.gfAfter:null;
   // A GF-constant nomination with no declared NR gain keeps the same NR
   // only if a uniquely linked, approved ODJ confirms the exact initial GF
   // and NR, reference, assignment, and CSP meeting date. Otherwise keep
   // "A verifier": do not infer a zero from a merely provisional NR.
   if(!doc.manual&&e.kind==='nomination'&&e.gfDelta===0&&e.nrSteps===undefined&&
      beforeNR===null&&afterNR!==null&&afterGF!==null){
    const matches=(odjByRd.get(JSON.stringify([doc.id,e.id]))||[]).filter(({doc:odj,event:original})=>
     odj.date===doc.date&&normalized(original.name)===normalized(e.name)&&
     !!original.reference&&original.reference===e.reference&&
     hasNR(original.nrBefore)&&original.nrBefore===afterNR&&
     hasGF(original.gfBefore)&&original.gfBefore===afterGF&&
     (!original.agentId||!e.agentId||original.agentId===e.agentId)&&
     (!original.job||!e.job||normalized(original.job)===normalized(e.job))&&
     (!original.team||!e.team||normalized(original.team)===normalized(e.team))&&
     (!original.agency||!e.agency||normalized(original.agency)===normalized(e.agency))
    );
    if(matches.length===1)beforeNR=matches[0].event.nrBefore!;
   }
   let nr:number|null=null;
   let justification:NRReportRow['justification']='à vérifier';
   if(beforeNR!==null&&afterNR!==null){
    const delta=afterNR-beforeNR;
    if(delta>=0&&delta%5===0){nr=delta/5;justification='écart NR';}
   }else if(Number.isInteger(e.nrSteps)&&e.nrSteps!>=0&&e.nrSteps!<=30){
    nr=e.nrSteps!;justification='nombre de NR déclaré';
   }
   // Une promotion à indice constant ne constitue pas une attribution.
   if(nr===0)continue;
   const agentId=(e.agentId||'').trim();
   const signature=JSON.stringify([agentId||normalized(e.name),e.kind,e.effective,beforeNR,afterNR,nr,beforeGF,afterGF]);
   if(signatures.has(signature))continue;
   signatures.add(signature);
   rows.push({id:doc.id+':'+e.id,agentId,name:e.name,effective:e.effective,agency:agencyOf(e),kind:e.kind,motif:labels[e.kind],beforeNR,afterNR,beforeGF,afterGF,nr,
    source:doc.manual?'manual':'csp',documentId:doc.id,document:doc.name,meetingDate:doc.date,justification});
  }
 }
 rows.sort((a,b)=>a.effective.localeCompare(b.effective)||a.agency.localeCompare(b.agency,'fr')||a.name.localeCompare(b.name,'fr'));
 const counted=rows.filter(r=>r.nr!==null);
 const totalCsp=counted.filter(r=>r.source==='csp').reduce((s,r)=>s+r.nr!,0);
 const totalManual=counted.filter(r=>r.source==='manual').reduce((s,r)=>s+r.nr!,0);
 return {year,rows,totalCsp,totalManual,total:totalCsp+totalManual,toVerify:rows.filter(r=>r.nr===null).length,agents:new Set(counted.map(r=>r.agentId||normalized(r.name))).size};
}
