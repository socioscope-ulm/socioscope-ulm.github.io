import {cspExtractionIssue} from './csp.ts';
import type {CspEvent,CspImport} from './csp.ts';

// Administrator-facing diagnostics. No inferred movement is ever treated
// as a validated CSP decision or added to the salary projection.
export type CspAlert={
 id:string;
 category:'application'|'verification';
 name:string;
 agentId?:string;
 kind:CspEvent['kind'];
 effective:string;
 importId:string;
 documentName:string;
 documentDate:string;
 documentType:'rd'|'cr';
 eventId:string;
 page:number;
 reason:string;
 gfBefore?:number;
 gfAfter?:number;
 nrBefore?:number;
 nrAfter?:number;
 missingNRFrom?:number;
 missingNRTo?:number;
};
type ProjectionIssue={event:CspEvent&{importId?:string};problem:string};

export function collectCspAlerts(imports:CspImport[],issues:ProjectionIssue[]):CspAlert[]{
 const documents=new Map(imports.map(doc=>[doc.id,doc]));
 const alerts:CspAlert[]=[];
 const known=new Set<string>();
 const add=(category:CspAlert['category'],doc:CspImport,event:CspEvent,reason:string)=>{
  const key=JSON.stringify([doc.id,event.id,category]);if(known.has(key))return;
  known.add(key);
  const missing=reason.match(/justificatif du passage NR (\d+) à (\d+) non intégré/i);
  alerts.push({
   id:key,category,name:event.name,agentId:event.agentId,kind:event.kind,
   effective:event.effective,importId:doc.id,documentName:doc.name,
   documentDate:doc.date,documentType:doc.documentType==='cr'?'cr':'rd',
   eventId:event.id,page:event.page,reason,
   gfBefore:event.gfBefore,gfAfter:event.gfAfter,nrBefore:event.nrBefore,nrAfter:event.nrAfter,
   ...(missing?{missingNRFrom:Number(missing[1]),missingNRTo:Number(missing[2])}:{})
  });
 };
 for(const issue of issues){
  const doc=documents.get(issue.event.importId||'');
  if(doc)add('application',doc,issue.event,issue.problem);
 }
 for(const doc of imports){
  if(doc.status.startsWith('disabled'))continue;
  const activeIds=new Set(doc.status==='validated'?doc.events.map(e=>e.id):[]);
  for(const event of doc.evidenceEvents||[]){
   if(!event.selected||event.candidacy||event.acknowledgedByDocument||event.acknowledgedByRD||
    event.approved===true||activeIds.has(event.id))continue;
   const reason=cspExtractionIssue(event);
   if(reason)add('verification',doc,event,reason);
  }
 }
 return alerts.sort((a,b)=>
  Number(a.category!=='application')-Number(b.category!=='application')||
  b.documentDate.localeCompare(a.documentDate)||a.name.localeCompare(b.name,'fr'));
}
