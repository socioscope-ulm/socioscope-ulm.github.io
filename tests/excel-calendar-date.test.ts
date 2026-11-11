import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {excelCalendarDate} from '../src/lib/excel-calendar-date.js';
import {normalizeRupCalendar} from '../src/lib/rup-calendar.ts';
import {rupCareer,withRupCareer} from '../src/lib/rup.ts';
import {careerSeniority} from '../src/lib/agents.ts';
const row=(n:number,source:string,date='2001-09-01',extra:any={})=>({nni:'Z'+String(n).padStart(5,'0'),contrat:'AA',entreeIEG:date,entreeUnite:date,entreeUO:date,source,...extra}) as any;
const fixture=()=>({sources:['reference-a','reference-b','reference-c','rup-imp-shifted'].map(id=>({id,name:'Document fictif',date:'2026-01-01'})),records:Array.from({length:24},(_,n)=>['reference-a','reference-b','reference-c'].map(s=>row(n,s)).concat(row(n,'rup-imp-shifted','2001-08-31'))).flat()}) as any;
test('calendar dates remain identical across timezones, formats and Excel epochs',()=>{
 const script=`import XLSX from 'xlsx';import {readRupWorkbook} from './src/lib/rup-import.js';import {readAgentWorkbook} from './src/lib/agents-import.ts';
 const dates=['1997-09-01','2001-01-01','2024-02-29','2026-03-29','2026-10-25'];
 for(const date1904 of [false,true]){
 const sheet=XLSX.utils.aoa_to_sheet([['NNI','Nom','Prénom','Date entrée IEG','Date entrée dans l’UM','GF'],...dates.map((d,i)=>['Z'+String(i).padStart(5,'0'),'FICTIF','Exemple',(Date.parse(d+'T00:00:00Z')-Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30))/86400000,'01/02/2001',10])]);for(let i=2;i<dates.length+2;i++)sheet['D'+i].z='dd/mm/yyyy';
 const wb=XLSX.utils.book_new();wb.Workbook={WBProps:{date1904}};XLSX.utils.book_append_sheet(wb,sheet,'Test');
 for(const bookType of ['xlsx','xls']){const bytes=XLSX.write(wb,{type:'array',bookType});const rows=readRupWorkbook(bytes,'synthetic.'+bookType,XLSX);if(JSON.stringify(rows.map(r=>r.entreeIEG))!==JSON.stringify(dates))throw Error('Incorrect calendar date');if(rows.some(r=>r.calendarDateVersion!==2))throw Error('Missing parser version');
 const file=new File([bytes],'synthetic.'+bookType);const tables=await readAgentWorkbook(file);if(tables[0].rows[1][3]!==dates[0]||tables[0].rows[1][5]!==10)throw Error('Date or numeric cells altered');}}
 `;
 for(const TZ of ['UTC','Europe/Paris','America/New_York','Pacific/Auckland']){
  const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{cwd:process.cwd(),env:{...process.env,TZ},encoding:'utf8'});assert.equal(result.status,0,TZ+': '+result.stderr);
 }
 assert.equal(excelCalendarDate('31/02/2024'),null);assert.equal(excelCalendarDate(60),null);assert.equal(excelCalendarDate(0,true),'1904-01-01');
});
test('systematic negative-day drift is reconciled without changing archived rows',()=>{
 const rup=fixture();const repaired=normalizeRupCalendar(rup);const r=repaired.records.find((r:any)=>r.source==='rup-imp-shifted');
 assert.equal(r.entreeIEG,'2001-09-01');assert.equal(r.entreeUnite,'2001-09-01');assert.equal(r.calendarDateAdjustment.original.entreeIEG,'2001-08-31');assert.equal(rup.records.find((r:any)=>r.source==='rup-imp-shifted').entreeIEG,'2001-08-31');
 assert.equal(rupCareer(repaired.records,'Z00000','AA')?.status,'confirmed');assert.deepEqual(normalizeRupCalendar(repaired),repaired);
});
test('an isolated one-day discrepancy, a new parser and a conflicting contract are never silently corrected',()=>{
 const tiny=fixture();tiny.records=tiny.records.filter((r:any)=>r.nni==='Z00000');assert.equal(normalizeRupCalendar(tiny),tiny);
 const modern=fixture();modern.sources.at(-1).calendarDateVersion=2;assert.equal(normalizeRupCalendar(modern),modern);
 const mixed=fixture();mixed.records.push(row(80,'reference-a','2001-09-01',{contrat:'BB'}),row(80,'rup-imp-shifted','2001-08-31'));assert.equal(normalizeRupCalendar(mixed).records.at(-1)?.entreeIEG,'2001-08-31');
});
test('larger historical differences stay conflicts after a timezone correction',()=>{
 const rup=fixture();rup.records.push(row(0,'reference-d','1999-09-01'));rup.sources.push({id:'reference-d'});
 const fixed=normalizeRupCalendar(rup);assert.equal(rupCareer(fixed.records,'Z00000','AA')?.status,'conflict');
 assert.deepEqual(rupCareer(fixed.records,'Z00000','AA')?.dates,['1999-09-01','2001-09-01']);
});
test('explicit administrator corrections remain effective and restored seniority yields the documented date',()=>{
 const rup=normalizeRupCalendar(fixture());const record={id:'f',agentId:'Z00000',nni:'Z00000',name:'FICTIF Exemple',contract:'AA',source:'annual',row:1};
 const data:any={records:[record],sources:[{id:'annual',date:'2025-12-31',primary:true}],events:[],issues:[]};
 const enriched=withRupCareer(data,rup);assert.equal(careerSeniority(enriched.records,data.sources,'2025-12-31','annual')?.start,'2001-09-01');
 rup.corrections={Z00000:{date:'2001-08-31',source:'rup-imp-shifted',row:null,contract:'AA',reason:'Correction fictive vérifiée',actor:'test',created:''}};
 const manual=withRupCareer(data,rup);assert.equal(manual.records[0].rupCareer?.date,'2001-08-31');assert.ok(manual.records[0].rupCareer?.correction);
});
