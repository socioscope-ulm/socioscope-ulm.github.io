import type {ResultStore,CacheSnapshot} from './result-cache.ts';

export function databaseResultStore(database:{prepare:(query:string)=>any}):ResultStore{
 return {
  async read(key){
   const row=await database.prepare(`SELECT s.revision::text AS revision,s.enabled,c.payload,c.content_type AS "contentType"
    FROM socioscope.result_cache_state s LEFT JOIN socioscope.result_cache c
    ON c.cache_key=? AND c.revision=s.revision AND c.expires_at>now()
    WHERE s.singleton=true`).bind(key).first() as CacheSnapshot|null;
   if(!row)throw Error('Result cache is not configured');return row;
  },
  async claim(key,revision,owner){
   const r=await database.prepare(`INSERT INTO socioscope.result_cache(cache_key,revision,lease_owner,lease_until)
    SELECT ?,revision,?::uuid,now()+interval '20 seconds' FROM socioscope.result_cache_state WHERE singleton=true AND enabled AND revision=?::bigint
    ON CONFLICT(cache_key) DO UPDATE SET revision=excluded.revision,payload=NULL,content_type=NULL,expires_at=now(),lease_owner=excluded.lease_owner,lease_until=excluded.lease_until,created_at=now()
    WHERE result_cache.revision<>excluded.revision OR (coalesce(result_cache.lease_until,'epoch'::timestamptz)<now() AND (result_cache.payload IS NULL OR result_cache.expires_at<=now()))
    RETURNING cache_key`).bind(key,owner,revision).run();
   return r.meta.changes===1;
  },
  async write(key,revision,owner,payload,contentType){
   await database.prepare(`UPDATE socioscope.result_cache c SET payload=?,content_type=?,expires_at=now()+interval '24 hours',lease_owner=NULL,lease_until=NULL,created_at=now()
    WHERE c.cache_key=? AND c.revision=?::bigint AND c.lease_owner=?::uuid
    AND EXISTS(SELECT 1 FROM socioscope.result_cache_state s WHERE s.singleton=true AND s.enabled AND s.revision=c.revision)`)
    .bind(payload,contentType,key,revision,owner).run();
   // Retain at most 128 completed results and 32 MiB of payloads. Leases do
   // not hold historical documents and are reclaimed after a worker failure.
   await database.prepare(`DELETE FROM socioscope.result_cache WHERE cache_key IN (
    SELECT cache_key FROM (SELECT c.cache_key,c.revision,c.expires_at,
     row_number() OVER(ORDER BY created_at DESC,cache_key) AS position,
     sum(octet_length(coalesce(payload,''))) OVER(ORDER BY created_at DESC,cache_key) AS bytes
     FROM socioscope.result_cache c WHERE lease_owner IS NULL OR lease_until<now()) obsolete
    WHERE position>128 OR bytes>33554432 OR expires_at<=now()
     OR revision<>(SELECT revision FROM socioscope.result_cache_state WHERE singleton=true))`).run();
  },
  async release(key,owner){
   await database.prepare('DELETE FROM socioscope.result_cache WHERE cache_key=? AND lease_owner=?::uuid AND payload IS NULL').bind(key,owner).run();
  }
 };
}

