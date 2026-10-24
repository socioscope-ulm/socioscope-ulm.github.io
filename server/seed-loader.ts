export type SeedName='seed'|'agents-seed'|'rup-seed';
export function seedsForPath(path:string):SeedName[]{
 if(path==='/api/rup')return ['rup-seed'];
 if(path.startsWith('/api/agents/files/'))return [];
 if(path==='/api/agents/import')return ['agents-seed'];
 if(path==='/api/agents'||path.startsWith('/api/agents/'))return ['agents-seed','rup-seed'];
 if(path==='/api/data'||path==='/api/rows'||path==='/api/import'||path.startsWith('/api/review/'))return ['seed'];
 return [];
}
// Successful loads survive for this worker; concurrent loads share one request.
// Failed datasets can be retried without reloading the successful ones.
export function createSeedLoader(read:(key:string)=>Promise<string>,publish:(name:SeedName,text:string)=>void){
 const pending=new Map<SeedName,Promise<void>>();
 return async(names:SeedName[])=>{
  await Promise.all(names.map(name=>{
   let task=pending.get(name);
   if(!task){
    task=read('data/'+name+'.json').then(text=>publish(name,text)).catch(error=>{pending.delete(name);throw error;});
    pending.set(name,task);
   }
   return task;
  }));
 };
}
