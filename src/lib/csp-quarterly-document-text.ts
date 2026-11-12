/** Pure display-only cleanup for CSP document cells.
 * Page counters from PDF footers are not documentary observations.
 * This module never changes a persisted CSP event or an agent situation.
 */
export function cleanCspPrintedCell(raw:unknown):string{
 const value=String(raw??'').replace(/\s+/g,' ').trim();
 if(!value||value==='—')return '';
 if(/^(?:\d{1,3}\s*\/\s*\d{1,3}|(?:page|p\.)\s*\d{1,3}\s*(?:sur|of|\/)\s*\d{1,3})$/i.test(value))
  return '';
 return value;
}

/** Exclude page furniture only when located in the bottom margin.
 * Geometric check protects genuine content in higher table rows.
 */
export function isCspPageFooter(item:{str:string;x:number;y:number},page:{width:number;height:number}):boolean{
 if(item.y>page.height*.24)return false;
 const value=String(item.str||'').replace(/\s+/g,' ').trim();
 if(/^(?:page|p\.)\s*\d{1,3}\s*(?:sur|of|\/)\s*\d{1,3}$/i.test(value))return true;
 return item.x>page.width*.48&&/^\d{1,3}\s*\/\s*\d{1,3}$/.test(value);
}

/** Keep the RD aptitude decision, but not its effective date already
 * shown in the adjacent CSP / effet column. Supports future RD layouts,
 * apostrophes, line breaks, French date markers and ISO dates.
 */
export function formatCspNominationAptitude(raw:unknown,effective?:string):string{
 let value=cleanCspPrintedCell(raw);
 if(!value)return '';
 const datePart="(?:\\d{4}\\s*-\\s*\\d{1,2}\\s*-\\s*\\d{1,2}|\\d{1,2}\\s*[/\\.\\-]\\s*\\d{1,2}(?:\\s*[/\\.\\-]\\s*\\d{2,4})?)";
 const effectMarker="date\\s+(?:(?:de\\s+prise\\s+)?d\\s*['’]?\\s*)?effet";
 value=value.replace(new RegExp("\\s*(?:[-–—;,]\\s*)?"+effectMarker+"\\s*(?::|–|—|-)?\\s*(?:au\\s+|du\\s+)?"+datePart,"gi"),' ');
 // A bare date is dropped only when it is exactly the validated effect date.
 if(/^\d{4}-\d{2}-\d{2}$/.test(effective||'')){
  const [year,month,day]=(effective||'').split('-');
  const equivalent="(?:"+day+"\\s*[/\\.\\-]\\s*"+month+"\\s*[/\\.\\-]\\s*"+year+"|"+year+"\\s*-\\s*"+month+"\\s*-\\s*"+day+")";
  value=value.replace(new RegExp("(?:\\s*[-–—;,]\\s*|\\s+)"+equivalent+"\\s*$",'i'),'');
 }
 // Also remove an unfinished effect-date label, without changing the decision.
 value=value.replace(new RegExp("\\s*(?:[-–—;,]\\s*)?"+effectMarker+"\\s*:?\\s*$","gi"),'');
 return value.replace(/\s+/g,' ').replace(/(?:\s*[-–—;,.:]\s*)+$/g,'').trim();
}
