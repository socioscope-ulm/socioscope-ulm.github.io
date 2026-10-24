import {storageFetch} from './storage';
import {createSeedLoader} from './seed-loader';
export let seed:any;export let packedText:string;export let rupSeedText:string;
export const loadSeeds=createSeedLoader(async key=>{
 const r=await storageFetch(key);if(!r.ok)throw Error('Historique non disponible.');return r.text();
},(name,text)=>{
 if(name==='seed')seed=JSON.parse(text);
 else if(name==='agents-seed')packedText=text;
 else rupSeedText=text;
});
