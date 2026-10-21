import {env} from '../../server/storage';
import {seed} from '../../server/seeds';
import type {Dataset} from './model';
import {mergeObservations,hoursPerEmployee} from './model';
export let base:Dataset;
export function initializeBase(){base=seed as Dataset;}
export function resources(){if(!env.DB||!env.BUCKET)throw Error('Stockage indisponible. Réessayer ultérieurement.');return {db:env.DB,bucket:env.BUCKET};}
export async function metadata(){const {db}=resources();const {results}=await db.prepare('SELECT id,name,hash,created,status,years,records,revision FROM imports ORDER BY COALESCE((SELECT MAX(created) FROM changes WHERE source=imports.id),imports.created)').all<any>();return results;}
export async function dataset(){let observations=base.observations;const docs=[...base.documents];for(const r of await metadata()){docs.push({id:r.id,name:r.name,years:JSON.parse(r.years),url:'/api/files/'+r.id,type:'import',status:r.status,created:r.created});if(r.status==='validated')observations=mergeObservations(observations,JSON.parse(r.records));}observations=observations.filter(o=>o.metric!=='heures_par_salarie');observations=[...observations,...hoursPerEmployee(observations)];return {...base,observations,documents:docs,rows:undefined,pages:undefined};}
export async function payload(id:string){const {bucket}=resources();const v=await bucket.get('imports/'+id+'/extraction.json');if(!v)return null;return await v.json<Dataset>();}
