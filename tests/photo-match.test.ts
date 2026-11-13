import test from 'node:test';
import assert from 'node:assert/strict';
import {matchPhotoName,nearbyPhotoName,portraitImageBoxes,matchPptxPortraits} from '../src/lib/photo-match.ts';
const agents=[{id:'fiction-1',name:'Éloïse MARTIN-DUPRÉ'},{id:'fiction-2',name:'Nolan Exemple'},{id:'fiction-3',name:'Nolan Exemple'}];
test('nom complet accentué, prénom inversé et tirets',()=>{assert.equal(matchPhotoName('MARTIN DUPRE ELOISE',agents)[0]?.id,'fiction-1');});
test('homonymes et nom partiel restent à rattacher',()=>{assert.equal(matchPhotoName('Nolan Exemple',agents).length,2);assert.equal(matchPhotoName('MARTIN',agents).length,0);assert.equal(matchPhotoName('Eloise Martin Dupre Administratrice',agents).length,0);});
test('une légende isolée sous une photo est admissible',()=>{const p={x:100,y:100,w:100,h:130};assert.deepEqual(nearbyPhotoName(p,[p],[{x:100,y:235,w:100,h:15,text:'Eloise Martin Dupre'}]),{name:'Eloise Martin Dupre',certain:true});});
test('une légende partagée ou deux légendes voisines restent ambiguës',()=>{const p={x:100,y:100,w:100,h:130},q={x:170,y:100,w:100,h:130};assert.equal(nearbyPhotoName(p,[p,q],[{x:140,y:235,w:100,h:15,text:'Nolan Exemple'}]).certain,false);assert.equal(nearbyPhotoName(p,[p],[{x:100,y:230,w:100,h:15,text:'Nolan Exemple'},{x:100,y:245,w:100,h:15,text:'Autre Exemple'}]).certain,false);});

test('une carte avec le portrait a gauche et le nom a droite est reconnue',()=>{
 const portrait={x:30,y:100,w:45,h:95};
 const label={x:85,y:112,w:120,h:16,text:'Eloise Martin Dupre'};
 assert.deepEqual(nearbyPhotoName(portrait,[portrait],[label],agents),{name:'Éloïse MARTIN-DUPRÉ',certain:true});
});
test('une legende de fonction ou une mention de contact ne devient pas un agent',()=>{
 const portrait={x:30,y:100,w:45,h:95};
 assert.equal(nearbyPhotoName(portrait,[portrait],[{x:85,y:112,w:100,h:14,text:'Directrice Adjointe'}]).name,'');
 assert.equal(nearbyPhotoName(portrait,[portrait],[{x:85,y:112,w:100,h:14,text:'eloise.martin@exemple.fr'}]).name,'');
});
test('les fonds de pages et les grandes images decoratives sont ecartes',()=>{
 const background={x:0,y:0,w:800,h:600},decor={x:20,y:20,w:500,h:300},portrait={x:85,y:105,w:45,h:90};
 assert.deepEqual(portraitImageBoxes([background,decor,portrait,portrait],800,600),[portrait]);
});
test('un portrait partage par deux noms exige une verification',()=>{
 const portrait={x:30,y:100,w:45,h:95};
 const labels=[{x:85,y:112,w:120,h:16,text:'Eloise Martin Dupre'},{x:85,y:115,w:120,h:16,text:'Nolan Exemple'}];
 assert.equal(nearbyPhotoName(portrait,[portrait],labels,agents).certain,false);
});


test('PowerPoint : les roles de fonction ne sont pas confondus avec les noms',()=>{
 assert.equal(matchPhotoName('MPL 1 Eloise Martin Dupre',agents)[0]?.id,'fiction-1');
});
test('PowerPoint : plusieurs photos sur une meme ligne sont associees a leur legende respective',()=>{
 const portraits=[{x:100,y:100,w:80,h:100},{x:300,y:100,w:80,h:100}];
 const captions=[{x:95,y:205,w:90,h:22,text:'Eloise Martin Dupre'},{x:295,y:205,w:90,h:22,text:'Nolan Exemple'}];
 const result=matchPptxPortraits(portraits,captions,agents);
 assert.deepEqual(result.map(x=>x.name),['Éloïse MARTIN-DUPRÉ','Nolan Exemple']);
 assert.equal(result[0].certain,true);
 assert.equal(result[1].certain,false);
});
test('PowerPoint : image et nom superposes avec legende laterale',()=>{
 const portrait={x:100,y:100,w:80,h:100};
 const label={x:183,y:120,w:120,h:20,text:'Éloïse MARTIN-DUPRÉ'};
 assert.equal(matchPptxPortraits([portrait],[label],agents)[0].name,'Éloïse MARTIN-DUPRÉ');
});
