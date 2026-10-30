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
// Compact mandate/volunteer tables carry their common effective date in the title.
// A count under « Nombre de NR » is an increment; it is never an absolute NR.
export function extractBeneficiaryAdvancements(pg:CspPage,report:CspPageReport):CspEvent[]|undefined{
 let head=pg.items.find(i=>/^BENEFICIAIRES?(?: POTENTIELS?)?$/.test(normalName(i.str)));
 if(!head)for(const row of rows(pg.items)){
  for(let i=0;i<row.items.length&&!head;i++){let joined='';for(let j=i;j<row.items.length;j++){
   joined+=normalName(row.items[j].str).replace(/\s/g,'');if(!'BENEFICIAIRESPOTENTIELS'.startsWith(joined))break;
   if(/^BENEFICIAIRES?(?:POTENTIELS?)?$/.test(joined)){const first=row.items[i],last=row.items[j];head={...first,str:'BENEFICIAIRES',width:last.x+last.width-first.x};break;}
  }}
 }
 if(!head)return undefined;
 const headerItems=pg.items.filter(i=>Math.abs(i.y-head.y)<=22&&i.x>head.x+head.width);
 const nrTitle=headerItems.find(i=>normalName(i.str)==='NOMBRE');
 const nrParts=nrTitle?headerItems.filter(i=>Math.abs((i.x+i.width/2)-(nrTitle.x+nrTitle.width/2))<35):[];
 const heading=normalName(rows(nrParts).map(r=>r.text).join(' ')).replace(/\s/g,'');
 if(!nrTitle||!/(?:NOMBRE|NB)(?:DE)?NR(?:ACCORDE)?/.test(heading)){report.status='unsupported';report.note='Rubrique Avancement reconnue : colonne « Nombre de NR accordé » à identifier.';return [];}
 const gfTitle=headerItems.find(i=>normalName(i.str)==='GF');
 const newNrTitle=headerItems.find(i=>normalName(i.str)==='NOUVEAU');
 const oldNrTitle=headerItems.find(i=>normalName(i.str)==='NR'&&i.x<(nrTitle?.x||0));
 if(!gfTitle||!newNrTitle||!oldNrTitle){report.status='unsupported';report.note='Colonnes GF, ancien NR ou nouveau NR non identifiées.';return [];}

 const effective=advancementTitleDate(rows(pg.items.filter(i=>i.y>head.y+5)).map(r=>r.text).join(' '));
 if(!effective){report.status='unsupported';report.note='Tableau Bénéficiaires / Nombre de NR reconnu : date d’effet commune absente ou contradictoire dans le titre. La date de CSP ne remplace pas la date d’effet.';return [];}
 const mid=(i:CspTextItem)=>i.x+i.width/2;
 const cut=(mid(head)+mid(gfTitle))/2;
 const nrLeft=(mid(nrTitle)+mid(headerItems.find(i=>normalName(i.str)==='CUMUL')||nrTitle))/2;
 const nrRight=(mid(nrTitle)+mid(newNrTitle))/2;
 const bottomHeader=Math.min(head.y,...nrParts.map(i=>i.y));
 const content=pg.items.filter(i=>i.y<bottomHeader-7&&i.y>pg.height*.07);
 const nrItems=content.filter(i=>mid(i)>=nrLeft&&mid(i)<nrRight);

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
  const near=(title:CspTextItem)=>{const v=content.filter(i=>Math.abs(i.y-r.y)<12&&Math.abs(mid(i)-mid(title))<24&&/^\\d{1,3}$/.test(i.str.trim()));return v.length===1?Number(v[0].str):undefined;};
  const gf=near(gfTitle),before=near(oldNrTitle),after=near(newNrTitle);
  if(count===0&&before!==undefined&&after===before)continue; // No NR gained: information only.
  const mismatch=valid&&before!==undefined&&after!==undefined&&after!==before+5*count;
  events.push({id:`p${pg.page}b${ix}`,name:r.text.trim(),kind:'avancement',effective,page:pg.page,selected:true,...(gf!==undefined?{gfBefore:gf}:{}),...(before!==undefined?{nrBefore:before}:{}),...(after!==undefined?{nrAfter:after}:{}),...(valid?{nrSteps:count}:{}),...(!valid||mismatch?{extractionIssue:mismatch?'Nombre de NR accordé et différence avant/après contradictoires. Vérifier cette ligne.':'Avancement reconnu : nombre de NR absent, illisible ou hors limites. Vérifier cette ligne.'}:{})});
 }
 report.count=events.length;report.status=events.length?'read':'unsupported';report.note=events.length?'Tableau Bénéficiaires / Nombre de NR reconnu ; date d’effet commune '+effective+'.'+(events.some(e=>e.extractionIssue)?' Certains nombres de NR restent à vérifier.':''):'Tableau d’avancement reconnu, aucune ligne nominative lisible.';
 return events;
}
