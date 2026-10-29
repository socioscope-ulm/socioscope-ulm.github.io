import {cspExtractionIssue} from './csp.ts';
import type {CspEvent} from './csp.ts';
type Document={id:string;status:string;detail:{documentType?:string;events?:CspEvent[]}};
// Derived display-only completion: never publish a movement or persist an approval.
// Rebuild acknowledgements from active, validated source documents before calling.
export function cspAutomaticCompletion(row:Document,rows:Document[]){
 if(row.status!=='review')return false;
 const events=row.detail.events||[];
 const isCr=row.detail.documentType==='cr';
 const sources=new Set(rows.filter(d=>d.status==='validated'&&(d.detail.documentType==='cr')!==isCr).map(d=>d.id));
 return events.length>0&&events.every(e=>{
  if(!e.selected||cspExtractionIssue(e))return false;
  const proof=e.acknowledgedByDocument||e.acknowledgedByRD;
  if(e.approved&&proof&&sources.has(proof.id))return true;
  // Only an RD can establish a non-retained candidacy.
  return isCr&&!!(e.candidacy&&e.nonRetainedByRD&&sources.has(e.nonRetainedByRD.id));
 });
}
