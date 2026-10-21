import {normalizeNNI} from './agents.ts';
import {readRupWorkbook} from './rup-import.js';
import type {AgentData,AgentRecord} from './agents.ts';
export type RupRow={nni:string;contrat:string;nom:string;prenom:string;entreeIEG:string|null;entreeUnite:string|null;entreeUO:string|null;agence:string;service:string;metier:string;emploi:string;college:string;m3e:string;lieuTravailCode:string;typeContrat:string;annee:number|null;source:string;row?:number;sheet?:string};
export type RupSource={id:string;name:string;hash:string;date:string;count:number;status:string;note?:string};
export type RupData={sources:RupSource[];records:RupRow[]};
export type RupCareer={status:'confirmed'|'conflict'|'ambiguous'|'missing';date?:string;dates:string[];history:RupRow[]};
export function rupCareer(rows:RupRow[],nni?:string,contract?:string):RupCareer|undefined{
 if(!nni)return;
 if(contract&&normalizeNNI(contract)===nni)contract=contract.replace(/[^A-Z0-9]/gi,'').slice(6)||undefined;
 const found=rows.filter(r=>r.nni===nni&&(!contract||r.contrat===contract));if(!found.length)return;
 const dates=[...new Set(found.map(r=>r.entreeIEG).filter((v):v is string=>!!v))].sort();
 const ambiguous=!contract&&new Set(found.map(r=>r.contrat)).size>1;
 const status=ambiguous?'ambiguous':dates.length>1?'conflict':dates.length?'confirmed':'missing';
 return {status,date:status==='confirmed'?dates[0]:undefined,dates,history:found};
}
export function withRupCareer(data:AgentData,rup:RupData):AgentData{
 const byNNI=new Map<string,RupRow[]>();for(const r of rup.records){const rows=byNNI.get(r.nni)||[];rows.push(r);byNNI.set(r.nni,rows);}
 const cache=new Map<string,RupCareer|undefined>();
 return {...data,rup,records:data.records.map(r=>{const key=r.nni+'|'+(r.contract||'');if(!cache.has(key))cache.set(key,rupCareer(byNNI.get(r.nni||'')||[],r.nni,r.contract));return {...r,rupCareer:cache.get(key)};})};
}
export async function parseRupFile(file:File,date:string){
 if(file.size>20*1024*1024)throw Error('Fichier limité à 20 Mo.');
 const XLSX=await import('xlsx');const raw=readRupWorkbook(await file.arrayBuffer(),file.name,XLSX) as RupRow[];
 if(raw.length>10000)throw Error('RUP limité à 10 000 lignes.');
 return raw.map(r=>({...r,nni:normalizeNNI(r.nni)||'',annee:Number(date.slice(0,4))})).filter(r=>r.nni);
}
export function rupStats(rup:RupData){const keys=[...new Set(rup.records.map(r=>r.nni+'|'+r.contrat))];const groups=keys.map(k=>{const [n,c]=k.split('|');return rupCareer(rup.records,n,c)!;});return {lines:rup.records.length,agents:keys.length,dates:groups.filter(g=>g.dates.length).length,conflicts:groups.filter(g=>g.status==='conflict').length};}
// The server only archives this filtered representation; raw workbooks are never stored.
export function rupCSV(rows:RupRow[]){const fields: (keyof RupRow)[]=['nni','contrat','nom','prenom','entreeIEG','entreeUnite','entreeUO','agence','service','metier','emploi','college','m3e','lieuTravailCode','typeContrat','annee','source'];return '\ufeff'+[fields,...rows.map(r=>fields.map(f=>r[f]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n');}
