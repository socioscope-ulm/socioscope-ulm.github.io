import {unheadedAvancements} from './csp-unheaded-avancement.ts';
import {cspNameHeader} from './csp-table-header.ts';
import {normalName} from './agents.ts';
import {validDate} from './csp.ts';
import type {CspEvent,CspKind} from './csp.ts';
import type {CspPage,CspPageReport,CspTextItem} from './csp-extract.ts';

type Column={label:string;center:number;left:number;right:number};
const center=(i:CspTextItem)=>i.x+i.width/2;
const text=(items:CspTextItem[])=>items.filter(i=>i.str.trim()).sort((a,b)=>Math.abs(a.y-b.y)<2?a.x-b.x:b.y-a.y).map(i=>i.str.trim()).join(' ').replace(/\s+/g,' ').trim();
const date=(v:string)=>{const m=v.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);const d=m?`${m[3]}-${m[2]}-${m[1]}`:'';return validDate(d)?d:'';};
const cleanAgency=(v:string)=>v.replace(/^UNITE LOGISTIQUE MAINTENANCE\s*\/\s*/i,'').replace(/-\s+/g,'-').trim();

function crTable(pg:CspPage){
 const found=cspNameHeader(pg.items);if(!found)return undefined;const {head,members}=found;
 const header=[...pg.items.filter(i=>!members.includes(i)&&i.str.trim()&&i.y>=Math.min(...members.map(m=>m.y))-12&&i.y<=Math.max(...members.map(m=>m.y))+12),head];
 const groups:{center:number;items:CspTextItem[]}[]=[];
 for(const i of header){let g=groups.find(g=>Math.abs(g.center-center(i))<5&&!g.items.some(j=>Math.abs(j.y-i.y)<2));if(!g){g={center:center(i),items:[]};groups.push(g);}g.items.push(i);}
 const columns:Column[]=groups.sort((a,b)=>a.center-b.center).map((g,ix,all)=>({label:normalName(text(g.items)),center:g.center,left:ix?(all[ix-1].center+g.center)/2:0,right:ix+1<all.length?(g.center+all[ix+1].center)/2:pg.width}));
 return {head,header,columns};
}

// ODJ tables print absolute situations, whereas the RD tables print increments.
// Locate columns by their headers instead of reusing the RD's fixed positions.
export function extractCrPage(pg:CspPage,kind:CspKind,report:CspPageReport):CspEvent[]{
 const table=crTable(pg);if(!table){if(kind==='avancement')return unheadedAvancements(pg,report);report.status='unsupported';report.note='En-tête du tableau non reconnu.';return [];}
 const {head,header,columns}=table;
 const find=(pattern:RegExp,last=false)=>{const found=columns.filter(c=>pattern.test(c.label));return last?found.at(-1):found[0];};
 const nameCol=find(/^NOM PRENOM$/),dateCol=find(kind==='admission'?/^DATE DEBUT STAGE$/:kind==='titularisation'?/^DATE TITULARISATION$/:/^DATE D EFFET$/);
 const beforeGF=find(/^ANCIEN GF$/)||(kind==='mutation'?find(/^GF$/):undefined),afterGF=find(/^NOUVEAU GF$/)||(kind==='admission'||kind==='mutation'?find(/^GF$/,true):undefined);
 const beforeNR=find(/^ANCIEN NR$/)||(kind==='mutation'?find(/^NR$/):undefined),afterNR=find(/^NOUVEAU NR$/)||(['admission','mutation'].includes(kind)?find(/^NR$/,true):undefined);
 const constantGF=find(/^GF$/);
 const inColumn=(i:CspTextItem,c?:Column)=>!!c&&center(i)>=c.left&&center(i)<c.right;
 const content=pg.items.filter(i=>i.str.trim()&&i.y<Math.min(...header.map(i=>i.y))-7&&i.y>pg.height*.07);
 const numeric=kind==='titularisation'?find(/^NR$/):afterNR||beforeNR||afterGF||beforeGF;
 // Numeric cells have one baseline per person, even when their name wraps.
 const anchors=content.filter(i=>inColumn(i,numeric)&&/^\d{1,3}$/.test(i.str.trim())).map(i=>i.y);
 if(dateCol)for(const i of content.filter(i=>inColumn(i,dateCol)&&date(i.str)))if(!anchors.some(y=>Math.abs(y-i.y)<2))anchors.push(i.y);
 if(!anchors.length)anchors.push(...content.filter(i=>inColumn(i,nameCol)).map(i=>i.y));
 const ys=[...new Set(anchors)].sort((a,b)=>b-a),events:CspEvent[]=[];
 if(!nameCol||!dateCol||!ys.length){report.status='unsupported';report.note='Colonnes ou lignes de l’ODJ non reconnues : aucune décision appliquée.';return [];}
 for(let ix=0;ix<ys.length;ix++){
  const hi=ix?(ys[ix-1]+ys[ix])/2:head.y-12,lo=ix+1<ys.length?(ys[ix]+ys[ix+1])/2:pg.height*.07;
  const band=content.filter(i=>i.y<hi&&i.y>lo),cell=(c?:Column)=>text(band.filter(i=>inColumn(i,c))),num=(c?:Column)=>{const v=cell(c);return /^\d{1,3}$/.test(v)?Number(v):undefined;};
  const name=cell(nameCol);if(!name||!/[A-ZÀ-Ÿ]/.test(name))continue;
  const e:CspEvent={id:`p${pg.page}r${ix}`,name,kind,effective:date(cell(dateCol)),page:pg.page,selected:true};
  const issues:string[]=[];
  const readNumber=(column:Column|undefined,key:'gfBefore'|'gfAfter'|'nrBefore'|'nrAfter')=>{const n=num(column);if(n!==undefined&&n>=1&&n<=(key.startsWith('gf')?30:999))e[key]=n;else issues.push(`${key.startsWith('gf')?'GF':'NR'} ${key.endsWith('Before')?'avant':'après'} absent ou illisible`);};
  if(kind==='reclassement'){
   readNumber(beforeGF,'gfBefore');readNumber(afterGF,'gfAfter');readNumber(beforeNR,'nrBefore');readNumber(afterNR,'nrAfter');
   if(e.gfBefore!==undefined&&e.gfAfter!==undefined&&e.gfAfter>e.gfBefore&&e.gfAfter-e.gfBefore<=10)e.gfDelta=e.gfAfter-e.gfBefore;else issues.push('progression GF à vérifier');
   if(e.gfDelta!==undefined&&e.nrBefore!==undefined&&e.nrAfter!==e.nrBefore+10*e.gfDelta)issues.push('progression NR différente de la règle de reclassement');
  }else if(['avancement','posthume','mesure'].includes(kind)){
   readNumber(beforeNR,'nrBefore');readNumber(afterNR,'nrAfter');
   const gf=num(constantGF);if(gf!==undefined&&gf>=1&&gf<=30)e.gfBefore=gf;else issues.push('GF absent ou illisible');
   if(e.nrBefore!==undefined&&e.nrAfter!==undefined){const steps=(e.nrAfter-e.nrBefore)/5;if(Number.isInteger(steps)&&steps>0&&steps<=20)e.nrSteps=steps;else issues.push('progression NR à vérifier');}
  }else if(kind==='admission'){
   readNumber(afterGF,'gfAfter');readNumber(afterNR,'nrAfter');
   e.agency=cleanAgency(cell(find(/^UM DUM$/)));e.team=cell(find(/^SDUM FSDUM/)).split('/')[0].trim();e.job=cell(find(/^EMPLOI$/));
   if(!e.agency||!e.job)issues.push('agence ou emploi d’admission absent');
  }else if(kind==='mutation'){
   readNumber(beforeGF,'gfBefore');readNumber(afterGF,'gfAfter');readNumber(beforeNR,'nrBefore');readNumber(afterNR,'nrAfter');
   e.gfDelta=0;e.job=cell(find(/^NOUVEL EMPLOI$/));e.location=cell(find(/^LOCALISATION$/,true));
   const parts=cleanAgency(e.location).split('/').map(s=>s.trim());e.agency=parts[0];e.team=parts[1]||'';
   if(e.gfBefore!==e.gfAfter||e.nrBefore!==e.nrAfter)issues.push('mutation d’office avec changement de GF ou de NR');
   if(!e.agency||!e.job)issues.push('destination de la mutation absente');
  }
  if(!e.effective){e.selected=false;issues.push('date d’effet absente ou invalide');}
  if(issues.length)e.extractionIssue=issues.join(' ; ')+'. Vérifier le document et corriger la ligne.';
  events.push(e);
 }
 report.count=events.length;if(!events.length){report.status='unsupported';report.note='Aucune ligne nominative lisible.';}
 else if(events.some(e=>e.extractionIssue))report.note='Certaines lignes nécessitent une vérification de lecture.';
 return events;
}

// A candidature records a person's observed situation, never a nomination.
export function extractCrCandidates(pg:CspPage,report:CspPageReport):CspEvent[]{
 const table=crTable(pg);if(!table){report.status='unsupported';report.note='En-tête des candidatures non reconnu.';return [];}
 const {head,header,columns}=table;
 const find=(label:string)=>columns.find(c=>c.label===label);
 const inColumn=(i:CspTextItem,c?:Column)=>!!c&&center(i)>=c.left&&center(i)<c.right;
 const top=pg.items.filter(i=>i.y>head.y+15&&i.str.trim());
 const valueAfter=(label:string)=>{const h=top.find(i=>normalName(i.str)===label);return h?text(top.filter(i=>Math.abs(i.y-h.y)<2&&i.x>=h.x+h.width-1)):'';};
 const ref=text(top).match(/\b\d{2}-\d{5}\.\d{2}\b/)?.[0]||'';
 const emploi=top.find(i=>normalName(i.str)==='EMPLOI'),publication=top.find(i=>/publication\s*:/i.test(i.str)&&!/Date/i.test(i.str));
 const datePublication=top.find(i=>/Date de publication/i.test(i.str));
 const job=emploi?text(top.filter(i=>i.x>=emploi.x+emploi.width-1&&i.x<(publication?.x||pg.width*.38)&&i.y<emploi.y+20&&i.y>(datePublication?.y??emploi.y-25)+8)).replace(/\bH\/F\b/g,'').trim():'';
 const agency=valueAfter('DUM'),team=valueAfter('SDUM');
 const gfRange=valueAfter('GF DE PUBLICATION').match(/^\s*\d+(?:\s*-\s*\d+)+/)?.[0].match(/\d+/g)?.map(Number)||[];
 const m3e=gfRange.length>1?String(Math.min(...gfRange)).padStart(2,'0')+String(Math.max(...gfRange)).padStart(2,'0'):undefined;
 const nameCol=find('NOM PRENOM'),gfCol=find('GF'),nrCol=find('NR');
 const content=pg.items.filter(i=>i.str.trim()&&i.y<Math.min(...header.map(i=>i.y))-7&&i.y>pg.height*.07);
 const anchors=content.filter(i=>inColumn(i,nrCol)&&/^\d{1,3}$/.test(i.str.trim())).map(i=>i.y);
 if(!anchors.length)anchors.push(...content.filter(i=>inColumn(i,nameCol)).map(i=>i.y));
 const ys=[...new Set(anchors)].sort((a,b)=>b-a),events:CspEvent[]=[];
 for(let ix=0;ix<ys.length;ix++){
  const hi=ix?(ys[ix-1]+ys[ix])/2:head.y-12,lo=ix+1<ys.length?(ys[ix]+ys[ix+1])/2:pg.height*.07;
  const band=content.filter(i=>i.y<hi&&i.y>lo),cell=(c?:Column)=>text(band.filter(i=>inColumn(i,c)));
  const name=cell(nameCol);if(!name||/PAS DE CANDIDAT/.test(normalName(name)))continue;
  const gf=cell(gfCol),nr=cell(nrCol);
  events.push({id:`p${pg.page}c${ix}`,name,kind:'nomination',candidacy:true,effective:'',page:pg.page,selected:true,reference:ref,job,agency,team,m3e,...(/^\d{1,2}$/.test(gf)&&+gf>0&&+gf<=30?{gfBefore:+gf}:{}),...(/^\d{1,3}$/.test(nr)&&+nr>0?{nrBefore:+nr}:{}),note:'Candidature de l’ODJ : en attente de confirmation par un RD.'});
 }
 report.section='Candidatures';report.count=events.length;report.status=events.length?'read':text(pg.items).includes('PAS DE CANDIDAT')?'empty':'unsupported';
 report.note=events.length?'Candidatures en attente du RD : aucune prise de poste appliquée.':report.status==='empty'?'Aucun candidat : aucun mouvement individuel.':'Aucune candidature lisible : vérifier le PDF.';
 return events;
}
