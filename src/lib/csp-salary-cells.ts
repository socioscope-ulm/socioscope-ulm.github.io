import {cspNameKey} from './csp-rup.ts';
import {validateCspEvent} from './csp.ts';
import type {CspEvent} from './csp.ts';

// Re-read documentary cells only. Never reopen or approve a published decision.
export function recoverTitularisationCells(detail:any,status:string,incoming:CspEvent[]){
 const fields=['gfBefore','gfAfter','nrBefore','nrAfter'] as const;
 const events=(detail.events||[]).map((e:CspEvent)=>{
  if(e.kind!=='titularisation'||e.approved||status==='validated'&&!detail.perEventValidation)return e;
  const matches=incoming.filter(v=>validateCspEvent(v)&&v.kind===e.kind&&v.page===e.page&&v.effective===e.effective&&cspNameKey(v.name)===cspNameKey(e.name));
  if(matches.length!==1)return e;
  const fresh=matches[0];
  if(fields.some(k=>e[k]!==undefined&&fresh[k]!==undefined&&e[k]!==fresh[k]))return {...e,extractionIssue:'La relecture du PDF contredit les GF/NR déjà renseignés. Vérifier cette décision.'};
  const next={...e};for(const k of fields)if(next[k]===undefined&&fresh[k]!==undefined)next[k]=fresh[k];
  if(fresh.extractionIssue&&!next.extractionIssue)next.extractionIssue=fresh.extractionIssue;
  return next;
 });
 return {...detail,events,salaryCellsVersion:1};
}
