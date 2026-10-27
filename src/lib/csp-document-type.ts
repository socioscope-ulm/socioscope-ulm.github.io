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
 const layoutCr=/\bBORDEREAU DES CANDIDATS\b|\bANCIEN (?:GF|NR)\b.*\bNOUVEAU (?:GF|NR)\b/.test(all);
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
