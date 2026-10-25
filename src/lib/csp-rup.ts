import {normalName,normalizeNNI} from './agents.ts';
import type {RupData,RupRow} from './rup.ts';
export type CspIdentity={name:string;nni:string;source:string;date:string;agency?:string};
export const cspNameKey=(name:string)=>normalName(name).split(' ').sort().join(' ');
// Read newest active sources first; consult older sources only for names still
// missing. Same-date contradictory NNIs remain separate candidates.
export async function findCspRupIdentities(seed:RupData,imports:any[],excluded:string[],names:string[],read:(id:string)=>Promise<RupRow[]>):Promise<CspIdentity[]>{
 const wanted=new Set(names.map(cspNameKey)),disabled=new Set(excluded),sources=[...seed.sources.filter(s=>!disabled.has(s.id)&&!['review','disabled'].some(k=>s.status?.startsWith(k))).map(s=>({...s,seed:true})),...imports.filter(s=>s.status==='validated'&&!disabled.has(s.id)&&JSON.parse(s.detail||'{}').kind==='rup').map(s=>({...s,seed:false}))].sort((a,b)=>b.date.localeCompare(a.date));
 if(!wanted.size)return [];const seedRows=new Map<string,RupRow[]>();for(const r of seed.records){if(!wanted.has(cspNameKey([r.nom,r.prenom].filter(Boolean).join(' '))))continue;const rows=seedRows.get(r.source)||[];rows.push(r);seedRows.set(r.source,rows);}
 const output:CspIdentity[]=[];const resolved=new Set<string>();
 for(let i=0;i<sources.length;){const date=sources[i].date,group=[];while(i<sources.length&&sources[i].date===date)group.push(sources[i++]);const found=new Set<string>();
  for(const source of group){const rows=source.seed?(seedRows.get(source.id)||[]):await read(source.id);for(const r of rows){const name=[r.nom,r.prenom].filter(Boolean).join(' '),key=cspNameKey(name),nni=normalizeNNI(r.nni);if(wanted.has(key)&&!resolved.has(key)&&nni){output.push({name,nni,source:source.id,date,agency:r.agence});found.add(key);}}}
  for(const key of found)resolved.add(key);if(resolved.size===wanted.size)break;
 }
 return output;
}
