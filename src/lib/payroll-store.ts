import {resources} from './store';
import {builtinReferences} from '../../server/references';
import type {PayrollReference} from './payroll-reference';
import {validateAnnualBonusDetails} from './bonus-tables';
export const DEFAULT_ANNUAL_BONUS_ID='payroll-primes-2025-objectifs-2025';
export async function activeAnnualBonusId(){
 const row=await resources().db.prepare("SELECT settings FROM prime_settings WHERE key='active-annual-bonuses'").first<any>();
 return typeof row?.settings?.id==='string'?row.settings.id:DEFAULT_ANNUAL_BONUS_ID;
}
export async function payrollReferences():Promise<PayrollReference[]>{
 const result=await resources().db.prepare("SELECT * FROM payroll_imports WHERE kind IN ('grid','bonus-detail') ORDER BY date,created").all<any>();
 const imported=result.results.map(r=>({...r,payload:JSON.parse(r.payload)})).filter(r=>r.kind==='grid'||r.kind==='bonus-detail'&&validateAnnualBonusDetails(r.payload));
 return [...await builtinReferences(),...imported] as PayrollReference[];
}
