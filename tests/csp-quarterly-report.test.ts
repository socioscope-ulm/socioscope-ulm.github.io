import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateQuarterlyReport,type QuarterlyDocument,type QuarterlyEvent} from '../src/lib/csp-quarterly-report.ts';
const ev=(change:Partial<QuarterlyEvent>={}):QuarterlyEvent=>({
 id:'one',name:'AGENT TEST',agentId:'TEST-1',kind:'nomination',selected:true,approved:true,effective:'2026-03-01',
 recordedBefore:{gf:12,nr:210},recordedAfter:{gf:13,nr:220},...change
});
const doc=(e:QuarterlyEvent[],changes:Partial<QuarterlyDocument>={}):QuarterlyDocument=>({
 id:'odj1',name:'ODJ-CSP Cadres du 06-03-2026.pdf',date:'2026-03-06',status:'validated',documentType:'cr',perEventValidation:true,events:e,...changes
});
test('T1 - ignore la note générique lorsque les NR sont réellement renseignés',()=>{
 const r=calculateQuarterlyReport([
  doc([ev({note:'Vérifier les situations avant/après ; le NR après doit être renseigné.'})]),
  doc([ev({note:'Vérifier les situations avant/après ; le NR après doit être renseigné.'})],
    {id:'rd1',name:'RD-CSP Cadres du 30-03-2026.pdf',documentType:'rd'})
 ],2026,1);
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].notes,'');
 assert.ok(!r.alerts.some(x=>x.includes('mouvement(s) présentant')));
});
test('T1 - indique le NR provisoire, pas un écart fictif',()=>{
 const r=calculateQuarterlyReport([doc([ev({recordedAfter:{gf:13,nr:220,nrProvisional:true},note:'Vérifier les situations avant/après ; le NR après doit être renseigné.'})])],2026,1);
 assert.equal(r.rows.length,1);
 assert.match(r.rows[0].notes,/provisoire/i);
 assert.ok(r.alerts.some(x=>x.includes('1 mouvement(s)')));
});
test('T1 - un ODJ partiellement confirmé reste signalé sans affecter les mouvements du RD',()=>{
 const r=calculateQuarterlyReport([
  doc([ev(),ev({id:'other',agentId:'OTHER',name:'AUTRE AGENT'})],{id:'odj-review',status:'review'}),
  doc([ev()],{id:'rd-valide',documentType:'rd',name:'RD-CSP Cadres du 30-03-2026.pdf'})
 ],2026,1);
 assert.equal(r.pendingDocuments,1);
 assert.equal(r.rows.length,1);
 assert.match(r.alerts.join(' '),/ODJ du 06\/03\/2026/);
});
test('T1 - ODJ isolé ne supprime pas les avancements validés',()=>{
 const r=calculateQuarterlyReport([doc([ev({kind:'avancement',nrSteps:1})],{date:'2026-03-05'})],2026,1);
 assert.equal(r.rows.length,1);
 assert.ok(r.alerts.some(x=>x.includes('05/03/2026')&&x.includes('RD non associé')));
});
test('Plusieurs mouvements distincts d’un même agent restent des lignes séparées',()=>{
 const r=calculateQuarterlyReport([doc([ev({kind:'reclassement'}),ev({id:'two',kind:'avancement',nrSteps:1})])],2026,1);
 assert.equal(r.rows.length,2);
});
test('ODJ entièrement confirmé par le RD : pas de fausse alerte ni double mouvement',()=>{
 const odj=doc([ev({acknowledgedByDocument:{id:'rd1'}})],{status:'review',automaticallyValidated:true});
 const rd=doc([ev()],{id:'rd1',documentType:'rd',name:'RD-CSP Cadres.pdf'});
 const r=calculateQuarterlyReport([odj,rd],2026,1);
 assert.equal(r.pendingDocuments,0);
 assert.ok(!r.alerts.some(x=>x.includes('encore en vérification')));
 assert.equal(r.rows.length,1);
 assert.deepEqual(r.rows[0].sources,['D02']);
 assert.equal(r.sources[0].automaticallyValidated,true);
 assert.equal(odj.status,'review');
});
test('Page non lue : conserver l’alerte même si une décision a un RD concordant',()=>{
 for(const automaticallyValidated of [false,undefined]){
  const r=calculateQuarterlyReport([
   doc([ev()],{status:'review',automaticallyValidated,unreadPages:1}),
   doc([ev()],{id:'rd1',documentType:'rd',name:'RD-CSP Cadres.pdf'})
  ],2026,1);
  assert.equal(r.pendingDocuments,1);
  assert.equal(r.rows.length,1);
  assert.match(r.alerts.join(' '),/encore en vérification/);
 }
});
test('Un statut désactivé ne peut pas bénéficier d’une ancienne confirmation automatique',()=>{
 const r=calculateQuarterlyReport([doc([ev()],{status:'disabled:validated',automaticallyValidated:true})],2026,1);
 assert.equal(r.pendingDocuments,1);
 assert.equal(r.rows.length,0);
 assert.equal(r.sources[0].automaticallyValidated,false);
});

test('Conserver les 14 contrôles avec identité, motif et document original',()=>{
 const r=calculateQuarterlyReport([doc(Array.from({length:14},(_,i)=>ev({id:'fictif-'+i,agentId:'FICTIF-'+i,name:'FICTIF '+i,page:7,note:'Vérifier la référence du poste.'})))],2026,1);
 assert.equal(r.rows.filter(r=>r.notes).length,14);
 for(const row of r.rows){assert.match(row.notes,/Note à relire/);assert.match(row.notes,/Vérifier la référence du poste/);assert.match(row.notes,/ODJ-CSP Cadres du 06-03-2026.pdf · page 7/);}
});
test('Une ancienne demande résolue ne masque pas une autre réserve dans la même note',()=>{
 const r=calculateQuarterlyReport([doc([ev({note:'Vérifier les situations avant/après ; le NR après doit être renseigné. Écart sur le poste à vérifier.'})])],2026,1);
 assert.match(r.rows[0].resolvedNotes||'',/désormais renseigné/);
 assert.match(r.rows[0].notes,/Écart sur le poste/);
 assert.doesNotMatch(r.rows[0].notes,/doit être renseigné/);
});
test('La validation seule ne résout pas une réserve de NR provisoire',()=>{
 const r=calculateQuarterlyReport([doc([ev({recordedAfter:{gf:13,nr:220,nrProvisional:true},note:'Vérifier les situations avant/après ; le NR après doit être renseigné.'})])],2026,1);
 assert.match(r.rows[0].notes,/NR après provisoire/);
 assert.equal(r.rows[0].resolvedNotes,'');
});

test('RD GF constant : confirme les GF et NR du bordereau ODJ sans modifier les données',()=>{
 const odjEvent=ev({id:'odj-constant',name:'BALLIGAND TEST',agentId:'B-1',reference:'POSTE 14',job:'POSTE 14',
  recordedBefore:{gf:13,nr:230},recordedAfter:{gf:13,nr:230,nrProvisional:true},
  note:'Vérifier les situations avant/après ; le NR après doit être renseigné.',
  acknowledgedByRD:{id:'rd1'}});
 const rdEvent=ev({id:'rd-constant',name:'BALLIGAND TEST',agentId:'B-1',reference:'POSTE 14',job:'POSTE 14',
  recordedBefore:{gf:13},recordedAfter:{gf:13,nr:230,nrProvisional:true},note:'GF constant'});
 const original=JSON.stringify([odjEvent,rdEvent]);
 const r=calculateQuarterlyReport([
  doc([odjEvent],{id:'odj1',status:'review',automaticallyValidated:true}),
  doc([rdEvent],{id:'rd1',documentType:'rd'})
 ],2026,1);
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].gfBefore,'13');
 assert.equal(r.rows[0].gfAfter,'13');
 assert.equal(r.rows[0].nrBefore,'230');
 assert.equal(r.rows[0].nrAfter,'230');
 assert.doesNotMatch(r.rows[0].notes,/provisoire|divergence/i);
 assert.equal(JSON.stringify([odjEvent,rdEvent]),original);
});
test('GF constant sans ODJ confirmé conserve les réserves',()=>{
 const r=calculateQuarterlyReport([doc([ev({note:'GF constant',recordedAfter:{gf:13,nr:220,nrProvisional:true}})],{
  id:'rd-alone',documentType:'rd'
 })],2026,1);
 assert.match(r.rows[0].notes,/NR après provisoire/);
});
test('Un autre poste ne doit jamais être confirmé par erreur',()=>{
 const odjEvent=ev({id:'odj',reference:'POSTE A',job:'POSTE A',acknowledgedByRD:{id:'rd1'}});
 const rdEvent=ev({id:'rd',reference:'POSTE B',job:'POSTE B',note:'GF constant',recordedAfter:{gf:13,nr:220,nrProvisional:true}});
 const r=calculateQuarterlyReport([
  doc([odjEvent],{status:'review',automaticallyValidated:true}),
  doc([rdEvent],{id:'rd1',documentType:'rd'})
 ],2026,1);
 assert.match(r.rows[0].notes,/NR après provisoire/);
});

test('Une divergence réelle entre ODJ et RD reste signalée malgré GF constant',()=>{
 const odjEvent=ev({reference:'POSTE 1',recordedBefore:{gf:13,nr:230},recordedAfter:{gf:13,nr:230},acknowledgedByRD:{id:'rd1'}});
 const rdEvent=ev({reference:'POSTE 1',recordedBefore:{gf:13,nr:235},recordedAfter:{gf:13,nr:235},note:'GF constant'});
 const r=calculateQuarterlyReport([
  doc([odjEvent],{status:'review',automaticallyValidated:true}),
  doc([rdEvent],{id:'rd1',documentType:'rd'})
 ],2026,1);
 assert.equal(r.rows.length,1);
 assert.match(r.rows[0].notes,/Divergence NR avant/);
});

test('Balligand: ODJ candidature sans effet, RD gfDelta 0 et note NR ancienne',()=>{
 const odjEvent=ev({id:'p4c0',name:'BALLIGAND REMI',agentId:'E42175',reference:'26-06801.01',job:'APPUI DE SERVICE',effective:'',
  candidacy:true,gfBefore:13,gfAfter:undefined,nrBefore:205,nrAfter:undefined,
  recordedBefore:{gf:13,nr:205},recordedAfter:{gf:13,nr:205,nrProvisional:true},
  note:'Candidature de l’ODJ : en attente de confirmation par un RD.'});
 const rdEvent=ev({id:'p4r0',name:'BALLIGAND REMI',agentId:'E42175',reference:'26-06801.01',job:'APPUI DE SERVICE',
  effective:'2026-05-01',gfDelta:0,gfBefore:undefined,gfAfter:undefined,nrBefore:undefined,nrAfter:undefined,
  recordedBefore:{gf:13,nr:205},recordedAfter:{gf:13,nr:205,nrProvisional:true},
  note:'Vérifier les situations avant/après ; le NR après doit être renseigné.'});
 const originals=JSON.stringify([odjEvent,rdEvent]);
 const r=calculateQuarterlyReport([
  doc([odjEvent],{id:'odj1',date:'2026-05-07'}),
  doc([rdEvent],{id:'rd1',date:'2026-05-07',documentType:'rd'})
 ],2026,2);
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].gfBefore,'13');
 assert.equal(r.rows[0].gfAfter,'13');
 assert.equal(r.rows[0].nrBefore,'205');
 assert.equal(r.rows[0].nrAfter,'205');
 assert.equal(r.rows[0].notes,'');
 assert.equal(JSON.stringify([odjEvent,rdEvent]),originals);
});

test('Admissions au stage : compléter le GF avant depuis le GF après sans modifier le document',()=>{
 const event=ev({kind:'admission',gfBefore:undefined,gfAfter:13,recordedBefore:undefined,recordedAfter:{gf:13,nr:205}});
 const original=JSON.stringify(event);
 const r=calculateQuarterlyReport([doc([event])],2026,1);
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].gfBefore,'13');
 assert.equal(r.rows[0].gfAfter,'13');
 assert.equal(r.rows[0].notes,'');
 assert.equal(JSON.stringify(event),original);
});
test('Titularisations : compléter le GF après depuis le GF avant sans modifier le document',()=>{
 const event=ev({kind:'titularisation',gfBefore:undefined,gfAfter:undefined,recordedBefore:{gf:12,nr:185},recordedAfter:undefined});
 const original=JSON.stringify(event);
 const r=calculateQuarterlyReport([doc([event],{documentType:'rd'})],2026,1);
 assert.equal(r.rows[0].gfBefore,'12');
 assert.equal(r.rows[0].gfAfter,'12');
 assert.equal(r.rows[0].notes,'');
 assert.equal(JSON.stringify(event),original);
});
test('GF contradictoire pour une admission ou titularisation : conserver les valeurs et signaler',()=>{
 for(const kind of ['admission','titularisation']){
  const r=calculateQuarterlyReport([doc([ev({kind,gfBefore:12,gfAfter:13,recordedBefore:undefined,recordedAfter:undefined})])],2026,1);
  assert.equal(r.rows[0].gfBefore,'12');
  assert.equal(r.rows[0].gfAfter,'13');
  assert.match(r.rows[0].notes,/Incohérence GF/);
 }
});
test('Aucun GF source : ne pas inventer de GF pour l admission au stage ou la titularisation',()=>{
 for(const kind of ['admission','titularisation']){
  const r=calculateQuarterlyReport([doc([ev({kind,gfBefore:undefined,gfAfter:undefined,recordedBefore:undefined,recordedAfter:undefined})])],2026,1);
  assert.equal(r.rows[0].gfBefore,'—');
  assert.equal(r.rows[0].gfAfter,'—');
  assert.match(r.rows[0].notes,/GF absent des documents/);
 }
});
test('La règle de GF identique ne modifie pas les autres types de mouvements',()=>{
 const r=calculateQuarterlyReport([doc([ev({kind:'reclassement',gfBefore:12,gfAfter:13,recordedBefore:undefined,recordedAfter:undefined})])],2026,1);
 assert.equal(r.rows[0].gfBefore,'12');
 assert.equal(r.rows[0].gfAfter,'13');
});

test('ODJ/RD: 1 NR en colonne avant du RD représente le NR après ODJ, pas une seconde attribution',()=>{
 const odjEvent=ev({id:'p4r0',agentId:'A81776',name:'LE COINTE THIBAULT',kind:'avancement',
  effective:'2026-01-01',nrSteps:1,gfBefore:14,nrBefore:225,nrAfter:230,
  recordedBefore:{gf:14,nr:225},recordedAfter:{gf:14,nr:230}});
 const rdEvent=ev({id:'p4r0',agentId:'A81776',name:'LE COINTE THIBAULT',kind:'avancement',
  effective:'2026-01-01',nrSteps:1,gfBefore:undefined,nrBefore:undefined,nrAfter:undefined,
  recordedBefore:{gf:14,nr:230},recordedAfter:undefined});
 const original=JSON.stringify([odjEvent,rdEvent]);
 const report=calculateQuarterlyReport([
  doc([odjEvent],{id:'odj-june',date:'2026-06-05'}),
  doc([rdEvent],{id:'rd-june',date:'2026-06-05',documentType:'rd'})
 ],2026,2);
 assert.equal(report.rows.length,1);
 assert.equal(report.rows[0].nrBefore,'225');
 assert.equal(report.rows[0].nrAfter,'230');
 assert.equal(report.rows[0].nrSteps,'1');
 assert.equal(report.rows[0].sources.length,2);
 assert.doesNotMatch(report.rows[0].notes,/Divergence NR avant/);
 assert.equal(JSON.stringify([odjEvent,rdEvent]),original);
});
test('Deux NR dans le RD, deux NR dans ODJ : ne compter que deux NR une seule fois',()=>{
 const r=calculateQuarterlyReport([
  doc([ev({id:'p4r1',kind:'avancement',effective:'2026-01-01',nrSteps:2,
   recordedBefore:{gf:17,nr:310},recordedAfter:{gf:17,nr:320}})],{date:'2026-06-05'}),
  doc([ev({id:'p4r1',kind:'avancement',effective:'2026-01-01',nrSteps:2,
   recordedBefore:{gf:17,nr:320},recordedAfter:undefined})],
   {id:'rd-2',date:'2026-06-05',documentType:'rd'})
 ],2026,2);
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].nrBefore,'310');
 assert.equal(r.rows[0].nrAfter,'320');
 assert.equal(r.rows[0].nrSteps,'2');
});
test('Deux vrais avancements distincts du même agent dans une séance restent distincts',()=>{
 const first=ev({id:'odj-first',kind:'avancement',effective:'2026-01-01',nrSteps:1,
  recordedBefore:{gf:13,nr:220},recordedAfter:{gf:13,nr:225}});
 const second=ev({id:'odj-second',kind:'avancement',effective:'2026-01-01',nrSteps:1,
  recordedBefore:{gf:13,nr:225},recordedAfter:{gf:13,nr:230}});
 const rdFirst=ev({id:'rd-first',kind:'avancement',effective:'2026-01-01',nrSteps:1,
  recordedBefore:{gf:13,nr:225},recordedAfter:undefined});
 const rdSecond=ev({id:'rd-second',kind:'avancement',effective:'2026-01-01',nrSteps:1,
  recordedBefore:{gf:13,nr:230},recordedAfter:undefined});
 const r=calculateQuarterlyReport([
  doc([first,second],{date:'2026-06-05'}),
  doc([rdFirst,rdSecond],{date:'2026-06-05',id:'rd2',documentType:'rd'})
 ],2026,2);
 assert.equal(r.rows.length,2);
 assert.deepEqual(r.rows.map(x=>[x.nrBefore,x.nrAfter]),[['220','225'],['225','230']]);
});
test('Séances différentes ou résultats incohérents ne sont pas fusionnés',()=>{
 const o=ev({kind:'avancement',nrSteps:1,effective:'2026-01-01',recordedBefore:{gf:14,nr:225},recordedAfter:{gf:14,nr:230}});
 const rd=ev({kind:'avancement',nrSteps:1,effective:'2026-01-01',recordedBefore:{gf:14,nr:235},recordedAfter:undefined});
 const report=calculateQuarterlyReport([
  doc([o],{date:'2026-06-05'}),
  doc([rd],{date:'2026-06-05',id:'rd',documentType:'rd'})
 ],2026,2);
 assert.equal(report.rows.length,2);
 const differentMeeting=calculateQuarterlyReport([
  doc([o],{date:'2026-06-05'}),
  doc([ev({...rd,recordedBefore:{gf:14,nr:230}})],{date:'2026-06-12',id:'rd',documentType:'rd'})
 ],2026,2);
 assert.equal(differentMeeting.rows.length,2);
});

test('Décision à effet différé : ne la publier que dans la première CSP de présentation',()=>{
 const movement=ev({id:'progression',kind:'avancement',agentId:'A-A',name:'AGENT A',effective:'2026-07-01',
  nrSteps:1,gfBefore:13,nrBefore:225,nrAfter:230,
  recordedBefore:{gf:13,nr:225},recordedAfter:{gf:13,nr:230}});
 const previous=doc([movement],{id:'odj-mars',date:'2026-03-05'});
 const later=doc([{...movement,id:'same-again'}],{id:'odj-juillet',date:'2026-07-15'});
 const snapshot=JSON.stringify([previous,later]);
 const t1=calculateQuarterlyReport([previous,later],2026,1);
 const t3=calculateQuarterlyReport([previous,later],2026,3);
 assert.equal(t1.rows.length,1);
 assert.equal(t1.rows[0].effective,'2026-07-01');
 assert.equal(t3.rows.length,0);
 assert.equal(t3.previouslyReported.length,1);
 assert.equal(t3.previouslyReported[0].originalMeeting,'2026-03-05');
 assert.equal(t3.sources.length,1);
 assert.equal(JSON.stringify([previous,later]),snapshot);
});
test('Deux vrais avancements à même date d’effet restent deux lignes sur deux trimestres',()=>{
 const first=ev({kind:'avancement',effective:'2026-07-01',nrSteps:1,
  nrBefore:250,nrAfter:255,recordedBefore:{gf:14,nr:250},recordedAfter:{gf:14,nr:255}});
 const next=ev({id:'next-award',kind:'avancement',effective:'2026-07-01',nrSteps:1,
  nrBefore:255,nrAfter:260,recordedBefore:{gf:14,nr:255},recordedAfter:{gf:14,nr:260}});
 const report=calculateQuarterlyReport([
  doc([first],{date:'2026-03-05'}),
  doc([next],{date:'2026-06-12',id:'odj-june'})
 ],2026,2);
 assert.equal(report.rows.length,1);
 assert.equal(report.rows[0].nrBefore,'255');
 assert.equal(report.rows[0].nrAfter,'260');
 assert.equal(report.previouslyReported.length,0);
});
test('Un ancien brouillon ou document non validé ne retire aucun mouvement du CR',()=>{
 const e=ev({kind:'avancement',effective:'2026-07-01',nrSteps:1,
  nrBefore:250,nrAfter:255,recordedBefore:{gf:14,nr:250},recordedAfter:{gf:14,nr:255}});
 const report=calculateQuarterlyReport([
  doc([e],{date:'2026-03-05',status:'review'}),
  doc([{...e,id:'validated'}],{date:'2026-07-15',id:'new'})
 ],2026,3);
 assert.equal(report.rows.length,1);
 assert.equal(report.previouslyReported.length,0);
});
test('Même agent et même effet mais deux décisions indépendantes ne sont pas confondues',()=>{
 const before=ev({kind:'avancement',effective:'2026-07-01',nrSteps:1,reference:'POSTE A',
  nrBefore:250,nrAfter:255,recordedBefore:{gf:14,nr:250},recordedAfter:{gf:14,nr:255}});
 const later=ev({id:'another',kind:'avancement',effective:'2026-07-01',nrSteps:1,reference:'POSTE B',
  nrBefore:250,nrAfter:255,recordedBefore:{gf:14,nr:250},recordedAfter:{gf:14,nr:255}});
 const r=calculateQuarterlyReport([
  doc([before],{date:'2026-03-05'}),doc([later],{id:'later',date:'2026-07-15'})
 ],2026,3);
 assert.equal(r.rows.length,1);
 assert.equal(r.previouslyReported.length,0);
});
test('Une candidature non retenue ne constitue pas un mouvement historique à masquer',()=>{
 const movement=ev({kind:'nomination',effective:'2026-07-01',gfDelta:0,reference:'POSTE A',job:'POSTE A'});
 const r=calculateQuarterlyReport([
  doc([{...movement,candidacy:true,nonRetained:true}],{date:'2026-03-05'}),
  doc([movement],{date:'2026-07-15',id:'july'})
 ],2026,3);
 assert.equal(r.rows.length,1);
});

test('La trace de contrôle des exclusions conserve les deux documents et la date d effet hors trimestre',()=>{
 const before=ev({kind:'avancement',name:'AGENT TRACE',agentId:'TRACE-1',effective:'2026-07-01',nrSteps:1,
  nrBefore:220,nrAfter:225,recordedBefore:{gf:13,nr:220},recordedAfter:{gf:13,nr:225}});
 const earlier=doc([before],{id:'first-csp',name:'ODJ-CSP Cadres 05 mars.pdf',date:'2026-03-05'});
 const later=doc([{...before,id:'second-event'}],{id:'second-csp',name:'ODJ-CSP Cadres 10 juillet.pdf',date:'2026-07-10'});
 const original=JSON.stringify([earlier,later]);
 const report=calculateQuarterlyReport([earlier,later],2026,3);
 assert.equal(report.rows.length,0);
 assert.equal(report.previouslyReported.length,1);
 const trace=report.previouslyReported[0];
 assert.equal(trace.effective,'2026-07-01');
 assert.equal(trace.meeting,'2026-07-10');
 assert.equal(trace.originalMeeting,'2026-03-05');
 assert.equal(trace.currentDocument,later.name);
 assert.equal(trace.originalDocument,earlier.name);
 assert.equal(trace.effectOutsideOriginalQuarter,true);
 assert.equal(JSON.stringify([earlier,later]),original);
});
test('La trace de doublon même trimestre ne signale pas à tort une date d effet externe',()=>{
 const before=ev({kind:'avancement',agentId:'DUP-2',effective:'2026-06-01',nrSteps:1,
  nrBefore:220,nrAfter:225,recordedBefore:{gf:13,nr:220},recordedAfter:{gf:13,nr:225}});
 const report=calculateQuarterlyReport([
  doc([before],{id:'a',date:'2026-05-04'}),
  doc([{...before,id:'b'}],{id:'b',date:'2026-06-04'})
 ],2026,2);
 assert.equal(report.previouslyReported.length,1);
 assert.equal(report.previouslyReported[0].effectOutsideOriginalQuarter,false);
});

test('Le CR affiche le motif ODJ des mesures salariales sans le confondre avec une alerte',()=>{
 const event=ev({kind:'mesure',movementReason:'NR encouragement à la mobilité',
  observations:'Observation isolée',note:'',nrSteps:1});
 const r=calculateQuarterlyReport([doc([event])],2026,1);
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].movementReason,'NR encouragement à la mobilité');
 assert.equal(r.rows[0].observations,'—');
 assert.equal(r.rows[0].notes,'');
});
test('ODJ prioritaire et exclusif : les libellés du RD ne remplacent jamais les motifs de reclassement',()=>{
 const base=ev({kind:'reclassement',gfBefore:12,gfAfter:13,nrBefore:210,nrAfter:220,gfDelta:1,
  movementReason:'Reclassement ADP',observations:'Observation de lecture'});
 const r=calculateQuarterlyReport([
  doc([base]),
  doc([{...base,movementReason:'Autre intitulé RD',observations:'Observation rectifiée du RD'}],{
   id:'rd',name:'RD-CSP Cadres du 06-03-2026.pdf',documentType:'rd'
  })
 ],2026,1);
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].movementReason,'Reclassement ADP');
 assert.equal(r.rows[0].observations,'—');
 assert.equal(r.rows[0].notes,'');
});
test('Observations ODJ seulement sur admission, titularisation, mutation et avancement',()=>{
 for(const kind of ['admission','titularisation','mutation','avancement']){
  const ev1=ev({kind,observations:'Précision dans l ODJ'});
  const r=calculateQuarterlyReport([
   doc([ev1]),
   doc([{...ev1,observations:'Texte différent RD'}],{id:'rd',documentType:'rd'})
  ],2026,1);
  assert.equal(r.rows.length,1,kind);
  assert.equal(r.rows[0].observations,'Précision dans l ODJ',kind);
  assert.equal(r.rows[0].movementReason,'—');
 }
});
test('Si seul le RD a un commentaire, le CR ne le présente pas comme une information ODJ',()=>{
 const e=ev({kind:'avancement',observations:undefined});
 const r=calculateQuarterlyReport([
  doc([e]),
  doc([{...e,observations:'Observation RD'}],{id:'rd',documentType:'rd'})
 ],2026,1);
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].observations,'—');
});

test('Un RD validé peut afficher le commentaire documentaire de l ODJ restant en vérification',()=>{
 const common={kind:'mutation' as const,name:'AGENT MUTATION',agentId:'AA-001',
  effective:'2026-01-01',gfBefore:17,gfAfter:17,nrBefore:310,nrAfter:310,
  recordedBefore:{gf:17,nr:310},recordedAfter:{gf:17,nr:310}};
 const odj=doc([ev({...common,observations:'Observations de la ligne ODJ',approved:undefined})],
  {id:'odj-review',status:'review',date:'2026-04-10',name:'ODJ-CSP Cadres du 10-04-2026.pdf'});
 const rd=doc([ev({...common,observations:undefined})],
  {id:'rd-valide',status:'validated',documentType:'rd',date:'2026-04-10',name:'RD-CSP Cadres du 10-04-2026.pdf'});
 const before=JSON.stringify([odj,rd]);
 const report=calculateQuarterlyReport([odj,rd],2026,2);
 assert.equal(report.rows.length,1,'ODJ review ne crée pas une deuxième décision');
 assert.deepEqual(report.rows[0].sources,['D02'],'seul le RD validé est retenu comme décision');
 assert.equal(report.rows[0].observations,'Observations de la ligne ODJ');
 assert.equal(report.rows[0].gfBefore,'17');
 assert.equal(report.rows[0].nrAfter,'310');
 assert.equal(odj.status,'review');
 assert.equal(JSON.stringify([odj,rd]),before,'lecture documentaire sans modification des CSP');
});
test('Un ODJ en vérification ambigu ou incompatible ne complète jamais le RD',()=>{
 const base={kind:'mutation' as const,name:'AGENT MUTATION',agentId:'AA-001',
  effective:'2026-01-01',gfBefore:17,gfAfter:17,nrBefore:310,nrAfter:310};
 const rd=doc([ev(base)],{id:'rd-valide',status:'validated',documentType:'rd',date:'2026-04-10'});
 const odj=doc([ev({...base,observations:'Observation A',approved:undefined})],
  {id:'odj-review',status:'review',date:'2026-04-10'});
 const another=doc([ev({...base,observations:'Observation B',approved:undefined})],
  {id:'odj-second',status:'review',date:'2026-04-10'});
 const ambiguous=calculateQuarterlyReport([rd,odj,another],2026,2);
 assert.equal(ambiguous.rows.length,1);
 assert.equal(ambiguous.rows[0].observations,'—');
 const otherNR=doc([ev({...base,nrBefore:315,nrAfter:315,observations:'Observation fausse',approved:undefined})],
  {id:'odj-conflict',status:'review',date:'2026-04-10'});
 const conflict=calculateQuarterlyReport([rd,otherNR],2026,2);
 assert.equal(conflict.rows.length,1);
 assert.equal(conflict.rows[0].observations,'—');
});

test('ODJ avril : deux décisions RD validées confirment l ODJ dans le CR malgré statut technique review',()=>{
 const mutation={name:'AGENT S',agentId:'H-001',kind:'mutation',effective:'2026-01-01',
  gfBefore:17,gfAfter:17,nrBefore:310,nrAfter:310,
  agency:'AMT VDR',job:'DELEGUE TECHNIQUE'};
 const titularisation={name:'AGENT P',agentId:'J-002',kind:'titularisation',effective:'2024-12-16',
  recordedBefore:undefined,recordedAfter:undefined};
 const odj=doc([ev({...titularisation,id:'p1r0',approved:undefined}),
   ev({...mutation,id:'p2r0',approved:undefined,observations:'Commentaire imprimé dans l ODJ'})],
  {id:'odj-avril',name:'ODJ-CSP Cadres du 10-04-2026.pdf',date:'2026-04-10',
   status:'review',perEventValidation:false,automaticallyValidated:false,unreadPages:0});
 const rd=doc([
  ev({...titularisation,id:'rd1',recordedBefore:{gf:12,nr:170}}),
  ev({...mutation,id:'rd2',gfBefore:undefined,gfAfter:undefined,nrBefore:undefined,nrAfter:undefined,
   recordedBefore:{gf:17,nr:310},recordedAfter:{gf:17,nr:310}})
 ],{id:'rd-avril',name:'RD-CSP Cadres du 10-04-2026.pdf',date:'2026-04-10',
   documentType:'rd',perEventValidation:true,status:'validated'});
 const snapshot=JSON.stringify([odj,rd]);
 const report=calculateQuarterlyReport([odj,rd],2026,2);
 assert.equal(report.sources[0].status,'review','le statut informatique reste intact');
 assert.equal(report.sources[0].automaticallyValidated,false);
 assert.equal(report.sources[0].confirmedByRDForReport,true,'confirmation documentaire uniquement');
 assert.equal(report.pendingDocuments,0);
 assert.equal(report.rows.length,2,'une ligne par décision confirmée');
 assert.deepEqual(report.rows.flatMap(row=>row.sources),['D02','D02']);
 assert.equal(report.rows.find(row=>row.kind==='mutation')?.observations,'Commentaire imprimé dans l ODJ');
 assert.doesNotMatch(report.alerts.join(' '),/encore en vérification/);
 assert.equal(JSON.stringify([odj,rd]),snapshot,'aucune décision ou validation modifiée');
});
test('Une décision RD absente ou plusieurs RDs concurrents ne valident jamais le statut documentaire du CR',()=>{
 const a=ev({name:'AGENT A',agentId:'AAA',kind:'mutation',effective:'2026-04-01',
  gfBefore:17,gfAfter:17,nrBefore:310,nrAfter:310});
 const odj=doc([a],{id:'odj',date:'2026-04-10',status:'review',automaticallyValidated:false});
 const valid=doc([{...a,id:'rd'}],{id:'rd1',date:'2026-04-10',documentType:'rd'});
 const none=calculateQuarterlyReport([odj],2026,2);
 assert.equal(none.sources[0].confirmedByRDForReport,false);
 assert.equal(none.pendingDocuments,1);
 const doubled=calculateQuarterlyReport([odj,valid,{...valid,id:'rd2'}],2026,2);
 assert.equal(doubled.sources[0].confirmedByRDForReport,false);
 assert.equal(doubled.pendingDocuments,1);
 const otherDate=calculateQuarterlyReport([odj,{...valid,date:'2026-04-15'}],2026,2);
 assert.equal(otherDate.sources[0].confirmedByRDForReport,false);
 assert.equal(otherDate.pendingDocuments,1);
 const conflict=calculateQuarterlyReport([odj,
  {...valid,events:[{...a,id:'rd',gfBefore:18,gfAfter:18,recordedBefore:{gf:18,nr:310},recordedAfter:{gf:18,nr:310}}]}],2026,2);
 assert.equal(conflict.sources[0].confirmedByRDForReport,false);
 assert.equal(conflict.pendingDocuments,1);
});

test('Nomination aux postes vacants : reprend uniquement le texte imprimé dans le RD',()=>{
 const nomination=ev({kind:'nomination',aptitude:'Mention ODJ non probante',
  reference:'26-12345.01',job:'POSTE VACANT'});
 const rd={...nomination,aptitude:"Candidature retenue - GF constant - Date d'effet 01/09/2026",id:'rd-movement'};
 const odj=doc([nomination],{id:'odj',documentType:'cr'});
 const decision=doc([rd],{id:'rd',documentType:'rd'});
 const before=JSON.stringify([odj,decision]);
 const report=calculateQuarterlyReport([odj,decision],2026,1);
 assert.equal(report.rows.length,1);
 assert.equal(report.rows[0].kind,'nomination');
 assert.equal(report.rows[0].aptitude,'Candidature retenue - GF constant');
 assert.equal(rd.aptitude,"Candidature retenue - GF constant - Date d'effet 01/09/2026",'le RD source reste intact');
 assert.equal(report.rows[0].gfBefore,'12');
 assert.equal(report.rows[0].nrAfter,'220');
 assert.equal(JSON.stringify([odj,decision]),before);
});
test('Sans Aptitude récupérée, aucune valeur ne doit être inventée à partir de la note du RD',()=>{
 const nomination=ev({kind:'nomination',note:'GF constant',aptitude:undefined});
 const r=calculateQuarterlyReport([
  doc([nomination],{id:'rd-only',documentType:'rd',status:'validated'})
 ],2026,1);
 assert.equal(r.rows[0].aptitude,'—');
 assert.equal(r.rows.length,1);
});

test('Observations vides : le 1/1 du PDF ne doit jamais apparaître dans le CR',async()=>{
 const {getMovementColumns}=await import('../src/lib/csp-quarterly-columns.ts');
 const event=ev({kind:'titularisation',observations:'1/1',note:''});
 const input=doc([event],{id:'odj',documentType:'cr'});
 const original=JSON.stringify(input);
 const result=calculateQuarterlyReport([input],2026,1);
 assert.equal(result.rows.length,1);
 const column=getMovementColumns([], 'titularisation').find(c=>c.id==='observations');
 assert.ok(column);
 assert.equal(column.value(result.rows[0]),'','la cellule affichée doit être vide');
 assert.equal(JSON.stringify(input),original,'pas de modification du document CSP validé');
});
test('Observation ODJ réelle dans le même tableau : conserver ses mots',async()=>{
 const {getMovementColumns}=await import('../src/lib/csp-quarterly-columns.ts');
 const event=ev({kind:'mutation',observations:'Prise de poste le 01/06/2026',note:''});
 const report=calculateQuarterlyReport([doc([event])],2026,1);
 const text=getMovementColumns([], 'mutation').find(c=>c.id==='observations')?.value(report.rows[0]);
 assert.equal(text,'Prise de poste le 01/06/2026');
});
