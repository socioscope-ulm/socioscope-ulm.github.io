// Preserve the dedicated Remunerations page; avoid duplicating its
// salary / inflation / INSEE charts in Parcours & egalite.
type MetricLabel={label?:string;theme?:string};
export function parcoursMetricVisible(id:string,metric:MetricLabel):boolean{
 const key=id.toLowerCase();
 const label=String(metric?.label||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const duplicatedSalary=key==='remuneration'||/^remuneration_(?:total|stat|nonstat(?:_cdi|_cdd)?)$/.test(key)||
   /^remuneration moyenne(?:\b|\s|$)/.test(label);
 const priceOrInsee=key==='inflation'||key==='insee'||key.startsWith('inflation_')||
   key.startsWith('insee_')||/\b(?:inflation|insee)\b/.test(label);
 return !duplicatedSalary&&!priceOrInsee;
}
