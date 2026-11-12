import type {QuarterlyEvent} from './csp-quarterly-report.ts';

const norm=(v:unknown)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();

/** Enrich only the read-only report projection with notes reread from original
 * PDFs. Never alter event identity, approval, salary progression or CSP keys.
 */
export function enrichQuarterlyAnnotations(events:QuarterlyEvent[],read:QuarterlyEvent[]):QuarterlyEvent[]{
 return events.map(event=>{
  const same=(other:QuarterlyEvent)=>other.kind===event.kind&&norm(other.name)===norm(event.name);
  let match=read.find(other=>other.id===event.id&&same(other));
  if(!match){
   // Without an exact row id, never guess when this agent has multiple
   // same-kind same-date decisions (including cumulative advancements).
   const ownDuplicates=events.filter(other=>other.kind===event.kind&&
    norm(other.name)===norm(event.name)&&other.effective===event.effective);
   if(ownDuplicates.length===1){
    const possible=read.filter(other=>same(other)&&other.effective===event.effective&&
     (event.page===undefined||other.page===event.page||
       (Array.isArray(event.pages)&&other.page!==undefined&&event.pages.includes(other.page))));
    if(possible.length===1)match=possible[0];
   }
  }
  if(!match)return event;
  const movementReason=event.movementReason||match.movementReason;
  const observations=event.observations||match.observations;
  if(!movementReason&&!observations)return event;
  return {...event,...(movementReason?{movementReason}:{}),...(observations?{observations}:{})};
 });
}
