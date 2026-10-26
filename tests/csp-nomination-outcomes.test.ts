import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveNominationOutcomes} from '../src/lib/csp-nomination-outcomes.ts';
import {prepareCspDocuments} from '../src/lib/csp-candidates.ts';
import {cspNonRetained} from '../src/lib/csp.ts';
import {cspProgress,preserveApproved,activeCspEvents} from '../src/lib/csp-validation.ts';
import type {CspEvent} from '../src/lib/csp.ts';
const candidate:CspEvent={id:'winner-cr',name:'EXEMPLE ALICE',agentId:'Z00001',kind:'nomination',candidacy:true,effective:'',page:1,reference:'POSTE-FICTIF',selected:true};
const unknown={...candidate,id:'unknown-cr',name:'EXEMPLE BOB',agentId:undefined};
const internal={...candidate,id:'internal-cr',name:'EXEMPLE CHARLIE',agentId:'Z00002'};
const winner={...candidate,id:'winner-rd',candidacy:false,effective:'2026-04-01',gfDelta:1};
const cr={id:'csp-cr',name:'CR fictif',date:'2026-03-24',status:'review',detail:{documentType:'cr',perEventValidation:true,events:[candidate,unknown,internal]}};
const rd={id:'csp-rd',name:'RD fictif',date:cr.date,status:'review',detail:{documentType:'rd',perEventValidation:true,events:[winner]}};
const resolve=(source=rd,target=cr)=>resolveNominationOutcomes([target,source])[0];
test('an active RD automatically treats the other CR candidates, including unknown identities, without approval or career movements',()=>{
 const original=structuredClone([cr,rd]);const result=resolve();
 assert.equal(result.detail.events[0].nonRetainedByRD,undefined);
 for(const e of result.detail.events.slice(1)){assert.equal(cspNonRetained(e),true);assert.equal(e.nonRetainedByRD?.id,rd.id);assert.equal(e.approved,undefined);assert.equal(e.nonRetained,undefined);}
 assert.equal(cspProgress('review',result.detail).pending,1);
 assert.equal(cspProgress('review',result.detail).approved,0);
 assert.deepEqual(activeCspEvents(result.detail),[]);
 assert.deepEqual([cr,rd],original);
 assert.deepEqual(resolveNominationOutcomes([result,rd])[0],result);
 // Arrival order and CR/RD timestamps have no bearing on the classification.
 assert.deepEqual(resolveNominationOutcomes([rd,cr])[1],result);
});
test('no matching post, winner, meeting or clear selection means no inferred rejection',()=>{
 for(const source of [
  {...rd,status:'disabled:validated'}, {...rd,date:'2026-05-01'},
  {...rd,detail:{...rd.detail,events:[{...winner,selected:false}]}},
  {...rd,detail:{...rd.detail,events:[{...winner,reference:'AUTRE-POSTE'}]}},
  {...rd,detail:{...rd.detail,events:[{...winner,name:'EXEMPLE ABSENT'}]}},
  {...rd,detail:{...rd.detail,events:[{...winner,agentId:'Z99999'}]}},
  {...rd,detail:{...rd.detail,events:[{...winner,extractionIssue:'Lecture incertaine'}]}},
  {...rd,detail:{...rd.detail,events:[{...winner,effective:''}]}},
  {...rd,detail:{...rd.detail,events:[winner,{...winner,id:'contradiction',name:unknown.name,agentId:undefined}]}}
 ])assert.equal(resolve(source).detail.events.some(cspNonRetained),false);
 const conflict={...rd,id:'csp-other',detail:{...rd.detail,events:[{...winner,name:internal.name,agentId:internal.agentId}]}};
 assert.equal(resolveNominationOutcomes([cr,rd,conflict])[0].detail.events.some(cspNonRetained),false);
 const homonym={...unknown,name:winner.name};assert.equal(resolve(rd,{...cr,detail:{...cr.detail,events:[candidate,homonym]}}).detail.events[1].nonRetainedByRD,undefined);
});
test('disabling or changing the RD clears even a previously persisted automatic disposition; manual closures survive',()=>{
 const result=resolve();assert.equal(resolve({...rd,status:'disabled:validated'},result).detail.events.some(cspNonRetained),false);
 const changed={...rd,detail:{...rd.detail,events:[{...winner,name:internal.name,agentId:internal.agentId}]}};
 const revised=resolve(changed,result);assert.equal(cspNonRetained(revised.detail.events[2]),false);assert.equal(cspNonRetained(revised.detail.events[0]),true);
 const manual={...cr,detail:{...cr.detail,events:[candidate,{...unknown,nonRetained:true}]}};assert.equal(cspNonRetained(resolve({...rd,status:'disabled:validated'},manual).detail.events[1]),true);
 const forged={...unknown,nonRetainedByRD:{id:'fake',eventId:'fake',name:'fake',page:1,documentType:'rd' as const}};
 assert.equal(preserveApproved([forged],[],false)[0].nonRetainedByRD,undefined);
});
test('preview places an unknown non-winner in treated without requiring a NNI or a salary reference',()=>{
 const data={sources:[{id:'annual',date:'2025-12-31',primary:true}],records:[],events:[],issues:[],updated:''} as any;
 const documents=[cr,rd].map(d=>({...d,documentType:d.detail.documentType as 'cr'|'rd',events:d.detail.events}));
 const preview=prepareCspDocuments(data,cr.detail.events,[],cr.date,documents,{id:cr.id,name:cr.name,documentType:'cr'});
 assert.equal(preview[1].state,'not-retained');assert.equal(preview[1].agentId,undefined);assert.equal(preview[1].after,undefined);assert.equal(preview[1].approved,undefined);
 assert.match(preview[1].problem,/automatiquement/);
});
