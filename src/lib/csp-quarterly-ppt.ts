import {getMovementColumns,type OptionalMovementColumn} from './csp-quarterly-columns';
import type {QuarterlyReport,QuarterlyRow} from './csp-quarterly-report';
import {kindLabels,kindOrder} from './csp-quarterly-report';
import {CSP_CHARTER_BG_DATA} from './csp-quarterly-background';
import {applyQuarterlyCover} from './csp-quarterly-cover';
import {CSP_LOGO_ULM_DATA} from './csp-quarterly-ulm-logo';

const P={bg:'F7F1D8',red:'D7221C',deep:'A61C1C',cream:'FBF8E9',peach:'F3D1BA',text:'202020',muted:'615F57',line:'BD8B7E'};
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
const quarterLabel=(year:number,q:number)=>['Janvier à mars','Avril à juin','Juillet à septembre','Octobre à décembre'][q-1]+' '+year;
const kindTitles:Record<string,string>={
 admission:'ADMISSIONS AU STAGE',titularisation:'TITULARISATIONS',
 mutation:"MUTATIONS D'OFFICE",reclassement:'RECLASSEMENTS',
 avancement:'AVANCEMENTS',mesure:'MESURES SALARIALES',
 nomination:'NOMINATIONS',posthume:'AVANCEMENTS A TITRE POSTHUME'
};
type Presentation={layout:string;author:string;title:string;subject:string;lang:string;theme:unknown;
 addSlide:(opts?:{masterName?:string})=>any;
 defineSlideMaster:(opts:{title:string;background:{color:string};objects:Array<{image:{data:string;x:number;y:number;w:number;h:number}}|{text:{text:string;options:Record<string,unknown>}} >})=>void;
 write:(opts:{outputType:'blob';compression?:boolean})=>Promise<Blob|ArrayBuffer|Uint8Array|string>};
/** Insérer les visuels comme objets de diapositive et non comme objets de masque :
 * ils deviennent sélectionnables et déplaçables dans PowerPoint.
 */
function addULMLogo(slide:any){
 slide.addImage({data:CSP_LOGO_ULM_DATA,x:11.58,y:.16,w:1.37,h:.62});
}
function coverPage(ppt:Presentation){
 // The original editable cover objects are inserted after PPTX serialization.
 return ppt.addSlide({masterName:'CSP_CGT_COUVERTURE'});
}
function newPage(ppt:Presentation,title:string,footer:string){
 const s=ppt.addSlide({masterName:'CSP_CGT_BEIGE'});s.background={color:P.bg};
 addULMLogo(s);
 s.addText(title,{x:.56,y:.32,w:10.5,h:.52,fontFace:'Arial',fontSize:21,bold:true,
  color:P.text,margin:0,breakLine:false});
 s.addShape('line',{x:.56,y:.94,w:12.15,h:0,line:{color:P.red,width:1.5}});
 s.addText(footer,{x:.56,y:7.15,w:11.85,h:.20,fontFace:'Arial',fontSize:8.2,bold:true,color:P.deep,margin:0});
 return s;
}
function bodyText(s:any,value:string,y:number,size=13,h=.46){
 s.addText(value,{x:.58,y,w:12.0,h,fontFace:'Arial',fontSize:size,color:P.text,margin:0,
  breakLine:false,valign:'mid'});
}
function table(s:any,rows:string[][],widths:number[],y=1.26,rowH:number|number[]=.46,fontSize=9){
 // Table native PPTX : aucune ligne n'est convertie en image.
 const heights=Array.isArray(rowH)?rowH:rows.map(()=>rowH);
 const cells=rows.map((r,i)=>r.map((v,c)=>({text:String(v??''),options:{
  fontSize:i===0?Math.max(8.1,fontSize-.3):fontSize,
  bold:i===0||c===0,color:i===0?'FFFFFF':P.text,
  fill:{color:i===0?P.red:i%2===0?P.peach:P.cream},
  margin:.04,valign:'mid',align:'left'
 }})));
 s.addTable(cells,{x:.37,y,w:widths.reduce((a,b)=>a+b,0),colW:widths,rowH:heights,
  border:{type:'solid',pt:.40,color:P.line},fontFace:'Arial',fontSize,
  autoFit:false,showHeader:false,margin:.04,valign:'mid'});
 return heights.reduce((n,h)=>n+h,0);
}
/** Dimensionnement prudent d'une cellule : une ligne supplémentaire accroît sa hauteur.
 * Évite l'ancienne limite fixe de 6 mouvements par diapositive.
 */
function numberOfLines(value:string,width:number,fontSize=8.9){
 const chars=Math.max(8,Math.floor(width*12.0*(9/fontSize)));
 return String(value).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/chars)),0);
}
function movementHeight(e:QuarterlyRow,columns:ReturnType<typeof getMovementColumns>){
 // Motifs et observations peuvent contenir plusieurs lignes : ne plus
 // plafonner les hauteurs à 0,82 in (le texte était alors tronqué).
 const lines=Math.max(...columns.map(c=>numberOfLines(c.value(e),c.width)));
 return Math.min(4.25,Math.max(.40,.12+lines*.165));
}
/** Petites rubriques côte à côte verticalement ; grands motifs découpés selon l'espace restant.
 * Retourne le nombre total de mouvements insérés (test d'exhaustivité).
 */
function addCompactMovements(ppt:Presentation,report:QuarterlyReport,foot:string,selected?:readonly OptionalMovementColumn[]){
 let slide:any=null;
 let y=1.20,sectionsOnPage=0,movementsOnPage:QuarterlyRow[]=[];
 let count=0;
 const LIMIT=6.87;
 const startPage=()=>{
  slide=newPage(ppt,'MOUVEMENTS CSP CADRES',foot);
  y=1.18;sectionsOnPage=0;movementsOnPage=[];
 };
 for(const kind of kindOrder){
  const values=report.rows.filter(r=>r.kind===kind);
  if(!values.length)continue;
  const columns=getMovementColumns(selected,kind);
  const movementCols=columns.map(c=>c.width);
  const movementHeaders=columns.map(c=>c.header);
  let offset=0;
  const title=kindTitles[kind]||kindLabels[kind].toUpperCase();
  while(offset<values.length){
   const remaining=values.slice(offset);
   const estimatedTotal=.37+.34+remaining.reduce((n,r)=>n+movementHeight(r,columns),0)+.13;
   if(!slide)startPage();
   // Évite les petites rubriques orphelines à la fin d'une page.
   if(sectionsOnPage>0&&remaining.length<=7&&y+estimatedTotal>LIMIT)startPage();
   if(sectionsOnPage>0&&remaining.length>7&&LIMIT-y<1.82)startPage();
   const heading=.30;
   const gapBefore=sectionsOnPage>0?.16:0;
   const header=.33;
   let free=LIMIT-y-heading-gapBefore-header-.11;
   if(free<.40){startPage();free=LIMIT-y-heading-header-.11;}
   const block:QuarterlyRow[]=[];
   const heights:number[]=[header];
   for(const item of remaining){
    const h=movementHeight(item,columns);
    if(h>free&&block.length)break;
    if(h>free&&!block.length)throw Error('Une ligne de mouvement dépasse la hauteur disponible.');
    block.push(item);heights.push(h);free-=h;
   }
   if(!block.length)throw Error('Pagination CSP impossible : aucune ligne sur la diapositive.');
   y+=gapBefore;
   const label=title+(offset>0?' — SUITE':'');
   slide.addText(label,{x:.48,y,w:11.8,h:heading,fontFace:'Arial',fontSize:15.2,bold:true,
    color:P.text,margin:0,breakLine:false});
   y+=heading;
   const tableRows=[movementHeaders,...block.map(r=>columns.map(c=>c.value(r)))];
   y+=table(slide,tableRows,movementCols,y,heights,8.9);
   y+=.11;
   count+=block.length;
   offset+=block.length;
   sectionsOnPage++;
   movementsOnPage.push(...block);

  }
 }
 return count;
}
function blocks<T>(xs:T[],n:number){const out:T[][]=[];for(let i=0;i<xs.length;i+=n)out.push(xs.slice(i,i+n));return out;}
export async function downloadQuarterlyPpt(report:QuarterlyReport,includeCandidates=true,selectedColumns?:readonly OptionalMovementColumn[]){
 if(!report.sources.length)throw Error('Aucun document CSP cadres pour ce trimestre.');
 // Load only when the administrator actively exports a deck.
 const module=await import('pptxgenjs');
 const PptxGenJS=module.default;
 const ppt=new PptxGenJS() as Presentation;
 ppt.layout='LAYOUT_WIDE';ppt.author='CGT ULM - Socioscope';
 ppt.title='Compte rendu CSP cadres T'+report.quarter+' '+report.year;
 ppt.subject='Synthèse des mouvements CSP cadres, issue du Socioscope';
 ppt.lang='fr-FR';ppt.theme={headFontFace:'Arial',bodyFontFace:'Arial',lang:'fr-FR'};
 // Les masques portent uniquement la texture. Les logos sont ajoutés aux slides :
 // ils sont alors déplaçables après export et ne font pas partie de la texture.
 ppt.defineSlideMaster({title:'CSP_CGT_BEIGE',background:{color:P.bg},
  objects:[{image:{data:CSP_CHARTER_BG_DATA,x:0,y:0,w:40/3,h:7.5}}]});
 ppt.defineSlideMaster({title:'CSP_CGT_COUVERTURE',background:{color:P.bg},
  objects:[{image:{data:CSP_CHARTER_BG_DATA,x:0,y:0,w:40/3,h:7.5}}]});
 const foot='CGT ULM  /  CSP CADRES  /  T'+report.quarter+' '+report.year;
 coverPage(ppt);
 let s=newPage(ppt,'PERIMETRE ET METHODE',foot);
 const lines=[
  'Période : '+quarterLabel(report.year,report.quarter)+', classement par date de séance.',
  report.meetingDates.length+' date(s) de séance ; '+report.sources.length+' document(s) CSP cadres.',
  report.rows.length+' mouvement(s) individuel(s) retenu(s).',
  report.candidates.length+' candidature(s) classée(s) non retenue(s).',
  'Chaque mouvement est affiché sur une ligne, même si un agent a plusieurs décisions.',
  'Les ODJ et RD d’une même décision sont rapprochés sans additionner deux fois le mouvement.',
  'Les dates d’effet peuvent être antérieures ou postérieures au trimestre.',
  'Une valeur absente est notée « — » ; * indique une valeur NR déduite, à contrôler.',
  'Les situations à vérifier sont isolées et les documents sources restent identifiables.'
 ];
 lines.forEach((line,i)=>bodyText(s,'•  '+line,1.26+i*.57,i<4?13:11.9,.44));
 s=newPage(ppt,'SYNTHESE DES MOUVEMENTS',foot);
 const months=Array.from({length:3},(_,i)=>(report.quarter-1)*3+i+1);
 const monthNames=['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'];
 const rows=[['MOUVEMENT',...months.map(m=>monthNames[m-1]),'TOTAL']];
 for(const kind of kindOrder){
  const subset=report.rows.filter(r=>r.kind===kind);
  rows.push([kindLabels[kind],...months.map(m=>String(subset.filter(r=>Number(r.meeting.slice(5,7))===m).length)),String(subset.length)]);
 }
 rows.push(['TOTAL',...months.map(m=>String(report.rows.filter(r=>Number(r.meeting.slice(5,7))===m).length)),String(report.rows.length)]);
 table(s,rows,[5.5,1.8,1.8,1.8,1.4],1.20,.43,10.5);
 bodyText(s,'Comptage par séance, et non par date d’effet.',6.60,10,.28);
 const exportedMovements=addCompactMovements(ppt,report,foot,selectedColumns);
 if(exportedMovements!==report.rows.length)
  throw Error('Export incomplet : '+exportedMovements+' / '+report.rows.length+' mouvements.');

 if(includeCandidates){
  const parts=blocks(report.candidates,7);
  if(!parts.length)parts.push([]);
  for(let p=0;p<parts.length;p++){
   s=newPage(ppt,'CANDIDATURES NON RETENUES'+(parts.length>1?' ('+(p+1)+'/'+parts.length+')':''),foot);
   if(!parts[p].length){bodyText(s,'Aucune candidature non retenue enregistrée sur la période.',1.55);}
   else{
    const cells=[['NOM PRÉNOM','AGENCE','POSTE / RÉFÉRENCE','DATE CSP','ISSUE','SOURCE']];
    for(const v of parts[p])cells.push([v.name,v.agency,(v.job||'—')+'\n'+(v.reference||''),
     date(v.meeting),v.reason,v.source]);
    table(s,cells,[2.35,1.76,3.35,1.29,2.43,1.17],1.22,.63,9.6);
   }
   bodyText(s,'Ces candidatures ne constituent pas des mouvements individuels validés.',6.65,10,.3);
  }
 }
 const checkRows=report.rows.filter(r=>r.notes);
 const alertLines=report.alerts;
 for(const [i,part] of blocks(alertLines.length?alertLines:['Aucun point particulier signalé.'],5).entries()){
  s=newPage(ppt,'CONTROLES DOCUMENTAIRES · ANOMALIES'+(alertLines.length>5?' ('+(i+1)+')':''),foot);
  part.forEach((x,k)=>s.addText('•  '+x,{x:.59,y:1.32+k*1.03,w:12.03,h:.92,
   fontFace:'Arial',fontSize:12,color:P.text,margin:.03,valign:'top',breakLine:false}));
 }
 // Every control is exported, with bounded text per slide to avoid truncation.
 for(const [index,row] of checkRows.entries()){
  const text=kindLabels[row.kind]+' · CSP '+date(row.meeting)+' · Effet '+date(row.effective)+'\nGF : '+row.gfBefore+' / '+row.gfAfter+' · NR : '+row.nrBefore+' / '+row.nrAfter+'\n\n'+row.notes;
  const parts=text.match(/[\s\S]{1,800}/g)||[''];
  for(const [partIndex,part] of parts.entries()){
   s=newPage(ppt,'CONTROLE '+(index+1)+' / '+checkRows.length+(parts.length>1?' · '+(partIndex+1)+' / '+parts.length:''),foot);
   s.addText(row.name,{x:.59,y:1.2,w:12.03,h:.6,fontFace:'Arial',fontSize:18,bold:true,color:P.text,margin:0});
   s.addText(part,{x:.59,y:1.95,w:12.03,h:4.85,fontFace:'Arial',fontSize:13,color:P.text,margin:0,valign:'top',breakLine:false});
  }
 }
 // Always include the documentary audit of excluded movements, even when
 // there are zero exclusions, so the reader can confirm the check was performed.
 // This does not modify any CSP decision or agent projection.
 if(!report.previouslyReported?.length){
  s=newPage(ppt,'CONTROLES DOCUMENTAIRES · EXCLUSIONS',foot);
  bodyText(s,'Exclusions : 0 mouvement.',1.50,15,.40);
  bodyText(s,'Aucune décision déjà présentée lors d’une CSP antérieure n’a été détectée pour ce trimestre.',2.14,11.5,.75);
  bodyText(s,'Ce contrôle est distinct des anomalies documentaires et ne modifie aucune situation individuelle.',3.10,10.5,.60);
 }
 // Audit trail for movements suppressed because an earlier CSP already
 // presented the same decision. The suppressed movements are not exported as
 // new movements, but their rationale remains readable in the PowerPoint.
 if(report.previouslyReported?.length){
  for(const [pageIndex,part] of blocks(report.previouslyReported,3).entries()){
   s=newPage(ppt,'CONTROLES DOCUMENTAIRES · EXCLUSIONS'+(report.previouslyReported.length>3?' ('+(pageIndex+1)+')':''),foot);
   part.forEach((item,i)=>{
    const y=1.18+i*1.83;
    const label=item.name+' · '+(kindLabels[item.kind]||item.kind)+' · Effet '+date(item.effective);
    const reason=item.effectOutsideOriginalQuarter
     ?'Déjà présenté en CSP antérieure ; date d’effet sur un autre trimestre.'
     :'Déjà présenté en CSP antérieure ; même décision.';
    s.addText(label,{x:.60,y,w:11.95,h:.37,fontFace:'Arial',fontSize:12.2,bold:true,color:P.deep,margin:0});
    s.addText('CSP actuelle : '+date(item.meeting)+' · CSP initiale : '+date(item.originalMeeting)+'\n'+reason,
     {x:.60,y:y+.41,w:11.95,h:.48,fontFace:'Arial',fontSize:10.2,color:P.text,margin:0,breakLine:false});
    s.addText('Actuel : '+item.currentDocument+'\nOrigine : '+item.originalDocument,
     {x:.60,y:y+.95,w:11.95,h:.75,fontFace:'Arial',fontSize:9,color:P.muted,margin:0,valign:'top',breakLine:false});
   });
  }
 }
 const sources=blocks(report.sources,6);
 for(let i=0;i<sources.length;i++){
  s=newPage(ppt,'DOCUMENTS DE REFERENCE ('+(i+1)+'/'+sources.length+')',foot);
  const cells=[['REPÈRE','CSP','TYPE / STATUT','DOCUMENT ORIGINAL']];
  for(const d of sources[i])cells.push([d.ref,date(d.date),
   d.type+(d.status==='validated'?' validé':d.automaticallyValidated?' confirmé automatiquement':d.confirmedByRDForReport?' confirmé par RD (CR)':' à vérifier'),d.name]);
  table(s,cells,[.95,1.55,2.15,7.70],1.22,.72,9.5);
 }
 const file='CR_CSP_Cadres_T'+report.quarter+'_'+report.year+'_Tableaux_modifiables.pptx';
 // Create the complete binary before starting the browser download.
 // This makes generation errors visible and avoids relying on the library's download heuristic.
 const generated=await ppt.write({outputType:'blob',compression:true});
 const bytes=await applyQuarterlyCover(generated,report.year,report.quarter);
 const mime='application/vnd.openxmlformats-officedocument.presentationml.presentation';
 // Rewrap even an existing Blob: the PPTX library may label it application/zip.
 // Android must receive the official PowerPoint MIME type to avoid ZIP extraction.
 const blob=new Blob([bytes as BlobPart],{type:mime});
 if(blob.size<2500)throw Error('Le fichier PowerPoint produit est incomplet. Aucun téléchargement lancé.');
 const link=URL.createObjectURL(blob);
 try{
  const anchor=document.createElement('a');
  anchor.href=link;anchor.download=file;anchor.style.display='none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
 }finally{
  // Keep the blob URL alive long enough for mobile browsers to retrieve the complete file.
  setTimeout(()=>URL.revokeObjectURL(link),60000);
 }
 return file;
}