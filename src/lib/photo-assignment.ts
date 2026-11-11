/**
 * Confirmed replacements must remove the old assignment entirely, rather than
 * nulling its agent_id (which puts it back in the pending-photo queue).
 * The two database operations run in one transaction; storage cleanup follows
 * only after the transaction commits successfully.
 */
export type ExistingPhoto={id:string;object_key:string}|null;
export type PhotoStatement={bind:(...args:any[])=>any};
export type PhotoDatabase={
 prepare:(query:string)=>PhotoStatement;
 batch:(queries:any[])=>Promise<{meta?:{changes?:number}}[]>;
};
export async function commitPhotoAssignment(db:PhotoDatabase,id:string,agent:string,existing:ExistingPhoto):Promise<string|null>{
 const work:any[]=[];
 if(existing&&existing.id!==id){
  work.push(db.prepare('DELETE FROM agent_photos WHERE id=?::uuid AND agent_id=?').bind(existing.id,agent));
 }
 work.push(db.prepare('UPDATE agent_photos SET agent_id=?,updated_at=now() WHERE id=?::uuid').bind(agent,id));
 const results=await db.batch(work);
 if(results.at(-1)?.meta?.changes!==1)throw Error('Photo introuvable ou attribution non enregistrée.');
 return existing&&existing.id!==id?existing.object_key:null;
}
