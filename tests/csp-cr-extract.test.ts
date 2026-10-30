import test from 'node:test';
import assert from 'node:assert/strict';
import {extractCspPages} from '../src/lib/csp-extract.ts';
import {prepareCsp,projectCsp,CSP_SOURCE,validateCspEvent,cspKey} from '../src/lib/csp.ts';
import type {CspPage,CspTextItem} from '../src/lib/csp-extract.ts';
import type {CspEvent} from '../src/lib/csp.ts';
import type {AgentData} from '../src/lib/agents.ts';
const item=(str:string,x:number,y:number,width=30):CspTextItem=>({str,x,y,width,height:8});
const page=(title:string,items:CspTextItem[],n=1):CspPage=>({page:n,width:842,height:595,items:[item('CSP du 24/03/2026',570,530,160),item(title,40,480,200),...items]});
const table=(title:string,headers:[string,number][],values:[string,number][],n=1)=>page(title,[...headers.map(([s,x])=>item(s,x,420)),...values.map(([s,x])=>item(s,x,380))],n);
const data:AgentData={sources:[{id:'annual',name:'Annual',date:'2025-12-31',seniorityDate:'2025-12-31',label:'Annual',primary:true,sheet:'',hash:'',rows:1,agents:1,confidence:''}],records:[{id:'one',source:'annual',row:1,name:'EXEMPLE ALICE',nni:'A12345',agentId:'A12345',gf:8,nr:100,agency:'AMT EST',job:'Technicien'}],events:[],issues:[],updated:''};
const headers:[string,number][]=[['NOM PRENOM',80],['UM/DUM',220],['Emploi',360],['ANCIEN GF',480],['ANCIEN NR',530],['NOUVEAU GF',580],['NOUVEAU NR',630],['DATE D’EFFET',750]];
const values:[string,number][]=[['EXEMPLE ALICE',80],['AMT EST',220],['TECHNICIEN',360],['8',480],['100',530],['9',580],['110',630],['01/01/2026',750]];
const event=(p:CspPage)=>extractCspPages([p],'cr').events[0];
test('ODJ absolute GF/NR values produce a ready reclassement and preserve RD duplicate detection',()=>{
 const e=event(table('RECLASSEMENT',headers,values));assert.equal(e.gfBefore,8);assert.equal(e.gfAfter,9);assert.equal(e.nrBefore,100);assert.equal(e.nrAfter,110);assert.equal(e.gfDelta,1);assert.equal(validateCspEvent(e),true);
 const p=prepareCsp(data,[e])[0];assert.equal(p.state,'ready');assert.equal(p.after?.nr,110);
 const rd={...e,agentId:'A12345',gfBefore:undefined,gfAfter:undefined,nrBefore:undefined,nrAfter:undefined};
 const prior={id:'csp-rd',name:'RD',date:'2026-03-24',status:'validated',events:[rd]};assert.equal(prepareCsp(data,[e],[prior])[0].state,'duplicate');
 const projected=projectCsp(data,[prior,{...prior,id:'csp-cr',events:[{...e,agentId:'A12345'}]}],'2026-10-01');assert.equal(projected.data.records.find(r=>r.source===CSP_SOURCE)?.nr,110);
});
test('ODJ salary progression uses the printed NR difference, rather than reading an absolute NR as an increment',()=>{
 const e=event(table('AVANCEMENT AU CHOIX',[['NOM PRENOM',80],['UM/DUM',220],['SDUM/FSDUM',360],['GF',480],['ANCIEN NR',530],['NOUVEAU NR',630],['DATE D’EFFET',750]],[['EXEMPLE ALICE',80],['AMT EST',220],['SERVICE',360],['8',480],['100',530],['110',630],['01/01/2026',750]]));
 assert.equal(e.nrSteps,2);assert.equal(e.gfBefore,8);assert.equal(prepareCsp(data,[e])[0].state,'ready');assert.equal(prepareCsp(data,[e])[0].after?.nr,110);
 assert.equal(prepareCsp({...data,records:[{...data.records[0],nr:95}]},[e])[0].state,'blocked');
});
test('ODJ admissions include entry GF and NR, job and agency, and become ready with a certain RUP identity',()=>{
 const e=event(table('ADMISSION AU STAGE',[['NOM PRENOM',60],['UM/DUM',200],['SDUM/FSDUM',320],['DATE DEBUT STAGE',420],['DIPLOME',500],['EMPLOI',590],['M3E',650],['GF',680],['NR',710]],[['NOUVELLE CLAIRE',60],['UNITE LOGISTIQUE MAINTENANCE / AMT EST',200],['SERVICE / EQUIPE',320],['01/02/2026',420],['BTS',500],['TECHNICIEN',590],['G',650],['8',680],['100',710]]));
 assert.equal(e.agency,'AMT EST');assert.equal(e.job,'TECHNICIEN');assert.equal(e.team,'SERVICE');assert.equal(e.gfAfter,8);assert.equal(e.nrAfter,100);
 const p=prepareCsp({...data,cspIdentities:[{name:e.name,nni:'C12345',source:'rup',date:'2026-09-30'}]},[e])[0];assert.equal(p.state,'ready');assert.equal(p.agentId,'C12345');assert.equal(p.after?.nr,100);
 const rd={...e,nrAfter:undefined};assert.equal(cspKey(e),cspKey(rd));
});
test('ODJ mutation joins wrapped names and reads destination while preserving the printed GF/NR',()=>{
 const p=table('MUTATION D’OFFICE',[['NOM PRÉNOM',40],['ANCIEN EMPLOI',130],['LOCALISATION',230],['GF',310],['NR',340],['NOUVEL EMPLOI',390],['LOCALISATION',540],['GF',650],['NR',680],['DATE D’EFFET',750]],[['EXEMPLE',40],['TECHNICIEN',130],['AMT CENTRE',230],['8',310],['100',340],['RESPONSABLE',390],['UNITE LOGISTIQUE MAINTENANCE / AMT EST / SERVICE',540],['8',650],['100',680],['01/01/2026',750]]);
 p.items.push(item('ALICE',40,370));const e=event(p);assert.equal(e.name,'EXEMPLE ALICE');assert.equal(e.agency,'AMT EST');assert.equal(e.team,'SERVICE');assert.equal(e.job,'RESPONSABLE');assert.equal(e.gfDelta,0);assert.equal(prepareCsp(data,[e])[0].state,'ready');
 assert.equal(cspKey(e),cspKey({...e,gfBefore:undefined,gfAfter:undefined,nrBefore:undefined,nrAfter:undefined}));
});
test('ODJ titularisation selects titularisation date, not the admission date in the preceding column',()=>{
 const e=event(table('TITULARISATION',[['NOM PRENOM',80],['DATE ADMISSION STAGE',400],['DATE TITULARISATION',550],['GF',650],['NR',700]],[['EXEMPLE ALICE',80],['01/02/2025',400],['01/02/2026',550],['8',650],['100',700]]));assert.equal(e.effective,'2026-02-01');assert.equal(e.gfBefore,8);assert.equal(e.nrBefore,100);assert.equal(e.gfAfter,8);assert.equal(e.nrAfter,100);const ready=prepareCsp({...data,records:[{...data.records[0],nr:undefined}]},[e])[0];assert.equal(ready.state,'ready',ready.problem);assert.equal(ready.before?.nr,100);assert.equal(ready.after?.nr,100);assert.equal(prepareCsp({...data,records:[{...data.records[0],nr:105}]},[e])[0].state,'blocked');
});
test('unreadable candidate lists are reported and collective information remains informational',()=>{
 const r=extractCspPages([page("BORDEREAU DES CANDIDATS A L'EMPLOI",[item('EXEMPLE ALICE',80,380)]),page('SITUATION DES SALARIES EN LONGUE MALADIE AU REGARD DES AVANCEMENTS AU CHOIX',[])],'cr');assert.equal(r.events.length,0);assert.deepEqual(r.reports.map(r=>r.status),['unsupported','empty']);assert.match(r.reports[0].note,/non reconnu/);
});
test('missing or inconsistent ODJ values stay blocked, including historical and duplicate decisions',()=>{
 for(const v of [values.filter(([s])=>s!=='110'),values.map(([s,x])=>[s==='110'?'115':s,x] as [string,number])]){
  const e=event(table('RECLASSEMENT',headers,v));assert.ok(e.extractionIssue);assert.equal(validateCspEvent(e),true);assert.equal(prepareCsp(data,[e])[0].state,'blocked');assert.equal(prepareCsp(data,[{...e,effective:'2025-01-01'}])[0].state,'blocked');
 }
});
test('contradictory versions in the same ODJ are grouped with page evidence and require explicit review',()=>{
 const a=table('RECLASSEMENT',headers,values),b=table('RECLASSEMENT',headers,values.map(([s,x])=>[s==='100'?'105':s==='110'?'115':s,x] as [string,number]),2);
 const r=extractCspPages([a,b],'cr');assert.equal(r.events.length,1);assert.deepEqual(r.events[0].pages,[1,2]);assert.match(r.events[0].extractionIssue!,/plusieurs situations/);assert.equal(prepareCsp(data,r.events)[0].state,'blocked');
});


test('ODJ candidate rows retain post reference and observed GF/NR while waiting for a RD',()=>{
 const p=page("BORDEREAU DES CANDIDATS A L'EMPLOI",[
  item('Emploi :',90,405,40),item('TECHNICIEN CONFIRME H/F',140,405,150),item('N° publication :',320,405,70),item('26-00001.01',395,405,60),
  item('DUM :',560,385,30),item('AMT EST',600,385,90),item('GF de publication :',50,365,90),item('09-10-11',150,365,70),item('Position M3E :',320,365,70),item('F',395,365,10),
  item('NOM PRENOM',75,280,100),item('EMPLOI',280,280,80),item('LOCALISATION',450,280,100),item('ANCIENNETE POSTE',570,280,30),item('ANCIENNETE GF',620,280,30),item('M3E',670,280,20),item('GF',710,280,15),item('NR',745,280,15),item('APTITUDE',790,280,30),
  item('EXEMPLE ALICE',75,240,100),item('TECHNICIEN',280,240,80),item('AMT CENTRE',450,240,100),item('2',570,240,10),item('4',620,240,10),item('G',670,240,10),item('9',710,240,10),item('140',745,240,15)
 ]);
 const r=extractCspPages([p],'cr');assert.equal(r.events.length,1);const e=r.events[0];assert.equal(e.candidacy,true);assert.equal(e.selected,true);assert.equal(e.effective,'');assert.equal(e.reference,'26-00001.01');assert.equal(e.job,'TECHNICIEN CONFIRME');assert.equal(e.agency,'AMT EST');assert.equal(e.m3e,'0911');assert.equal(e.gfBefore,9);assert.equal(e.nrBefore,140);assert.equal(e.nrAfter,undefined);assert.equal(validateCspEvent(e),true);assert.equal(prepareCsp(data,[e])[0].state,'blocked');
});

test('ODJ titularisation flags unreadable salary cells rather than silently discarding them',()=>{
 const e=event(table('TITULARISATION',[['NOM PRENOM',80],['DATE TITULARISATION',550],['GF',650],['NR',700]],[['EXEMPLE ALICE',80],['01/02/2026',550],['8',650],['illisible',700]]));
 assert.match(e.extractionIssue!,/NR avant absent/);assert.equal(prepareCsp(data,[e])[0].state,'blocked');
});
