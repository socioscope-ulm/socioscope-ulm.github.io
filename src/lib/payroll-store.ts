import {resources} from './store';
import {builtinReferences} from '../../server/references';
import type {PayrollReference} from './payroll-reference';
export async function payrollReferences(){const result=await resources().db.prepare('SELECT * FROM payroll_imports ORDER BY date,created').all<any>();return [...builtinReferences,...result.results.map(r=>({...r,payload:JSON.parse(r.payload)}))] as PayrollReference[];}
