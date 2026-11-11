import test from 'node:test';
import assert from 'node:assert/strict';
import {matchPhotoName,nearbyPhotoName} from '../src/lib/photo-match.ts';
const agents=[{id:'fiction-1',name:'Éloïse MARTIN-DUPRÉ'},{id:'fiction-2',name:'Nolan Exemple'},{id:'fiction-3',name:'Nolan Exemple'}];
test('nom complet accentué, prénom inversé et tirets',()=>{assert.equal(matchPhotoName('MARTIN DUPRE ELOISE',agents)[0]?.id,'fiction-1');});
test('homonymes et nom partiel restent à rattacher',()=>{assert.equal(matchPhotoName('Nolan Exemple',agents).length,2);assert.equal(matchPhotoName('MARTIN',agents).length,0);assert.equal(matchPhotoName('Eloise Martin Dupre Administratrice',agents).length,0);});
test('une légende isolée sous une photo est admissible',()=>{const p={x:100,y:100,w:100,h:130};assert.deepEqual(nearbyPhotoName(p,[p],[{x:100,y:235,w:100,h:15,text:'Eloise Martin Dupre'}]),{name:'Eloise Martin Dupre',certain:true});});
test('une légende partagée ou deux légendes voisines restent ambiguës',()=>{const p={x:100,y:100,w:100,h:130},q={x:170,y:100,w:100,h:130};assert.equal(nearbyPhotoName(p,[p,q],[{x:140,y:235,w:100,h:15,text:'Nolan Exemple'}]).certain,false);assert.equal(nearbyPhotoName(p,[p],[{x:100,y:230,w:100,h:15,text:'Nolan Exemple'},{x:100,y:245,w:100,h:15,text:'Autre Exemple'}]).certain,false);});
