import {hourlyRates} from './agent-hourly.ts';
import {m3eKey,m3eLabel} from './agent-m3e.ts';
import bonuses from '../../private-data/references/annual-bonuses-2025.json' with {type:'json'};
import grid from '../../private-data/references/salary-grid-2026.json' with {type:'json'};
import {careerSeniority,snapshot,normalName} from './agents.ts';
import type {AgentData,AgentRecord} from './agents.ts';
export const echelonThresholds=[{years:0,level:4},{years:6,level:5},{years:9.5,level:6},{years:13,level:7},{years:17,level:8},{years:21,level:9},{years:25,level:10},{years:30,level:11},{years:34,level:12}];
export function echelonFor(years:number){return Number.isFinite(years)&&years>=0?echelonThresholds.filter(t=>years>=t.years).at(-1)!.level:null;}
export function agencyResidence(agency?:string){
 const key=normalName(agency).replaceAll(' ','');
 if(['AMTC','AMTCENTRE','CENTRE'].includes(key))return {residence:'1.24',residenceProvisional:false};
 return {residence:'1.245',residenceProvisional:!['AMTE','AMTEST','EST','AMTSO','AMTSUDOUEST','SUDOUEST'].includes(key)};
}
export function agentPayroll(data:AgentData,sourceId:string,residence='agency',config?:{rates:Record<string,Record<string,number[]>>;bonuses:Record<string,number>;gridDate:string;bonusReferenceYear:number;gridId?:string;bonusId?:string}){
 const reference=data.sources.find(s=>s.id===sourceId);if(!reference)return null;
 const allRates=config?.rates||grid as Record<string,Record<string,number[]>>;if(residence!=='agency'&&!allRates[residence])return null;
 const histories=new Map<string,AgentRecord[]>();
 for(const r of data.records)if(!r.manualPresence){const rows=histories.get(r.agentId)||[];rows.push(r);histories.set(r.agentId,rows);}
 const teams=new Map<string,Set<string>>();for(const r of data.records)if(r.source===sourceId){const set=teams.get(r.agentId)||new Set<string>();set.add(r.team?.trim()||'Non renseignée');teams.set(r.agentId,set);}
 const rows=snapshot(data,sourceId).map(r=>{
  const career=careerSeniority(histories.get(r.agentId)||[],data.sources,reference.date,sourceId);
  const level=career?.years!=null?echelonFor(career.years):null;
  const residential=residence==='agency'?agencyResidence(r.agency):{residence,residenceProvisional:false};
  const rates=allRates[residential.residence];
  const salary=r.nr!==undefined&&level!==null?rates?.[String(r.nr)]?.[level-1]:undefined;
  const reason=!r.nni?'NNI non rapproché':r.conflicts.includes('nr')?'NR divergent':!rates?'Majoration résidentielle absente de la grille':!rates[String(r.nr)]?'NR absent de la grille':level===null?(career?.method||'Ancienneté non calculable'):salary==null?'Échelon absent de la grille':undefined;
  return {...residential,family:teams.get(r.agentId)?.size===1?[...teams.get(r.agentId)!][0]:'Rattachement divergent',m3e:m3eKey(r),gfLabel:r.gf===undefined?'GF non renseigné':'GF '+r.gf,agentId:r.agentId,nni:r.nni,name:r.name,nr:r.nr,gf:r.gf,college:r.college||'non renseigne',agency:r.agency||'Non renseignée',years:career?.years,level,method:career?.method,firstSeenEstimate:!!career?.estimated,manualPresence:!!r.manualPresence,annualBonusCents:r.gf!==undefined?(config?.bonuses||bonuses as Record<string,number>)[String(r.gf)]??null:null,monthlyCents:reason?null:salary??null,reason};
 });
 const included=rows.filter(r=>r.monthlyCents!==null);
 const annualBonusCents=included.reduce((sum,r)=>sum+(r.annualBonusCents??0),0);
 const bonusUnknown=included.filter(r=>r.annualBonusCents===null).length;
 const total=included.reduce((sum,r)=>sum+r.monthlyCents!,0);
 const groups=(key:'college'|'agency'|'family'|'m3e'|'gfLabel')=>[...new Set(rows.map(r=>r[key]))].map(label=>{const population=rows.filter(r=>r[key]===label);const covered=population.filter(r=>r.monthlyCents!==null);return {label:key==='m3e'?m3eLabel(label):label,hourly12:hourlyRates(population,12),hourly13:hourlyRates(population,13),agents:population.length,covered:covered.length,excluded:population.length-covered.length,annualBonusCents:covered.reduce((sum,r)=>sum+(r.annualBonusCents??0),0),bonusUnknown:covered.filter(r=>r.annualBonusCents===null).length,monthlyCents:covered.reduce((sum,r)=>sum+r.monthlyCents!,0)};});
 const order=['cadres','maitrise','execution','non renseigne'];
 return {hourly12:hourlyRates(rows,12),hourly13:hourlyRates(rows,13),gfs:groups('gfLabel'),m3eGroups:groups('m3e'),families:groups('family').sort((a,b)=>a.label.localeCompare(b.label,'fr')),source:sourceId,referenceDate:reference.date,gridDate:config?.gridDate||'2026-01-01',gridId:config?.gridId||'grid-2026',bonusId:config?.bonusId||'bonuses-2025',residence,total:rows.length,covered:included.length,excluded:rows.length-included.length,firstSeenEstimates:included.filter(r=>r.firstSeenEstimate).length,anchored:included.filter(r=>!r.firstSeenEstimate).length,manualPresence:included.filter(r=>r.manualPresence).length,annualBonusCents,bonusUnknown,bonusReferenceYear:config?.bonusReferenceYear||2025,bonusByGF:config?.bonuses||bonuses,annual12WithBonusesCents:total*12+annualBonusCents,annual13WithBonusesCents:total*13+annualBonusCents,monthlyCents:total,annual12Cents:total*12,annual13Cents:total*13,colleges:groups('college').sort((a,b)=>order.indexOf(a.label)-order.indexOf(b.label)),agencies:groups('agency').sort((a,b)=>a.label.localeCompare(b.label,'fr')),rows};
}
