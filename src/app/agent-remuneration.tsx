'use client';
import {useEffect,useState} from 'react';
import {hourlyRates} from '../lib/agent-hourly';

const money=(cents:number|null)=>cents===null?'Non disponible':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);
const rate=(value:number|null)=>value===null?'Non disponible':new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+' €/h';
const date=(value:string)=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));

export default function AgentRemuneration({agentId,source,grid,bonus,residence}:{agentId:string;source:string;grid:string;bonus:string;residence:string}){
 const [data,setData]=useState<any>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  setData(null);setError('');const controller=new AbortController();
  const query=new URLSearchParams({view:'payroll',source,agent:agentId,grid,bonus,residence});
  fetch('/api/agents?'+query,{signal:controller.signal}).then(async response=>{const result:any=await response.json();if(!response.ok)throw Error(result.error||'Chargement impossible.');return result;}).then(setData).catch(error=>{if(error.name!=='AbortError')setError(error.message);});
  return()=>controller.abort();
 },[agentId,source,grid,bonus,residence]);
 if(!data)return <section className="panel"><h2>Rémunération estimée</h2><p role="status">{error||'Chargement des éléments de rémunération…'}</p></section>;
 const row=data.row;
 if(!row)return <section className="panel"><h2>Rémunération estimée</h2><p>Aucune situation calculable dans cette photographie.</p></section>;
 const monthly=row.monthlyCents;
 const annual=monthly===null?null:monthly*13;
 const annualBonus=row.annualBonusCents;
 const hourly=hourlyRates([row]);
 const items:[string,string][]=[
  ['Brut mensuel hors primes',money(monthly)],
  ['Brut annuel hors primes · 13 mois',money(annual)],
  ['Mois supplémentaire inclus dans le brut annuel',money(monthly)],
  ['Primes annuelles RPC / RPEM estimées · moyenne du GF',money(annualBonus)],
  ['Brut annuel avec primes · 13 mois',money(annual===null||annualBonus===null?null:annual+annualBonus)],
  ['Taux horaire hors primes',rate(hourly.withoutBonuses)],
  ['Équivalent horaire avec primes',rate(hourly.withBonuses)],
 ];
 const download=()=>{
  const lines=[['Élément','Valeur'],...items,['GF',row.gf??'Non renseigné'],['NR',row.nr??'Non renseigné'],['Échelon estimé',row.level??'Non calculable'],['Date de situation',data.referenceDate],['Date de grille',data.gridDate],['Référence grille',data.gridId],['Référence primes',data.bonusId],['Coefficient résidentiel',row.residence],['Majoration provisoire',row.residenceProvisional?'Oui':'Non'],['Méthode ancienneté',row.method],['Motif exclusion',row.reason||'']];
  const url=URL.createObjectURL(new Blob(['\ufeff'+lines.map(line=>line.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='remuneration-'+agentId+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
 };
 return <section className="panel"><div className="panel-heading"><div><h2>Rémunération estimée</h2><p>Situation au {date(data.referenceDate)} · grille du {date(data.gridDate)} · calcul annuel sur 13 mois.</p></div><button className="btn" onClick={download}>Exporter la rémunération</button></div>
  {row.reason&&<div className="notice">Calcul du salaire indisponible : {row.reason}.</div>}
  <div className="agent-detail-grid">{items.map(([label,value])=><div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
  <p>GF {row.gf??'non renseigné'} · NR {row.nr??'non renseigné'} · échelon estimé {row.level??'non calculable'} · ancienneté retenue : {typeof row.years==='number'?new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(row.years)+' ans':'non calculable'}.</p>
  <p>Majoration résidentielle : {new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format((Number(row.residence)-1)*100)} %{row.residenceProvisional?' (provisoire pour cette agence)':''}. Primes : référence {data.bonusReferenceYear}, moyennes RPC / RPEM par GF. {annualBonus===null?'Prime inconnue : le montant avec primes ne peut pas être chiffré.':''}</p>
  <p className="gap-method">Estimation à temps plein, au NR et à l’échelon de la photographie. L’échelon est déduit de l’ancienneté ({row.method}) et ne tient pas compte des évolutions postérieures au fichier. Les références de grille et de primes sont celles sélectionnées dans « Masse salariale ». La date de calcul de carrière de la fiche ne modifie pas cette estimation.</p>
  <p className="gap-method">Taux horaire hors primes = brut mensuel ÷ 151,6667 h, sans 13ᵉ mois. Équivalent avec primes = (brut mensuel + primes annuelles ÷ 12) ÷ 151,6667 h ; cet équivalent n’est pas un taux de paie. JDD, PVPA, autres primes, heures supplémentaires, indemnités et cotisations patronales sont exclus.</p>
 </section>;
}
