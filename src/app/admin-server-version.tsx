import {useEffect,useState} from 'react';

// Rendered only in the administrator interface. Always request the live API
// version instead of relying solely on the session payload cached at login.
export default function AdminServerVersion({initialVersion}:{initialVersion?:number|null}){
 const [version,setVersion]=useState<number|null>(
  typeof initialVersion==='number'&&initialVersion>0?initialVersion:null
 );
 useEffect(()=>{
  if(typeof initialVersion==='number'&&initialVersion>0)setVersion(initialVersion);
 },[initialVersion]);
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{
   try{
    const res=await fetch('/api/session',{cache:'no-store'});
    if(!res.ok)return;
    const session=await res.json();
    if(active&&session.role==='admin'&&Number.isSafeInteger(session.serverVersion)&&session.serverVersion>0){
     setVersion(session.serverVersion);
    }
   }catch{
    // Keep the last correctly verified version during a transient outage.
   }
  };
  void refresh();
  const onFocus=()=>{void refresh();};
  window.addEventListener('focus',onFocus);
  return()=>{active=false;window.removeEventListener('focus',onFocus);};
 },[]);
 return <small className="server-version" aria-label="Version du serveur Supabase"
  title="Version réellement déployée sur Supabase">
  Version serveur {typeof version==='number'?'v'+version:'indisponible'}
 </small>;
}
