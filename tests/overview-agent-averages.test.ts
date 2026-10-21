import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeAgentSex,matchesAgentCohort} from '../src/lib/agents.ts';
import {detectMapping,mapAgentRows} from '../src/lib/agents-import.ts';

const people=[
 {name:'Agent 1',college:'cadres',sex:'F',gf:16,nr:205},
 {name:'Agent 2',college:'cadres',sex:'H',gf:17,nr:225},
 {name:'Agent 3',college:'maitrise',sex:'Femme',gf:10,nr:145},
 {name:'Agent 4',college:'execution',sex:'HOMME',gf:6,nr:90},
 {name:'Agent 5',college:'cadres',sex:'',gf:18,nr:240}
];
const means=(college:string,sex:string)=>{
 const selected=people.filter(r=>matchesAgentCohort(r,college,sex));
 const calc=(key:'gf'|'nr')=>selected.length?selected.reduce((sum,r)=>sum+r[key],0)/selected.length:null;
 return {count:selected.length,gf:calc('gf'),nr:calc('nr')};
};
test('Both overview averages must respond to college and sex',()=>{
 assert.deepEqual(means('',''),{count:5,gf:13.4,nr:181});
 assert.deepEqual(means('cadres',''),{count:3,gf:17,nr:670/3});
 assert.deepEqual(means('cadres','femmes'),{count:1,gf:16,nr:205});
 assert.deepEqual(means('cadres','hommes'),{count:1,gf:17,nr:225});
 assert.deepEqual(means('maitrise','femmes'),{count:1,gf:10,nr:145});
 assert.deepEqual(means('execution','femmes'),{count:0,gf:null,nr:null});
});
test('Unknown source sex is not guessed or included in sex-specific cohorts',()=>{
 for(const raw of [undefined,'','Non renseigné','inconnu','X']){
  assert.equal(normalizeAgentSex(raw),null);
  assert.equal(matchesAgentCohort({college:'cadres',sex:raw as string},'cadres','femmes'),false);
  assert.equal(matchesAgentCohort({college:'cadres',sex:raw as string},'cadres','hommes'),false);
 }
 for(const raw of ['F','FEMME','femmes','féminin'])assert.equal(normalizeAgentSex(raw),'femmes');
 for(const raw of ['H','HOMME','hommes','Masculin'])assert.equal(normalizeAgentSex(raw),'hommes');
});
test('Validated future individual spreadsheets can import explicit sex and college',()=>{
 const header=['NNI','NOM ET PRENOM','GF','NR','COLLEGE','SEXE'];
 const rows:unknown[][]=[header,['A12345','Agent 2025',16,205,'CADRES','F']];
 const mapping=detectMapping(header);
 const records=mapAgentRows(rows,mapping,0,'2025-12-31');
 assert.equal(records.length,1);
 assert.equal(records[0].sex,'femmes');
 assert.equal(records[0].college,'cadres');
 const unknown=mapAgentRows([header,['B12345','Agent inconnu',15,200,'MAITRISE','inconnu']],mapping,0,'2025-12-31');
 assert.equal(unknown[0].sex,undefined);
});
test('API applies cohort before aggregating and publishes sex coverage',()=>{
 const server=readFileSync(new URL('../src/app/api/agents/route.ts',import.meta.url),'utf8');
 assert.match(server,/matchesAgentCohort\(r,p\.get\('college'\)\|\|'',p\.get\('sex'\)\|\|''\)/);
 assert.match(server,/identified=selected\.filter/);
 assert.match(server,/sexKnown:current\.filter/);
 assert.match(server,/nrMean:average\('nr'\),gfMean:average\('gf'\)/);
});
test('Overview sends sex and college to the same years and never reuses other cohorts',()=>{
 const dashboard=readFileSync(new URL('../src/app/dashboard.tsx',import.meta.url),'utf8');
 assert.match(dashboard,/\[to,college,sex,averageSources\]/);
 assert.match(dashboard,/college:college==='ensemble'\?'':college,sex:sex==='ensemble'\?'':sex/);
 assert.match(dashboard,/const currentAverage=agentAverages\[to\+'\|'\+college\+'\|'\+sex\]/);
 assert.match(dashboard,/const previousAverage=agentAverages\[\(to-1\)\+'\|'\+college\+'\|'\+sex\]/);
 assert.match(dashboard,/change=\{variation\(currentAverage\?\.gf,previousAverage\?\.gf\)\}/);
 assert.match(dashboard,/change=\{variation\(currentAverage\?\.nr,previousAverage\?\.nr\)\}/);
 assert.match(dashboard,/Sexe non renseigné dans ce fichier/);
 assert.match(dashboard,/onglets\?\\s\+mis\\s\+en\\s\+forme/);
});
