export const GUIDE_LIMIT_BYTES=8*1024*1024;
export function validGuidePdf(bytes:Uint8Array){
 if(bytes.byteLength<20||bytes.byteLength>GUIDE_LIMIT_BYTES)return false;
 const prefix=new TextDecoder().decode(bytes.subarray(0,5));
 const suffix=new TextDecoder().decode(bytes.subarray(Math.max(0,bytes.byteLength-2048)));
 return prefix==='%PDF-'&&/%%EOF\s*$/.test(suffix);
}
