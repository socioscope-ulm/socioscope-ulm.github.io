import {normalName} from './agents.ts';
import {validDate} from './csp.ts';
import type {CspEvent} from './csp.ts';
import type {CspPage,CspPageReport,CspTextItem} from './csp-extract.ts';
function rows(items:CspTextItem[]){
 const groups:{y:number;items:CspTextItem[]}[]=[];
 for(const i of items){if(!i.str.trim())continue;let r=groups.find(r=>Math.abs(r.y-i.y)<2);if(!r){r={y:i.y,items:[]};groups.push(r);}r.items.push(i);}
 return groups.sort((a,b)=>b.y-a.y).map(r=>{let text='',end=0;for(const i of r.items.sort((a,b)=>a.x-b.x)){text+=(text&&i.x-end>3?' ':'')+i.str;end=i.x+i.width;}return {...r,text:text.replace(/\s+/g,' ').trim()};});
}
const months=['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE'];
export function advancementTitleDate(text:string){
 const n=normalName(text),start=n.search(/\bAVANCEMENTS? AU CHOIX\b/);if(start<0)return '';
 const title=n.slice(start),dates=new Set<string>();
 for(const m of title.matchAll(/\bAU\s+(\d{1,2})(?:\s*ER)?\s+(JANVIER|FEVRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOUT|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE)\s+(20\d{2})\b/g)){
  const d=`${m[3]}-${String(months.indexOf(m[2])+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(validDate(d))dates.add(d);
 }
 for(const m of title.matchAll(/\bAU\s+(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\b/g)){const d=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(validDate(d))dates.add(d);}
 return dates.size===1?[...dates][0]:'';
}

// The extended "Beneficiaires potentiels" layout has GF, original NR,
// awarded NR and resulting NR columns. It may continue over several pages.
function extractPotentialBeneficiaries(pg:CspPage,report:CspPageReport):CspEvent[]|undefined{
 const normalize=(s:string)=>normalName(s).replace(/\\s+/g,'');
 const headerRows=rows(pg.items);
 const head=pg.items.find(i=>/^BENEFICIAIRES? POTENTIELS?$/.test(normalName(i.str)))
  ||headerRows.flatMap(r=>r.items).find(i=>normalize(i.str)==='BENEFICIAIRESPOTENTIELS');
 if(!head)return undefined;
 const center=(i:CspTextItem)=>i.x+i.width/2;
 const nearHeader=pg.items.filter(i=>Math.abs(i.y-head.y)<=25&&center(i)>center(head));
 const gf=nearHeader.find(i=>normalize(i.str)==='GF');
 const count=nearHeader.find(i=>normalize(i.str)==='NOMBRE');
 const newNr=nearHeader.find(i=>normalize(i.str)==='NOUVEAU');
 const oldNr=nearHeader.find(i=>normalize(i.str)==='NR'&&(!count||center(i)<center(count)));
 const cumul=nearHeader.find(i=>normalize(i.str)==='CUMUL');
 if(!gf||!count||!newNr||!oldNr||!cumul){report.status='unsupported';report.note='Tableau des bénéficiaires potentiels reconnu : colonnes GF/NR/nombre de NR à vérifier.';return [];}
 const nrHeader=nearHeader.filter(i=>Math.abs(center(i)-center(count))<35);
 if(!/NOMBRE(?:DE)?NR(?:ACCORDE)?/.test(normalize(rows(nrHeader).map(r=>r.text).join(' ')))){
  report.status='unsupported';report.note='Colonne Nombre de NR accordé non reconnue.';return [];
 }
 const effective=advancementTitleDate(headerRows.filter(r=>r.y>head.y+5).map(r=>r.text).join(' '));
 if(!effective){report.status='unsupported';report.note='Date d’effet commune absente ou contradictoire dans le titre des avancements.';return [];}
 const nameLimit=(center(head)+center(gf))/2;
 const countLeft=(center(cumul)+center(count))/2,countRight=(center(count)+center(newNr))/2;
 const content=pg.items.filter(i=>i.y<Math.min(head.y,...nrHeader.map(i=>i.y))-7&&i.y>pg.height*.07);
 const names=rows(content.filter(i=>center(i)<nameLimit)).filter(r=>/^[\\p{L}][\\p{L} '\\-’]+$/u.test(r.text)&&r.text.trim().split(/\\s+/).length>=2);
 const events:CspEvent[]=[];
 for(let ix=0;ix<names.length;ix++){
  const row=names[ix],hi=ix?(names[ix-1].y+row.y)/2:head.y-7;
  const lo=ix+1<names.length?(row.y+names[ix+1].y)/2:pg.height*.07;
  const band=content.filter(i=>i.y<hi&&i.y>lo);
  const value=(left:number,right:number)=>{const parts=band.filter(i=>center(i)>=left&&center(i)<right&&/^\\d{1,3}$/.test(i.str.trim()));return parts.length===1?Number(parts[0].str):undefined;};
  const awarded=value(countLeft,countRight);
  const firstGF=value((center(head)+center(gf))/2,(center(gf)+center(oldNr))/2);
  const before=value((center(gf)+center(oldNr))/2,(center(oldNr)+center(cumul))/2);
  const after=value((center(count)+center(newNr))/2,(center(newNr)+center(nearHeader.find(i=>normalize(i.str)==='REPORT')||newNr))/2);
  if(awarded===0&&before!==undefined&&after===before)continue;
  const valid=awarded!==undefined&&awarded>=1&&awarded<=20;
  const mismatch=valid&&before!==undefined&&after!==undefined&&after!==before+awarded*5;
  events.push({id:`p${pg.page}b${ix}`,name:row.text.trim(),kind:'avancement',effective,page:pg.page,selected:true,
   ...(firstGF!==undefined?{gfBefore:firstGF}:{}),...(before!==undefined?{nrBefore:before}:{}),
   ...(after!==undefined?{nrAfter:after}:{}),...(valid?{nrSteps:awarded}:{}),
   ...(!valid||mismatch?{extractionIssue:mismatch?'Nombre de NR accordé incompatible avec les NR avant/après. Vérifier.':'Nombre de NR accordé absent ou illisible. Vérifier.'}:{})});
 }
 report.count=events.length;report.status=events.some(e=>e.extractionIssue)?'unsupported':'read';
 report.note=events.some(e=>e.extractionIssue)?'Avancements repérés, certaines lignes à vérifier.':'Tableau des bénéficiaires potentiels analysé : les lignes à zéro NR sont sans impact.';
 return events;
}

// Compact mandate/volunteer tables carry their common effective date in the title.
// A count under « Nombre de NR » is an increment; it is never an absolute NR.
export function extractBeneficiaryAdvancements(pg:CspPage,report:CspPageReport):CspEvent[]|undefined{
 const potential=extractPotentialBeneficiaries(pg,report);if(potential!==undefined)return potential;
 let head=pg.items.find(i=>/^BENEFICIAIRES?$/.test(normalName(i.str)));
 if(!head)for(const row of rows(pg.items)){
  for(let i=0;i<row.items.length&&!head;i++){let joined='';for(let j=i;j<row.items.length;j++){
   joined+=normalName(row.items[j].str).replace(/\s/g,'');if(!'BENEFICIAIRES'.startsWith(joined))break;
   if(/^BENEFICIAIRES?$/.test(joined)){const first=row.items[i],last=row.items[j];head={...first,str:'BENEFICIAIRES',width:last.x+last.width-first.x};break;}
  }}
 }
 if(!head)return undefined;
 const nrHead=pg.items.filter(i=>Math.abs(i.y-head.y)<=20&&i.x>head.x+head.width&&/^[A-Z ]+$/.test(normalName(i.str)));
 const heading=normalName(rows(nrHead).map(r=>r.text).join(' '));
 if(!/(?:NOMBRE|NB)(?:DE)?NR/.test(heading.replace(/\s/g,''))){report.status='unsupported';report.note='Rubrique Avancement reconnue : colonne « Nombre de NR » à identifier.';return [];}
 const effective=advancementTitleDate(rows(pg.items.filter(i=>i.y>head.y+5)).map(r=>r.text).join(' '));
 if(!effective){report.status='unsupported';report.note='Tableau Bénéficiaires / Nombre de NR reconnu : date d’effet commune absente ou contradictoire dans le titre. La date de CSP ne remplace pas la date d’effet.';return [];}
 const nrCenter=(Math.min(...nrHead.map(i=>i.x))+Math.max(...nrHead.map(i=>i.x+i.width)))/2;
 const cut=(head.x+head.width/2+nrCenter)/2;
 const bottomHeader=Math.min(head.y,...nrHead.map(i=>i.y));
 const content=pg.items.filter(i=>i.y<bottomHeader-7&&i.y>pg.height*.07);
 const nrItems=content.filter(i=>i.x+i.width/2>=cut);
 const nameRows=rows(content.filter(i=>i.x+i.width/2<cut)).filter(r=>/^[\p{L}][\p{L} '\-’]+$/u.test(r.text.trim())&&!/^(?:PAGE|BENEFICIAIRE|NOMBRE|DATE)\b/.test(normalName(r.text)));
 const numericRows=rows(nrItems);
 const nearest=(y:number)=>numericRows.reduce((best,r,i)=>best<0||Math.abs(r.y-y)<Math.abs(numericRows[best].y-y)?i:best,-1);
 const names:typeof nameRows=[];
 for(const r of nameRows){
  const previous=names.at(-1),last=previous?Math.min(...previous.items.map(i=>i.y)):0,height=Math.max(8,...r.items.map(i=>i.height));
  const close=previous&&last-r.y>0&&last-r.y<=height*2.4;
  const fragment=previous&&(/[-‐‑]$/.test(previous.text)||previous.text.split(' ').length===1||r.text.split(' ').length===1);
  const n=nearest(r.y),p=previous?nearest(previous.y):-1;
  if(close&&fragment&&n>=0&&n===p&&Math.abs(numericRows[n].y-r.y)<=height*3){previous!.text+=/[-‐‑]$/.test(previous!.text)?r.text:' '+r.text;previous!.items.push(...r.items);}
  else names.push({...r,items:[...r.items]});
 }
 const events:CspEvent[]=[];
 for(let ix=0;ix<names.length;ix++){
  const r=names[ix],last=Math.min(...r.items.map(i=>i.y)),hi=ix?(Math.min(...names[ix-1].items.map(i=>i.y))+r.y)/2:bottomHeader-7,lo=ix+1<names.length?(last+names[ix+1].y)/2:pg.height*.07;
  const cell=rows(nrItems.filter(i=>i.y<hi&&i.y>lo)).map(r=>r.text).join(' ').trim();
  const parsed=cell.match(/^(\d{1,3})\s*(?:NR)?$/i),count=parsed?Number(parsed[1]):undefined;
  const valid=count!==undefined&&count>=1&&count<=20;
  events.push({id:`p${pg.page}b${ix}`,name:r.text.trim(),kind:'avancement',effective,page:pg.page,selected:true,...(valid?{nrSteps:count}:{extractionIssue:'Avancement reconnu : nombre de NR absent, illisible ou hors limites. Vérifier cette ligne.'})});
 }
 report.count=events.length;report.status=events.length?'read':'unsupported';report.note=events.length?'Tableau Bénéficiaires / Nombre de NR reconnu ; date d’effet commune '+effective+'.'+(events.some(e=>e.extractionIssue)?' Certains nombres de NR restent à vérifier.':''):'Tableau d’avancement reconnu, aucune ligne nominative lisible.';
 return events;
}
