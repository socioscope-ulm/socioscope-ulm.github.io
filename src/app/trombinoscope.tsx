import {useEffect,useMemo,useRef,useState} from 'react';
import {ChevronRight,FileText,FolderOpen,ExternalLink,Download,Trash2,Upload,X} from 'lucide-react';
import {TROMBINOSCOPE_AGENCIES,type TrombinoscopeDocument,type TrombinoscopeAgencyCode} from '../lib/trombinoscope';

type Catalog={agencies:TrombinoscopeDocument[]};
async function trombiRequest(path:string,init?:RequestInit):Promise<Response>{
 const r=await fetch('/api/trombinoscopes'+path,init);
 if(!r.ok){
  const body=await r.json().catch(()=>({}));
  throw Error(body.error||'Le document est momentanément indisponible.');
 }
 return r;
}
async function listTrombi():Promise<Catalog>{return (await trombiRequest('')).json();}
function displayDate(value:string|null){if(!value)return '—';const date=new Date(value);return Number.isNaN(+date)?'—':date.toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});}
function fileSize(n:number|null){return n?new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(n/1048576)+' Mo':'—';}

/** Lecture de PDF via un blob créé seulement après un appel API authentifié. */
export function TrombinoscopeViewer(){
 const [docs,setDocs]=useState<TrombinoscopeDocument[]>([]);
 const [selected,setSelected]=useState<TrombinoscopeAgencyCode|null>(null);
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const cache=useRef(new Map<string,string>()),pending=useRef<AbortController|null>(null);
 useEffect(()=>{
  let alive=true;
  listTrombi().then(v=>{if(alive)setDocs(v.agencies);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});
  const refresh=()=>{listTrombi().then(v=>{if(alive)setDocs(v.agencies);}).catch(()=>{});};
  window.addEventListener('socioscope-trombinoscopes-changed',refresh);
  return()=>{alive=false;pending.current?.abort();cache.current.forEach(value=>URL.revokeObjectURL(value));cache.current.clear();window.removeEventListener('socioscope-trombinoscopes-changed',refresh);};
 },[]);
 const close=()=>{pending.current?.abort();pending.current=null;setSelected(null);setBusy(false);setUrl('');setError('');};
 useEffect(()=>{
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&selected)close();};
  window.addEventListener('keydown',escape);
  return()=>window.removeEventListener('keydown',escape);
 },[selected]);
 const choose=async(code:TrombinoscopeAgencyCode)=>{
  const item=docs.find(d=>d.agency===code);
  if(!item?.available)return;
  pending.current?.abort();
  setSelected(code);setUrl('');setError('');
  const saved=cache.current.get(code);
  if(saved){setUrl(saved);setBusy(false);return;}
  const controller=new AbortController();pending.current=controller;setBusy(true);
  try{
   const response=await trombiRequest('/'+code+'/file',{signal:controller.signal});
   const content=await response.blob();
   if(controller.signal.aborted)return;
   if(content.type&&!content.type.includes('pdf'))throw Error('Le document reçu n’est pas un PDF.');
   const object=URL.createObjectURL(new Blob([content],{type:'application/pdf'}));
   cache.current.set(code,object);setUrl(object);
  }catch(e){
   if(!controller.signal.aborted)setError((e as Error).message);
  }finally{if(!controller.signal.aborted)setBusy(false);}
 };
 const current=docs.find(d=>d.agency===selected);
 return <section className="panel trombi-section" aria-label="Trombinoscopes par agence">
  <div className="trombi-intro"><div><h2>Les organigrammes de l’ULM</h2><p>Sélectionnez une agence pour consulter son trombinoscope complet. Documents réservés aux utilisateurs du Socioscope.</p></div><span className="badge">{docs.filter(d=>d.available).length} document(s) disponible(s)</span></div>
  {loading&&<p role="status">Chargement des agences…</p>}
  {error&&!selected&&<p role="alert" className="notice">{error}</p>}
  <div className="trombi-grid">
   {TROMBINOSCOPE_AGENCIES.map(a=>{
    const item=docs.find(d=>d.agency===a.code);
    return <button className={'trombi-card'+(item?.available?'':' trombi-card-empty')} type="button" key={a.code}
      onClick={()=>void choose(a.code)} disabled={!item?.available} aria-label={'Consulter le trombinoscope '+a.label}>
      <div className="trombi-card-icon"><FileText size={23}/></div>
      <div className="trombi-card-body"><strong>{a.label}</strong><span>{item?.available?(item.period||'Document PDF disponible'):'Document à ajouter'}</span>{item?.available&&<small>Mis à jour le {displayDate(item.updatedAt)}</small>}</div>
      {item?.available&&<ChevronRight size={19} aria-hidden="true"/>}
    </button>;
   })}
  </div>
  {selected&&<div className="trombi-overlay" onClick={e=>{if(e.target===e.currentTarget)close();}}>
   <section role="dialog" aria-modal="true" aria-label={'Trombinoscope '+(current?.label||selected)} className="trombi-dialog">
    <header className="trombi-dialog-header"><div><h2>{current?.label||selected}</h2><p>{current?.period||'Trombinoscope'} · {current?.filename||'PDF'}</p></div>
     <div className="trombi-dialog-actions">
      {url&&<><a className="btn" href={url} download={current?.filename||'trombinoscope.pdf'}><Download size={15}/>Télécharger</a><a className="btn" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>Ouvrir</a></>}
      <button className="btn" onClick={close}><X size={16}/>Fermer</button>
     </div>
    </header>
    {busy&&<p className="trombi-dialog-message" role="status">Ouverture du document privé…</p>}
    {error&&<p className="notice trombi-dialog-message" role="alert">{error}</p>}
    {url&&<iframe className="trombi-pdf" src={url+'#view=FitH'} title={'Document PDF '+(current?.label||selected)}/>}
   </section>
  </div>}
 </section>;
}

export function TrombinoscopeAdministration(){
 const [docs,setDocs]=useState<TrombinoscopeDocument[]>([]);
 const [opening,setOpening]=useState(true),[busy,setBusy]=useState<TrombinoscopeAgencyCode|null>(null);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [periods,setPeriods]=useState<Record<string,string>>({});
 const reload=async()=>{
  const catalog=await listTrombi();
  setDocs(catalog.agencies);
  setPeriods(prev=>Object.fromEntries(catalog.agencies.map(x=>[x.agency,prev[x.agency]??x.period??''])));
  window.dispatchEvent(new Event('socioscope-trombinoscopes-changed'));
 };
 useEffect(()=>{if(opening)reload().catch(e=>setError(e.message));},[opening]);
 const save=async(code:TrombinoscopeAgencyCode,file?:File)=>{
  if(!file)return;
  setError('');setNotice('');
  if(!file.name.toLowerCase().endsWith('.pdf')||file.size<8||file.size>20*1048576){setError('Sélectionner un PDF de 20 Mo maximum.');return;}
  const previous=docs.find(x=>x.agency===code);
  if(previous?.available&&!confirm('Remplacer le trombinoscope '+previous.label+' ? Le document actuel restera disponible si l’envoi échoue.'))return;
  setBusy(code);
  try{
   const form=new FormData();form.set('file',file,file.name);form.set('period',periods[code]||'');
   await trombiRequest('/'+code,{method:'PUT',body:form});
   await reload();
   setNotice('Trombinoscope '+(previous?.label||code)+' enregistré. Les lecteurs peuvent consulter la nouvelle version.');
  }catch(e){setError((e as Error).message);}
  finally{setBusy(null);}
 };
 const remove=async(code:TrombinoscopeAgencyCode)=>{
  const item=docs.find(x=>x.agency===code);
  if(!item?.available||!confirm('Retirer le PDF '+item.label+' de la consultation ? Les photos individuelles ne seront pas modifiées.'))return;
  setBusy(code);setError('');setNotice('');
  try{await trombiRequest('/'+code,{method:'DELETE'});await reload();setNotice('Document '+item.label+' retiré.');}
  catch(e){setError((e as Error).message);}
  finally{setBusy(null);}
 };
 return <section className="trombi-admin-organigrams" aria-label="Organigrammes PDF des agences">
  <h3><FolderOpen size={18}/> Organigrammes PDF consultables par agence</h3>
  <div><p>Déposer ou remplacer le PDF d’une agence. La rubrique « Trombinoscope » du menu public aux utilisateurs connectés est mise à jour automatiquement. Ces documents sont distincts des photos des fiches individuelles.</p>
   {error&&<p role="alert" className="notice">{error}</p>}
   {notice&&<p role="status" className="notice">{notice}</p>}
   <div className="trombi-admin-grid">
    {TROMBINOSCOPE_AGENCIES.map(a=>{
     const item=docs.find(x=>x.agency===a.code),locked=busy!==null;
     return <div className="trombi-admin-row" key={a.code}>
      <div className="trombi-admin-details"><strong>{a.label}</strong><small>{item?.available?((item.filename||'PDF')+' · '+fileSize(item.sizeBytes)+' · '+displayDate(item.updatedAt)):'Aucun document publié'}</small></div>
      <label className="trombi-period">Version / date du document<input type="text" maxLength={90} placeholder="Ex. : octobre 2026" disabled={locked} value={periods[a.code]||''} onChange={e=>setPeriods(p=>({...p,[a.code]:e.target.value}))}/></label>
      <div className="trombi-admin-actions"><label className="btn file-input"><Upload size={15}/>{busy===a.code?'Envoi…':item?.available?'Remplacer PDF':'Ajouter PDF'}<input type="file" accept=".pdf,application/pdf" disabled={locked} onChange={e=>{void save(a.code,e.target.files?.[0]);e.target.value='';}}/></label>
      {item?.available&&<button className="btn" disabled={locked} onClick={()=>void remove(a.code)}><Trash2 size={14}/>Retirer</button>}</div>
     </div>;
    })}
   </div>
  </div>
 </section>;
}
