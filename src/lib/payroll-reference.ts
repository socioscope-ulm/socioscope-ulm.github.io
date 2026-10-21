export type PayrollReference={id:string;kind:'grid'|'bonuses';name:string;date:string;status:string;created:string;snb?:number;sourceUrl?:string;originalUrl?:string;note?:string;payload:any};
export function selectReference(refs:PayrollReference[],kind:PayrollReference['kind'],id?:string){const available=refs.filter(r=>r.kind===kind&&r.status==='validated');return id?available.find(r=>r.id===id):available.sort((a,b)=>b.date.localeCompare(a.date)||b.created.localeCompare(a.created))[0];}
export function validateReference(kind:string,p:any){
 if(!p||typeof p!=='object')return false;
 const object=kind==='grid'?p.rates:kind==='bonuses'?p.bonuses:null;if(!object||typeof object!=='object'||Array.isArray(object))return false;
 const keys=Object.keys(object);if(!keys.length||keys.length>1000)return false;
 const cents=(v:any)=>Number.isSafeInteger(v)&&v>=0&&v<=10000000;
 if(kind==='bonuses')return keys.every(k=>/^\d+$/.test(k)&&Number(k)>=1&&Number(k)<=30&&cents(object[k]));
 return keys.length<=30&&keys.every(k=>Number.isFinite(Number(k))&&Number(k)>=1&&Number(k)<=2&&object[k]&&Object.keys(object[k]).length>0&&Object.keys(object[k]).length<=1000&&Object.entries(object[k]).every(([nr,v]:any)=>/^\d+$/.test(nr)&&Number(nr)>=1&&Number(nr)<=1000&&Array.isArray(v)&&v.length===12&&v.every((c:any,i:number)=>i<3?c===null||cents(c):cents(c)&&c>0)));
}
