import type {QuarterlyRow} from './csp-quarterly-report';
export type OptionalMovementColumn='motif'|'observations'|'gf'|'nr'|'nrSteps'|'source';
export const optionalMovementColumns=[
 {id:'motif',label:'Motif du mouvement'},
 {id:'observations',label:'Observations / commentaires'},
 {id:'gf',label:'GF avant / après'},
 {id:'nr',label:'NR avant / après'},
 {id:'nrSteps',label:'NR attribués (NR +)'},
 {id:'source',label:'Source'}
] as const;
// Les deux nouveaux champs restent facultatifs par défaut afin d'éviter
// une relecture coûteuse de PDF tant que l'administrateur ne les demande pas.
export const defaultMovementColumns:OptionalMovementColumn[]=optionalMovementColumns
 .filter(c=>c.id!=='motif'&&c.id!=='observations').map(c=>c.id);
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
const columns=[
 {id:'name',label:'Nom / prénom',header:'NOM PRÉNOM',width:2.36,value:(r:QuarterlyRow)=>r.name},
 {id:'agency',label:'Agence / poste',header:'AGENCE / POSTE',width:2.46,value:(r:QuarterlyRow)=>[r.agency,r.job].filter(x=>x&&x!=='—').join('\n')||'—'},
 {id:'motif',label:'Motif du mouvement',header:'MOTIF',width:2.22,value:(r:QuarterlyRow)=>r.movementReason||'—'},
 {id:'observations',label:'Observations / commentaires',header:'OBSERVATIONS',width:2.27,value:(r:QuarterlyRow)=>r.observations||'—'},
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
 const visible=columns.filter(c=>
  ['name','agency','dates'].includes(c.id)||(c.id==='gf'&&stageOrTitularisation)||
  (c.id!=='nrSteps'||!stageOrTitularisation)&&selected.includes(c.id as OptionalMovementColumn)
 );
 const total=visible.reduce((n,c)=>n+c.width,0);
 // Conserver la largeur originale de la page PPT (12,33 pouces),
 // quels que soient les choix de colonnes, y compris les champs longs.
 const fullWidth=12.33;
 return visible.map(c=>({...c,width:c.width*fullWidth/total}));
}
