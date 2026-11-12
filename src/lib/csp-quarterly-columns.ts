import type {QuarterlyRow} from './csp-quarterly-report';
import {annotationForCspKind} from './csp-annotation-rules.ts';
import {cleanCspPrintedCell,formatCspNominationAptitude} from './csp-quarterly-document-text.ts';
// NR + is documentary output, not a user-controlled option. It is always
// present for applicable movements and remains absent for stage/titularisation.
export type OptionalMovementColumn='gf'|'nr'|'source';
export const optionalMovementColumns=[
 {id:'gf',label:'GF avant / après'},
 {id:'nr',label:'NR avant / après'},
 {id:'source',label:'Source'}
] as const;
export const defaultMovementColumns:OptionalMovementColumn[]=[];
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
const stageGf=(r:QuarterlyRow)=>{
 const before=String(r.gfBefore||'').trim(),after=String(r.gfAfter||'').trim();
 if(before===after)return before||'—';
 if(!before||before==='—')return after||'—';
 if(!after||after==='—')return before;
 // Do not conceal a genuinely contradictory GF in documentary data.
 return before+' → '+after;
};
const columns=[
 {id:'name',label:'Nom / prénom',header:'NOM PRÉNOM',width:2.36,value:(r:QuarterlyRow)=>r.name},
 {id:'agency',label:'Agence / poste',header:'AGENCE / POSTE',width:2.46,value:(r:QuarterlyRow)=>[r.agency,r.job].filter(x=>x&&x!=='—').join('\n')||'—'},
 {id:'motif',label:'Motif du mouvement',header:'MOTIF',width:2.22,value:(r:QuarterlyRow)=>cleanCspPrintedCell(r.movementReason)},
 {id:'observations',label:'Observations / commentaires',header:'OBSERVATIONS',width:2.27,value:(r:QuarterlyRow)=>cleanCspPrintedCell(r.observations)},
 {id:'aptitude',label:'Aptitude (RD)',header:'APTITUDE',width:2.76,value:(r:QuarterlyRow)=>formatCspNominationAptitude(r.aptitude,r.effective)},
 {id:'dates',label:'CSP / effet',header:'CSP / EFFET',width:1.48,value:(r:QuarterlyRow)=>date(r.meeting)+'\n'+date(r.effective)},
 {id:'gf',label:'GF avant / après',header:'GF AV. / AP.',width:1.18,value:(r:QuarterlyRow)=>r.gfBefore+' / '+r.gfAfter},
 {id:'nr',label:'NR avant / après',header:'NR AV. / AP.',width:1.21,value:(r:QuarterlyRow)=>r.nrBefore+' / '+r.nrAfter},
 {id:'nrSteps',label:'NR attribués (NR +)',header:'NR +',width:.56,value:(r:QuarterlyRow)=>r.nrSteps},
 {id:'source',label:'Source',header:'SOURCE',width:3.08,value:(r:QuarterlyRow)=>r.source}
];
/** Fixed table geometry for a given set of user choices.
 * Every section shares the same positions for the date and optional
 * GF/NR/source slots, even when two different sections share a PPT slide.
 * NR+ reserves a slot for movements that support it; for stage and
 * titularisation that slot is absorbed by the required single GF/NR
 * columns, so no empty NR+ column is ever displayed.
 */
export function getMovementColumns(selected:readonly OptionalMovementColumn[]=defaultMovementColumns,kind?:string){
 const stageOrTitularisation=kind==='admission'||kind==='titularisation';
 const showGF=selected.includes('gf');
 const showNR=selected.includes('nr');
 const showSource=selected.includes('source');
 const annotation=annotationForCspKind(kind||'');
 const annotationId=annotation==='movementReason'?'motif':annotation==='observations'?'observations':
  kind==='nomination'?'aptitude':undefined;

 const slots={name:2.36,agency:2.46,annotation:2.76,dates:1.48,
  gf:showGF?1.18:0,nr:showNR?1.21:0,nrSteps:.74,source:showSource?3.08:0};
 const referenceTotal=Object.values(slots).reduce((sum,w)=>sum+w,0);
 const scale=12.33/referenceTotal;
 const visible=columns.filter(c=>
  ['name','agency','dates'].includes(c.id)||c.id===annotationId||
  (c.id==='gf'&&(showGF||stageOrTitularisation))||
  (c.id==='nr'&&showNR)||
  (c.id==='nrSteps'&&!stageOrTitularisation)||
  (c.id==='source'&&showSource)
 );
 return visible.map(c=>{
  let width:number;
  switch(c.id){
   case 'name':width=slots.name;break;
   case 'agency':width=slots.agency+(annotationId?0:slots.annotation);break;
   case 'motif':
   case 'observations':
   case 'aptitude':width=slots.annotation;break;
   case 'dates':width=slots.dates;break;
   case 'gf':
    // When optional GF is off, the compulsory GF takes the position
    // occupied by NR+ in other sections. If NR is also selected, it
    // instead uses the common NR slot and NR takes the NR+ slot.
    width=stageOrTitularisation
     ?(showGF?slots.gf+(showNR?0:slots.nrSteps):showNR?slots.nr:slots.nrSteps)
     :slots.gf;
    break;
   case 'nr':
    width=stageOrTitularisation
     ?(showGF?slots.nr+slots.nrSteps:slots.nrSteps)
     :slots.nr;
    break;
   case 'nrSteps':width=slots.nrSteps;break;
   case 'source':width=slots.source;break;
   default:width=0;
  }
  return {...c,width:width*scale,
   ...(stageOrTitularisation&&c.id==='gf'
    ?{label:'GF',header:'GF',value:stageGf}:{})};
 });
}
