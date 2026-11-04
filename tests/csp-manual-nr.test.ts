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

test('a confirmed same-day arrival precedes its manual advancement even when the annual snapshot lacks the agent',()=>{
 const arrival:CspEvent={id:'arrival',agentId:entry.agentId,name:entry.name,kind:'mutation',
  effective:entry.effective,page:1,selected:true,approved:true,newAgent:true,
  gfDelta:0,gfBefore:18,gfAfter:18,nrBefore:350,nrAfter:350,agency:'AGENCE EXEMPLE'};
 const arrivals:CspImport={id:'arrival-doc',name:'ODJ fictif d’arrivée',date:'2026-07-10',documentType:'cr',
  status:'validated',events:[arrival]};
 const output=projectCsp({...base,records:[]},[manual,arrivals],'2026-11-03');
 assert.deepEqual(output.issues,[]);
 const current=output.data.records.find(r=>r.source===CSP_SOURCE&&r.agentId===entry.agentId);
 assert.equal(current?.nr,355);
 assert.equal(current?.entryUnit,entry.effective);
});

test('validated manual NR movement makes exact previous-gap warning actionable without inventing an ODJ',async()=>{
 const {prepareCspDocuments}=await import('../src/lib/csp-candidates.ts');
 const documented:CspEvent={...later,
  approved:false,
  extractionIssue:'Décision antérieure manquante : justificatif du passage NR 350 à 355 non intégré. Ajouter et valider cette décision avant de confirmer la mesure NR 355 à 360.',
  salaryReference:{nni:entry.agentId,gf:18,nr:355,nrAfter:360,steps:1,effective:entry.effective,
   rup:{source:'rup-fictif',date:'2026-09-30'},
   cr:{id:'csp-later',name:'ODJ fictif',eventId:'salary-later',page:3}}
 };
 const evidence={...laterDocument,events:[documented]};
 const without=prepareCspDocuments(base,[documented],[],laterDocument.date,[evidence],{id:evidence.id,name:evidence.name,documentType:'cr'});
 assert.equal(without[0].state,'blocked');
 assert.match(without[0].problem,/Décision antérieure manquante/);
 const withManual=prepareCspDocuments(base,[documented],[manual],laterDocument.date,[evidence],{id:evidence.id,name:evidence.name,documentType:'cr'});
 assert.equal(withManual[0].state,'ready',withManual[0].problem);
 assert.equal(withManual[0].after?.nr,360);
 assert.equal(withManual[0].extractionIssue,undefined);
 assert.match(withManual[0].note||'',/avancement administratif manuel/);
});

test('January choice advancement is preserved while ULM arrival begins in September',()=>{
 const january={...entry,effective:'2026-01-01',arrivalConfirmed:true,arrivalEffective:'2026-09-01',arrivalAgency:'AGENCE EXEMPLE'};
 assert.equal(validateManualNR(january),true);
 const manualJanuary=manualNRImport({...january,id:'january-award',actor:'admin',created:'2026-11-04T07:00:00Z'});
 assert.equal(manualJanuary.events.find(e=>e.kind==='avancement')?.effective,'2026-01-01');
 assert.equal(manualJanuary.events.find(e=>e.kind==='mutation')?.effective,'2026-09-01');
 const absent={...base,records:[]};
 const before=projectCsp(absent,[manualJanuary],'2026-08-31');
 assert.deepEqual(before.issues,[]);
 assert.equal(before.data.records.some(r=>r.agentId===entry.agentId),false);
 const after=projectCsp(absent,[manualJanuary],'2026-09-01');
 assert.deepEqual(after.issues,[]);
 const current=after.data.records.find(r=>r.source===CSP_SOURCE&&r.agentId===entry.agentId);
 assert.equal(current?.gf,18);
 assert.equal(current?.nr,355);
 assert.equal(current?.entryUnit,'2026-09-01');
 assert.equal(current?.nrDate,'2026-01-01');
});

test('later official constant mutation remains independently represented after provisional arrival',()=>{
 const january={...entry,effective:'2026-01-01',arrivalConfirmed:true,arrivalEffective:'2026-09-01',arrivalAgency:'AGENCE EXEMPLE'};
 const manualJanuary=manualNRImport({...january,id:'january-award-2',actor:'admin',created:'2026-11-04T07:00:00Z'});
 const official:CspEvent={id:'official-mutation',name:entry.name,agentId:entry.agentId,kind:'mutation',effective:'2026-09-01',page:1,selected:true,approved:true,agency:'AGENCE EXEMPLE',gfDelta:0,gfBefore:18,gfAfter:18,nrBefore:350,nrAfter:350};
 const doc:CspImport={id:'official-doc',name:'Official reference',date:'2026-07-10',status:'validated',documentType:'cr',events:[official]};
 const projected=projectCsp({...base,records:[]},[manualJanuary,doc],'2026-09-01');
 assert.deepEqual(projected.issues,[]);
 assert.equal(projected.data.records.find(r=>r.source===CSP_SOURCE&&r.agentId===entry.agentId)?.nr,355);
});

test('reject an arrival declared before its historical award or without agency',()=>{
 assert.equal(validateManualNR({...entry,effective:'2026-01-01',arrivalConfirmed:true,arrivalEffective:'2025-12-01',arrivalAgency:'AGENCE EXEMPLE'}),false);
 assert.equal(validateManualNR({...entry,effective:'2026-01-01',arrivalConfirmed:true,arrivalEffective:'2026-09-01'}),false);
});

test('documented September 355 to 360 measure becomes ready after January manual award and September arrival',async()=>{
 const {prepareCspDocuments}=await import('../src/lib/csp-candidates.ts');
 const january={...entry,effective:'2026-01-01',arrivalConfirmed:true,arrivalEffective:'2026-09-01',arrivalAgency:'AGENCE EXEMPLE'};
 const manualJanuary=manualNRImport({...january,id:'january-award-3',actor:'admin',created:'2026-11-04T07:00:00Z'});
 const official:CspEvent={id:'mutation-350',name:entry.name,agentId:entry.agentId,kind:'mutation',
  effective:'2026-09-01',page:1,selected:true,approved:true,agency:'AGENCE EXEMPLE',gfDelta:0,gfBefore:18,gfAfter:18,nrBefore:350,nrAfter:350};
 const mutationDoc:CspImport={id:'mutation-doc',name:'Official mutation',date:'2026-07-10',status:'validated',documentType:'cr',events:[official]};
 const documented:CspEvent={...later,approved:false,
  extractionIssue:'Décision antérieure manquante : justificatif du passage NR 350 à 355 non intégré. Ajouter et valider cette décision avant de confirmer la mesure NR 355 à 360.',
  salaryReference:{nni:entry.agentId,gf:18,nr:355,nrAfter:360,steps:1,effective:'2026-09-01',
   rup:{source:'rup-fictif',date:'2026-09-30'},cr:{id:'csp-later',name:'ODJ fictif',eventId:'salary-later',page:3}}
 };
 const evidence={...laterDocument,events:[documented]};
 const preview=prepareCspDocuments({...base,records:[]},[documented],[manualJanuary,mutationDoc],evidence.date,[evidence,mutationDoc],{id:evidence.id,name:evidence.name,documentType:'cr'});
 assert.equal(preview[0].state,'ready',preview[0].problem);
 assert.equal(preview[0].before?.nr,355);
 assert.equal(preview[0].after?.nr,360);
});

test('approved September salary measure follows confirmed January manual advancement, preserving exactly NR 360',()=>{
 const january={...entry,effective:'2026-01-01',arrivalConfirmed:true,arrivalEffective:'2026-09-01',arrivalAgency:'AGENCE EXEMPLE'};
 const bridge=manualNRImport({...january,id:'real-sequence',created:'2026-11-04T08:25:00Z',actor:'admin'});
 const officialMutation:CspEvent={id:'july-mutation',name:entry.name,agentId:entry.agentId,kind:'mutation',
  effective:'2026-09-01',page:1,selected:true,approved:true,
  agency:'AGENCE EXEMPLE',job:'CHEF DE MISSION',gfDelta:0,gfBefore:18,gfAfter:18,nrBefore:350,nrAfter:350,
  recordedBefore:{gf:18,nr:350},recordedAfter:{gf:18,nr:350}};
 const shortRD:CspEvent={id:'july-rd',name:entry.name,agentId:entry.agentId,kind:'mutation',
  effective:'2026-09-01',page:1,selected:true,approved:true,agency:'AGENCE EXEMPLE',
  recordedBefore:{gf:18,nr:360},recordedAfter:{gf:18,nr:360}};
 const mutationODJ:CspImport={id:'july-odj',name:'July ODJ',date:'2026-07-10',created:'2026-07-10T08:00:00Z',
  status:'validated',documentType:'cr',events:[officialMutation]};
 const mutationRD:CspImport={id:'july-rd-doc',name:'July RD',date:'2026-07-10',created:'2026-07-11T08:00:00Z',
  status:'validated',documentType:'rd',events:[shortRD]};
 const salaryDoc:CspImport={...laterDocument,created:'2026-10-09T08:00:00Z'};
 for(const ordering of [[salaryDoc,mutationRD,bridge,mutationODJ],[bridge,mutationODJ,salaryDoc,mutationRD]]){
  const projected=projectCsp({...base,records:[]},ordering,'2026-11-04');
  assert.deepEqual(projected.issues,[]);
  assert.equal(projected.data.records.find(r=>r.source===CSP_SOURCE&&r.agentId===entry.agentId)?.nr,360);
 }
});
