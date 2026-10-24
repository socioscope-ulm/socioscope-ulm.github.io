import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,unpackAgentSeed} from '../src/lib/agents.ts';
import {m3eOptions,m3eMeans} from '../src/lib/agent-m3e.ts';

const record=(id:string,extra={})=>({id,agentId:id,nni:id,name:'Fixture '+id,row:1,source:'s2025',...extra});
const data=(records:any[])=>({sources:[],records,events:[],issues:[],updated:'fixture'});

test('single-row snapshots preserve zero, null and NaN while normalizing empty fields',()=>{
 const original=record('A12345',{gf:0,nr:null,nrYears:NaN,agency:'',m3e:undefined});
 const result=snapshot(data([original]) as any,'s2025')[0] as any;
 assert.equal(result.gf,0);assert.equal(result.nr,null);assert.ok(Number.isNaN(result.nrYears));assert.equal(result.agency,undefined);
 assert.deepEqual(result.conflicts,[]);assert.equal(result.situations,1);
 assert.ok(Object.hasOwn(result,'gfDate'));assert.equal(result.gfDate,undefined);
 assert.equal(original.agency,'');assert.ok(!Object.hasOwn(original,'conflicts'));
});

test('duplicate lines still detect real conflicts and ignore absent or empty values',()=>{
 const result=snapshot(data([
  record('A12345',{gf:15,nr:200,agency:'Est',college:''}),
  record('A12345',{gf:15,nr:205,agency:'',college:'cadres'}),
  record('B12345',{gf:12,nr:100}),
  record('A12345',{source:'another-source',gf:19,nr:300})
 ]) as any,'s2025');
 assert.equal(result.length,2);assert.equal(result[0].situations,2);
 assert.equal(result[0].gf,15);assert.equal(result[0].nr,undefined);
 assert.equal(result[0].college,'cadres');assert.equal(result[0].agency,'Est');assert.deepEqual(result[0].conflicts,['nr']);
 assert.equal(result[1].nr,100);
});

test('packed data decodes strings, wrapped numbers, nested values, missing fields and events',()=>{
 const packed={sources:[],issues:[],updated:'fixture',strings:['s2022jan','A12345','Fixture','event'],
  recordFields:['source','agentId','name','gf','nr','nested','absent','undefinedValue'],
  eventFields:['agentId','kind','evidence'],
  records:[[-1,-2,-3,12,{number:-2},{items:[-3,{text:-4}]},null,undefined]],
  events:[[-2,-4,[{source:-1}]]]
 };
 const result=unpackAgentSeed(packed);const row=result.records[0] as any;
 assert.equal(row.source,'s2022jan');assert.equal(row.agentId,'A12345');assert.equal(row.nr,-2);assert.equal(row.gf,12);assert.equal(row.college,'cadres');
 assert.deepEqual(row.nested,{items:['Fixture',{text:'event'}]});assert.ok(!Object.hasOwn(row,'absent'));assert.ok(Object.hasOwn(row,'undefinedValue'));
 assert.equal(result.events[0].kind,'event');assert.deepEqual(result.events[0].evidence,[{source:'s2022jan'}]);
 assert.equal(packed.records[0][0],-1);assert.equal(result.records[0].name,'Fixture');
 assert.equal((result as any).strings,undefined);
});

test('packed special property names cannot modify object prototypes',()=>{
 const packed={sources:[],issues:[],updated:'fixture',strings:[],recordFields:['__proto__','name'],eventFields:[],records:[[{polluted:true},'Fixture']],events:[]};
 const row=unpackAgentSeed(packed).records[0] as any;
 assert.equal(Object.getPrototypeOf(row),Object.prototype);assert.ok(Object.hasOwn(row,'__proto__'));
 assert.equal(row.__proto__.polluted,true);assert.equal(({} as any).polluted,undefined);
});

test('M3E groups keep unknown and divergent ranges, exclude pending identities and retain finite means',()=>{
 const rows=[record('A12345',{m3e:'0307',gf:6,nr:100}),record('B12345',{m3e:'Plage H',gf:8,nr:110}),record('pending',{nni:undefined,m3e:'non reconnue',gf:20}),record('C12345',{gf:12,nr:NaN}),record('D12345',{m3e:'H',gf:13,nr:200,conflicts:['m3e']})] as any;
 const options=m3eOptions(rows),means=m3eMeans(rows);const h=means.find(v=>v.id==='H')!;
 assert.equal(h.agents,2);assert.deepEqual(h.gf,{mean:7,count:2});assert.deepEqual(h.nr,{mean:105,count:2});assert.equal(h.outside,1);
 assert.ok(options.some(v=>v.id==='NON RECONNUE'));assert.equal(means.find(v=>v.id==='NON RECONNUE')!.agents,0);
 assert.deepEqual(means.find(v=>v.id==='__missing')!.nr,{mean:null,count:0});assert.equal(means.find(v=>v.id==='__conflict')!.agents,1);
 assert.deepEqual(m3eMeans(rows.filter((r:any)=>r.nni==='A12345')).find(v=>v.id==='H')!.gf,{mean:6,count:1});
});
