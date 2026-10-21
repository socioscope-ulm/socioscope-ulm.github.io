import {validateReference} from './payroll-reference.ts';
const norm=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const amount=(v:unknown)=>{const n=Number(String(v??'').replace(/[\s€]/g,'').replace(',','.'));if(String(v??'').trim()===''||!Number.isFinite(n)||n<0)throw Error('Montant manquant ou invalide.');return Math.round(n*100);};
export function parsePayrollRows(rows:unknown[][],kind:'grid'|'bonuses',defaultResidence='1.245'){
 const start=rows.findIndex(r=>r.some(v=>norm(v)===(kind==='grid'?'NR':'GF')));if(start<0)throw Error('En-tête NR ou GF introuvable. Utiliser le modèle proposé.');
 const headers=rows[start].map(norm);const index=(names:string[])=>headers.findIndex(h=>names.includes(h));const level=index([kind==='grid'?'NR':'GF']);
 const rates:Record<string,Record<string,(number|null)[]>>={};const bonuses:Record<string,number>={};const seen=new Set<string>();
 const add=(res:string,nr:number,ech:number,value:unknown)=>{if(!Number.isInteger(nr)||!Number.isInteger(ech)||ech<1||ech>12)throw Error('NR ou échelon invalide.');const key=res+':'+nr+':'+ech;if(seen.has(key))throw Error('Deux valeurs pour le même NR, échelon et majoration.');seen.add(key);rates[res]||={};rates[res][nr]||=Array(12).fill(null);rates[res][nr][ech-1]=amount(value);};
 for(const row of rows.slice(start+1)){if(row.every(v=>String(v??'').trim()===''))continue;const n=Number(row[level]);if(!Number.isInteger(n))throw Error('Chaque ligne doit commencer par un GF ou un NR numérique, sans ligne Total.');
  if(kind==='bonuses'){const col=index(['MONTANTANNUEL','PRIMEANNUELLE','MONTANTMOYEN','TOTALDISPOSITIFS','RPCRPEM']);if(col<0)throw Error('Colonne Montant annuel introuvable. Utiliser GF;Montant annuel.');if(seen.has(String(n)))throw Error('Deux montants pour le même GF.');seen.add(String(n));bonuses[n]=amount(row[col]);}
  else{const resCol=index(['MAJORATION','MAJORATIONRESIDENTIELLE','COEFFICIENTRESIDENTIEL']);const res=resCol<0?defaultResidence:String(row[resCol]).replace(',','.').trim();const ech=index(['ECHELON','ECH']);if(ech>=0){const col=index(['MONTANT','SALAIREMENSUEL','BRUTMENSUEL']);if(col<0)throw Error('Colonne Montant introuvable.');add(res,n,Number(row[ech]),row[col]);}else for(let e=1;e<=12;e++){const col=index(['ECH'+e,'ECHELON'+e]);if(col>=0&&String(row[col]??'').trim()!=='')add(res,n,e,row[col]);}}
 }
 const payload=kind==='grid'?{rates}:{bonuses};if(!validateReference(kind,payload))throw Error('Tableau incomplet ou invalide : chaque NR doit avoir les échelons 4 à 12. Les montants sont en euros, la majoration sous forme de coefficient (1,245).');return payload;
}
export const referenceSample=(kind:string)=>kind==='bonuses'?'GF;Montant annuel\n12;2921\n11;1322':'NR;ECH4;ECH5;ECH6;ECH7;ECH8;ECH9;ECH10;ECH11;ECH12\n200;3608,95;3708,28;3807,61;3906,94;4039,38;4171,82;4304,25;4353,92;4403,58';
