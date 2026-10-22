import {normalizeNNI,normalizeAgentSex} from './agents.ts';
import {readRupWorkbook} from './rup-import.js';
import type {AgentData,AgentRecord} from './agents.ts';
export type RupRow={nni:string;contrat:string;nom:string;prenom:string;genre?:string;entreeIEG:string|null;entreeUnite:string|null;entreeUO:string|null;agence:string;service:string;metier:string;emploi:string;college:string;m3e:string;lieuTravailCode:string;typeContrat:string;annee:number|null;source:string;row?:number;sheet?:string};
export type RupSource={id:string;name:string;hash:string;date:string;count:number;status:string;note?:string};
export type RupCorrection={date:string;source:string;row:number|null;contract:string;reason:string;actor:string;created:string};
export type RupData={sources:RupSource[];records:RupRow[];corrections?:Record<string,RupCorrection>};
export type RupCareer={status:'confirmed'|'conflict'|'ambiguous'|'missing';date?:string;dates:string[];history:RupRow[];correction?:RupCorrection};
const contractKey=(value:string)=>{
 const code=String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 return /^\d+$/.test(code)?code.replace(/^0+(?=\d)/,''):code;
};
export function rupCareer(rows:RupRow[],nni?:string,contract?:string):RupCareer|undefined{
 if(!nni)return;
 let sought=String(contract||'').trim();
 if(sought&&normalizeNNI(sought)===nni)sought=sought.replace(/[^A-Z0-9]/gi,'').slice(6);
 const all=rows.filter(r=>r.nni===nni);if(!all.length)return;
 const matchKey=contractKey(sought);
 const exact=matchKey?all.filter(r=>contractKey(r.contrat)===matchKey):[];
 const distinctDates=(items:RupRow[])=>[...new Set(items.map(r=>r.entreeIEG).filter((v):v is string=>!!v))].sort();
 const exactDates=distinctDates(exact),allDates=distinctDates(all);
 // Use the exact contract first. If it has no date, or the individual file
 // lacks a contract, a unique IEG date across this NNI's RUP is reliable.
 const found=exactDates.length?exact:allDates.length===1?all:exact.length?exact:all;
 const dates=distinctDates(found);
 const ambiguous=!exact.length&&allDates.length>1&&new Set(all.map(r=>contractKey(r.contrat))).size>1;
 const status=ambiguous?'ambiguous':dates.length>1?'conflict':dates.length?'confirmed':'missing';
 return {status,date:status==='confirmed'?dates[0]:undefined,dates,history:found};
}
export function withRupCareer(data:AgentData,rup:RupData):AgentData{
 const byNNI=new Map<string,RupRow[]>();for(const r of rup.records){const rows=byNNI.get(r.nni)||[];rows.push(r);byNNI.set(r.nni,rows);}
 const cache=new Map<string,RupCareer|undefined>();
 return {...data,rup,records:data.records.map(r=>{const key=r.nni+'|'+(r.contract||'');if(!cache.has(key))cache.set(key,rupCareer(byNNI.get(r.nni||'')||[],r.nni,r.contract));let career=cache.get(key);
 const correction=rup.corrections?.[r.nni||''];
 const verified=correction&&(byNNI.get(r.nni||'')||[]).find(v=>v.source===correction.source&&v.entreeIEG===correction.date&&(correction.row===null?String(v.contrat||'').trim()===correction.contract:v.row===correction.row));
 if(correction&&verified){
  const all=byNNI.get(r.nni||'')||[];
  career={status:'confirmed',date:correction.date,dates:[...new Set(all.map(v=>v.entreeIEG).filter((v):v is string=>!!v))].sort(),history:all,correction};
 }
 const values=new Set((career?.history||[]).map(v=>normalizeAgentSex(v.genre)).filter(Boolean));const rupSex=career?.status!=='ambiguous'&&values.size===1?[...values][0]:null;const recorded=normalizeAgentSex(r.sex);return {...r,sex:recorded||rupSex||r.sex,rupCareer:career};})};
}
// Enrichissement leger du sexe, independant des calculs de carriere.
export function withRupSex(data:AgentData,rup:RupData):AgentData{
 const byNNI=new Map<string,Map<string,Set<string>>>();
 for(const row of rup.records){
  const nni=normalizeNNI(row.nni),sex=normalizeAgentSex(row.genre);
  if(!nni||!sex)continue;
  let contracts=byNNI.get(nni);
  if(!contracts){contracts=new Map();byNNI.set(nni,contracts);}
  const contract=String(row.contrat||'').trim();
  let sexes=contracts.get(contract);
  if(!sexes){sexes=new Set();contracts.set(contract,sexes);}
  sexes.add(sex);
 }
 return {...data,records:data.records.map(r=>{
  if(normalizeAgentSex(r.sex))return r;
  const nni=normalizeNNI(r.nni),contracts=nni?byNNI.get(nni):undefined;
  if(!contracts)return r;
  const contract=String(r.contract||'').trim();
  const matching=contract?contracts.get(contract):undefined;
  // En l'absence de correspondance de contrat, utiliser seulement un sexe
  // identique sur TOUS les RUP historiques de ce NNI, jamais une estimation.
  const allSexes=new Set([...contracts.values()].flatMap(v=>[...v]));
  const values=matching||allSexes;
  if(!values||values.size!==1)return r;
  return {...r,sex:[...values][0]};
 })};
}
export async function parseRupFile(file:File,date:string){
 if(file.size>20*1024*1024)throw Error('Fichier limité à 20 Mo.');
 const XLSX=await import('xlsx');const raw=readRupWorkbook(await file.arrayBuffer(),file.name,XLSX) as RupRow[];
 if(raw.length>10000)throw Error('RUP limité à 10 000 lignes.');
 return raw.map(r=>({...r,nni:normalizeNNI(r.nni)||'',annee:Number(date.slice(0,4))})).filter(r=>r.nni);
}
export function rupStats(rup:RupData){const groups=new Map<string,Set<string>>();for(const r of rup.records){const key=r.nni+'|'+r.contrat;let dates=groups.get(key);if(!dates){dates=new Set<string>();groups.set(key,dates);}if(r.entreeIEG)dates.add(r.entreeIEG);}const values=[...groups.values()];return {lines:rup.records.length,agents:groups.size,dates:values.filter(v=>v.size>0).length,conflicts:values.filter(v=>v.size>1).length};}
// The server only archives this filtered representation; raw workbooks are never stored.
export function rupCSV(rows:RupRow[]){const fields: (keyof RupRow)[]=['nni','contrat','nom','prenom','genre','entreeIEG','entreeUnite','entreeUO','agence','service','metier','emploi','college','m3e','lieuTravailCode','typeContrat','annee','source'];return '\ufeff'+[fields,...rows.map(r=>fields.map(f=>r[f]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n');}
