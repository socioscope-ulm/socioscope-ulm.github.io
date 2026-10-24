'use client';
import {useEffect,useState} from 'react';
import {hourlyRates} from '../lib/agent-hourly';

const money=(cents:number|null|undefined)=>cents==null||!Number.isFinite(cents)?'Non calculable':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);
const rate=(value:number|null|undefined)=>value==null||!Number.isFinite(value)?'Non calculable':new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+' €/h';
const date=(value?:string)=>value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'non renseignée';
const pct=(value:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(value);
const csvCell=(value:unknown)=>'"'+String(value??'').replaceAll('"','""')+'"';

type Summary={label:string;gross:number|null;net:number|null;afterTax:number|null};
export default function AgentRemuneration({agentId,source,grid,bonus,residence}:{agentId:string;source:string;grid:string;bonus:string;residence:string}){
 const [data,setData]=useState<any>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [retry,setRetry]=useState(0);
 const [months,setMonths]=useState(13);
 const [contrib,setContrib]=useState(21);
 const [pas,setPas]=useState(0);
 const [pasCustom,setPasCustom]=useState(false);
 const pasOptions=[0,2,5,8,10,12.1,12.3,15,20,25,30];
 useEffect(()=>{
  let active=true;
  const controller=new AbortController();
  setData(null);setError('');setLoading(true);
  const load=async()=>{
   // Une erreur 546/503 transitoire ne doit pas laisser la fiche bloquée en chargement.
   const query=new URLSearchParams({view:'payroll',source,agent:agentId,grid,bonus,residence});
   for(let attempt=0;attempt<2;attempt++){
    try{
     const response=await fetch('/api/agents?'+query,{signal:controller.signal,cache:'no-store'});
     const result:any=await response.json().catch(()=>null);
     if(!response.ok){
      const message=result?.error||'Service indisponible (code '+response.status+').';
      if(attempt===0&&[500,502,503,504,546].includes(response.status))continue;
      throw Error(message);
     }
     if(!result||!('row' in result))throw Error('Réponse de rémunération incomplète.');
     if(active)setData(result);
     return;
    }catch(e){
     if(controller.signal.aborted)return;
     if(attempt===1||!(e instanceof TypeError)){if(active)setError((e as Error).message);return;}
    }
   }
  };
  void load().finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[agentId,source,grid,bonus,residence,retry]);
 const row=data?.row;
 const monthly=typeof row?.monthlyCents==='number'&&Number.isFinite(row.monthlyCents)?row.monthlyCents:null;
 const bonusAnnual=typeof row?.annualBonusCents==='number'&&Number.isFinite(row.annualBonusCents)?row.annualBonusCents:null;
 const annualBase=monthly===null?null:monthly*months;
 const annualWith=annualBase===null||bonusAnnual===null?null:annualBase+bonusAnnual;
 const monthlyWith=annualWith===null?null:annualWith/12;
 const afterContrib=(brut:number|null)=>brut===null?null:brut*(1-contrib/100);
 const afterPas=(brut:number|null)=>{const net=afterContrib(brut);return net===null?null:net*(1-pas/100);};
 const summaries:Summary[]=[
  {label:'Mensuel · sans primes',gross:monthly,net:afterContrib(monthly),afterTax:afterPas(monthly)},
  {label:'Mensuel · avec primes',gross:monthlyWith,net:afterContrib(monthlyWith),afterTax:afterPas(monthlyWith)},
  {label:'Annuel · sans primes',gross:annualBase,net:afterContrib(annualBase),afterTax:afterPas(annualBase)},
  {label:'Annuel · avec primes',gross:annualWith,net:afterContrib(annualWith),afterTax:afterPas(annualWith)}
 ];
 const hourly=row?hourlyRates([row],months):null;
 const primeItems:[string,number|null|undefined][]=[
  ['RPC / RPEM · annuel',row?.rpcRpemBonusCents],
  ['PVPA · annuel',row?.pvpaBonusCents],
  ['Engagement · mensuel (3,5 %, cadres)',row?.engagementMonthlyCents],
  ['Engagement · annuel (12 mois)',row?.engagementAnnualCents],
  ['Autonomie · mensuel (4 %, cadres)',row?.autonomieMonthlyCents],
  ['Autonomie · annuel (12 mois)',row?.autonomieAnnualCents],
  ['Total des primes annuelles',bonusAnnual],
 ];
 const exportRows:unknown[][]=[
  ['Rubrique','Montant (EUR)','Unité'],
  ...summaries.flatMap(item=>[
   [item.label+' · Brut',item.gross===null?'':(item.gross/100).toFixed(2),item.label.startsWith('Mensuel')?'Mensuel':'Annuel'],
   [item.label+' · Net avant impôt estimé',item.net===null?'':(item.net/100).toFixed(2),item.label.startsWith('Mensuel')?'Mensuel':'Annuel'],
   [item.label+' · Net après impôt estimé',item.afterTax===null?'':(item.afterTax/100).toFixed(2),item.label.startsWith('Mensuel')?'Mensuel':'Annuel']
  ]),
  ...primeItems.map(([label,value])=>[label,typeof value==='number'?(value/100).toFixed(2):'','Prime']),
  ['Taux de cotisations estimées',contrib,'Pourcentage'],
  ['Taux PAS estimé',pas,'Pourcentage'],
  ['Taux horaire hors primes',hourly?.withoutBonuses??'','EUR/h'],
  ['Équivalent horaire avec primes',hourly?.withBonuses??'','EUR/h'],
  ['GF',row?.gf??'',''],
  ['NR',row?.nr??'',''],
  ['Échelon estimé',row?.level??'',''],
  ['Date de situation',data?.referenceDate??'',''],
  ['Date de grille',data?.gridDate??'',''],
  ['Référence grille',data?.gridId??'',''],
  ['Référence primes',data?.bonusId??'',''],
  ['Coefficient résidentiel',row?.residence??'',''],
  ['Majoration provisoire',row?.residenceProvisional?'Oui':'Non',''],
  ['Méthode ancienneté',row?.method??'',''],
  ['Motif exclusion',row?.reason??'','']
 ];
 const download=()=>{
  if(!row)return;
  const file='remuneration-'+String(agentId).replace(/[^a-zA-Z0-9_-]/g,'_')+'.csv';
  const url=URL.createObjectURL(new Blob(['\ufeff'+exportRows.map(line=>line.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
 };
 const amount=(label:string,centimes:number|null)=><div className="panel" style={{padding:12}}><small>{label}</small><strong style={{display:'block',fontSize:19}}>{money(centimes)}</strong></div>;
 if(!data)return <section className="panel"><h2>Rémunération estimée</h2><p role={error?'alert':'status'}>{error||'Chargement des éléments de rémunération…'}</p>{error&&<button className="btn" disabled={loading} onClick={()=>setRetry(v=>v+1)}>Réessayer le calcul</button>}</section>;
 if(!row)return <section className="panel"><h2>Rémunération estimée</h2><p>Aucune situation salariale calculable dans la photographie retenue. Vérifier le fichier de situation et les références sélectionnées.</p><button className="btn" onClick={()=>setRetry(v=>v+1)}>Actualiser</button></section>;
 return <section className="panel" style={{display:'grid',gap:16}}>
  <div className="panel-heading"><div><h2>Rémunération estimée</h2><p>Situation au {date(data.referenceDate)} · grille du {date(data.gridDate)} · simulation individuelle basée sur les mêmes hypothèses que le simulateur de paie.</p></div><button className="btn" onClick={download}>Exporter la rémunération (CSV)</button></div>
  {row.reason&&<div className="notice" role="status">Salaire indisponible : {row.reason}. Les montants impossibles à calculer ne sont pas remplacés par zéro.</div>}
  <div className="analysis-options">
   <label>Annualisation<select value={months} onChange={e=>setMonths(Number(e.target.value))}><option value={12}>12 mois</option><option value={13}>13 mois</option></select></label>
   <label>Cotisations estimées (%)<input type="number" min={0} max={70} step={0.1} value={contrib} onChange={e=>setContrib(Math.max(0,Math.min(70,Number(e.target.value)||0)))}/></label>
   <label>Taux de PAS<select value={pasCustom?'custom':String(pas)} onChange={e=>{if(e.target.value==='custom'){setPasCustom(true);}else{setPasCustom(false);setPas(Number(e.target.value));}}}>{pasOptions.map(t=><option value={String(t)} key={t}>{pct(t)} %</option>)}<option value="custom">Taux personnalisé</option></select></label>
   {pasCustom&&<label>Mon taux de PAS (%)<input type="number" min={0} max={60} step={0.1} value={pas} onChange={e=>setPas(Math.max(0,Math.min(60,Number(e.target.value)||0)))}/></label>}
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:14}}>
   {summaries.map(item=><div className="panel" key={item.label} style={{display:'grid',gap:9,padding:12}}>
    <h3>{item.label}</h3>
    {amount('Brut de base'+(item.label.includes('avec')?' avec primes':''),item.gross)}
    {amount('Net avant impôt',item.net)}
    {amount('Net après impôt',item.afterTax)}
   </div>)}
  </div>
  <p className="muted">Les nets sont des estimations : taux de cotisations et PAS ajustables, appliqués de manière simplifiée. Les montants mensuels avec primes sont des moyennes sur 12 mois ; les primes engagement et autonomie sont calculées sur 12 mois même lorsque le brut de base est annualisé sur 13 mois.</p>
  <div><h3>Détail des primes</h3><div className="agent-detail-grid">{primeItems.map(([label,value])=><div key={label}><small>{label}</small><b>{money(value)}</b></div>)}</div></div>
  <div><h3>Compléments du calcul</h3><div className="agent-detail-grid"><div><small>Taux horaire hors primes</small><b>{rate(hourly?.withoutBonuses)}</b></div><div><small>Équivalent horaire avec primes</small><b>{rate(hourly?.withBonuses)}</b></div></div></div>
  <p>GF {row.gf??'non renseigné'} · NR {row.nr??'non renseigné'} · échelon estimé {row.level??'non calculable'} · ancienneté retenue : {typeof row.years==='number'?new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(row.years)+' ans':'non calculable'} · majoration résidentielle : {pct((Number(row.residence)-1)*100)} %.</p>
  <p className="gap-method">RPC / RPEM selon la référence {data.bonusReferenceYear} ; PVPA selon le GF lorsqu'éligible. Les primes fixes cadres engagement (3,5 %) et autonomie (4 %) sont calculées sur le brut mensuel de base, pour 12 versements. Les remboursements de frais ne sont pas ajoutés. Les hypothèses sont des simulations et non des bulletins de paie.</p>
 </section>;
}
