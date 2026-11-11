export type PhotoAgent={id:string;name:string;agency?:string};
export const photoNameKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
export function matchPhotoName(name:string,agents:PhotoAgent[]){
 const key=photoNameKey(name);if(key.split(' ').length<2)return [];
 const sorted=(s:string)=>photoNameKey(s).split(' ').sort().join(' ');
 return agents.filter(a=>sorted(a.name)===sorted(key));
}
export type Box={x:number;y:number;w:number;h:number;text?:string};

export function plausiblePhotoName(text:string){
 const key=photoNameKey(text),words=key.split(' ').filter(Boolean);
 if(words.length<2||words.length>6||words.some(w=>w.length<2)||/[0-9@]/.test(text))return false;
 return !/\b(DIRECTEUR|DIRECTRICE|RESPONSABLE|CHEF|CHEFFE|ADJOINT|ADJOINTE|MISSION|SERVICE|DIRECTION|TROMBINOSCOPE|MAINTENANCE|LOGISTIQUE|DEVELOPPEMENT|PILOTAGE|COMMUNICATION|RESSOURCES|FINANCIERES|OPERATIONS|INDUSTRIELS|SYNDICATS)\b/.test(key);
}
export function portraitImageBoxes(images:Box[],pageWidth:number,pageHeight:number){
 const area=pageWidth*pageHeight;
 return images.filter(b=>b.w>=24&&b.h>=30&&b.x>=0&&b.y>=0&&b.x+b.w<=pageWidth+3&&b.y+b.h<=pageHeight+3)
  .filter(b=>b.w*b.h<area*.13&&b.w<pageWidth*.42&&b.h<pageHeight*.48)
  .filter(b=>b.w/b.h>=.27&&b.w/b.h<=1.45)
  .filter((b,i,a)=>a.findIndex(q=>Math.abs(q.x-b.x)<3&&Math.abs(q.y-b.y)<3&&Math.abs(q.w-b.w)<3&&Math.abs(q.h-b.h)<3)===i);
}
function photoLabelScore(p:Box,t:Box){
 const center=t.x+t.w/2,photoCenter=p.x+p.w/2;
 const sideGap=t.x-(p.x+p.w),sideY=t.y+t.h/2;
 const right=sideGap>=-p.w*.22&&sideGap<=p.w*2.4&&sideY>=p.y-p.h*.22&&sideY<=p.y+p.h*.85
  ?Math.max(0,sideGap)/p.w+Math.abs(sideY-(p.y+p.h*.23))/p.h*1.5:Infinity;
 const bottomGap=t.y-(p.y+p.h);
 const below=bottomGap>=-p.h*.15&&bottomGap<=p.h*.65&&Math.abs(center-photoCenter)<=p.w*1.15
  ?Math.abs(center-photoCenter)/p.w+Math.max(0,bottomGap)/p.h+.1:Infinity;
 return Math.min(right,below);
}
export function nearbyPhotoName(photo:Box,photos:Box[],labels:Box[],agents:PhotoAgent[]=[]){
 let candidates=labels.filter(t=>t.text&&plausiblePhotoName(t.text)&&Number.isFinite(photoLabelScore(photo,t)));
 if(agents.length){const known=candidates.filter(t=>matchPhotoName(t.text||'',agents).length>0);if(known.length)candidates=known;}
 const ranked=candidates.map(t=>({label:t,score:photoLabelScore(photo,t)})).sort((a,b)=>a.score-b.score);
 const first=ranked[0];if(!first||first.score>2.5)return {name:'',certain:false};
 const otherLabel=ranked.slice(1).some(r=>r.score<=first.score+.35);
 const otherPhoto=photos.some(p=>p!==photo&&photoLabelScore(p,first.label)<=first.score+.35);
 const uniqueAgent=!agents.length||matchPhotoName(first.label.text||'',agents).length===1;
 return {name:first.label.text||'',certain:!otherLabel&&!otherPhoto&&uniqueAgent};
}
