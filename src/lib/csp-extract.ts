import {installPDFByteMethods} from '../../public/pdf-byte-compat.js';
import {normalName} from './agents.ts';
import {deduplicateCsp,validDate} from './csp.ts';
import type {CspEvent,CspKind} from './csp.ts';
export type CspTextItem={str:string;x:number;y:number;width:number;height:number};
export type CspPage={page:number;width:number;height:number;items:CspTextItem[]};
export type CspPageReport={page:number;section:string;count:number;status:'read'|'empty'|'unsupported';note:string};
const iso=(v:string)=>{const m=v.match(/(\d{2})\/(\d{2})\/(\d{4})/);const d=m?`${m[3]}-${m[2]}-${m[1]}`:'';return validDate(d)?d:'';};
function lines(items:CspTextItem[]){const groups:{y:number;items:CspTextItem[]}[]=[];for(const it of items){if(!it.str)continue;let row=groups.find(r=>Math.abs(r.y-it.y)<2);if(!row){row={y:it.y,items:[]};groups.push(row);}row.items.push(it);}return groups.sort((a,b)=>b.y-a.y).map(r=>{r.items.sort((a,b)=>a.x-b.x);let text='',end=0;for(const i of r.items){text+=(text?(i.x-end>3?'   ':''):'')+i.str;end=i.x+i.width;}return {...r,text};});}
const textOf=(items:CspTextItem[])=>lines(items).map(r=>r.text.trim()).join(' ').replace(/\s+/g,' ').trim();
export function extractCspPages(pages:CspPage[]){
 const events:CspEvent[]=[],reports:CspPageReport[]=[];const meetingDates=new Set<string>();
 for(const pg of pages){
  const rows=lines(pg.items),all=rows.map(r=>r.text).join('\n'),n=normalName(all);const header=rows.filter(r=>r.y>pg.height*.8).map(r=>r.text).join(' ');const md=iso(header);if(md)meetingDates.add(md);
  let kind:CspKind|undefined;
  if(n.includes('NOMINATIONS AUX POSTES VACANTS'))kind='nomination';else if(n.includes('ADMISSION AU STAGE'))kind='admission';else if(n.includes('TITULARISATION'))kind='titularisation';else if(n.includes('MUTATION D OFFICE'))kind='mutation';else if(n.includes('RECLASSEMENT'))kind='reclassement';else if(n.includes('AVANCEMENT A TITRE POSTHUME'))kind='posthume';else if(n.includes('MESURES SALARIALES'))kind='mesure';else if(n.includes('AVANCEMENT AU CHOIX')&&!n.includes('LONGUE MALADIE'))kind='avancement';
  const report:CspPageReport={page:pg.page,section:kind||'Autre rubrique',count:0,status:'read',note:''};reports.push(report);
  if(!kind){report.status=n.includes('LONGUE MALADIE')?'empty':'unsupported';report.note=n.includes('LONGUE MALADIE')?'Information collective : aucun changement individuel importé.':'Mise en page ou rubrique non reconnue : à examiner.';continue;}
  const head=rows.find(r=>/NOM\s+PR[EÉ]NOM/.test(r.text));
  if(!head){report.status='unsupported';report.note='En-tête du tableau non reconnu.';continue;}
  const headerY=head.y;
  const cutoff=pg.width*(kind==='reclassement'?.35:kind==='avancement'?.32:kind==='mutation'?.18:kind==='nomination'?.255:.20);
  const content=pg.items.filter(i=>i.y<headerY-7&&i.y>pg.height*.07);
  const nameRows=lines(content.filter(i=>i.x+i.width/2<cutoff)).filter(r=>/^[A-ZÀ-Ÿ][A-ZÀ-Ÿ '\-’]+$/.test(r.text.replace(/\s+/g,' ').trim())&&r.text.trim().length>4&&!/NOM PRENOM|PAGE |C2 LIMITE|PAS DE CANDIDAT|LA SITUATION/.test(normalName(r.text)));
  if(!nameRows.length){report.status=/PAS DE CANDIDAT/.test(n)?'empty':'unsupported';report.note=report.status==='empty'?'Aucun candidat : aucun mouvement individuel.':'Aucune ligne nominative lisible.';continue;}
  const upper=rows.filter(r=>r.y>headerY+10&&r.y<pg.height*.75).flatMap(r=>r.items);
  // The vacancy's destination is in the upper panel; row localization is the origin.
  let destJob='',destAgency='',destTeam='',destM3e='',reference='';
  if(kind==='nomination'){
   const publication=rows.find(r=>/GF de publication/i.test(r.text));const left=textOf(upper.filter(i=>i.x>pg.width*.20&&i.x<pg.width*.405&&i.y>(publication?.y||0)+8));reference=left.match(/\d{2}-\d{5}\.\d{2}/)?.[0]||'';
   destJob=left.replace(/\d{2}-\d{5}\.\d{2}/,'').replace(/GF de publication.*$/i,'').replace(/\bH\/F\b/,'').trim();
   const dum=rows.find(r=>r.y>headerY&&r.y<pg.height*.75&&/\bDUM\s*:/.test(r.text)&&!/FSDUM|SDUM/.test(r.text));
   if(dum)destAgency=textOf(dum.items.filter(i=>i.x>pg.width*.44&&i.x<pg.width*.64)).replace(/^DUM\s*:\s*/,'').trim();
   const sdum=rows.find(r=>r.y>headerY&&/\bSDUM\s*:/.test(r.text)&&!/FSDUM/.test(r.text));if(sdum)destTeam=textOf(sdum.items.filter(i=>i.x>pg.width*.4&&i.x<pg.width*.70)).replace(/^SDUM\s*:\s*/,'').trim();
   const bounds=publication?.text.match(/GF de publication\s*:\s*([\d -]+)/i)?.[1].match(/\d+/g)?.map(Number)||[];if(bounds.length>1)destM3e=String(Math.min(...bounds)).padStart(2,'0')+String(Math.max(...bounds)).padStart(2,'0');
  }
  for(let ix=0;ix<nameRows.length;ix++){
   const anchor=nameRows[ix];const hi=ix?(nameRows[ix-1].y+anchor.y)/2:headerY-7,lo=ix+1<nameRows.length?(anchor.y+nameRows[ix+1].y)/2:pg.height*.07;
   const band=content.filter(i=>i.y<=hi&&i.y>lo);const text=textOf(band),name=anchor.text.replace(/\s+/g,' ').trim();const effective=iso(text);
   const e:CspEvent={id:'p'+pg.page+'r'+ix,name,kind,effective,page:pg.page,selected:true};
   const cell=(left:number,right:number)=>textOf(band.filter(i=>(i.x+i.width/2)/pg.width>=left&&(i.x+i.width/2)/pg.width<right));
   if(kind==='reclassement'||kind==='avancement'){
    e.agency=cell(kind==='reclassement'?.35:.32,kind==='reclassement'?.75:.70).replace(/^UNITE LOGISTIQUE MAINTENANCE\s*\/\s*/i,'');
    const val=cell(kind==='reclassement'?.75:.70,kind==='reclassement'?.835:.82).match(/\b\d+\b/);if(val){if(kind==='reclassement')e.gfDelta=+val[0];else e.nrSteps=+val[0];}
    if(!val)e.note='Nombre de GF/NR non reconnu : à renseigner.';
   }else if(kind==='mesure'||kind==='posthume'){
    e.nrSteps=Number(cell(.70,.84).match(/\b\d+\b/)?.[0])||(kind==='mesure'?1:undefined);
    // These location columns describe an observation, not a mutation; keep existing assignment.
   }else if(kind==='admission'){
    e.agency=cell(.20,.43).replace(/^UNITE LOGISTIQUE MAINTENANCE\s*\/\s*/i,'');e.team=cell(.43,.65).split('/')[0].trim();e.job=cell(.77,.91);e.gfAfter=Number(cell(.91,1).match(/\d+/)?.[0])||undefined;
   }else if(kind==='titularisation'){
    // Titularisation date is not an arrival date and does not alter GF/NR.
   }else if(kind==='mutation'){
    e.job=cell(.43,.56);e.location=cell(.70,.815);const loc=e.location.split('/').map(s=>s.trim());if(loc.length>=2&&normalName(loc[0]).includes('UNITE LOGISTIQUE MAINTENANCE')){e.agency=loc[1];e.team=loc[2]||'';}
    const gf=cell(.815,.895);e.gfDelta=/GF constant/i.test(gf)?0:Number(gf.match(/\d+/)?.[0])||0;
   }else if(kind==='nomination'){
    const aptitude=cell(.80,1);if(!/CANDIDATURE RETENUE/.test(normalName(aptitude))){e.selected=false;e.note='Candidature non retenue : aucun changement.';}
    e.reference=reference;e.job=destJob;e.agency=destAgency;e.team=destTeam;if(destM3e)e.m3e=destM3e;e.location=cell(.54,.80);
    e.gfDelta=/GF constant/i.test(aptitude)?0:Number(aptitude.match(/(\d+)\s*GF/i)?.[1])||undefined;
    e.note=[e.note,'Vérifier les situations avant/après ; le NR après doit être renseigné.'].filter(Boolean).join(' ');
   }
   if(!effective){e.selected=false;e.note=[e.note,'Date d’effet non reconnue : à renseigner.'].filter(Boolean).join(' ');}
   events.push(e);report.count++;
  }
 }
 const unique=deduplicateCsp(events);return {date:meetingDates.size===1?[...meetingDates][0]:'',events:unique,reports,rawCount:events.length,duplicates:events.length-unique.length};
}
export async function readCspPDF(file:File,progress:(value:string)=>void){
 if(!/\.pdf$/i.test(file.name)||file.size>20*1024*1024)throw Error('Choisir un PDF avec texte de moins de 20 Mo.');
 installPDFByteMethods();const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=import.meta.env.BASE_URL+'csp-pdf.worker.mjs';
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
 try{
  if(pdf.numPages>250)throw Error('Le relevé dépasse 250 pages.');
  const pages:CspPage[]=[];
  for(let page=1;page<=pdf.numPages;page++){
   progress(`Lecture locale du RD : page ${page} / ${pdf.numPages}`);const p=await pdf.getPage(page),v=p.getViewport({scale:1});const content=await p.getTextContent();
   const items=content.items.filter((i:any)=>typeof i.str==='string'&&Math.abs(i.transform[1])<.1&&Math.abs(i.transform[2])<.1).map((i:any)=>({str:i.str,x:i.transform[4],y:i.transform[5],width:i.width,height:i.height}));pages.push({page,width:v.width,height:v.height,items});p.cleanup();
  }
  const result=extractCspPages(pages);if(!result.events.length)throw Error('Aucune décision reconnue. Vérifier le format du RD ou utiliser un PDF avec texte.');return result;
 }finally{await pdf.destroy();}
}
