import test from 'node:test';
import assert from 'node:assert/strict';
import {ANNUAL_BONUS_GFS,bonusApplicable,validateAnnualBonusDetails,legacyBonusSplit,annualBonusLabel} from '../src/lib/bonus-tables.ts';
function reference(){
 return {paymentYear:2025,objectiveYear:2024,rows:Object.fromEntries(ANNUAL_BONUS_GFS.map(gf=>[gf,{rpc:gf>=12?gf*100:null,rpem:gf<=11?gf*100:null,pvpa:gf>=12?gf*20:null}]))};
}
test('GF 12: RPC et PVPA seulement',()=>{assert.equal(bonusApplicable(12,'rpc'),true);assert.equal(bonusApplicable(12,'pvpa'),true);assert.equal(bonusApplicable(12,'rpem'),false);});
test('GF 2 a 11: RPEM seulement',()=>{assert.equal(bonusApplicable(11,'rpem'),true);assert.equal(bonusApplicable(11,'rpc'),false);assert.equal(bonusApplicable(11,'pvpa'),false);});
test('un zero publie reste un zero, different de non applicable',()=>{const r=reference();r.rows['2'].rpem=0;assert.equal(validateAnnualBonusDetails(r),true);assert.equal(r.rows['2'].rpem,0);assert.equal(r.rows['2'].rpc,null);});
test('les valeurs non applicables sont rejetees',()=>{const r=reference();r.rows['12'].rpem=1;assert.equal(validateAnnualBonusDetails(r),false);});
test('annees de versement et objectifs sont distinctes',()=>{assert.equal(annualBonusLabel(2025,2024),'Primes versées en 2025 · objectifs 2024');const r=reference();r.objectiveYear=2026;assert.equal(validateAnnualBonusDetails(r),false);});
test('une reference historique n est pas modifiee',()=>{const original={'11':123400,'12':345600};const before=JSON.stringify(original);assert.deepEqual(legacyBonusSplit(original,11),{rpc:null,rpem:123400});assert.deepEqual(legacyBonusSplit(original,12),{rpc:345600,rpem:null});assert.equal(JSON.stringify(original),before);});
