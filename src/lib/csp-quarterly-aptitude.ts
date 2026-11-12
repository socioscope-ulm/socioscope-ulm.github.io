import type {CspPage,CspTextItem} from './csp-extract.ts';
import type {QuarterlyEvent} from './csp-quarterly-report.ts';
import {cspNameHeader} from './csp-table-header.ts';
import {textItemOverlapsColumn} from './csp-row-annotations.ts';

const norm=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const center=(item:CspTextItem)=>item.x+item.width/2;
const isRetained=(value:string)=>/\bCANDIDATURE\s+RETENUE\b/.test(norm(value));

function namePosition(page:CspPage,event:QuarterlyEvent,header:CspTextItem):number|undefined{
 // The name/first-name column is bounded by the next printed header.
 // Never identify an agent from another table or another row by substring.
 const next=page.items.filter(i=>i.str.trim()&&i.y>=header.y-30&&i.y<=header.y+30&&center(i)>center(header)+35)
  .sort((a,b)=>center(a)-center(b))[0];
 const maxX=next?(center(header)+center(next))/2:Math.max(header.x+header.width+35,page.width*.25);
 const lines:{y:number;items:CspTextItem[]}[]=[];
 for(const item of page.items.filter(i=>i.str.trim()&&i.y<header.y-7&&i.y>page.height*.065&&center(i)<maxX)
  .sort((a,b)=>b.y-a.y||a.x-b.x)){
  let line=lines.find(row=>Math.abs(row.y-item.y)<=3);
  if(!line){line={y:item.y,items:[]};lines.push(line);}
  line.items.push(item);
 }
 const exact=lines.filter(line=>
  norm(line.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(' '))===norm(event.name));
 return exact.length===1?exact[0].y:undefined;
}

/** Extract the verbatim APTITUDE cell from a validated RD nomination, based
 * on the printed header and the exact person's row. Only the in-memory CR
 * event is enriched: no document validation or GF/NR state is ever modified.
 */
export function recoverRDNominationAptitudes(events:QuarterlyEvent[],pages:CspPage[]):QuarterlyEvent[]{
 const indexed=new Map(pages.map(p=>[p.page,p]));
 const position=new Map<QuarterlyEvent,number>();
 const byPage=new Map<number,QuarterlyEvent[]>();
 for(const event of events){
  if(event.kind!=='nomination'||event.page===undefined)continue;
  const onPage=byPage.get(event.page)||[];
  onPage.push(event);byPage.set(event.page,onPage);
 }
 for(const [number,rows] of byPage){
  const page=indexed.get(number),header=page?cspNameHeader(page.items)?.head:undefined;
  if(!page||!header)continue;
  for(const event of rows){
   const y=namePosition(page,event,header);
   if(y!==undefined)position.set(event,y);
  }
 }
 return events.map(event=>{
  if(event.kind!=='nomination'||event.selected===false||event.aptitude||event.page===undefined)return event;
  const page=indexed.get(event.page),head=page?cspNameHeader(page.items)?.head:undefined;
  if(!page||!head)return event;
  const y=position.get(event);
  if(y===undefined)return event;
  const aptHeads=page.items.filter(i=>/^APTITUDES?$/.test(norm(i.str))&&Math.abs(i.y-head.y)<=65);
  if(aptHeads.length!==1)return event;
  const apt=aptHeads[0],aptX=center(apt);
  const headers=page.items.filter(i=>i.str.trim()&&Math.abs(i.y-apt.y)<=50&&
   center(i)<aptX-20&&center(i)>center(head)+20);
  // All printed columns can differ in width: locate the preceding header
  // (usually LOCALISATION) on this same page, not at fixed 80% coordinates.
  const left=headers.sort((a,b)=>center(b)-center(a))[0];
  const leftX=left?(center(left)+aptX)/2:Math.max(0,apt.x-25);
  const right=page.items.filter(i=>i.str.trim()&&Math.abs(i.y-apt.y)<=35&&center(i)>aptX+30)
   .sort((a,b)=>center(a)-center(b))[0];
  const rightX=right?(aptX+center(right))/2:page.width;
  const neighbors=(byPage.get(event.page)||[]).map(e=>position.get(e)).filter((v):v is number=>v!==undefined&&v!==y);
  const above=neighbors.filter(v=>v>y),below=neighbors.filter(v=>v<y);
  const high=above.length?(Math.min(...above)+y)/2:head.y-7;
  const low=below.length?(Math.max(...below)+y)/2:page.height*.07;
  const pieces=page.items.filter(i=>i.str.trim()&&i.y<=high&&i.y>low&&
   textItemOverlapsColumn(i,leftX,rightX)).sort((a,b)=>Math.abs(a.y-b.y)<=3?a.x-b.x:b.y-a.y);
  // Keep the RD's words and date intact, including multi-line entries.
  const value=pieces.map(i=>i.str.trim()).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  // Do not present a localisation or another candidate's unrelated text
  // as aptitude: a retained RD nomination carries this printed confirmation.
  return isRetained(value)?{...event,aptitude:value}:event;
 });
}
export const needsRDNominationAptitude=(events:QuarterlyEvent[])=>
 events.some(e=>e.kind==='nomination'&&e.selected!==false&&!e.candidacy&&!e.aptitude);
