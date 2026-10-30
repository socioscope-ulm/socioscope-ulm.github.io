import {normalName} from './agents.ts';
import type {CspPage} from './csp-extract.ts';
export type CspDocumentType='cr'|'rd';
export type CspTypeDetection={documentType?:CspDocumentType;needsConfirmation:boolean;reason:string};
// Titles and table layouts identify the parser; an ambiguous document never
// silently falls back to RD. The filename is supporting evidence only.
export function detectCspDocumentType(pages:CspPage[],filename=''):CspTypeDetection{
 const text=(items:CspPage['items'])=>normalName([...items].sort((a,b)=>b.y-a.y||a.x-b.x).map(i=>i.str).join(' '));
 const titles=pages.map(p=>text(p.items.filter(i=>i.y>p.height*.78))).join(' ');
 const all=pages.map(p=>text(p.items)).join(' ');
 const titleCr=/\bODJ\b|\bORDRES? DU JOUR\b|\bCOMPTES? RENDUS?\b/.test(titles),titleRd=/\bRELEVES? (?:DE |DES )?DECISIONS?\b/.test(titles);
 // Some ODJ PDFs place ANCIEN and NOUVEAU on one row and NR beneath
 // each heading. Linearized PDF text then reads "ANCIEN NOUVEAU NR NR",
 // which is not matched by the ordinary ANCIEN NR / NOUVEAU NR regex.
 const splitNrColumns=pages.some(p=>{
  const label=(s:string)=>normalName(s).replace(/\\s+/g,'');
  const words=p.items.filter(i=>i.str.trim());
  const previous=words.filter(i=>label(i.str)==='ANCIEN');
  const next=words.filter(i=>label(i.str)==='NOUVEAU');
  const nr=words.filter(i=>label(i.str)==='NR');
  return previous.some(a=>next.some(b=>{
   if(Math.abs(a.y-b.y)>13||b.x<=a.x+18)return false;
   const below=(h:typeof a)=>nr.some(n=>Math.abs((n.x+n.width/2)-(h.x+h.width/2))<23&&n.y<h.y&&h.y-n.y<23);
   return below(a)&&below(b)&&words.some(n=>/^(NOM PRENOM|NOM ET PRENOM)$/.test(normalName(n.str))&&Math.abs(n.y-a.y)<28);
  }));
 });
 const layoutCr=/\\bBORDEREAU DES CANDIDATS\\b|\\bANCIEN (?:GF|NR)\\b.*\\bNOUVEAU (?:GF|NR)\\b/.test(all)||splitNrColumns;
 const layoutRd=/\bCANDIDATURE RETENUE\b/.test(all);
 const name=normalName(filename.replace(/[_\-.]/g,' '));
 const nameCr=/\bODJ\b|\bORDRES? DU JOUR\b|\bCR\b|\bCOMPTE RENDU\b/.test(name),nameRd=/\bRD\b|\bRELEVE (?:DE |DES )?DECISIONS\b/.test(name);
 const unsure=(reason:string):CspTypeDetection=>({needsConfirmation:true,reason});
 if(titleCr&&titleRd)return unsure('Le document comporte des titres ODJ et RD. Confirmer le type avant le traitement.');
 let type:CspDocumentType|undefined=titleCr?'cr':titleRd?'rd':layoutCr&&!layoutRd?'cr':layoutRd&&!layoutCr?'rd':undefined;
 if(type&&(type==='cr'&&nameRd||type==='rd'&&nameCr))return unsure('Le nom du fichier et son contenu indiquent des types différents. Confirmer le type.');
 if(!type)return unsure('Le contenu ne permet pas de distinguer avec certitude un ODJ d’un RD. Choisir le type de document.');
 return {documentType:type,needsConfirmation:false,reason:titleCr||titleRd?'Type reconnu dans le titre du document.':'Type reconnu dans la structure des tableaux.'};
}
