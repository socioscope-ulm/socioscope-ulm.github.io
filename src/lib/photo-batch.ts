import {matchPhotoName,type PhotoAgent} from './photo-match.ts';

export type PhotoBatchEntry={
 path:string;
 name:string;
 page:number;
 sha256:string;
 confidence?:string;
};
export type PhotoBatchUpload={photo:PhotoBatchEntry;agent:PhotoAgent};
export type PhotoBatchPlan={
 uploads:PhotoBatchUpload[];
 missing:number;
 ambiguous:number;
 existing:number;
 duplicate:number;
};
const photoPath=/^photos\/[A-Za-z0-9][A-Za-z0-9._-]{0,175}\.jpe?g$/i;
const digest=/^[a-f0-9]{64}$/i;

export function planPhotoBatch(manifest:any,agents:PhotoAgent[],assigned:ReadonlySet<string>):PhotoBatchPlan{
 if(manifest?.format!=='socioscope-photo-batch-v1'||
    typeof manifest.source!=='string'||!manifest.source||manifest.source.length>250||
    !Array.isArray(manifest.photos)||manifest.photos.length===0||manifest.photos.length>1000)
  throw Error('Archive de photos non reconnue.');
 const uploads:PhotoBatchUpload[]=[];
 const usedPaths=new Set<string>(),usedAgents=new Set<string>();
 let missing=0,ambiguous=0,existing=0,duplicate=0;
 for(const item of manifest.photos as PhotoBatchEntry[]){
  if(!item||typeof item.path!=='string'||!photoPath.test(item.path)||
     typeof item.name!=='string'||item.name.length<3||item.name.length>200||
     !Number.isSafeInteger(item.page)||item.page<1||item.page>200||
     typeof item.sha256!=='string'||!digest.test(item.sha256))
   throw Error('Archive de photos invalide : fichier ou correspondance incorrecte.');
  if(item.confidence && item.confidence!=='spatial_exact'){ambiguous++;continue;}
  if(usedPaths.has(item.path)){duplicate++;continue;}
  usedPaths.add(item.path);
  const matches=matchPhotoName(item.name,agents);
  if(matches.length===0){missing++;continue;}
  if(matches.length!==1){ambiguous++;continue;}
  const agent=matches[0];
  if(assigned.has(agent.id)){existing++;continue;}
  if(usedAgents.has(agent.id)){duplicate++;continue;}
  usedAgents.add(agent.id);
  uploads.push({photo:item,agent});
 }
 return {uploads,missing,ambiguous,existing,duplicate};
}
