import {careerSeniority} from './agents.ts';
import type {AgentData,AgentRecord} from './agents.ts';

// Group the enriched history once. This uses the same career calculation as
// an individual profile without fetching that profile once per exported row.
export function agentExportDetails(data:AgentData,rows:AgentRecord[],source:string){
 const date=data.sources.find(s=>s.id===source)?.date||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Date de photographie invalide : export annulé.');
 const selected=new Set(rows.map(r=>r.agentId));
 const histories=new Map<string,AgentRecord[]>();
 for(const row of data.records){
  if(!selected.has(row.agentId))continue;
  let history=histories.get(row.agentId);
  if(!history){history=[];histories.set(row.agentId,history);}
  history.push(row);
 }
 return rows.map(row=>{
  const career=careerSeniority(histories.get(row.agentId)||[],data.sources,date,source);
  return {published:typeof row.iegYears==='number'?row.iegYears:null,years:typeof career?.years==='number'&&Number.isFinite(career.years)?career.years:null,method:career?.method||'Non calculable',date};
 });
}
