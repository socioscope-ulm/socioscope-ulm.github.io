import test from 'node:test';
import assert from 'node:assert/strict';
import {manualNRImport,validateManualNR} from '../src/lib/csp-manual-nr.ts';
import {projectCsp,CSP_SOURCE} from '../src/lib/csp.ts';
import type {AgentData} from '../src/lib/agents.ts';
import type {CspImport,CspEvent} from '../src/lib/csp.ts';
const entry={name:'EXEMPLE LOUISE',agentId:'Z12345',effective:'2026-09-01',gf:18,nrBefore:350,reason:'avancement_choix' as const,comment:'Avancement administratif confirmé sans bordereau disponible.'};
const manual=manualNRImport({...entry,id:'manual-fictive',created:'2026-11-03T12:00:00Z',actor:'admin-fictif'});
const base:AgentData={
 sources:[{id:'annual',name:'Situation fictive 2025',date:'2025-12-31',primary:true,status:'validated'} as any],
 records:[{id:'annual-person',source:'annual',row:1,name:entry.name,agentId:entry.agentId,nni:entry.agentId,gf:18,nr:350,agency:'AGENCE EXEMPLE'}],
 events:[],issues:[],updated:''
};
const later:CspEvent={id:'salary-later',name:entry.name,agentId:entry.agentId,kind:'mesure',effective:'2026-09-01',page:3,selected:true,approved:true,nrSteps:1,gfBefore:18,nrBefore:355,nrAfter:360};
const laterDocument:CspImport={id:'csp-later',name:'ODJ fictif',date:'2026-10-09',documentType:'cr',status:'validated',events:[later]};
test('manual NR +1 is separate, traceable, and applied chronologically before later documented award',()=>{
 assert.equal(validateManualNR(entry),true);
 assert.equal(manual.events[0].kind,'avancement');
 assert.match(manual.events[0].note||'',/Saisie administrative manuelle/);
 const output=projectCsp(base,[laterDocument,manual],'2026-11-03');
 assert.deepEqual(output.issues,[]);
 const latest=output.data.records.find(r=>r.source===CSP_SOURCE&&r.agentId===entry.agentId);
 assert.equal(latest?.gf,18);
 assert.equal(latest?.nr,360);
});
test('manual award alone adds exactly 5 NR without changing GF',()=>{
 const output=projectCsp(base,[manual],'2026-11-03');
 assert.deepEqual(output.issues,[]);
 const current=output.data.records.find(r=>r.source===CSP_SOURCE&&r.agentId===entry.agentId);
 assert.equal(current?.nr,355);
 assert.equal(current?.gf,18);
});
test('manual award cannot create a missing agent or invent an arrival',()=>{
 const output=projectCsp({...base,records:[]},[manual],'2026-11-03');
 assert.equal(output.issues.length,1);
 assert.match(output.issues[0].problem,/absent de la photographie/i);
});
test('reject incomplete or abusive manual advancements',()=>{
 assert.equal(validateManualNR({...entry,comment:'court'}),false);
 assert.equal(validateManualNR({...entry,nrBefore:351}),false);
 assert.equal(validateManualNR({...entry,reason:'unknown'}),false);
 assert.equal(validateManualNR({...entry,agentId:'wrong'}),false);
});
