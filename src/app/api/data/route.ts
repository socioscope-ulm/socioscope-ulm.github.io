import {dataset} from '../../../lib/store';
export async function GET(){try{return Response.json(await dataset());}catch(e){return Response.json({error:e instanceof Error?e.message:'Chargement impossible'},{status:503});}}
