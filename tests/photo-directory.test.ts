import test from 'node:test';
import assert from 'node:assert/strict';
import {assemblePhotoCatalog} from '../src/lib/photo-directory.ts';

test('photo directory combines historical and validated agents without RUP or salary projections',()=>{
 const base=[{agentId:'C74243',name:'Stéphane LOUVET',agency:'ULM'}];
 const sources=[
  {detail:{kind:'rup'},records:[{agentId:'R00000',name:'Should not appear'}]},
  {detail:{kind:'individual'},records:[{agentId:'A12345',name:'Autre Agent',agency:'Agence A'}]},
  {detail:{kind:'csp',events:[
   {agentId:'B12345',name:'Agent Entrant',agency:'Agence B',newAgent:true,approved:true,selected:true},
   {agentId:'P12345',name:'Candidature Sans Decision',newAgent:true,candidacy:true,approved:true},
   {agentId:'Q12345',name:'Non Confirme',newAgent:true,approved:false},
   {agentId:'pending-csp-test',name:'Identite Provisoire',newAgent:true,approved:true}
  ]}}
 ];
 const list=assemblePhotoCatalog(base,sources,[]);
 assert.deepEqual(new Set(list.map(x=>x.id)),new Set(['C74243','A12345','B12345']));
 assert.equal(list.find(x=>x.id==='C74243')?.name,'Stéphane LOUVET');
});
test('a documented identity link merges the photo directory under the final id',()=>{
 const list=assemblePhotoCatalog([{agentId:'pending-old',name:'Agent Temporaire'},{agentId:'C12345',name:'Agent NNI'}],[],[{agent:'pending-old',kind:'link',target:'C12345'}]);
 assert.equal(list.length,1);assert.equal(list[0].id,'C12345');
});
