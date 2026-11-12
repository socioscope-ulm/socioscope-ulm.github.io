import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getMovementColumns,optionalMovementColumns,defaultMovementColumns,type OptionalMovementColumn}
 from '../src/lib/csp-quarterly-columns.ts';

const kinds=['admission','titularisation','nomination','mutation','reclassement','avancement','mesure','posthume'];
const isStage=(kind:string)=>kind==='admission'||kind==='titularisation';
const close=(a:number,b:number,message:string)=>assert.ok(Math.abs(a-b)<.000001,message+' : '+a+' != '+b);
const start=(cs:ReturnType<typeof getMovementColumns>,id:string)=>{
 const i=cs.findIndex(c=>c.id===id);
 assert.ok(i>=0,'Colonne '+id+' manquante');
 return cs.slice(0,i).reduce((sum,c)=>sum+c.width,0);
};
const total=(cs:ReturnType<typeof getMovementColumns>)=>cs.reduce((n,c)=>n+c.width,0);

test('Trois colonnes activables et quatre cases de présentation, toutes désactivées par défaut',()=>{
 assert.deepEqual(optionalMovementColumns.map(c=>c.id),['gf','nr','source']);
 assert.deepEqual(defaultMovementColumns,[]);
 assert.equal(optionalMovementColumns.some(c=>c.id==='nrSteps'),false);
 const jsx=readFileSync(new URL('../src/app/csp-quarterly-report.tsx',import.meta.url),'utf8');
 assert.match(jsx,/const \[includeCandidates,setIncludeCandidates\]=useState\(false\)/);
 assert.match(jsx,/useState<OptionalMovementColumn\[]>\(defaultMovementColumns\)/);
 const group=jsx.match(/<div className="analysis-options csp-column-options">([\s\S]*?)<\/div>/)?.[1]||'';
 assert.match(group,/optionalMovementColumns\.map/);
 assert.match(group,/id="csp-cr-include-candidates"/);
 assert.match(group,/checked=\{includeCandidates\}/);
 assert.equal((jsx.match(/id="csp-cr-include-candidates"/g)||[]).length,1);
});

test('NR+ toujours apparent pour les mouvements concernés, sans case à cocher',()=>{
 const selectable:OptionalMovementColumn[][]=[[],['gf'],['nr'],['source'],['gf','nr','source']];
 for(const selected of selectable)for(const kind of kinds){
  const ids=getMovementColumns(selected,kind).map(c=>c.id);
  assert.equal(ids.includes('nrSteps'),!isStage(kind),kind+' '+selected);
 }
 for(const kind of kinds.filter(k=>!isStage(k))){
  const cols=getMovementColumns([],kind);
  const nr=cols.find(c=>c.id==='nrSteps');
  assert.ok(nr);
  assert.equal(nr.header,'NR +');
  assert.equal(nr.value({nrSteps:'2'} as any),'2');
 }
});

test('GF affiché une seule fois et toujours obligatoire pour admission/titularisation',()=>{
 for(const kind of ['admission','titularisation']){
  for(const selected of [[],['nr'],['gf'],['gf','nr','source']] as OptionalMovementColumn[][]){
   const cols=getMovementColumns(selected,kind);
   const gf=cols.find(c=>c.id==='gf');
   assert.ok(gf);
   assert.equal(gf.label,'GF');
   assert.equal(gf.header,'GF');
   assert.equal(gf.value({gfBefore:'12',gfAfter:'12'} as any),'12');
   assert.equal(gf.value({gfBefore:'—',gfAfter:'12'} as any),'12');
   assert.equal(gf.value({gfBefore:'12',gfAfter:'—'} as any),'12');
   assert.equal(gf.value({gfBefore:'—',gfAfter:'—'} as any),'—');
   assert.equal(gf.value({gfBefore:'12',gfAfter:'13'} as any),'12 → 13');
   assert.ok(!cols.some(c=>c.id==='nrSteps'));
  }
 }
 assert.equal(getMovementColumns(['gf'],'reclassement').find(c=>c.id==='gf')?.value(
  {gfBefore:'12',gfAfter:'13'} as any),'12 / 13');
});

test('Colonnes sélectionnées : pas de GF/NR/Source non demandés hors admission/titularisation',()=>{
 for(const kind of kinds){
  const none=getMovementColumns([],kind);
  assert.equal(none.some(c=>c.id==='gf'),isStage(kind),kind);
  assert.equal(none.some(c=>c.id==='nr'),false,kind);
  assert.equal(none.some(c=>c.id==='source'),false,kind);
  const all=getMovementColumns(['gf','nr','source'],kind);
  assert.ok(all.some(c=>c.id==='gf'));
  assert.ok(all.some(c=>c.id==='nr'));
  assert.ok(all.some(c=>c.id==='source'));
  assert.equal(all.some(c=>c.id==='nrSteps'),!isStage(kind));
 }
});

test('Motif, observations et aptitude gardent leur emplacement avant CSP / effet',()=>{
 for(const kind of ['reclassement','mesure']){
  assert.deepEqual(getMovementColumns([],kind).slice(0,4).map(c=>c.id),
   ['name','agency','motif','dates']);
 }
 for(const kind of ['admission','titularisation','mutation','avancement']){
  assert.deepEqual(getMovementColumns([],kind).slice(0,4).map(c=>c.id),
   ['name','agency','observations','dates']);
 }
 const nomination=getMovementColumns([], 'nomination');
 assert.deepEqual(nomination.slice(0,4).map(c=>c.id),['name','agency','aptitude','dates']);
 assert.equal(nomination.find(c=>c.id==='aptitude')?.header,'APTITUDE');
 for(const kind of kinds.filter(k=>k!=='nomination')){
  assert.equal(getMovementColumns([],kind).some(c=>c.id==='aptitude'),false);
 }
});

test('Alignement du quadrillage des tableaux du PPT entre rubriques et sur la même page',()=>{
 const configurations:OptionalMovementColumn[][]=[
  [],['gf'],['nr'],['source'],['gf','nr'],['gf','source'],['nr','source'],['gf','nr','source']
 ];
 for(const selected of configurations){
  const reference=getMovementColumns(selected,'mutation');
  close(total(reference),12.33,'total mutation');
  for(const kind of kinds){
   const cols=getMovementColumns(selected,kind);
   close(total(cols),12.33,'total '+kind+' '+selected);
   close(start(cols,'dates'),start(reference,'dates'),'début CSP / effet '+kind+' '+selected);
   const dateEnd=start(cols,'dates')+cols.find(c=>c.id==='dates')!.width;
   const refDateEnd=start(reference,'dates')+reference.find(c=>c.id==='dates')!.width;
   close(dateEnd,refDateEnd,'fin CSP / effet '+kind+' '+selected);
   close(start(cols,'agency'),start(reference,'agency'),'début agence '+kind+' '+selected);
   if(selected.includes('source')){
    close(start(cols,'source'),start(reference,'source'),'début Source '+kind+' '+selected);
   }
   if(selected.includes('gf')&&!isStage(kind)){
    close(start(cols,'gf'),start(reference,'gf'),'début GF '+kind+' '+selected);
   }
   if(selected.includes('gf')&&isStage(kind)){
    close(start(cols,'gf'),start(reference,'gf'),'GF stage vs autres '+kind+' '+selected);
   }
   if(selected.includes('gf')&&selected.includes('nr')){
    close(start(cols,'nr'),start(reference,'nr'),'début NR '+kind+' '+selected);
   }
  }
 }
});

test('NR+ invisible uniquement sur admissions/titularisations, Source de droite alignée',()=>{
 const selected:OptionalMovementColumn[]=['gf','nr','source'];
 const stage=getMovementColumns(selected,'admission');
 const titulaire=getMovementColumns(selected,'titularisation');
 const mutation=getMovementColumns(selected,'mutation');
 assert.deepEqual(stage.map(c=>c.id),['name','agency','observations','dates','gf','nr','source']);
 assert.deepEqual(titulaire.map(c=>c.id),stage.map(c=>c.id));
 assert.deepEqual(mutation.map(c=>c.id),['name','agency','observations','dates','gf','nr','nrSteps','source']);
 for(const id of ['dates','gf','nr','source']){
  close(start(stage,id),start(mutation,id),'alignement '+id);
  close(start(titulaire,id),start(mutation,id),'alignement titulaire '+id);
 }
 const rightEdge=(cols:ReturnType<typeof getMovementColumns>,id:string)=>
  start(cols,id)+cols.find(c=>c.id===id)!.width;
 close(rightEdge(stage,'nr'),rightEdge(mutation,'nrSteps'),'jonction Source stage');
 close(rightEdge(titulaire,'nr'),rightEdge(mutation,'nrSteps'),'jonction Source titulaire');
});
