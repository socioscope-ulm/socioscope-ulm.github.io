import {normalName} from './agents.ts';
import {cspNameKey} from './csp-rup.ts';
import type {CspEvent,CspImport} from './csp.ts';
// Confirmation of arrival is always explicit. Concordant documents may supply
// printed constant salary facts, never consent, an increase or another identity.
export function mutationArrivalReferences(events:CspEvent[],date:string,documents:CspImport[],currentId?:string){
 const problems=new Map<string,string>();
 const completed=events.map(e=>{
  if(e.kind!=='mutation'||!e.newAgent||e.approved||!e.selected||!e.agentId||!e.agency)return e;
  const matches=documents.filter(d=>d.id!==currentId&&d.date===date&&!d.status.startsWith('disabled')).flatMap(d=>d.events.filter(s=>s.selected&&!s.extractionIssue&&s.kind==='mutation'&&!s.gfDelta&&!s.nrSteps&&s.agentId===e.agentId&&cspNameKey(s.name)===cspNameKey(e.name)&&s.effective===e.effective&&!!s.agency&&normalName(s.agency)===normalName(e.agency)&&(!e.team||!s.team||normalName(e.team)===normalName(s.team))));
  if(!matches.length)return e;
  const patch:Partial<CspEvent>={};
  for(const [before,after,label] of [['gfBefore','gfAfter','GF'],['nrBefore','nrAfter','NR']] as const){
   const facts=new Set(matches.flatMap(s=>[s[before],s[after]]).filter(v=>v!==undefined));
   if(facts.size>1){problems.set(e.id,'Mutation interunités : '+label+' contradictoire dans les documents de la séance. Vérifier les valeurs avant et après.');return e;}
   const value=[...facts][0];if(value===undefined)continue;
   if([e[before],e[after]].some(v=>v!==undefined&&v!==value)){problems.set(e.id,'Mutation interunités : '+label+' saisi différent du document concordant. Vérifier la valeur conservée.');return e;}
   if(e[before]===undefined)patch[before]=value;
   if(e[after]===undefined)patch[after]=value;
  }
  return {...e,...patch};
 });
 return {events:completed,problems};
}
