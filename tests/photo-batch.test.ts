import test from 'node:test';
import assert from 'node:assert/strict';
import {planPhotoBatch} from '../src/lib/photo-batch.ts';

const agents=[
 {id:'fiction-1',name:'Camille DUPONT'},
 {id:'fiction-2',name:'Éloïse MARTIN'},
 {id:'fiction-3',name:'Nolan EXEMPLE'},
 {id:'fiction-4',name:'Nolan EXEMPLE'}
];
const hash='a'.repeat(64);
const entry=(name:string,path='photos/test.jpg')=>({name,path,page:2,sha256:hash,confidence:'spatial_exact'});
test('archive de photos : correspondance unique, agents absents, homonymes, doublons et deja photographies',()=>{
 const manifest={format:'socioscope-photo-batch-v1',source:'Trombinoscope fictif.pdf',
  photos:[
   entry('Camille DUPONT','photos/1.jpg'),
   entry('Éloïse MARTIN','photos/2.jpg'),
   entry('Inconnu FICTIF','photos/3.jpg'),
   entry('Nolan EXEMPLE','photos/4.jpg'),
   entry('Camille DUPONT','photos/5.jpg'),
   entry('Camille DUPONT','photos/1.jpg')
  ]};
 const result=planPhotoBatch(manifest,agents,new Set(['fiction-2']));
 assert.equal(result.uploads.length,1);
 assert.equal(result.uploads[0].agent.id,'fiction-1');
 assert.equal(result.existing,1);
 assert.equal(result.missing,1);
 assert.equal(result.ambiguous,1);
 assert.equal(result.duplicate,2);
});
test('archive invalide refusee avant upload',()=>{
 assert.throws(()=>planPhotoBatch({format:'autre',source:'test',photos:[entry('Camille DUPONT')]},agents,new Set()));
 assert.throws(()=>planPhotoBatch({format:'socioscope-photo-batch-v1',source:'test',photos:[entry('Camille DUPONT','../private.jpg')]},agents,new Set()));
 assert.throws(()=>planPhotoBatch({format:'socioscope-photo-batch-v1',source:'test',photos:[{...entry('Camille DUPONT'),sha256:'invalid'}]},agents,new Set()));
});

test('les portraits non rattachés restent consultables avec la cause exacte sans créer de photo en base',()=>{
 const manifest={format:'socioscope-photo-batch-v1',source:'Trombinoscope fictif.pdf',
 photos:[
  entry('Camille DUPONT','photos/1.jpg'),
  entry('Inconnu FICTIF','photos/2.jpg'),
  entry('Nolan EXEMPLE','photos/3.jpg'),
  {...entry('Éloïse MARTIN','photos/4.jpg'),confidence:'verification_manuelle'}
 ]};
 const result=planPhotoBatch(manifest,agents,new Set(['fiction-1']));
 assert.equal(result.uploads.length,0);
 assert.equal(result.existing,1);
 assert.deepEqual(result.review.map(item=>item.reason),['missing','homonym','uncertain']);
 assert.deepEqual(result.review.map(item=>item.photo.path),['photos/2.jpg','photos/3.jpg','photos/4.jpg']);
 assert.equal(result.review.length,result.missing+result.ambiguous);
});

test('seules les anciennes photos Etat-Major peuvent etre remplacees apres opt-in',()=>{
 const manifest={format:'socioscope-photo-batch-v1',
  source:'Trombinoscope Etat-Major ULM - nov2026.pdf',scope:'ULM',
  replaceSource:'Trombinoscope Etat-Major ULM - oct2026.pdf',
  photos:[entry('Camille DUPONT','photos/1.jpg'),entry('Éloïse MARTIN','photos/2.jpg')]};
 const sources=new Map([
  ['fiction-1','Trombinoscope Etat-Major ULM - oct2026.pdf'],
  ['fiction-2','Trombinoscope AMT Centre janvier 2026(1).pdf']
 ]);
 const assigned=new Set(['fiction-1','fiction-2']);
 const standard=planPhotoBatch(manifest,agents,assigned,{currentSources:sources});
 assert.equal(standard.replacements.length,0);
 assert.equal(standard.existing,2);
 const enabled=planPhotoBatch(manifest,agents,assigned,{replaceEtatMajor:true,currentSources:sources});
 assert.equal(enabled.replacements.length,1);
 assert.equal(enabled.replacements[0].agent.id,'fiction-1');
 assert.equal(enabled.existing,1);
 assert.equal(enabled.uploads.length,0);
 const wrongArchive={...manifest,source:'Trombinoscope AMT NO - AVRIL 2026.pdf'};
 const blocked=planPhotoBatch(wrongArchive,agents,assigned,{replaceEtatMajor:true,currentSources:sources});
 assert.equal(blocked.replacements.length,0);
 assert.equal(blocked.existing,2);
});
