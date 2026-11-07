import type {QuarterlyReport,QuarterlyRow} from './csp-quarterly-report';
import {kindLabels,kindOrder} from './csp-quarterly-report';

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
 addSlide:()=>any;write:(opts:{outputType:'blob';compression?:boolean})=>Promise<Blob|ArrayBuffer|Uint8Array|string>};
function newPage(ppt:Presentation,title:string,footer:string){
 const s=ppt.addSlide();s.background={color:P.bg};
 s.addText(title,{x:.56,y:.32,w:12,h:.52,fontFace:'Arial',fontSize:22,bold:true,
  color:P.text,margin:0,breakLine:false});
 s.addShape('line',{x:.56,y:.94,w:12.15,h:0,line:{color:P.red,width:1.5}});
 s.addText(footer,{x:.56,y:7.15,w:11.85,h:.20,fontFace:'Arial',fontSize:8.2,bold:true,color:P.deep,margin:0});
 return s;
}
function bodyText(s:any,value:string,y:number,size=13,h=.46){
 s.addText(value,{x:.58,y,w:12.0,h,fontFace:'Arial',fontSize:size,color:P.text,margin:0,
  breakLine:false,valign:'mid'});
}
function table(s:any,rows:string[][],widths:number[],y=1.26,rowH=.64,fontSize=10){
 // PowerPoint native table, not a screenshot. Keep 7 rows or fewer for compatibility.
 const cells=rows.map((r,i)=>r.map((v,c)=>({text:String(v??''),options:{
  fontSize:i===0?Math.max(8.3,fontSize-.4):fontSize,
  bold:i===0||c===0,color:i===0?'FFFFFF':P.text,
  fill:{color:i===0?P.red:i%2===0?P.peach:P.cream},
  margin:.065,valign:'mid',align:'left'
 }})));
 s.addTable(cells,{x:.37,y,w:widths.reduce((a,b)=>a+b,0),colW:widths,rowH,
  border:{type:'solid',pt:.45,color:P.line},fontFace:'Arial',fontSize,
  autoFit:false,showHeader:false,margin:.065,valign:'mid'});
}
function blocks<T>(xs:T[],n:number){const out:T[][]=[];for(let i=0;i<xs.length;i+=n)out.push(xs.slice(i,i+n));return out;}
export async function downloadQuarterlyPpt(report:QuarterlyReport,includeCandidates=true){
 if(!report.sources.length)throw Error('Aucun document CSP cadres pour ce trimestre.');
 // Load only when the administrator actively exports a deck.
 const module=await import('pptxgenjs');
 const PptxGenJS=module.default;
 const ppt=new PptxGenJS() as Presentation;
 ppt.layout='LAYOUT_WIDE';ppt.author='CGT ULM - Socioscope';
 ppt.title='Compte rendu CSP cadres T'+report.quarter+' '+report.year;
 ppt.subject='Synthèse des mouvements CSP cadres, issue du Socioscope';
 ppt.lang='fr-FR';ppt.theme={headFontFace:'Arial',bodyFontFace:'Arial',lang:'fr-FR'};
 const foot='CGT ULM  /  CSP CADRES  /  T'+report.quarter+' '+report.year;
 let s=newPage(ppt,'COMPTE RENDU CSP CADRES',foot);
 bodyText(s,'Unité Logistique Maintenance',1.44,20,.55);
 bodyText(s,quarterLabel(report.year,report.quarter),2.15,22,.6);
 bodyText(s,'CSP des Métiers de la PI et de la DOAAT',3.04,16,.45);
 bodyText(s,'Extrait du Socioscope ULM · documents enregistrés et décisions validées',4.03,13,.45);
 bodyText(s,'Tableaux modifiables dans PowerPoint · une ligne par mouvement',4.69,12,.42);
 s=newPage(ppt,'PERIMETRE ET METHODE',foot);
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
 table(s,rows,[5.5,1.8,1.8,1.8,1.4],1.20,.48,10.9);
 bodyText(s,'Comptage par séance, et non par date d’effet.',6.60,10,.28);
 for(const kind of kindOrder){
  const values=report.rows.filter(r=>r.kind===kind);
  if(!values.length)continue;
  const parts=blocks(values,6);
  for(let page=0;page<parts.length;page++){
   s=newPage(ppt,(kindTitles[kind]||kindLabels[kind].toUpperCase())+
    (parts.length>1?' ('+(page+1)+'/'+parts.length+')':''),foot);
   const cells=[['NOM PRÉNOM','AGENCE / POSTE','CSP / EFFET','GF AV. / AP.','NR AV. / AP.','NR +','SOURCE']];
   for(const e of parts[page]){
    const agency=[e.agency,e.job].filter(x=>x&&x!=='—').join('\n');
    cells.push([e.name,agency||'—',date(e.meeting)+'\n'+date(e.effective),
      e.gfBefore+' / '+e.gfAfter,e.nrBefore+' / '+e.nrAfter,e.nrSteps,e.source]);
   }
   table(s,cells,[2.4,2.3,1.50,1.23,1.30,.64,2.98],1.19,.72,9.65);
   bodyText(s,'* NR après calculé à partir du nombre de NR gagnés (à vérifier).',6.70,9.6,.27);
   if(s.addNotes)s.addNotes('[Sources]\n'+parts[page].map((e:QuarterlyRow)=>e.name+' : '+e.source).join('\n'));
  }
 }
 if(includeCandidates){
  const parts=blocks(report.candidates,5);
  if(!parts.length)parts.push([]);
  for(let p=0;p<parts.length;p++){
   s=newPage(ppt,'CANDIDATURES NON RETENUES'+(parts.length>1?' ('+(p+1)+'/'+parts.length+')':''),foot);
   if(!parts[p].length){bodyText(s,'Aucune candidature non retenue enregistrée sur la période.',1.55);}
   else{
    const cells=[['NOM PRÉNOM','AGENCE','POSTE / RÉFÉRENCE','DATE CSP','ISSUE','SOURCE']];
    for(const v of parts[p])cells.push([v.name,v.agency,(v.job||'—')+'\n'+(v.reference||''),
     date(v.meeting),v.reason,v.source]);
    table(s,cells,[2.35,1.76,3.35,1.29,2.43,1.17],1.22,.75,9.9);
   }
   bodyText(s,'Ces candidatures ne constituent pas des mouvements individuels validés.',6.65,10,.3);
  }
 }
 const checkRows=report.rows.filter(r=>r.notes);
 const alertLines=[...report.alerts,...checkRows.slice(0,12).map(r=>r.name+' ('+date(r.meeting)+') : '+r.notes)];
 for(const [i,part] of blocks(alertLines.length?alertLines:['Aucun point particulier signalé.'],5).entries()){
  s=newPage(ppt,'CONTROLES DOCUMENTAIRES'+(alertLines.length>5?' ('+(i+1)+')':''),foot);
  part.forEach((x,k)=>s.addText('•  '+x,{x:.59,y:1.32+k*1.03,w:12.03,h:.92,
   fontFace:'Arial',fontSize:12,color:P.text,margin:.03,valign:'top',breakLine:false}));
 }
 const sources=blocks(report.sources,3);
 for(let i=0;i<sources.length;i++){
  s=newPage(ppt,'DOCUMENTS DE REFERENCE ('+(i+1)+'/'+sources.length+')',foot);
  const cells=[['REPÈRE','CSP','TYPE / STATUT','DOCUMENT ORIGINAL']];
  for(const d of sources[i])cells.push([d.ref,date(d.date),
   d.type+(d.status==='validated'?' validé':' à vérifier'),d.name]);
  table(s,cells,[.95,1.55,2.15,7.70],1.22,1.14,10.0);
 }
 const file='CR_CSP_Cadres_T'+report.quarter+'_'+report.year+'_Tableaux_modifiables.pptx';
 // Create the complete binary before starting the browser download.
 // This makes generation errors visible and avoids relying on the library's download heuristic.
 const bytes=await ppt.write({outputType:'blob',compression:true});
 const mime='application/vnd.openxmlformats-officedocument.presentationml.presentation';
 const blob=bytes instanceof Blob?bytes:new Blob([bytes as BlobPart],{type:mime});
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