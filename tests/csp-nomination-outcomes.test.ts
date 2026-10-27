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
  {...rd,detail:{...rd.detail,events:[winner,{...winner,id:'contradiction',gfDelta:2}]}}
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

test('two nominees for the same post both remain retained and only other candidates are automatically treated',()=>{
 const second={...winner,id:'second-rd',name:internal.name,agentId:internal.agentId};
 const double={...rd,detail:{...rd.detail,events:[winner,second]}};
 const result=resolve(double);
 assert.equal(cspNonRetained(result.detail.events[0]),false);
 assert.equal(cspNonRetained(result.detail.events[2]),false);
 assert.equal(cspNonRetained(result.detail.events[1]),true);
 assert.equal(cspProgress('review',result.detail).pending,2);
 assert.deepEqual(activeCspEvents(result.detail),[]);
 assert.deepEqual(resolve({...double,detail:{...double.detail,events:[second,winner]}}).detail.events.map(cspNonRetained),result.detail.events.map(cspNonRetained));
 assert.equal(resolve({...double,status:'disabled:validated'},result).detail.events.some(cspNonRetained),false);
 // Identical nominee lists repeated in another RD are corroborating evidence.
 const repeated={...double,id:'csp-repeat',detail:{...double.detail,events:[second,winner]}};
 assert.equal(cspNonRetained(resolveNominationOutcomes([cr,double,repeated])[0].detail.events[1]),true);
 // A lone, conflicting RD list is still ambiguous rather than a third nominee.
 assert.equal(resolveNominationOutcomes([cr,double,{...rd,id:'csp-conflict'}])[0].detail.events.some(cspNonRetained),false);
});
test('both retained candidates become ready through their own RD line and each movement is applied once',async()=>{
 const {projectCsp,CSP_SOURCE}=await import('../src/lib/csp.ts');
 const records=[candidate,internal].map((c,i)=>({id:'row-'+i,source:'annual',row:i+1,name:c.name,agentId:c.agentId!,nni:c.agentId!,gf:8,nr:120,agency:'ORIGINE FICTIVE',job:'EMPLOI FICTIF'}));
 const data={sources:[{id:'annual',date:'2025-12-31',primary:true}],records,events:[],issues:[],updated:''} as any;
 const decisions=[winner,{...winner,id:'second-rd',name:internal.name,agentId:internal.agentId,gfDelta:2}].map(e=>({...e,agency:'DESTINATION FICTIVE',job:'EMPLOI FICTIF'}));
 const documents=[{id:rd.id,name:rd.name,date:rd.date,status:'validated',documentType:'rd' as const,events:decisions},{id:cr.id,name:cr.name,date:cr.date,status:'review',documentType:'cr' as const,events:cr.detail.events}];
 const preview=prepareCspDocuments(data,cr.detail.events,[documents[0]],cr.date,documents,{id:cr.id,name:cr.name,documentType:'cr'});
 assert.equal(preview[0].state,'ready');assert.equal(preview[2].state,'ready');assert.equal(preview[1].state,'not-retained');
 assert.equal(preview[0].after?.gf,9);assert.equal(preview[2].after?.gf,10);assert.equal(preview[0].after?.nr,130);assert.equal(preview[2].after?.nr,130);
 const projection=projectCsp(data,[documents[0],{...documents[1],status:'validated',events:preview}],'2026-10-26');
 assert.deepEqual(projection.issues,[]);
 const applied=projection.data.records.filter(r=>r.source===CSP_SOURCE);assert.equal(applied.length,2);assert.ok(applied.every(r=>r.nr===130));
});

test('a fully validated RD closes a vacant post, even with one candidate and no NNI; reopening restores pending',()=>{
 const vacant={...cr,detail:{...cr.detail,events:[unknown]}};
 const unrelated={...winner,id:'other-post',reference:'AUTRE-POSTE',approved:true};
 const final={...rd,status:'validated',detail:{...rd.detail,events:[unrelated]}};
 const result=resolve(final,vacant);const e=result.detail.events[0];
 assert.equal(cspNonRetained(e),true);assert.equal(e.nonRetainedByRD?.reason,'unfilled-post');assert.equal(e.nonRetainedByRD?.eventId,undefined);assert.equal(e.nonRetainedByRD?.page,undefined);assert.equal(e.approved,undefined);
 assert.equal(cspProgress('review',result.detail).pending,0);assert.deepEqual(activeCspEvents(result.detail),[]);
 assert.deepEqual(resolveNominationOutcomes([final,vacant])[1],result);
 for(const source of [{...final,status:'review'},{...final,status:'disabled:validated'},{...final,date:'2026-05-01'},{...final,detail:{...final.detail,events:[{...unrelated,approved:false}]}},{...final,detail:{...final.detail,events:[]}}])assert.equal(resolve(source,result).detail.events.some(cspNonRetained),false);
 const legacy={...final,detail:{documentType:'rd',events:[{...unrelated,approved:undefined}]}};
 assert.equal(resolveNominationOutcomes([vacant,legacy])[0].detail.events[0].nonRetainedByRD?.reason,'unfilled-post');
 const data={sources:[{id:'annual',date:'2025-12-31',primary:true}],records:[],events:[],issues:[],updated:''} as any;
 const documents=[{...final,documentType:'rd' as const,events:final.detail.events}];
 for(const current of [undefined,{id:vacant.id,name:vacant.name,documentType:'cr' as const}]){
  const preview=prepareCspDocuments(data,vacant.detail.events,[],vacant.date,documents,current);
  assert.equal(preview[0].state,'not-retained');assert.equal(preview[0].after,undefined);assert.match(preview[0].problem,/poste non pourvu/);
  assert.equal(prepareCspDocuments(data,vacant.detail.events,[],vacant.date,[{...documents[0],events:[{...unrelated,approved:false}]}],current)[0].state,'blocked');
 }
});
test('vacant-post inference waits for all active RDs and preserves uncertain or nominated posts',()=>{
 const vacant={...cr,detail:{...cr.detail,events:[unknown,internal]}};
 const final={...rd,status:'validated',detail:{...rd.detail,events:[{...winner,reference:'AUTRE-POSTE',approved:true}]}};
 assert.ok(resolve(final,vacant).detail.events.every(cspNonRetained));
 for(const patch of [{reference:undefined},{extractionIssue:'Lecture incertaine'},{effective:''},{reference:unknown.reference,selected:false}])assert.equal(resolve({...final,detail:{...final.detail,events:[{...final.detail.events[0],...patch}]}},vacant).detail.events.some(cspNonRetained),false);
 assert.equal(resolveNominationOutcomes([vacant,final,{...rd,id:'pending-rd',detail:{...rd.detail,events:[{...winner,reference:'TROISIEME-POSTE'}]}}])[0].detail.events.some(cspNonRetained),false);
 const reopened={...vacant,detail:{...vacant.detail,events:[{...unknown,reference:undefined},{...internal,extractionIssue:'Vérifier la lecture'}]}};
 assert.equal(resolve(final,reopened).detail.events.some(cspNonRetained),false);
 // A nominated post follows the existing nominee matching rules; a conflicting
 // identity must not fall back to an absence-based rejection.
 const nominated={...final,detail:{...final.detail,events:[{...winner,approved:true,agentId:'Z99999'}]}};
 assert.equal(resolve(nominated).detail.events.some(cspNonRetained),false);
});
