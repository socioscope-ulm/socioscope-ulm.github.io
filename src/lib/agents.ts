import type {RupData,RupCareer} from './rup.ts';
export type AgentSource={id:string;name:string;hash:string;date:string;label:string;sheet:string;primary:boolean;confidence:string;seniorityDate:string;rows:number;agents:number;status?:string};
export type AgentRecord={rupCareer?:RupCareer;id:string;agentId:string;nni?:string;source:string;row:number;name:string;gf?:number;nr?:number;gfYears?:number;nrYears?:number;iegYears?:number;gfDate?:string;nrDate?:string;entryIEG?:string;entryCompany?:string;entryUnit?:string;college?:string;sex?:string;age?:number;coefficient?:number;agency?:string;team?:string;job?:string;m3e?:string;presence?:string;contract?:string;seniorityDate?:string;candidateNNIs?:string[];matchStatus?:string;manualPresence?:boolean;presenceNote?:string;originalSource?:string};
export type AgentEvent={agentId:string;date:string;kind:string;motif:string;nrRaw?:string;gf?:number;legacyNR?:boolean;numberNR?:number;contextNR?:number;duration?:number;end?:string;openEnd?:boolean;evidence:{source:string;sheet:string;row:number;column?:number}[]};
export type AgentData={rup?:RupData;sources:AgentSource[];records:AgentRecord[];events:AgentEvent[];issues:any[];updated:string};
export const normalName=(v:unknown)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
export const normalizeNNI=(v:unknown)=>{const t=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const m=t.match(/^([A-Z]\d{5})([A-Z0-9]{2})?$/);return m?.[1]||null;};
export function careerSeniority(records:AgentRecord[],sources:AgentSource[],asof:string,selectedSourceId?:string){
 const utc=(date:string)=>new Date(date+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asof)||Number.isNaN(+utc(asof))||utc(asof).toISOString().slice(0,10)!==asof)return null;
 const refs=new Map(sources.map(s=>[s.id,s]));
 const rows=records.filter(r=>(refs.get(r.source)?.primary||refs.get(r.source)?.status==='validated'||r.source===selectedSourceId)&&(refs.get(r.source)?.date||'9999')<=asof);
 const yearsBetween=(start:string,end:string)=>{const a=utc(start),b=utc(end);let years=b.getUTCFullYear()-a.getUTCFullYear();const anniversary=new Date(Date.UTC(a.getUTCFullYear()+years,a.getUTCMonth(),a.getUTCDate()));if(anniversary>b)years--;const left=new Date(Date.UTC(a.getUTCFullYear()+years,a.getUTCMonth(),a.getUTCDate()));const right=new Date(Date.UTC(a.getUTCFullYear()+years+1,a.getUTCMonth(),a.getUTCDate()));return years+(+b-+left)/(+right-+left);};
 const rup=records.find(r=>r.rupCareer)?.rupCareer;
 const rupProblem=rup&&['conflict','ambiguous'].includes(rup.status)?rup.status:null;
 // A disputed RUP cannot be used as an entry date, but independent documented
 // seniority (IEG years or an explicit entry date) remains usable.
 const historicalAnchor=rows.some(r=>((typeof r.iegYears==='number'&&r.iegYears>=0&&(r.seniorityDate||refs.get(r.source)!.seniorityDate)<=asof)||(r.entryIEG&&r.entryIEG<=asof)||(r.entryCompany&&r.entryCompany<=asof)));
 if(rupProblem&&!historicalAnchor)return {years:null,completedYears:null,asof,start:'',base:0,method:rupProblem==='ambiguous'?'RUP · plusieurs contrats à rapprocher ; aucune ancienneté indépendante':'RUP · dates IEG contradictoires ; aucune ancienneté indépendante',estimated:false,conflict:true,evidence:{source:records[0].source,row:records[0].row},firstSeen:rows.map(r=>refs.get(r.source)!.date).sort()[0]};
 if(rup?.status==='confirmed'&&rup.date&&rup.date>asof)return null;
 if(rup?.status==='confirmed'&&rup.date&&rup.date<=asof){const years=yearsBetween(rup.date,asof);return {years,completedYears:Math.floor(years+1e-8),asof,start:rup.date,base:0,method:'Date d’entrée IEG du RUP',estimated:false,conflict:false,evidence:{source:records[0].source,row:records[0].row},rupEvidence:rup.history.filter(r=>r.entreeIEG===rup.date),firstSeen:rows.map(r=>refs.get(r.source)!.date).sort()[0]};}
 const anchors=rows.filter(r=>typeof r.iegYears==='number'&&r.iegYears>=0&&(r.seniorityDate||refs.get(r.source)!.seniorityDate)<=asof).sort((a,b)=>(b.seniorityDate||refs.get(b.source)!.seniorityDate).localeCompare(a.seniorityDate||refs.get(a.source)!.seniorityDate));
 let base=0,start='',method='',evidence:AgentRecord|undefined;
 if(anchors.length){evidence=anchors[0];start=evidence.seniorityDate||refs.get(evidence.source)!.seniorityDate;base=evidence.iegYears!;method='Ancienneté IEG publiée prolongée';}
 else {const dated=rows.filter(r=>(r.entryIEG||r.entryCompany)&&((r.entryIEG||r.entryCompany)!)<=asof).sort((a,b)=>(refs.get(b.source)?.date||'').localeCompare(refs.get(a.source)?.date||''));if(dated.length){evidence=dated[0];start=evidence.entryIEG||evidence.entryCompany!;method=evidence.entryIEG?'Date d’entrée IEG renseignée':'Date d’entrée entreprise renseignée';}else{evidence=rows.slice().sort((a,b)=>refs.get(a.source)!.date.localeCompare(refs.get(b.source)!.date))[0];if(!evidence)return null;start=refs.get(evidence.source)!.date;method='Première apparition · hypothèse d’entrée en carrière';}}
 const years=base+yearsBetween(start,asof);if(!Number.isFinite(years)||years<0)return null;
 const same=anchors.filter(r=>(r.seniorityDate||refs.get(r.source)!.seniorityDate)===start);const conflict=same.some(r=>Math.abs(r.iegYears!-base)>0.01);
 return {years:conflict?null:years,completedYears:conflict?null:Math.floor(years+1e-8),asof,start,base,method:rupProblem?method+' · RUP à vérifier':method,estimated:method.startsWith('Première'),conflict,evidence:{source:evidence.source,row:evidence.row},firstSeen:rows.map(r=>refs.get(r.source)!.date).sort()[0]};
}
export function unpackAgentSeed(p:any):AgentData{const decode=(v:any):any=>typeof v==='number'&&v<0?p.strings[-v-1]:Array.isArray(v)?v.map(decode):v&&typeof v==='object'?('number'in v?v.number:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]))):v;const unpack=(fields:string[],r:any[])=>Object.fromEntries(fields.flatMap((k,i)=>r[i]===null?[]:[[k,decode(r[i])]]));return {...p,strings:undefined,recordFields:undefined,eventFields:undefined,records:p.records.map((r:any[])=>{const record=unpack(p.recordFields,r);if(['s2022jan','s2022dec'].includes(record.source)&&!record.college&&typeof record.gf==='number'&&record.gf>=12)record.college='cadres';return record;}),events:p.events.map((r:any[])=>unpack(p.eventFields,r))};}
export function snapshot(data:AgentData,source:string){const grouped=new Map<string,AgentRecord[]>();for(const r of data.records.filter(r=>r.source===source)){const rows=grouped.get(r.agentId)||[];rows.push(r);grouped.set(r.agentId,rows);}return [...grouped].map(([agentId,rows])=>{const out:any={...rows[0],agentId,situations:rows.length,conflicts:[]};for(const field of ['nr','gf','nrYears','gfYears','iegYears','coefficient','agency','college','gfDate','nrDate','seniorityDate','m3e']){const values=[...new Set(rows.map(r=>(r as any)[field]).filter(v=>v!==undefined&&v!==''))];if(values.length>1){out[field]=undefined;out.conflicts.push(field);}else out[field]=values[0];}return out as AgentRecord&{situations:number;conflicts:string[]};});}
export function sourcePairs(data:AgentData,id:string,previous?:string){
 const src=data.sources.find(s=>s.id===id);
 const compatible=data.sources.filter(s=>s.status!=='review'&&s.date<(src?.date||'')&&data.records.some(r=>r.source===s.id));
 const mostRecentDate=compatible.map(s=>s.date).sort((a,b)=>b.localeCompare(a))[0];
 const candidates=compatible.filter(s=>s.date===mostRecentDate).sort((a,b)=>{
  const priority=(s:AgentSource)=>/onglets? mis en forme/i.test(s.name+' '+s.label)?2:Number(!!s.primary);
  return priority(b)-priority(a);
 });
 const older=previous?compatible.find(s=>s.id===previous):candidates[0];
 const current=snapshot(data,id),before=older?snapshot(data,older.id):[];
 const c=new Map(current.filter(r=>r.nni).map(r=>[r.agentId,r])),p=new Map(before.filter(r=>r.nni).map(r=>[r.agentId,r]));
 const appeared=current.filter(r=>r.nni&&!p.has(r.agentId));
 const absent:any[]=before.filter(r=>r.nni&&!c.has(r.agentId));
 // Exception GF 19 : keep the historic watchlist when an executive-level
 // employee disappeared before the immediately preceding snapshot.
 const already=new Set(absent.map(r=>r.agentId));
 const olderDates=new Map(data.sources.filter(s=>s.status!=='review'&&s.date<(older?.date||src?.date||'')).map(s=>[s.id,s.date]));
 const lastOlder=new Map<string,{date:string;record:AgentRecord}>();
 for(const r of data.records){
  const date=olderDates.get(r.source);
  if(!date||!r.nni||r.gf!==19)continue;
  const previous=lastOlder.get(r.agentId);
  if(!previous||date>previous.date)lastOlder.set(r.agentId,{date,record:r});
 }
 for(const {record:r} of lastOlder.values()){
  if(r.gf===19&&!c.has(r.agentId)&&!p.has(r.agentId)&&!already.has(r.agentId)){
   absent.push({...r,historicalGF19:true});already.add(r.agentId);
  }
 }
 const reappeared=appeared.filter(r=>data.records.some(x=>x.agentId===r.agentId&&(data.sources.find(s=>s.id===x.source)?.date||'')<(older?.date||'')));
 const changes=current.filter(r=>{const old=p.get(r.agentId);return old&&((r.nr!==undefined&&old.nr!==undefined&&r.nr!==old.nr)||(r.gf!==undefined&&old.gf!==undefined&&r.gf!==old.gf)||(r.agency&&old.agency&&r.agency!==old.agency));}).map(r=>({current:r,previous:p.get(r.agentId)}));
 return {source:src,previous:older,appeared,absent,reappeared,changes,canInferAbsence:!!src?.primary&&!!older&&older.date<src.date&&current.every(r=>!!r.nni)&&before.every(r=>!!r.nni)};
}
export function agentProfile(data:AgentData,id:string){const records=data.records.filter(r=>r.agentId===id);const history=data.events.filter(e=>e.agentId===id).sort((a,b)=>b.date.localeCompare(a.date));const sources=data.sources.filter(s=>records.some(r=>r.source===s.id)).sort((a,b)=>b.date.localeCompare(a.date)||Number(b.primary)-Number(a.primary));return {id,rup:data.rup?.records.filter(r=>r.nni===id)||[],records,events:history,sources,snapshots:sources.map(s=>({source:s,situation:snapshot({ ...data,records:records.filter(r=>r.source===s.id)},s.id)[0]}))};}
export function validateAgentRecord(r:any):r is AgentRecord{return !!r&&typeof r.name==='string'&&r.name.length>0&&r.name.length<180&&typeof r.agentId==='string'&&r.agentId.length<100&&Number.isInteger(r.row)&&r.row>0&&(!r.nni||normalizeNNI(r.nni)===r.nni)&&['nr','gf','nrYears','gfYears','iegYears','age','coefficient'].every(k=>r[k]===undefined||r[k]===null||typeof r[k]==='number'&&Number.isFinite(r[k])&&Math.abs(r[k])<10000);}

// Manual presence supplements missing rows; original observations remain intact.
export function withConfirmedPresence(data:AgentData,decisions:any[]):AgentData{
 const sources=data.sources.filter(s=>s.status!=='review').sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const grouped=new Map<string,AgentRecord[]>();
 for(const r of data.records){const list=grouped.get(r.agentId)||[];list.push(r);grouped.set(r.agentId,list);}
 const byAgent=new Map<string,Map<string,any>>();
 for(const d of decisions){
  if(!['return','departure','absence'].includes(d.kind))continue;
  const item=byAgent.get(d.agent)||new Map<string,any>();
  item.set(d.source,d);byAgent.set(d.agent,item);
 }
 const added:AgentRecord[]=[];
 for(const [agent,choices] of byAgent){
  const observations=new Map<string,AgentRecord[]>();
  for(const r of grouped.get(agent)||[]){const list=observations.get(r.source)||[];list.push(r);observations.set(r.source,list);}
  let active:any=null;
  let prior:AgentRecord|undefined;
  for(const src of sources){
   const rows=observations.get(src.id)||[];
   if(rows.length)active=null;
   const decision=choices.get(src.id);
   if(decision)active=decision.kind==='return'?decision:null;
   if(active&&!rows.length&&prior?.nni){
    let details:any={};try{details=JSON.parse(active.note||'{}');}catch{}
    const values=details.presence||{};
    const row:AgentRecord={...prior,id:'presence:'+active.id+':'+src.id,source:src.id,manualPresence:true,originalSource:prior.source,presenceNote:details.presence?details.note:active.note,seniorityDate:prior.seniorityDate||data.sources.find(s=>s.id===prior!.source)?.seniorityDate};
    for(const key of ['gf','nr','agency'] as const)if(values[key]!==undefined){(row as any)[key]=values[key];if(key!=='agency'&&values[key]!==prior[key]){delete row[key==='gf'?'gfDate':'nrDate'];delete row[key==='gf'?'gfYears':'nrYears'];}}
    if(values.gf!==undefined&&values.gf!==prior.gf)row.college=values.gf>=12?'cadres':values.gf>=7?'maitrise':'execution';
    added.push(row);
   }
   if(rows.length)prior=rows[0];
  }
 }
 return {...data,records:[...data.records,...added]};
}
