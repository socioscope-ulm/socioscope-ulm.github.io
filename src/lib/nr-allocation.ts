import {isNRWithoutAgency,type NRReportRow} from './csp-nr-report';

export type NRAllocationScope='ulm'|'outside_ulm'|'to_clarify';
export type NRScopeOverride={
 rowId:string;agentId:string;scope:NRAllocationScope;
 agency?:string;relatedAgency?:string;reason:string;updatedAt?:string;updatedBy?:string;
};
export type AccountedNRRow=NRReportRow&{
 allocationScope:NRAllocationScope;
 accountingAgency:string;
 relatedAgency:string;
 allocationReason:string;
 allocationConfirmed:boolean;
};
export type NRAccountingSummary={
 rows:AccountedNRRow[];totalUlm:number;totalOutside:number;totalToClarify:number;
 totalRecorded:number;cspUlm:number;manualUlm:number;
};
const noAgency=(value:string)=>isNRWithoutAgency({agency:value,nr:1});
/** Comptabilité indépendante de l'historique : aucune mutation des mouvements CSP. */
export function applyNRScopes<T extends {rows:NRReportRow[];total:number}>(report:T,overrides:NRScopeOverride[]):T&NRAccountingSummary{
 const byId=new Map(overrides.map(o=>[o.rowId,o]));
 const rows:AccountedNRRow[]=report.rows.map(r=>{
  const override=r.nr!==null&&r.nr>0?byId.get(r.id):undefined;
  const valid=override?.agentId===r.agentId;
  const scope:NRAllocationScope=valid?override!.scope:(noAgency(r.agency)?'to_clarify':'ulm');
  const agency=scope==='ulm'?(valid&&override!.scope==='ulm'&&override!.agency?.trim()||r.agency):'';
  const accountingAgency=noAgency(agency)?'':agency;
  return {...r,allocationScope:scope,accountingAgency,relatedAgency:valid?String(override?.relatedAgency||'').trim():'',
   allocationReason:valid?String(override?.reason||''):'',allocationConfirmed:!!valid};
 });
 const sum=(scope:NRAllocationScope,source?:NRReportRow['source'])=>rows.filter(r=>r.allocationScope===scope&&r.nr!==null&&(!source||r.source===source)).reduce((v,r)=>v+r.nr!,0);
 return {...report,rows,totalUlm:sum('ulm'),totalOutside:sum('outside_ulm'),totalToClarify:sum('to_clarify'),
   totalRecorded:report.total,cspUlm:sum('ulm','csp'),manualUlm:sum('ulm','manual')};
}
