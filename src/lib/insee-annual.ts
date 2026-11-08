import type {Dataset,Observation} from './model';

export type InseeAnnualSnapshot={
 idbank:string;
 source:string;
 values:{year:number;value:number}[];
 lastImportedAt?:string;
};
export const INSEE_ANNUAL_IDBANK='011814640';
export const INSEE_ANNUAL_SOURCE='https://www.insee.fr/fr/statistiques/serie/011814640';

/** Ajout non destructif : les années déjà présentes dans le Socioscope sont prioritaires. */
export function withInseeAnnualInflation(data:Dataset,snapshot:unknown,yearNow=new Date().getUTCFullYear()):Dataset{
 if(!snapshot||typeof snapshot!=='object')return data;
 const s=snapshot as Partial<InseeAnnualSnapshot>;
 if(s.idbank!==INSEE_ANNUAL_IDBANK||!Array.isArray(s.values)||s.values.length>150)return data;
 const existing=new Set(data.observations.filter(x=>x.metric==='inflation'&&x.sex==='ensemble'&&x.college==='ensemble').map(x=>x.year));
 const seen=new Set<number>();
 const additions:Observation[]=[];
 for(const item of s.values){
  if(!item||!Number.isInteger(item.year)||item.year<1990||item.year>=yearNow||
   typeof item.value!=='number'||!Number.isFinite(item.value)||item.value < -20||item.value > 35||
   seen.has(item.year))return data;
  seen.add(item.year);
  if(existing.has(item.year))continue;
  additions.push({metric:'inflation',year:item.year,value:item.value,source:'insee-auto',page:0,
   sex:'ensemble',college:'ensemble',unit:'pourcent',population:'ensemble',verified:true});
 }
 if(!additions.length)return data;
 return {...data,observations:[...data.observations,...additions]};
}
