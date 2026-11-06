/** Lecture comptable des NR gagnés : aucun effet sur la projection ou la validation CSP. */
export type NRReportEvent = {
  id:string; name:string; agentId?:string; kind:string; effective:string; selected?:boolean;
  approved?:boolean; candidacy?:boolean; nonRetained?:boolean; nonRetainedByRD?:unknown;
  acknowledgedByDocument?:unknown; acknowledgedByRD?:unknown;
  agency?:string; gfBefore?:number; gfAfter?:number; nrBefore?:number; nrAfter?:number; nrSteps?:number;
  recordedBefore?:{gf?:number;nr?:number;agency?:string};
  recordedAfter?:{gf?:number;nr?:number;agency?:string};
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
 for(const doc of [...documents.filter(d=>!d.manual),...documents.filter(d=>d.manual)]){
  if(doc.status!=='validated')continue;
  for(const e of doc.events||[]){
   if(e.selected!==true||e.approved!==true||e.candidacy||e.nonRetained||e.nonRetainedByRD||e.acknowledgedByDocument||e.acknowledgedByRD||!Object.hasOwn(labels,e.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(e.effective)||Number(e.effective.slice(0,4))!==year)continue;
   const beforeNR=hasNR(e.recordedBefore?.nr)?e.recordedBefore.nr:hasNR(e.nrBefore)?e.nrBefore:null;
   const afterNR=hasNR(e.recordedAfter?.nr)?e.recordedAfter.nr:hasNR(e.nrAfter)?e.nrAfter:null;
   const beforeGF=hasGF(e.recordedBefore?.gf)?e.recordedBefore.gf:hasGF(e.gfBefore)?e.gfBefore:null;
   const afterGF=hasGF(e.recordedAfter?.gf)?e.recordedAfter.gf:hasGF(e.gfAfter)?e.gfAfter:null;
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
