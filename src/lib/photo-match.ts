export type PhotoAgent={id:string;name:string;agency?:string};
export const photoNameKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
export function matchPhotoName(name:string,agents:PhotoAgent[]){
 const key=photoNameKey(name);if(key.split(' ').length<2)return [];
 const sorted=(s:string)=>photoNameKey(s).split(' ').sort().join(' ');
 return agents.filter(a=>sorted(a.name)===sorted(key));
}
export type Box={x:number;y:number;w:number;h:number;text?:string};
export function nearbyPhotoName(photo:Box,photos:Box[],labels:Box[]){
 const distance=(a:Box,b:Box)=>Math.hypot((a.x+a.w/2)-(b.x+b.w/2),(a.y+a.h/2)-(b.y+b.h/2));
 const ranked=labels.filter(t=>Math.abs(t.x+t.w/2-photo.x-photo.w/2)<photo.w*.8&&t.y>=photo.y-photo.h*.4&&t.y<=photo.y+photo.h*1.5).sort((a,b)=>distance(photo,a)-distance(photo,b));
 const first=ranked[0];if(!first)return {name:'',certain:false};
 const rivals=photos.filter(p=>p!==photo&&distance(p,first)<distance(photo,first)*1.4);
 return {name:first.text||'',certain:!rivals.length&&(!ranked[1]||distance(photo,ranked[1])>distance(photo,first)*1.5)};
}
