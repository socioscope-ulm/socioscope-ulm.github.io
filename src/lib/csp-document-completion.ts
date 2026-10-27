import type {CspEvent} from './csp.ts';
type Document={id:string;status:string;detail:{documentType?:string;events?:CspEvent[]}};
// A derived completion state, never a second approval or a published movement.
// Acknowledgements must first be rebuilt from currently active original RD approvals.
export function cspAutomaticCompletion(row:Document,rows:Document[]){
 if(row.status!=='review'||row.detail.documentType!=='cr')return false;
 const events=row.detail.events||[];
 const rd=new Set(rows.filter(d=>d.status==='validated'&&d.detail.documentType!=='cr').map(d=>d.id));
 return events.length>0&&events.every(e=>{
  if(!e.selected||e.extractionIssue)return false;
  const proof=e.acknowledgedByDocument||e.acknowledgedByRD;
  if(e.approved&&proof&&rd.has(proof.id))return true;
  return !!(e.candidacy&&e.nonRetainedByRD&&rd.has(e.nonRetainedByRD.id));
 });
}
