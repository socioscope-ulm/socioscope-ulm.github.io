import {resources} from './store';
import {builtinReferences} from '../../server/references';
import type {PayrollReference} from './payroll-reference';
import {validateAnnualBonusDetails} from './bonus-tables';
export async function payrollReferences():Promise<PayrollReference[]>{
 const result=await resources().db.prepare("SELECT * FROM payroll_imports WHERE kind IN ('grid','bonus-detail') ORDER BY date,created").all<any>();
 const imported=result.results.map(r=>({...r,payload:JSON.parse(r.payload)})).filter(r=>r.kind==='grid'||r.kind==='bonus-detail'&&validateAnnualBonusDetails(r.payload));
 return [...await builtinReferences(),...imported] as PayrollReference[];
}
