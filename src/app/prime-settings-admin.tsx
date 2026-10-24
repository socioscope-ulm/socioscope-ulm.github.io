'use client';
import {useEffect,useState} from 'react';

type Settings={engagementRate:number;autonomieRate:number;asctMonthly:number;afeMonthly:number;familialMonthly:number};
const initial:Settings={engagementRate:3.5,autonomieRate:4,asctMonthly:54.67,afeMonthly:113.63,familialMonthly:116.56};
const fields:{key:keyof Settings;name:string;unit:string}[]=[
 {key:'engagementRate',name:'Prime d’engagement (cadres GF 12 à 19)',unit:'% du brut mensuel'},
 {key:'autonomieRate',name:'Prime d’autonomie (cadres GF 12 à 19)',unit:'% du brut mensuel'},
 {key:'asctMonthly',name:'ASCT',unit:'€ par mois'},
 {key:'afeMonthly',name:'AFE',unit:'€ par mois'},
 {key:'familialMonthly',name:'Sursalaire familial',unit:'€ par mois'}
];
export default function PrimeSettingsAdmin({onSaved}:{onSaved?:()=>void}){
 const [values,setValues]=useState<Settings>(initial);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState('');
 const [saved,setSaved]=useState<Settings>(initial);
 useEffect(()=>{const controller=new AbortController();fetch('/api/prime-settings',{signal:controller.signal,cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Chargement impossible');const next={...initial,...d.settings};setValues(next);setSaved(next);}).catch(e=>{if(e.name!=='AbortError')setNotice('Chargement impossible : '+e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort();},[]);
 const valid=fields.every(f=>Number.isFinite(values[f.key])&&values[f.key]>=0&&values[f.key]<=(f.key.endsWith('Rate')?100:100000));
 const changed=fields.some(f=>values[f.key]!==saved[f.key]);
 const save=async()=>{
  if(!valid||busy)return;
  setBusy(true);setNotice('');
  try{const response=await fetch('/api/prime-settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({settings:values})});const d=await response.json();if(!response.ok)throw Error(d.error||'Enregistrement impossible');
  setSaved(d.settings);setValues(d.settings);setNotice('Paramètres enregistrés. Les prochaines simulations utilisent ces valeurs par défaut.');onSaved?.();
  }catch(e){setNotice('Erreur : '+(e as Error).message);}finally{setBusy(false);}
 };
 return <section className="panel" style={{display:'grid',gap:14}}>
  <div><h2>Paramètres des primes</h2><p>Modifier les valeurs par défaut sans intervention technique. Les taux d’engagement et d’autonomie servent aux calculs des cadres ; ASCT, AFE et sursalaire familial sont réservés au simulateur de paie, sans incidence sur les fiches individuelles et la masse salariale.</p></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:14}}>
   {fields.map(f=><label key={f.key} style={{display:'grid',gap:6,fontWeight:600}}>{f.name}<input type="number" min={0} max={f.key.endsWith('Rate')?100:100000} step={0.01} disabled={loading||busy} value={values[f.key]} onChange={e=>setValues(v=>({...v,[f.key]:e.target.value===''?NaN:Number(e.target.value)}))}/><small style={{fontWeight:400}}>{f.unit} · 12 mois</small></label>)}
  </div>
  <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}><button className="btn" type="button" disabled={loading||busy||!valid||!changed} onClick={()=>void save()}>{busy?'Enregistrement…':'Enregistrer les paramètres'}</button>{!valid&&<span role="alert">Veuillez saisir des nombres positifs valides.</span>}{notice&&<span role="status">{notice}</span>}</div>
 </section>;
}
