import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parcoursMetricVisible} from '../src/lib/parcours-metrics.ts';

test('Parcours et egalite masque seulement les graphes dupliques de salaire et des prix',()=>{
 for(const [id,label] of [
  ['remuneration','Rémunération moyenne'],
  ['remuneration_total','Rémunération moyenne ensemble'],
  ['remuneration_nonstat_cdd','Rémunération moyenne CDD'],
  ['inflation','Inflation nationale INSEE'],
  ['insee','INSEE évolution des prix'],
  ['inflation_annual','Inflation annuelle'],
  ['snb','Revalorisation du SNB'],
  ['snb_annuel','Taux annuel du SNB'],
  ['indice_snb','SNB - revalorisation']
 ]){
  assert.equal(parcoursMetricVisible(id,{label,theme:'remuneration'}),false,id);
 }
});
test('Les indicateurs propres aux parcours et aux ecarts restent consultables',()=>{
 for(const [id,label] of [
  ['promotions_m3e','Promotions M3E'],
  ['promotions_college','Promotions par college'],
  ['mobilite','Mobilité'],
  ['remuneration_ecart_hf','Écart brut hommes / femmes'],
  ['anciennete','Ancienneté']
 ]){
  assert.equal(parcoursMetricVisible(id,{label,theme:'parcours'}),true,id);
 }
});
test('Le filtrage porte uniquement sur Parcours, les comparaisons salariales restent presentes',()=>{
 const dashboard=readFileSync(new URL('../src/app/dashboard.tsx',import.meta.url),'utf8');
 assert.match(dashboard,/tab==='parcours'\?\['parcours','emploi','remuneration'\]\.includes\(m\.theme\)&&parcoursMetricVisible\(id,m\)/);
 assert.match(dashboard,/tab==='parcours'&&data&&!parcoursMetricVisible\(metric/);
 assert.match(dashboard,/const comparisonView=tab==='remuneration'&&salaryView==='comparison'/);
 assert.match(dashboard,/<SalaryComparisonView data=\{data\}/);
 assert.match(dashboard,/metric==='snb'\?'Revalorisation du SNB'/);
 assert.match(dashboard,/const selectedMetric=populationData!\.metrics\[metric\]/);
});
