import test from 'node:test';
import assert from 'node:assert/strict';
import {withInseeAnnualInflation} from '../src/lib/insee-annual.ts';
const make=()=>({observations:[{metric:'inflation',year:2025,value:0.8,source:'historique',page:0,sex:'ensemble',college:'ensemble',unit:'pourcent',population:'ensemble',verified:true}],documents:[],metrics:{},updated:'2026-01-01'});
test('Ajoute un nouveau taux annuel aux analyses sans écraser les taux historiques',()=>{
 const existing=make();
 const r=withInseeAnnualInflation(existing,{idbank:'011814640',values:[{year:2025,value:0.9},{year:2026,value:1.8}]},2027);
 assert.equal(r.observations.length,2);
 assert.equal(r.observations[0].value,0.8);
 assert.deepEqual(r.observations[1].year,2026);
 assert.equal(r.observations[1].source,'insee-auto');
 assert.equal(existing.observations.length,1);
});
test('Ne retient ni année courante incomplète ni identifiant différent',()=>{
 const existing=make();
 assert.equal(withInseeAnnualInflation(existing,{idbank:'011814640',values:[{year:2026,value:1.8}]},2026),existing);
 assert.equal(withInseeAnnualInflation(existing,{idbank:'wrong',values:[{year:2025,value:1.8}]},2027),existing);
});
test('Un fichier mal formé ne change aucune analyse',()=>{
 const existing=make();
 for(const values of [[{year:2026,value:NaN}],[{year:2026,value:1.8},{year:2026,value:1.7}],[{year:2026,value:100}]]){
  assert.equal(withInseeAnnualInflation(existing,{idbank:'011814640',values},2027),existing);
 }
});
