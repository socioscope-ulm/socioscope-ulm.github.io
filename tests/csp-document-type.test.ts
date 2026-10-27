import {cspDocumentLabel,cspDocumentText} from '../src/lib/csp-document-label.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {detectCspDocumentType} from '../src/lib/csp-document-type.ts';
import {analyzeCspDocument,extractCspPages} from '../src/lib/csp-extract.ts';
import {cspFolders} from '../src/lib/csp-folders.ts';
import type {CspPage,CspTextItem} from '../src/lib/csp-extract.ts';
const item=(str:string,x:number,y:number,width=30):CspTextItem=>({str,x,y,width,height:8});
const page=(text:string):CspPage=>({page:1,width:842,height:595,items:[item(text,20,560)]});
const rd:CspPage={page:1,width:842,height:595,items:[item('RELEVÉ DE DÉCISIONS',20,565),item('CSP du 18/06/2027',570,530,160),item('AVANCEMENT AU CHOIX',40,480),item('NOM PRENOM',40,420),item('EXEMPLE ADELE',40,380,100),item('AGENCE FICTIVE',300,380,90),item('1',620,380),item('01/01/2027',740,380)]};
const cr:CspPage={page:1,width:842,height:595,items:[item('COMPTE RENDU',20,565),item('CSP du 18/06/2027',570,530,160),item('AVANCEMENT AU CHOIX',40,480),...([['NOM PRENOM',80],['UM/DUM',220],['GF',480],['ANCIEN NR',530],['NOUVEAU NR',630],['DATE D’EFFET',750]] as [string,number][]).map(([s,x])=>item(s,x,420)),...([['EXEMPLE ADELE',80],['AGENCE FICTIVE',220],['7',480],['110',530],['115',630],['01/01/2027',750]] as [string,number][]).map(([s,x])=>item(s,x,380))]};
test('CR and RD titles with accents identify the existing parser independently of file name',()=>{
 assert.equal(detectCspDocumentType([rd],'document.pdf').documentType,'rd');
 assert.equal(detectCspDocumentType([cr],'document.pdf').documentType,'cr');
 assert.equal(detectCspDocumentType([page('RELEVES DES DECISIONS')]).documentType,'rd');
 assert.equal(detectCspDocumentType([page('COMPTES RENDUS')]).documentType,'cr');
});
test('layout evidence identifies candidate CRs and retained-candidate RDs; body references do not override titles',()=>{
 const candidate=page('BORDEREAU DES CANDIDATS À L’EMPLOI');assert.equal(detectCspDocumentType([candidate]).documentType,'cr');
 assert.equal(detectCspDocumentType([page('CANDIDATURE RETENUE')]).documentType,'rd');
 const withReference={...rd,items:[...rd.items,item('Voir le compte rendu de la séance précédente',20,120)]};assert.equal(detectCspDocumentType([withReference]).documentType,'rd');
 assert.equal(detectCspDocumentType([{...cr,items:cr.items.filter(i=>i.str!=='COMPTE RENDU')}]).documentType,'cr');
});
test('ambiguous or conflicting evidence requires confirmation, including a misleading filename',()=>{
 for(const [pages,name] of [[[page('CSP')],'RD.pdf'],[[page('COMPTE RENDU RELEVE DE DECISIONS')],'document.pdf'],[[rd],'CR_seance.pdf'],[[cr],'RD_seance.pdf'],[[page('BORDEREAU DES CANDIDATS CANDIDATURE RETENUE')],'document.pdf']] as [CspPage[],string][]){const d=detectCspDocumentType(pages,name);assert.equal(d.needsConfirmation,true);assert.equal(d.documentType,undefined);}
});
test('automatic and manually confirmed imports use unchanged extraction rules and meeting-date folders',()=>{
 for(const [pages,type] of [[[rd],'rd'],[[cr],'cr']] as [CspPage[],'rd'|'cr'][]){
  const auto=analyzeCspDocument(pages,'document.pdf');assert.equal(auto.documentType,type);assert.equal(auto.events.length,1);
  const old=extractCspPages(pages,type);for(const key of ['date','events','reports','rawCount','duplicates'] as const)assert.deepEqual(auto[key],old[key]);
  assert.equal(auto.events[0].nrSteps,1);
  const folders=cspFolders([{id:type,date:auto.date}]);assert.equal(folders[0].year,2027);assert.equal(folders[0].quarters[1].rows[0].id,type);
 }
 const unclear=[{...rd,items:rd.items.filter(i=>i.str!=='RELEVÉ DE DÉCISIONS')}];
 const waiting=analyzeCspDocument(unclear,'document.pdf');assert.equal(waiting.documentType,undefined);assert.equal(waiting.events.length,0);
 const confirmed=analyzeCspDocument(unclear,'document.pdf','rd');assert.equal(confirmed.documentType,'rd');assert.deepEqual(confirmed.events,extractCspPages(unclear,'rd').events);
});

test('ODJ titles and filenames reuse the historical parser while RD remains authoritative',()=>{
 for(const title of ['ORDRE DU JOUR','Ordre du jour de la CSP','ODJ CSP'])assert.equal(detectCspDocumentType([page(title)],'ODJ.pdf').documentType,'cr');
 assert.equal(detectCspDocumentType([rd],'ODJ_seance.pdf').needsConfirmation,true);
 const agenda={...cr,items:cr.items.map(i=>i.str==='COMPTE RENDU'?{...i,str:'ORDRE DU JOUR'}:i)};
 assert.deepEqual(analyzeCspDocument([agenda],'ODJ.pdf').events,extractCspPages([agenda],'cr').events);
 assert.equal(cspDocumentLabel('cr'),'ODJ');assert.equal(cspDocumentLabel('rd'),'RD');
 assert.equal(cspDocumentText('Candidature du CR : en attente du RD.'),'Candidature de l’ODJ : en attente du RD.');
});
