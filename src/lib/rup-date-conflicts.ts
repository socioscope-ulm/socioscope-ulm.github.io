import {rupCareer,type RupData,type RupCorrection} from './rup.ts';
import type {AgentRecord} from './agents.ts';
export type RupDateConflict={
 agentId:string;nni:string;name:string;contract:string;spanDays:number;
 status:'review'|'manual';selectedDate:string|null;
 dates:{date:string;documents:{id:string;name:string;date:string;row:number|null;sheet:string;importedDate:string|null}[]}[];
};
/** Documentary differences are retained even when an administrative choice
 * already makes seniority calculable. Only the selected snapshot is listed.
 */
export function collectRupDateConflicts(rup:RupData,agents:AgentRecord[],corrections:Record<string,RupCorrection>={}):RupDateConflict[]{
 const sources=new Map(rup.sources.filter(s=>s.status!=='review'&&s.status!=='disabled').map(s=>[s.id,s]));
 const byNNI=new Map<string,typeof rup.records>();
 for(const r of rup.records)if(sources.has(r.source)){const rows=byNNI.get(r.nni)||[];rows.push(r);byNNI.set(r.nni,rows);}
 const seen=new Set<string>();const result:RupDateConflict[]=[];
 for(const agent of agents){
  if(!agent.nni||seen.has(agent.nni))continue;seen.add(agent.nni);
  const history=byNNI.get(agent.nni)||[],career=rupCareer(history,agent.nni,agent.contract);
  if(!career||career.dates.length<2)continue;
  const correction=corrections[agent.nni];
  const selected=correction&&history.some(r=>r.source===correction.source&&(r.entreeIEG===correction.date||r.calendarDateAdjustment?.original.entreeIEG===correction.date)&&(correction.row===null?r.contrat.trim()===correction.contract:r.row===correction.row));
  const dates=career.dates.map(date=>{
   const deduplicated=new Map<string,RupDateConflict['dates'][number]['documents'][number]>();
   for(const row of career.history.filter(r=>r.entreeIEG===date)){
    const source=sources.get(row.source)!;const item={id:source.id,name:source.name,date:source.date,row:Number.isInteger(row.row)?row.row!:null,sheet:row.sheet||'',importedDate:row.calendarDateAdjustment?.original.entreeIEG||null};
    deduplicated.set(JSON.stringify([item.id,item.row,item.sheet]),item);
   }
   return {date,documents:[...deduplicated.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'fr'))};
  });
  result.push({agentId:agent.agentId,nni:agent.nni,name:agent.name,contract:agent.contract||'',spanDays:Math.round((Date.parse(career.dates.at(-1)!)-Date.parse(career.dates[0]))/86400000),status:selected?'manual':'review',selectedDate:selected?correction.date:null,dates});
 }
 return result.sort((a,b)=>a.name.localeCompare(b.name,'fr')||a.nni.localeCompare(b.nni));
}
