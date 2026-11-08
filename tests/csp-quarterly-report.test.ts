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
test('T1 - identifie les documents en attente, conserve les mouvements validés',()=>{
 const r=calculateQuarterlyReport([
  doc([ev()],{id:'odj-review',status:'review'}),
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
test('ODJ partiel, page non lue ou preuve retirée : conserver l’alerte du serveur',()=>{
 for(const automaticallyValidated of [false,undefined]){
  const r=calculateQuarterlyReport([
   doc([ev()],{status:'review',automaticallyValidated}),
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
