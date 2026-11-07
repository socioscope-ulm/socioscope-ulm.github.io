'use client';
import {useEffect,useMemo,useState} from 'react';
import {Download,RefreshCw,FileText} from 'lucide-react';
import {calculateQuarterlyReport,isCadresDocument,kindLabels} from '../lib/csp-quarterly-report';
import type {QuarterlyDocument,QuarterlyReport,QuarterlyEvent} from '../lib/csp-quarterly-report';
type ImportMeta={id:string;name:string;date:string;status:string;documentType:'cr'|'rd';perEventValidation?:boolean};
const fr=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
const current=new Date();
export default function CspQuarterlyReport({revision=0}:{revision?:number}){
 const [year,setYear]=useState(current.getFullYear());
 const [quarter,setQuarter]=useState(Math.ceil((current.getMonth()+1)/3));
 const [includeCandidates,setIncludeCandidates]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [report,setReport]=useState<QuarterlyReport|null>(null);
 const [loadRevision,setLoadRevision]=useState(0);
 useEffect(()=>{setReport(null);setError('');},[year,quarter,revision]);
 const grouped=useMemo(()=>Object.entries(kindLabels).map(([kind,label])=>({
  kind,label,count:report?.rows.filter(r=>r.kind===kind).length||0
 })).filter(x=>x.count),[report]);
 async function prepare(){
  setBusy(true);setError('');setReport(null);
  try{
   const listing=await fetch('/api/csp',{cache:'no-store'});
   const body=await listing.json();
   if(!listing.ok)throw Error(body.error||'Liste CSP indisponible');
   const first=year+'-'+String((quarter-1)*3+1).padStart(2,'0')+'-01';
   const next=quarter===4?(year+1)+'-01-01':year+'-'+String(quarter*3+1).padStart(2,'0')+'-01';
   const metas=(body.imports||[] as ImportMeta[])
    .filter((m:ImportMeta)=>isCadresDocument(m.name)&&m.date>=first&&m.date<next)
    .sort((a:ImportMeta,b:ImportMeta)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'fr'));
   if(metas.length>45)throw Error('Trop de documents pour ce trimestre : traitement interrompu par sécurité.');
   const docs:QuarterlyDocument[]=[];
   // Sequential reads avoid a burst of expensive CSP queries on the Edge Function.
   for(const meta of metas){
    const response=await fetch('/api/csp?id='+encodeURIComponent(meta.id),{cache:'no-store'});
    const detail=await response.json();
    if(!response.ok)throw Error(detail.error||'Impossible de lire '+meta.name);
    docs.push({id:meta.id,name:meta.name,date:meta.date,status:meta.status,
      documentType:meta.documentType,perEventValidation:!!meta.perEventValidation,
      events:(detail.events||[]) as QuarterlyEvent[]});
   }
   const nextReport=calculateQuarterlyReport(docs,year,quarter);
   setReport(nextReport);setLoadRevision(v=>v+1);
  }catch(ex){setError(ex instanceof Error?ex.message:'Impossible de préparer le compte rendu.');}
  finally{setBusy(false);}
 }
 async function exportPpt(){
  if(!report||!report.sources.length)return;
  setBusy(true);setError('');
  try{
   const {downloadQuarterlyPpt}=await import('../lib/csp-quarterly-ppt');
   await downloadQuarterlyPpt(report,includeCandidates);
  }catch(ex){setError(ex instanceof Error?ex.message:"L'export PowerPoint a échoué.");}
  finally{setBusy(false);}
 }
 return <section className="panel" aria-label="Générateur de comptes rendus CSP cadres">
  <div className="panel-heading"><div><h2>Comptes rendus trimestriels CSP cadres</h2>
   <p>Générer un PowerPoint de la CSP cadres (Métiers de la PI et de la DOAAT), avec une ligne par mouvement et de vrais tableaux modifiables. Aucune incidence sur les validations CSP.</p>
  </div></div>
  <div className="analysis-options">
   <label>Année<select aria-label="Année du compte rendu" value={year} onChange={e=>setYear(Number(e.target.value))}>
    {Array.from({length:8},(_,i)=>2024+i).map(y=><option key={y} value={y}>{y}</option>)}
   </select></label>
   <label>Trimestre<select aria-label="Trimestre du compte rendu" value={quarter} onChange={e=>setQuarter(Number(e.target.value))}>
    <option value={1}>T1 · Janvier à mars</option><option value={2}>T2 · Avril à juin</option>
    <option value={3}>T3 · Juillet à septembre</option><option value={4}>T4 · Octobre à décembre</option>
   </select></label>
   <button className="btn" disabled={busy} onClick={()=>void prepare()}>
    <RefreshCw size={15}/> {busy?'Traitement en cours…':'Préparer le compte rendu'}
   </button>
  </div>
  <label className="check-label"><input type="checkbox" checked={includeCandidates} onChange={e=>setIncludeCandidates(e.target.checked)}/>
   Inclure les candidatures non retenues dans une rubrique distincte</label>
  {error&&<p className="notice" role="alert">{error}</p>}
  {!report&&!busy&&<p className="filter-note">Sélectionner une période, puis préparer le rapport. Les données ne sont chargées que sur demande pour limiter la consommation Supabase.</p>}
  {report&&<>
   <div className="kpi-grid">
    <div className="kpi"><span>Documents CSP cadres</span><strong>{report.sources.length}</strong></div>
    <div className="kpi"><span>Séances distinctes</span><strong>{report.meetingDates.length}</strong></div>
    <div className="kpi"><span>Mouvements</span><strong>{report.rows.length}</strong></div>
    <div className="kpi"><span>Candidatures non retenues</span><strong>{report.candidates.length}</strong></div>
   </div>
   {report.alerts.length>0&&<div className="notice"><b>Points de vigilance</b>
    <ul>{report.alerts.map((msg,i)=><li key={i}>{msg}</li>)}</ul></div>}
   {!!grouped.length&&<div className="table-scroll"><table><thead><tr><th>Rubrique</th><th>Mouvements</th></tr></thead>
    <tbody>{grouped.map(x=><tr key={x.kind}><td>{x.label}</td><td>{x.count}</td></tr>)}</tbody></table></div>}
   {!!report.rows.length&&<details><summary>Aperçu des mouvements ({report.rows.length})</summary>
    <div className="table-scroll"><table><thead><tr><th>Agent</th><th>Décision</th><th>CSP</th><th>Date d’effet</th><th>GF avant / après</th><th>NR avant / après</th><th>Source</th></tr></thead>
     <tbody>{report.rows.slice(0,80).map((r,i)=><tr key={r.id+i}><td>{r.name}</td><td>{kindLabels[r.kind]}</td><td>{fr(r.meeting)}</td><td>{fr(r.effective)}</td><td>{r.gfBefore} / {r.gfAfter}</td><td>{r.nrBefore} / {r.nrAfter}</td><td>{r.source}</td></tr>)}</tbody>
    </table></div>{report.rows.length>80&&<p>Affichage limité aux 80 premières lignes. Le PowerPoint contient toutes les lignes.</p>}
   </details>}
   <div className="analysis-options">
    <button className="btn primary" disabled={busy||!report.sources.length} onClick={()=>void exportPpt()}>
     <Download size={16}/> {busy?'Génération en cours…':'Télécharger le PowerPoint (.pptx)'}
    </button>
    <span className="filter-note"><FileText size={15}/> Une ligne par mouvement, tableaux éditables, sources ODJ/RD et alertes.</span>
   </div>
  </>}
  <p className="filter-note">Périmètre : CSP cadres uniquement. Dates de séance dans le trimestre ; dates d’effet conservées. Les documents non validés ne créent pas de mouvements définitifs. Aucun import ni mise à jour de données lors de cet export.</p>
 </section>;
}