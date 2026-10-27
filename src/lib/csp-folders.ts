import {validDate} from './csp.ts';
export function cspFolders<T extends {date:string;id:string}>(imports:T[]){
 const years=new Map<number,T[][]>();
 for(const row of imports){if(!validDate(row.date))continue;const year=Number(row.date.slice(0,4)),quarter=Math.floor((Number(row.date.slice(5,7))-1)/3);if(!years.has(year))years.set(year,[[],[],[],[]]);years.get(year)![quarter].push(row);}
 return [...years].sort(([a],[b])=>b-a).map(([year,quarters])=>({year,quarters:quarters.map((rows,index)=>({name:'T'+(index+1),rows:rows.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))}))}));
}
