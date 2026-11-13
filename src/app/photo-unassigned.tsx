import {useEffect,useMemo,useState} from 'react';
import {photoNameKey,type PhotoAgent} from '../lib/photo-match';
import type {PhotoBatchReview} from '../lib/photo-batch';

export type LocalPhotoReview=PhotoBatchReview&{
 id:string;
 source:string;
 blob:Blob;
};

const reasonLabel:Record<PhotoBatchReview['reason'],string>={
 missing:'Agent absent du catalogue (ou nom différent)',
 homonym:'Plusieurs fiches portent ce nom',
 uncertain:'Correspondance entre le nom et le portrait à vérifier'
};

export function UnassignedPhotoReview({
 item,agents,occupied,onLink,onIgnore
}:{
 item:LocalPhotoReview;
 agents:PhotoAgent[];
 occupied:ReadonlySet<string>;
 onLink:(id:string,replace:boolean)=>Promise<void>;
 onIgnore:()=>void;
}){
 const [url,setUrl]=useState(''),[query,setQuery]=useState(''),[selected,setSelected]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  const object=URL.createObjectURL(item.blob);setUrl(object);
  return()=>URL.revokeObjectURL(object);
 },[item.blob]);
 const normalized=photoNameKey(query);
 const options=useMemo(()=>normalized.length>=2
  ?agents.filter(a=>photoNameKey(a.name).includes(normalized)).slice(0,60):[],[agents,normalized]);
 const chosen=agents.find(a=>a.id===selected);
 const already=!!chosen&&occupied.has(chosen.id);
 const link=async()=>{
  if(!chosen)return;
  if(already&&!confirm('Cet agent possède déjà une photo. Voulez-vous la remplacer par ce portrait ?'))return;
  setBusy(true);setError('');
  try{await onLink(chosen.id,already);}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 };
 return <article className="photo-assignment" aria-label={'Photo non attribuée : '+item.photo.name}>
  <div className="portrait-frame">{url?<img src={url} alt={'Portrait à vérifier : '+item.photo.name}/>:null}</div>
  <div>
   <b>{item.photo.name}</b>
   <p>{reasonLabel[item.reason]} · page {item.photo.page}</p>
   <label>Rechercher une fiche individuelle
    <input type="search" value={query} placeholder="Saisir au moins deux lettres du nom ou prénom"
      onChange={e=>{setQuery(e.target.value);setSelected('');}} disabled={busy}/>
   </label>
   <label>Agent à rattacher
    <select value={selected} disabled={busy||options.length===0} onChange={e=>setSelected(e.target.value)}>
     <option value="">Choisir dans les résultats ({options.length})</option>
     {options.map(a=><option value={a.id} key={a.id}>{a.name} · {a.agency||a.id}</option>)}
    </select>
   </label>
   {already&&<p className="filter-note">Cet agent possède déjà une photo : un remplacement demandera confirmation.</p>}
   <div className="analysis-options">
    <button type="button" className="btn primary" disabled={!selected||busy} onClick={()=>void link()}>
     {busy?'Enregistrement…':'Rattacher à cette fiche'}
    </button>
    <button type="button" className="btn" disabled={busy} onClick={onIgnore}>Laisser de côté</button>
   </div>
   {error&&<p role="alert">{error}</p>}
  </div>
 </article>;
}
