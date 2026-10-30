import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const bundle=await build({entryPoints:[new URL('../src/app/csp-salary-cell.tsx',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic'});
const {CspSalaryCell}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const event={id:'fiction',name:'EXEMPLE ALICE',kind:'admission',effective:'2026-04-01',page:1,selected:true,gfAfter:8,nrAfter:130};
const render=(e:any,before?:any,after?:any)=>renderToStaticMarkup(createElement(CspSalaryCell,{event:e,before,after}));
test('unmatched admissions and titularisations display read GF/NR without pretending integration or approval',()=>{
 for(const e of [event,{...event,kind:'titularisation',gfBefore:8,nrBefore:130}]){
  const html=render(e);assert.match(html,/Lus dans le document : GF 8 · NR 130/);assert.match(html,/Situation non encore calculée/);assert.doesNotMatch(html,/Non renseigné|Validée/);
 }
 assert.equal(event.agentId,undefined);assert.equal((event as any).approved,undefined);
});
test('computed results remain distinct from different documentary values and missing cells remain unknown',()=>{
 const html=render(event,{gf:8,nr:125},{gf:8,nr:135});assert.match(html,/GF 8 · NR 125/);assert.match(html,/GF 8 · NR 135/);assert.match(html,/Lus dans le document : GF 8 · NR 130/);assert.doesNotMatch(html,/non encore calculée/);
 const missing=render({...event,nrAfter:undefined});assert.match(missing,/GF 8 · NR \?/);assert.doesNotMatch(missing,/NR 130/);
 const legacy=render({...event,gfAfter:undefined,nrAfter:undefined});assert.equal(legacy,'Non renseigné');
});
