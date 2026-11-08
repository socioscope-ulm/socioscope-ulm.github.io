'use client';
import {useEffect,useState} from 'react';
import {AlertTriangle,ChevronRight} from 'lucide-react';
import type {CspAlert} from '../lib/csp-alerts';

const day=(value:string)=>value?new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'Non renseignée';
const kinds:Record<string,string>={mutation:'Mutation d’office',mesure:'Mesure salariale',avancement:'Avancement',reclassement:'Reclassement',nomination:'Nomination',admission:'Admission au stage',titularisation:'Titularisation',posthume:'Avancement à titre posthume'};

export default function CspAlerts({revision,onOpen}:{revision:number;onOpen:(importId:string,eventId:string)=>void}){
 const [alerts,setAlerts]=useState<CspAlert[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError('');
  fetch('/api/agents?view=csp-alerts',{signal:controller.signal,cache:'no-store'})
   .then(async response=>{
    const body=await response.json().catch(()=>null);
    if(!response.ok)throw Error(body?.error||'Impossible de charger les anomalies CSP.');
    if(!Array.isArray(body?.alerts))throw Error('Réponse des anomalies CSP invalide.');
    return body.alerts as CspAlert[];
   })
   .then(value=>{if(!controller.signal.aborted)setAlerts(value);})
   .catch(cause=>{if(!controller.signal.aborted)setError(cause.message||'Service indisponible.');})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[revision,refresh]);
 const application=alerts.filter(item=>item.category==='application').length;
 const verification=alerts.length-application;
 return <details className="document-folder csp-subsection" aria-label="Alertes et anomalies CSP">
  <summary><ChevronRight size={16} className="folder-chevron"/><AlertTriangle size={20}/><strong>Alertes et anomalies CSP</strong><span className="badge">{loading?'Chargement…':error?'À vérifier':alerts.length?alerts.length+' signalement(s)':'Aucune alerte'}</span></summary>
  <div className="document-folder-content"><section className="panel">
  <div className="panel-heading"><div><h2>Contrôles à traiter</h2>
   <p>Repérer les mouvements qui bloquent les situations actualisées, retrouver le bordereau et vérifier la décision en autonomie.</p>
  </div><button type="button" className="btn" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>Actualiser les contrôles</button></div>
  {loading?<p role="status">Recherche des incohérences CSP…</p>:error?<p className="notice" role="alert">{error} Réessayer avec « Actualiser les contrôles ».</p>:!alerts.length?<p role="status">Aucune anomalie d’application ni décision CSP signalée en attente de justificatif.</p>:<>
   <p role="status"><b>{application}</b> blocage(s) dans les situations actualisées · <b>{verification}</b> décision(s) en attente de contrôle documentaire.</p>
   <div className="table-scroll"><table><thead><tr><th>Agent et état</th><th>Mouvement</th><th>Document et page</th><th>Cause et vérification attendue</th><th>Actions</th></tr></thead><tbody>
   {alerts.map(alert=><tr key={alert.id}>
    <td><b>{alert.name}</b><small>{alert.category==='application'?'Application impossible':'À vérifier avant validation'}</small></td>
    <td><b>{kinds[alert.kind]||alert.kind}</b><small>Effet au {day(alert.effective)}</small>
     {(alert.gfBefore!==undefined||alert.nrBefore!==undefined)&&<small>Référence GF {alert.gfBefore??'?'} · NR {alert.nrBefore??'?'}</small>}
     {(alert.gfAfter!==undefined||alert.nrAfter!==undefined)&&<small>Après GF {alert.gfAfter??'?'} · NR {alert.nrAfter??'?'}</small>}
    </td>
    <td>{alert.documentType==='cr'?'ODJ':'RD'} du {day(alert.documentDate)}<small>{alert.documentName}</small><small>Page {alert.page}</small></td>
    <td><p>{alert.reason}</p>{alert.missingNRFrom!==undefined&&alert.missingNRTo!==undefined&&<p><b>Justificatif manquant : NR {alert.missingNRFrom} → {alert.missingNRTo}.</b> Ce passage est à rechercher dans une décision officielle, sans le créer automatiquement.</p>}</td>
    <td><div className="csp-record-actions">
     <button type="button" className="btn primary" onClick={()=>onOpen(alert.importId,alert.eventId)}>Voir la décision</button>
     <a className="btn" href={'/api/agents/files/'+encodeURIComponent(alert.importId)+'#page='+alert.page} target="_blank" rel="noreferrer">PDF · page {alert.page}</a>
    </div></td>
   </tr>)}
   </tbody></table></div>
   <p className="filter-note">Les décisions en attente ne sont pas validées automatiquement. Une anomalie documentaire et un blocage de projection peuvent concerner le même agent, mais exigent des vérifications distinctes.</p>
  </>}
 </section></div>
 </details>;
}
