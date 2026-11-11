import test from 'node:test';
import assert from 'node:assert/strict';
import {commitPhotoAssignment} from '../src/lib/photo-assignment.ts';

function database(){
 const calls:{sql:string;args:any[]}[]=[];
 const db={
  prepare(sql:string){return {bind:(...args:any[])=>({sql,args})};},
  async batch(statements:{sql:string;args:any[]}[]){
   calls.push(...statements);
   return statements.map(()=>({meta:{changes:1}}));
  }
 };
 return {db,calls};
}
test('manual photo replacement deletes former assignment instead of putting it back in pending queue',async()=>{
 const {db,calls}=database();
 const obsolete=await commitPhotoAssignment(db,'new-id','agent-1',{id:'old-id',object_key:'photos/old.jpg'});
 assert.equal(obsolete,'photos/old.jpg');
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/^DELETE FROM agent_photos/);
 assert.deepEqual(calls[0].args,['old-id','agent-1']);
 assert.match(calls[1].sql,/^UPDATE agent_photos SET agent_id=/);
 assert.deepEqual(calls[1].args,['agent-1','new-id']);
});
test('manual assignment without replacement does not delete other photos',async()=>{
 const {db,calls}=database();
 const obsolete=await commitPhotoAssignment(db,'new-id','agent-1',null);
 assert.equal(obsolete,null);
 assert.equal(calls.length,1);
 assert.match(calls[0].sql,/^UPDATE agent_photos/);
});
test('a failed assignment must not produce an old storage key for deletion',async()=>{
 const {db}=database();db.batch=async()=>[{meta:{changes:1}},{meta:{changes:0}}];
 await assert.rejects(commitPhotoAssignment(db,'new-id','agent-1',{id:'old-id',object_key:'photos/old.jpg'}),/Photo introuvable/);
});
