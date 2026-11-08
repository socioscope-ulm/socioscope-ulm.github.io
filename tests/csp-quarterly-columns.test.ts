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
