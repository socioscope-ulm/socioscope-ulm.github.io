'use client';
import {useEffect,useMemo,useState} from 'react';
import type {PayrollReference} from '../lib/payroll-reference';
import {selectReference} from '../lib/payroll-reference';
import {PVPA_2025_BY_GF_CENTS} from '../lib/agent-payroll';

const euros=(c:number|null)=>c===null?'Non calculable':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(c/100);
const numeric=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
export default function PaySimulator({revision=0}:{revision?:number}){
 const [refs,setRefs]=useState<PayrollReference[]>([]);
 const [error,setError]=useState('');
 const [gridId,setGridId]=useState('');
 const [bonusId,setBonusId]=useState('');
 const [residence,setResidence]=useState('1.245');
 const [gf,setGf]=useState('12');
 const [nr,setNr]=useState('200');
 const [level,setLevel]=useState(10);
 const [months,setMonths]=useState(12);
 const [contrib,setContrib]=useState(23);
 const [tax,setTax]=useState(0);
 const [pvpa,setPvpa]=useState(true);
 const [rpc,setRpc]=useState(true);
 const [extra,setExtra]=useState(0);
 useEffect(()=>{const c=new AbortController();fetch('/api/payroll',{signal:c.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Références salariales indisponibles ('+r.status+').');return r.json();}).then(d=>setRefs(d.references||[])).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[revision]);
 const grids=useMemo(()=>refs.filter(r=>r.kind==='grid'&&r.status==='validated').sort((a,b)=>b.date.localeCompare(a.date)),[refs]);
 const bonuses=useMemo(()=>refs.filter(r=>r.kind==='bonuses'&&r.status==='validated').sort((a,b)=>b.date.localeCompare(a.date)),[refs]);
 const grid=selectReference(refs,'grid',gridId)||grids[0];
 const bonus=selectReference(refs,'bonuses',bonusId)||bonuses[0];
 const rates=(grid?.payload?.rates||{}) as Record<string,Record<string,(number|null)[]>>;
 const residences=Object.keys(rates).sort((a,b)=>numeric(a)-numeric(b));
 const effectiveResidence=rates[residence]?residence:residences[0]||'';
 const nrs=Object.keys(rates[effectiveResidence]||{}).sort((a,b)=>Number(a)-Number(b));
 const effectiveNr=nrs.includes(nr)?nr:nrs[0]||'';
 const levels=rates[effectiveResidence]?.[effectiveNr]||[];
 const value=levels[level-1];
 const base=typeof value==='number'&&Number.isFinite(value)?value:null;
 const rpcAnnual=rpc&&bonus?.payload?.bonuses?.[gf]!=null?Number(bonus.payload.bonuses[gf]):0;
 const pvpaAnnual=pvpa&&Number(grid?.date.slice(0,4))>=2025?PVPA_2025_BY_GF_CENTS[gf]||0:0;
 const annualBonus=rpcAnnual+pvpaAnnual+Math.round(extra*100);
 const annualGross=base===null?null:base*months+annualBonus;
 const avgGross=annualGross===null?null:annualGross/12;
 const annualNet=annualGross===null?null:annualGross*(1-contrib/100);
 const annualNetTax=annualNet===null?null:annualNet*(1-tax/100);
 const input=(label:string,node:React.ReactNode)=><label style={{display:'flex',flexDirection:'column',gap:5,fontWeight:600}}>{label}{node}</label>;
 const numberInput=(value:number,set:(v:number)=>void,min:number,max:number,step=1)=><input type="number" min={min} max={max} step={step} value={value} onChange={e=>set(Math.min(max,Math.max(min,numeric(e.target.value))))}/>;
 const card=(label:string,value:number|null)=><div className="panel" style={{padding:18}}><div style={{fontSize:13,color:'#596e68'}}>{label}</div><strong style={{fontSize:23}}>{euros(value)}</strong></div>;
 return <section aria-label="Simulateur de paie" style={{display:'grid',gap:18}}>
  <div className="panel"><h2>Simulateur de paie</h2><p>Simulation indicative à partir des grilles et primes validées dans les documents Socioscope. Tous les paramètres sont modifiables ; aucune fiche individuelle n'est modifiée.</p>{error&&<p role="alert">{error}</p>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:16}}>
    {input('Grille de rémunération',<select value={grid?.id||''} onChange={e=>{setGridId(e.target.value);setNr('');}}>{grids.map(r=><option key={r.id} value={r.id}>{r.name} · {r.date}</option>)}</select>)}
    {input('Grille de primes',<select value={bonus?.id||''} onChange={e=>setBonusId(e.target.value)}>{bonuses.map(r=><option key={r.id} value={r.id}>{r.name} · {r.date}</option>)}</select>)}
    {input('Majoration résidentielle',<select value={effectiveResidence} onChange={e=>{setResidence(e.target.value);setNr('');}}>{residences.map(r=><option key={r} value={r}>{((Number(r)-1)*100).toLocaleString('fr-FR',{maximumFractionDigits:2})} %</option>)}</select>)}
    {input('Groupe fonctionnel (GF)',<select value={gf} onChange={e=>setGf(e.target.value)}>{Array.from({length:19},(_,i)=>String(i+1)).map(v=><option key={v} value={v}>GF {v}</option>)}</select>)}
    {input('Niveau de rémunération (NR)',<select value={effectiveNr} onChange={e=>setNr(e.target.value)}>{nrs.map(v=><option key={v} value={v}>NR {v}</option>)}</select>)}
    {input('Échelon',<select value={level} onChange={e=>setLevel(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(v=><option key={v} value={v}>Échelon {v}</option>)}</select>)}
    {input('Nombre de mensualités de base par an',numberInput(months,setMonths,1,13))}
    {input('Cotisations salariales estimées (%)',numberInput(contrib,setContrib,0,70,.1))}
    {input('Prélèvement à la source estimé (%)',numberInput(tax,setTax,0,60,.1))}
    {input('Autres primes brutes annuelles (€)',numberInput(extra,setExtra,0,1000000,.01))}
   </div>
   <div style={{display:'flex',flexWrap:'wrap',gap:18,marginTop:18}}><label><input type="checkbox" checked={rpc} onChange={e=>setRpc(e.target.checked)}/> Inclure RPC / RPEM</label><label><input type="checkbox" checked={pvpa} onChange={e=>setPvpa(e.target.checked)}/> Inclure PVPA (référence 2025)</label></div>
  </div>
  {base===null?<p role="status">Aucun montant disponible pour cette combinaison de grille, majoration, NR et échelon. Sélectionnez une valeur présente dans les références validées.</p>:<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:14}}>
    {card('Brut mensuel de base',base)}{card('Brut mensuel moyen avec primes',avgGross)}{card('Net mensuel moyen avant impôt',annualNet===null?null:annualNet/12)}{card('Net mensuel moyen après impôt',annualNetTax===null?null:annualNetTax/12)}
    {card('Brut annuel, primes comprises',annualGross)}{card('Net annuel estimé avant impôt',annualNet)}{card('Net annuel estimé après impôt',annualNetTax)}
   </div>
   <div className="panel"><h3>Détail annuel</h3><p>Base : {euros(base)} × {months} mensualités = {euros(base*months)}. RPC/RPEM : {euros(rpcAnnual)} ; PVPA : {euros(pvpaAnnual)} ; autres primes : {euros(Math.round(extra*100))}.</p><p>Sources : {grid?.name} ({grid?.date}) ; {bonus?.name||'aucune grille de primes'} ({bonus?.date||'sans date'}). La PVPA utilise la moyenne 2025 intégrée aux calculs de masse salariale, lorsqu'elle est applicable.</p><p><strong>Important :</strong> le net est une estimation calculée à partir de taux modifiables, sans prise en compte détaillée des cotisations, plafonds, avantages, absences ou de la situation fiscale individuelle. Le net après impôt applique un taux simplifié au net estimé et ne remplace pas le calcul réglementaire du prélèvement à la source. Les primes peuvent être versées à des dates différentes de la moyenne affichée.</p></div>
  </>}
 </section>;
}
