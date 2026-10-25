import {hourlyRates} from './agent-hourly.ts';
import {m3eKey,m3eLabel} from './agent-m3e.ts';
import {careerSeniority,snapshot,normalName,matchesAgentCohort,normalizeAgentSex} from './agents.ts';
import type {AgentData,AgentRecord} from './agents.ts';
// Moyenne annuelle PVPA 2025 pour les seuls cadres GF12 à GF19 (euros en centimes).
// Taux permanents des primes mensuelles cadres, appliquées au brut de base de la grille.
export const ENGAGEMENT_RATE=0.035;
export const AUTONOMIE_RATE=0.04;
export function cadreMonthlyBonuses(monthlyCents:number|null,college?:string,engagementRate=ENGAGEMENT_RATE,autonomieRate=AUTONOMIE_RATE){
 if(monthlyCents===null||!Number.isFinite(monthlyCents)||college!=='cadres')return {engagementMonthlyCents:0,autonomieMonthlyCents:0,engagementAnnualCents:0,autonomieAnnualCents:0};
 const engagementMonthlyCents=Math.round(monthlyCents*engagementRate);
 const autonomieMonthlyCents=Math.round(monthlyCents*autonomieRate);
 return {engagementMonthlyCents,autonomieMonthlyCents,engagementAnnualCents:engagementMonthlyCents*12,autonomieAnnualCents:autonomieMonthlyCents*12};
}
export const PVPA_2025_BY_GF_CENTS:Record<string,number>={'12':34700,'13':42300,'14':53600,'15':66200,'16':88200,'17':95200,'18':113900,'19':107900};
export const echelonThresholds=[{years:0,level:4},{years:6,level:5},{years:9.5,level:6},{years:13,level:7},{years:17,level:8},{years:21,level:9},{years:25,level:10},{years:30,level:11},{years:34,level:12}];
export function echelonFor(years:number){return Number.isFinite(years)&&years>=0?echelonThresholds.filter(t=>years>=t.years).at(-1)!.level:null;}
export function agencyResidence(agency?:string){
 const key=normalName(agency).replaceAll(' ','');
 if(['AMTC','AMTCENTRE','CENTRE'].includes(key))return {residence:'1.24',residenceProvisional:false};
 return {residence:'1.245',residenceProvisional:!['AMTE','AMTEST','EST','AMTSO','AMTSUDOUEST','SUDOUEST'].includes(key)};
}
export function agentPayroll(data:AgentData,sourceId:string,residence='agency',config?:{rates:Record<string,Record<string,number[]>>;bonuses:Record<string,number>;gridDate:string;bonusReferenceYear:number;gridId?:string;bonusId?:string;engagementRate?:number;autonomieRate?:number},filters:{college?:string;sex?:string}={}){
 const reference=data.sources.find(s=>s.id===sourceId);if(!reference)return null;
 if(!config)throw Error('Références de rémunération indisponibles.');
 const allRates=config.rates;if(residence!=='agency'&&!allRates[residence])return null;
 const histories=new Map<string,AgentRecord[]>();
 for(const r of data.records)if(!r.manualPresence){const rows=histories.get(r.agentId)||[];rows.push(r);histories.set(r.agentId,rows);}
 const teams=new Map<string,Set<string>>();for(const r of data.records)if(r.source===sourceId){const set=teams.get(r.agentId)||new Set<string>();set.add(r.team?.trim()||'Non renseignée');teams.set(r.agentId,set);}
 // Filter the snapshot *before* salary calculation. Historical career
 // evidence remains complete so seniority/echelon are unchanged by filters.
 const fullSnapshot=snapshot(data,sourceId);
 const college=filters.college||'',sex=filters.sex||'';
 const matchingCollege=fullSnapshot.filter(r=>matchesAgentCohort(r,college,''));
 const sexKnown=matchingCollege.filter(r=>r.nni&&normalizeAgentSex(r.sex)!==null).length;
 const sexTotal=matchingCollege.filter(r=>r.nni).length;
 const selectedSnapshot=fullSnapshot.filter(r=>matchesAgentCohort(r,college,sex));
 const rows=selectedSnapshot.map(r=>{
  const career=careerSeniority(histories.get(r.agentId)||[],data.sources,reference.date,sourceId);
  const level=career?.years!=null?echelonFor(career.years):null;
  const residential=residence==='agency'?agencyResidence(r.agency):{residence,residenceProvisional:false};
  const rates=allRates[residential.residence];
  const salary=r.nr!==undefined&&level!==null?rates?.[String(r.nr)]?.[level-1]:undefined;
  const reason=!r.nni?'NNI non rapproché':r.conflicts.includes('nr')?'NR divergent':!rates?'Majoration résidentielle absente de la grille':!rates[String(r.nr)]?'NR absent de la grille':level===null?(career?.method||'Ancienneté non calculable'):salary==null?'Échelon absent de la grille':undefined;
  const cadrePrimes=cadreMonthlyBonuses(reason?null:salary??null,r.gf!==undefined&&r.gf>=12&&r.gf<=19?r.college:'',config.engagementRate??ENGAGEMENT_RATE,config.autonomieRate??AUTONOMIE_RATE);
  return {...cadrePrimes,...residential,family:teams.get(r.agentId)?.size===1?[...teams.get(r.agentId)!][0]:'Rattachement divergent',m3e:m3eKey(r),gfLabel:r.gf===undefined?'GF non renseigné':'GF '+r.gf,agentId:r.agentId,nni:r.nni,name:r.name,sex:normalizeAgentSex(r.sex),nr:r.nr,...(r.nrProvisional?{nrProvisional:true}:{}),gf:r.gf,college:r.college||'non renseigne',agency:r.agency||'Non renseignée',years:career?.years,level,method:career?.method,firstSeenEstimate:!!career?.estimated,manualPresence:!!r.manualPresence,rpcRpemBonusCents:r.gf!==undefined?config.bonuses[String(r.gf)]??null:null,pvpaBonusCents:r.gf!==undefined&&r.gf>=12&&r.gf<=19?(PVPA_2025_BY_GF_CENTS[String(r.gf)]??null):0,annualBonusCents:r.gf!==undefined&&config.bonuses[String(r.gf)]!==undefined?config.bonuses[String(r.gf)]+(r.gf>=12&&r.gf<=19?(PVPA_2025_BY_GF_CENTS[String(r.gf)]??0):0)+cadrePrimes.engagementAnnualCents+cadrePrimes.autonomieAnnualCents:null,monthlyCents:reason?null:salary??null,reason};
 });
 const included=rows.filter(r=>r.monthlyCents!==null);
 const annualBonusCents=included.reduce((sum,r)=>sum+(r.annualBonusCents??0),0);
 const rpcRpemBonusCents=included.reduce((sum,r)=>sum+(r.rpcRpemBonusCents??0),0);
 const pvpaBonusCents=included.reduce((sum,r)=>sum+(r.pvpaBonusCents??0),0);
 const engagementAnnualCents=included.reduce((sum,r)=>sum+r.engagementAnnualCents,0);
 const autonomieAnnualCents=included.reduce((sum,r)=>sum+r.autonomieAnnualCents,0);
 const bonusUnknown=included.filter(r=>r.annualBonusCents===null).length;
 const total=included.reduce((sum,r)=>sum+r.monthlyCents!,0);
 const groups=(key:'college'|'agency'|'family'|'m3e'|'gfLabel')=>[...new Set(rows.map(r=>r[key]))].map(label=>{const population=rows.filter(r=>r[key]===label);const covered=population.filter(r=>r.monthlyCents!==null);return {label:key==='m3e'?m3eLabel(label):label,hourly12:hourlyRates(population,12),hourly13:hourlyRates(population,13),agents:population.length,covered:covered.length,excluded:population.length-covered.length,rpcRpemBonusCents:covered.reduce((sum,r)=>sum+(r.rpcRpemBonusCents??0),0),pvpaBonusCents:covered.reduce((sum,r)=>sum+(r.pvpaBonusCents??0),0),engagementAnnualCents:covered.reduce((sum,r)=>sum+r.engagementAnnualCents,0),autonomieAnnualCents:covered.reduce((sum,r)=>sum+r.autonomieAnnualCents,0),annualBonusCents:covered.reduce((sum,r)=>sum+(r.annualBonusCents??0),0),bonusUnknown:covered.filter(r=>r.annualBonusCents===null).length,monthlyCents:covered.reduce((sum,r)=>sum+r.monthlyCents!,0)};});
 const order=['cadres','maitrise','execution','non renseigne'];
 return {hourly12:hourlyRates(rows,12),hourly13:hourlyRates(rows,13),gfs:groups('gfLabel'),m3eGroups:groups('m3e'),families:groups('family').sort((a,b)=>a.label.localeCompare(b.label,'fr')),source:sourceId,referenceDate:reference.date,gridDate:config?.gridDate||'2026-01-01',gridId:config?.gridId||'grid-2026',bonusId:config?.bonusId||'bonuses-2025',residence,filterCollege:college||'ensemble',filterSex:sex||'ensemble',sexKnown,sexTotal,total:rows.length,covered:included.length,excluded:rows.length-included.length,firstSeenEstimates:included.filter(r=>r.firstSeenEstimate).length,anchored:included.filter(r=>!r.firstSeenEstimate).length,manualPresence:included.filter(r=>r.manualPresence).length,annualBonusCents,rpcRpemBonusCents,pvpaBonusCents,engagementAnnualCents,autonomieAnnualCents,bonusUnknown,bonusReferenceYear:config?.bonusReferenceYear||2025,bonusByGF:config.bonuses,annual12WithBonusesCents:total*12+annualBonusCents,annual13WithBonusesCents:total*13+annualBonusCents,monthlyCents:total,annual12Cents:total*12,annual13Cents:total*13,colleges:groups('college').sort((a,b)=>order.indexOf(a.label)-order.indexOf(b.label)),agencies:groups('agency').sort((a,b)=>a.label.localeCompare(b.label,'fr')),rows};
}

