'use client';
import {useEffect,useMemo,useState} from 'react';
import {PVPA_2025_BY_GF_CENTS} from '../lib/agent-payroll';
import {ANNUAL_BONUS_GFS,annualBonusLabel,bonusApplicable,legacyBonusSplit,validateAnnualBonusDetails,type AnnualBonusRow} from '../lib/bonus-tables';
import {ImportSubsection} from './import-workspace';

type Ref={id:string;kind:string;name:string;date:string;status:string;created?:string;payload:any};
const format=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'});
const shown=(value:number|null,applicable:boolean)=>!applicable?'—':value===null?'Non renseigné':format.format(value/100);
const title=(ref:Ref)=>ref.kind==='bonus-detail'?annualBonusLabel(ref.payload.paymentYear,ref.payload.objectiveYear):ref.id==='bonuses-2025'?'Primes versées en 2025 · objectifs 2025':ref.name;
const blank=()=>Object.fromEntries(ANNUAL_BONUS_GFS.map(gf=>[gf,{rpc:'',rpem:'',pvpa:''}])) as Record<string,Record<keyof AnnualBonusRow,string>>;
const cents=(s:string)=>{if(!s.trim())return null;const normalized=s.trim().replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(normalized)||Number(normalized)>100000)throw Error('Saisir un montant positif, avec au maximum deux décimales.');return Math.round(Number(normalized)*100);};
async function request(url:string,options?:RequestInit){const r=await fetch(url,options),j=await r.json();if(!r.ok)throw Error(j.error||'Action impossible.');return j;}
export default function BonusTables(){
 const [refs,setRefs]=useState<Ref[]>([]);
 const [selected,setSelected]=useState('');
 const [paymentYear,setPaymentYear]=useState('2026'),[objectiveYear,setObjectiveYear]=useState('2025');
 const [values,setValues]=useState(blank),[file,setFile]=useState<File|null>(null);
 const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=async()=>setRefs((await request('/api/payroll')).references||[]);
 useEffect(()=>{reload().catch(e=>setError(e.message));},[]);
 const docs=useMemo(()=>refs.filter(r=>r.kind==='bonuses'||r.kind==='bonus-detail').sort((a,b)=>b.date.localeCompare(a.date)||Number(b.payload?.objectiveYear||0)-Number(a.payload?.objectiveYear||0)||String(b.created||'').localeCompare(String(a.created||''))),[refs]);
 const current=docs.find(r=>r.id===selected)||docs.find(r=>r.id==='bonuses-2025')||docs[0];
 const record=(ref:Ref,gf:number):AnnualBonusRow=>{
  if(ref.kind==='bonus-detail')return ref.payload.rows?.[String(gf)]||{rpc:null,rpem:null,pvpa:null};
  const pair=legacyBonusSplit(ref.payload.bonuses||{},gf);
  return {...pair,pvpa:gf>=12?PVPA_2025_BY_GF_CENTS[String(gf)]??null:null};
 };
 const save=async()=>{
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{
   const rows:Record<string,AnnualBonusRow>={};
   for(const gf of ANNUAL_BONUS_GFS)rows[String(gf)]={rpc:bonusApplicable(gf,'rpc')?cents(values[gf].rpc):null,rpem:bonusApplicable(gf,'rpem')?cents(values[gf].rpem):null,pvpa:bonusApplicable(gf,'pvpa')?cents(values[gf].pvpa):null};
   const payload={paymentYear:Number(paymentYear),objectiveYear:Number(objectiveYear),rows,sourceName:file?.name||'Saisie manuelle'};
   if(!validateAnnualBonusDetails(payload))throw Error('Vérifier les années et renseigner au moins un montant. RPC/PVPA : GF 12–19 ; RPEM : GF 2–11.');
   const input={kind:'bonus-detail',date:paymentYear+'-01-01',payload};
   let response:any;
   if(file){const form=new FormData();form.set('file',file);form.set('extraction',JSON.stringify(input));response=await request('/api/payroll/import',{method:'POST',body:form});}
   else response=await request('/api/payroll/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
   await reload();setSelected(response.id);setChecked(false);setNotice('Tableau enregistré pour vérification. Aucun calcul existant n’a été modifié.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const validate=async()=>{
  if(!current||current.status!=='review'||!checked||busy)return;
  setBusy(true);setError('');setNotice('');
  try{await request('/api/payroll/import/'+encodeURIComponent(current.id),{method:'POST'});await reload();setChecked(false);setNotice('Tableau validé en consultation seule, sans incidence sur les projections et le simulateur.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <>
  <ImportSubsection title="Lire RPC, RPEM et PVPA par GF" badge={docs.length+' référence(s)'} defaultOpen>
   <section className="panel">
    <p>Les références distinguent l’année de <b>versement</b> de l’année des <b>objectifs</b>. « — » signifie non applicable ; « Non renseigné » désigne une donnée absente, différente de zéro.</p>
    {current&&<>
     <div className="analysis-options"><label style={{flex:'1 1 320px'}}>Référence<select value={current.id} onChange={e=>{setSelected(e.target.value);setChecked(false);}}>{docs.map(ref=><option key={ref.id} value={ref.id}>{title(ref)} · {ref.status==='validated'?'validée':'à vérifier'}</option>)}</select></label></div>
     <p><b>{title(current)}</b> · {current.status==='validated'?'Validée':'À vérifier'}<br/><small>Source : {current.kind==='bonus-detail'?current.payload.sourceName||current.name:current.name}</small></p>
     {current.kind==='bonuses'&&<p className="filter-note">Lecture des RPC/RPEM déjà enregistrées et de la PVPA technique 2025, gérée séparément. Cette présentation ne modifie aucun montant utilisé par les calculs.</p>}
     <div className="table-scroll"><table style={{minWidth:490,width:'100%'}}><thead><tr><th>GF</th><th>RPC annuelle</th><th>RPEM annuelle</th><th>PVPA annuelle</th></tr></thead><tbody>{ANNUAL_BONUS_GFS.map(gf=>{const row=record(current,gf);return <tr key={gf}><th>{gf}</th>{(['rpc','rpem','pvpa'] as const).map(key=><td key={key} style={{fontVariantNumeric:'tabular-nums'}}>{shown(row[key],bonusApplicable(gf,key))}</td>)}</tr>;})}</tbody></table></div>
     {current.id==='bonuses-2025'&&<a href="/sources/primes-2025.png" className="btn">Télécharger l’original 2025</a>}
     {current.kind==='bonus-detail'&&current.payload.hasOriginal&&<a href={'/api/payroll/files/'+current.id} className="btn">Télécharger l’original</a>}
     {current.kind==='bonus-detail'&&current.status==='review'&&<><label className="archive-toggle"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>J’ai vérifié les années, les montants et la répartition par GF.</label><button className="btn primary" disabled={!checked||busy} onClick={validate}>Valider la référence</button></>}
    </>}
    {notice&&<p className="notice" role="status">{notice}</p>}{error&&<p className="notice" role="alert">{error}</p>}
   </section>
  </ImportSubsection>
  <ImportSubsection title="Ajouter des primes par saisie manuelle" badge="Sans fichier obligatoire">
   <section className="panel">
    <p>Saisir les montants moyens annuels en euros. Les cases non applicables restent indisponibles. Un montant vide reste inconnu ; écrire 0 seulement si la source indique 0.</p>
    <div className="analysis-options"><label>Année de versement<input type="number" min="2000" max="2100" value={paymentYear} onChange={e=>setPaymentYear(e.target.value)}/></label><label>Année des objectifs<input type="number" min="2000" max="2100" value={objectiveYear} onChange={e=>setObjectiveYear(e.target.value)}/></label><label>Original facultatif<input type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.xls,.xlsx,.xlsm" onChange={e=>setFile(e.target.files?.[0]||null)}/></label></div>
    <div className="table-scroll"><table style={{minWidth:510,width:'100%'}}><thead><tr><th>GF</th><th>RPC (€)</th><th>RPEM (€)</th><th>PVPA (€)</th></tr></thead><tbody>{ANNUAL_BONUS_GFS.map(gf=><tr key={gf}><th>{gf}</th>{(['rpc','rpem','pvpa'] as const).map(key=><td key={key}>{bonusApplicable(gf,key)?<input type="number" min="0" step="0.01" placeholder="Non renseigné" aria-label={key.toUpperCase()+' GF '+gf} value={values[gf][key]} onChange={e=>setValues(old=>({...old,[gf]:{...old[gf],[key]:e.target.value}}))} style={{width:'100%',minWidth:110}}/>:'—'}</td>)}</tr>)}</tbody></table></div>
    <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy?'Enregistrement…':'Enregistrer pour vérification'}</button>
    <p className="filter-note">Référence supplémentaire de consultation uniquement. Les calculs de masse salariale et du simulateur continuent d’utiliser leurs références historiques, sans changement.</p>
   </section>
  </ImportSubsection>
 </>;
}
