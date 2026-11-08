export type PayrollReference={id:string;kind:'grid'|'bonus-detail';name:string;date:string;status:string;created:string;snb?:number;sourceUrl?:string;originalUrl?:string;note?:string;payload:any};
export function selectReference(refs:PayrollReference[],kind:PayrollReference['kind'],id?:string){
 const available=refs.filter(r=>r.kind===kind&&r.status==='validated');
 return id?available.find(r=>r.id===id):available.sort((a,b)=>b.date.localeCompare(a.date)||b.created.localeCompare(a.created))[0];
}
/**
 * For an individual's historical snapshot, use bonuses paid in that same
 * calendar year; otherwise use the validated payment year nearest to it.
 * When equidistant, prefer the earlier payment year (no future-looking tie).
 * References sharing a payment year are resolved by most recent objective year.
 * This intentionally does not change default mass-payroll/simulator selection.
 */
export function selectNearestAnnualBonusReference(refs:PayrollReference[],situationDate:string):PayrollReference|undefined{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(situationDate))return undefined;
 const year=Number(situationDate.slice(0,4));
 if(!Number.isInteger(year)||year<1900||year>2200)return undefined;
 const candidates=refs.filter(r=>r.kind==='bonus-detail'&&r.status==='validated'&&Number.isInteger(r.payload?.paymentYear));
 return candidates.sort((a,b)=>{
  const ay=Number(a.payload.paymentYear),by=Number(b.payload.paymentYear);
  return Math.abs(ay-year)-Math.abs(by-year)
    ||(ay<=year&&by>year?-1:ay>year&&by<=year?1:0)
    ||Number(b.payload.objectiveYear||0)-Number(a.payload.objectiveYear||0)
    ||String(b.created||'').localeCompare(String(a.created||''))
    ||a.id.localeCompare(b.id);
 })[0];
}
export function validateReference(kind:string,p:any){
 if(!p||typeof p!=='object')return false;
 const object=kind==='grid'?p.rates:null;if(!object||typeof object!=='object'||Array.isArray(object))return false;
 const keys=Object.keys(object);if(!keys.length||keys.length>30)return false;
 const cents=(v:any)=>Number.isSafeInteger(v)&&v>=0&&v<=10000000;
 return keys.every(k=>Number.isFinite(Number(k))&&Number(k)>=1&&Number(k)<=2&&object[k]&&Object.keys(object[k]).length>0&&Object.keys(object[k]).length<=1000&&Object.entries(object[k]).every(([nr,v]:any)=>/^\d+$/.test(nr)&&Number(nr)>=1&&Number(nr)<=1000&&Array.isArray(v)&&v.length===12&&v.every((c:any,i:number)=>i<3?c===null||cents(c):cents(c)&&c>0)));
}
