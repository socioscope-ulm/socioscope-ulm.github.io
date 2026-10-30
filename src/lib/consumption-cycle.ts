export function consumptionCycle(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const number=(type:string)=>Number(parts.find(p=>p.type===type)!.value);
 const year=number('year'),month=number('month')-1-(number('day')<28?1:0);
 return {from:new Date(Date.UTC(year,month,28)).toISOString().slice(0,10),to:new Date(Date.UTC(year,month+1,27)).toISOString().slice(0,10)};
}
