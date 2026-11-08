import {db} from './storage';
import type {PayrollReference} from '../src/lib/payroll-reference';
type Rates=Record<string,Record<string,number[]>>;
export async function builtinReferences():Promise<PayrollReference[]>{
 const {results}=await db.prepare("SELECT reference_name,payload FROM salary_references WHERE reference_name IN ('historical-salary-grids.json','salary-grid-2026.json')").all<{reference_name:string,payload:unknown}>();
 const items=new Map(results.map(x=>[x.reference_name,x.payload]));
 const historical=items.get('historical-salary-grids.json'), rates=items.get('salary-grid-2026.json');
 if(!Array.isArray(historical)||!rates||typeof rates!=='object')throw Error('Grilles salariales protégées indisponibles.');
 return [...(historical as PayrollReference[]).filter(r=>r.kind==='grid'),{id:'grid-2026',kind:'grid',name:'Grille IEG au 01/01/2026',date:'2026-01-01',status:'validated',created:'',payload:{rates:rates as Rates}}];
}
