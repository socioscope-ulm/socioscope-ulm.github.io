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
 const [contrib,setContrib]=useState(21);
 const [tax,setTax]=useState(0);
 const [pvpa,setPvpa]=useState(true);
 const [rpc,setRpc]=useState(true);
 const [engagement,setEngagement]=useState(true);
 const [autonomie,setAutonomie]=useState(true);
 const [extra,setExtra]=useState(0);
 const [primeDefaults,setPrimeDefaults]=useState({engagementRate:3.5,autonomieRate:4,asctMonthly:54.67,afeMonthly:113.63,familialMonthly:116.56});
 const [primeValues,setPrimeValues]=useState({engagementRate:3.5,autonomieRate:4,asctMonthly:54.67,afeMonthly:113.63,familialMonthly:116.56});
 const [asct,setAsct]=useState(false);
 const [afe,setAfe]=useState(false);
 const [familial,setFamilial]=useState(false);
 useEffect(()=>{const c=new AbortController();fetch('/api/prime-settings',{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Paramètres des primes indisponibles');setPrimeDefaults(d.settings);setPrimeValues(d.settings);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[revision]);
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
 const cadreEligible=Number(gf)>=12;
 const rpcAnnual=rpc&&bonus?.payload?.bonuses?.[gf]!=null?Number(bonus.payload.bonuses[gf]):0;
 const pvpaAnnual=cadreEligible&&pvpa&&Number(grid?.date.slice(0,4))>=2025?PVPA_2025_BY_GF_CENTS[gf]||0:0;
 const engagementMonthly=base!==null&&cadreEligible&&engagement?Math.round(base*primeValues.engagementRate/100):0;
 const autonomieMonthly=base!==null&&cadreEligible&&autonomie?Math.round(base*primeValues.autonomieRate/100):0;
 const asctAnnual=asct?Math.round(primeValues.asctMonthly*100)*12:0;
 const afeAnnual=afe?Math.round(primeValues.afeMonthly*100)*12:0;
 const familialAnnual=familial?Math.round(primeValues.familialMonthly*100)*12:0;
 const engagementAnnual=engagementMonthly*12;
 const autonomieAnnual=autonomieMonthly*12;
 const annualBonus=rpcAnnual+pvpaAnnual+engagementAnnual+autonomieAnnual+asctAnnual+afeAnnual+familialAnnual+Math.round(extra*100);
 const annualGross=base===null?null:base*months+annualBonus;
 // Les scenarios "sans primes" excluent RPC/RPEM, PVPA, engagement, autonomie et autres primes.
 // Les chiffres mensuels "avec primes" sont des moyennes annuelles sur 12 mois.
 const annualBaseGross=base===null?null:base*months;
 const monthlyWithGross=annualGross===null?null:annualGross/12;
 const netBeforeTax=(gross:number|null)=>gross===null?null:gross*(1-contrib/100);
 const netAfterTax=(gross:number|null)=>{const net=netBeforeTax(gross);return net===null?null:net*(1-tax/100);};
 const input=(label:string,node:React.ReactNode)=><label style={{display:'flex',flexDirection:'column',gap:5,fontWeight:600,minWidth:0}}><span style={{minHeight:'2.6em',display:'flex',alignItems:'flex-end'}}>{label}</span>{node}</label>;
 const numberInput=(value:number,set:(v:number)=>void,min:number,max:number,step=1)=><input type="number" min={min} max={max} step={step} value={value} onChange={e=>set(Math.min(max,Math.max(min,numeric(e.target.value))))}/>;
 const card=(label:string,value:number|null)=><div className="panel" style={{padding:18}}><div style={{fontSize:13,color:'#596e68'}}>{label}</div><strong style={{fontSize:23}}>{euros(value)}</strong></div>;
 return <section aria-label="Simulateur de paie" style={{display:'grid',gap:18}}>
  <div className="panel"><h2>Simulateur de paie</h2><p>Simulation indicative à partir des grilles et primes validées dans les documents Socioscope. Tous les paramètres sont modifiables ; aucune fiche individuelle n'est modifiée.</p>{error&&<p role="alert">{error}</p>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:16}}>
    {input('Grille de rémunération',<select value={grid?.id||''} onChange={e=>{setGridId(e.target.value);setNr('');}}>{grids.map(r=><option key={r.id} value={r.id}>{r.name} · {r.date}</option>)}</select>)}
    {input('Grille des primes · RPC / RPEM / PVPA',<select value={bonus?.id||''} onChange={e=>setBonusId(e.target.value)}>{bonuses.map(r=><option key={r.id} value={r.id}>RPC / RPEM / PVPA · {r.date}</option>)}</select>)}
    {input('Majoration résidentielle',<select value={effectiveResidence} onChange={e=>{setResidence(e.target.value);setNr('');}}>{residences.map(r=><option key={r} value={r}>{((Number(r)-1)*100).toLocaleString('fr-FR',{maximumFractionDigits:2})} %</option>)}</select>)}
    {input('Groupe fonctionnel (GF)',<select value={gf} onChange={e=>setGf(e.target.value)}>{Array.from({length:19},(_,i)=>String(i+1)).map(v=><option key={v} value={v}>GF {v}</option>)}</select>)}
    {input('Niveau de rémunération (NR)',<select value={effectiveNr} onChange={e=>setNr(e.target.value)}>{nrs.map(v=><option key={v} value={v}>NR {v}</option>)}</select>)}
    {input('Échelon',<select value={level} onChange={e=>setLevel(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(v=><option key={v} value={v}>Échelon {v}</option>)}</select>)}
    {input('Nombre de mensualités de base par an',numberInput(months,setMonths,1,13))}
    {input('Cotisations salariales estimées (%)',numberInput(contrib,setContrib,0,70,.1))}
    {input('Taux de prélèvement à la source personnalisé (PAS, %)',<><input type="number" min={0} max={60} step={0.1} value={tax} onChange={e=>setTax(Math.min(60,Math.max(0,numeric(e.target.value))))}/><small style={{fontWeight:400,color:'#596e68'}}>Taux indicatifs : 0 %, 2 %, 5 %, 8 %, 10 %, 12,1 %, 12,3 %, 15 %, 20 %, 25 %, 30 %.</small></>)}
    {input('Autres primes brutes annuelles (€)',numberInput(extra,setExtra,0,1000000,.01))}
   </div>
   <div style={{display:'flex',flexWrap:'wrap',gap:18,marginTop:18}}><label><input type="checkbox" checked={rpc} onChange={e=>setRpc(e.target.checked)}/> Inclure RPC / RPEM</label><label><input type="checkbox" disabled={!cadreEligible} checked={cadreEligible&&pvpa} onChange={e=>setPvpa(e.target.checked)}/> Inclure PVPA (référence 2025)</label><label><input type="checkbox" disabled={!cadreEligible} checked={cadreEligible&&engagement} onChange={e=>setEngagement(e.target.checked)}/> Prime d’engagement · 3,5 % (cadres)</label><label><input type="checkbox" disabled={!cadreEligible} checked={cadreEligible&&autonomie} onChange={e=>setAutonomie(e.target.checked)}/> Prime d’autonomie · 4 % (cadres)</label></div>
   {!cadreEligible&&<p className="muted" role="status">PVPA, engagement et autonomie : primes réservées aux GF 12 et plus. Leur sélection est désactivée pour ce GF.</p>}
   <div style={{display:'grid',gap:12,marginTop:18}}><h3>Primes complémentaires · 12 mois</h3><p className="muted">Ces trois primes sont facultatives, ouvertes à tous les GF dans ce simulateur uniquement. Cochez une prime pour l'ajouter, puis personnalisez son montant mensuel si nécessaire.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
    {(['asct','afe','familial'] as const).map(key=>{const field=key==='asct'?'asctMonthly':key==='afe'?'afeMonthly':'familialMonthly';const selected=key==='asct'?asct:key==='afe'?afe:familial;const setSelected=key==='asct'?setAsct:key==='afe'?setAfe:setFamilial;return <div className="panel" key={key} style={{padding:12,display:'grid',gap:8}}><label><input type="checkbox" checked={selected} onChange={e=>setSelected(e.target.checked)}/> {key==='asct'?'ASCT':key==='afe'?'AFE':'Sursalaire familial'}</label><label style={{display:'grid',gap:5}}>Montant mensuel (€)<input type="number" min={0} max={100000} step={0.01} value={primeValues[field]} onChange={e=>setPrimeValues(v=>({...v,[field]:Math.min(100000,Math.max(0,numeric(e.target.value)))}))}/></label><small>Valeur par défaut : {primeDefaults[field].toLocaleString('fr-FR',{minimumFractionDigits:2})} € · 12 mois</small></div>;})}
   </div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>
    {(['engagementRate','autonomieRate'] as const).map(key=><label key={key} style={{display:'grid',gap:6}}>Taux personnalisé · {key==='engagementRate'?'Engagement':'Autonomie'} (%)<input type="number" min={0} max={100} step={0.01} value={primeValues[key]} onChange={e=>setPrimeValues(v=>({...v,[key]:Math.min(100,Math.max(0,numeric(e.target.value)))}))}/><small>Taux par défaut : {primeDefaults[key].toLocaleString('fr-FR')} % · GF 12 à 19 uniquement</small></label>)}
   </div></div>
  </div>
  {base===null?<p role="status">Aucun montant disponible pour cette combinaison de grille, majoration, NR et échelon. Sélectionnez une valeur présente dans les références validées.</p>:<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16}}>
    <div className="panel" style={{display:'grid',gap:10}}>
     <h3>Mensuel · sans primes</h3>
     {card('Brut de base',base)}
     {card('Net avant impôt',netBeforeTax(base))}
     {card('Net après impôt',netAfterTax(base))}
    </div>
    <div className="panel" style={{display:'grid',gap:10}}>
     <h3>Mensuel · avec primes</h3>
     {card('Brut moyen avec primes',monthlyWithGross)}
     {card('Net moyen avant impôt',netBeforeTax(monthlyWithGross))}
     {card('Net moyen après impôt',netAfterTax(monthlyWithGross))}
    </div>
    <div className="panel" style={{display:'grid',gap:10}}>
     <h3>Annuel · sans primes</h3>
     {card('Brut de base annuel',annualBaseGross)}
     {card('Net annuel avant impôt',netBeforeTax(annualBaseGross))}
     {card('Net annuel après impôt',netAfterTax(annualBaseGross))}
    </div>
    <div className="panel" style={{display:'grid',gap:10}}>
     <h3>Annuel · avec primes</h3>
     {card('Brut annuel avec primes',annualGross)}
     {card('Net annuel avant impôt',netBeforeTax(annualGross))}
     {card('Net annuel après impôt',netAfterTax(annualGross))}
    </div>
   </div>
   <p className="muted">Les montants mensuels avec primes sont des moyennes sur 12 mois. Les montants sans primes excluent toutes les primes sélectionnables et les autres primes annuelles ; l'annualisation du salaire de base reste réglable. Le PAS et les cotisations estimées s'appliquent aux deux scénarios.</p>
   <div className="panel"><h3>Détail annuel</h3><p>Base : {euros(base)} × {months} mensualités = {euros(base*months)}. RPC/RPEM : {euros(rpcAnnual)} ; PVPA : {euros(pvpaAnnual)} ; engagement : {euros(engagementAnnual)} ; autonomie : {euros(autonomieAnnual)} ; ASCT : {euros(asctAnnual)} ; AFE : {euros(afeAnnual)} ; sursalaire familial : {euros(familialAnnual)} ; autres primes : {euros(Math.round(extra*100))}.</p><p>Frais professionnels et remboursements : <strong>0 € inclus</strong> dans le brut ou le net simulé. PAS sélectionné : <strong>{tax.toLocaleString('fr-FR')} %</strong>. Le taux s'applique ici au net estimé avant impôt à titre simplifié ; le net fiscal exact peut différer.</p><p>Sources : {grid?.name} ({grid?.date}) ; {bonus?.name||'aucune grille de primes'} ({bonus?.date||'sans date'}). La PVPA utilise la moyenne 2025 intégrée aux calculs de masse salariale, lorsqu'elle est applicable. Pour les GF 12 à 19, les primes fixes engagement/autonomie sont calculées selon les taux personnalisables sur le brut mensuel de base, puis versées sur 12 mois indépendamment de l'annualisation sélectionnée. ASCT, AFE et sursalaire familial sont des primes facultatives sur 12 mois, réservées à cette simulation. Leur calcul ne dépend d'aucune grille de primes annuelle.</p><p><strong>Important :</strong> le net est une estimation calculée à partir de taux modifiables, sans prise en compte détaillée des cotisations, plafonds, avantages, absences ou de la situation fiscale individuelle. Le net après impôt applique un taux simplifié au net estimé et ne remplace pas le calcul réglementaire du prélèvement à la source. Les primes peuvent être versées à des dates différentes de la moyenne affichée.</p></div>
  </>}
 </section>;
}
