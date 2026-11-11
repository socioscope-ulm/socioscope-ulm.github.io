import test from 'node:test';
import assert from 'node:assert/strict';
import {collectRupDateConflicts} from '../src/lib/rup-date-conflicts.ts';
import {normalizeRupCalendar} from '../src/lib/rup-calendar.ts';
const source=(id:string)=>({id,name:'RUP fictif '+id,date:'2025-12-31',status:'validated',hash:'',count:0});
const row=(nni:string,source:string,date:string,contract='AA',extra:any={})=>({nni,contrat:contract,entreeIEG:date,source,row:2,sheet:'Fictive',nom:'FICTIF',prenom:'Exemple',...extra}) as any;
const agent=(nni:string,contract='AA')=>({agentId:nni,nni,name:'FICTIF '+nni,contract,source:'photo',row:1,id:nni}) as any;
test('list names, date groups, source rows and span once per selected agent',()=>{
 const rup:any={sources:[source('old'),source('recent')],records:[row('Z00001','old','2001-01-01'),row('Z00001','old','2001-01-01'),row('Z00001','recent','2003-01-01'),row('Z00002','old','2001-01-01'),row('Z00002','recent','2003-01-01')]};
 const list=collectRupDateConflicts(rup,[agent('Z00001'),agent('Z00001')]);assert.equal(list.length,1);assert.equal(list[0].nni,'Z00001');assert.equal(list[0].spanDays,730);assert.equal(list[0].dates.length,2);assert.equal(list[0].dates[0].documents.length,1);assert.equal(list[0].dates[0].documents[0].row,2);assert.equal(list[0].status,'review');
});
test('documentary differences remain listed after a verified manual correction',()=>{
 const rup:any={sources:[source('old'),source('recent')],records:[row('Z00001','old','2001-01-01'),row('Z00001','recent','2003-01-01')]};
 const correction:any={date:'2003-01-01',source:'recent',row:2,contract:'AA'};
 const list=collectRupDateConflicts(rup,[agent('Z00001')],{Z00001:correction});assert.equal(list[0].status,'manual');assert.equal(list[0].selectedDate,'2003-01-01');
 assert.equal(collectRupDateConflicts(rup,[agent('Z00001')],{Z00001:{...correction,source:'missing'}})[0].status,'review');
});
test('separate contracts and disabled references do not create false differences',()=>{
 const rup:any={sources:[source('a'),{...source('off'),status:'disabled'}],records:[row('Z00001','a','2001-01-01'),row('Z00001','a','2003-01-01','BB'),row('Z00001','off','2005-01-01')]};
 assert.deepEqual(collectRupDateConflicts(rup,[agent('Z00001')]),[]);
});
test('Excel shifts already reconciled disappear, while genuine wider differences remain',()=>{
 const sources=['a','b','c','rup-imp-legacy'].map(source);const records=Array.from({length:24},(_,i)=>{const nni='Z'+String(i).padStart(5,'0');return ['a','b','c'].map(s=>row(nni,s,'2001-09-01')).concat(row(nni,'rup-imp-legacy','2001-08-31'));}).flat();
 const fixed=normalizeRupCalendar({sources,records} as any);assert.equal(collectRupDateConflicts(fixed,[agent('Z00000')]).length,0);
 fixed.sources.push(source('older'));fixed.records.push(row('Z00000','older','1999-09-01'));
 const list=collectRupDateConflicts(fixed,[agent('Z00000')]);assert.equal(list.length,1);assert.equal(list[0].dates.length,2);assert.ok(list[0].dates.find(d=>d.date==='2001-09-01')?.documents.some(d=>d.importedDate==='2001-08-31'));
});
