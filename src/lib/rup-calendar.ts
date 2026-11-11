import type {RupData,RupRow} from './rup.ts';
const fields=['entreeIEG','entreeUnite','entreeUO'] as const;
type Field=typeof fields[number];
export type RupCalendarAdjustment={method:'excel-calendar-v2';original:Partial<Record<Field,string>>};
const identity=(r:RupRow)=>r.nni+'|'+String(r.contrat||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^0+(?=\d)/,'');
const day=(value:string|null)=>value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(value+'T00:00:00Z')/86400000:NaN;
const next=(value:string)=>new Date((day(value)+1)*86400000).toISOString().slice(0,10);
/** Reconcile legacy imports only after a systematic source-wide negative-day drift.
 * Each independent document gets one vote per identity/contract; duplicates never
 * inflate the reference. Wider discrepancies and manual corrections stay explicit.
 * Source documents remain immutable; adjusted rows retain their exact raw dates.
 */
export function normalizeRupCalendar(rup:RupData):RupData{
 const byIdentity=new Map<string,RupRow[]>();
 for(const r of rup.records){if(!r.nni)continue;const k=identity(r),rows=byIdentity.get(k)||[];rows.push(r);byIdentity.set(k,rows);}
 const legacy=new Set(rup.sources.filter(s=>s.id.startsWith('rup-imp-')&&s.calendarDateVersion!==2).map(s=>s.id));
 const evidence=new Map<string,{same:number;previous:number}>();
 for(const rows of byIdentity.values()){
  const values=new Map<string,Set<string>>();
  for(const r of rows)if(Number.isFinite(day(r.entreeIEG))){const dates=values.get(r.source)||new Set<string>();dates.add(r.entreeIEG!);values.set(r.source,dates);}
  for(const [source,dates]of values){
   if(!legacy.has(source)||dates.size!==1)continue;
   const votes=new Map<string,number>();
   for(const [other,set]of values)if(other!==source&&set.size===1){const date=[...set][0];votes.set(date,(votes.get(date)||0)+1);}
   const ranked=[...votes].sort((a,b)=>b[1]-a[1]);
   if(!ranked[0]||ranked[0][1]<2||ranked[1]?.[1]===ranked[0][1])continue;
   const delta=day(ranked[0][0])-day([...dates][0]);if(delta!==0&&delta!==1)continue;
   const e=evidence.get(source)||{same:0,previous:0};delta===1?e.previous++:e.same++;evidence.set(source,e);
  }
 }
 const shifted=new Set([...evidence].filter(([,e])=>e.previous>=20&&e.previous/(e.same+e.previous)>=.95).map(([source])=>source));
 if(!shifted.size)return rup;
 const records=rup.records.map(r=>{
  if(!shifted.has(r.source)||r.calendarDateVersion===2||r.calendarDateAdjustment)return r;
  const peers=(byIdentity.get(identity(r))||[]).filter(p=>p.source!==r.source&&!shifted.has(p.source));
  const original:Partial<Record<Field,string>>={},patch:Partial<RupRow>={};
  for(const field of fields){
   const value=r[field];if(!value||!Number.isFinite(day(value)))continue;
   const target=next(value),values=new Set(peers.map(p=>p[field]).filter(v=>Number.isFinite(day(v))));
   // A documented equal date is evidence against changing this row. A later
   // date must actually exist in an independently unshifted source.
   if(!values.has(target)||values.has(value))continue;
   original[field]=value;patch[field]=target;
  }
  return Object.keys(original).length?{...r,...patch,calendarDateAdjustment:{method:'excel-calendar-v2' as const,original}}:r;
 });
 const counts=new Map<string,number>();for(const r of records)if(r.calendarDateAdjustment)counts.set(r.source,(counts.get(r.source)||0)+1);
 return {...rup,records,sources:rup.sources.map(s=>counts.has(s.id)?{...s,calendarDateAdjustedRows:counts.get(s.id),note:[s.note,'Dates Excel corrigées par rapprochement avec les autres RUP ; dates importées conservées dans la trace.'].filter(Boolean).join(' ')}:s)};
}
