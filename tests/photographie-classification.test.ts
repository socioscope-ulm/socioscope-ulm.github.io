import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourcePairs,withConfirmedPresence,defaultMovementPhotographs,preferredOlderPhotograph} from '../src/lib/agents.ts';

const source=(id:string,date:string,primary:boolean)=>({
 id,name:id,label:id,date,primary,hash:id,sheet:'situations',confidence:'test',seniorityDate:date,rows:2,agents:2,status:'validated'
});
const person=(id:string,sourceId:string,gf:number=10,nni=id)=>({
 id:sourceId+'-'+id,agentId:id,nni,source:sourceId,name:'Agent '+id,row:1,gf,nr:200,agency:'ULM'
});
const src22=source('s2022','2022-12-31',true),src24=source('s2024','2024-12-31',true),src25=source('s2025','2025-12-31',true);
const base=()=>({
 sources:[src22,src24,src25],
 records:[
  person('C12345','s2022',19),person('A12345','s2024'),person('B12345','s2024',19),
  person('A12345','s2025'),person('U00000','s2025',8,undefined)
 ],
 events:[],issues:[],updated:'2026-10-21'
});
test('2025 opens against December 2024 onglets mis en forme, even if standard 2024 is primary',()=>{
 const ordinary={...source('s2024','2024-12-31',true),name:'Situations individuelles - decembre 2024',label:'Décembre 2024'};
 const formatted={...source('s2024-onglets','2024-12-31',false),name:'Situation Individuelle décembre 2024 ONGLETS MIS EN FORME',label:'Décembre 2024 · onglets mis en forme'};
 const current={...src25,name:'Décembre 2025',label:'Décembre 2025'};
 const inputs=[ordinary,src22,formatted,current];
 const {latest,previous}=defaultMovementPhotographs(inputs);
 assert.equal(latest?.id,'s2025');
 assert.equal(previous?.id,'s2024-onglets');
 assert.equal(preferredOlderPhotograph(current,inputs)?.id,'s2024-onglets');
 const data={sources:inputs,records:[
  person('B12345','s2024-onglets'),person('C12345','s2024'),
  person('A12345','s2025')
 ],events:[],issues:[],updated:'2026-10-21'};
 const result=sourcePairs(data as any,'s2025');
 assert.equal(result.previous?.id,'s2024-onglets');
 assert.equal(result.absent.some(r=>r.agentId==='B12345'),true);
 assert.equal(result.absent.some(r=>r.agentId==='C12345'),false);
});
test('latest complete date stays the reference, instead of newer partial import',()=>{
 const formatted={...source('s2024-onglets','2024-12-31',false),name:'2024 Onglets mis en forme'};
 const partial={...source('partial-2026','2026-06-01',false),status:'validated'};
 const {latest,previous}=defaultMovementPhotographs([src24,formatted,src25,partial]);
 assert.equal(latest?.id,'s2025');
 assert.equal(previous?.id,'s2024-onglets');
});
test('newest validated complete import supersedes 2025 without hard-coded years',()=>{
 const next={...source('import-2026','2026-12-31',true),status:'validated'};
 const previous={...source('import-2025','2025-12-31',false),name:'2025 Onglets mis en forme'};
 const res=defaultMovementPhotographs([src24,src25,next,previous]);
 assert.equal(res.latest?.id,'import-2026');
 assert.equal(res.previous?.id,'import-2025');
});
test('Mouvements selections show exact source pair and do not rewrite decisions',()=>{
 const ui=readFileSync(new URL('../src/app/agents.tsx',import.meta.url),'utf8');
 assert.match(ui,/defaultMovementPhotographs\(meta\.sources\)/);
 assert.match(ui,/setPrevious\(preferredPrevious\?\.id\|\|''\)/);
 assert.match(ui,/result\.previous\?\.label/);
 assert.match(ui,/value=\{previous\|\|result\.previous\?\.id\|\|''\}/);
});
test('A full snapshot with a previous file supports individually confirmed departures',()=>{
 const data=base();data.records=data.records.filter(r=>r.agentId!=='U00000');
 const pairs=sourcePairs(data as any,'s2025','s2024');
 assert.equal(pairs.canConfirmDeparture,true);
 assert.equal(pairs.canInferAbsence,true);
 assert.ok(pairs.absent.some(r=>r.agentId==='B12345'&&r.gf===19));
 assert.ok(pairs.absent.some(r=>r.agentId==='C12345'&&r.historicalGF19));
});
test('One incomplete identity must not hide individual administrator classification controls',()=>{
 const data=base();
 data.records.find(r=>r.agentId==='U00000')!.nni='';
 const pairs=sourcePairs(data as any,'s2025','s2024');
 assert.equal(pairs.canConfirmDeparture,true);
 assert.equal(pairs.canInferAbsence,false);
 assert.ok(pairs.absent.some(r=>r.agentId==='B12345'));
});
test('A partial current file cannot authorize departures',()=>{
 const data=base();
 data.sources=[src22,src24,source('s2025','2025-12-31',false)];
 const pairs=sourcePairs(data as any,'s2025','s2024');
 assert.equal(pairs.canConfirmDeparture,false);
 assert.equal(pairs.canInferAbsence,false);
});
test('A confirmed presence is carried into data and calculations without replacing observations',()=>{
 const data=base(); data.records=data.records.filter(r=>r.source!=='s2025'||r.agentId!=='U00000');
 const prior=data.records.find(r=>r.agentId==='B12345')!;
 const note=JSON.stringify({note:'Présence vérifiée',presence:{gf:18,nr:250,agency:'ULM'}});
 const result=withConfirmedPresence(data as any,[{id:'decision-test',agent:'B12345',kind:'return',source:'s2025',note}]);
 const row=result.records.find(r=>r.agentId==='B12345'&&r.source==='s2025');
 assert.ok(row?.manualPresence);
 assert.equal(row?.gf,18);
 assert.equal(row?.nr,250);
 assert.equal(row?.agency,'ULM');
 assert.equal(result.records.find(r=>r.id===prior.id),prior);
 const departed=withConfirmedPresence(data as any,[{id:'departure-test',agent:'B12345',kind:'departure',source:'s2025',note:''}]);
 assert.equal(departed.records.some(r=>r.agentId==='B12345'&&r.source==='s2025'),false);
});
test('Missing bulk inference does not hide executive action and ordinary users remain read only',()=>{
 const client=readFileSync(new URL('../src/app/agents.tsx',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/lib/agents-store.ts',import.meta.url),'utf8');
 assert.ok(client.includes('enabled={isAdmin&&result.canConfirmDeparture} allowExecutive={isAdmin} allowPresence={isAdmin}'));
 assert.ok(client.includes("allowExecutive&&r.gf===19"));
 assert.ok(client.includes("enabled&&d?.kind!=='departure'"));
 assert.ok(client.includes("onDecision({kind:'executive'"));
 assert.ok(client.includes("onDecision({kind:'departure'"));
 assert.ok(client.includes("kind:'return',agent:r.agentId"));
 assert.ok(client.includes('setRevision(r=>r+1)'));
 assert.ok(server.includes("'departure','absence','return'"));
 assert.ok(server.includes("'executive','executive_manual','executive_remove'"));
});
