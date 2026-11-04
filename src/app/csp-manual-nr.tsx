'use client';
import {useEffect,useState} from 'react';
import {manualNRReasons} from '../lib/csp-manual-nr';
import type {ManualNRPayload,ManualNRReason} from '../lib/csp-manual-nr';
const day=(v:string)=>v?new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z')):'—';
const initial:ManualNRPayload={agentId:'',name:'',effective:'',gf:0,nrBefore:0,reason:'document_indisponible',comment:''};
type Stored=ManualNRPayload&{id:string;created:string;actor:string};
export default function CspManualNR({onSaved}:{onSaved:()=>void}){
 const [entry,setEntry]=useState<ManualNRPayload>({...initial});
 const [confirmed,setConfirmed]=useState(false);
 const [rows,setRows]=useState<Stored[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let alive=true;
  fetch('/api/csp?manual=1',{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b?.error||'Historique indisponible');return b;})
   .then(b=>{if(alive)setRows(Array.isArray(b.entries)?b.entries:[]);})
   .catch(e=>{if(alive)setError(e.message);});
  return()=>{alive=false;};
 },[refresh]);
 const change=(patch:Partial<ManualNRPayload>)=>{setEntry(v=>({...v,...patch}));setConfirmed(false);setNotice('');};
 const valid=entry.agentId.length===6&&entry.name.trim().length>=3&&/^\d{4}-\d{2}-\d{2}$/.test(entry.effective)&&entry.gf>=1&&entry.gf<=30&&entry.nrBefore>=5&&entry.nrBefore<=990&&entry.nrBefore%5===0&&entry.comment.trim().length>=20&&(!entry.arrivalConfirmed||!!entry.arrivalAgency?.trim()&&!!entry.arrivalEffective&&entry.arrivalEffective>=entry.effective)&&confirmed;
 const save=async()=>{
  if(!valid)return;setLoading(true);setError('');setNotice('');
  try{
   const r=await fetch('/api/csp',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'manual-nr',entry,confirmed:true})});
   const b=await r.json().catch(()=>null);
   if(!r.ok)throw Error(b?.error||'Avancement non enregistré.');
   setNotice('Avancement manuel enregistré : NR '+b.from+' → '+b.to+'. La décision est distincte des bordereaux CSP officiels. Reprendre ensuite la validation du mouvement documenté suivant.');
   setEntry({...initial});setConfirmed(false);setRefresh(x=>x+1);onSaved();
  }catch(e){setError((e as Error).message);}finally{setLoading(false);}
 };
 return <section className="panel" aria-label="Avancement NR manuel">
  <div className="panel-heading"><div><h2>Avancement NR manuel</h2>
   <p>Enregistrer un avancement au choix ou une régularisation lorsque le bordereau CSP n’est pas disponible. Fonction générique pour tous les agents, réservée à l’administrateur.</p></div></div>
  <p className="filter-note">L’avancement manuel est identifié séparément d’un ODJ/RD. Il est soumis au contrôle chronologique : aucun gain n’est enregistré si la situation précédente n’est pas confirmée. Un NR gagné correspond à +5 sur sa valeur.</p>
  <div className="csp-editor">
   <label>NNI (6 caractères)<input value={entry.agentId} maxLength={6} placeholder="NNI de l’agent" onChange={e=>change({agentId:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')})}/></label>
   <label>Nom et prénom<input value={entry.name} maxLength={179} onChange={e=>change({name:e.target.value})}/></label>
   <label>Date d’effet<input type="date" value={entry.effective} onChange={e=>change({effective:e.target.value})}/></label>
   <label>GF maintenu<input type="number" min={1} max={30} value={entry.gf||''} onChange={e=>change({gf:Number(e.target.value)})}/></label>
   <label>NR avant<input type="number" min={5} max={990} step={5} value={entry.nrBefore||''} onChange={e=>change({nrBefore:Number(e.target.value)})}/></label>
   <label>NR après (calculé)<input readOnly value={entry.nrBefore?entry.nrBefore+5:''} aria-label="NR après, calculé automatiquement"/></label>
   <label>Motif de l’avancement<select value={entry.reason} onChange={e=>change({reason:e.target.value as ManualNRReason})}>{Object.entries(manualNRReasons).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Observation obligatoire (20 caractères minimum)<textarea value={entry.comment} maxLength={500} rows={3} onChange={e=>change({comment:e.target.value})} placeholder="Expliquer la situation vérifiée et l'absence éventuelle de bordereau."/></label>
  </div>
  <div className="notice"><p><b>Dates indépendantes :</b> l’avancement au choix conserve sa date d’effet du 1er janvier. Si l’agent arrive ensuite dans l’ULM, l’avancement antérieur est repris lors de son arrivée, sans prétendre qu’il était présent dans l’unité dès janvier.</p><label className="check-label"><input type="checkbox" checked={!!entry.arrivalConfirmed} onChange={e=>change({arrivalConfirmed:e.target.checked,arrivalEffective:e.target.checked?(entry.arrivalEffective||''):undefined,arrivalAgency:e.target.checked?(entry.arrivalAgency||''):undefined})}/>Confirmer provisoirement l’arrivée de cet agent dans l’ULM à une autre date (en attente de confirmation du bordereau officiel).</label>{entry.arrivalConfirmed&&<div className="csp-editor"><label>Date réelle d’arrivée dans l’ULM<input type="date" value={entry.arrivalEffective||''} min={entry.effective} onChange={e=>change({arrivalEffective:e.target.value})}/></label><label>Agence d’arrivée<input value={entry.arrivalAgency||''} maxLength={180} onChange={e=>change({arrivalAgency:e.target.value})} placeholder="Agence de destination"/></label></div>}</div>
  <label className="check-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Je confirme le NNI, le GF, le NR de départ, le motif et la date d’effet de l’avancement. Si une arrivée provisoire est indiquée, je confirme sa date distincte, sans valider le bordereau officiel.</label>
  <button type="button" className="btn primary" disabled={loading||!valid} onClick={()=>void save()}>{loading?'Vérification…':'Vérifier la chaîne et enregistrer +1 NR'}</button>
  {error&&<p role="alert" className="notice">{error}</p>}
  {notice&&<p role="status" className="notice">{notice}</p>}
  <details><summary>Historique des avancements manuels ({rows.length})</summary>
   {rows.length?<div className="table-scroll"><table><thead><tr><th>Agent</th><th>Effet</th><th>GF / NR</th><th>Motif</th><th>Enregistrement</th></tr></thead><tbody>
    {rows.map(row=><tr key={row.id}><td>{row.name}</td><td>{day(row.effective)}</td><td>GF {row.gf} · NR {row.nrBefore} → {row.nrBefore+5}</td><td>{manualNRReasons[row.reason]}<small>{row.comment}</small></td><td>{day(row.created.slice(0,10))}<small>{row.actor}</small></td></tr>)}
   </tbody></table></div>:<p>Aucun avancement manuel enregistré.</p>}
  </details>
 </section>;
}
