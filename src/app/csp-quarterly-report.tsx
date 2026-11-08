'use client';
import {useEffect,useMemo,useState} from 'react';
import {defaultMovementColumns,getMovementColumns,optionalMovementColumns,type OptionalMovementColumn} from '../lib/csp-quarterly-columns';
import {ChevronRight,Download,RefreshCw,FileText} from 'lucide-react';
import {calculateQuarterlyReport,isCadresDocument,kindLabels} from '../lib/csp-quarterly-report';
import type {QuarterlyDocument,QuarterlyReport,QuarterlyEvent} from '../lib/csp-quarterly-report';
type ImportMeta={id:string;name:string;date:string;status:string;documentType:'cr'|'rd';perEventValidation?:boolean;automaticallyValidated?:boolean};
const current=new Date();
export default function CspQuarterlyReport({revision=0}:{revision?:number}){
 const [year,setYear]=useState(current.getFullYear());
 const [quarter,setQuarter]=useState(Math.ceil((current.getMonth()+1)/3));
 const [includeCandidates,setIncludeCandidates]=useState(true);
 const [selectedColumns,setSelectedColumns]=useState<OptionalMovementColumn[]>(defaultMovementColumns);
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
    const fresh:ImportMeta=detail.meta||meta;
   docs.push({id:fresh.id,name:fresh.name,date:fresh.date,status:fresh.status,
      documentType:fresh.documentType,perEventValidation:!!fresh.perEventValidation,
      automaticallyValidated:fresh.automaticallyValidated===true,
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
   await downloadQuarterlyPpt(report,includeCandidates,selectedColumns);
  }catch(ex){setError(ex instanceof Error?ex.message:"L'export PowerPoint a échoué.");}
  finally{setBusy(false);}
 }
 return <details className="document-folder" aria-label="Comptes rendus trimestriels CSP cadres">
  <summary><ChevronRight size={16} className="folder-chevron"/><FileText size={20}/><strong>Comptes rendus trimestriels CSP cadres</strong><span className="badge">Afficher le générateur</span></summary>
  <div className="document-folder-content">
   <p style={{marginBottom:14}}>Générer un PowerPoint de la CSP cadres (Métiers de la PI et de la DOAAT), avec une ligne par mouvement et de vrais tableaux modifiables. Aucune incidence sur les validations CSP.</p>
  <div className="analysis-options">
   <label>Année<select aria-label="Année du compte rendu" value={year} onChange={e=>setYear(Number(e.target.value))}>
    {Array.from({length:Math.max(new Date().getFullYear()+5,year)-2024+1},(_,i)=>2024+i).map(y=><option key={y} value={y}>{y}</option>)}
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
  <fieldset disabled={busy} style={{margin:'16px 0',padding:16,border:'1px solid #ddd',borderRadius:8}}>
   <legend>Colonnes des tableaux de mouvements</legend>
   <p className="filter-note">Toujours présentes : Nom / prénom, Agence / poste et CSP / effet.</p>
   <div className="analysis-options">{optionalMovementColumns.map(c=><label key={c.id} className="check-label">
    <input type="checkbox" checked={selectedColumns.includes(c.id)} onChange={e=>setSelectedColumns(previous=>e.target.checked?[...previous,c.id]:previous.filter(id=>id!==c.id))}/>{c.label}
   </label>)}</div>
   <p className="filter-note">Pour les admissions au stage et les titularisations, le GF avant / après reste obligatoire et la colonne « NR + » n’est jamais affichée, même si elle est sélectionnée. Pour les autres motifs, les colonnes suivent votre sélection. L’aperçu et le PowerPoint respectent ces règles, rubrique par rubrique.</p>
  </fieldset>
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
   {!!report.rows.filter(r=>r.notes).length&&<details open>
    <summary>Contrôles documentaires : {report.rows.filter(r=>r.notes).length} mouvement(s) signalé(s)</summary>
    <p className="filter-note">Les mouvements ci-dessous sont validés. Le motif précise si la réserve concerne le NR, une divergence, la lecture ou une note à relire. La liste est complète, indépendamment des colonnes choisies pour les tableaux.</p>
    <div className="table-scroll"><table><thead><tr><th>Nom / prénom</th><th>Mouvement</th><th>CSP / effet</th><th>GF avant / après</th><th>NR avant / après</th><th>Motif et document source</th></tr></thead>
     <tbody>{report.rows.filter(r=>r.notes).map((r,i)=><tr key={r.id+i}><td>{r.name}</td><td>{kindLabels[r.kind]}</td><td>{r.meeting}<br/>{r.effective}</td><td>{r.gfBefore} / {r.gfAfter}</td><td>{r.nrBefore} / {r.nrAfter}</td><td style={{whiteSpace:'pre-line'}}>{r.notes}</td></tr>)}</tbody>
    </table></div>
   </details>}
   {!!report.rows.filter(r=>r.resolvedNotes).length&&<details>
    <summary>Anciennes notes résolues ({report.rows.filter(r=>r.resolvedNotes).length} mouvement(s))</summary>
    <p className="filter-note">Ces anciennes demandes de renseignement ne sont plus comptées comme motifs de contrôle. Un mouvement peut conserver une autre réserve, détaillée ci-dessus.</p>
    {report.rows.filter(r=>r.resolvedNotes).map((r,i)=><p key={r.id+i} style={{whiteSpace:'pre-line'}}><b>{r.name} · {kindLabels[r.kind]} · {r.meeting}</b><br/>{r.resolvedNotes}</p>)}
   </details>}
   {!!grouped.length&&<div className="table-scroll"><table><thead><tr><th>Rubrique</th><th>Mouvements</th></tr></thead>
    <tbody>{grouped.map(x=><tr key={x.kind}><td>{x.label}</td><td>{x.count}</td></tr>)}</tbody></table></div>}
   {!!report.rows.length&&<details><summary>Aperçu des mouvements ({report.rows.length})</summary>
    {grouped.map(group=>{
     const cols=getMovementColumns(selectedColumns,group.kind);
     const movements=report.rows.filter(r=>r.kind===group.kind);
     return <div key={group.kind} style={{marginBottom:16}}>
      <h3>{group.label} ({movements.length})</h3>
      <div className="table-scroll"><table><thead><tr>{cols.map(c=><th key={c.id}>{c.label}</th>)}</tr></thead>
       <tbody>{movements.slice(0,80).map((r,i)=><tr key={r.id+i}>{cols.map(c=><td key={c.id} style={{whiteSpace:'pre-line'}}>{c.value(r)}</td>)}</tr>)}</tbody>
      </table></div>{movements.length>80&&<p>Affichage limité aux 80 premières lignes de cette rubrique. Le PowerPoint contient toutes les lignes.</p>}
     </div>;
    })}
   </details>}
   <div className="analysis-options">
    <button className="btn primary" disabled={busy||!report.sources.length} onClick={()=>void exportPpt()}>
     <Download size={16}/> {busy?'Génération en cours…':'Télécharger le PowerPoint (.pptx)'}
    </button>
    <span className="filter-note"><FileText size={15}/> Une ligne par mouvement, tableaux éditables, sources ODJ/RD et alertes.</span>
   </div>
  </>}
  <p className="filter-note">Périmètre : CSP cadres uniquement. Dates de séance dans le trimestre ; dates d’effet conservées. Les documents non validés ne créent pas de mouvements définitifs. Aucun import ni mise à jour de données lors de cet export.</p>
  </div>
 </details>;
}