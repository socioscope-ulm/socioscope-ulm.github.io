import {validDate} from './csp.ts';
import type {CspEvent} from './csp.ts';
type Extraction={date:string;events:CspEvent[];reports:unknown[];duplicates:number;documentType:'cr'|'rd'};
// Persist the original and extraction as a draft; this never validates decisions.
export async function saveCspDraft(file:File,extraction:Extraction,send:(body:FormData)=>Promise<{id:string;existing?:boolean}>){
 if(!validDate(extraction.date))throw Error('Date de séance à renseigner : le document n’est pas encore enregistré.');
 const body=new FormData();body.append('file',file);body.append('extraction',JSON.stringify({...extraction,candidateVersion:1}));
 const result=await send(body);
 if(!result?.id)throw Error('Enregistrement du document non confirmé. Réessayer avant d’importer le suivant.');
 return result;
}
