'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {defaultMovementColumns,getMovementColumns,optionalMovementColumns,type OptionalMovementColumn} from '../lib/csp-quarterly-columns';
import {ChevronRight,Download,RefreshCw,FileText} from 'lucide-react';
import {calculateQuarterlyReport,isCadresDocument,kindLabels} from '../lib/csp-quarterly-report';
import {enrichQuarterlyAnnotations,recoverQuarterlyAnnotationsFromPages} from '../lib/csp-quarterly-annotations';
import {annotationForCspKind} from '../lib/csp-annotation-rules.ts';
import type {QuarterlyDocument,QuarterlyReport,QuarterlyEvent} from '../lib/csp-quarterly-report';
type ImportMeta={id:string;name:string;date:string;status:string;documentType:'cr'|'rd';perEventValidation?:boolean;automaticallyValidated?:boolean};
type AnnotationCacheEntry={events:QuarterlyEvent[];fallback:QuarterlyEvent[];motifPages:number[];observationPages:number[]};
const printedMotif=(value:string)=>/^\s*MOTIFS?(?:\s|$)/i.test(value);
const printedObservation=(value:string)=>/^\s*(?:OBSERVATIONS?|COMMENTAIRES?|REMARQUES?)(?:\s|$)/i.test(value);
const current=new Date();
export default function CspQuarterlyReport({revision=0}:{revision?:number}){
 const [year,setYear]=useState(current.getFullYear());
 const [quarter,setQuarter]=useState(Math.ceil((current.getMonth()+1)/3));
 const [includeCandidates,setIncludeCandidates]=useState(true);
 const [selectedColumns,setSelectedColumns]=useState<OptionalMovementColumn[]>(defaultMovementColumns);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [report,setReport]=useState<QuarterlyReport|null>(null);
 const [annotationStatus,setAnnotationStatus]=useState('');
 const [annotationWarnings,setAnnotationWarnings]=useState<string[]>([]);
 const annotationCache=useRef(new Map<string,AnnotationCacheEntry>());
 const [loadRevision,setLoadRevision]=useState(0);
 useEffect(()=>{annotationCache.current.clear();},[revision]);
 useEffect(()=>{setReport(null);setError('');},[year,quarter,revision]);
 const grouped=useMemo(()=>Object.entries(kindLabels).map(([kind,label])=>({
  kind,label,count:report?.rows.filter(r=>r.kind===kind).length||0
 })).filter(x=>x.count),[report]);
 async function prepare(){
  setBusy(true);setError('');setReport(null);setAnnotationStatus('');setAnnotationWarnings([]);
  try{
   const listing=await fetch('/api/csp',{cache:'no-store'});
   const body=await listing.json();
   if(!listing.ok)throw Error(body.error||'Liste CSP indisponible');
   const first=year+'-'+String((quarter-1)*3+1).padStart(2,'0')+'-01';
   const next=quarter===4?(year+1)+'-01-01':year+'-'+String(quarter*3+1).padStart(2,'0')+'-01';
   const metas=(body.imports||[] as ImportMeta[])
    .filter((m:ImportMeta)=>isCadresDocument(m.name)&&m.date>=first&&m.date<next)
    .sort((a:ImportMeta,b:ImportMeta)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'fr'));
   const older=(body.imports||[] as ImportMeta[])
    .filter((m:ImportMeta)=>isCadresDocument(m.name)&&m.date<first&&m.status==='validated')
    .sort((a:ImportMeta,b:ImportMeta)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'fr'));
   if(metas.length>45)throw Error('Trop de documents pour ce trimestre : traitement interrompu par sécurité.');
   if(older.length>150)throw Error('Historique CSP trop volumineux pour contrôler les mouvements déjà publiés.');
   const docs:QuarterlyDocument[]=[];
   const readWarnings:string[]=[];
   // Read older validated decisions exclusively for report deduplication.
   // Every ODJ in this quarter is reread when its required printed
   // annotation is absent; no user checkbox and no Supabase updates.
   for(const meta of [...older,...metas]){
    const response=await fetch('/api/csp?id='+encodeURIComponent(meta.id),{cache:'no-store'});
    const detail=await response.json();
    if(!response.ok)throw Error(detail.error||'Impossible de lire '+meta.name);
    const fresh:ImportMeta=detail.meta||meta;
    let events=(detail.events||[]) as QuarterlyEvent[];
    const needsPdf=fresh.documentType==='cr'&&fresh.date>=first&&fresh.date<next&&
     events.some(e=>e.selected&&!e.candidacy&&(
      (annotationForCspKind(e.kind)==='movementReason'&&!e.movementReason)||
      (annotationForCspKind(e.kind)==='observations'&&!e.observations)));
    if(needsPdf){
     try{
      let cached=annotationCache.current.get(fresh.id);
      if(!cached){
       setAnnotationStatus('Relecture documentaire (motifs / observations) : '+fresh.name);
       const original=await fetch('/api/agents/files/'+encodeURIComponent(fresh.id),{cache:'no-store'});
       if(!original.ok)throw Error('PDF original indisponible (HTTP '+original.status+').');
       const {readCspPDF}=await import('../lib/csp-extract');
       const pdf=new File([await original.blob()],fresh.name,{type:'application/pdf'});
       const extraction=await readCspPDF(pdf,()=>{},fresh.documentType);
       cached={
        events:extraction.events as QuarterlyEvent[],
        // Use exact stored agent name/page when re-extraction changes row IDs.
        fallback:recoverQuarterlyAnnotationsFromPages(events,extraction.pages),
        motifPages:extraction.pages.filter(p=>p.items.some(i=>printedMotif(i.str))).map(p=>p.page),
        observationPages:extraction.pages.filter(p=>p.items.some(i=>printedObservation(i.str))).map(p=>p.page)
       };
       annotationCache.current.set(fresh.id,cached);
      }
      events=enrichQuarterlyAnnotations(enrichQuarterlyAnnotations(events,cached.events),cached.fallback);
      // The PDF may contain a real MOTIF header even when pdfjs cannot
      // associate a text fragment with a specific validated row. Never hide
      // such cases silently or confuse a missing text with an empty motif.
      const missing=events.filter(e=>
       e.selected&&!e.candidacy&&
       ((annotationForCspKind(e.kind)==='movementReason'&&
         cached!.motifPages.includes(e.page??-1)&&!e.movementReason)||
        (annotationForCspKind(e.kind)==='observations'&&
         cached!.observationPages.includes(e.page??-1)&&!e.observations)));
      if(missing.length){
       const list=missing.slice(0,12).map(e=>e.name+' (p. '+e.page+')').join(', ');
       readWarnings.push(fresh.name+' : '+missing.length+
        ' ligne(s) avec en-tête Motif/Observations mais texte non récupéré : '+list+
        (missing.length>12?' et '+(missing.length-12)+' autre(s)':''));
      }
     }catch(ex){
      readWarnings.push(fresh.name+' : '+(ex instanceof Error?ex.message:'lecture impossible'));
     }
    }
    docs.push({id:fresh.id,name:fresh.name,date:fresh.date,status:fresh.status,
      documentType:fresh.documentType,perEventValidation:!!fresh.perEventValidation,
      automaticallyValidated:fresh.automaticallyValidated===true,events});
   }
   const nextReport=calculateQuarterlyReport(docs,year,quarter);
   setReport(nextReport);setAnnotationWarnings(readWarnings);setLoadRevision(v=>v+1);
  }catch(ex){setError(ex instanceof Error?ex.message:'Impossible de préparer le compte rendu.');}
  finally{setBusy(false);setAnnotationStatus('');}
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
   <details className="document-folder" style={{margin:'0 0 14px'}}>
    <summary><ChevronRight size={16} className="folder-chevron"/><FileText size={18}/><strong>Règles de création du compte rendu</strong><span className="badge">En savoir plus</span></summary>
    <div className="document-folder-content">
     <ul style={{paddingLeft:20,display:'grid',gap:8}}>
      <li><b>Périmètre :</b> seules les séances CSP cadres du trimestre choisi apparaissent ; la date d’effet est affichée séparément, même si elle appartient à un autre trimestre.</li>
      <li><b>Une seule présentation par décision :</b> un mouvement déjà présenté dans une CSP antérieure n’est pas repris comme un nouveau mouvement. Le rapprochement utilise l’agent, le motif, la date d’effet, les références et les valeurs GF/NR. Deux véritables évolutions restent distinctes.</li>
      <li><b>ODJ et RD :</b> un mouvement confirmé ne compte qu’une fois, même si le RD présente le NR final dans une autre colonne.</li>
      <li><b>GF constant :</b> un RD qui confirme une nomination à GF constant peut valider les valeurs GF/NR de l’ODJ correspondant.</li>
      <li><b>Admissions au stage et titularisations :</b> le GF avant/après reste visible et le NR+ est masqué.</li>
      <li><b>Motifs et observations automatiques :</b> les ODJ fournissent le « Motif » pour les reclassements et mesures salariales ; les « Observations / commentaires » pour les admissions au stage, titularisations, mutations d’office et avancements. La colonne correspondante apparaît automatiquement avant « CSP / effet ». Les PDF historiques sont relus sans aucune nouvelle validation.</li>
      <li><b>Contrôles :</b> les écarts réellement incohérents restent signalés ; un NR calculé est marqué d’un astérisque.</li>
      <li><b>Intégrité :</b> aucun document validé, aucune donnée individuelle ni aucun mouvement CSP n’est modifié par cet export.</li>
     </ul>
    </div>
   </details>
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
   <div className="analysis-options csp-column-options">{optionalMovementColumns.map(c=><label key={c.id} className="check-label">
    <input type="checkbox" checked={selectedColumns.includes(c.id)} onChange={e=>{
     const checked=e.target.checked;
     setSelectedColumns(previous=>checked?[...previous,c.id]:previous.filter(id=>id!==c.id));
    }}/>{c.label}
   </label>)}</div>
   <p className="filter-note">Colonnes documentaires automatiques, avant la date : <b>Motif</b> pour reclassement et mesures salariales ; <b>Observations / commentaires</b> pour admission, titularisation, mutation d’office et avancement. Les textes proviennent des ODJ validés, relus lors de la préparation du CR. Seules les quatre options ci-dessus sont à sélectionner. GF obligatoire pour admission/titularisation ; NR + masqué pour ces deux mouvements.</p>
  </fieldset>
  <section className="panel" aria-label="Contrôles documentaires du compte rendu" style={{margin:'16px 0',padding:14}}>
   <div className="panel-heading" style={{marginBottom:10}}>
    <div><h2>Contrôles documentaires du compte rendu</h2>
     <p>Deux contrôles distincts, toujours visibles ici. Les résultats et la trace des exclusions sont disponibles après « Préparer le compte rendu ».</p>
    </div>
   </div>
   <details key={'anomalies-'+loadRevision} className="document-folder" defaultOpen={!!report&&report.rows.some(r=>!!r.notes)}>
    <summary><ChevronRight size={16} className="folder-chevron"/><FileText size={17}/><strong>1. Anomalies et réserves documentaires</strong><span className="badge">{report?report.rows.filter(r=>r.notes).length+' signalement(s)':'À calculer'}</span></summary>
    <div className="document-folder-content">
     {!report?<p className="filter-note">Choisir l’année et le trimestre, puis cliquer sur « Préparer le compte rendu » pour afficher les anomalies.</p>:
     report.rows.some(r=>!!r.notes)?<>
      <p className="filter-note">Ces réserves peuvent concerner un NR, une divergence entre documents, une anomalie de lecture ou une note à relire.</p>
      <div className="table-scroll"><table><thead><tr><th>Nom / prénom</th><th>Mouvement</th><th>CSP / effet</th><th>GF avant / après</th><th>NR avant / après</th><th>Motif et document source</th></tr></thead><tbody>
       {report.rows.filter(r=>r.notes).map((r,i)=><tr key={r.id+i}><td>{r.name}</td><td>{kindLabels[r.kind]||r.kind}</td><td>{r.meeting}<br/>{r.effective}</td><td>{r.gfBefore} / {r.gfAfter}</td><td>{r.nrBefore} / {r.nrAfter}</td><td style={{whiteSpace:'pre-line'}}>{r.notes}</td></tr>)}
      </tbody></table></div>
     </>:<p className="filter-note">Aucune anomalie documentaire détectée pour ce compte rendu.</p>}
    </div>
   </details>
   <details key={'exclusions-'+loadRevision} className="document-folder" defaultOpen={!!report&&report.previouslyReported.length>0}>
    <summary><ChevronRight size={16} className="folder-chevron"/><FileText size={17}/><strong>2. Exclusions — mouvements déjà présentés</strong><span className="badge">{report?report.previouslyReported.length+' exclusion(s)':'À calculer'}</span></summary>
    <div className="document-folder-content">
     {!report?<p className="filter-note">Préparer le compte rendu pour rapprocher les CSP du trimestre des séances précédentes et visualiser les exclusions.</p>:
     report.previouslyReported.length>0?<>
      <p className="filter-note">Exclus uniquement de la présentation du CR. Les mouvements et les validations restent enregistrés dans le Socioscope. Les dates d’effet situées sur un autre trimestre sont distinguées.</p>
      <div className="table-scroll"><table><thead><tr><th>Agent / mouvement</th><th>Date d’effet</th><th>Séance actuelle</th><th>Première séance</th><th>Motif d’exclusion</th><th>Document actuel / document d’origine</th></tr></thead><tbody>
       {report.previouslyReported.map((item,i)=><tr key={i}><td>{item.name}<div className="filter-note">{kindLabels[item.kind]||item.kind}</div></td><td>{item.effective||'—'}</td><td>{item.meeting}</td><td>{item.originalMeeting}</td><td>{item.effectOutsideOriginalQuarter?'Déjà présenté lors d’une CSP antérieure ; date d’effet sur un autre trimestre.':'Déjà présenté lors d’une CSP antérieure ; même décision.'}</td><td><b>Actuel :</b> {item.currentDocument}<div><b>Origine :</b> {item.originalDocument}</div></td></tr>)}
      </tbody></table></div>
     </>:<p className="filter-note">Aucun mouvement exclu pour ce trimestre : aucune répétition de décision validée antérieure n’a été détectée.</p>}
    </div>
   </details>
  </section>
  {annotationStatus&&<p className="filter-note" role="status">{annotationStatus}</p>}
  {!!annotationWarnings.length&&<details className="document-folder" open><summary>Motifs / observations restant à contrôler ({annotationWarnings.length} document(s))</summary><div className="document-folder-content"><p>Un PDF peut contenir un motif imprimé sans que son texte soit correctement associé à l’agent. Ces cas sont signalés explicitement ; aucune valeur n’est inventée et les décisions restent validées.</p><ul>{annotationWarnings.map((x,i)=><li key={i}>{x}</li>)}</ul></div></details>}
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
  <p className="filter-note">Périmètre : CSP cadres uniquement. Les mouvements déjà présentés lors d’une CSP antérieure ne sont pas répétés. Les décisions non validées ne créent aucun mouvement définitif. Aucun import ni mise à jour de données lors de cet export.</p>
  </div>
 </details>;
}