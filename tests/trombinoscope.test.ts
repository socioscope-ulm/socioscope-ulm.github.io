import test from 'node:test';
import assert from 'node:assert/strict';
import {TROMBINOSCOPE_AGENCIES,isTrombinoscopeAgency} from '../src/lib/trombinoscope.ts';

test('trombinoscopes : agences disponibles pour les lecteurs et les administrateurs',()=>{
 assert.equal(TROMBINOSCOPE_AGENCIES.length,8);
 assert.deepEqual(TROMBINOSCOPE_AGENCIES.map(x=>x.code),['AMTNO','AMTE','AMTVDR','AMTC','AMTO','AMTSO','ALN','ULM']);
 assert.equal(new Set(TROMBINOSCOPE_AGENCIES.map(x=>x.code)).size,8);
 for(const item of TROMBINOSCOPE_AGENCIES){
  assert.ok(item.label.length>=3);
  assert.equal(isTrombinoscopeAgency(item.code),true);
 }
});
test('trombinoscopes : rejeter agences et chemins non declares',()=>{
 for(const code of ['../AMTO','AMTO/file','AMTXX','','amtno',null,undefined,29])
  assert.equal(isTrombinoscopeAgency(code),false);
});
