// PDF.js 5 uses the newer typed-array encoding methods. Keep imports usable
// in browsers which support module workers but predate these byte methods.
export function installPDFByteMethods(){
 if(typeof Uint8Array.prototype.toHex!=='function')Object.defineProperty(Uint8Array.prototype,'toHex',{configurable:true,writable:true,value:function(){let out='';for(const value of this)out+=value.toString(16).padStart(2,'0');return out;}});
 if(typeof Uint8Array.prototype.toBase64!=='function')Object.defineProperty(Uint8Array.prototype,'toBase64',{configurable:true,writable:true,value:function(options={}){let binary='';for(let i=0;i<this.length;i+=32768)binary+=String.fromCharCode(...this.subarray(i,i+32768));let result=btoa(binary);if(options.alphabet==='base64url')result=result.replaceAll('+','-').replaceAll('/','_');return options.omitPadding?result.replace(/=+$/,''):result;}});
 if(typeof Uint8Array.fromBase64!=='function')Object.defineProperty(Uint8Array,'fromBase64',{configurable:true,writable:true,value:function(text,options={}){if(options.alphabet==='base64url')text=text.replaceAll('-','+').replaceAll('_','/');return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}});
}
installPDFByteMethods();
