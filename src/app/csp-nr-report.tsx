'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {BarChart3,ChevronRight,Download,RefreshCw} from 'lucide-react';
import type {NRReportRow} from '../lib/csp-nr-report';
type Report={year:number;rows:NRReportRow[];totalCsp:number;totalManual:number;total:number;toVerify:number;agents:number};
const fmt=(v:number)=>new Intl.NumberFormat('fr-FR').format(v);
const dated=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4):s;
function csv(rows:NRReportRow[],year:number){
 const values=[['Identifiant','Agent','Agence au moment du mouvement','Date d’effet','Motif','GF avant','GF après','NR avant','NR après','NR attribués','Provenance','Date de CSP','Document','Contrôle'],
 ...rows.map(r=>[r.agentId,r.name,r.agency,r.effective,r.motif,r.beforeGF??'',r.afterGF??'',r.beforeNR??'',r.afterNR??'',r.nr??'',r.source==='manual'?'Administratif':'CSP',r.meetingDate,r.document,r.justification])];
 const contents='\ufeff'+values.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([contents],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='bilan-nr-ulm-'+year+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function CspNRReport(){
 const [year,setYear]=useState(new Date().getFullYear());
 const [report,setReport]=useState<Report|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 const [hasOpened,setHasOpened]=useState(false);
 const [agency,setAgency]=useState('');
 const [kind,setKind]=useState('');
 const [showDetail,setShowDetail]=useState(false);
 const [page,setPage]=useState(0);
 const [detailFilter,setDetailFilter]=useState<'all'|'manual'|'unchecked'>('all');
 const detailRef=useRef<HTMLDivElement>(null);
 const [detailRequest,setDetailRequest]=useState(0);
 const openDetail=(filter:'manual'|'unchecked')=>{setDetailFilter(filter);setShowDetail(true);setPage(0);setDetailRequest(v=>v+1);};
 useEffect(()=>{if(detailRequest){detailRef.current?.scrollIntoView({behavior:'smooth',block:'start'});detailRef.current?.focus({preventScroll:true});}},[detailRequest]);
 useEffect(()=>setPage(0),[report]);
 const [showAllCsp,setShowAllCsp]=useState(false);
 useEffect(()=>setShowAllCsp(false),[year,agency,kind]);
 useEffect(()=>{
  // Avoid reading Supabase until the administrator first opens this report.
  if(!hasOpened)return;
  const controller=new AbortController();setBusy(true);setError('');setReport(null);
  fetch('/api/csp?nrReport=1&year='+year,{cache:'no-store',signal:controller.signal})
   .then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error||'Bilan indisponible.');return b as Report;})
   .then(b=>{if(!controller.signal.aborted)setReport(b);})
   .catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);})
   .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
  return ()=>controller.abort();
 },[hasOpened,year,revision]);
 const agencies=useMemo(()=>[...new Set(report?.rows.map(r=>r.agency)||[])].sort((a,b)=>a.localeCompare(b,'fr')),[report]);
 const rows=useMemo(()=>report?.rows.filter(r=>(!agency||r.agency===agency)&&(!kind||r.kind===kind))||[],[report,agency,kind]);
 const detailRows=rows.filter(r=>detailFilter==='manual'?r.source==='manual'&&r.nr!==null:detailFilter==='unchecked'?r.nr===null:true);
 const valid=rows.filter(r=>r.nr!==null);
 const csp=valid.filter(r=>r.source==='csp').reduce((sum,r)=>sum+r.nr!,0);
 const manual=valid.filter(r=>r.source==='manual').reduce((sum,r)=>sum+r.nr!,0);
 const agents=new Set(valid.map(r=>r.agentId||r.name)).size;
 const unchecked=rows.filter(r=>r.nr===null).length;
 const agenciesTable=agencies.map(name=>{const r=report?.rows.filter(e=>e.agency===name)||[];const certain=r.filter(e=>e.nr!==null);return {name,total:certain.reduce((sum,e)=>sum+e.nr!,0),agents:new Set(certain.map(e=>e.agentId||e.name)).size,unchecked:r.filter(e=>e.nr===null).length};});
 const documents=Object.values(valid.filter(r=>r.source==='csp').reduce<Record<string,{id:string;name:string;date:string;total:number;agents:Set<string>}>>((acc,r)=>{
  const item=acc[r.documentId]||{id:r.documentId,name:r.document,date:r.meetingDate,total:0,agents:new Set<string>()};
  item.total+=r.nr!;item.agents.add(r.agentId||r.name);acc[r.documentId]=item;return acc;
 },{})).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'fr'));
 const years=Array.from({length:Math.max(1,new Date().getFullYear()-2023)},(_,i)=>new Date().getFullYear()-i);
 return <details className="document-folder" aria-label="Bilan annuel des NR attribués" onToggle={event=>{if(event.currentTarget.open)setHasOpened(true);}}>
  <summary><ChevronRight size={16} className="folder-chevron"/><BarChart3 size={20}/><strong>Bilan annuel des NR attribués</strong><span className="badge">Afficher le bilan</span></summary>
  <div className="document-folder-content">
  <p>Attributions validées du 1er janvier au 31 décembre, classées par date d’effet. Ce bilan est indépendant des règles de validation des CSP.</p>
  <div style={{display:'flex',flexWrap:'wrap',alignItems:'end',gap:12,margin:'14px 0'}}>
   <label>Année<select value={year} onChange={e=>{setYear(Number(e.target.value));setAgency('');setKind('');setPage(0);}}>{years.map(y=><option value={y} key={y}>{y}</option>)}</select></label>
   <label>Agence<select value={agency} onChange={e=>{setAgency(e.target.value);setPage(0);}}><option value="">Toute l’ULM</option>{agencies.map(a=><option value={a} key={a}>{a}</option>)}</select></label>
   <label>Motif<select value={kind} onChange={e=>{setKind(e.target.value);setPage(0);}}><option value="">Tous</option><option value="avancement">Avancement au choix</option><option value="reclassement">Reclassement</option><option value="nomination">Nomination</option><option value="mesure">Mesure salariale</option><option value="posthume">Avancement à titre posthume</option></select></label>
   <button className="btn" disabled={busy} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/>Actualiser</button>
   <button className="btn" disabled={!report||!rows.length} onClick={()=>csv(rows,year)}><Download size={15}/>Exporter CSV</button>
  </div>
  {busy&&<p>Calcul du bilan…</p>}
  {error&&<p role="alert" className="notice">{error}</p>}
  {report&&!busy&&<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(135px,1fr))',gap:12,margin:'18px 0'}}>
    {([['NR attribués en CSP',csp],['NR administratifs hors CSP',manual],['Total NR',csp+manual],['Agents bénéficiaires',agents],['À vérifier',unchecked]] as const).map(([label,value])=>{const filter=label==='NR administratifs hors CSP'?'manual':label==='À vérifier'?'unchecked':null;const content=<><small>{label}</small><div style={{fontWeight:700,fontSize:24,marginTop:4}}>{fmt(value)}</div>{filter&&<small>Voir les situations</small>}</>;return filter?<button key={label} type="button" aria-controls="nr-report-details" aria-expanded={showDetail&&detailFilter===filter} onClick={()=>openDetail(filter)} style={{border:'1px solid #668875',borderRadius:12,padding:12,textAlign:'left',background:showDetail&&detailFilter===filter?'#eef5f0':'white',color:'inherit',font:'inherit',cursor:'pointer'}}>{content}</button>:<div key={label} style={{border:'1px solid #dce3dd',borderRadius:12,padding:12}}>{content}</div>;})}
   </div>
   {unchecked>0&&<p className="notice">{fmt(unchecked)} décision(s) dont le gain de NR n’est pas établi avec certitude ne sont pas ajoutées au total. Elles sont consultables dans le détail.</p>}
   {!agency&&<div className="table-scroll"><table><thead><tr><th>Agence</th><th>NR attribués</th><th>Agents</th><th>À vérifier</th></tr></thead><tbody>{agenciesTable.map(r=><tr key={r.name}><td>{r.name}</td><td>{fmt(r.total)}</td><td>{fmt(r.agents)}</td><td>{r.unchecked||'—'}</td></tr>)}<tr><th>Ensemble ULM</th><th>{fmt(report.total)}</th><th>{fmt(report.agents)}</th><th>{report.toVerify||'—'}</th></tr></tbody></table></div>}
   <h3 style={{marginTop:20}}>Répartition par CSP</h3>
   <div className="table-scroll"><table><thead><tr><th>Date de séance</th><th>Document</th><th>NR attribués</th><th>Agents</th></tr></thead><tbody>{(showAllCsp?documents:documents.slice(0,3)).map(r=><tr key={r.id}><td>{dated(r.date)}</td><td>{r.name}</td><td>{fmt(r.total)}</td><td>{fmt(r.agents.size)}</td></tr>)}{!documents.length&&<tr><td colSpan={4}>Aucune attribution validée pour la sélection.</td></tr>}</tbody></table></div>
   {documents.length>3&&<div style={{marginTop:8}}><button className="btn" aria-expanded={showAllCsp} onClick={()=>setShowAllCsp(v=>!v)}>{showAllCsp?'Réduire la liste des CSP':'Afficher toutes les CSP ('+fmt(documents.length)+')'}</button></div>}
   <div style={{marginTop:14}}><button className="btn" aria-controls="nr-report-details" aria-expanded={showDetail} onClick={()=>{setShowDetail(v=>!v);setDetailFilter('all');setPage(0);}}>{showDetail?'Masquer les décisions':'Afficher toutes les décisions ('+fmt(rows.length)+')'}</button></div>
   {showDetail&&<div id="nr-report-details" ref={detailRef} tabIndex={-1} style={{marginTop:12,scrollMarginTop:20}}>
    <h3>{detailFilter==='manual'?'NR administratifs hors CSP':detailFilter==='unchecked'?'Situations à vérifier':'Toutes les décisions'} — {fmt(detailRows.length)} situation(s)</h3>
    <p>{detailFilter==='manual'?'Attributions administratives prises en compte dans la case « NR administratifs hors CSP ».':detailFilter==='unchecked'?'Le gain de NR de ces décisions ne peut pas être établi avec certitude : elles sont exclues des totaux.':'Détail des décisions pour les filtres sélectionnés.'}</p>
    {detailFilter!=='all'&&<button className="btn" onClick={()=>{setDetailFilter('all');setPage(0);}}>Voir toutes les décisions</button>}
    <div className="table-scroll"><table><thead><tr><th>Agent / identifiant</th><th>Date d’effet</th><th>Agence</th><th>Motif / provenance</th><th>GF avant / après</th><th>NR avant / après</th><th>NR attribués</th><th>Explication / contrôle</th><th>Document de référence</th><th>Date de séance / saisie</th></tr></thead><tbody>{detailRows.slice(page*50,(page+1)*50).map(r=><tr key={r.id}><td>{r.name}<br/><small>{r.agentId||'Identifiant non renseigné'}</small></td><td>{dated(r.effective)}</td><td>{r.agency}</td><td>{r.motif}<br/><small>{r.source==='manual'?'Administratif hors CSP':'CSP'}</small></td><td>{r.beforeGF??'—'} / {r.afterGF??'—'}</td><td>{r.beforeNR??'—'} / {r.afterNR??'—'}</td><td>{r.nr===null?'À vérifier':fmt(r.nr)}</td><td>{r.nr===null?(r.beforeNR!==null&&r.afterNR!==null?'NR après inférieur au NR avant : gain à vérifier.':'NR avant ou après manquant ou invalide et gain non établi.') :r.justification==='nombre de NR déclaré'?'Nombre de NR déclaré dans la décision.':'Écart entre les indices NR avant et après, divisé par 5.'}</td><td>{r.document||'Document non renseigné'}</td><td>{r.meetingDate?dated(r.meetingDate):'—'}</td></tr>)}{!detailRows.length&&<tr><td colSpan={10}>Aucune situation pour les filtres sélectionnés.</td></tr>}</tbody></table></div>
    <div style={{display:'flex',gap:10,alignItems:'center',marginTop:10}}><button className="btn" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Précédent</button><span>Page {page+1} / {Math.max(1,Math.ceil(detailRows.length/50))}</span><button className="btn" disabled={(page+1)*50>=detailRows.length} onClick={()=>setPage(p=>p+1)}>Suivant</button></div>
   </div>}
   <p className="filter-note" style={{marginTop:12}}>Une décision déjà reconnue par un autre ODJ/RD n’est comptée qu’une fois. Nominations à NR constant, candidatures non retenues et mouvements non approuvés sont exclus. Les corrections manuelles sont présentées séparément.</p>
  </>}
  </div>
 </details>;
}
