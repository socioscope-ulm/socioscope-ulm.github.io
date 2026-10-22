// Preserve the dedicated Remunerations page; avoid duplicating its
// salary / inflation / INSEE / SNB charts in Parcours & egalite.
type MetricLabel={label?:string;theme?:string};
export function parcoursMetricVisible(id:string,metric:MetricLabel):boolean{
 const key=id.toLowerCase();
 const label=String(metric?.label||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const duplicatedSalary=key==='remuneration'||/^remuneration_(?:total|stat|nonstat(?:_cdi|_cdd)?)$/.test(key)||
   /^remuneration moyenne(?:\b|\s|$)/.test(label);
 const priceOrInsee=key==='inflation'||key==='insee'||key.startsWith('inflation_')||
   key.startsWith('insee_')||/\b(?:inflation|insee)\b/.test(label);
 const snb=key==='snb'||key.startsWith('snb_')||/\b(?:revalorisation\s+(?:du\s+)?snb|snb)\b/.test(label);
 const staffing=key==='effectifs'||key==='effectif_moyen'||key==='effectifs_moyens'||key==='effectif_moyen_mensuel'||key==='effectifs_moyens_mensuels'||key==='effectif_31_12'||key==='effectifs_31_12'||key==='effectifs_au_31_12'||/effectifs?\s+moyens?\s+mensuels?/.test(label)||/effectifs?\s+au\s+31\s*(?:\/|\-|\s)\s*12/.test(label);
 return !duplicatedSalary&&!priceOrInsee&&!snb&&!staffing;
}
