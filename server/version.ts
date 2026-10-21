/** Supabase's DENO_DEPLOYMENT_ID ends in the deployed Edge Function version. */
export function parseDeploymentVersion(deploymentId:string|null|undefined):number|null{
 const match=deploymentId?.match(/_(\d+)$/);
 if(!match)return null;
 const version=Number(match[1]);
 return Number.isSafeInteger(version)&&version>0?version:null;
}
