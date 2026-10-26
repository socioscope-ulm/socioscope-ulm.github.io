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
test('CR absolute GF/NR values produce a ready reclassement and preserve RD duplicate detection',()=>{
 const e=event(table('RECLASSEMENT',headers,values));assert.equal(e.gfBefore,8);assert.equal(e.gfAfter,9);assert.equal(e.nrBefore,100);assert.equal(e.nrAfter,110);assert.equal(e.gfDelta,1);assert.equal(validateCspEvent(e),true);
 const p=prepareCsp(data,[e])[0];assert.equal(p.state,'ready');assert.equal(p.after?.nr,110);
 const rd={...e,agentId:'A12345',gfBefore:undefined,gfAfter:undefined,nrBefore:undefined,nrAfter:undefined};
 const prior={id:'csp-rd',name:'RD',date:'2026-03-24',status:'validated',events:[rd]};assert.equal(prepareCsp(data,[e],[prior])[0].state,'duplicate');
 const projected=projectCsp(data,[prior,{...prior,id:'csp-cr',events:[{...e,agentId:'A12345'}]}],'2026-10-01');assert.equal(projected.data.records.find(r=>r.source===CSP_SOURCE)?.nr,110);
});
test('CR salary progression uses the printed NR difference, rather than reading an absolute NR as an increment',()=>{
 const e=event(table('AVANCEMENT AU CHOIX',[['NOM PRENOM',80],['UM/DUM',220],['SDUM/FSDUM',360],['GF',480],['ANCIEN NR',530],['NOUVEAU NR',630],['DATE D’EFFET',750]],[['EXEMPLE ALICE',80],['AMT EST',220],['SERVICE',360],['8',480],['100',530],['110',630],['01/01/2026',750]]));
 assert.equal(e.nrSteps,2);assert.equal(e.gfBefore,8);assert.equal(prepareCsp(data,[e])[0].state,'ready');assert.equal(prepareCsp(data,[e])[0].after?.nr,110);
 assert.equal(prepareCsp({...data,records:[{...data.records[0],nr:95}]},[e])[0].state,'blocked');
});
test('CR admissions include entry GF and NR, job and agency, and become ready with a certain RUP identity',()=>{
 const e=event(table('ADMISSION AU STAGE',[['NOM PRENOM',60],['UM/DUM',200],['SDUM/FSDUM',320],['DATE DEBUT STAGE',420],['DIPLOME',500],['EMPLOI',590],['M3E',650],['GF',680],['NR',710]],[['NOUVELLE CLAIRE',60],['UNITE LOGISTIQUE MAINTENANCE / AMT EST',200],['SERVICE / EQUIPE',320],['01/02/2026',420],['BTS',500],['TECHNICIEN',590],['G',650],['8',680],['100',710]]));
 assert.equal(e.agency,'AMT EST');assert.equal(e.job,'TECHNICIEN');assert.equal(e.team,'SERVICE');assert.equal(e.gfAfter,8);assert.equal(e.nrAfter,100);
 const p=prepareCsp({...data,cspIdentities:[{name:e.name,nni:'C12345',source:'rup',date:'2026-09-30'}]},[e])[0];assert.equal(p.state,'ready');assert.equal(p.agentId,'C12345');assert.equal(p.after?.nr,100);
 const rd={...e,nrAfter:undefined};assert.equal(cspKey(e),cspKey(rd));
});
test('CR mutation joins wrapped names and reads destination while preserving the printed GF/NR',()=>{
 const p=table('MUTATION D’OFFICE',[['NOM PRÉNOM',40],['ANCIEN EMPLOI',130],['LOCALISATION',230],['GF',310],['NR',340],['NOUVEL EMPLOI',390],['LOCALISATION',540],['GF',650],['NR',680],['DATE D’EFFET',750]],[['EXEMPLE',40],['TECHNICIEN',130],['AMT CENTRE',230],['8',310],['100',340],['RESPONSABLE',390],['UNITE LOGISTIQUE MAINTENANCE / AMT EST / SERVICE',540],['8',650],['100',680],['01/01/2026',750]]);
 p.items.push(item('ALICE',40,370));const e=event(p);assert.equal(e.name,'EXEMPLE ALICE');assert.equal(e.agency,'AMT EST');assert.equal(e.team,'SERVICE');assert.equal(e.job,'RESPONSABLE');assert.equal(e.gfDelta,0);assert.equal(prepareCsp(data,[e])[0].state,'ready');
 assert.equal(cspKey(e),cspKey({...e,gfBefore:undefined,gfAfter:undefined,nrBefore:undefined,nrAfter:undefined}));
});
test('CR titularisation selects titularisation date, not the admission date in the preceding column',()=>{
 const e=event(table('TITULARISATION',[['NOM PRENOM',80],['DATE ADMISSION STAGE',400],['DATE TITULARISATION',550],['GF',650],['NR',700]],[['EXEMPLE ALICE',80],['01/02/2025',400],['01/02/2026',550],['8',650],['100',700]]));assert.equal(e.effective,'2026-02-01');assert.equal(e.gfAfter,undefined);assert.equal(e.nrAfter,undefined);
});
test('candidate lists and collective information stay in the PDF without creating nominations',()=>{
 const r=extractCspPages([page("BORDEREAU DES CANDIDATS A L'EMPLOI",[item('EXEMPLE ALICE',80,380)]),page('SITUATION DES SALARIES EN LONGUE MALADIE AU REGARD DES AVANCEMENTS AU CHOIX',[])],'cr');assert.equal(r.events.length,0);assert.deepEqual(r.reports.map(r=>r.status),['empty','empty']);assert.match(r.reports[0].note,/sans décision/);
});
test('missing or inconsistent CR values stay blocked, including historical and duplicate decisions',()=>{
 for(const v of [values.filter(([s])=>s!=='110'),values.map(([s,x])=>[s==='110'?'115':s,x] as [string,number])]){
  const e=event(table('RECLASSEMENT',headers,v));assert.ok(e.extractionIssue);assert.equal(validateCspEvent(e),true);assert.equal(prepareCsp(data,[e])[0].state,'blocked');assert.equal(prepareCsp(data,[{...e,effective:'2025-01-01'}])[0].state,'blocked');
 }
});
test('contradictory versions in the same CR are grouped with page evidence and require explicit review',()=>{
 const a=table('RECLASSEMENT',headers,values),b=table('RECLASSEMENT',headers,values.map(([s,x])=>[s==='100'?'105':s==='110'?'115':s,x] as [string,number]),2);
 const r=extractCspPages([a,b],'cr');assert.equal(r.events.length,1);assert.deepEqual(r.events[0].pages,[1,2]);assert.match(r.events[0].extractionIssue!,/plusieurs situations/);assert.equal(prepareCsp(data,r.events)[0].state,'blocked');
});
