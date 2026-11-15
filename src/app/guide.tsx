'use client';
import {useEffect,useRef,useState} from 'react';
import {BookOpen,Download,Upload,ChevronRight,FileText} from 'lucide-react';

type GuideStatus={available:boolean;updatedAt:string|null;size:number;filename:string};
const GUIDE_PATH='/api/guide/file';
const fileName='Guide_Socioscope_ULM.pdf';
function descriptionOf(error:unknown){return error instanceof Error?error.message:'Téléchargement indisponible.';}
function downloadBlob(blob:Blob){
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download=fileName;
 document.body.appendChild(link);link.click();link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
export async function downloadGuide(){
 const response=await fetch(GUIDE_PATH,{cache:'no-store'});
 if(!response.ok){const payload=await response.json().catch(()=>({}));throw Error(payload.error||'Téléchargement du guide indisponible.');}
 const blob=await response.blob();
 if(blob.type&&!blob.type.includes('pdf'))throw Error('Le guide reçu ne correspond pas à un PDF.');
 downloadBlob(blob);
}
export function GuideDownload(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async()=>{setBusy(true);setError('');try{await downloadGuide();}catch(e){setError(descriptionOf(e));}finally{setBusy(false);}};
 return <span className="guide-control">
  <button className="guide-download" type="button" disabled={busy} title="Télécharger le guide d’utilisation (PDF)" aria-label="Télécharger le guide d’utilisation de Socioscope ULM" onClick={()=>void save()}>Guide d’utilisation</button>
  {error&&<span className="guide-download-error" role="alert">{error}<button type="button" aria-label="Fermer le message" onClick={()=>setError('')}>×</button></span>}
 </span>;
}
export function GuideAdministration(){
 const [status,setStatus]=useState<GuideStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const input=useRef<HTMLInputElement>(null);
 const refresh=async()=>{const response=await fetch('/api/guide',{cache:'no-store'});const value=await response.json().catch(()=>({}));if(!response.ok)throw Error(value.error||'Informations du guide indisponibles.');setStatus(value);};
 useEffect(()=>{void refresh().catch(e=>setError(descriptionOf(e)));},[]);
 const upload=async(file?:File)=>{
  if(!file)return;
  if(!file.name.toLowerCase().endsWith('.pdf')){setError('Sélectionner un document PDF.');return;}
  if(file.size>8*1024*1024){setError('Le PDF ne doit pas dépasser 8 Mo.');return;}
  if(status?.available&&!window.confirm('Remplacer le guide actuellement proposé à tous les utilisateurs ?'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const form=new FormData();form.set('file',file,file.name);
   const response=await fetch('/api/guide',{method:'POST',body:form});
   const value=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(value.error||'Import du guide impossible.');
   setStatus(value.guide);setNotice('Guide publié. Le téléchargement pointe désormais vers ce PDF pour tous les comptes autorisés.');
   window.dispatchEvent(new Event('socioscope-guide-updated'));
  }catch(e){setError(descriptionOf(e));}finally{setBusy(false);}
 };
 const date=status?.updatedAt?new Date(status.updatedAt).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'}):'';
 return <details className="document-folder guide-admin-folder">
  <summary><ChevronRight size={16} className="folder-chevron"/><BookOpen size={20}/><strong>Guide d’utilisation</strong><span className="badge">PDF · utilisateurs et administrateur</span></summary>
  <div className="document-folder-content">
   <section className="panel">
    <h2>Guide d’utilisation de Socioscope ULM</h2>
    <p className="filter-note">Le document importé ici alimente le bouton « Guide d’utilisation » situé en premier dans le bandeau vert supérieur, juste avant les actions de compte. Il est téléchargeable par tous les comptes autorisés ; seul l’administrateur peut le remplacer.</p>
    {status?.available?<p className="guide-current"><FileText size={19}/><span><b>Guide actuellement publié</b><small>{date} · {Math.round(status.size/1024)} Ko · PDF</small></span><button className="btn" type="button" onClick={()=>void downloadGuide().catch(e=>setError(descriptionOf(e)))}><Download size={15}/>Télécharger</button></p>:<p className="filter-note">Aucun guide encore publié. Importez le PDF pour activer le téléchargement dans les pages utilisateurs.</p>}
    <label className="btn primary file-input"><Upload size={16}/>{busy?'Publication…':status?.available?'Remplacer le guide':'Importer le guide PDF'}<input ref={input} type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>
    <p className="filter-note">PDF uniquement · 8 Mo maximum. Un nouvel import remplace la version précédente sans affecter les autres documents ni les analyses.</p>
    {notice&&<p className="notice" role="status">{notice}</p>}
    {error&&<p className="notice" role="alert">{error}</p>}
   </section>
  </div>
 </details>;
}
