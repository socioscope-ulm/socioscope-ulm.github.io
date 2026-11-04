import type {CspImport,CspEvent} from './csp.ts';
import {validDate} from './csp.ts';

export const manualNRReasons={
 'avancement_choix':'Avancement au choix',
 'avancement_echelon':'Avancement lié à une évolution de situation',
 'regularisation':'Régularisation d’un avancement antérieur',
 'document_indisponible':'Avancement confirmé administrativement, bordereau indisponible',
 'autre_avancement':'Autre motif d’avancement (préciser)'
} as const;
export type ManualNRReason=keyof typeof manualNRReasons;
export type ManualNRPayload={name:string;agentId:string;effective:string;gf:number;nrBefore:number;reason:ManualNRReason;comment:string;arrivalConfirmed?:boolean;arrivalAgency?:string;arrivalEffective?:string};
export type ManualNRRecord=ManualNRPayload&{id:string;created:string;actor:string};
export function validateManualNR(value:any):value is ManualNRPayload{
 return !!value&&typeof value.name==='string'&&value.name.trim().length>=3&&value.name.length<=179&&
 typeof value.agentId==='string'&&/^[A-Z0-9]{6}$/.test(value.agentId)&&validDate(value.effective)&&
 Number.isInteger(value.gf)&&value.gf>=1&&value.gf<=30&&Number.isInteger(value.nrBefore)&&
 value.nrBefore>=5&&value.nrBefore<=990&&value.nrBefore%5===0&&
 Object.hasOwn(manualNRReasons,value.reason)&&typeof value.comment==='string'&&
 value.comment.trim().length>=20&&value.comment.length<=500&&
 (value.arrivalConfirmed===undefined||typeof value.arrivalConfirmed==='boolean')&&
 (value.arrivalAgency===undefined||typeof value.arrivalAgency==='string'&&value.arrivalAgency.length<=180)&&
 (value.arrivalEffective===undefined||validDate(value.arrivalEffective))&&
 (!value.arrivalConfirmed||!!value.arrivalAgency?.trim()&&validDate(value.arrivalEffective)&&(value.arrivalEffective>=value.effective));
}
export function manualNRImport(row:ManualNRRecord):CspImport{
 const e:CspEvent={id:row.id,agentId:row.agentId,name:row.name,kind:'avancement',
  effective:row.effective,page:1,selected:true,approved:true,
  gfDelta:0,gfBefore:row.gf,gfAfter:row.gf,nrBefore:row.nrBefore,nrAfter:row.nrBefore+5,nrSteps:1,
  ...(row.arrivalConfirmed?{projectionFrom:row.arrivalEffective}:{}),
  note:'Saisie administrative manuelle · '+manualNRReasons[row.reason]+' · '+row.comment+
   ' · auteur : '+row.actor,approvedAt:row.created};
 const provisional:CspEvent|undefined=row.arrivalConfirmed?{
   id:row.id+'-arrival',agentId:row.agentId,name:row.name,kind:'mutation',
   effective:row.arrivalEffective!,page:1,selected:true,approved:true,newAgent:true,provisionalArrival:true,
   agency:row.arrivalAgency!.trim(),gfDelta:0,gfBefore:row.gf,gfAfter:row.gf,
   nrBefore:row.nrBefore,nrAfter:row.nrBefore,
   note:'Arrivée ULM provisoire déclarée administrativement · bordereau officiel à confirmer · '+row.comment,
   approvedAt:row.created
 }:undefined;
 const events=provisional?[e,provisional]:[e];
 return {id:'manual-nr-'+row.id,name:'Avancement manuel (sans bordereau CSP)',
  date:row.effective,created:row.created,status:'validated',documentType:'rd',events,evidenceEvents:events};
}
