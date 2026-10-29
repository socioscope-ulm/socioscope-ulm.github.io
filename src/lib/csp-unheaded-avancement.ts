import {normalName} from './agents.ts';
import {validDate} from './csp.ts';
import type {CspEvent} from './csp.ts';
import type {CspPage,CspPageReport} from './csp-extract.ts';
export const UNHEADED_ADVANCEMENT='En-tête non reconnu : avancement à compléter.';
// Keep readable people in their known rubrique, but never guess numeric columns.
export function unheadedAvancements(pg:CspPage,report:CspPageReport):CspEvent[]{
 const dates=pg.items.filter(i=>/^\d{2}\/\d{2}\/\d{4}$/.test(i.str.trim())&&i.y<pg.height*.8&&i.y>pg.height*.07);
 const ys=[...new Set(dates.map(i=>i.y))].sort((a,b)=>b-a),events:CspEvent[]=[];
 for(let ix=0;ix<ys.length;ix++){
  const y=ys[ix],hi=Math.min(y+24,ix?(ys[ix-1]+y)/2:pg.height*.8),lo=Math.max(y-24,ix+1<ys.length?(y+ys[ix+1])/2:pg.height*.07);
  const parts=pg.items.filter(i=>i.y<hi&&i.y>lo&&i.x+i.width/2<pg.width*.28&&/^[\p{L}][\p{L} '\-’]+$/u.test(i.str.trim())&&!/\b(?:NOM|PRENOM|DATE|CSP|COMMISSION|AVANCEMENT|UM|DUM|GF|NR|PAGE|UNITE|MAINTENANCE|DIRECTION|SERVICE|AMT)\b/.test(normalName(i.str))).sort((a,b)=>Math.abs(a.y-b.y)<2?a.x-b.x:b.y-a.y);
  const name=parts.map(i=>i.str.trim()).join(' ').replace(/\s+/g,' ');if(name.split(' ').length<2||name.length>=180)continue;
  const values=[...new Set(dates.filter(i=>Math.abs(i.y-y)<2).map(i=>{const [d,m,a]=i.str.trim().split('/');return `${a}-${m}-${d}`;}))];
  const effective=values.length===1&&validDate(values[0])?values[0]:'';
  if(!effective)continue;
  events.push({id:`unheaded-p${pg.page}r${ix}`,name,kind:'avancement',effective,page:pg.page,selected:true,extractionIssue:UNHEADED_ADVANCEMENT+' Rubrique identifiée, colonnes GF/NR à vérifier dans le PDF avant toute validation.'});
 }
 report.status='unsupported';report.count=events.length;report.note=events.length?'Rubrique Avancement reconnue ; lignes nominatives récupérées partiellement, GF/NR à compléter. Vérifier que toutes les lignes de la page sont présentes.':'Rubrique Avancement reconnue, mais aucune ligne nominative fiable récupérée. En-tête à examiner ; cette page reste non traitée.';
 return events;
}
