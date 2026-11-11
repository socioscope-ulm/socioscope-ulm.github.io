import {nearbyPhotoName,type Box} from './photo-match';
export type ExtractedPhoto={blob:Blob;name:string;certain:boolean;page:number};
export async function compressPhoto(blob:Blob){
 const image=await createImageBitmap(blob);const scale=Math.min(1,360/image.width,480/image.height);const c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);image.close();return new Promise<Blob>((ok,fail)=>c.toBlob(b=>b?ok(b):fail(Error('Image illisible.')),'image/jpeg',.82));
}
function xml(text:string){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('PowerPoint illisible.');return doc;}
const nodes=(el:Element|Document,tag:string)=>Array.from(el.getElementsByTagNameNS('*',tag));
const first=(el:Element,tag:string)=>nodes(el,tag)[0];
function box(el:Element):Box{const off=first(el,'off'),ext=first(el,'ext');return {x:Number(off?.getAttribute('x')),y:Number(off?.getAttribute('y')),w:Number(ext?.getAttribute('cx')),h:Number(ext?.getAttribute('cy'))};}
export async function extractPortraits(file:File,progress:(s:string)=>void,onPhoto:(p:ExtractedPhoto)=>Promise<void>,onPage:(blob:Blob,page:number)=>Promise<void>){
 if(file.size>40*1024*1024)throw Error('40 Mo maximum par trombinoscope.');
 if(/\.ppt$/i.test(file.name))throw Error('Enregistrer ce PowerPoint au format PPTX ou PDF avant l’import.');
 let count=0;const emit=async(p:ExtractedPhoto)=>{if(++count>1000)throw Error('1000 photos maximum par import.');await onPhoto({...p,blob:await compressPhoto(p.blob)});};
 if(/\.pptx$/i.test(file.name)){
  const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(await file.arrayBuffer());const slides=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)?.[1])-Number(b.match(/slide(\d+)/)?.[1]));if(slides.length>200)throw Error('200 diapositives maximum.');
  for(let i=0;i<slides.length;i++){
   progress(`Lecture de la diapositive ${i+1} / ${slides.length}`);const path=slides[i],doc=xml(await zip.file(path)!.async('string'));const relFile=zip.file(path.replace('slides/','slides/_rels/')+'.rels');if(!relFile)continue;const rel=xml(await relFile.async('string'));const targets=new Map(nodes(rel,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')!]));
   const pics=nodes(doc,'pic').map(el=>({el,...box(el)})).filter(p=>p.w>0&&p.h>0);const labels=nodes(doc,'sp').map(el=>({...box(el),text:nodes(el,'t').map(t=>t.textContent).join(' ').trim()})).filter(t=>t.text&&t.w>0);
   for(const pic of pics){const embed=first(pic.el,'blip')?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed');const target=targets.get(embed||'');if(!target)continue;const resolved=new URL(target,'https://local/ppt/slides/').pathname.slice(1);const entry=zip.file(resolved);if(!entry||!/\.(png|jpe?g|webp)$/i.test(resolved))continue;let blob=await entry.async('blob');const crop=first(pic.el,'srcRect');if(crop){const im=await createImageBitmap(blob);const l=Number(crop.getAttribute('l')||0)/100000,t=Number(crop.getAttribute('t')||0)/100000,r=Number(crop.getAttribute('r')||0)/100000,b=Number(crop.getAttribute('b')||0)/100000;const c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*(1-l-r)));c.height=Math.max(1,Math.round(im.height*(1-t-b)));c.getContext('2d')!.drawImage(im,im.width*l,im.height*t,c.width,c.height,0,0,c.width,c.height);im.close();blob=await new Promise<Blob>(ok=>c.toBlob(b=>ok(b!),'image/jpeg',.9));}const match=nearbyPhotoName(pic,pics,labels);if(pic.el.parentElement?.localName==='grpSp')match.certain=false;await emit({blob,...match,page:i+1});}
  }
 }else if(/\.pdf$/i.test(file.name)){
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=import.meta.env.BASE_URL+'pdf.worker.min.mjs';const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
  try{if(pdf.numPages>200)throw Error('200 pages maximum.');for(let n=1;n<=pdf.numPages;n++){
   progress(`Lecture de la page ${n} / ${pdf.numPages}`);const page=await pdf.getPage(n),viewport=page.getViewport({scale:1.5});const c=document.createElement('canvas');c.width=Math.ceil(viewport.width);c.height=Math.ceil(viewport.height);await page.render({canvas:c,canvasContext:c.getContext('2d')!,viewport}).promise;
   const text=await page.getTextContent();const raw:Box[]=text.items.filter((t:any)=>'str'in t&&t.str.trim()).map((t:any)=>{const m=pdfjs.Util.transform(viewport.transform,t.transform);return {x:m[4],y:m[5]-Math.abs(t.height)*1.5,w:Math.abs(t.width)*1.5,h:Math.abs(t.height)*1.5,text:t.str};});
   const labels:Box[]=[];for(const t of raw.sort((a,b)=>a.y-b.y||a.x-b.x)){const prev=labels.find(l=>Math.abs(l.y-t.y)<5&&t.x>=l.x&&t.x-(l.x+l.w)<20);if(prev){prev.text+=' '+t.text;prev.w=t.x+t.w-prev.x;}else labels.push({...t});}
   const ops=await page.getOperatorList();let matrix=[1,0,0,1,0,0];const stack:number[][]=[];const photos:Box[]=[];let flattened=false;
   for(let j=0;j<ops.fnArray.length;j++){const op=ops.fnArray[j],args=ops.argsArray[j];if(op===pdfjs.OPS.save)stack.push([...matrix]);else if(op===pdfjs.OPS.restore)matrix=stack.pop()||matrix;else if(op===pdfjs.OPS.transform)matrix=pdfjs.Util.transform(matrix,args);else if([pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageXObjectRepeat].includes(op)){
    const m=pdfjs.Util.transform(viewport.transform,matrix),corners=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);const b={x:Math.max(0,Math.min(...xs)),y:Math.max(0,Math.min(...ys)),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
    if(b.w*b.h>=c.width*c.height*.7)flattened=true;else if(b.w>25&&b.h>25)photos.push(b);
   }}
   const unique=photos.filter((p,i)=>photos.findIndex(q=>Math.abs(q.x-p.x)<2&&Math.abs(q.y-p.y)<2&&Math.abs(q.w-p.w)<2)===i);
   if(flattened||!unique.length){await onPage(await new Promise<Blob>(ok=>c.toBlob(b=>ok(b!),'image/jpeg',.85)),n);continue;}
   for(const b of unique){const crop=document.createElement('canvas');crop.width=Math.round(b.w);crop.height=Math.round(b.h);crop.getContext('2d')!.drawImage(c,b.x,b.y,b.w,b.h,0,0,b.w,b.h);const blob=await new Promise<Blob>(ok=>crop.toBlob(v=>ok(v!),'image/jpeg',.9));await emit({blob,...nearbyPhotoName(b,unique,labels),page:n});}
   page.cleanup();
  }}finally{await pdf.destroy();}
 }else throw Error('Choisir un document PDF ou PowerPoint PPTX.');
 return count;
}
