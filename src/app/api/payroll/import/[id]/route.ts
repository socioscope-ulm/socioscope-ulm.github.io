import {accessError} from '../../../../../lib/access';
import {agentAuth,agentError} from '../../../../../lib/agents-store';
import {resources} from '../../../../../lib/store';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const denied=accessError(request,true);if(denied)return denied;try{await agentAuth(request,true);const {id}=await params;const r=await resources().db.prepare("UPDATE payroll_imports SET status='validated' WHERE id=? AND status='review'").bind(id).run();if(!r.meta.changes)return Response.json({error:'Référence introuvable ou déjà validée.'},{status:409});return Response.json({ok:true});}catch(e){return agentError(e);}}
