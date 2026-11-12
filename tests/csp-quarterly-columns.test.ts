import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getMovementColumns} from '../src/lib/csp-quarterly-columns.ts';

test('GF avant/apres est toujours visible pour admission et titularisation',()=>{
 for(const kind of ['admission','titularisation']){
  const columns=getMovementColumns([],kind);
  assert.ok(columns.some(c=>c.id==='gf'));
  assert.deepEqual(columns.map(c=>c.id),['name','agency','observations','dates','gf']);
 }
});
test('Les autres motifs respectent la case GF et les colonnes selectionnees',()=>{
 for(const kind of ['nomination','mutation','reclassement','avancement','mesure','posthume']){
  assert.equal(getMovementColumns([],kind).some(c=>c.id==='gf'),false);
  assert.equal(getMovementColumns(['gf'],kind).some(c=>c.id==='gf'),true);
 }
 assert.deepEqual(getMovementColumns(['nr'],'admission').map(c=>c.id),['name','agency','observations','dates','gf','nr']);
});
test('Les largeurs des tableaux restent constantes quel que soit le motif',()=>{
 const total=columns=>columns.reduce((sum,c)=>sum+c.width,0);
 const expected=total(getMovementColumns());
 for(const kind of ['admission','titularisation','nomination']){
  assert.ok(Math.abs(total(getMovementColumns([],kind))-expected)<.000001);
 }
});

test('NR+ absent pour les admissions au stage et les titularisations même si la case globale est cochée',()=>{
 for(const kind of ['admission','titularisation']){
  const columns=getMovementColumns(['gf','nr','nrSteps','source'],kind);
  assert.equal(columns.some(c=>c.id==='nrSteps'),false);
  assert.equal(columns.some(c=>c.id==='gf'),true);
  assert.equal(columns.some(c=>c.id==='nr'),true);
 }
});
test('NR+ reste une option pour les autres mouvements et les largeurs restent équilibrées',()=>{
 for(const kind of ['avancement','reclassement','nomination','mutation','mesure','posthume']){
  assert.equal(getMovementColumns(['nrSteps'],kind).some(c=>c.id==='nrSteps'),true);
  assert.equal(getMovementColumns([],kind).some(c=>c.id==='nrSteps'),false);
 }
 const full=getMovementColumns().reduce((n,c)=>n+c.width,0);
 for(const kind of ['admission','titularisation']){
  assert.ok(Math.abs(getMovementColumns(['gf','nr','nrSteps','source'],kind).reduce((n,c)=>n+c.width,0)-full)<1e-6);
 }
});

test('Motif affiché automatiquement sur reclassements et mesures, avant la date',()=>{
 for(const kind of ['reclassement','mesure']){
  const columns=getMovementColumns([],kind);
  assert.deepEqual(columns.slice(0,4).map(c=>c.id),['name','agency','motif','dates']);
  assert.equal(columns[2].header,'MOTIF');
  assert.equal(columns.some(c=>c.id==='observations'),false);
 }
});
test('Observations affichées automatiquement sur admissions, titularisations, mutations et avancements',()=>{
 for(const kind of ['admission','titularisation','mutation','avancement']){
  const columns=getMovementColumns([],kind);
  assert.deepEqual(columns.slice(0,4).map(c=>c.id),['name','agency','observations','dates']);
  assert.equal(columns.some(c=>c.id==='motif'),false);
 }
 const stage=getMovementColumns(['nrSteps'],'admission').map(c=>c.id);
 assert.deepEqual(stage,['name','agency','observations','dates','gf']);
});
test('Plus de cases activables Motif et Observations; tailles de page constantes',async()=>{
 const {optionalMovementColumns,defaultMovementColumns}=await import('../src/lib/csp-quarterly-columns.ts');
 assert.deepEqual(optionalMovementColumns.map(c=>c.id),['gf','nr','nrSteps','source']);
 assert.deepEqual(defaultMovementColumns,['gf','nr','nrSteps','source']);
 assert.equal(getMovementColumns().some(c=>c.id==='motif'||c.id==='observations'),false);
 const kinds=['admission','titularisation','mutation','avancement','reclassement','mesure','nomination','posthume'];
 for(const kind of kinds){
  assert.equal(getMovementColumns(defaultMovementColumns,kind).reduce((n,c)=>n+c.width,0).toFixed(2),'12.33');
 }
});

test('Nomination aux postes vacants : Aptitude RD systématique avant CSP / effet',()=>{
 const columns=getMovementColumns([], 'nomination');
 assert.deepEqual(columns.slice(0,4).map(c=>c.id),['name','agency','aptitude','dates']);
 assert.equal(columns[2].header,'APTITUDE');
 assert.equal(columns[2].label,'Aptitude (RD)');
 assert.equal(columns.some(c=>c.id==='nrSteps'),false);
 assert.equal(getMovementColumns(['nrSteps'],'nomination').some(c=>c.id==='nrSteps'),true);
 for(const kind of ['admission','titularisation','mutation','avancement','mesure','reclassement','posthume'])
  assert.equal(getMovementColumns([],kind).some(c=>c.id==='aptitude'),false,kind);
 assert.equal(columns.reduce((n,c)=>n+c.width,0).toFixed(2),'12.33');
});

test('Admission et titularisation : une seule valeur GF, dans aperçu et PowerPoint',()=>{
 for(const kind of ['admission','titularisation']){
  const columns=getMovementColumns([],kind);
  const gf=columns.find(c=>c.id==='gf');
  assert.ok(gf);
  assert.equal(gf.label,'GF');
  assert.equal(gf.header,'GF');
  assert.equal(gf.value({gfBefore:'12',gfAfter:'12'} as any),'12');
  assert.equal(gf.value({gfBefore:'—',gfAfter:'12'} as any),'12');
  assert.equal(gf.value({gfBefore:'12',gfAfter:'—'} as any),'12');
  assert.equal(gf.value({gfBefore:'—',gfAfter:'—'} as any),'—');
  assert.equal(gf.value({gfBefore:'12',gfAfter:'13'} as any),'12 → 13',
   'un écart réel doit rester visible et contrôlable');
  assert.equal(columns.reduce((sum,c)=>sum+c.width,0).toFixed(2),'12.33');
 }
 const other=getMovementColumns(['gf'],'reclassement').find(c=>c.id==='gf');
 assert.equal(other?.header,'GF AV. / AP.');
 assert.equal(other?.value({gfBefore:'12',gfAfter:'13'} as any),'12 / 13');
});

test('La case candidatures non retenues est alignée avec les quatre options de colonnes du CR',()=>{
 const jsx=readFileSync(new URL('../src/app/csp-quarterly-report.tsx',import.meta.url),'utf8');
 const group=jsx.match(/<div className="analysis-options csp-column-options">([\s\S]*?)<\/div>/)?.[1]||'';
 assert.match(group,/optionalMovementColumns\.map/);
 assert.match(group,/id="csp-cr-include-candidates"/);
 assert.match(group,/checked=\{includeCandidates\}/);
 assert.equal((jsx.match(/id="csp-cr-include-candidates"/g)||[]).length,1,
  'une seule commande pour les candidatures non retenues');
});
