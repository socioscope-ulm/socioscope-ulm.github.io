import test from 'node:test';
import assert from 'node:assert/strict';
import {readCspRowAnnotations} from '../src/lib/csp-row-annotations.ts';
import {extractCspPages} from '../src/lib/csp-extract.ts';
import {validateCspEvent,cspKey} from '../src/lib/csp.ts';
import {enrichQuarterlyAnnotations} from '../src/lib/csp-quarterly-annotations.ts';
import type {CspPage,CspTextItem} from '../src/lib/csp-extract.ts';

const cell=(str:string,x:number,y:number,width=42):CspTextItem=>({str,x,y,width,height:10});
const page=(items:CspTextItem[]):CspPage=>({page:2,width:1000,height:595,items:[
 cell('CSP du 09/10/2026',650,540,190),
 cell('MESURES SALARIALES',25,490,250),
 ...items
]});
test('Extrait le motif de la bonne colonne et jamais la date, le NR ou les notes de contrôle',()=>{
 const pg=page([
  cell('NOM PRENOM',40,420,115),cell('GF',450,420,24),
  cell('ANCIEN NR',525,420,75),cell('NOUVEAU NR',610,420,65),
  cell('MOTIF',710,420,48),cell("DATE D'EFFET",845,420,100),
  cell('EXEMPLE ALICE',40,375,120),cell('18',450,375,20),
  cell('355',525,375,30),cell('360',610,375,30),
  cell('NR encouragement à la mobilité',701,375,130),cell('01/09/2026',845,375,85)
 ]);
 const note=readCspRowAnnotations(pg,420,pg.items.filter(i=>i.y===375));
 assert.deepEqual(note,{movementReason:'NR encouragement à la mobilité'});
 const odj=extractCspPages([pg],'cr').events[0];
 assert.equal(odj.kind,'mesure');
 assert.equal(odj.movementReason,'NR encouragement à la mobilité');
 assert.equal(odj.observations,undefined);
 assert.equal(odj.nrBefore,355);
 assert.equal(odj.nrAfter,360);
 assert.equal(validateCspEvent(odj),true);
 const without={...odj,movementReason:undefined};
 assert.equal(cspKey(odj),cspKey(without),'le motif imprimé ne change pas la clé de décision');
});
test('Observations pour information : rattachement par ligne y compris lorsqu elles sont sous le nom',()=>{
 const items=[
  cell('BENEFICIAIRES POTENTIELS',35,420,130),
  cell('GF',195,420,20),cell('NR',260,420,20),
  cell('CUMUL',510,420,42),cell('NOMBRE',605,432,52),
  cell('DE NR',605,420,45),cell('ACCORDE',605,408,57),
  cell('NOUVEAU',690,427,60),cell('NR',704,414,20),
  cell('REPORT',745,420,50),cell('OBSERVATIONS',855,420,110),
  cell('EXEMPLE ALICE',40,370,105),cell('14',195,370,22),
  cell('250',260,370,30),cell('1',616,370,12),cell('255',704,370,30),
  cell('Accord Parcours des Mandatés',860,367,120),
  cell('EXEMPLE BERNARD',40,325,130),cell('15',195,325,22),
  cell('240',260,325,30),cell('1',616,325,12),cell('245',704,325,30),
  cell('Accord de carrière',860,321,100)
 ];
 const pg: CspPage={page:6,width:1000,height:595,items:[
  cell('CSP du 11/09/2026',700,540,180),
  cell('AVANCEMENT AU CHOIX AU 1ER JANVIER 2026',35,485,320),
  ...items
 ]};
 const r=extractCspPages([pg],'cr');
 assert.equal(r.events.length,2);
 assert.deepEqual(r.events.map(e=>e.observations),['Accord Parcours des Mandatés','Accord de carrière']);
 assert.deepEqual(r.events.map(e=>e.nrSteps),[1,1]);
});
test('Ne crée pas de notes inventées si le document ne contient pas de colonne correspondante',()=>{
 const pg=page([cell('NOM PRENOM',40,420,115),cell('GF',450,420,24),cell('NR',610,420,40),
  cell("DATE D'EFFET",845,420,100),cell('EXEMPLE ALICE',40,375,120),cell('18',450,375,20),cell('355',610,375,30),cell('01/09/2026',845,375,85)]);
 assert.deepEqual(readCspRowAnnotations(pg,420,pg.items.filter(i=>i.y===375)),{});
});
test('Relecture historique : enrichit uniquement le motif et les observations pour le bon mouvement',()=>{
 const original=[
  {id:'p2r0',name:'EXEMPLE ALICE',kind:'avancement',effective:'2026-01-01',page:2,selected:true,approved:true,nrSteps:1,recordedBefore:{nr:250},recordedAfter:{nr:255}},
  {id:'p2r1',name:'EXEMPLE ALICE',kind:'avancement',effective:'2026-01-01',page:2,selected:true,approved:true,nrSteps:1,recordedBefore:{nr:255},recordedAfter:{nr:260}}
 ];
 const extracted=[
  {id:'p2r0',name:'EXEMPLE ALICE',kind:'avancement',effective:'2026-01-01',page:2,selected:true,movementReason:'Avancement annuel',observations:'Confirmé'},
  {id:'p2r1',name:'EXEMPLE ALICE',kind:'avancement',effective:'2026-01-01',page:2,selected:true,movementReason:'Autre avancement',observations:'À distinguer'}
 ];
 const copy=JSON.stringify(original);
 const enriched=enrichQuarterlyAnnotations(original,extracted);
 assert.equal(enriched[0].movementReason,'Avancement annuel');
 assert.equal(enriched[1].observations,'À distinguer');
 assert.equal(enriched[0].nrSteps,1);
 assert.equal(JSON.stringify(original),copy,'les données validées ne sont jamais modifiées');
 assert.deepEqual(enrichQuarterlyAnnotations(original,[{...extracted[0],id:'unknown'}]),original,
  'un avancement distinct ne doit jamais prendre le texte d une autre ligne');
});
