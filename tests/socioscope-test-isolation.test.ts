import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {readAgentWorkbook,detectMapping,mapAgentRows} from '../src/lib/agents-import.ts';
import {parseRupFile,rupCareer} from '../src/lib/rup.ts';
import {careerSeniority} from '../src/lib/agents.ts';

const make=(head:string[],rows:unknown[][],name:string)=>{
 const workbook=XLSX.utils.book_new();
 const sheet=XLSX.utils.aoa_to_sheet([head,...rows]);
 XLSX.utils.book_append_sheet(workbook,sheet,'Test');
 return new File([XLSX.write(workbook,{bookType:'xlsx',type:'array'})],name);
};
test('les photographies fictives sont lues avec le vrai moteur Excel',async()=>{
 const headers=['NNI','Nom prénom','GF actuel','NR actuel','Ancienneté dans les IEG'];
 const first=make(headers,[['A10001','ALPHA SIMULATION',10,200,15],['A10002','BETA SIMULATION',9,170,7]],'photographie-fictive-2025.xlsx');
 const second=make(headers,[['A10001','ALPHA SIMULATION',10,205,16],['A10004','DELTA SIMULATION',6,130,2]],'photographie-fictive-2026.xlsx');
 const parse=async(f:File,date:string)=>{
   const sheet=(await readAgentWorkbook(f))[0];
   const mapping=detectMapping(sheet.rows[0].map(String));
   assert.equal(mapping.nni,0);
   assert.equal(mapping.nr,3);
   return mapAgentRows(sheet.rows,mapping,0,date);
 };
 const old=await parse(first,'2025-12-31'),newer=await parse(second,'2026-12-31');
 assert.equal(old.length,2);assert.equal(newer.length,2);
 const before=new Map(old.map(a=>[a.nni,a]));
 const after=new Map(newer.map(a=>[a.nni,a]));
 assert.equal(before.get('A10001')?.nr,200);
 assert.equal(after.get('A10001')?.nr,205);
 assert.equal(after.has('A10004'),true);
 assert.equal(after.has('A10002'),false);
});
test('le vrai moteur RUP recalcule une ancienneté fictive',async()=>{
 const rupFile=make(['NNI','Numéro contrat','Nom','Prénom','Date entrée IEG'],[['A10001','001','ALPHA','SIMULATION','2010-01-01']],'RUP-TEST-2026.xlsx');
 const rows=await parseRupFile(rupFile,'2026-12-31');
 assert.equal(rows.length,1);
 const career=rupCareer(rows,'A10001');
 assert.equal(career?.status,'confirmed');
 assert.equal(career?.date,'2010-01-01');
 const source={id:'test-2026',name:'test',hash:'',date:'2026-12-31',label:'test',sheet:'Test',primary:true,confidence:'test',seniorityDate:'2026-12-31',rows:1,agents:1,status:'validated'};
 const agent={id:'a',agentId:'A10001',nni:'A10001',source:'test-2026',row:2,name:'ALPHA SIMULATION',rupCareer:career};
 const computed=careerSeniority([agent],[source],'2026-12-31','test-2026');
 assert.equal(computed?.completedYears,16);
});
