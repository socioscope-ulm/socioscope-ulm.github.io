import test from 'node:test';
import assert from 'node:assert/strict';
import {saveCspDraft} from '../src/lib/csp-draft.ts';
const event={id:'fictitious',name:'EXEMPLE ADELE',kind:'avancement' as const,effective:'2026-01-01',nrSteps:1,page:1,selected:true};
const extraction={date:'2026-03-24',events:[event],reports:[],duplicates:0,documentType:'cr' as const};
test('successive ODJ and RD imports preserve two independent draft originals without validating decisions',async()=>{
 const saved=new Map<string,any>();
 const send=async(body:FormData)=>{const file=body.get('file') as File;const data=JSON.parse(body.get('extraction') as string);const id='csp-'+data.documentType;saved.set(id,{data,fileName:file.name,bytes:await file.text(),status:'review'});return {id};};
 const odj=await saveCspDraft(new File(['%PDF-ODJ-fictitious'],'ODJ-fictif.pdf'),extraction,send);
 const rd=await saveCspDraft(new File(['%PDF-RD-fictitious'],'RD-fictif.pdf'),{...extraction,documentType:'rd'},send);
 assert.notEqual(odj.id,rd.id);assert.equal(saved.size,2);
 assert.equal(saved.get(odj.id).data.documentType,'cr');assert.equal(saved.get(rd.id).data.documentType,'rd');
 assert.equal(saved.get(odj.id).bytes,'%PDF-ODJ-fictitious');assert.equal(saved.get(odj.id).status,'review');
 assert.equal(saved.get(odj.id).data.events[0].approved,undefined);assert.equal(saved.get(odj.id).data.candidateVersion,1);
});
test('missing meeting dates, failed saves and duplicates cannot produce a false saved confirmation',async()=>{
 const file=new File(['%PDF-fiction'],'ODJ-fictif.pdf');let sends=0;
 await assert.rejects(()=>saveCspDraft(file,{...extraction,date:''},async()=>{sends++;return {id:'bad'};}),/Date de séance/);assert.equal(sends,0);
 await assert.rejects(()=>saveCspDraft(file,extraction,async()=>{throw Error('network unavailable');}),/network unavailable/);
 await assert.rejects(()=>saveCspDraft(file,extraction,async()=>({} as any)),/non confirmé/);
 assert.deepEqual(await saveCspDraft(file,extraction,async()=>({id:'csp-existing',existing:true})),{id:'csp-existing',existing:true});
});
