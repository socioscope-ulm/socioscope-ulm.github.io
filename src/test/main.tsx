import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import * as XLSX from 'xlsx';
import {readAgentWorkbook,detectMapping,mapAgentRows} from '../lib/agents-import.ts';
import {rupCareer,rupStats,parseRupFile} from '../lib/rup.ts';
import {careerSeniority} from '../lib/agents.ts';
import type {AgentRecord,AgentSource} from '../lib/agents.ts';
import type {RupRow} from '../lib/rup.ts';
import './styles.css';

type Snapshot={name:string;date:string;records:AgentRecord[];source:AgentSource};
type Change={nni:string;name:string;status:'Arrivée'|'Départ'|'Évolution'|'Stable';oldGF?:number;newGF?:number;oldNR?:number;newNR?:number;seniority:string};
const DEMO2025=[
 ['A10001','ALPHA SIMULATION',10,200,15,'2010-01-01','DUM TEST'],
 ['A10002','BETA SIMULATION',9,170,7,'2018-05-12','DUM TEST'],
 ['A10003','GAMMA SIMULATION',7,140,19,'2006-06-18','DUM TEST']
];
const DEMO2026=[
 ['A10001','ALPHA SIMULATION',10,205,16,'2010-01-01','DUM TEST'],
 ['A10002','BETA SIMULATION',10,180,8,'2018-05-12','DUM TEST'],
 ['A10004','DELTA SIMULATION',6,130,2,'2024-02-14','DUM TEST']
];
const AGENT_HEADERS=['NNI','Nom prénom','GF actuel','NR actuel','Ancienneté dans les IEG',"Date d'entrée dans la société",'DUM libellé'];
const RUP_HEADERS=['NNI','Numéro contrat','Nom','Prénom','Date entrée IEG',"Date d'entrée dans l'UM",'DUM (libellé)'];
function makeWorkbook(headers:string[],rows:unknown[][],name:string){
 const sheet=XLSX.utils.aoa_to_sheet([headers,...rows]);
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Test');const bytes=XLSX.write(book,{bookType:'xlsx',type:'array'});
 return new File([bytes],name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function fixture(kind:'2025'|'2026'|'rup'){
 if(kind==='rup')return makeWorkbook(RUP_HEADERS,[
  ['A10001','001','ALPHA','SIMULATION','2010-01-01','2020-01-01','DUM TEST'],
  ['A10002','002','BETA','SIMULATION','2018-05-12','2020-01-01','DUM TEST'],
  ['A10004','004','DELTA','SIMULATION','2024-02-14','2024-02-14','DUM TEST']
 ],'RUP-FICTIF-2026.xlsx');
 return makeWorkbook(AGENT_HEADERS,kind==='2025'?DEMO2025:DEMO2026,'SITUATION-FICTIVE-'+kind+'.xlsx');
}
async function parseSituation(file:File,date:string):Promise<Snapshot>{
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Date de photographie invalide.');
 const sheets=await readAgentWorkbook(file);
 for(const sheet of sheets){
  for(let i=0;i<Math.min(15,sheet.rows.length);i++){
   const headers=(sheet.rows[i]||[]).map(v=>String(v??''));
   const map=detectMapping(headers);
   if(map.nni===-1||map.name===-1)continue;
   const rows=mapAgentRows(sheet.rows,map,i,date).filter(r=>!!r.nni);
   if(!rows.length)continue;
   const id='test-'+date;
   const records=rows.map(r=>({...r,source:id}));
   return {name:file.name,date,records,source:{id,name:file.name,hash:'fictif',date,label:file.name,sheet:sheet.name,primary:true,confidence:'simulation',seniorityDate:date,rows:rows.length,agents:rows.length,status:'validated'}};
  }
 }
 throw Error("Colonnes NNI et Nom/Prénom ou lignes exploitables introuvables dans le classeur.");
}
function download(file:File){
 const uri=URL.createObjectURL(file);
 const a=document.createElement('a');a.href=uri;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(uri),2000);
}
function asCsv(changes:Change[]){
 const fields=['NNI fictif','Agent fictif','Situation','GF avant','GF après','NR avant','NR après','Ancienneté RUP'];
 const quote=(x:unknown)=>'"'+String(x??'').replaceAll('"','""')+'"';
 const content='\uFEFF'+[fields,...changes.map(c=>[c.nni,c.name,c.status,c.oldGF,c.newGF,c.oldNR,c.newNR,c.seniority])].map(a=>a.map(quote).join(';')).join('\r\n');
 const f=new File([content],'socioscope-test-resultats.csv',{type:'text/csv;charset=utf-8'});download(f);
}
function App(){
 const [older,setOlder]=useState<Snapshot|null>(null);
 const [newer,setNewer]=useState<Snapshot|null>(null);
 const [rup,setRup]=useState<RupRow[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [dateOld,setDateOld]=useState('2025-12-31');
 const [dateNew,setDateNew]=useState('2026-12-31');
 const [dateRup,setDateRup]=useState('2026-12-31');
 const simulated=useMemo(()=>{
  if(!older||!newer)return [] as Change[];
  const a=new Map(older.records.map(r=>[r.nni,r])),b=new Map(newer.records.map(r=>[r.nni,r]));
  const keys=[...new Set([...a.keys(),...b.keys()])].filter(Boolean).sort() as string[];
  return keys.map(nni=>{
   const prev=a.get(nni),next=b.get(nni);
   const status:Change['status']=!prev?'Arrivée':!next?'Départ':prev.gf!==next.gf||prev.nr!==next.nr?'Évolution':'Stable';
   const withRup=next?rupCareer(rup.filter(r=>r.nni===nni),nni):undefined;
   const enriched=next?{...next,rupCareer:withRup}:undefined;
   const seniority=enriched?careerSeniority([enriched],[newer.source],newer.date,newer.source.id):null;
   const text=seniority?.completedYears!=null?seniority.completedYears+' ans':(withRup?.status==='conflict'?'Dates contradictoires':'Non renseignée');
   return {nni,name:(next||prev)!.name,status,oldGF:prev?.gf,newGF:next?.gf,oldNR:prev?.nr,newNR:next?.nr,seniority:text};
  });
 },[older,newer,rup]);
 const counts={arrivals:simulated.filter(x=>x.status==='Arrivée').length,departures:simulated.filter(x=>x.status==='Départ').length,changes:simulated.filter(x=>x.status==='Évolution').length,stable:simulated.filter(x=>x.status==='Stable').length};
 async function doLoadDemo(){
  setBusy(true);setError('');setNotice('');
  try{
   const [a,b,r]=await Promise.all([parseSituation(fixture('2025'),'2025-12-31'),parseSituation(fixture('2026'),'2026-12-31'),parseRupFile(fixture('rup'),'2026-12-31')]);
   setOlder(a);setNewer(b);setRup(r);setDateOld('2025-12-31');setDateNew('2026-12-31');setDateRup('2026-12-31');
   setNotice("Jeux fictifs importés en mémoire : le rapprochement des deux photographies et des RUP est prêt.");
  }catch(e){setError((e as Error).message)}finally{setBusy(false);}
 }
 async function receive(kind:'old'|'new'|'rup',f:File){
  setBusy(true);setError('');setNotice('');
  try{
   if(kind==='rup'){const result=await parseRupFile(f,dateRup);setRup(result);setNotice(result.length+' lignes RUP interprétées en mémoire.');}
   else{const result=await parseSituation(f,kind==='old'?dateOld:dateNew);if(kind==='old')setOlder(result);else setNewer(result);setNotice(result.records.length+' agents interprétés depuis '+f.name+'.');}
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const stats=rup.length?rupStats({sources:[],records:rup}):null;
 return <div className="sandbox">
  <header className="mast"><div className="brand"><div className="symbol">S</div><div><strong>SOCIOSCOPE <span>ULM</span></strong><div className="brand-sub">ESPACE DE SIMULATION</div></div></div><a href="/" className="back">↗ Socioscope officiel</a></header>
  <main>
   <section className="intro"><span className="eyebrow">TESTS HORS PRODUCTION</span><h1>Tester les imports sans modifier les chiffres réels.</h1><p>Rejouez des photographies d'agents et des fichiers RUP avec les <strong>mêmes fonctions de lecture Excel et de calcul d'ancienneté</strong> que le Socioscope. Les résultats restent uniquement dans la mémoire de cette page.</p><div className="safety"><strong>Environnement sans accès à Supabase</strong> — aucun compte, fichier ou résultat n'est transmis à la base de données. Utilisez exclusivement des fichiers fictifs ou anonymisés. Fermer cette page efface la simulation.</div></section>
   <section className="panel">
    <div className="panel-head"><div><span className="eyebrow">01 · DÉMARRAGE</span><h2>Jeux de données fictifs</h2><p>Un exemple prêt à l'emploi : 2025, 2026, puis RUP. Aucun fichier personnel requis.</p></div><button className="btn primary" disabled={busy} onClick={doLoadDemo}>{busy?'Traitement…':'▶ Lancer la simulation'}</button></div>
    <div className="download-row"><button onClick={()=>download(fixture('2025'))}>↓ Excel 2025 fictif</button><button onClick={()=>download(fixture('2026'))}>↓ Excel 2026 fictif</button><button onClick={()=>download(fixture('rup'))}>↓ RUP fictif</button></div>
   </section>
   <section className="panel">
    <span className="eyebrow">02 · IMPORTS FACULTATIFS</span><h2>Importer d'autres fichiers de test</h2><div className="upload-grid">
     <label className="file-box"><strong>Photographie précédente</strong><span>Date</span><input type="date" value={dateOld} onChange={e=>setDateOld(e.target.value)}/><span>Excel ou CSV de test</span><input aria-label="Classeur photographie précédente" type="file" accept=".xls,.xlsx,.xlsm,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,text/csv" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void receive('old',f);e.target.value='';}}/>{older&&<small>✓ {older.name} · {older.records.length} agents</small>}</label>
     <label className="file-box"><strong>Nouvelle photographie</strong><span>Date</span><input type="date" value={dateNew} onChange={e=>setDateNew(e.target.value)}/><span>Excel ou CSV de test</span><input aria-label="Classeur photographie récente" type="file" accept=".xls,.xlsx,.xlsm,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,text/csv" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void receive('new',f);e.target.value='';}}/>{newer&&<small>✓ {newer.name} · {newer.records.length} agents</small>}</label>
     <label className="file-box"><strong>RUP — ancienneté</strong><span>Date</span><input type="date" value={dateRup} onChange={e=>setDateRup(e.target.value)}/><span>Excel RUP de test</span><input aria-label="Classeur RUP" type="file" accept=".xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void receive('rup',f);e.target.value='';}}/>{rup.length>0&&<small>✓ {rup.length} lignes RUP détectées</small>}</label>
    </div>
    {error&&<div role="alert" className="msg error">{error}</div>}{notice&&<div role="status" className="msg success">{notice}</div>}
   </section>
   <section className="panel">
    <div className="panel-head"><div><span className="eyebrow">03 · RÉSULTATS</span><h2>Rapprochement simulé</h2><p>Comparaison des agents d'une photographie à la suivante, sans publication des modifications.</p></div>{simulated.length>0&&<button className="btn outline" onClick={()=>asCsv(simulated)}>↓ Exporter le résultat CSV</button>}</div>
    {older&&newer?<><div className="metric-grid"><div className="metric"><span>Effectifs précédents</span><strong>{older.records.length}</strong></div><div className="metric"><span>Effectifs nouveaux</span><strong>{newer.records.length}</strong></div><div className="metric"><span>Arrivées</span><strong>{counts.arrivals}</strong></div><div className="metric"><span>Départs</span><strong>{counts.departures}</strong></div><div className="metric"><span>Évolutions GF/NR</span><strong>{counts.changes}</strong></div><div className="metric"><span>RUP rapprochés</span><strong>{simulated.filter(x=>x.seniority!=='Non renseignée'&&x.seniority!=='Dates contradictoires').length}</strong></div></div><div className="table-wrap"><table><thead><tr><th>Agent fictif</th><th>Situation</th><th>GF avant → après</th><th>NR avant → après</th><th>Ancienneté RUP</th></tr></thead><tbody>{simulated.map(c=><tr key={c.nni}><td><strong>{c.name}</strong><small>{c.nni}</small></td><td><span className={'state '+c.status.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}>{c.status}</span></td><td>{c.oldGF??'–'} → {c.newGF??'–'}</td><td>{c.oldNR??'–'} → {c.newNR??'–'}</td><td>{c.seniority}</td></tr>)}</tbody></table></div>{stats&&<p className="note">RUP : {stats.lines} lignes, {stats.agents} couples agent/contrat, {stats.conflicts} contradiction(s) de dates d'entrée.</p>}</>:<div className="empty">Chargez les jeux fictifs avec <strong>« Lancer la simulation »</strong> pour visualiser les évolutions.</div>}
   </section>
   <section className="limits"><h2>Ce que cette simulation vérifie</h2><p>Elle utilise les véritables fonctions de lecture des classeurs, de reconnaissance des champs, de rapprochement des agents et de calcul de l'ancienneté RUP. <strong>Elle ne valide pas encore</strong> le stockage Supabase, les opérations serveur, ni toutes les analyses et rémunérations du Socioscope complet. Ces tests d'intégration exigent un second environnement Supabase indépendant.</p></section>
  </main><footer>Socioscope ULM — banc d'essai fictif et éphémère · Aucune donnée envoyée à la production</footer>
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
