'use client';
import {useEffect,useState} from 'react';

const gb=(bytes:number)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:3}).format(bytes/1e9)+' Go';
const date=(value:string)=>new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
export default function UsageAdmin(){
 const [from,setFrom]=useState(''),[to,setTo]=useState(new Date().toISOString().slice(0,10));
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const load=async(signal?:AbortSignal)=>{
  const response=await fetch('/api/usage',{signal,cache:'no-store'});const result=await response.json();
  if(!response.ok)throw Error(result.error||'Suivi indisponible.');setData(result);setFrom(value=>value||String(result.settings.trackingStarted).slice(0,10));
 };
 useEffect(()=>{const c=new AbortController();load(c.signal).catch(e=>{if(e.name!=='AbortError')setNotice(e.message);});return()=>c.abort();},[]);
 const refresh=async()=>{setBusy(true);setNotice('');try{await load();}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}};
 const toggle=async()=>{
  if(!data||busy)return;setBusy(true);setNotice('');
  try{
   const response=await fetch('/api/usage',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({suspended:!data.settings.suspended})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Modification impossible.');
   setData((old:any)=>({...old,settings:result.settings}));
   setNotice(result.settings.suspended?'Consultations utilisateurs suspendues. Votre accès administrateur reste ouvert.':'Consultations utilisateurs rétablies.');
  }catch(e){setNotice((e as Error).message);}finally{setBusy(false);}
 };
 const rows=(data?.rows||[]).filter((r:any)=>(!from||r.day>=from)&&(!to||r.day<=to));
 const sum=(bucket:string)=>rows.filter((r:any)=>r.bucket===bucket).reduce((n:number,r:any)=>n+r.bytes,0);
 const cached=sum('storage_cached'),uncached=sum('storage_uncached')+sum('api'),unknown=sum('storage_unknown');
 const unmeasured=rows.reduce((n:number,r:any)=>n+r.unmeasured,0);
 const days=[...new Set<string>(rows.map((r:any)=>r.day))].reverse().slice(0,7);
 const level=Math.max(cached,uncached);
 const alert=level>=4.5e9?'Seuil indicatif de 4,5 Go atteint':level>=4e9?'Attention : 4 Go atteints':level>=3.5e9?'Vigilance : 3,5 Go atteints':'';
 return <section className="panel" aria-label="Consommation et accès utilisateurs" style={{display:'grid',gap:16}}>
  <div className="panel-heading"><div><h2>Consommation et accès utilisateurs</h2><p>Suivi local estimé de Socioscope · administrateur uniquement</p></div><button type="button" className="btn" disabled={busy} onClick={()=>void refresh()}>Actualiser le suivi</button></div>
  <p>Ce suivi commence à son activation. Il exclut les usages antérieurs, Pointage, les échanges avec la base de données et l’authentification. Il ne représente pas le relevé de facturation Supabase de l’organisation.</p>
  {data?<>
   <p>Comptage depuis le <b>{date(data.settings.trackingStarted)}</b> · relevé affiché le {date(data.reportedAt)}. Les jours du tableau sont regroupés en UTC.</p>
   <div className="analysis-options"><label>Du<input type="date" aria-label="Début de la période de consommation" value={from} onChange={e=>{setFrom(e.target.value);if(e.target.value>to)setTo(e.target.value);}}/></label><label>Au<input type="date" aria-label="Fin de la période de consommation" value={to} onChange={e=>{setTo(e.target.value);if(e.target.value<from)setFrom(e.target.value);}}/></label><span>Choisissez les dates du cycle à comparer au relevé Supabase. Les jauges et le tableau suivent cette période.</span></div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}>
    {[['Trafic Storage avec cache',cached],['Trafic sans cache estimé · Storage et réponses de l’application',uncached]].map(([label,value])=><div key={String(label)}><strong>{label}</strong><p>{gb(Number(value))} / 5 Go · repère de quota</p><progress aria-label={String(label)} max={5e9} value={Math.min(Number(value),5e9)} style={{width:'100%'}}/><small>Alertes : 3,5 Go · 4 Go · 4,5 Go</small></div>)}
   </div>
   <p>Trafic Storage non classé : <b>{gb(unknown)}</b>. Requêtes sans taille connue : <b>{unmeasured}</b>. Ces incertitudes empêchent de garantir un arrêt au seuil officiel.</p>
   {alert&&<p className="notice" role="alert">{alert}. Consultez le relevé officiel avant de décider d’une suspension.</p>}
   <div className="notice"><div><b>{data.settings.suspended?'Consultations utilisateurs suspendues':'Consultations utilisateurs ouvertes'}</b><p>Blocage automatique désactivé. La suspension manuelle concerne les consultations, exports et téléchargements de Socioscope. Les administrateurs gardent leur accès. Elle ne modifie pas Pointage.</p><p>Les nouvelles requêtes sont bloquées immédiatement. Une page utilisateur déjà ouverte affiche la suspension au prochain appel ou lors du contrôle de session, au plus tard après environ une minute si la page reste active.</p></div></div>
   <div className="analysis-options"><button type="button" className={'btn '+(data.settings.suspended?'primary':'')} disabled={busy} onClick={()=>void toggle()}>{busy?'Mise à jour…':data.settings.suspended?'Rétablir les consultations utilisateurs':'Suspendre les consultations utilisateurs'}</button><a className="text-btn" href="https://supabase.com/dashboard/org/paizhlsoxfinykfqjifv/usage" target="_blank" rel="noreferrer">Ouvrir le relevé officiel Supabase</a></div>
   <p>Aucune remise à zéro automatique n’est appliquée à cette première version du suivi. Les plafonds Supabase sont évalués sur leur cycle de facturation ; votre accès administrateur reste soumis aux éventuelles restrictions de Supabase.</p>
   {days.length>0&&<div className="table-scroll"><table><caption>Derniers jours de suivi local</caption><thead><tr><th>Jour UTC</th><th>Storage avec cache</th><th>Sans cache estimé</th><th>Storage non classé</th></tr></thead><tbody>{days.map(day=>{const total=(bucket:string)=>rows.filter((r:any)=>r.day===day&&r.bucket===bucket).reduce((n:number,r:any)=>n+r.bytes,0);return <tr key={day}><td>{day.split('-').reverse().join('/')}</td><td>{gb(total('storage_cached'))}</td><td>{gb(total('storage_uncached')+total('api'))}</td><td>{gb(total('storage_unknown'))}</td></tr>;})}</tbody></table></div>}
  </>:<p>Chargement du suivi…</p>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
