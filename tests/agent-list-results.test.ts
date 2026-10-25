import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('explicit complete search returns every matching row, while existing paginated callers retain 100 rows',async()=>{
 const source={id:'fixture',date:'2025-12-31',primary:true,status:'validated'};
 const records=Array.from({length:205},(_,i)=>({id:String(i),agentId:'agent'+i,nni:'agent'+i,source:'fixture',row:i+1,name:'Agent '+String(i).padStart(3,'0'),agency:i<150?'Est':'Centre',gf:i<150?8:13,nr:100,college:i<150?'maitrise':'cadres',sex:i%2?'H':'F'}));
 const fixture={data:{sources:[source],records,events:[],issues:[]},decisions:[]};
 const result=await build({entryPoints:[new URL('../src/app/api/agents/route.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'list-fixture',setup(b){
  b.onResolve({filter:/\/(agents-store|payroll-store|store)$/},()=>({path:'fixture',namespace:'list-test'}));
  b.onLoad({filter:/.*/,namespace:'list-test'},()=>({contents:`
   export async function agentAuth(){};
   export async function agentData(){return ${JSON.stringify(fixture)};}
   export function agentError(error){throw error;}
   export function resources(){throw Error('Unexpected database operation');}
   export async function payrollReferences(){throw Error('Unexpected payroll operation');}
  `}));
 }}]});
 const {GET}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const read=async(query:string)=>(await GET(new Request('https://fixture.test/api/agents?source=fixture&'+query))).json();
 const page=await read('view=list');assert.equal(page.total,205);assert.equal(page.records.length,100);
 const second=await read('view=list&offset=100');assert.equal(second.records[0].agentId,'agent100');
 const complete=await read('view=list&all=1');assert.equal(complete.records.length,205);assert.equal(new Set(complete.records.map((r:any)=>r.agentId)).size,205);
 for(const query of ['agency=Est','gf=8','nr=100&agency=Est']){
  const filtered=await read('view=list&all=1&'+query);assert.equal(filtered.total,150);assert.equal(filtered.records.length,150);assert.ok(filtered.records.every((r:any)=>r.agency==='Est'));
 }
 const exported=await read('view=export&agency=Est');assert.equal(exported.total,150);assert.equal(exported.records.length,150);assert.equal(exported.details.length,150);assert.ok(exported.details.every((d:any)=>d.date==='2025-12-31'));
 for(const query of ['', 'agency=Est', 'gf=13', 'college=cadres&sex=femmes', 'college=maitrise&sex=femmes', 'college=maitrise&sex=hommes', 'gf=99']){
  const full=await read('view=list&'+query),small=await read('view=averages&'+query);
  for(const key of ['agents','nrMean','gfMean','sexKnown','sexTotal'])assert.deepEqual(small.stats[key],full.stats[key]);
  assert.equal('records' in small,false);assert.equal('decisions' in small,false);assert.equal('plages' in small,false);
  assert.ok(JSON.stringify(small).length<JSON.stringify(full).length);
 }
 const female=await read('view=averages&college=maitrise&sex=femmes');assert.equal(female.stats.agents,75);assert.equal(female.stats.gfMean,8);
 const empty=await read('view=list&all=1&gf=99');assert.equal(empty.total,0);assert.deepEqual(empty.records,[]);
 const analysis=await read('view=analysis&all=1');assert.equal(analysis.records.length,100);
});
