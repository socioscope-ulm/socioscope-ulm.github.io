/** Source unique des primes annuelles, consultée par les calculs et les graphiques. */
export type AnnualBonusRow={rpc:number|null;rpem:number|null;pvpa:number|null};
export type AnnualBonusDetails={paymentYear:number;objectiveYear:number;rows:Record<string,AnnualBonusRow>;sourceName?:string;originalPath?:string;hasOriginal?:boolean;entryMode?:'manual'|'file'};
export const ANNUAL_BONUS_GFS=Array.from({length:18},(_,i)=>19-i);
export const bonusApplicable=(gf:number,key:keyof AnnualBonusRow)=>key==='rpem'?gf>=2&&gf<=11:gf>=12&&gf<=19;
const cents=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=10000000;
export function validateAnnualBonusDetails(v:unknown):v is AnnualBonusDetails{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const p=v as Partial<AnnualBonusDetails>;
 if(!Number.isInteger(p.paymentYear)||!Number.isInteger(p.objectiveYear)||p.paymentYear!<2000||p.paymentYear!>2100||p.objectiveYear!<2000||p.objectiveYear!>p.paymentYear!)return false;
 if(p.sourceName!==undefined&&(typeof p.sourceName!=='string'||p.sourceName.length>240))return false;
 if(p.originalPath!==undefined&&(typeof p.originalPath!=='string'||p.originalPath.length>280||!p.originalPath.startsWith('/sources/')))return false;
 if(p.hasOriginal!==undefined&&typeof p.hasOriginal!=='boolean')return false;
 if(p.entryMode!==undefined&&!['manual','file'].includes(p.entryMode))return false;
 if(!p.rows||typeof p.rows!=='object'||Array.isArray(p.rows))return false;
 const keys=Object.keys(p.rows);
 if(keys.length!==ANNUAL_BONUS_GFS.length||!ANNUAL_BONUS_GFS.every(gf=>Object.prototype.hasOwnProperty.call(p.rows,String(gf))))return false;
 let present=false;
 for(const gf of ANNUAL_BONUS_GFS){
  const r=p.rows[String(gf)];if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='pvpa,rpc,rpem')return false;
  for(const key of ['rpc','rpem','pvpa'] as const){
   const value=r[key];if(value!==null&&!cents(value))return false;
   if(!bonusApplicable(gf,key)&&value!==null)return false;
   if(value!==null)present=true;
  }
 }
 return present;
}
export function annualBonusLabel(paymentYear:number,objectiveYear:number){return `Primes versées en ${paymentYear} · objectifs ${objectiveYear}`;}
export function bonusForGF(rows:Record<string,AnnualBonusRow>,gf:number){
 const row=rows[String(gf)];
 if(!row)return {rpcRpem:null as number|null,pvpa:null as number|null,total:null as number|null};
 const rpcRpem=gf<=11?row.rpem:row.rpc;
 const pvpa=gf<=11?0:row.pvpa;
 return {rpcRpem,pvpa,total:rpcRpem===null||pvpa===null?null:rpcRpem+pvpa};
}
