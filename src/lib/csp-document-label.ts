// Keep the historical storage key stable: existing approvals and proofs use it.
export const cspDocumentLabel=(type?:string)=>type==='cr'||type==='odj'?'ODJ':'RD';
export function cspDocumentText(value?:string){
 return (value||'').replace(/\bCR\b/g,'ODJ').replace(/\bcomptes? rendus?\b/gi,v=>/^[A-Z]/.test(v)?'Ordre du jour':'ordre du jour').replace(/\bdu ODJ\b/g,'de l’ODJ').replace(/\ble ODJ\b/g,'l’ODJ');
}
