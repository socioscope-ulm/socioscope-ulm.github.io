import {normalName} from './agents.ts';
import type {CspPage,CspTextItem} from './csp-extract.ts';

export type CspRowAnnotations={movementReason?:string;observations?:string};
const mid=(i:CspTextItem)=>i.x+i.width/2;
const normalized=(s:string)=>normalName(s);
const reasonHeader=(s:string)=>/^MOTIFS?(?:\s|$)/.test(normalized(s));
const observationHeader=(s:string)=>/^(?:OBSERVATIONS?|COMMENTAIRES?|REMARQUES?)(?:\s|$)/.test(normalized(s));
const otherHeader=(s:string)=>/\b(?:NOM|PRENOM|UM|DUM|SDUM|GF|NR|DATE|EFFET|EMPLOI|NOUVEAU|ANCIEN|CUMUL|REPORT|AVANCEMENT|NOMBRE|ACCORDE|MOTIF|OBSERVATION|COMMENTAIRE|REMARQUE|LIEU|M3E|LOCALISATION|NR\s*\+)\b/.test(normalized(s));

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
  // Anchor by the beginning of a text run: long prose may span most of its
  // cell and its geometric center may fall beyond the column boundary.
  const value=text(band.filter(i=>{
   const start=i.x+Math.min(i.width/2,12);
   return start>=min&&start<max;
  }));
  if(!value)continue;
  if(reasonHeader(h.str))result.movementReason=value;
  else result.observations=value;
 }
 return result;
}
