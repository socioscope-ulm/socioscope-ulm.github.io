import test from 'node:test';
import assert from 'node:assert/strict';
import {cspAutomaticCompletion} from '../src/lib/csp-document-completion.ts';
import {acknowledgeCspDecisions} from '../src/lib/csp-acknowledgement.ts';
import {activeCspEvents} from '../src/lib/csp-validation.ts';
const event={id:'fictitious',name:'EXEMPLE ADELE',agentId:'Z00007',kind:'titularisation' as const,effective:'2026-01-01',page:1,selected:true};
const rd={id:'rd',name:'RD fictif',date:'2026-03-24',status:'validated',detail:{documentType:'rd',perEventValidation:true,events:[{...event,approved:true}]}};
const odj={id:'odj',name:'ODJ fictif',date:rd.date,status:'review',detail:{documentType:'cr',events:[event]}};
test('an ODJ entirely acknowledged by an approved RD completes without writes or additional career movements',()=>{
 const original=structuredClone([rd,odj]);const rows=acknowledgeCspDecisions([rd,odj]);
 assert.equal(cspAutomaticCompletion(rows[1],rows),true);assert.equal(rows[1].status,'review');
 assert.deepEqual(activeCspEvents(rows[1].detail),[]);assert.deepEqual([rd,odj],original);
 for(const source of [{...rd,status:'disabled:validated'},{...rd,status:'review'},{...rd,detail:{...rd.detail,events:[{...event,approved:false}]}},{...rd,date:'2026-04-24'}]){
  const next=acknowledgeCspDecisions([source,rows[1]]);assert.equal(cspAutomaticCompletion(next[1],next),false);
 }
});
test('remaining, unchecked, contradictory or empty ODJ documents never complete automatically',()=>{
 const rows=acknowledgeCspDecisions([rd,odj]);const pending={...event,id:'pending',name:'EXEMPLE BENOIT',agentId:'Z00008'};
 for(const events of [[],[pending],[...rows[1].detail.events,pending],[{...rows[1].detail.events[0],selected:false}],[{...rows[1].detail.events[0],extractionIssue:'À contrôler'}]])assert.equal(cspAutomaticCompletion({...odj,detail:{...odj.detail,events}},rows),false);
 assert.equal(cspAutomaticCompletion({...rows[1],status:'disabled:validated'},rows),false);
});
test('non-retained candidatures complete only with a validated RD as evidence',()=>{
 const candidate={...event,candidacy:true,nonRetainedByRD:{id:rd.id,name:rd.name,documentType:'rd' as const}};
 const row={...odj,detail:{...odj.detail,events:[candidate]}};
 assert.equal(cspAutomaticCompletion(row,[rd,row]),true);
 assert.equal(cspAutomaticCompletion(row,[{...rd,status:'review'},row]),false);
 assert.equal(cspAutomaticCompletion({...row,detail:{...row.detail,events:[{...event,candidacy:true,nonRetained:true}]}},[rd]),false);
});
