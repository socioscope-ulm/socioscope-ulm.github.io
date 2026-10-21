import {db} from './storage';
import type {PayrollReference} from '../src/lib/payroll-reference';

type Rates=Record<string,Record<string,number[]>>;
type Bonuses=Record<string,number>;
let cached:Promise<PayrollReference[]>|undefined;

// These immutable baseline values live in the private socioscope schema,
// not in the GitHub repository and not in the browser bundle.
export function builtinReferences():Promise<PayrollReference[]> {
 return cached ||= (async()=>{
  const {results}=await db.prepare('SELECT reference_name,payload FROM salary_references').all<{reference_name:string,payload:unknown}>();
  const items=new Map(results.map(x=>[x.reference_name,x.payload]));
  const historical=items.get('historical-salary-grids.json');
  const rates=items.get('salary-grid-2026.json');
  const bonuses=items.get('annual-bonuses-2025.json');
  if(!Array.isArray(historical)||!rates||typeof rates!=='object'||!bonuses||typeof bonuses!=='object')
   throw Error('Références salariales protégées indisponibles : reconstruction interrompue.');
  return [...historical as PayrollReference[],
   {id:'grid-2026',kind:'grid',name:'Grille IEG au 01/01/2026',date:'2026-01-01',status:'validated',created:'',payload:{rates:rates as Rates}},
   {id:'bonuses-2025',kind:'bonuses',name:'RPC / RPEM annuelles 2025 par GF',date:'2025-01-01',status:'validated',created:'',payload:{bonuses:bonuses as Bonuses}}
  ] as PayrollReference[];
 })().catch(e=>{cached=undefined;throw e;});
}
