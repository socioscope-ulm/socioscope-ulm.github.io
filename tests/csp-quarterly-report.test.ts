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
