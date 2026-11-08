import type {QuarterlyRow} from './csp-quarterly-report';
export type OptionalMovementColumn='gf'|'nr'|'nrSteps'|'source';
export const optionalMovementColumns=[
 {id:'gf',label:'GF avant / après'},
 {id:'nr',label:'NR avant / après'},
 {id:'nrSteps',label:'NR attribués (NR +)'},
 {id:'source',label:'Source'}
] as const;
export const defaultMovementColumns:OptionalMovementColumn[]=optionalMovementColumns.map(c=>c.id);
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
const columns=[
 {id:'name',label:'Nom / prénom',header:'NOM PRÉNOM',width:2.36,value:(r:QuarterlyRow)=>r.name},
 {id:'agency',label:'Agence / poste',header:'AGENCE / POSTE',width:2.46,value:(r:QuarterlyRow)=>[r.agency,r.job].filter(x=>x&&x!=='—').join('\n')||'—'},
 {id:'dates',label:'CSP / effet',header:'CSP / EFFET',width:1.48,value:(r:QuarterlyRow)=>date(r.meeting)+'\n'+date(r.effective)},
 {id:'gf',label:'GF avant / après',header:'GF AV. / AP.',width:1.18,value:(r:QuarterlyRow)=>r.gfBefore+' / '+r.gfAfter},
 {id:'nr',label:'NR avant / après',header:'NR AV. / AP.',width:1.21,value:(r:QuarterlyRow)=>r.nrBefore+' / '+r.nrAfter},
 {id:'nrSteps',label:'NR attribués (NR +)',header:'NR +',width:.56,value:(r:QuarterlyRow)=>r.nrSteps},
 {id:'source',label:'Source',header:'SOURCE',width:3.08,value:(r:QuarterlyRow)=>r.source}
];
export function getMovementColumns(selected:readonly OptionalMovementColumn[]=defaultMovementColumns,kind?:string){
 // Pour les admissions au stage et les titularisations, le GF est obligatoire
 // et la colonne NR+ n'est jamais pertinente, même si l'option globale est cochée.
 const stageOrTitularisation=kind==='admission'||kind==='titularisation';
 const visible=columns.filter((c,i)=>
  i<3||(c.id==='gf'&&stageOrTitularisation)||
  (c.id!=='nrSteps'||!stageOrTitularisation)&&selected.includes(c.id as OptionalMovementColumn)
 );
 const total=visible.reduce((n,c)=>n+c.width,0);
 const fullWidth=columns.reduce((n,c)=>n+c.width,0);
 return visible.map(c=>({...c,width:c.width*fullWidth/total}));
}
