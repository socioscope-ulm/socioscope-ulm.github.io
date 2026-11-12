import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverRDNominationAptitudes,needsRDNominationAptitude} from '../src/lib/csp-quarterly-aptitude.ts';
import type {CspPage,CspTextItem} from '../src/lib/csp-extract.ts';
import type {QuarterlyEvent} from '../src/lib/csp-quarterly-report.ts';

const cell=(str:string,x:number,y:number,width=70):CspTextItem=>({str,x,y,width,height:10});
const base=[
 cell('NOM PRENOM',40,390,100),cell('EMPLOI',300,390,65),
 cell('LOCALISATION',565,390,90),cell('APTITUDE',751,390,82),
];
const rdPage=(items:CspTextItem[]):CspPage=>({page:4,width:841.9,height:595.3,items:[
 cell('NOMINATIONS AUX POSTES VACANTS',40,515,240),
 ...base,...items
]});
const ev=(overrides:Partial<QuarterlyEvent>={}):QuarterlyEvent=>({
 id:'p4r0',name:'AGENT ALPHA',agentId:'TEST-1',kind:'nomination',
 selected:true,approved:true,effective:'2026-09-01',page:4,
 recordedBefore:{gf:10,nr:155},recordedAfter:{gf:10,nr:155},...overrides
});

test('RD: Aptitude complète récupérée même lorsque la colonne a une largeur variable',()=>{
 const page=rdPage([
  cell('AGENT ALPHA',41,323,113),
  cell('CHARGE D AFFAIRES',302,323,132),
  cell('UNITE / AMT OUEST / CORDEMAIS',486,323,179),
  cell('Candidature retenue - GF',662,336,169),
  cell("constant - Date d'effet",666,323,149),
  cell('01/09/2026',715,310,70)
 ]);
 const original=[ev()];
 const snapshot=JSON.stringify(original);
 const read=recoverRDNominationAptitudes(original,[page]);
 assert.equal(read[0].aptitude,"Candidature retenue - GF constant - Date d'effet 01/09/2026");
 assert.equal(JSON.stringify(original),snapshot);
 assert.deepEqual(read[0].recordedBefore,{gf:10,nr:155});
 assert.deepEqual(read[0].recordedAfter,{gf:10,nr:155});
 assert.equal(needsRDNominationAptitude(original),true);
 assert.equal(needsRDNominationAptitude(read),false);
});

test('Deux candidats dans une nomination : chaque aptitude reste attachée à la bonne personne',()=>{
 const page=rdPage([
  cell('AGENT ALPHA',41,321,115),
  cell('Candidature retenue - GF',666,331,159),
  cell('constant - Date d effet 01/09/2026',660,311,177),
  cell('AGENT BETA',41,245,114),
  cell('Candidature retenue - 1 GF -',661,258,164),
  cell('Date d effet 01/10/2026',667,239,163),
 ]);
 const events=[ev(),ev({id:'p4r1',name:'AGENT BETA',agentId:'TEST-2'})];
 const read=recoverRDNominationAptitudes(events,[page]);
 assert.match(read[0].aptitude||'',/GF constant/);
 assert.doesNotMatch(read[0].aptitude||'',/1 GF/);
 assert.match(read[1].aptitude||'',/1 GF/);
 assert.doesNotMatch(read[1].aptitude||'',/GF constant/);
});

test('Ne pas reprendre un texte non retenu ni attribuer une aptitude lorsque le nom est ambigu',()=>{
 const page=rdPage([
  cell('AGENT ALPHA',41,321,115),
  cell('Candidature retenue - GF constant',670,321,165),
  cell('AGENT BETA',41,245,114),
  cell('Candidature non retenue',670,245,165)
 ]);
 const read=recoverRDNominationAptitudes([
  ev(),
  ev({id:'p4r1',name:'AGENT BETA',selected:false})
 ],[page]);
 assert.match(read[0].aptitude||'',/Candidature retenue/);
 assert.equal(read[1].aptitude,undefined);

 const repeated=rdPage([
  cell('AGENT ALPHA',41,321,115),cell('AGENT ALPHA',41,245,115),
  cell('Candidature retenue - GF constant',670,321,165),
  cell('Candidature retenue - 1 GF',670,245,165)
 ]);
 assert.equal(recoverRDNominationAptitudes([ev()],[repeated])[0].aptitude,undefined);
});
