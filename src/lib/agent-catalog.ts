// Share only an in-flight request. Completed results are never retained here;
// imports and administrative changes are checked again on the next load.
export function createAgentCatalogLoader(read:()=>Promise<any>){
 let pending:Promise<any>|undefined;
 return ()=>{
  if(!pending){
   const request=Promise.resolve().then(read);
   pending=request.finally(()=>{pending=undefined;});
  }
  return pending.then(data=>structuredClone(data));
 };
}
export const loadAgentCatalog=createAgentCatalogLoader(async()=>{
 const response=await fetch('/api/agents?view=meta',{cache:'no-store'});
 const data=await response.json();
 if(!response.ok)throw Error(data?.error||'Catalogue des sources indisponible.');
 return data;
});
