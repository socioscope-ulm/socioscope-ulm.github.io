export type Observation={metric:string;year:number;value:number;source:string;page:number;sex:string;college:string;unit:string;population:string;verified:boolean;denominatorSource?:string;denominatorPage?:number};
export type Source={id:string;name:string;years:number[];url:string;hash?:string;type:string;status?:string;created?:string};
export type Row={id:string;source:string;page:number;indicator:string;indicatorLabel:string;label:string;group:string;cells:string[];values:number[];years:number[];status:string};
export type Metric={label:string;unit:string;theme:string;description:string};
export type Dataset={documents:Source[];observations:Observation[];metrics:Record<string,Metric>;updated:string;rows?:Row[];pages?:{source:string;page:number;text:string}[]};
export const collegeNames:Record<string,string>={ensemble:'Tous collèges',cadres:'Cadres',maitrise:'Maîtrise',execution:'Exécution'};
export const sexNames:Record<string,string>={ensemble:'Femmes et hommes',hommes:'Hommes',femmes:'Femmes'};
export const keyOf=(o:Observation)=>[o.metric,o.year,o.sex,o.college].join('|');
export function mergeObservations(base:Observation[],add:Observation[]){const m=new Map(base.map(o=>[keyOf(o),o]));for(const o of add)m.set(keyOf(o),o);return [...m.values()];}
export function valueOf(data:Observation[],metric:string,year:number,sex='ensemble',college='ensemble'){return data.find(o=>o.metric===metric&&o.year===year&&o.sex===sex&&o.college===college);}
export function priceIndex(data:Observation[],year:number,base:number){let k=1;for(let y=Math.min(year,base)+1;y<=Math.max(year,base);y++){const r=valueOf(data,'inflation',y);if(!r)return null;k*=1+r.value/100;}return year>=base?k:1/k;}
export const isGlobalRate=(metric:string)=>['snb','inflation'].includes(metric);
export const salaryPairs=[
  {id:'cadres_maitrise',a:'cadres',b:'maitrise',label:'Cadres − Maîtrise'},
  {id:'cadres_execution',a:'cadres',b:'execution',label:'Cadres − Exécution'},
  {id:'maitrise_execution',a:'maitrise',b:'execution',label:'Maîtrise − Exécution'},
];
export function salaryGaps(data:Observation[],from:number,to:number,sex='ensemble'){
  return Array.from({length:Math.max(0,to-from+1)},(_,i)=>from+i).flatMap(year=>salaryPairs.map(pair=>{
    const a=valueOf(data,'remuneration',year,sex,pair.a),b=valueOf(data,'remuneration',year,sex,pair.b);
    // A zero average in the historical tables denotes a population without pay data.
    const valid=!!a&&!!b&&a.value>0&&b.value>0;
    const euros=valid?a!.value-b!.value:null;
    return {year,pair,a,b,euros,percent:euros===null?null:euros/b!.value*100};
  }));
}
export function metricScope(data:Observation[],metric:string,sex:string,college:string){const entries=data.filter(o=>o.metric===metric);const hasSex=!isGlobalRate(metric)&&entries.some(o=>o.sex!=='ensemble');const hasCollege=!isGlobalRate(metric)&&entries.some(o=>o.college!=='ensemble');return {sex:hasSex?sex:'ensemble',college:hasCollege?college:'ensemble',hasSex,hasCollege};}
export function seriesFor(data:Observation[],metric:string,from:number,to:number,sex:string,college:string,mode:string){if(isGlobalRate(metric)){sex='ensemble';college='ensemble';mode='value';}const out=[];const start=valueOf(data,metric,from,sex,college);for(let y=from;y<=to;y++){const o=valueOf(data,metric,y,sex,college);let value=o?.value??null;if(value!==null&&mode==='index')value=start&&start.value!==0?value/start.value*100:null;if(value!==null&&mode==='real'){const k=priceIndex(data,y,from);value=k===null?null:value/k;}if(mode==='annual'){const prev=valueOf(data,metric,y-1,sex,college);value=o&&prev&&prev.value!==0?(o.value/prev.value-1)*100:null;}out.push({year:y,value,observation:o});}return out;}
export function validateObservation(o:unknown,metrics:Record<string,Metric>):o is Observation{if(!o||typeof o!=='object')return false;const x=o as Observation;return !!metrics[x.metric]&&Number.isInteger(x.year)&&x.year>=1900&&x.year<=2100&&Number.isFinite(x.value)&&Math.abs(x.value)<1e14&&['ensemble','hommes','femmes'].includes(x.sex)&&['ensemble','cadres','maitrise','execution'].includes(x.college)&&Number.isInteger(x.page)&&x.page>=0;}

// Use the published total for each college; the overall ratio is not an average of college ratios.
export function hoursPerEmployee(data:Observation[]):Observation[]{
 return data.filter(o=>o.metric==='heures_travaillees').flatMap(hours=>{
  const headcount=valueOf(data,'effectif_moyen_total',hours.year,hours.sex,hours.college);
  if(!headcount||headcount.value<=0||hours.value<0)return [];
  return [{...hours,metric:'heures_par_salarie',value:hours.value/headcount.value,unit:'heures',
   population:`Tous statuts du bilan · ${hours.value.toLocaleString('fr-FR')} h ÷ ${headcount.value.toLocaleString('fr-FR')} salariés moyens · effectif 114 p. ${headcount.page}. Ratio 311/114 ; périmètre des heures non ventilé par statut.`,
   verified:hours.verified&&headcount.verified,denominatorSource:headcount.source,denominatorPage:headcount.page}];
 });
}

export const statusFamilies:Record<string,Record<string,string>>={
 effectifs:{stat:'effectifs',nonstat:'effectifs_nonstat',total:'effectifs_total'},
 effectif_moyen:{stat:'effectif_moyen',nonstat:'effectif_moyen_nonstat',total:'effectif_moyen_total'},
 remuneration:{stat:'remuneration',nonstat_cdi:'remuneration_nonstat_cdi',nonstat_cdd:'remuneration_nonstat_cdd',total:'remuneration_total'},
 maladie:{stat:'maladie_stat',nonstat_cdi:'maladie_nonstat_cdi',total:'maladie'},
 absence_at:{stat:'absence_at_stat',nonstat_cdi:'absence_at_nonstat_cdi',total:'absence_at'},
 heures_theoriques:{stat:'heures_theoriques',nonstat_cdi:'heures_theoriques_nonstat_cdi'},
};
export const statusNames:Record<string,string>={stat:'Statutaires',nonstat:'Non-statutaires',nonstat_cdi:'Non-statutaires CDI',nonstat_cdd:'Non-statutaires CDD',total:'Tous statuts (périmètre du bilan)'};
export function populationView(data:Dataset,selected:string):Dataset{
 const variants=new Set(Object.entries(statusFamilies).flatMap(([base,family])=>Object.values(family).filter(v=>v!==base)));
 const observations=data.observations.filter(o=>!variants.has(o.metric)&&!statusFamilies[o.metric]);
 for(const [base,family] of Object.entries(statusFamilies)){const id=family[selected];if(id)observations.push(...data.observations.filter(o=>o.metric===id).map(o=>({...o,metric:base})));}
 return {...data,observations,metrics:Object.fromEntries(Object.entries(data.metrics).filter(([id])=>!variants.has(id)).map(([id,m])=>[id,statusFamilies[id]?{...m,label:m.label.replace(/ statutaire(s)?/g,''),description:`${statusNames[selected]||selected} · ${m.description.replace(/Photographie de fin d’année, hors non-statutaires\./,'Photographie de fin d’année.').replace(/Moyenne des effectifs mensuels\./,'Moyenne des effectifs mensuels.').replace(/Femmes et hommes, primes comprises\./,'Femmes et hommes, primes comprises.')}`} :m]))};
}
