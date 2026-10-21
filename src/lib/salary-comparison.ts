import type {Observation} from './model';

// Each series uses its published scope. Never average college means or fill gaps.
export function salaryComparison(observations:Observation[],from:number,to:number,sex='ensemble',college='ensemble'){
 const find=(metric:string,year:number,s=sex,c=college)=>observations.find(o=>o.metric===metric&&o.year===year&&o.sex===s&&o.college===c);
 return Array.from({length:Math.max(0,to-from+1)},(_,i)=>{
  const year=from+i;
  const current=find('remuneration',year),previous=find('remuneration',year-1);
  const inflationSource=find('inflation',year,'ensemble','ensemble');
  const snbSource=find('snb',year,'ensemble','ensemble');
  return {year,salary:current&&previous&&current.value>0&&previous.value>0?(current.value/previous.value-1)*100:null,
   inflation:inflationSource?.value??null,snb:snbSource?.value??null,current,previous,inflationSource,snbSource};
 });
}
