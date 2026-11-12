import test from 'node:test';
import assert from 'node:assert/strict';
import {getMovementColumns} from '../src/lib/csp-quarterly-columns.ts';

test('GF avant/apres est toujours visible pour admission et titularisation',()=>{
 for(const kind of ['admission','titularisation']){
  const columns=getMovementColumns([],kind);
  assert.ok(columns.some(c=>c.id==='gf'));
  assert.deepEqual(columns.map(c=>c.id),['name','agency','dates','gf']);
 }
});
test('Les autres motifs respectent la case GF et les colonnes selectionnees',()=>{
 for(const kind of ['nomination','mutation','reclassement','avancement','mesure','posthume']){
  assert.equal(getMovementColumns([],kind).some(c=>c.id==='gf'),false);
  assert.equal(getMovementColumns(['gf'],kind).some(c=>c.id==='gf'),true);
 }
 assert.deepEqual(getMovementColumns(['nr'],'admission').map(c=>c.id),['name','agency','dates','gf','nr']);
});
test('Les largeurs des tableaux restent constantes quel que soit le motif',()=>{
 const total=columns=>columns.reduce((sum,c)=>sum+c.width,0);
 const expected=total(getMovementColumns());
 for(const kind of ['admission','titularisation','nomination']){
  assert.ok(Math.abs(total(getMovementColumns([],kind))-expected)<.000001);
 }
});

test('NR+ absent pour les admissions au stage et les titularisations même si la case globale est cochée',()=>{
 for(const kind of ['admission','titularisation']){
  const columns=getMovementColumns(['gf','nr','nrSteps','source'],kind);
  assert.equal(columns.some(c=>c.id==='nrSteps'),false);
  assert.equal(columns.some(c=>c.id==='gf'),true);
  assert.equal(columns.some(c=>c.id==='nr'),true);
 }
});
test('NR+ reste une option pour les autres mouvements et les largeurs restent équilibrées',()=>{
 for(const kind of ['avancement','reclassement','nomination','mutation','mesure','posthume']){
  assert.equal(getMovementColumns(['nrSteps'],kind).some(c=>c.id==='nrSteps'),true);
  assert.equal(getMovementColumns([],kind).some(c=>c.id==='nrSteps'),false);
 }
 const full=getMovementColumns().reduce((n,c)=>n+c.width,0);
 for(const kind of ['admission','titularisation']){
  assert.ok(Math.abs(getMovementColumns(['gf','nr','nrSteps','source'],kind).reduce((n,c)=>n+c.width,0)-full)<1e-6);
 }
});

test('Motif et observations sont des colonnes activables avant CSP / effet',()=>{
 const columns=getMovementColumns(['motif','observations','gf','nr'],'mesure');
 assert.deepEqual(columns.slice(0,5).map(c=>c.id),['name','agency','motif','observations','dates']);
 assert.equal(columns[2].header,'MOTIF');
 assert.equal(columns[3].header,'OBSERVATIONS');
 assert.equal(getMovementColumns().some(c=>c.id==='motif'||c.id==='observations'),false,
  'pas de téléchargement automatique des PDF originaux pour un CR sans ces options');
 assert.equal(columns.reduce((n,c)=>n+c.width,0).toFixed(2),'12.33');
});
test('Motif et observations ne suppriment pas GF obligatoire ni la suppression du NR+ de stage',()=>{
 const ids=getMovementColumns(['motif','observations','nrSteps'],'admission').map(c=>c.id);
 assert.deepEqual(ids,['name','agency','motif','observations','dates','gf']);
});
