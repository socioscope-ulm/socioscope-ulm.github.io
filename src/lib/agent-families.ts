import {m3eKey,m3eOptions,m3eMeans} from './agent-m3e.ts';
import {snapshot, normalName, careerSeniority, matchesAgentCohort, normalizeAgentSex} from './agents.ts';
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
export function agentFamilies(data:AgentData, sourceId:string, agency='', plage='', college='', sex='') {
  const reference=data.sources.find(s=>s.id===sourceId);
  if(!reference)return null;
  // Discover every current source label, including new validated imports.
  // Labels are normalized only for matching, never inferred from a job or agency.
  const bySource=new Map<string,AgentRecord[]>();
  for(const r of data.records){const list=bySource.get(r.source)||[];list.push(r);bySource.set(r.source,list);}
  // Build each snapshot at most once. Previously each historical source
  // repeatedly scanned ALL records, then rebuilt the same snapshot again
  // for the historical GF/NR progression.
  const snapshotCache=new Map<string,ReturnType<typeof snapshot>>();
  const snapshotFor=(id:string)=>{
    let rows=snapshotCache.get(id);
    if(!rows){rows=snapshot({...data,records:bySource.get(id)||[]},id);snapshotCache.set(id,rows);}
    return rows;
  };
  const currentTeams=new Map<string,string>();
  for(const r of bySource.get(sourceId)||[])if(normalName(r.team))currentTeams.set(normalName(r.team),r.team!.trim());
  const definitions:{id:string;label:string;team:string}[]=[...families.filter(f=>currentTeams.has(f.team))];
  for(const [team,label] of [...currentTeams].sort(([a],[b])=>a.localeCompare(b,'fr')))if(!definitions.some(f=>f.team===team))definitions.push({id:'service:'+team,label,team});
  if((bySource.get(sourceId)||[]).some(r=>!normalName(r.team)))definitions.push({id:'non-renseigne',label:'Non renseigné',team:''});
  const teamIds=new Map(definitions.map(f=>[f.team,f.id]));
  const familyCache=new Map<string,(AgentRecord&{family:string|undefined})[]>();
  const rowsFor=(id:string)=>{
    const cached=familyCache.get(id);if(cached)return cached;
    const teams=new Map<string,Set<string>>();
    for(const r of bySource.get(id)||[]){let set=teams.get(r.agentId);if(!set){set=new Set();teams.set(r.agentId,set);}set.add(normalName(r.team));}
    const rows=snapshotFor(id).map(r=>({...r,family:teams.get(r.agentId)?.size===1 ? teamIds.get([...teams.get(r.agentId)!][0]) : 'rattachement-divergent'}));
    familyCache.set(id,rows);return rows;
  };
  const all=rowsFor(sourceId);
  if(all.some(r=>r.family==='rattachement-divergent'))definitions.push({id:'rattachement-divergent',label:'Rattachement divergent · à vérifier',team:'__CONFLICT__'});
  const selected=all.filter(r=>(!agency||r.agency===agency)&&(!plage||m3eKey(r)===plage)&&matchesAgentCohort(r,college,sex));
  // One historical traversal for all services. Previously repeated for every
  // family, exceeding the Edge Function's CPU budget (HTTP 546).
  const allProgression=agentProgression(data,sourceId,true,snapshotFor);
  const passageSummary=(rows:{agentId:string;years:number;estimated:boolean}[])=>({mean:mean(rows.map(p=>p.years)),count:rows.length,estimated:rows.filter(p=>p.estimated).length});
  const histories=new Map<string,AgentRecord[]>();
  for(const r of data.records){const list=histories.get(r.agentId)||[];list.push(r);histories.set(r.agentId,list);}
  const summaries=definitions.map(f=>{
    const members=selected.filter(r=>r.family===f.id&&r.nni);
    const average=(key:'gf'|'nr'|'age')=>{const values=members.map(r=>r[key]).filter(finite);return {mean:mean(values),count:values.length};};
    const seniorities=members.map(r=>careerSeniority(histories.get(r.agentId)||[],data.sources,reference.date)).filter(s=>s&&finite(s.years));
    const ids=new Set(members.map(r=>r.agentId));
    const progression=members.length&&allProgression?.passages ? {
      gf:passageSummary(allProgression.passages.gf.filter(p=>ids.has(p.agentId))),
      nr:passageSummary(allProgression.passages.nr.filter(p=>ids.has(p.agentId)))
    } : null;
    const colleges=['cadres','maitrise','execution'].map(id=>({id,label:{cadres:'Cadres',maitrise:'Maîtrise',execution:'Exécution'}[id],count:members.filter(r=>finite(r.gf)?(r.gf>=12?'cadres':r.gf>=7?'maitrise':'execution')===id:r.college===id).length}));
    return {...f,available:all.some(r=>r.family===f.id),agents:members.length,pending:selected.filter(r=>r.family===f.id&&!r.nni).length,manual:members.filter(r=>r.manualPresence).length,gf:average('gf'),nr:average('nr'),age:average('age'),seniority:{mean:mean(seniorities.map(s=>s!.years!)),count:seniorities.length,estimated:seniorities.filter(s=>s!.estimated).length},colleges,progression};
  });
  // An absent service label is unavailable, never an inferred zero.
  const timeline=data.sources.filter(s=>(s.primary||s.status==='validated')&&s.status!=='review'&&s.date<=reference.date).sort((a,b)=>a.date.localeCompare(b.date)).flatMap(s=>{
    const rows=rowsFor(s.id);
    const scoped=rows.filter(r=>r.nni&&(!agency||r.agency===agency)&&(!plage||m3eKey(r)===plage)&&matchesAgentCohort(r,college,sex));
    return [{date:s.date,source:s.id,label:s.label,...Object.fromEntries(definitions.map(f=>[f.id,rows.some(r=>r.family===f.id)&&(!plage||rows.some(r=>m3eKey(r)===plage))?scoped.filter(r=>r.family===f.id).length:null]))}];
  });
  // Retain every calendar year between the first and last accepted photograph.
  // Missing photographs are explicitly unavailable, never zero or interpolated.
  const datedYears=timeline.map(r=>Number(r.date.slice(0,4))).filter(Number.isFinite);
  const annualTimeline=[...timeline];
  if(datedYears.length>1){
    const known=new Set(datedYears);
    for(let year=Math.min(...datedYears);year<=Math.max(...datedYears);year++){
      if(!known.has(year))annualTimeline.push({date:year+'-12-31',source:'missing-'+year,label:'Aucune photographie disponible pour '+year,...Object.fromEntries(definitions.map(f=>[f.id,null]))});
    }
    annualTimeline.sort((a,b)=>a.date.localeCompare(b.date));
  }
  return {reference,summaries,timeline:annualTimeline,agency,plage,college,sex,sexKnown:all.filter(r=>r.nni&&normalizeAgentSex(r.sex)!==null).length,sexTotal:all.filter(r=>r.nni).length,plages:m3eOptions(all),m3eMeans:m3eMeans(selected),agencies:[...new Set(all.map(r=>r.agency).filter((v):v is string=>!!v))].sort(),total:selected.length,pending:selected.filter(r=>!r.nni).length,classified:selected.filter(r=>r.family&&r.nni).length,outside:selected.filter(r=>!r.family).length};
}
