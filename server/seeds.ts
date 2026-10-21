import {storageFetch} from './storage';
export let seed:any;export let packedText:string;export let rupSeedText:string;let loading:Promise<void>|undefined;
export async function loadSeeds(){if(!loading)loading=(async()=>{const files=await Promise.all(['seed','agents-seed','rup-seed'].map(async name=>{const r=await storageFetch('data/'+name+'.json');if(!r.ok)throw Error('Historique non disponible.');return await r.text();}));seed=JSON.parse(files[0]);packedText=files[1];rupSeedText=files[2];})().catch(e=>{loading=undefined;throw e;});await loading;}
