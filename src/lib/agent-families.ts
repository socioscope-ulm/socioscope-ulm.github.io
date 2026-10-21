import {m3eKey,m3eOptions,m3eMeans} from './agent-m3e.ts';
import {snapshot, normalName, careerSeniority} from './agents.ts';
import type {AgentData, AgentRecord} from './agents.ts';
import {agentProgression} from './agent-progression.ts';

export const families = [
  {id:'tournantes', label:'Machines tournantes', team:'SERVICE MACHINES TOURNANTES'},
  {id:'statiques', label:'Machines statiques', team:'SERVICE MACHINES STATIQUES'},
  {id:'robinetterie', label:'Robinetterie', team:'SERVICE ROBINETTERIE'},
  {id:'transport', label:'Transport', team:'SERVICE TRANSPORT'},
  {id:'stockage', label:'Stockage', team:'SERVICE STOCKAGE'},
  {id:'pole-ingenierie', label:'Pôle ingénierie', team:'POLE INGENIERIE'},
  {id:'service-ingenierie', label:'Service ingénierie', team:'SERVICE INGENIERIE'},
  {id:'rh', label:'Mission RH', team:'MISSION RH'},
  {id:'ressources', label:'Service ressources', team:'SERVICE RESSOURCES'},
  {id:'direction', label:'Direction', team:'DIRECTION'},
  {id:'metiers', label:'Métiers', team:'METIERS'},
  {id:'performance', label:'Mission performance', team:'MISSION PERFORMANCE'},
  {id:'si', label:'Mission SI', team:'MISSION SI'},
  {id:'pei', label:'Service PEI', team:'SERVICE PEI'},
  {id:'coordination', label:'Mission coordination communication pilotage', team:'MISSION COORDO COM PILOTAGE'},
  {id:'developpement', label:'Développement et projets', team:'DEVELOPPEMENT ET PROJETS'},
  {id:'risques', label:'Mission risques industriels', team:'MISSION RISQUES INDUSTRIELS'},
  {id:'attente', label:'Agents en attente d’affectation', team:'AGENTS ATTENTE AFFECTATION'},
] as const;
const mean = (values:number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
const finite = (v:unknown):v is number => typeof v==='number' && Number.isFinite(v);
export function agentFamilies(data:AgentData, sourceId:string, agency='', plage='') {
  const reference=data.sources.find(s=>s.id===sourceId);
  if(!reference)return null;
  // Discover every current source label, including new validated imports.
  // Labels are normalized only for matching, never inferred from a job or agency.
  const currentTeams=new Map<string,string>();
  for(const r of data.records)if(r.source===sourceId&&normalName(r.team))currentTeams.set(normalName(r.team),r.team!.trim());
  const definitions:{id:string;label:string;team:string}[]=[...families.filter(f=>currentTeams.has(f.team))];
  for(const [team,label] of [...currentTeams].sort(([a],[b])=>a.localeCompare(b,'fr')))if(!definitions.some(f=>f.team===team))definitions.push({id:'service:'+team,label,team});
  if(data.records.some(r=>r.source===sourceId&&!normalName(r.team)))definitions.push({id:'non-renseigne',label:'Non renseigné',team:''});
  const teamIds=new Map(definitions.map(f=>[f.team,f.id]));
  const rowsFor=(id:string)=>{
    const teams=new Map<string,Set<string>>();
    for(const r of data.records)if(r.source===id){const set=teams.get(r.agentId)||new Set<string>();set.add(normalName(r.team));teams.set(r.agentId,set);}
    return snapshot(data,id).map(r=>({...r, family:teams.get(r.agentId)?.size===1 ? teamIds.get([...teams.get(r.agentId)!][0]) : 'rattachement-divergent'}));
  };
  const all=rowsFor(sourceId);
  if(all.some(r=>r.family==='rattachement-divergent'))definitions.push({id:'rattachement-divergent',label:'Rattachement divergent · à vérifier',team:'__CONFLICT__'});
  const selected=all.filter(r=>(!agency||r.agency===agency)&&(!plage||m3eKey(r)===plage));
  const histories=new Map<string,AgentRecord[]>();
  for(const r of data.records){const list=histories.get(r.agentId)||[];list.push(r);histories.set(r.agentId,list);}
  const summaries=definitions.map(f=>{
    const members=selected.filter(r=>r.family===f.id&&r.nni);
    const average=(key:'gf'|'nr'|'age')=>{const values=members.map(r=>r[key]).filter(finite);return {mean:mean(values),count:values.length};};
    const seniorities=members.map(r=>careerSeniority(histories.get(r.agentId)||[],data.sources,reference.date)).filter(s=>s&&finite(s.years));
    const ids=new Set(members.map(r=>r.agentId));
    const progression=members.length ? agentProgression({...data,records:data.records.filter(r=>ids.has(r.agentId)),events:[]},sourceId) : null;
    const colleges=['cadres','maitrise','execution'].map(id=>({id,label:{cadres:'Cadres',maitrise:'Maîtrise',execution:'Exécution'}[id],count:members.filter(r=>finite(r.gf)?(r.gf>=12?'cadres':r.gf>=7?'maitrise':'execution')===id:r.college===id).length}));
    return {...f,available:all.some(r=>r.family===f.id),agents:members.length,pending:selected.filter(r=>r.family===f.id&&!r.nni).length,manual:members.filter(r=>r.manualPresence).length,gf:average('gf'),nr:average('nr'),age:average('age'),seniority:{mean:mean(seniorities.map(s=>s!.years!)),count:seniorities.length,estimated:seniorities.filter(s=>s!.estimated).length},colleges,progression};
  });
  // An absent service label is unavailable, never an inferred zero.
  const timeline=data.sources.filter(s=>(s.primary||s.status==='validated')&&s.status!=='review'&&s.date<=reference.date).sort((a,b)=>a.date.localeCompare(b.date)).flatMap(s=>{
    const rows=rowsFor(s.id);
    if(!definitions.some(f=>rows.some(r=>r.family===f.id)))return [];
    const scoped=rows.filter(r=>r.nni&&(!agency||r.agency===agency)&&(!plage||m3eKey(r)===plage));
    return [{date:s.date,source:s.id,label:s.label,...Object.fromEntries(definitions.map(f=>[f.id,rows.some(r=>r.family===f.id)&&(!plage||rows.some(r=>m3eKey(r)===plage))?scoped.filter(r=>r.family===f.id).length:null]))}];
  });
  return {reference,summaries,timeline,agency,plage,plages:m3eOptions(all),m3eMeans:m3eMeans(selected),agencies:[...new Set(all.map(r=>r.agency).filter((v):v is string=>!!v))].sort(),total:selected.length,pending:selected.filter(r=>!r.nni).length,classified:selected.filter(r=>r.family&&r.nni).length,outside:selected.filter(r=>!r.family).length};
}
