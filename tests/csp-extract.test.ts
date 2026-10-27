import test from 'node:test';import assert from 'node:assert/strict';import {extractCspPages} from '../src/lib/csp-extract.ts';
import type {CspPage,CspTextItem} from '../src/lib/csp-extract.ts';
const item=(str:string,x:number,y:number,width=100):CspTextItem=>({str,x,y,width,height:10});
const page=(n:number,title:string,body:CspTextItem[]):CspPage=>({page:n,width:842,height:595,items:[item("CSP DES METIERS D'APPUI INDUSTRIELS A LA PRODUCTION du 24/03/2026",440,530,360),item(title,36,450,340),...body]});
test('PDF coordinates distinguish destination job, range and service from current employee situation; NR stays unset when not printed',()=>{
 const p=page(1,'NOMINATIONS AUX POSTES VACANTS',[
  item('Emploi :',130,402,36),item('26-00001.01 TECHNICIEN CONFIRME H/F',174,402,156),item('UM :',346,402,24),item('UNITE LOGISTIQUE MAINTENANCE',372,402,170),
  item('GF de publication :',90,370,84),item('09-10-11',175,370,40),item('DUM :',345,370,25),item('AMT EST',372,370,62),item('SDUM :',345,350,26),item('SERVICE MACHINES TOURNANTES',372,350,170),
  item('NOM PRENOM',75,280,100),item('EMPLOI',315,280,80),item('LOCALISATION',530,280,120),item('APTITUDE',710,280,70),
  item('EXEMPLE ALICE',78,240,120),item('ANCIEN EMPLOI',265,240,130),item('UNITE AUTRE / ANCIENNE AGENCE',455,240,180),item("Candidature retenue - 1 GF - Date d'effet 01/04/2026",700,240,110)
 ]);
 const r=extractCspPages([p]);assert.equal(r.date,'2026-03-24');assert.equal(r.events.length,1);const e=r.events[0];assert.equal(e.job,'TECHNICIEN CONFIRME');assert.equal(e.agency,'AMT EST');assert.equal(e.team,'SERVICE MACHINES TOURNANTES');assert.equal(e.m3e,'0911');assert.equal(e.gfDelta,1);assert.equal(e.nrAfter,undefined);assert.equal(e.nrSteps,undefined);assert.equal(e.effective,'2026-04-01');assert.match(e.location!,/ANCIENNE/);
});
test('salary increments are read separately from date and agency, and duplicate page evidence is retained',()=>{
 const cells=[item('NOM PRENOM',150,400,100),item('UM/DUM',450,400,80),item('NOMBRE DE NR',605,400,80),item("DATE D’EFFET",720,400,80),item('EXEMPLE ALICE',140,350,120),item('UNITE LOGISTIQUE MAINTENANCE / AMT EST',290,350,240),item('2',632,350,8),item('01/01/2026',735,350,55)];
 const r=extractCspPages([page(1,'AVANCEMENT AU CHOIX',cells),page(2,'AVANCEMENT AU CHOIX',cells)]);assert.equal(r.events.length,1);assert.equal(r.duplicates,1);assert.equal(r.events[0].nrSteps,2);assert.deepEqual(r.events[0].pages,[1,2]);
});
test('no-candidate, collective information and unsupported pages have explicit coverage reports',()=>{
 const r=extractCspPages([page(1,'NOMINATIONS AUX POSTES VACANTS',[item('NOM PRENOM',75,280),item('PAS DE CANDIDAT',650,330)]),page(2,'SITUATION DES SALARIES EN LONGUE MALADIE AU REGARD DES AVANCEMENTS AU CHOIX',[]),page(3,'RUBRIQUE NOUVELLE',[])]);assert.equal(r.events.length,0);assert.deepEqual(r.reports.map(p=>p.status),['empty','empty','unsupported']);
});

test('a wrapped compound first name belongs to one dated RD mutation, including its full destination',()=>{
 const p=page(1,'MUTATION D’OFFICE',[
  item('NOM PRENOM',35,400,100),item('EMPLOI',370,400,70),item('LOCALISATION',600,400,120),item('GF',710,400,20),item('DATE D’EFFET',770,400,50),
  item('EXEMPLE PAUL',35,350,100),item('EMILE',35,338,50),item('RESPONSABLE',365,344,90),item('UNITE LOGISTIQUE MAINTENANCE / AGENCE FICTIVE /',590,350,90),item('SERVICE FICTIF / SITE FICTIF',590,338,90),item('GF constant',700,344,45),item('01/02/2026',770,344,60)
 ]);
 const r=extractCspPages([p],'rd');assert.equal(r.events.length,1);const e=r.events[0];assert.equal(e.name,'EXEMPLE PAUL EMILE');assert.equal(e.effective,'2026-02-01');assert.equal(e.gfDelta,0);assert.equal(e.agency,'AGENCE FICTIVE');assert.equal(e.team,'SERVICE FICTIF');assert.equal(e.selected,true);assert.equal(r.reports[0].count,1);
 const hyphen={...p,items:p.items.map(i=>i.str==='EXEMPLE PAUL'?{...i,str:'EXEMPLE PAUL-'}:i)};assert.equal(extractCspPages([hyphen],'rd').events[0].name,'EXEMPLE PAUL-EMILE');
});
test('two people with independent date cells remain two decisions even when a name is incomplete',()=>{
 const p=page(1,'MUTATION D’OFFICE',[
  item('NOM PRENOM',35,400,100),item('DATE D’EFFET',770,400,50),
  item('EXEMPLE PAUL',35,350,100),item('AUTRE',35,338,50),item('01/02/2026',770,350,60),item('01/02/2026',770,338,60)
 ]);
 assert.equal(extractCspPages([p],'rd').events.length,2);
});
