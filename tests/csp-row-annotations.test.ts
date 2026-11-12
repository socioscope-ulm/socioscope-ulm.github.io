import test from 'node:test';
import assert from 'node:assert/strict';
import {readCspRowAnnotations,textItemOverlapsColumn} from '../src/lib/csp-row-annotations.ts';
import {extractCspPages} from '../src/lib/csp-extract.ts';
import {validateCspEvent,cspKey} from '../src/lib/csp.ts';
import {enrichQuarterlyAnnotations,recoverQuarterlyAnnotationsFromPages} from '../src/lib/csp-quarterly-annotations.ts';
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

test('Motif imprimé sur la ligne supérieure des en-têtes ODJ du T2',()=>{
 const pg=page([
  cell('MOTIF',709,467,48),
  cell('NOM PRENOM',40,420,115),cell('GF',450,420,24),
  cell('ANCIEN NR',525,420,75),cell('NOUVEAU NR',610,420,65),
  cell("DATE D'EFFET",845,420,100),
  cell('AGENT EXEMPLE',40,373,125),cell('13',450,373,22),
  cell('245',525,373,32),cell('250',610,373,32),
  cell('NR encouragement à la mobilité',704,373,142),cell('01/04/2026',845,373,90)
 ]);
 const report=extractCspPages([pg],'cr');
 assert.equal(report.events.length,1);
 const event=report.events[0];
 assert.equal(event.name,'AGENT EXEMPLE');
 assert.equal(event.kind,'mesure');
 assert.equal(event.movementReason,'NR encouragement à la mobilité');
 assert.equal(event.nrBefore,245);
 assert.equal(event.nrAfter,250);
});
test('Motif ODJ dans une colonne repérée : conserver le texte sur deux lignes et la date séparée',()=>{
 const pg=page([
  cell('NOM PRENOM',40,420,115),cell('GF',450,420,24),
  cell('ANCIEN NR',525,420,75),cell('NOUVEAU NR',610,420,65),
  cell('MOTIF DE LA MESURE',699,420,126),cell("DATE D'EFFET",845,420,100),
  cell('EXEMPLE ALICE',40,363,125),cell('13',450,363,22),
  cell('245',525,363,32),cell('250',610,363,32),
  cell('NR encouragement',704,378,112),
  cell('à la mobilité',704,362,94),cell('01/04/2026',845,363,90)
 ]);
 const report=extractCspPages([pg],'cr');
 assert.equal(report.events.length,1);
 const event=report.events[0];
 assert.equal(event.movementReason,'NR encouragement à la mobilité');
 assert.equal(event.nrAfter,250);
 assert.equal(event.effective,'2026-04-01');
});

test('ODJ paysage du T2 : le texte du motif déborde légèrement avant le bord gauche de la cellule',()=>{
 // Representative coordinates taken from a real landscape ODJ; anonymized.
 const pg:CspPage={page:2,width:841.9,height:595.3,items:[
  cell('CSP du 07/05/2026',650,540,180),
  cell('MESURES SALARIALES',40,490,230),
  cell('NOM PRENOM',66.6,384,63),
  cell('UM/DUM',215.4,384,37),
  cell('SDUM/FSDUM',350.8,384,61),
  cell('GF',470.2,384,12.5),
  cell('ANCIEN',501.8,389,37),cell('NR',512.6,379,13),
  cell('NOUVEAU',540.7,389,45),cell('NR',556.8,379,13),
  cell('MOTIF',652.7,384,28),
  cell('DATE',764.4,389,27),cell("D'EFFET",757.9,379,37.5),
  cell('AGENT EXEMPLE',53.8,351,110),
  cell('14',471.4,351,10.1),cell('265',511.6,351,15),cell('270',555.7,351,15.1),
  cell('NR encouragement à la mobilité',602.4,351,128.6),
  cell('01/04/2026',754.2,351,45)
 ]};
 assert.equal(textItemOverlapsColumn(cell('NR encouragement à la mobilité',602.4,351,128.6),615,722),true);
 assert.equal(textItemOverlapsColumn(cell('270',555.7,351,15.1),615,722),false);
 const notes=readCspRowAnnotations(pg,384,pg.items.filter(i=>i.y===351));
 assert.deepEqual(notes,{movementReason:'NR encouragement à la mobilité'});
 const parsed=extractCspPages([pg],'cr');
 assert.equal(parsed.events.length,1);
 const e=parsed.events[0];
 assert.equal(e.name,'AGENT EXEMPLE');
 assert.equal(e.kind,'mesure');
 assert.equal(e.movementReason,'NR encouragement à la mobilité');
 assert.equal(e.gfBefore,14);
 assert.equal(e.nrBefore,265);
 assert.equal(e.nrAfter,270);
 assert.equal(e.effective,'2026-04-01');
});

test('ODJ : retrouver le motif imprimé par le nom exact même si le nouvel analyseur change l identifiant',()=>{
 const pg:CspPage={page:2,width:841.9,height:595.3,items:[
  cell('CSP du 07/05/2026',650,540,180),cell('MESURES SALARIALES',40,490,230),
  cell('NOM PRENOM',66.6,384,63),cell('UM/DUM',215.4,384,37),
  cell('SDUM/FSDUM',350.8,384,61),cell('GF',470.2,384,12.5),
  cell('ANCIEN',501.8,389,37),cell('NR',512.6,379,13),
  cell('NOUVEAU',540.7,389,45),cell('NR',556.8,379,13),
  cell('MOTIF',652.7,384,28),cell('DATE',764.4,389,27),cell("D'EFFET",757.9,379,37.5),
  cell('AGENT EXEMPLE',53.8,351,110),cell('14',471.4,351,10.1),
  cell('265',511.6,351,15),cell('270',555.7,351,15.1),
  cell('NR encouragement à la mobilité',602.4,351,128.6),cell('01/04/2026',754.2,351,45)
 ]};
 const old=[{id:'old-corrected-event',name:'AGENT EXEMPLE',kind:'mesure',page:2,effective:'2026-04-01',
  selected:true,approved:true,recordedBefore:{gf:14,nr:265},recordedAfter:{gf:14,nr:270}}];
 const original=JSON.stringify(old);
 const recovered=recoverQuarterlyAnnotationsFromPages(old,[pg]);
 assert.equal(recovered[0].movementReason,'NR encouragement à la mobilité');
 assert.equal(recovered[0].recordedAfter.nr,270);
 assert.equal(JSON.stringify(old),original);
});
test('Commentaires sur plusieurs lignes : colonnes de largeur variable, ne jamais mélanger deux agents',()=>{
 const pg:CspPage={page:3,width:841.9,height:595.3,items:[
  cell('CSP du 10/04/2026',650,540,170),cell("MUTATION D'OFFICE",40,495,210),
  cell('NOM PRENOM',55,420,90),cell('UM/DUM',230,420,40),
  cell('GF',590,420,15),cell('NR',650,420,15),
  cell('COMMENTAIRES',752,420,81),
  cell('AGENT A',53,370,85),cell('17',590,370,12),cell('310',650,370,17),
  cell('Mutation à effet rétroactif',705,379,127),
  cell('avec prise de poste en agence',705,362,126),
  cell('AGENT B',53,305,84),cell('17',590,305,12),cell('315',650,305,17),
  cell('Observation distincte de B',701,302,135)
 ]};
 const original=[
  {id:'a',name:'AGENT A',kind:'mutation',page:3,effective:'2026-01-01',approved:true,selected:true},
  {id:'b',name:'AGENT B',kind:'mutation',page:3,effective:'2026-01-01',approved:true,selected:true}
 ];
 const extracted=recoverQuarterlyAnnotationsFromPages(original,[pg]);
 assert.match(extracted[0].observations||'',/Mutation à effet rétroactif/);
 assert.match(extracted[0].observations||'',/avec prise de poste en agence/);
 assert.doesNotMatch(extracted[0].observations||'',/distincte/);
 assert.equal(extracted[1].observations,'Observation distincte de B');
});
test('Une association incertaine de noms ne transfère jamais le commentaire à un autre agent',()=>{
 const pg:CspPage={page:2,width:841.9,height:595.3,items:[
  cell('NOM PRENOM',55,420,90),cell('UM/DUM',230,420,40),cell('GF',590,420,15),
  cell('NR',650,420,15),cell('COMMENTAIRES',750,420,81),
  cell('AGENT A',53,365,86),cell('Texte du A',720,365,70)
 ]};
 const [row]=recoverQuarterlyAnnotationsFromPages([
  {id:'a',name:'AGENT B',kind:'mutation',page:2,effective:'2026-01-01'}
 ],[pg]);
 assert.equal(row.observations,undefined);
});
