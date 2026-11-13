import {useEffect,useRef,useState} from 'react';
import {UserRound,ChevronRight,ImagePlus} from 'lucide-react';
import {compressPhoto,extractPortraits,type ExtractedPhoto} from '../lib/photo-extract';
import {photoNameKey,matchPhotoName,type PhotoAgent} from '../lib/photo-match';
import {planPhotoBatch} from '../lib/photo-batch';
import {UnassignedPhotoReview,type LocalPhotoReview} from './photo-unassigned';
async function request(path:string,init?:RequestInit){const r=await fetch(path,init);if(!r.ok){const b=await r.json().catch(()=>({}));throw Object.assign(Error(b.error||'Opération impossible.'),{status:r.status});}return r;}
function PhotoImage({agent,id,revision=0}:{agent?:string;id?:string;revision?:number}){const [url,setUrl]=useState('');useEffect(()=>{let active=true,object='';setUrl('');request('/api/photos/image?'+(agent?'agent='+encodeURIComponent(agent):'id='+id)).then(r=>r.blob()).then(b=>{if(active){object=URL.createObjectURL(b);setUrl(object);}}).catch(()=>{});return()=>{active=false;if(object)URL.revokeObjectURL(object);};},[agent,id,revision]);return url?<img src={url} alt="Photo de l’agent"/>:<UserRound aria-label="Photo non renseignée" size={42}/>;}
async function uploadPhoto(photo:ExtractedPhoto,source:string,agent=''){const form=new FormData();form.set('photo',photo.blob,'portrait.jpg');form.set('name',photo.name);form.set('certain',String(photo.certain));form.set('source',source);form.set('page',String(photo.page));if(agent)form.set('agent',agent);return (await request('/api/photos',{method:'POST',body:form})).json();}

async function replaceOldEtatMajorPhoto(photo:ExtractedPhoto,source:string,agent:string,expectedSource:string){
 const form=new FormData();
 form.set('photo',photo.blob,'portrait.jpg');
 form.set('name',photo.name);
 form.set('source',source);
 form.set('agent',agent);
 form.set('expectedSource',expectedSource);
 form.set('page',String(photo.page));
 return (await request('/api/photos',{method:'PUT',body:form})).json();
}
export function AgentPhoto({agent,isAdmin}:{agent:string;isAdmin:boolean}){const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{const changed=()=>setRevision(v=>v+1);window.addEventListener('socioscope-photos-changed',changed);return()=>window.removeEventListener('socioscope-photos-changed',changed);},[]);
 const add=async(file?:File)=>{if(!file)return;setBusy(true);setError('');try{const photo=await uploadPhoto({blob:await compressPhoto(file),name:'',certain:false,page:1},file.name,agent);if(!photo.agent_id){if(confirm('Cet agent possède déjà une photo. La remplacer ?'))await request('/api/photos',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:photo.id,agent,replace:true})});else await request('/api/photos',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:photo.id})});}setRevision(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const remove=async()=>{if(!confirm('Supprimer la photo de cette fiche ?'))return;setBusy(true);try{const data=await (await request('/api/photos')).json();const photo=data.photos.find((p:any)=>p.agent_id===agent);if(photo)await request('/api/photos',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:photo.id})});setRevision(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <div className="agent-photo"><div className="portrait-frame"><PhotoImage agent={agent} revision={revision}/></div>{isAdmin&&<><button className="text-btn" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Enregistrement…':'Ajouter / remplacer'}</button><button className="text-btn" disabled={busy} onClick={()=>void remove()}>Supprimer</button><input hidden ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void add(e.target.files?.[0]);e.target.value='';}}/></>}{error&&<small role="alert">{error}</small>}</div>;
}
function PhotoAssignment({photo,agents,onChange}:{photo:any;agents:PhotoAgent[];onChange:()=>Promise<void>}){const [query,setQuery]=useState(photo.detected_name||''),[agent,setAgent]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const options=agents.filter(a=>!query||a.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()));
 const save=async(replace=false)=>{setBusy(true);setError('');try{await request('/api/photos',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:photo.id,agent,replace})});await onChange();}catch(e){if((e as any).status===409&&!replace&&confirm('L’agent possède déjà une photo. Confirmer le remplacement ?')){await save(true);}else setError((e as Error).message);}finally{setBusy(false);}};
 return <article className="photo-assignment"><div className="portrait-frame"><PhotoImage id={photo.id}/></div><div><b>{photo.detected_name||'Nom non reconnu'}</b><p>{photo.source_name} · page {photo.page}</p><label>Rechercher un agent<input value={query} onChange={e=>{setQuery(e.target.value);setAgent('');}} placeholder="Nom ou prénom"/></label><label>Agent à rattacher<select value={agent} onChange={e=>setAgent(e.target.value)}><option value="">Choisir dans la liste ({options.length})</option>{options.map(a=><option key={a.id} value={a.id}>{a.name} · {a.agency||a.id}</option>)}</select></label><div className="analysis-options"><button className="btn primary" disabled={busy||!agent} onClick={()=>void save()}>Rattacher la photo</button><button className="btn" disabled={busy} onClick={async()=>{setBusy(true);try{await request('/api/photos',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:photo.id})});await onChange();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Écarter cette image</button></div>{error&&<p role="alert">{error}</p>}</div></article>;
}
function ScannedPage({blob,page,onCrop}:{blob:Blob;page:number;onCrop:(photo:ExtractedPhoto)=>Promise<void>}){const canvas=useRef<HTMLCanvasElement>(null),start=useRef<{x:number;y:number}|null>(null);const [selection,setSelection]=useState<any>(null),[busy,setBusy]=useState(false),[name,setName]=useState(''),[error,setError]=useState('');useEffect(()=>{let active=true;createImageBitmap(blob).then(im=>{if(active&&canvas.current){canvas.current.width=im.width;canvas.current.height=im.height;canvas.current.getContext('2d')!.drawImage(im,0,0);}im.close();});return()=>{active=false;};},[blob]);
 const point=(e:any)=>{const r=canvas.current!.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.current!.width/r.width,y:(e.clientY-r.top)*canvas.current!.height/r.height};};
 const save=async()=>{if(!selection)return;setBusy(true);try{const c=document.createElement('canvas');c.width=selection.w;c.height=selection.h;c.getContext('2d')!.drawImage(canvas.current!,selection.x,selection.y,selection.w,selection.h,0,0,c.width,c.height);const photo=await new Promise<Blob>(ok=>c.toBlob(b=>ok(b!),'image/jpeg',.9));await onCrop({blob:await compressPhoto(photo),name,certain:false,page});setSelection(null);setName('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const ocr=async()=>{setBusy(true);setError('');let worker:any;try{const {createWorker}=await import('tesseract.js');worker=await createWorker('fra',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js'});const c=document.createElement('canvas');const s=selection;c.width=Math.min(canvas.current!.width-s.x,s.w*1.6);c.height=Math.min(canvas.current!.height-s.y-s.h,s.h*.65);if(c.height<5)throw Error('Sélectionner la photo en laissant le nom visible dessous.');c.getContext('2d')!.drawImage(canvas.current!,s.x,s.y+s.h,c.width,c.height,0,0,c.width,c.height);const result=await worker.recognize(c);setName(result.data.text.trim());}catch(e){setError('Lecture du nom indisponible : saisir le nom ou rattacher ensuite dans la liste.');}finally{await worker?.terminate();setBusy(false);}};
 return <section className="panel"><h3>Page {page} · sélectionner une photo</h3><p>Tracer un rectangle autour de la photo, puis l’ajouter. Répéter pour chaque agent de cette page.</p><div className="photo-crop"><canvas ref={canvas} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);start.current=point(e);setSelection(null);}} onPointerUp={e=>{if(!start.current)return;const end=point(e),s=start.current;setSelection({x:Math.min(s.x,end.x),y:Math.min(s.y,end.y),w:Math.abs(end.x-s.x),h:Math.abs(end.y-s.y)});start.current=null;}}/>{selection&&<div className="crop-outline" style={{left:selection.x/canvas.current!.width*100+'%',top:selection.y/canvas.current!.height*100+'%',width:selection.w/canvas.current!.width*100+'%',height:selection.h/canvas.current!.height*100+'%'}}/>}</div>{selection&&<><label>Nom associé<input value={name} onChange={e=>setName(e.target.value)}/></label><button className="btn" disabled={busy||selection.w<10||selection.h<10} onClick={()=>void ocr()}>Lire le nom sous la photo</button><button className="btn primary" disabled={busy||selection.w<10||selection.h<10} onClick={()=>void save()}>Ajouter la photo à rattacher</button></>}{error&&<p role="alert">{error}</p>}</section>;
}
export default function PhotoImport(){const [data,setData]=useState<any>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[scans,setScans]=useState<{blob:Blob;page:number;source:string}[]>([]),[review,setReview]=useState<LocalPhotoReview[]>([]),[replaceEtatMajor,setReplaceEtatMajor]=useState(false),[opened,setOpened]=useState(true);const reload=async()=>{setData(await (await request('/api/photos')).json());window.dispatchEvent(new Event('socioscope-photos-changed'));};useEffect(()=>{if(opened)reload().catch(e=>setError(e.message));},[opened]);
 const readArchive=async(file?:File,mode:'import'|'review'='import')=>{if(!file)return;setBusy('Vérification des correspondances…');setError('');setNotice('');setReview([]);
  let assigned=0,replaced=0,processed=0;
  try{
   if(file.size>40*1024*1024)throw Error('Archive limitée à 40 Mo.');
   const {default:JSZip}=await import('jszip');
   const archive=await JSZip.loadAsync(await file.arrayBuffer(),{checkCRC32:true});
   const manifestFile=archive.file('manifest.json');
   if(!manifestFile)throw Error('Archive non reconnue : manifest.json absent.');
   const manifest=JSON.parse(await manifestFile.async('string'));
   const existing=await (await request('/api/photos')).json();
   const occupied=new Set<string>((existing.photos||[]).filter((p:any)=>p.agent_id).map((p:any)=>String(p.agent_id)));
   const sourceMap=new Map<string,string>((existing.photos||[]).filter((p:any)=>p.agent_id)
    .map((p:any)=>[String(p.agent_id),String(p.source_name)]));
   if(mode==='import'&&replaceEtatMajor&&!(
      manifest.scope==='ULM'&&
      manifest.source==='Trombinoscope Etat-Major ULM - nov2026.pdf'&&
      manifest.replaceSource==='Trombinoscope Etat-Major ULM - oct2026.pdf'
   ))throw Error('L’option de remplacement est réservée à l’archive État-major de novembre 2026.');
   const plan=planPhotoBatch(manifest,existing.agents||[],occupied,
    {replaceEtatMajor:mode==='import'&&replaceEtatMajor,currentSources:sourceMap});
   if(mode==='import'&&plan.replacements.length&&!confirm('Mettre à jour '+plan.replacements.length+' photo(s) de l’état-major provenant du document d’octobre 2026 ? Les photos des autres agences et les photos retouchées manuellement ne seront pas remplacées.')){
    setNotice('Aucun remplacement effectué.');
    return;
   }
   const verify=async(bytes:Uint8Array,expected:string)=>{
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hash.toLowerCase()!==expected.toLowerCase())throw Error('Empreinte photographique incorrecte. Import annulé.');
   };
   // Validate every relevant file before writing the first photograph.
   const prepared:{photo:ExtractedPhoto;agent:string;replace:boolean}[]=[];
   const intended=mode==='import'?[
     ...plan.uploads.map(item=>({...item,replace:false})),
     ...plan.replacements.map(item=>({...item,replace:true}))
   ]:[];
   for(const item of intended){
    const entry=archive.file(item.photo.path);
    if(!entry)throw Error('Image manquante dans l’archive.');
    const bytes=await entry.async('uint8array');
    if(bytes.length<4||bytes.length>200000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)
     throw Error('Photo JPEG invalide.');
    await verify(bytes,item.photo.sha256);
    prepared.push({agent:item.agent.id,replace:item.replace,photo:{name:item.photo.name,page:item.photo.page,certain:true,blob:new Blob([bytes],{type:'image/jpeg'})}});
   }
   const candidates:LocalPhotoReview[]=[];
   for(const item of plan.review){
    const entry=archive.file(item.photo.path);
    if(!entry)throw Error('Image à contrôler manquante dans l’archive.');
    const bytes=await entry.async('uint8array');
    if(bytes.length<4||bytes.length>200000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)
     throw Error('Photo à contrôler invalide.');
    await verify(bytes,item.photo.sha256);
    candidates.push({...item,id:item.photo.path,source:manifest.source,blob:new Blob([bytes],{type:'image/jpeg'})});
   }
   setReview(candidates);
   if(mode==='review'){
    setNotice(candidates.length+' photo(s) non attribuée(s) affichée(s) ci-dessous : '+plan.missing+' absente(s) du catalogue, '+plan.ambiguous+' correspondance(s) incertaine(s). Aucune modification dans la base.');
    return;
   }
   // Previously every portrait waited for the preceding network request:
   // a trombinoscope with 80+ replacements could appear frozen for minutes.
   // Use only three concurrent workers to speed up transfers without flooding
   // Supabase or losing individual progress/error information.
   let next=0,failed=0;
   const uploadErrors:string[]=[];
   const worker=async()=>{
    while(true){
     const index=next++;
     if(index>=prepared.length)return;
     const item=prepared[index];
     try{
      if(item.replace){
       const result=await replaceOldEtatMajorPhoto(item.photo,manifest.source,item.agent,manifest.replaceSource);
       if(!result.replaced)throw Error('Remplacement non confirmé.');
       replaced++;
      }else{
       const saved=await uploadPhoto(item.photo,manifest.source,item.agent);
       if(saved.agent_id===item.agent){assigned++;occupied.add(item.agent);}
       else{
        // A concurrent assignment must not create any waiting photos.
        await request('/api/photos',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:saved.id})});
        plan.existing++;
       }
      }
     }catch(e){
      failed++;
      if(uploadErrors.length<5)uploadErrors.push(item.photo.name+' : '+(e as Error).message);
     }finally{
      processed++;
      setBusy('Photos traitées : '+processed+' / '+prepared.length+
       ' · '+(assigned+replaced)+' enregistrée(s)'+(failed?' · '+failed+' échec(s)':''));
     }
    }
   };
   await Promise.all(Array.from({length:Math.min(3,prepared.length)},()=>worker()));
   setNotice(assigned+' nouvelle(s) photo(s) attribuée(s), '+replaced+' ancienne(s) photo(s) état-major remplacée(s), '+plan.existing+' déjà présente(s) conservée(s), '+plan.missing+' agent(s) absent(s) du catalogue, '+plan.ambiguous+' correspondance(s) à vérifier, '+plan.duplicate+' doublon(s). '+candidates.length+' portrait(s) à examiner ci-dessous.');
   if(failed)setError(failed+' photo(s) non enregistrée(s). Les autres ont été conservées. '+uploadErrors.join(' ; '));
  }catch(e){setError((e as Error).message+(assigned||replaced?' '+assigned+' nouvelle(s) photo(s) et '+replaced+' remplacement(s) déjà effectués.':''));}
  finally{await reload().catch(e=>setError(e.message));setBusy('');}
 };
 const linkReviewedPhoto=async(item:LocalPhotoReview,agent:string,replace:boolean)=>{
  let stagedId='',linked=false;
  try{
   const record=await uploadPhoto({blob:item.blob,name:item.photo.name,certain:false,page:item.photo.page},item.source,agent);
   stagedId=record.id;
   if(record.agent_id!==agent){
    // A concurrent/existing assignment is not replaced unless it was explicitly confirmed.
    await request('/api/photos',{method:'PATCH',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({id:stagedId,agent,replace})});
   }
   linked=true;
   setReview(current=>current.filter(entry=>entry.id!==item.id));
   await reload().catch(e=>setError('Photo rattachée, mais actualisation de la liste indisponible : '+e.message));
  }catch(e){
   if(stagedId&&!linked){
    // Do not leave a pending database photo if the attachment was rejected.
    try{await request('/api/photos',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:stagedId})});}
    catch{setError('Vérifier la photo temporaire après cet échec de rattachement.');}
   }
   throw e;
  }
 };
 const read=async(file?:File)=>{if(!file)return;setBusy('Préparation…');setError('');setNotice('');setScans([]);
  let assigned=0,already=0,ignored=0;
  try{
   const existing=await (await request('/api/photos')).json();
   const agents:PhotoAgent[]=existing.agents||[];
   const occupied=new Set<string>((existing.photos||[]).filter((p:any)=>p.agent_id).map((p:any)=>String(p.agent_id)));
   // Import only a portrait that can be linked to one known agent without ambiguity.
   // Unknown or already-photographed agents MUST NOT create unassigned database rows.
   await extractPortraits(file,setBusy,async photo=>{
    if(!photo.certain){ignored++;return;}
    const matches=matchPhotoName(photo.name,agents);
    if(matches.length!==1){ignored++;return;}
    const agent=matches[0].id;
    if(occupied.has(agent)){already++;return;}
    const saved=await uploadPhoto(photo,file.name,agent);
    if(saved.agent_id===agent){assigned++;occupied.add(agent);}
    else{
     // Concurrent assignment: the upload must not leave an orphaned photo.
     await request('/api/photos',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:saved.id})});
     already++;
    }
   },async()=>{/* A flattened page cannot be assigned automatically. */},agents);
   setNotice(assigned+' nouvelle(s) photo(s) directement rattachée(s), '+already+' agent(s) déjà photographié(s), '+ignored+' image(s) sans rapprochement fiable ignorée(s). Aucune fiche en attente créée.');
  }catch(e){setError((e as Error).message+(assigned?' '+assigned+' photo(s) enregistrée(s) avant cette erreur.':''));}
  finally{await reload().catch(e=>setError(e.message));setBusy('');}
 };
 return <section className="trombi-admin-photos" aria-label="Photos individuelles"><h3><ImagePlus size={18}/> Photos individuelles des agents</h3><div><section className="panel"><h2>Importer un trombinoscope</h2><p>PDF ou PPTX · 40 Mo maximum. Seules les photos avec nom complet identifié de façon unique sont enregistrées directement sur la fiche correspondante. Images non reconnues et doublons : ignorés sans création de fiche. Les photos déjà rattachées sont conservées.</p><label className="btn file-input">Consulter les photos non attribuées (.zip)<input type="file" accept=".zip,application/zip" disabled={!!busy||!data} onChange={e=>{void readArchive(e.target.files?.[0],'review');e.target.value='';}}/></label><p className="filter-note">Sélectionner à nouveau l’archive déjà utilisée : les portraits ignorés s’affichent pour contrôle, sans nouvel import et sans enregistrer de photos en attente.</p><label className="trombi-replace-option"><input type="checkbox" checked={replaceEtatMajor} disabled={!!busy} onChange={e=>setReplaceEtatMajor(e.target.checked)}/> Pour l’archive État-major novembre 2026 uniquement : remplacer les anciennes photos issues du trombinoscope d’octobre 2026 (confirmation avant modification)</label><label className="btn file-input">Importer une archive de portraits vérifiés (.zip)<input type="file" accept=".zip,application/zip" disabled={!!busy||!data} onChange={e=>{void readArchive(e.target.files?.[0]);e.target.value='';}}/></label><p className="filter-note">Archive préparée à partir du PDF : les photos originales sont rattachées directement aux agents identifiés de façon unique, sans recadrage ni remplacement automatique des photos existantes.</p><label className="btn primary file-input">Choisir un trombinoscope<input type="file" accept=".pdf,.pptx,.ppt" disabled={!!busy||!data} onChange={e=>{void read(e.target.files?.[0]);e.target.value='';}}/></label><p className="filter-note">Ancien format PPT : enregistrer en PPTX ou PDF. Les pages scannées ou les identités ambiguës ne sont pas enregistrées.</p>{busy&&<p role="status">{busy}</p>}{notice&&<p role="status">{notice}</p>}{error&&<p className="notice" role="alert">{error}</p>}{data&&<p>{data.photos.filter((p:any)=>p.agent_id).length} photo(s) attribuée(s)</p>}</section>{review.length>0&&<section className="panel"><h3>Photos non attribuées à vérifier ({review.length})</h3><p>Ces images restent uniquement dans cette session de consultation. Pour les revoir après avoir quitté la page, sélectionner à nouveau l’archive ZIP. Aucune fiche ni photo en attente n’est créée automatiquement.</p>{review.map(item=><UnassignedPhotoReview key={item.id} item={item} agents={data?.agents||[]} occupied={new Set<string>((data?.photos||[]).filter((p:any)=>p.agent_id).map((p:any)=>String(p.agent_id)))} onLink={(agent,replace)=>linkReviewedPhoto(item,agent,replace)} onIgnore={()=>setReview(current=>current.filter(entry=>entry.id!==item.id))}/>)}</section>}</div></section>;
}
