import {cspExtractionIssue,cspKey,cspNRSteps} from './csp.ts';
import {cspNameKey} from './csp-rup.ts';
import type {CspEvent,CspImport,CspPreview} from './csp.ts';
// A GF/NR-constant appointment preserves a separately approved salary award.
// The candidature may quote the salary before that award. Accept the older
// observation only when this meeting contains an exact, unique approved chain.
export function constantNominationAdvancement(candidate:CspEvent,nomination:CspPreview,date:string,documents:CspImport[]){
 if(!candidate.candidacy||!candidate.agentId||candidate.agentId!==nomination.agentId||cspNameKey(candidate.name)!==cspNameKey(nomination.name)||
  nomination.gfDelta!==0||cspNRSteps(nomination)||candidate.gfBefore===undefined||candidate.nrBefore===undefined)return;
 const before=nomination.before,after=nomination.after;
 if(before?.gf===undefined||before.nr===undefined||after?.gf!==before.gf||after.nr!==before.nr||candidate.gfBefore!==before.gf||candidate.nrBefore>=before.nr)return;
 const proofs=new Map<string,CspEvent>();
 for(const doc of documents.filter(d=>d.status==='validated'&&d.date===date))for(const e of doc.events){
  if(!e.selected||!e.approved||e.candidacy||e.acknowledgedByDocument||e.acknowledgedByRD||cspExtractionIssue(e)||
   !['avancement','mesure'].includes(e.kind)||e.agentId!==candidate.agentId||cspNameKey(e.name)!==cspNameKey(candidate.name)||e.gfDelta||e.effective>nomination.effective)continue;
  const a=e.recordedBefore,b=e.recordedAfter,steps=cspNRSteps(e);
  if(a?.gf!==before.gf||b?.gf!==before.gf||a.nr===undefined||b.nr===undefined||!steps||b.nr!==a.nr+steps*5||
   ['gfBefore','gfAfter','nrBefore','nrAfter'].some(k=>(e as any)[k]!==undefined&&(e as any)[k]!== (k==='gfBefore'?a.gf:k==='gfAfter'?b.gf:k==='nrBefore'?a.nr:b.nr)))continue;
  const key=cspKey(e),old=proofs.get(key);
  if(old&&(old.recordedBefore?.nr!==a.nr||old.recordedAfter?.nr!==b.nr))return;
  proofs.set(key,e);
 }
 let nr=candidate.nrBefore,previous='',steps=0;
 while(nr<before.nr){
  const matches=[...proofs.values()].filter(e=>e.recordedBefore!.nr===nr&&e.effective>=previous);
  if(matches.length!==1)return;
  const e=matches[0];nr=e.recordedAfter!.nr!;previous=e.effective;steps++;
 }
 return nr===before.nr&&steps?{before:candidate.nrBefore,after:nr}:undefined;
}
