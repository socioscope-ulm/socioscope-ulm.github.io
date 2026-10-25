export const SUPABASE_URL='https://ovssjbldmsowzojeftyr.supabase.co';
export const PUBLISHABLE_KEY='sb_publishable_MPUC7IRc6CGjK8nUnMIikg_FlYu_XwD';
export const API_URL=SUPABASE_URL+'/functions/v1/socioscope-api';
const originalFetch=window.fetch.bind(window);const key='socioscopeSession';
export let session:any;let refreshing:Promise<any>|undefined;
try{session=JSON.parse(sessionStorage.getItem(key)||localStorage.getItem(key)||'null');}catch{}
function save(value:any,remember=false){session=value;sessionStorage.removeItem(key);localStorage.removeItem(key);if(value)(remember?localStorage:sessionStorage).setItem(key,JSON.stringify(value));}
export async function auth(path:string,body?:any,method='POST',token?:string){const r=await originalFetch(SUPABASE_URL+'/auth/v1/'+path,{method,headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const b=await r.json().catch(()=>({}));if(!r.ok)throw Error(b.msg||b.error_description||b.message||'Connexion impossible.');return b;}
export async function login(email:string,password:string,remember:boolean){const s=await auth('token?grant_type=password',{email,password});save({...s,expires_at:Math.floor(Date.now()/1000)+s.expires_in},remember);}
export async function logout(){if(session)await auth('logout',undefined,'POST',session.access_token).catch(()=>{});save(null);window.location.replace(import.meta.env.BASE_URL);}
async function token(){if(!session)return '';if(session.expires_at<Date.now()/1000+60){if(!refreshing)refreshing=auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(s=>{save({...s,expires_at:Math.floor(Date.now()/1000)+s.expires_in},!!localStorage.getItem(key));return s;}).finally(()=>refreshing=undefined);await refreshing;}return session?.access_token||'';}
export async function apiFetch(path:string,options:RequestInit={}){const access=await token();const headers=new Headers(options.headers);headers.set('apikey',PUBLISHABLE_KEY);if(access)headers.set('authorization','Bearer '+access);const r=await originalFetch(API_URL+path,{...options,headers,cache:'no-store'});if(r.status===423){const body=await r.clone().json().catch(()=>null);if(body?.code==='CONSULTATION_SUSPENDED')window.dispatchEvent(new Event('socioscope-suspended'));}if(r.status===401){save(null);window.dispatchEvent(new Event('socioscope-expired'));}return r;}
window.fetch=async(input:RequestInfo|URL,options?:RequestInit)=>{if(typeof input==='string'&&(input.startsWith('/api/')||input.startsWith('/sources/')))return apiFetch(input,options);return originalFetch(input,options);};
export async function importAuthCallback(){const hash=new URLSearchParams(window.location.hash.slice(1));if(hash.has('error_description')){const message=hash.get('error_description')!;history.replaceState(null,'',location.pathname);throw Error(message);}const access=hash.get('access_token'),refresh=hash.get('refresh_token');if(access&&refresh){save({access_token:access,refresh_token:refresh,expires_at:Math.floor(Date.now()/1000)+Number(hash.get('expires_in')||3600)});const recovery=hash.get('type')==='recovery'||hash.get('type')==='invite';history.replaceState(null,'',location.pathname);return recovery;}return false;}
// Preserve the original filename when serving protected source documents.
// A blob: URL opened in a new tab has no filename, so browser "Save as"
// would otherwise produce an extensionless UUID.
function protectedDocumentFilename(response:Response,href:string){
 const disposition=response.headers.get('content-disposition')||'';
 const encoded=disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
 const legacy=disposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
 let name='';
 try{name=encoded?decodeURIComponent(encoded):legacy||'';}catch{name=legacy||'';}
 if(!name)name=decodeURIComponent(href.split(/[?#]/)[0].split('/').at(-1)||'document');
 name=name.replaceAll(String.fromCharCode(92),'/').split('/').at(-1)?.replace(/[\u0000-\u001f\u007f]/g,'').trim()||'document';
 if(!/\.[a-z0-9]{2,8}$/i.test(name)){
  const mime=(response.headers.get('content-type')||'').toLowerCase();
  const ext=mime.includes('pdf')?'.pdf':mime.includes('spreadsheetml')?'.xlsx':mime.includes('ms-excel')?'.xls':mime.includes('png')?'.png':mime.includes('jpeg')?'.jpg':mime.includes('csv')?'.csv':mime.includes('zip')?'.zip':href.toLowerCase().includes('.pdf')?'.pdf':'';
  name+=ext;
 }
 return name;
}
document.addEventListener('click',async event=>{
 const a=(event.target as Element)?.closest?.('a');if(!a)return;
 const href=a.getAttribute('href')||'';
 if(!href.startsWith('/sources/')&&!href.startsWith('/api/files/')&&!href.startsWith('/api/agents/files/')&&!href.startsWith('/api/payroll/files/'))return;
 event.preventDefault();
 try{
  const requestPath=href.split('#')[0];
  const response=await apiFetch(requestPath);
  if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'Téléchargement impossible.');}
  const filename=protectedDocumentFilename(response,href);
  const url=URL.createObjectURL(await response.blob());
  const link=document.createElement('a');
  link.href=url;link.download=filename;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),120000);
 }catch(e){alert((e as Error).message);}
});