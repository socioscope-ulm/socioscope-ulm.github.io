import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCspPrintedCell,formatCspNominationAptitude,isCspPageFooter}
 from '../src/lib/csp-quarterly-document-text.ts';

test("Aptitude RD : enlever génériquement la date d'effet, conserver la décision",()=>{
 const cases:[string,string,string?][]=[
  ["Candidature retenue - GF constant - Date d'effet 01/09/2026","Candidature retenue - GF constant"],
  ["Candidature retenue – 1 GF – Date d’effet : 01/10/2026","Candidature retenue – 1 GF"],
  ["Candidature retenue - 2 GF - Date d effet au 2026-11-01","Candidature retenue - 2 GF"],
  ["Candidature retenue – GF constant\nDate d’effet du 1/09/2026","Candidature retenue – GF constant"],
  ["Candidature retenue - GF constant - 01/09/2026","Candidature retenue - GF constant","2026-09-01"],
  ["Candidature retenue - GF constant - 01/09/2025","Candidature retenue - GF constant - 01/09/2025","2026-09-01"],
  ["Date d'effet 01/09/2026",""],
  ["Candidature retenue - 1 GF","Candidature retenue - 1 GF"],
  ["",""],
  ["—",""]
 ];
 for(const [input,expected,effect] of cases){
  assert.equal(formatCspNominationAptitude(input,effect),expected,input);
 }
});

test("Aptitude RD : répétition du nettoyage sans déformation du texte",()=>{
 const input="Candidature retenue - 1 GF - Date d'effet 01/09/2026";
 const once=formatCspNominationAptitude(input,'2026-09-01');
 const twice=formatCspNominationAptitude(once,'2026-09-01');
 assert.equal(once,twice);
 assert.match(once,/1 GF/);
 assert.doesNotMatch(once,/date|01\/09\/2026/i);
});

test("Observations imprimées : pagination seule = case vide, vrai commentaire conservé",()=>{
 for(const value of ['1/1','1 / 1','2/3','Page 1 sur 1','page 3 of 8','—','']){
  assert.equal(cleanCspPrintedCell(value),'',value);
 }
 assert.equal(cleanCspPrintedCell('Mutation acceptée à compter du 1er juin'),'Mutation acceptée à compter du 1er juin');
 assert.equal(cleanCspPrintedCell('1/1 accord de rémunération'),'1/1 accord de rémunération');
});

test('Pagination éliminée seulement en bas de page et du bon côté',()=>{
 const page={width:842,height:595};
 assert.equal(isCspPageFooter({str:'1/1',x:785,y:58},page),true);
 assert.equal(isCspPageFooter({str:'Page 1 sur 1',x:716,y:25},page),true);
 assert.equal(isCspPageFooter({str:'1/1',x:785,y:380},page),false);
 assert.equal(isCspPageFooter({str:'1/1',x:20,y:58},page),false);
 assert.equal(isCspPageFooter({str:'Mission confiée',x:785,y:58},page),false);
});
