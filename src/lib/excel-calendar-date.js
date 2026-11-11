// Spreadsheet dates are calendar days, never instants in the browser timezone.
export function excelCalendarDate(value, date1904=false) {
  if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<2958466){
    const day=Math.floor(value);
    if(!date1904&&(day===0||day===60))return null; // Excel's fictitious 29 February 1900.
    const epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30);
    return new Date(epoch+(day+(!date1904&&day<60?1:0))*86400000).toISOString().slice(0,10);
  }
  if(value instanceof Date)return null; // Do not reinterpret an already timezone-shifted value.
  const text=String(value??'').trim();
  let m=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if(!m){const local=text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:$|[T ])/);if(local)m=[local[0],local[3],local[2].padStart(2,'0'),local[1].padStart(2,'0')];}
  if(!m)return null;
  const iso=`${m[1]}-${m[2]}-${m[3]}`,date=new Date(iso+'T00:00:00Z');
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===iso?iso:null;
}
