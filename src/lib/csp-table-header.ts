import {normalName} from './agents.ts';
import type {CspTextItem} from './csp-extract.ts';
const nameLabel=(s:string)=>/^NOM(?: ET)? PRENOMS?(?: DU SALARIE| DE L AGENT)?$/.test(normalName(s));
export function cspNameHeader(items:CspTextItem[]){
 const direct=items.find(i=>nameLabel(i.str));if(direct)return {head:{...direct,str:'NOM PRENOM'},members:[direct]};
 for(const nom of items.filter(i=>normalName(i.str)==='NOM')){
  const prenom=items.find(i=>/^PRENOMS?$/.test(normalName(i.str))&&Math.abs(i.y-nom.y)<=18&&(Math.abs(i.x-nom.x)<20||i.x>=nom.x+nom.width-3&&i.x<=nom.x+nom.width+25));
  if(prenom){const x=Math.min(nom.x,prenom.x);return {head:{...nom,str:'NOM PRENOM',x,y:Math.min(nom.y,prenom.y),width:Math.max(nom.x+nom.width,prenom.x+prenom.width)-x},members:[nom,prenom]};}
 }
}
