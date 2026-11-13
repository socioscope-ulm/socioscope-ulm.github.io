/** Agences ouvertes à la consultation des trombinoscopes dans Socioscope. */
export const TROMBINOSCOPE_AGENCIES=[
 {code:'AMTNO',label:'AMT Nord-Ouest'},
 {code:'AMTE',label:'AMT Est'},
 {code:'AMTVDR',label:'AMT Vallée du Rhône'},
 {code:'AMTC',label:'AMT Centre'},
 {code:'AMTO',label:'AMT Ouest'},
 {code:'AMTSO',label:'AMT Sud-Ouest'},
 {code:'ALN',label:'ALN'},
 {code:'ULM',label:'État-major ULM'}
] as const;
export type TrombinoscopeAgencyCode=(typeof TROMBINOSCOPE_AGENCIES)[number]['code'];
export type TrombinoscopeDocument={
 agency:TrombinoscopeAgencyCode;
 label:string;
 available:boolean;
 filename:string|null;
 period:string|null;
 updatedAt:string|null;
 sizeBytes:number|null;
};
export function isTrombinoscopeAgency(code:unknown):code is TrombinoscopeAgencyCode{
 return typeof code==='string'&&TROMBINOSCOPE_AGENCIES.some(a=>a.code===code);
}
