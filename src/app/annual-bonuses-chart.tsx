'use client';
import {useEffect,useMemo,useState} from 'react';
import {LineChart,Line,CartesianGrid,XAxis,YAxis,Tooltip,Legend,ResponsiveContainer} from 'recharts';
import {bonusApplicable,type AnnualBonusRow,annualBonusLabel} from '../lib/bonus-tables';
type Ref={id:string;name:string;kind:string;status:string;payload:{paymentYear:number;objectiveYear:number;rows:Record<string,AnnualBonusRow>}};
const money=(c:number|null)=>c===null?'Non renseigné':new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(c/100);
export default function AnnualBonusesChart(){
 const [refs,setRefs]=useState<Ref[]>([]),[gf,setGf]=useState('12'),[selected,setSelected]=useState({rpc:true,rpem:true,pvpa:true}),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();fetch('/api/payroll',{signal:controller.signal,cache:'no-store'}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error||'Références de primes indisponibles');setRefs((v.references||[]).filter((x:Ref)=>x.kind==='bonus-detail'&&x.status==='validated'));}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
 const rows=useMemo(()=>refs.slice().sort((a,b)=>a.payload.objectiveYear-b.payload.objectiveYear||a.payload.paymentYear-b.payload.paymentYear).map(r=>{
  const values=r.payload.rows[gf]||{rpc:null,rpem:null,pvpa:null};
  return {reference:annualBonusLabel(r.payload.paymentYear,r.payload.objectiveYear),objectiveYear:r.payload.objectiveYear,paymentYear:r.payload.paymentYear,rpc:bonusApplicable(Number(gf),'rpc')&&values.rpc!==null?values.rpc/100:null,rpem:bonusApplicable(Number(gf),'rpem')&&values.rpem!==null?values.rpem/100:null,pvpa:bonusApplicable(Number(gf),'pvpa')&&values.pvpa!==null?values.pvpa/100:null};
 }),[gf,refs]);
 const visible=(['rpc','rpem','pvpa'] as const).filter(key=>selected[key]&&bonusApplicable(Number(gf),key));
 const colors={rpc:'#123b36',rpem:'#577991',pvpa:'#ba372b'};
 return <section aria-label="Évolution des primes annuelles" className="panel">
  <div className="panel-heading"><div><h2>Évolution des primes annuelles par GF</h2><p>Comparaison selon l'année des objectifs. L'année de versement figure dans chaque référence. Aucune interpolation des années manquantes.</p></div></div>
  <div className="analysis-options"><label>Groupe fonctionnel<select value={gf} onChange={e=>setGf(e.target.value)}>{Array.from({length:18},(_,i)=>19-i).map(g=><option key={g} value={g}>GF {g}</option>)}</select></label>{(['rpc','rpem','pvpa'] as const).map(key=><label key={key} style={{display:'inline-flex',gap:7,alignItems:'center'}}><input type="checkbox" checked={selected[key]} disabled={!bonusApplicable(Number(gf),key)} onChange={e=>setSelected(v=>({...v,[key]:e.target.checked}))}/>{key.toUpperCase()}</label>)}</div>
  {error&&<p role="alert">{error}</p>}
  {!rows.length?<p>Pas encore de référence annuelle validée.</p>:<>
   <div style={{width:'100%',height:320}}><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{top:16,right:24,bottom:60,left:15}}><CartesianGrid stroke="#e4e9e5" vertical={false}/><XAxis dataKey="reference" interval={0} angle={-20} height={86} textAnchor="end" tick={{fontSize:10}}/><YAxis tickFormatter={v=>v+' €'} width={85}/><Tooltip formatter={(v:any,n:any)=>[v===null?'Non renseigné':Number(v).toLocaleString('fr-FR',{style:'currency',currency:'EUR'}),n]} labelFormatter={(value)=>String(value)}/><Legend verticalAlign="top" height={30}/>{visible.map(key=><Line key={key} dataKey={key} name={key.toUpperCase()} type="linear" stroke={colors[key]} strokeWidth={2.5} dot={{r:5}} connectNulls={false}/>)}</LineChart></ResponsiveContainer></div>
   <div className="table-scroll"><table><thead><tr><th>Objectifs</th><th>Versement</th><th>RPC</th><th>RPEM</th><th>PVPA</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{r.objectiveYear}</td><td>{r.paymentYear}</td>{(['rpc','rpem','pvpa'] as const).map(key=><td key={key}>{!bonusApplicable(Number(gf),key)?'—':r[key]===null?'Non renseigné':money(Math.round(r[key]!*100))}</td>)}</tr>)}</tbody></table></div>
   <p className="filter-note">Les montants sont des primes moyennes annuelles par GF, pas des totaux réellement versés aux agents de l'unité. Les deux références 2025 sont distinguées par leur année d'objectifs.</p>
  </>}
 </section>;
}
