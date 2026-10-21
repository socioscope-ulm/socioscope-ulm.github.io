'use client';
import {useState} from 'react';
import {Download} from 'lucide-react';
const rate=(v:number|null)=>v===null?'Non disponible':new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+' €/h';
const choices=[['families','Famille métier / rattachement'],['colleges','Collège'],['gfs','GF'],['m3eGroups','Plage M3E'],['agencies','Agence']];
export default function HourlySummary({data,months}:{data:any;months:number}){
 const [group,setGroup]=useState('families');
 const overall=data['hourly'+months];if(!overall)return null;
 const rows=data[group]||[];
 const download=()=>{
  const lines=[['Groupe','Base horaire annuelle de paie','Mois de référence du taux horaire','Taux horaire brut estimé hors primes EUR','Agents hors primes','Taux horaire brut estimé avec primes EUR','Agents avec primes connues','Primes inconnues','Agents exclus','Date photographie','Date grille','Référence primes','Majoration résidentielle'],...rows.map((r:any)=>{const h=r['hourly'+months];return [r.label,h.hours,h.months,h.withoutBonuses,h.covered,h.withBonuses,h.bonusCovered,h.bonusUnknown,h.excluded,data.referenceDate,data.gridDate,data.bonusId,'AMT Centre 24 % ; autres agences 24,5 %'];})];
  const url=URL.createObjectURL(new Blob(['\ufeff'+lines.map(row=>row.map((v:any)=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='taux-horaires-estimes.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
 };
 return <section className="panel"><div className="panel-heading"><div><div className="eyebrow">BASE DE PAIE · 151,6667 HEURES PAR MOIS</div><h2>Taux horaires bruts estimés</h2><p>Salaire brut mensuel hors primes divisé par 151,6667 heures, sans 13ᵉ mois.</p></div><button className="btn" onClick={download}><Download size={15}/>Exporter les taux horaires</button></div>
  <div className="kpi-grid"><section className="kpi"><div className="kpi-title">Moyenne hors primes</div><div className="kpi-value">{rate(overall.withoutBonuses)}</div><small>{overall.covered} agents calculables</small></section><section className="kpi"><div className="kpi-title">Équivalent moyen avec primes RPC / RPEM</div><div className="kpi-value">{rate(overall.withBonuses)}</div><small>{overall.bonusCovered} agents avec prime connue</small></section></div>
  <div className="analysis-options"><label>Comparer par<select value={group} onChange={e=>setGroup(e.target.value)}>{choices.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
  <div className="table-scroll"><table><thead><tr><th>Population</th><th>Hors primes · €/h</th><th>Agents calculés</th><th>Équivalent avec primes · €/h</th><th>Agents avec prime connue</th><th>Primes inconnues</th></tr></thead><tbody>{rows.map((r:any)=>{const h=r['hourly'+months];return <tr key={r.label}><td>{r.label}</td><td>{rate(h.withoutBonuses)}</td><td>{h.covered} / {r.agents}</td><td>{rate(h.withBonuses)}</td><td>{h.bonusCovered} / {r.agents}</td><td>{h.bonusUnknown}</td></tr>;})}</tbody></table></div>
  <p>Hors primes : salaire mensuel estimé ÷ (35 × 52 ÷ 12). Équivalent avec primes : (salaire mensuel estimé + prime annuelle moyenne RPC / RPEM du GF ÷ 12) ÷ (35 × 52 ÷ 12). Les moyennes portent sur les agents calculables, sans compter deux fois les situations.</p>
  <p>Le taux horaire hors primes utilise la base de paie à temps plein, soit 151,6667 h/mois (1 820 h/an). Il est indépendant de l’annualisation choisie pour la masse salariale. L’équivalent avec primes est un indicateur estimé incluant les seules primes RPC / RPEM lissées sur 12 mois ; il ne constitue pas un taux horaire de paie. Les calculs mensuels et annuels de rémunération restent inchangés.</p>
  <p>Les hypothèses de rémunération restent celles affichées ci-dessus : temps plein, grille sélectionnée et majoration résidentielle par agence (AMT Centre 24 %, AMT Est et Sud-Ouest 24,5 %, autres agences 24,5 % provisoirement), échelon estimé et seules primes RPC / RPEM. Les temps partiels et forfaits jours ne sont pas reconstitués individuellement. Les primes inconnues sont exclues de la moyenne avec primes ; les deux moyennes peuvent donc porter sur des populations différentes.</p>
 </section>;
}
