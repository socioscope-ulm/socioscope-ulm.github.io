import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateNRReport,type NRReportEvent,type NRReportDocument} from '../src/lib/csp-nr-report.ts';
import {applyNRScopes} from '../src/lib/nr-allocation.ts';

const event=(id:string,agentId:string,agency='') : NRReportEvent => ({
 id,name:'PERSONNE FICTIVE '+id,agentId,kind:'avancement',effective:'2026-01-01',
 selected:true,approved:true,recordedBefore:{gf:18,nr:350,...(agency?{agency}:{})},
 recordedAfter:{gf:18,nr:355,...(agency?{agency}:{})}
});
const doc:NRReportDocument={id:'csp-fictif',name:'Document fictif',status:'validated',date:'2026-09-01',documentType:'rd',events:[event('a','FA0011'),event('b','FB0022','DIRECTION'),event('c','FC0033','AMT EST')]};
test('Un NR sans agence reste visible dans le parcours, mais non imputé avant classement',()=>{
 const base=calculateNRReport([doc],2026),s=applyNRScopes(base,[]);
 assert.equal(base.total,3);assert.equal(s.totalRecorded,3);
 assert.equal(s.totalUlm,2);assert.equal(s.totalToClarify,1);
 assert.equal(s.totalOutside,0);
 assert.equal(s.rows.find(r=>r.agentId==='FA0011')?.allocationScope,'to_clarify');
 assert.equal(s.rows.find(r=>r.agentId==='FB0022')?.accountingAgency,'DIRECTION');
});
test('Un NR d’une unité externe peut conserver son agence actuelle sans la créditer',()=>{
 const base=calculateNRReport([doc],2026);
 const source=base.rows.find(r=>r.agentId==='FA0011')!;
 const original=JSON.stringify(base);
 const s=applyNRScopes(base,[{rowId:source.id,agentId:source.agentId,scope:'outside_ulm',relatedAgency:'DIRECTION',reason:'Attribué par unité extérieure avant arrivée dans ULM'}]);
 assert.equal(s.totalUlm,2);assert.equal(s.totalOutside,1);assert.equal(s.totalToClarify,0);
 const assigned=s.rows.find(r=>r.id===source.id)!;
 assert.equal(assigned.accountingAgency,'');
 assert.equal(assigned.relatedAgency,'DIRECTION');
 assert.equal(assigned.beforeNR,350);assert.equal(assigned.afterNR,355);
 assert.equal(JSON.stringify(base),original,'les événements et chiffres de carrière ne sont jamais modifiés');
});
test('Une agence ULM ne reçoit pas de NR externes ou à clarifier',()=>{
 const base=calculateNRReport([doc],2026);
 const source=base.rows.find(r=>r.agentId==='FA0011')!;
 const other=base.rows.find(r=>r.agentId==='FB0022')!;
 const s=applyNRScopes(base,[{rowId:source.id,agentId:source.agentId,scope:'ulm',agency:'AMT EST',reason:'Attribution ULM confirmée par document'}, {rowId:other.id,agentId:other.agentId,scope:'outside_ulm',relatedAgency:'DIRECTION',reason:'Attribution hors unité ULM confirmée'}]);
 assert.equal(s.totalUlm,2);assert.equal(s.totalOutside,1);
 assert.equal(s.rows.filter(r=>r.allocationScope==='ulm'&&r.accountingAgency==='AMT EST').reduce((v,r)=>v+r.nr!,0),2);
 assert.equal(s.rows.filter(r=>r.allocationScope==='ulm'&&r.accountingAgency==='DIRECTION').length,0);
});
test('Un classement obsolète avec un mauvais NNI ne peut pas influencer les totaux',()=>{
 const base=calculateNRReport([doc],2026),source=base.rows[0];
 const s=applyNRScopes(base,[{rowId:source.id,agentId:'OTHER1',scope:'outside_ulm',reason:'Ne doit pas être appliqué'}]);
 assert.equal(s.totalOutside,0);assert.equal(s.totalToClarify,1);
});
