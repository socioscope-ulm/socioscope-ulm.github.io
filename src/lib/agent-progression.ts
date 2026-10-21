import {snapshot} from './agents.ts';
import type {AgentData,AgentRecord,AgentSource} from './agents.ts';
type Passage={agentId:string;from:number;to:number;years:number;estimated:boolean};
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const epoch=(v?:string)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?Date.parse(v+'T00:00:00Z'):NaN;
const yearMs=365.2425*86400000;
function anchor(r:AgentRecord,s:AgentSource,key:'gf'|'nr'){
 if((r as any).conflicts?.some((f:string)=>[key,key+'Date',key+'Years','seniorityDate'].includes(f)))return null;
 const exact=epoch(r[key==='gf'?'gfDate':'nrDate']);
 const ref=epoch(r.seniorityDate||s.seniorityDate||s.date);
 if(Number.isFinite(exact)&&exact<=Math.max(ref,epoch(s.date)))return {time:exact,estimated:false};
 const years=r[key==='gf'?'gfYears':'nrYears'];
 return typeof years==='number'&&Number.isFinite(years)&&years>=0&&Number.isFinite(ref)?{time:ref-years*yearMs,estimated:true}:null;
}
export function agentProgression(data:AgentData,sourceId:string){
 const reference=data.sources.find(s=>s.id===sourceId);if(!reference)return null;
 const sources=data.sources.filter(s=>(s.primary||s.status==='validated')&&s.status!=='review'&&s.date<=reference.date).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const histories=new Map<string,{record:AgentRecord;source:AgentSource}[]>();
 // Alternative files and duplicate situations never create extra passages.
 for(const s of sources)for(const r of snapshot(data,s.id).filter(r=>r.nni)){
  const h=histories.get(r.agentId)||[];h.push({record:r,source:s});histories.set(r.agentId,h);
 }
 const passages:{gf:Passage[];nr:Passage[]}={gf:[],nr:[]};
 for(const [agentId,h] of histories)for(const key of ['gf','nr'] as const)for(let i=1;i<h.length;i++){
  const prev=h[i-1],cur=h[i],from=prev.record[key],to=cur.record[key];
  if(typeof from!=='number'||typeof to!=='number'||to<=from||cur.source.date===prev.source.date)continue;
  const start=anchor(prev.record,prev.source,key),end=anchor(cur.record,cur.source,key);
  // An undated change cannot establish a duration; a change after an unknown
  // intermediate level cannot establish that the whole interval was spent at from.
  if(!start||!end||end.time<=start.time||end.time<epoch(prev.source.date)-32*86400000||end.time>Math.max(epoch(cur.source.date),epoch(cur.record.seniorityDate||cur.source.seniorityDate)))continue;
  const years=(end.time-start.time)/yearMs;if(years>60)continue;
  passages[key].push({agentId,from,to,years,estimated:start.estimated||end.estimated});
 }
 const current=snapshot(data,sourceId).filter(r=>r.nni);
 const summarize=(rows:Passage[])=>({mean:mean(rows.map(r=>r.years)),count:rows.length,estimated:rows.filter(r=>r.estimated).length});
 const groups=(key:'gf'|'nr')=>[...new Set(passages[key].map(r=>r.from))].sort((a,b)=>a-b).map(level=>({level,...summarize(passages[key].filter(r=>r.from===level))}));
 const nrByGF=[...new Set(current.map(r=>r.gf).filter((v):v is number=>typeof v==='number'))].sort((a,b)=>a-b).map(gf=>{const rows=current.filter(r=>r.gf===gf);const values=rows.map(r=>r.nr).filter((v):v is number=>typeof v==='number');return {gf,agents:rows.length,count:values.length,mean:mean(values)};});
 return {source:reference.id,from:sources[0]?.date,to:reference.date,gf:summarize(passages.gf),nr:summarize(passages.nr),gfGroups:groups('gf'),nrGroups:groups('nr'),nrByGF};
}
