import {accessError} from '../../../../../lib/access';
import {agentAuth,agentError} from '../../../../../lib/agents-store';
import {resources} from '../../../../../lib/store';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const denied=accessError(request,true);if(denied)return denied;
 try{
  await agentAuth(request,true);
  const {id}=await params;
  // One transaction: validate the reference and invalidate cached payroll results.
  const row=await resources().db.prepare(`WITH validated AS (
    UPDATE payroll_imports SET status='validated' WHERE id=? AND status='review'
    RETURNING id
   ), refreshed AS (
    UPDATE socioscope.result_cache_state SET revision=revision+1
    WHERE singleton=true AND EXISTS(SELECT 1 FROM validated)
    RETURNING revision
   )
   SELECT validated.id FROM validated LEFT JOIN refreshed ON true`).bind(id).first<{id:string}>();
  if(!row)return Response.json({error:'Référence introuvable ou déjà validée.'},{status:409});
  return Response.json({ok:true});
 }catch(e){return agentError(e);}
}
