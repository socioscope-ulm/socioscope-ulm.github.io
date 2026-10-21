import {m3eKey,m3eOptions,m3eMeans} from '../../../lib/agent-m3e';
import {agentFamilies} from '../../../lib/agent-families';
import {payrollReferences} from '../../../lib/payroll-store';
import {selectReference} from '../../../lib/payroll-reference';
import {agentPayroll} from '../../../lib/agent-payroll';
import {agentAuth,agentData,agentError} from '../../../lib/agents-store';
import {agentProgression} from '../../../lib/agent-progression';
import {snapshot,sourcePairs,normalName} from '../../../lib/agents';
export async function GET(request:Request){try{await agentAuth(request);const p=new URL(request.url).searchParams;const view=p.get('view')||'list';const {data,observedData,decisions}=await agentData(view!=='payroll');const sources=data.sources.sort((a,b)=>a.date.localeCompare(b.date)||Number(b.primary)-Number(a.primary));const source=p.get('source')||sources.filter(s=>(s.primary||s.status==='validated')&&s.status!=='review').at(-1)?.id||'';if(!sources.some(s=>s.id===source))return Response.json({error:'Source inconnue.'},{status:404});
const excluded=new Set<string>();for(const d of decisions){if(d.kind==='dismiss')excluded.add(d.agent+'|'+d.source);else if(d.kind==='restore')excluded.delete(d.agent+'|'+d.source);}
if(view==='meta')return Response.json({sources,issues:data.issues,updated:data.updated,agents:new Set(data.records.filter(r=>r.nni).map(r=>r.nni)).size,pending:data.records.filter(r=>!r.nni&&!excluded.has(r.agentId+'|'+r.source)).length,events:data.events.length},{headers:{'Cache-Control':'no-store'}});
if(view==='executives'){
 const executiveStates=new Map<string,any>();
 for(const d of decisions){
  if(d.kind==='executive'||d.kind==='executive_manual'||d.kind==='executive_update')executiveStates.set(d.agent,d);
  if(d.kind==='executive_remove')executiveStates.delete(d.agent);
 }
 const sourceDates=new Map(data.sources.map(s=>[s.id,s.date]));
 const historyByAgent=new Map<string,typeof data.records>();
 for(const r of data.records)if(executiveStates.has(r.agentId)){
  const history=historyByAgent.get(r.agentId)||[];history.push(r);historyByAgent.set(r.agentId,history);
 }
 const records=[...executiveStates.values()].map(d=>{
  let detail:any={};try{detail=JSON.parse(d.note||'{}');}catch{}
  const historical=[...(historyByAgent.get(d.agent)||[])].sort((a,b)=>(sourceDates.get(a.source)||'').localeCompare(sourceDates.get(b.source)||''));
  const last=historical.at(-1);
  const knownUnitDate=historical.map(r=>r.entryUnit).filter((v):v is string=>!!v&&/^\d{4}-\d{2}-\d{2}$/.test(v)).sort()[0]||'';
  const firstAgency=historical.find(r=>r.agency?.trim())?.agency?.trim()||'';
  const manual=d.agent.startsWith('exec-manual-');
  const origin=detail.origin||(!manual?firstAgency:'');
  const startDate=detail.startDate||(!manual?knownUnitDate:'');
  return {agentId:d.agent,source:d.source,name:detail.name||last?.name||'Non renseigné',origin,startDate,originSource:detail.origin?'manual':firstAgency&&!manual?'agency':'',startDateSource:detail.startDate?'manual':knownUnitDate&&!manual?'entryUnit':'',exitDate:detail.exitDate||'',note:detail.note||'',gf:last?.gf||null,manual,created:d.created};
 }).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 return Response.json({records,total:records.length},{headers:{'Cache-Control':'no-store'}});
}
if(view==='payroll'){const refs=await payrollReferences();const g=selectReference(refs,'grid',p.get('grid')||undefined),b=selectReference(refs,'bonuses',p.get('bonus')||undefined);if(!g||!b)return Response.json({error:'Référence inconnue ou non validée.'},{status:400});const requested=p.get('residence')||'agency';const residence=!p.get('grid')&&requested==='1.245'&&!g.payload.rates[requested]?Object.keys(g.payload.rates)[0]:requested;const result=agentPayroll(data,source,residence,{rates:g.payload.rates,bonuses:b.payload.bonuses,gridDate:g.date,bonusReferenceYear:Number(b.date.slice(0,4)),gridId:g.id,bonusId:b.id});if(result&&p.get('agent')){const row=result.rows.find(r=>r.agentId===p.get('agent'));return Response.json({row:row||null,referenceDate:result.referenceDate,gridDate:result.gridDate,gridId:result.gridId,bonusId:result.bonusId,bonusReferenceYear:result.bonusReferenceYear,residence:result.residence},{headers:{'Cache-Control':'no-store'}});}return result?Response.json({...result,references:refs.filter(r=>r.status==='validated').map(({payload,...r})=>({...r,residences:r.kind==='grid'?Object.keys(payload.rates):[]}))},{headers:{'Cache-Control':'no-store'}}):Response.json({error:'Majoration résidentielle invalide.'},{status:400});}
if(view==='families')return Response.json(agentFamilies(data,source,p.get('agency')||'',p.get('m3e')||''),{headers:{'Cache-Control':'no-store'}});
if(view==='progression')return Response.json(agentProgression(data,source),{headers:{'Cache-Control':'no-store'}});
if(view==='movements'){
 const pairs=sourcePairs(observedData,source,p.get('previous')||undefined);
 const executives=new Set<string>();
 for(const d of decisions){
  if(['executive','executive_manual','executive_update'].includes(d.kind))executives.add(d.agent);
  if(d.kind==='executive_remove')executives.delete(d.agent);
 }
 return Response.json({...pairs,executivesTotal:executives.size,decisions:decisions.filter(d=>d.source===source&&['departure','absence','return','executive','executive_remove'].includes(d.kind))},{headers:{'Cache-Control':'no-store'}});
}
if(view==='pending'||view==='identity'){const q=normalName(p.get('q'));const dismissed=p.get('dismissed')==='1';const pending=data.records.filter(r=>!r.nni&&excluded.has(r.agentId+'|'+r.source)===dismissed&&(!q||normalName(r.name).includes(q)));const offset=Math.max(0,Number(p.get('offset'))||0);const names=new Map(data.records.filter(r=>r.nni).map(r=>[r.nni,r.name]));return Response.json({total:pending.length,records:pending.slice(offset,offset+60).map(r=>({...r,candidates:r.candidateNNIs?.map(nni=>({nni,name:names.get(nni)}))||[]}))},{headers:{'Cache-Control':'no-store'}});}
const current=snapshot(data,source);let all=current;if(p.get('archive')==='1'){const dates=new Map(sources.filter(s=>s.primary||s.status==='validated').map(s=>[s.id,s.date]));const seen=new Set(current.map(r=>r.agentId));const latest=new Map<string,any>();for(const r of data.records){const date=dates.get(r.source);if(!date||date>(sources.find(s=>s.id===source)?.date||'')||seen.has(r.agentId))continue;const prev=latest.get(r.agentId);if(!prev||date>(dates.get(prev.source)||''))latest.set(r.agentId,{...r,situations:1,conflicts:[]});}all=[...current,...latest.values()];}const agencies=[...new Set(all.map(r=>r.agency).filter(Boolean))].sort();const q=normalName(p.get('q'));const selected=all.filter(r=>(!p.get('m3e')||m3eKey(r)===p.get('m3e'))&&(!q||normalName(r.name+' '+r.nni).includes(q))&&(!p.get('agency')||r.agency===p.get('agency'))&&(!p.get('college')||r.college===p.get('college'))&&(!p.get('gf')||r.gf===Number(p.get('gf')))&&(!p.get('nr')||r.nr===Number(p.get('nr')))&&(!p.get('years')||r.nrYears!==undefined&&r.nrYears>=Number(p.get('years'))));const field=p.get('sort')||'name';selected.sort((a:any,b:any)=>['nr','gf','nrYears','gfYears'].includes(field)?(b[field]??-Infinity)-(a[field]??-Infinity)||a.name.localeCompare(b.name,'fr'):a.name.localeCompare(b.name,'fr'));const offset=Math.max(0,Number(p.get('offset'))||0);const identified=selected.filter(r=>r.source===source&&r.nni);const distribution=(key:string)=>identified.reduce((out:any,r:any)=>{if(r[key]!==undefined)out[r[key]]=(out[r[key]]||0)+1;return out;},{});const average=(key:string)=>{const values=identified.map((r:any)=>r[key]).filter((v):v is number=>typeof v==='number');return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};const cohort=new Set(identified.map(r=>r.agentId));const summaries=identified.reduce((acc:any,r)=>{const c=r.college||'non renseigné';acc[c]=(acc[c]||0)+1;return acc;},{});return Response.json({source:sources.find(s=>s.id===source),total:selected.length,records:selected.slice(offset,offset+100),agencies,plages:m3eOptions(current),gfs:[...new Set(all.map(r=>r.gf).filter(v=>v!==undefined))].sort((a,b)=>a!-b!),stats:{m3eMeans:m3eMeans(identified),agents:identified.length,manualPresence:identified.filter(r=>r.manualPresence).length,pending:selected.filter(r=>r.source===source&&!r.nni).length,nrDistribution:distribution('nr'),gfDistribution:distribution('gf'),nrMean:average('nr'),gfMean:average('gf'),fourYears:identified.filter(r=>r.nrYears!==undefined&&r.nrYears>=4).length,conflicts:all.filter(r=>r.conflicts.length).length,colleges:summaries,...(view==='analysis'?{progression:agentProgression({...data,records:data.records.filter(r=>cohort.has(r.agentId))},source)}:{})},decisions:view==='analysis'?[]:decisions.filter(d=>d.source===source)},{headers:{'Cache-Control':'no-store'}});
}catch(e){return agentError(e);}}
