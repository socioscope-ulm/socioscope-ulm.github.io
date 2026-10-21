import {normalName} from './agents.ts';
import type {AgentRecord} from './agents.ts';
// EDF, La rémunération globale à EDF SA – Repères, janvier 2025, page 5.
// These are overlapping employment ranges, not a classification inferred from GF.
export const M3E_RANGES=[
 {id:'A',min:17,max:19},{id:'B',min:15,max:17},{id:'C',min:13,max:15},
 {id:'D',min:11,max:13},{id:'E',min:10,max:12},{id:'F',min:9,max:11},
 {id:'G',min:7,max:9},{id:'H',min:3,max:7},{id:'I',min:2,max:4},
] as const;
export function normalizeM3e(value:unknown){
 const raw=normalName(value);
 if(!raw)return '__missing';
 if(M3E_RANGES.some(p=>p.id===raw))return raw;
 const letter=raw.match(/^PLAGE(?: M3E| D EMPLOI)? ([A-I])$/)?.[1];
 if(letter)return letter;
 // Historic exports store the bounds as 0307, 0709, 0911, etc.;
 // spreadsheet numeric cells can drop the leading zero.
 const digits=raw.replace(/ /g,'');
 if(/^\d{3,4}$/.test(digits)){
  const code=digits.padStart(4,'0');
  const range=M3E_RANGES.find(p=>p.min===Number(code.slice(0,2))&&p.max===Number(code.slice(2)));
  if(range)return range.id;
 }
 return raw;
}
export const m3eKey=(r:AgentRecord)=> (r as any).conflicts?.includes('m3e')?'__conflict':normalizeM3e(r.m3e);
export const m3eLabel=(key:string)=>{
 const p=M3E_RANGES.find(p=>p.id===key);
 return p?`${p.id} · GF ${p.min} à ${p.max}`:key==='__missing'?'Non renseignée':key==='__conflict'?'Plage divergente · à vérifier':`${key} · plage non reconnue`;
};
export function m3eOptions(rows:AgentRecord[]){
 const keys=[...new Set(rows.map(m3eKey))];
 return [...M3E_RANGES.map(p=>p.id),...keys.filter(k=>!M3E_RANGES.some(p=>p.id===k)).sort()].map(id=>{
  const members=rows.filter(r=>r.nni&&m3eKey(r)===id);
  const gfs=[...new Set(members.map(r=>r.gf).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)))].sort((a,b)=>a-b);
  const range=M3E_RANGES.find(p=>p.id===id);
  const outside=range?members.filter(r=>typeof r.gf==='number'&&(r.gf<range.min||r.gf>range.max)).length:0;
  return {id,label:m3eLabel(id),gfs,min:range?.min,max:range?.max,outside};
 });
}
export function m3eMeans(rows:AgentRecord[]){return m3eOptions(rows).map(({id,label,gfs,outside})=>{
 const members=rows.filter(r=>r.nni&&m3eKey(r)===id);
 const average=(key:'gf'|'nr')=>{const values=members.map(r=>r[key]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));return {mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,count:values.length};};
 return {id,label,gfs,outside,agents:members.length,gf:average('gf'),nr:average('nr')};
});}
