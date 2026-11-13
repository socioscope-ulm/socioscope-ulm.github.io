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
