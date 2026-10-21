import type {Observation} from './model';
// Extract explicit population blocks only; never apportion an unventilated total.
export function extractStatusPages(pages:{page:number;text:string}[],fallbackYear:number):Observation[]{
 const entries=new Map<string,Observation>();let code='',group='',years=[fallbackYear];
 const names:Record<string,string>={'111':'effectifs','114':'effectif_moyen','212':'remuneration','182bis':'heures_theoriques','183':'maladie','185':'absence_at'};
 const add=(metric:string,sex:string,values:(number|null)[],page:number,population:string)=>{
  if(values.length!==years.length*4)return;
  for(let i=0;i<years.length;i++)for(let j=0;j<4;j++){const value=values[i*4+j];if(value===null)continue;const o={metric,sex,year:years[i],college:['cadres','maitrise','execution','ensemble'][j],value,page,population,source:'pending',unit:code==='212'?'euros':['111','114'].includes(code)?'nombre':'heures',verified:false};entries.set([metric,o.year,sex,o.college].join('|'),o);}
 };
 for(const page of pages){const header=page.text.split('\n').find(l=>/ANN[EÉ]E/.test(l));const found=header?.replace(/2\s+(0\d{2})/g,'2$1').match(/20\d{2}/g)?.map(Number);if(found?.length)years=[...new Set(found)].slice(0,3);
 for(const line of page.text.split('\n')){const s=line.trim();const start=s.match(/^(\d{3})(?:\s*(bis))?(?:\s|$)/i);if(start&&!['263','402'].includes(start[1])){code=start[1]+(start[2]?'bis':'');group='';}if(!names[code])continue;
 const prefix=s.split(/\s{2,}/)[0];const values=s.split(/\s{2,}/).slice(1).map(v=>{const z=v.replace(/[\s%]/g,'').replace(',','.');return /^-?\d+(\.\d+)?$/.test(z)?Number(z):null;});
 const status=prefix.match(/^(?:SALARIES|TOTAL(?: SALARIES)?) (NON )?STATUTAIRES(?: (CDI|CDD))?( AUTRES)?$/i);
 if(status)group=status[1]?(status[2]||'NON')+(status[3]?'_AUTRES':''):'STAT';
 if(/^EFFECTIF TOTAL/.test(prefix)&&['111','114'].includes(code)){group='TOTAL';add(names[code]+'_total',/HOMMES/.test(prefix)?'hommes':/FEMMES/.test(prefix)?'femmes':'ensemble',values,page.page,'Tous statuts : total publié (111/114)');continue;}
 if(code==='212'&&/^(TOTAL|Hommes et Femmes)$/i.test(prefix)){group='TOTAL';add('remuneration_total','ensemble',values,page.page,'Tous statuts : moyenne publiée, aucune moyenne de moyennes');continue;}
 if(code==='212'&&prefix==='TOTAL HOMMES ET FEMMES'){group='TOTAL';continue;}
 const sex=/^Hommes$/i.test(prefix)?'hommes':/^Femmes$/i.test(prefix)?'femmes':status?'ensemble':null;
 if(!sex||!group||group==='TOTAL'&&code!=='212')continue;
 const suffix=group==='STAT'?'stat':group==='TOTAL'?'total':'nonstat_'+group.toLowerCase();
 add(names[code]+'_'+suffix,sex,values,page.page,group==='STAT'?'Statutaires : bloc explicite du bilan':group==='TOTAL'?'Tous statuts : moyenne publiée':'Non-statutaires '+group.replace('_',' ')+' : bloc explicite du bilan');
 }}
 // Combine only disjoint sex blocks when the source has no combined row.
 for(const o of [...entries.values()].filter(o=>o.sex==='hommes'&&!o.metric.startsWith('remuneration'))){const f=entries.get([o.metric,o.year,'femmes',o.college].join('|'));const k=[o.metric,o.year,'ensemble',o.college].join('|');if(f&&!entries.has(k))entries.set(k,{...o,sex:'ensemble',value:o.value+f.value,population:o.population+' ; hommes + femmes'});}
 // CDI and CDD totals in headcount tables include the AUTRES lines already.
 for(const base of ['effectifs','effectif_moyen'])for(const o of [...entries.values()].filter(o=>o.metric===base+'_nonstat_cdi')){const cdd=entries.get([base+'_nonstat_cdd',o.year,o.sex,o.college].join('|'));if(cdd){const combined={...o,metric:base+'_nonstat',value:o.value+cdd.value,population:'Non-statutaires : totaux CDI + CDD publiés (y compris AUTRES)'};entries.set([combined.metric,o.year,o.sex,o.college].join('|'),combined);}}
 return [...entries.values()].filter(o=>!o.metric.endsWith('_autres')&&!['effectifs_stat','effectif_moyen_stat','remuneration_stat','heures_theoriques_stat','effectifs_nonstat_cdi','effectifs_nonstat_cdd','effectif_moyen_nonstat_cdi','effectif_moyen_nonstat_cdd'].includes(o.metric));
}
