import test from 'node:test';
import assert from 'node:assert/strict';
import {preserveApproved} from '../src/lib/csp-validation.ts';
import {cspResolvedEvent} from '../src/lib/csp.ts';
import type {CspEvent,CspPreview} from '../src/lib/csp.ts';

const saved:CspEvent={id:'event',name:'FICTIF ALICE',agentId:'A12345',kind:'avancement',effective:'2026-01-01',page:1,pages:[1],selected:true,nrSteps:1,approved:true,identityMethod:'rup',identitySource:'rup-old',identityDate:'2026-01-01',recordedBefore:{gf:8,nr:120},recordedAfter:{gf:8,nr:125}};

test('recomputed identity provenance does not block a batch or replace the approved decision',()=>{
 const incoming={...saved,identityMethod:'annual' as const,identitySource:undefined,identityDate:undefined};
 assert.equal(preserveApproved([incoming],[saved],true)[0],saved);
 const acknowledged={...saved,acknowledgedByDocument:{id:'source',eventId:'proof',name:'ODJ fictif',page:1,documentType:'cr' as const}};
 assert.equal(preserveApproved([incoming],[acknowledged],true)[0],acknowledged);
});

test('changing or removing approved business facts still requires an explicit correction',()=>{
 for(const patch of [{agentId:'B12345'},{effective:'2026-02-01'},{kind:'mesure' as const},{nrSteps:2},{gfBefore:9},{nrAfter:130},{agency:'AUTRE AGENCE'},{selected:false},{note:'Autre justification'},{identityPending:true},{newAgent:true},{reclassementNRConfirmed:true}]){
  assert.throws(()=>preserveApproved([{...saved,...patch}],[saved],true),/Corriger/);
 }
 assert.throws(()=>preserveApproved([],[saved],true),/Corriger/);
});

test('preview round trips retain approved events while drafts still resolve identities',()=>{
 const preview={...saved,state:'ready',problem:'',identityMethod:'annual',identitySource:undefined,identityDate:undefined} as CspPreview;
 assert.equal(cspResolvedEvent(saved,preview),saved);
 const draft={...saved,approved:undefined};
 const resolved=cspResolvedEvent(draft,preview);
 assert.equal(resolved.identityMethod,'annual');
 assert.equal(resolved.identitySource,undefined);
});
