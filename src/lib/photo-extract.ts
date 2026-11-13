import {nearbyPhotoName,portraitImageBoxes,matchPhotoName,photoNameKey,matchPptxPortraits,type PhotoAgent,type Box} from './photo-match';
export type ExtractedPhoto={blob:Blob;name:string;certain:boolean;page:number};
export async function compressPhoto(blob:Blob){
 const image=await createImageBitmap(blob);const scale=Math.min(1,360/image.width,480/image.height);const c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);image.close();return new Promise<Blob>((ok,fail)=>c.toBlob(b=>b?ok(b):fail(Error('Image illisible.')),'image/jpeg',.82));
}
function xml(text:string){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('PowerPoint illisible.');return doc;}
const nodes=(el:Element|Document,tag:string)=>Array.from(el.getElementsByTagNameNS('*',tag));
const first=(el:Element,tag:string)=>nodes(el,tag)[0];
function box(el:Element):Box{const off=first(el,'off'),ext=first(el,'ext');return {x:Number(off?.getAttribute('x')),y:Number(off?.getAttribute('y')),w:Number(ext?.getAttribute('cx')),h:Number(ext?.getAttribute('cy'))};}
export async function extractPortraits(file:File,progress:(s:string)=>void,onPhoto:(p:ExtractedPhoto)=>Promise<void>,onPage:(blob:Blob,page:number)=>Promise<void>,agents:PhotoAgent[]=[]){
 if(file.size>40*1024*1024)throw Error('40 Mo maximum par trombinoscope.');
 if(/\.ppt$/i.test(file.name))throw Error('Enregistrer ce PowerPoint au format PPTX ou PDF avant l’import.');
 let count=0;const emit=async(p:ExtractedPhoto)=>{if(++count>1000)throw Error('1000 photos maximum par import.');await onPhoto({...p,blob:await compressPhoto(p.blob)});};
 if(/\.pptx$/i.test(file.name)){
  const {default:JSZip}=await import('jszip');
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const slides=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)?.[1])-Number(b.match(/slide(\d+)/)?.[1]));
  if(slides.length>200)throw Error('200 diapositives maximum.');
  const supported=/\.(png|jpe?g|webp|gif|bmp)$/i;
  const mediaPath=(target:string)=>decodeURIComponent(new URL(target,'https://local/ppt/slides/').pathname.slice(1));
  for(let i=0;i<slides.length;i++){
   progress('Lecture de la diapositive '+(i+1)+' / '+slides.length);
   const path=slides[i],doc=xml(await zip.file(path)!.async('string'));
   const relFile=zip.file(path.replace('slides/','slides/_rels/')+'.rels');
   if(!relFile)continue;
   const rel=xml(await relFile.async('string'));
   const relationships=nodes(rel,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External');
   const targets=new Map(relationships.map(r=>[r.getAttribute('Id'),r.getAttribute('Target')!]));
   // Photos can be ordinary pictures, grouped pictures, or an image filling a
   // PowerPoint shape. The previous extractor only handled the first category.

   // Names in many EDF trombinoscopes are orange text runs, while the same
   // textbox also contains a role. Extract the actual coloured name only.
   const names=nodes(doc,'sp').map(el=>{
    const runs=nodes(el,'r').filter(r=>{
     const pr=first(r,'rPr');
     const colour=pr&&first(pr,'srgbClr')?.getAttribute('val')?.toUpperCase();
     return colour==='FE5815';
    });
    const coloured=runs.map(r=>nodes(r,'t').map(t=>t.textContent||'').join('')).join(' ').replace(/\s+/g,' ').trim();
    const fallback=nodes(el,'t').map(t=>t.textContent).join(' ').trim();
    return {...box(el),text:coloured||fallback,coloured:!!coloured};
   }).filter(t=>t.text&&t.w>0&&t.h>0);
   // Slide-size is stored in ppt/presentation.xml; shape coordinates alone are
   // sufficient to reject off-slide objects when a slide size is not present.
   const width=12192000,height=6858000;
   const pictureShapes=[...nodes(doc,'pic'),...nodes(doc,'sp').filter(el=>nodes(el,'blip').length>0)];
   const rawPictures=pictureShapes.map(el=>{
    const source=box(el),xfrm=first(el,'xfrm');
    const rotation=Number(xfrm?.getAttribute('rot')||'0')/60000;
    const radians=rotation*Math.PI/180;
    const vw=Math.abs(Math.cos(radians))*source.w+Math.abs(Math.sin(radians))*source.h;
    const vh=Math.abs(Math.sin(radians))*source.w+Math.abs(Math.cos(radians))*source.h;
    return {el,source,rotation,x:source.x+(source.w-vw)/2,y:source.y+(source.h-vh)/2,w:vw,h:vh};
   }).filter(p=>p.w>0&&p.h>0&&p.x+p.w/2>=0&&p.x+p.w/2<=width&&p.y+p.h/2>height*.07&&p.y+p.h/2<=height);
   // Older PPTs contain several copies of the same photo in one position.
   // Only the final, visible layer must be assigned to the corresponding name.
   const overlap=(a:Box,b:Box)=>{
    const w=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
    const h=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
    return w*h/Math.max(1,Math.min(a.w*a.h,b.w*b.h));
   };
   const pictures:typeof rawPictures=[];
   for(const p of rawPictures){
    for(let k=pictures.length-1;k>=0;k--)if(overlap(p,pictures[k])>.88)pictures.splice(k,1);
    pictures.push(p);
   }
   const exported=new Set<string>();
   const colouredLabels=names.filter(t=>t.coloured&&t.x+t.w/2>=0&&t.x+t.w/2<=width&&t.y+t.h/2>=0&&t.y+t.h/2<=height);
   const labels=colouredLabels.length?colouredLabels:names.filter(t=>t.x+t.w/2>=0&&t.x+t.w/2<=width&&t.y+t.h/2>=0&&t.y+t.h/2<=height);
   const associations=matchPptxPortraits(pictures,labels,agents);
   for(let pIndex=0;pIndex<pictures.length;pIndex++){
    const picture=pictures[pIndex];
    const blip=first(picture.el,'blip');
    const embed=blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed')||blip?.getAttribute('r:embed');
    const target=targets.get(embed||'');
    if(!target)continue;
    const resolved=mediaPath(target),entry=zip.file(resolved);
    if(!entry||!supported.test(resolved))continue;
    exported.add(resolved);
    let blob=await entry.async('blob');
    let im:ImageBitmap;
    try{im=await createImageBitmap(blob);}catch{continue;}
    try{
     // The shared transparent avatar placeholder is not a real headshot.
     // Do not upload it, but retain other labelled or unmatched images.
     const silhouette=im.width===88&&im.height===116&&resolved.toLowerCase().includes('image');
     if(silhouette)continue;
     const crop=first(picture.el,'srcRect');
     const l=Math.min(.95,Math.max(0,Number(crop?.getAttribute('l')||0)/100000));
     const t=Math.min(.95,Math.max(0,Number(crop?.getAttribute('t')||0)/100000));
     const r=Math.min(.95,Math.max(0,Number(crop?.getAttribute('r')||0)/100000));
     const b=Math.min(.95,Math.max(0,Number(crop?.getAttribute('b')||0)/100000));
     const left=im.width*l,top=im.height*t;
     const w=im.width*(1-l-r),h=im.height*(1-t-b);
     if(w<=0||h<=0)continue;
     const angle=picture.rotation*Math.PI/180;
     const rotatedW=Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle));
     const rotatedH=Math.abs(w*Math.sin(angle))+Math.abs(h*Math.cos(angle));
     const canvas=document.createElement('canvas');
     canvas.width=Math.max(1,Math.round(rotatedW));canvas.height=Math.max(1,Math.round(rotatedH));
     const ctx=canvas.getContext('2d')!;
     ctx.translate(canvas.width/2,canvas.height/2);
     ctx.rotate(angle);
     ctx.drawImage(im,left,top,w,h,-w/2,-h/2,w,h);
     blob=await new Promise<Blob>((ok,fail)=>canvas.toBlob(v=>v?ok(v):fail(Error('Image illisible.')),'image/jpeg',.9));
    }finally{im.close();}
    // Never assign a scanned/ambiguous caption just because it is nearby.
    const match=associations[pIndex]||{name:'',certain:false};
    if(picture.el.parentElement?.localName==='grpSp')match.certain=false;
    await emit({blob,...match,page:i+1});
   }
   // Media that is not a visible picture object can still be a portrait,
   // but without spatial evidence it must remain in the review queue.
   const remaining=relationships.filter(r=>/\/image$/.test(r.getAttribute('Type')||''));
   for(const relation of remaining){
    const target=relation.getAttribute('Target');
    if(!target)continue;
    const resolved=mediaPath(target),entry=zip.file(resolved);
    if(exported.has(resolved)||!entry||!supported.test(resolved))continue;
    exported.add(resolved);
    const blob=await entry.async('blob');
    let im:ImageBitmap;
    try{im=await createImageBitmap(blob);}catch{continue;}
    const ratio=im.width/Math.max(1,im.height);
    const plausible=im.width>=65&&im.height>=65&&ratio>=.30&&ratio<=1.5;
    im.close();
    if(!plausible)continue;
    await emit({blob,name:'',certain:false,page:i+1});
   }
  }
 }else if(/\.pdf$/i.test(file.name)){
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=import.meta.env.BASE_URL+'pdf.worker.min.mjs';const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
  try{if(pdf.numPages>200)throw Error('200 pages maximum.');for(let n=1;n<=pdf.numPages;n++){
   progress(`Lecture de la page ${n} / ${pdf.numPages}`);const page=await pdf.getPage(n),viewport=page.getViewport({scale:1.5});const c=document.createElement('canvas');c.width=Math.ceil(viewport.width);c.height=Math.ceil(viewport.height);await page.render({canvas:c,canvasContext:c.getContext('2d')!,viewport}).promise;
   const text=await page.getTextContent();const raw:Box[]=text.items.filter((t:any)=>'str'in t&&t.str.trim()).map((t:any)=>{const m=pdfjs.Util.transform(viewport.transform,t.transform);return {x:m[4],y:m[5]-Math.abs(t.height)*1.5,w:Math.abs(t.width)*1.5,h:Math.abs(t.height)*1.5,text:t.str};});
   const labels:Box[]=[];for(const t of raw.sort((a,b)=>a.y-b.y||a.x-b.x)){const prev=labels.find(l=>Math.abs(l.y-t.y)<5&&t.x>=l.x&&t.x-(l.x+l.w)<20);if(prev){prev.text+=' '+t.text;prev.w=t.x+t.w-prev.x;}else labels.push({...t});}
   const ops=await page.getOperatorList();let matrix=[1,0,0,1,0,0];const stack:number[][]=[];const images:Box[]=[];
   for(let j=0;j<ops.fnArray.length;j++){
    const op=ops.fnArray[j],args=ops.argsArray[j];
    if(op===pdfjs.OPS.save)stack.push([...matrix]);
    else if(op===pdfjs.OPS.restore)matrix=stack.pop()||[1,0,0,1,0,0];
    else if(op===pdfjs.OPS.transform)matrix=pdfjs.Util.transform(matrix,args);
    else if([pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageXObjectRepeat].includes(op)){
     const m=pdfjs.Util.transform(viewport.transform,matrix);
     const corners=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
     const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
     const b={x:Math.max(0,Math.min(...xs)),y:Math.max(0,Math.min(...ys)),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
     if([b.x,b.y,b.w,b.h].every(Number.isFinite))images.push(b);
    }
   }
   // A full-page background is common in exported PowerPoint files. Do not let it
   // hide the smaller photos: their rectangles can be recovered independently.
   const portraits=portraitImageBoxes(images,c.width,c.height);
   const matchedNames=new Set<string>();let savedOnPage=0,estimated=0;
   const emitCrop=async(b:Box,name:string,certain:boolean)=>{
    const x=Math.max(0,Math.floor(b.x)),y=Math.max(0,Math.floor(b.y));
    const w=Math.min(c.width-x,Math.max(1,Math.ceil(b.w))),h=Math.min(c.height-y,Math.max(1,Math.ceil(b.h)));
    if(w<20||h<25)return false;
    const crop=document.createElement('canvas');crop.width=w;crop.height=h;
    crop.getContext('2d')!.drawImage(c,x,y,w,h,0,0,w,h);
    const blob=await new Promise<Blob>((ok,fail)=>crop.toBlob(v=>v?ok(v):fail(Error('Photo illisible.')),'image/jpeg',.88));
    await emit({blob,name,certain,page:n});savedOnPage++;return true;
   };
   for(const b of portraits){
    const match=nearbyPhotoName(b,portraits,labels,agents),key=photoNameKey(match.name);
    if(!key||matchedNames.has(key))continue;
    if(await emitCrop(b,match.name,match.certain))matchedNames.add(key);
   }
   // Fallback for photos embedded in clipped PowerPoint shapes: the PDF text
   // remains searchable even if the portrait is absent from the image operators.
   // These inferred crops are NEVER attached automatically.
   const known=labels.filter(t=>t.text&&matchPhotoName(t.text,agents).length===1);
   for(const t of known){
    const name=t.text||'',key=photoNameKey(name);
    if(matchedNames.has(key))continue;
    const h=Math.min(c.height*.22,Math.max(62,t.h*10));
    const w=h*.48;
    const guess={x:t.x-w-t.h*.5,y:t.y-t.h*1.8,w,h};
    if(guess.x<0||guess.y<0||guess.x+guess.w>c.width||guess.y+guess.h>c.height)continue;
    if(await emitCrop(guess,name,false)){matchedNames.add(key);estimated++;}
   }
   // Keep an editable page preview whenever extraction is incomplete, so a
   // user can correct the crop without uploading a replacement PDF.
   if(savedOnPage===0||estimated>0||(known.length>0&&matchedNames.size<known.length)){
    await onPage(await new Promise<Blob>((ok,fail)=>c.toBlob(v=>v?ok(v):fail(Error('Page illisible.')),'image/jpeg',.82)),n);
   }
   page.cleanup();
  }}finally{await pdf.destroy();}
 }else throw Error('Choisir un document PDF ou PowerPoint PPTX.');
 return count;
}
