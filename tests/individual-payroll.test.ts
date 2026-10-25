import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('real individual payroll route matches the full payroll including corrected careers, manual presence, imports, filters and exclusions',async()=>{
 const sources=[{id:'old',date:'2024-12-31',primary:true},{id:'current',date:'2025-12-31',primary:true}].map(s=>({...s,name:s.id,label:s.id,seniorityDate:s.date}));
 const people=[{agentId:'A12345',nni:'A12345',name:'Corrected',gf:15,nr:200,college:'cadres',sex:'F',agency:'AMTC'},{agentId:'B12345',nni:'B12345',name:'Presence',gf:8,nr:100,college:'maitrise',agency:'AMT EST'},{agentId:'pending',name:'Pending',gf:8,nr:100,agency:'AMTC'}];
 const records=people.flatMap(p=>sources.filter(s=>p.agentId!=='B12345'||s.id==='old').map(s=>({...p,id:s.id+p.agentId,source:s.id,row:1,iegYears:20,seniorityDate:s.date})));
 const fields=[...new Set(records.flatMap(r=>Object.keys(r)))];
 const packed={sources,records:records.map(r=>fields.map(k=>(r as any)[k]??null)),recordFields:fields,strings:[],eventFields:[],events:[],issues:[],updated:''};
 const decisions=[{id:'return',kind:'return',agent:'B12345',source:'current',note:JSON.stringify({presence:{gf:8,nr:100,agency:'AMT EST'},note:'Confirmed'})},{id:'link',kind:'link',agent:'imported',target:'C12345'},{id:'correction',kind:'career_rup',agent:'A12345',source:'rup',note:JSON.stringify({date:'2000-01-01',row:1,contract:'1',reason:'Validated correction'})}];
 const rup={sources:[{id:'rup',status:'validated'}],records:[{nni:'A12345',source:'rup',row:1,contrat:'1',entreeIEG:'2000-01-01',genre:'F'}]};
 const imports=[{id:'import',date:'2025-12-31',name:'import',status:'validated',count:1,complete:false,detail:'{}'}];
 const imported=[{id:'imported',agentId:'imported',source:'import',row:1,name:'Linked import',gf:8,nr:100,agency:'AMTC',iegYears:10,seniorityDate:'2025-12-31'}];
 const rates={'1.24':{'100':Array(12).fill(14000),'200':Array.from({length:12},(_,i)=>20000+i*100)},'1.245':{'100':Array(12).fill(15000),'200':Array(12).fill(23000)}};
 const refs=[{id:'grid',kind:'grid',status:'validated',date:'2026-01-01',created:'',payload:{rates}},{id:'bonus',kind:'bonuses',status:'validated',date:'2025-01-01',created:'',payload:{bonuses:{'8':4000,'15':6000}}}];
 const result=await build({stdin:{contents:`export {GET} from './src/app/api/agents/route.ts'; export {agentData} from './src/lib/agents-store.ts';`,resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'individual-payroll-fixture',setup(b){
  b.onResolve({filter:/\/(seeds|store|payroll-store)(\.ts)?$/},a=>({path:a.path.split('/').at(-1)!.replace('.ts',''),namespace:'individual-test'}));
  b.onLoad({filter:/.*/,namespace:'individual-test'},a=>({contents:a.path==='seeds'?`export const packedText=${JSON.stringify(JSON.stringify(packed))};export const rupSeedText=${JSON.stringify(JSON.stringify(rup))};`:a.path==='payroll-store'?`export async function payrollReferences(){return ${JSON.stringify(refs)};}`:`
   export function resources(){return {
    db:{prepare(query){return {async all(){return {results:query.includes('agent_imports')?${JSON.stringify(imports)}:query.includes('agent_decisions')?${JSON.stringify(decisions)}:[]};},async first(){return {settings:{engagementRate:3.5,autonomieRate:4}};}};}},
    bucket:{async get(key){if(key==='agents/import/records.json')return {async json(){return ${JSON.stringify(imported)};}};throw Error('Unexpected object');}}
   };}
  `}));
 }}]});
 const {GET,agentData}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const call=async(query:string)=>GET(new Request('https://fixture.test/api/agents?view=payroll&source=current&'+query,{headers:{'oai-authenticated-user-id':'fixture-user'}}));
 for(const params of ['','college=cadres&sex=femmes','college=maitrise','residence=1.245','grid=grid&bonus=bonus']){
  const all=await (await call(params)).json();
  for(const id of ['A12345','B12345','pending','C12345','missing']){
   const response=await call(params+'&agent='+id);assert.equal(response.status,200);
   const individual=await response.json();assert.deepEqual(individual.row,all.rows.find((r:any)=>r.agentId===id)||null);
   for(const k of ['referenceDate','gridDate','gridId','bonusId','bonusReferenceYear','residence','engagementRate','autonomieRate'])assert.deepEqual(individual[k],all[k]);
  }
 }
 const old=await GET(new Request('https://fixture.test/api/agents?view=payroll&source=old&agent=A12345',{headers:{'oai-authenticated-user-id':'fixture-user'}}));assert.equal(old.status,200);
 const current=await (await call('agent=A12345')).json();assert.match(current.row.method,/correction administrative/);assert.equal(current.row.level,10);
 const focus=await agentData(false,'A12345');assert.equal(focus.data.records.length,2);assert.ok(focus.data.records.every((r:any)=>r.agentId==='A12345'));assert.equal(focus.data.records[0].rupCareer.date,'2000-01-01');
 const presence=await (await call('agent=B12345')).json();assert.equal(presence.row.manualPresence,true);
 const bad=await GET(new Request('https://fixture.test/api/agents?view=payroll&source=unknown&agent=A12345',{headers:{'oai-authenticated-user-id':'fixture-user'}}));assert.equal(bad.status,404);
});
