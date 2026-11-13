import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateNRReport,type NRReportDocument,type NRReportEvent} from '../src/lib/csp-nr-report.ts';
const event=(overrides:Partial<NRReportEvent>={}):NRReportEvent=>({id:'1',name:'AGENT FICTIF',agentId:'AAA111',kind:'avancement',effective:'2026-01-01',selected:true,approved:true,recordedBefore:{nr:200,gf:10,agency:'AMT EST'},recordedAfter:{nr:205,gf:10,agency:'AMT EST'},...overrides});
const doc=(events:NRReportEvent[],extra:Partial<NRReportDocument>={}):NRReportDocument=>({id:'csp-1',name:'CSP fictive',date:'2026-06-01',status:'validated',events,...extra});
test('1 NR attribué et agence historique',()=>{const r=calculateNRReport([doc([event()])],2026);assert.equal(r.total,1);assert.equal(r.rows[0].agency,'AMT EST');assert.equal(r.agents,1);});
test('ne comptabilise ni nomination constante ni candidat ni décision non validée',()=>{const r=calculateNRReport([doc([event({kind:'nomination',recordedAfter:{nr:200}}),event({id:'2',candidacy:true}),event({id:'3',approved:false}),event({id:'4',nonRetained:true})])],2026);assert.equal(r.total,0);assert.equal(r.rows.length,0);});
test('pas de double comptage ODJ/RD',()=>{const e=event();const r=calculateNRReport([doc([e]),doc([event({id:'rd-1',acknowledgedByDocument:{id:'csp-1'}})],{id:'csp-2',name:'RD fictif'})],2026);assert.equal(r.total,1);});
test('dédoublonne deux copies et garde deux avancements successifs du même jour',()=>{const r=calculateNRReport([doc([event(),event({id:'2'}),event({id:'3',recordedBefore:{nr:205},recordedAfter:{nr:210}})])],2026);assert.equal(r.total,2);assert.equal(r.rows.length,2);});
test('écart observé prioritaire sur un nombre théorique de NR',()=>{const r=calculateNRReport([doc([event({kind:'reclassement',nrSteps:2,recordedAfter:{nr:205}})])],2026);assert.equal(r.total,1);});
test('compte 4 NR posthumes et refuse une hausse incohérente',()=>{const r=calculateNRReport([doc([event({kind:'posthume',recordedAfter:{nr:220}}),event({id:'2',recordedAfter:{nr:207}})])],2026);assert.equal(r.total,4);assert.equal(r.toVerify,1);});
test('pas de total inventé lorsque le gain est indéterminé',()=>{const r=calculateNRReport([doc([event({kind:'nomination',recordedBefore:undefined,recordedAfter:undefined})])],2026);assert.equal(r.total,0);assert.equal(r.toVerify,1);});
test('compte nrSteps validé quand les indices ne sont pas fournis',()=>{const r=calculateNRReport([doc([event({recordedBefore:undefined,recordedAfter:undefined,nrSteps:2,nrBefore:undefined,nrAfter:undefined})])],2026);assert.equal(r.total,2);});
test('inclut les corrections manuelles séparément, sans effacer le décompte CSP',()=>{const r=calculateNRReport([doc([event()]),doc([event({id:'manual',name:'AGENT B',agentId:'BBB222'})],{id:'manual',manual:true})],2026);assert.equal(r.totalCsp,1);assert.equal(r.totalManual,1);});
test('respecte la date d’effet plutôt que la date de la séance',()=>{const r=calculateNRReport([doc([event({effective:'2026-01-01'})],{date:'2025-12-10'})],2026);assert.equal(r.total,1);assert.equal(calculateNRReport([doc([event()])],2025).total,0);});

test('ODJ/RD explicitement liés : nomination GF constant et NR constant sort des alertes sans mutation',()=>{
 const candidate=event({
  id:'odj-candidat',name:'PERSONNE FICTIVE',agentId:undefined,kind:'nomination',effective:'',
  candidacy:true,reference:'26-00000.01',job:'POSTE FICTIF',agency:'AMT FICTIF',
  recordedBefore:undefined,recordedAfter:{gf:14,nr:230,nrProvisional:true},
  gfBefore:14,nrBefore:230,
  acknowledgedByDocument:{id:'rd-fictif',eventId:'rd-decision'}
 });
 const approved=event({
  id:'rd-decision',name:'PERSONNE FICTIVE',agentId:'pending-csp-fictif',kind:'nomination',
  effective:'2026-10-01',reference:'26-00000.01',job:'POSTE FICTIF',agency:'AMT FICTIF',
  gfDelta:0, nrSteps:undefined,nrBefore:undefined,nrAfter:undefined,
  recordedBefore:undefined,recordedAfter:{gf:14,nr:230,nrProvisional:true}
 });
 const docs=[doc([candidate],{id:'odj-fictif',date:'2026-09-11'}),doc([approved],{id:'rd-fictif',date:'2026-09-11'})];
 const before=JSON.stringify(docs);
 const result=calculateNRReport(docs,2026);
 assert.equal(result.toVerify,0);
 assert.equal(result.total,0);
 assert.equal(result.rows.length,0);
 assert.equal(JSON.stringify(docs),before);
});
test('Pas de rapprochement comptable sans concordance complète ou lien approuvé unique',()=>{
 const candidate=event({id:'odj',name:'PERSONNE FICTIVE',kind:'nomination',effective:'',candidacy:true,
  gfBefore:14,nrBefore:230,recordedBefore:undefined,recordedAfter:undefined,
  reference:'REF-A',job:'POSTE FICTIF',acknowledgedByDocument:{id:'rd',eventId:'rd-1'}});
 const approved=event({id:'rd-1',name:'PERSONNE FICTIVE',kind:'nomination',
  gfDelta:0,recordedBefore:undefined,recordedAfter:{gf:14,nr:230,nrProvisional:true},
  nrBefore:undefined,nrAfter:undefined,reference:'REF-A',job:'POSTE FICTIF'});
 const original=doc([candidate],{id:'odj',date:'2026-09-11'});
 const rd=doc([approved],{id:'rd',date:'2026-09-11'});
 assert.equal(calculateNRReport([original,rd],2026).toVerify,0);
 for(const variant of [
  {...approved,reference:'AUTRE-REF'},
  {...approved,recordedAfter:{gf:14,nr:235,nrProvisional:true}},
  {...approved,recordedAfter:{gf:15,nr:230,nrProvisional:true}},
  {...approved,id:'rd-2'}
 ]){
  assert.equal(calculateNRReport([original,{...rd,events:[variant]}],2026).toVerify,1);
 }
 assert.equal(calculateNRReport([original,{...rd,events:[{...approved,nrSteps:1}]}],2026).total,1);
 assert.equal(calculateNRReport([original,{...rd,date:'2026-09-12'}],2026).toVerify,1);
 assert.equal(calculateNRReport([{...original,events:[candidate,{...candidate,id:'duplicate'}]},rd],2026).toVerify,1);
 assert.equal(calculateNRReport([{...original,status:'review'},rd],2026).toVerify,1);
});

test('ODJ historiques sans lien stocké : rapprochement strict référence, GF et NR pour plusieurs nominations',()=>{
 const names=['AGENT FICTIF UN','AGENT FICTIF DEUX'];
 const odjEvents=names.map((name,i)=>event({id:'candidate-'+i,name,agentId:'FICTIF-'+i,
  kind:'nomination',effective:'',candidacy:true,reference:'REFERENCE-'+i,job:'POSTE '+i,
  gfBefore:9+i,nrBefore:160+i*5,recordedBefore:undefined,recordedAfter:undefined}));
 const rdEvents=names.map((name,i)=>event({id:'decision-'+i,name,agentId:'FICTIF-'+i,
  kind:'nomination',effective:'2026-04-01',reference:'REFERENCE-'+i,job:'POSTE '+i,
  gfDelta:0,nrSteps:undefined,nrBefore:undefined,nrAfter:undefined,
  recordedBefore:undefined,recordedAfter:{gf:9+i,nr:160+i*5}}));
 const documents=[doc(odjEvents,{id:'odj',date:'2026-03-24'}),doc(rdEvents,{id:'rd',date:'2026-03-24'})];
 const snapshot=JSON.stringify(documents);
 const r=calculateNRReport(documents,2026);
 assert.equal(r.toVerify,0);
 assert.equal(r.total,0);
 assert.equal(r.rows.length,0);
 assert.equal(JSON.stringify(documents),snapshot);
});
test('Nomination RD historique avec variation GF absente : le ODJ/RD strictement concordant donne zéro NR',()=>{
 const candidate=event({id:'candidate',name:'AGENT FICTIF',kind:'nomination',effective:'',candidacy:true,
  reference:'REF',job:'POSTE',agency:'AMT FICTIF',gfBefore:10,nrBefore:165,
  recordedBefore:undefined,recordedAfter:{gf:10,nr:165}});
 const rdEvent=event({id:'decision',name:'AGENT FICTIF',kind:'nomination',effective:'2026-04-01',
  reference:'REF',job:'POSTE',agency:'AMT FICTIF',gfDelta:undefined,nrSteps:undefined,
  gfBefore:undefined,nrBefore:undefined,gfAfter:10,nrAfter:165,
  recordedBefore:undefined,recordedAfter:{gf:10,nr:165}});
 const odj=doc([candidate],{id:'odj',date:'2026-03-24'});
 const rd=doc([rdEvent],{id:'rd',date:'2026-03-24'});
 const original=JSON.stringify([odj,rd]);
 const report=calculateNRReport([odj,rd],2026);
 assert.equal(report.toVerify,0);
 assert.equal(report.total,0);
 assert.equal(report.rows.length,0);
 assert.equal(JSON.stringify([odj,rd]),original);
});
test('Nomination sans variation GF : contradictions, GF delta explicite et ambiguïtés restent à vérifier',()=>{
 const candidate=event({id:'candidate',kind:'nomination',effective:'',candidacy:true,
  reference:'REF',job:'POSTE',gfBefore:10,nrBefore:165,recordedBefore:undefined,recordedAfter:undefined});
 const rdEvent=event({id:'decision',kind:'nomination',reference:'REF',job:'POSTE',gfDelta:undefined,
  nrSteps:undefined,recordedBefore:undefined,recordedAfter:{gf:10,nr:165}});
 const odj=doc([candidate],{id:'odj'});
 const rd=doc([rdEvent],{id:'rd'});
 for(const variant of [
  {...rdEvent,gfDelta:1},
  {...rdEvent,gfBefore:9},
  {...rdEvent,recordedAfter:{gf:11,nr:165}},
  {...rdEvent,recordedAfter:{gf:10,nr:170}},
  {...rdEvent,reference:'REF DIFFERENTE'}
 ]) {
  const result=calculateNRReport([odj,{...rd,events:[variant]}],2026);
  assert.equal(result.toVerify,1);
 }
 assert.equal(calculateNRReport([odj,{...rd,events:[{...rdEvent,nrSteps:1}]}],2026).total,1);
 assert.equal(calculateNRReport([odj,{...rd,date:'2026-06-15'}],2026).toVerify,1);
 assert.equal(calculateNRReport([{...odj,events:[candidate,{...candidate,id:'duplicate'}]},rd],2026).toVerify,1);
 assert.equal(calculateNRReport([{...odj,status:'review'},rd],2026).toVerify,1);
});

test('Reclassements ODJ incomplets rapprochés avec leur RD validé : aucun faux contrôle ni double comptage',()=>{
 const date='2026-09-11',effective='2026-01-01';
 const odjEvents=[
  event({id:'p4r0',name:'AGENT FICTIF A',agentId:'FA',kind:'reclassement',effective,
   gfDelta:1,gfBefore:17,gfAfter:18,nrBefore:330,nrAfter:undefined,nrSteps:undefined,
   recordedBefore:{gf:18,nr:330,agency:'DIRECTION'},recordedAfter:undefined}),
  event({id:'p4r1',name:'AGENT FICTIF B',agentId:'FB',kind:'reclassement',effective,
   gfDelta:1,gfBefore:12,gfAfter:13,nrBefore:210,nrAfter:undefined,nrSteps:undefined,
   recordedBefore:{gf:13,nr:220,agency:'DIRECTION'},recordedAfter:undefined}),
  event({id:'odj-avancement',name:'AGENT FICTIF A',agentId:'FA',kind:'avancement',effective,
   gfBefore:17,nrBefore:325,nrAfter:330,nrSteps:1,
   recordedBefore:{gf:18,nr:330,agency:'DIRECTION'},recordedAfter:undefined})
 ];
 const rdEvents=[
  event({id:'rd-reclassement-a',name:'AGENT FICTIF A',agentId:'FA',kind:'reclassement',effective,gfDelta:1,
   recordedBefore:{gf:17,nr:315,agency:'DIRECTION'},recordedAfter:{gf:18,nr:325,agency:'DIRECTION'}}),
  event({id:'rd-reclassement-b',name:'AGENT FICTIF B',agentId:'FB',kind:'reclassement',effective,gfDelta:1,
   recordedBefore:{gf:12,nr:205,agency:'DIRECTION'},recordedAfter:{gf:13,nr:215,agency:'DIRECTION'}}),
  event({id:'rd-avancement-a',name:'AGENT FICTIF A',agentId:'FA',kind:'avancement',effective,nrSteps:1,
   recordedBefore:{gf:18,nr:325,agency:'DIRECTION'},recordedAfter:{gf:18,nr:330,agency:'DIRECTION'}}),
  event({id:'rd-avancement-b',name:'AGENT FICTIF B',agentId:'FB',kind:'avancement',effective,nrSteps:1,
   recordedBefore:{gf:13,nr:215,agency:'DIRECTION'},recordedAfter:{gf:13,nr:220,agency:'DIRECTION'}})
 ];
 const docs=[doc(odjEvents,{id:'odj-septembre',date,documentType:'cr'}),
  doc(rdEvents,{id:'rd-septembre',date,documentType:'rd'})];
 const before=JSON.stringify(docs);
 const result=calculateNRReport(docs,2026);
 assert.equal(result.toVerify,0);
 assert.equal(result.total,6);
 assert.equal(result.totalCsp,6);
 assert.equal(result.rows.length,4);
 assert.deepEqual(result.rows.filter(r=>r.kind==='reclassement').map(r=>[r.name,r.beforeNR,r.afterNR,r.nr]),[
  ['AGENT FICTIF A',315,325,2],['AGENT FICTIF B',205,215,2]
 ]);
 assert.ok(result.rows.filter(r=>r.kind==='reclassement').every(r=>r.supportingDocument==='CSP fictive'));
 assert.equal(JSON.stringify(docs),before);
});
test('Un reclassement sans RD unique, non validé ou incohérent ne perd pas son alerte',()=>{
 const odjEv=event({id:'odj',kind:'reclassement',effective:'2026-01-01',gfBefore:12,gfAfter:13,gfDelta:1,
  nrSteps:undefined,nrBefore:210,nrAfter:undefined,
  recordedBefore:{gf:13,nr:220},recordedAfter:undefined});
 const rdEv=event({id:'rd',kind:'reclassement',effective:'2026-01-01',gfDelta:1,
  recordedBefore:{gf:12,nr:205},recordedAfter:{gf:13,nr:215}});
 const odj=doc([odjEv],{id:'odj',date:'2026-09-11',documentType:'cr'});
 const rd=doc([rdEv],{id:'rd',date:'2026-09-11',documentType:'rd'});
 assert.equal(calculateNRReport([odj],2026).toVerify,1);
 assert.equal(calculateNRReport([odj,{...rd,status:'review'}],2026).toVerify,1);
 assert.equal(calculateNRReport([odj,{...rd,date:'2026-07-11'}],2026).toVerify,1);
 assert.equal(calculateNRReport([odj,{...rd,events:[{...rdEv,recordedAfter:{gf:13,nr:220}}]}],2026).toVerify,1);
 assert.equal(calculateNRReport([odj,{...rd,events:[{...rdEv,recordedAfter:{gf:14,nr:215}}]}],2026).toVerify,1);
 assert.equal(calculateNRReport([odj,{...rd,events:[{...rdEv,approved:false}]}],2026).toVerify,1);
 assert.equal(calculateNRReport([odj,{...rd,events:[rdEv,{...rdEv,id:'another'}]}],2026).toVerify,1);
 assert.equal(calculateNRReport([{...odj,events:[odjEv,{...odjEv,id:'another'}]},rd],2026).toVerify,1); // identical duplicate alerts are deduplicated
 assert.equal(calculateNRReport([odj,{...rd,events:[rdEv]},doc([rdEv],{id:'another-rd',date:'2026-09-11',documentType:'rd'})],2026).toVerify,1);
});
