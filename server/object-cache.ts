type StoredObject={bytes:ArrayBuffer;contentType:string};
// Only extracted records are cached. Statuses and decisions remain live in DB.
export function createObjectCache(read:(key:string)=>Promise<StoredObject|null>,maxBytes=12*1024*1024,ttl=60_000,now=Date.now){
 const items=new Map<string,{value:StoredObject;expires:number}>();
 const pending=new Map<string,Promise<StoredObject|null>>();
 let size=0;
 const drop=(key:string)=>{const old=items.get(key);if(old){size-=old.value.bytes.byteLength;items.delete(key);}};
 const invalidate=(key:string)=>{drop(key);pending.delete(key);};
 const get=async(key:string):Promise<StoredObject|null>=>{
  if(!/^agents\/[^/]+\/records\.json$/.test(key))return read(key);
  for(const [k,v]of items)if(v.expires<=now())drop(k);
  const hit=items.get(key);
  if(hit){items.delete(key);items.set(key,hit);return hit.value;}
  const inflight=pending.get(key);if(inflight)return inflight;
  const task=read(key).then(value=>{
   if(pending.get(key)===task&&value&&value.bytes.byteLength<=maxBytes){
    while(size+value.bytes.byteLength>maxBytes&&items.size)drop(items.keys().next().value!);
    items.set(key,{value,expires:now()+ttl});size+=value.bytes.byteLength;
   }
   return value;
  }).finally(()=>{if(pending.get(key)===task)pending.delete(key);});
  pending.set(key,task);return task;
 };
 return {get,invalidate};
}
