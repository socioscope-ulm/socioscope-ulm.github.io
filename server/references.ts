import grid from '../private-data/references/salary-grid-2026.json' with {type:'json'};
import historicalGrids from '../private-data/references/historical-salary-grids.json' with {type:'json'};
import bonuses from '../private-data/references/annual-bonuses-2025.json' with {type:'json'};
import type {PayrollReference} from '../src/lib/payroll-reference';
export const builtinReferences:PayrollReference[]=[...historicalGrids as PayrollReference[],{id:'grid-2026',kind:'grid',name:'Grille IEG au 01/01/2026',date:'2026-01-01',status:'validated',created:'',payload:{rates:grid}},{id:'bonuses-2025',kind:'bonuses',name:'RPC / RPEM annuelles 2025 par GF',date:'2025-01-01',status:'validated',created:'',payload:{bonuses}}];
