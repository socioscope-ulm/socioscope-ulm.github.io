'use client';
import {useEffect,useMemo,useState} from 'react';
import {readAgentWorkbook} from '../lib/agents-import';
import {ANNUAL_BONUS_GFS,annualBonusLabel,bonusApplicable,validateAnnualBonusDetails,type AnnualBonusRow} from '../lib/bonus-tables';
import {ImportSubsection} from './import-workspace';
type Ref={id:string;kind:string;name:string;date:string;status:string;created?:string;payload:any};
const money=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'});
const display=(c:number|null,applies:boolean)=>!applies?'—':c===null?'Non renseigné':money.format(c/100);
const blank=()=>Object.fromEntries(ANNUAL_BONUS_GFS.map(gf=>[String(gf),{rpc:'',rpem:'',pvpa:''}])) as Record<string,Record<keyof AnnualBonusRow,string>>;
const parseEuro=(v:string)=>{const trimmed=v.replace(/\s/g,'').replace(',','.');if(!trimmed)return null;if(!/^\d+(?:\.\d{1,2})?$/.test(trimmed)||Number(trimmed)>100000)throw Error('Montant invalide : saisir un nombre positif en euros, au maximum deux décimales.');return Math.round(Number(trimmed)*100);};
const normalize=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const readAmounts=(rows:unknown[][])=>{
 const header=rows.findIndex(r=>r.some(c=>normalize(c)==='GF'));if(header<0)throw Error('Ligne d’en-tête GF introuvable.');
 const labels=rows[header].map(normalize),find=(label:string)=>labels.findIndex(x=>x===label);
 const gfIndex=find('GF'),indices={rpc:find('RPC'),rpem:find('RPEM'),pvpa:find('PVPA')};
 if(Object.values(indices).some(i=>i<0))throw Error('Le fichier doit comporter les colonnes GF, RPC, RPEM et PVPA.');
 const next=blank();let count=0;
 for(const row of rows.slice(header+1)){
  const gf=Number(row[gfIndex]);if(!ANNUAL_BONUS_GFS.includes(gf))continue;count++;
  for(const key of ['rpc','rpem','pvpa'] as const){
   if(!bonusApplicable(gf,key))continue;
   next[String(gf)][key]=String(row[indices[key]]??'').replace(/\s/g,'').replace('€','').replace(',','.');
  }
 }
 if(!count)throw Error('Aucun GF entre 2 et 19 trouvé dans le fichier.');
 return next;
};
async function api(url:string,options?:RequestInit){const response=await fetch(url,options);const body=await response.json();if(!response.ok)throw Error(body.error||'Action impossible.');return body;}
export default function BonusTables({onChanged}:{onChanged?:()=>void}){
 const [refs,setRefs]=useState<Ref[]>([]),[activeId,setActiveId]=useState(''),[selectedId,setSelectedId]=useState('');
 const [paymentYear,setPaymentYear]=useState('2026'),[objectiveYear,setObjectiveYear]=useState('2025');
 const [values,setValues]=useState(blank),[file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false),[checked,setChecked]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=async()=>{const d=await api('/api/payroll');setRefs(d.references||[]);setActiveId(d.activeBonusId||'');};
 useEffect(()=>{reload().catch(e=>setError(e.message));},[]);
 const docs=useMemo(()=>refs.filter(r=>r.kind==='bonus-detail').sort((a,b)=>b.payload.objectiveYear-a.payload.objectiveYear||b.payload.paymentYear-a.payload.paymentYear||String(b.created||'').localeCompare(String(a.created||''))),[refs]);
 const current=docs.find(r=>r.id===selectedId)||docs.find(r=>r.id===activeId)||docs[0];
 const pick=async(f:File|null)=>{
  setFile(f);setError('');
  if(!f||!(/\.(csv|xlsx?|xlsm)$/i.test(f.name)))return;
  try{
   const sheets=await readAgentWorkbook(f);
   if(!sheets.length)throw Error('Aucune feuille disponible.');
   setValues(readAmounts(sheets[0].rows));
   setNotice('Montants extraits du fichier ; contrôler toutes les cellules avant enregistrement.');
  }catch(e){setError('Lecture du fichier : '+(e as Error).message);}
 };
 const save=async()=>{
  setBusy(true);setError('');setNotice('');
  try{
   const rows:Record<string,AnnualBonusRow>={};
   for(const gf of ANNUAL_BONUS_GFS)rows[String(gf)]={rpc:bonusApplicable(gf,'rpc')?parseEuro(values[String(gf)].rpc):null,rpem:bonusApplicable(gf,'rpem')?parseEuro(values[String(gf)].rpem):null,pvpa:bonusApplicable(gf,'pvpa')?parseEuro(values[String(gf)].pvpa):null};
   const payload={paymentYear:Number(paymentYear),objectiveYear:Number(objectiveYear),rows,sourceName:file?.name||'Saisie manuelle'};
   if(!validateAnnualBonusDetails(payload))throw Error('Vérifier les années et la répartition : RPEM GF 2–11, RPC et PVPA GF 12–19.');
   const input={kind:'bonus-detail',date:paymentYear+'-01-01',payload};
   let result;
   if(file){const form=new FormData();form.set('file',file);form.set('extraction',JSON.stringify(input));result=await api('/api/payroll/import',{method:'POST',body:form});}
   else result=await api('/api/payroll/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
   await reload();setSelectedId(result.id);setChecked(false);
   setNotice('Nouvelle référence enregistrée pour vérification. Les calculs ne changent pas avant son activation explicite.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const validate=async()=>{
  if(!current||busy||current.status!=='review'||!checked)return;
  setBusy(true);setError('');
  try{await api('/api/payroll/import/'+encodeURIComponent(current.id),{method:'POST'});await reload();setChecked(false);onChanged?.();setNotice('Référence validée. Elle reste inactive tant que vous ne la choisissez pas pour les calculs.');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const activate=async()=>{
  if(!current||current.status!=='validated'||busy)return;
  setBusy(true);setError('');
  try{const result=await api('/api/payroll',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:current.id})});setActiveId(result.activeBonusId);onChanged?.();setNotice('Référence active modifiée : le simulateur et la masse salariale utilisent désormais cette même table.');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <ImportSubsection title="Primes annuelles par GF : consulter, saisir et valider" badge={docs.length+' tableau(x)'} defaultOpen>
  <section className="panel" style={{display:'grid',gap:14}}>
   <h2>Référentiel unique des primes annuelles</h2>
   <p>Une référence contient les années de versement et d’objectifs, la RPC, la RPEM et la PVPA par GF. La référence active alimente directement le simulateur et la masse salariale. Les années précédentes restent disponibles pour comparaison.</p>
   {current&&<>
    <label>Tableau enregistré
     <select value={current.id} onChange={e=>{setSelectedId(e.target.value);setChecked(false);}}>
      {docs.map(d=><option key={d.id} value={d.id}>{annualBonusLabel(d.payload.paymentYear,d.payload.objectiveYear)} · {d.status==='validated'?'validé':'à vérifier'}{d.id===activeId?' · ACTIVE POUR LES CALCULS':''}</option>)}
     </select>
    </label>
    <div><strong>{annualBonusLabel(current.payload.paymentYear,current.payload.objectiveYear)}</strong> · {current.id===activeId?'Référence active pour les calculs':current.status==='validated'?'Référence consultable':'En attente de validation'}<small style={{display:'block'}}>Origine : {current.payload.sourceName||current.name}</small></div>
    <div className="table-scroll"><table style={{width:'100%',minWidth:490}}><thead><tr><th>GF</th><th>RPC</th><th>RPEM</th><th>PVPA</th></tr></thead><tbody>{ANNUAL_BONUS_GFS.map(gf=><tr key={gf}><th>{gf}</th>{(['rpc','rpem','pvpa'] as const).map(key=><td key={key} style={{fontVariantNumeric:'tabular-nums'}}>{display(current.payload.rows?.[String(gf)]?.[key]??null,bonusApplicable(gf,key))}</td>)}</tr>)}</tbody></table></div>
    {current.payload.originalPath&&<a className="btn" href={current.payload.originalPath}>Télécharger le document d’origine</a>}
    {!current.payload.originalPath&&current.payload.hasOriginal&&<a className="btn" href={'/api/payroll/files/'+current.id}>Télécharger le document d’origine</a>}
    {current.status==='review'&&<><label className="archive-toggle"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>J’ai vérifié les montants, les années et les GF.</label><button className="btn primary" onClick={validate} disabled={busy||!checked}>Valider ce tableau</button></>}
    {current.status==='validated'&&current.id!==activeId&&<button className="btn" disabled={busy} onClick={activate}>Utiliser ce tableau pour les calculs</button>}
   </>}
   <p className="filter-note">« — » : prime non applicable ; « Non renseigné » : montant absent ; « 0 € » : zéro explicitement publié. GF 2 à 11 : RPEM. GF 12 à 19 : RPC et PVPA. La JDD n’est pas ajoutée.</p>
   <details><summary>Ajouter un tableau (fichier ou saisie manuelle)</summary>
    <div style={{display:'grid',gap:12,paddingTop:12}}>
     <div className="analysis-options"><label>Année de versement<input type="number" min="2000" max="2100" value={paymentYear} onChange={e=>setPaymentYear(e.target.value)}/></label><label>Année des objectifs<input type="number" min="2000" max="2100" value={objectiveYear} onChange={e=>setObjectiveYear(e.target.value)}/></label><label>Document source facultatif<input type="file" accept=".csv,.xls,.xlsx,.xlsm,.pdf,.png,.jpg,.jpeg" onChange={e=>{void pick(e.target.files?.[0]||null);}}/></label></div>
     <p>Excel ou CSV : les colonnes GF, RPC, RPEM et PVPA sont lues automatiquement. Pour une image ou un PDF, compléter les montants ci-dessous. Le document original est conservé en privé lorsqu’il est joint.</p>
     <div className="table-scroll"><table style={{minWidth:490,width:'100%'}}><thead><tr><th>GF</th><th>RPC (€)</th><th>RPEM (€)</th><th>PVPA (€)</th></tr></thead><tbody>{ANNUAL_BONUS_GFS.map(gf=><tr key={gf}><th>{gf}</th>{(['rpc','rpem','pvpa'] as const).map(key=><td key={key}>{bonusApplicable(gf,key)?<input type="number" step="0.01" min="0" aria-label={key.toUpperCase()+' GF '+gf} placeholder="Non renseigné" value={values[String(gf)][key]} onChange={e=>setValues(previous=>({...previous,[gf]:{...previous[gf],[key]:e.target.value}}))} style={{minWidth:105,width:'100%'}}/>:'—'}</td>)}</tr>)}</tbody></table></div>
     <button className="btn primary" disabled={busy} onClick={save}>{busy?'Enregistrement…':'Enregistrer pour vérification'}</button>
    </div>
   </details>
   {notice&&<p className="notice" role="status">{notice}</p>}{error&&<p className="notice" role="alert">{error}</p>}
  </section>
 </ImportSubsection>;
}
