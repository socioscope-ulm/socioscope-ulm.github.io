import {normalName} from './agents.ts';
import type {CspPage,CspTextItem} from './csp-extract.ts';

export type CspRowAnnotations={movementReason?:string;observations?:string};
const mid=(i:CspTextItem)=>i.x+i.width/2;
const normalized=(s:string)=>normalName(s);
const reasonHeader=(s:string)=>/^MOTIFS?(?:\s|$)/.test(normalized(s));
const observationHeader=(s:string)=>/^(?:OBSERVATIONS?|COMMENTAIRES?|REMARQUES?)(?:\s|$)/.test(normalized(s));
const otherHeader=(s:string)=>/\b(?:NOM|PRENOM|UM|DUM|SDUM|GF|NR|DATE|EFFET|EMPLOI|NOUVEAU|ANCIEN|CUMUL|REPORT|AVANCEMENT|NOMBRE|ACCORDE|MOTIF|OBSERVATION|COMMENTAIRE|REMARQUE|LIEU|M3E|LOCALISATION|NR\s*\+)\b/.test(normalized(s));

/** PDF text runs frequently start 10–25pt before the apparent cell border,
 * although almost all their glyphs are visibly inside the cell. Using only
 * the run's starting x misses genuine motifs (observed on the May ODJ).
 * Geometric overlap is safer than taking its start or full-string centre.
 */
export function textItemOverlapsColumn(i:CspTextItem,min:number,max:number):boolean{
 const width=Math.max(i.width,0);
 if(!i.str.trim()||width<=0||max<=min)return false;
 const overlap=Math.max(0,Math.min(i.x+width,max)-Math.max(i.x,min));
 return overlap>=Math.min(width*.45,(max-min)*.4);
}

function text(items:CspTextItem[]):string{
 const sorted=[...items].sort((a,b)=>Math.abs(a.y-b.y)<2?a.x-b.x:b.y-a.y);
 const result=sorted.map(i=>i.str.trim()).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 // PDF watermark noise can appear as isolated single characters in table cells.
 // Never substitute OCR guesses for the printed annotation.
 return result.length>500?result.slice(0,500).trim():result;
}

/** Read only the cells headed MOTIF, COMMENTAIRES or OBSERVATIONS.
 * Header positions, not fixed page percentages, delimit the columns.
 * Row bands are computed by the caller using the other salary/date columns.
 * Never put these strings into the CSP decision's technical note field.
 */
export function readCspRowAnnotations(page:CspPage,headerY:number,band:CspTextItem[]):CspRowAnnotations{
 // Printed headings can be on a separate upper line, especially on
 // salary-measure ODJ tables (e.g. MOTIF above GF/NR and the name header).
 // A symmetric +/-27pt window missed these headings entirely.
 // Limit the search to the header zone: never scan the actual person rows.
 const header=page.items.filter(i=>i.str.trim()&&i.y>=headerY-34&&i.y<=headerY+65);
 const titled=header.filter(i=>reasonHeader(i.str)||observationHeader(i.str));
 if(!titled.length||!band.length)return {};
 const markers=header.filter(i=>otherHeader(i.str));
 const result:CspRowAnnotations={};
 for(const h of titled){
  const x=mid(h);
  const left=[...markers].filter(i=>mid(i)<x-13).sort((a,b)=>mid(b)-mid(a))[0];
  const right=[...markers].filter(i=>mid(i)>x+13).sort((a,b)=>mid(a)-mid(b))[0];
  const min=left?(mid(left)+x)/2:Math.max(0,h.x-16);
  const max=right?(x+mid(right))/2:page.width;
  const value=text(band.filter(i=>textItemOverlapsColumn(i,min,max)));
  if(!value)continue;
  if(reasonHeader(h.str))result.movementReason=value;
  else result.observations=value;
 }
 return result;
}
