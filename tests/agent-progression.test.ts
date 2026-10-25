import test from 'node:test';
import assert from 'node:assert/strict';
import {agentProgression} from '../src/lib/agent-progression.ts';
import {snapshot} from '../src/lib/agents.ts';

const sources=[
 {id:'old',date:'2021-12-31',primary:true},
 {id:'same-date',date:'2021-12-31',status:'validated'},
 {id:'review',date:'2022-12-31',primary:true,status:'review'},
 {id:'current',date:'2023-12-31',primary:true},
 {id:'future',date:'2025-12-31',primary:true}
].map(s=>({...s,seniorityDate:s.date,name:s.id,label:s.id}));
const row=(source:string,id:string,values={})=>({source,id:source+id,agentId:id,nni:id,name:id,row:1,gf:8,nr:100,gfDate:'2020-01-01',nrDate:'2020-01-01',...values});
const records=[
 row('old','A12345'),row('same-date','A12345'),
 row('current','A12345',{gf:9,nr:105,gfDate:'2022-01-01',nrDate:'2022-01-01'}),
 row('old','B12345'),row('current','B12345',{gf:10,nr:110,gfDate:'2022-01-01',nrDate:'2022-01-01'}),
 row('current','B12345',{gf:11,nr:115,gfDate:'2022-01-01',nrDate:'2022-01-01'}),
 row('old','pending',{nni:undefined}),row('current','pending',{nni:undefined,gf:12,nr:200}),
 row('review','A12345',{gf:16,nr:300}),row('future','A12345',{gf:17,nr:400})
];
const fixture={sources,records,events:[],issues:[],updated:''} as any;

test('progression preserves real passages and ignores conflicts, unknown identities, review and future files',()=>{
 const result=agentProgression(fixture,'current',true)!;
 assert.equal(result.gf.count,1);assert.equal(result.nr.count,1);
 assert.equal(result.passages!.gf[0].agentId,'A12345');
 assert.equal(result.gf.mean,(Date.parse('2022-01-01')-Date.parse('2020-01-01'))/(365.2425*86400000));
 assert.equal(result.gf.estimated,0);
 const full=agentProgression(fixture,'current')!;
 assert.deepEqual(full.nrByGF,[{gf:9,agents:1,count:1,mean:105}]);
 assert.deepEqual(full.gf,result.gf);assert.deepEqual(full.nr,result.nr);
});

test('indexed snapshots match whole-history snapshots for complete, partial, empty and filtered populations',()=>{
 for(const records of [fixture.records,fixture.records.filter((r:any)=>r.agentId==='A12345'),[],fixture.records.filter((r:any)=>r.source==='current')]){
  const data={...fixture,records};
  for(const source of ['current','old','same-date','review','missing'])for(const include of [true,false]){
   const actual=agentProgression(data,source,include);
   const reference=agentProgression(data,source,include,id=>snapshot(data,id));
   assert.deepEqual(actual,reference);
  }
 }
});

test('each calculation observes changes instead of retaining a stale snapshot or date cache',()=>{
 const data=structuredClone(fixture);
 const first=agentProgression(data,'current',true)!;
 data.records.find((r:any)=>r.agentId==='A12345'&&r.source==='current').gfDate='2023-01-01';
 const next=agentProgression(data,'current',true)!;
 assert.notEqual(first.gf.mean,next.gf.mean);
 assert.equal(agentProgression(data,'missing'),null);
});
