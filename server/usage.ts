export type UsageBucket='storage_cached'|'storage_uncached'|'storage_unknown'|'api';
type Counter={day:string;bucket:UsageBucket;bytes:number;requests:number;unmeasured:number};
export const suspensionMessage='Les consultations sont temporairement suspendues par l’administrateur pour préserver le quota de consommation. Votre compte et vos données sont conservés.';

export function createUsageService(database:{prepare:(sql:string)=>any},now=()=>new Date()){
 const pending=new Map<string,Counter>();
 const add=(entry:Counter)=>{
  const key=entry.day+'|'+entry.bucket,prior=pending.get(key);
  if(prior){prior.bytes+=entry.bytes;prior.requests+=entry.requests;prior.unmeasured+=entry.unmeasured;}
  else pending.set(key,{...entry});
 };
 const record=(bucket:UsageBucket,bytes?:number)=>{
  const known=typeof bytes==='number'&&Number.isSafeInteger(bytes)&&bytes>=0;
  add({day:now().toISOString().slice(0,10),bucket,bytes:known?bytes:0,requests:1,unmeasured:known?0:1});
 };
 const flush=async()=>{
  if(!pending.size)return;
  const entries=[...pending.values()].map(v=>({...v}));pending.clear();
  try{
   await database.prepare(`INSERT INTO socioscope.usage_daily(day,bucket,bytes,requests,unmeasured)
    SELECT day,bucket,bytes,requests,unmeasured FROM jsonb_to_recordset(?::jsonb)
     AS values_to_add(day date,bucket text,bytes bigint,requests bigint,unmeasured bigint)
    ON CONFLICT(day,bucket) DO UPDATE SET bytes=usage_daily.bytes+excluded.bytes,
     requests=usage_daily.requests+excluded.requests,unmeasured=usage_daily.unmeasured+excluded.unmeasured,updated_at=now()`)
    .bind(JSON.stringify(entries)).run();
  }catch{for(const entry of entries)add(entry);}
 };
 const control=async()=>{
  const value=await database.prepare(`SELECT suspended,tracking_started AS "trackingStarted",updated_at AS "updatedAt",threshold_bytes::text AS "thresholdBytes"
   FROM socioscope.usage_control WHERE singleton=true`).first();
  if(!value)throw Error('Suivi de consommation indisponible.');
  return {...value,thresholdBytes:Number(value.thresholdBytes),automaticBlocking:false};
 };
 return {
  record,flush,control,
  async setSuspended(suspended:boolean){
   await database.prepare('UPDATE socioscope.usage_control SET suspended=?,updated_at=now() WHERE singleton=true').bind(suspended).run();
   return control();
  },
  async report(){
   await flush();
   const settings=await control();
   const rows=await database.prepare(`SELECT day::text,bucket,bytes::text,requests::text,unmeasured::text,updated_at AS "updatedAt"
    FROM socioscope.usage_daily ORDER BY day,bucket`).all();
   return {settings,rows:rows.results.map((r:any)=>({...r,bytes:Number(r.bytes),requests:Number(r.requests),unmeasured:Number(r.unmeasured)})),reportedAt:now().toISOString()};
  }
 };
}

export function recordStorageTransfer(usage:{record:(bucket:UsageBucket,bytes?:number)=>void},response:Response){
 const cache=response.headers.get('cf-cache-status')?.toUpperCase();
 const bucket:UsageBucket=cache==='HIT'?'storage_cached':cache?'storage_uncached':'storage_unknown';
 const length=response.headers.get('content-length');
 const bytes=length!==null&&/^\d+$/.test(length)?Number(length):undefined;
 usage.record(bucket,bytes);
}
