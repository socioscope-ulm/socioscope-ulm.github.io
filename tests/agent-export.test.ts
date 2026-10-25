import test from 'node:test';
import assert from 'node:assert/strict';
import {agentExportDetails} from '../src/lib/agent-export.ts';
import {careerSeniority,snapshot} from '../src/lib/agents.ts';
import {withRupCareer} from '../src/lib/rup.ts';

test('bulk export matches separate profile calculations including RUP corrections, disputed dates, archives and pending identities',()=>{
 const sources=[{id:'old',date:'2024-12-31',primary:true},{id:'current',date:'2025-12-31',primary:true}];
 const people=[{agentId:'A12345',nni:'A12345',name:'Corrected'},{agentId:'B12345',nni:'B12345',name:'Disputed',iegYears:20,seniorityDate:'2024-12-31'},{agentId:'C12345',nni:'C12345',name:'Archive'},{agentId:'pending',name:'Pending'}];
 const records=people.flatMap(p=>sources.filter(s=>p.agentId!=='C12345'||s.id==='old').map(s=>({...p,id:s.id+p.agentId,source:s.id,row:1,gf:8,nr:100})));
 const correction={date:'2000-01-01',source:'rup2',row:1,contract:'1',reason:'Validated correction',actor:'fixture',created:'2026-01-01'};
 const rup={sources:[],records:[{nni:'A12345',contrat:'1',entreeIEG:'1999-01-01',source:'rup1',row:1},{nni:'A12345',contrat:'1',entreeIEG:'2000-01-01',source:'rup2',row:1},{nni:'B12345',contrat:'1',entreeIEG:'1998-01-01',source:'rup1'},{nni:'B12345',contrat:'2',entreeIEG:'1999-01-01',source:'rup2'}],corrections:{A12345:correction}} as any;
 const base={sources,records,events:[],issues:[],updated:''} as any;
 const data=withRupCareer(base,rup);
 const rows=[...snapshot(data,'current'),snapshot(data,'old').find(r=>r.agentId==='C12345')!];
 const bulk=agentExportDetails(data,rows,'current');
 const separate=rows.map(row=>{
  const profile=withRupCareer({...base,records:records.filter(r=>r.agentId===row.agentId)}, {...rup,records:rup.records.filter((r:any)=>r.nni===row.agentId)});
  const career=careerSeniority(profile.records,base.sources,'2025-12-31','current');
  return {published:typeof (row as any).iegYears==='number'?(row as any).iegYears:null,years:typeof career?.years==='number'&&Number.isFinite(career.years)?career.years:null,method:career?.method||'Non calculable',date:'2025-12-31'};
 });
 assert.deepEqual(bulk,separate);
 assert.equal(bulk[0].method,'Date d’entrée IEG du RUP · correction administrative');
 assert.match(bulk[1].method,/RUP à vérifier/);
 assert.equal(bulk.length,4);
 assert.deepEqual(agentExportDetails(data,[],'current'),[]);
 assert.throws(()=>agentExportDetails(data,rows,'unknown'),/Date de photographie invalide/);
});
