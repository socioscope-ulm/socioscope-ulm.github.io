import {accessError} from '../../../lib/access';
import {agentAuth,agentError} from '../../../lib/agents-store';
import {resources} from '../../../lib/store';
import {activeAnnualBonusId,payrollReferences} from '../../../lib/payroll-store';
export async function GET(request:Request){try{
 await agentAuth(request);const [references,activeBonusId]=await Promise.all([payrollReferences(),activeAnnualBonusId()]);
 return Response.json({references,activeBonusId},{headers:{'Cache-Control':'no-store'}});
}catch(e){return agentError(e);}}
export async function PATCH(request:Request){
 const denied=accessError(request,true);if(denied)return denied;
 try{await agentAuth(request,true);const input=await request.json();const id=String(input?.id||'');
 if(Object.keys(input||{}).length!==1||!id.startsWith('payroll-'))return Response.json({error:'Référence invalide.'},{status:400});
 const selected=(await payrollReferences()).find(r=>r.id===id&&r.kind==='bonus-detail'&&r.status==='validated');
 if(!selected)return Response.json({error:'Choisir une référence de primes validée.'},{status:400});
 await resources().db.batch([
  resources().db.prepare("INSERT INTO prime_settings(key,settings,updated_at) VALUES ('active-annual-bonuses',?::jsonb,now()) ON CONFLICT(key) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()").bind(JSON.stringify({id})),
  resources().db.prepare("UPDATE socioscope.result_cache_state SET revision=revision+1 WHERE singleton=true")
 ]);
 return Response.json({activeBonusId:id});
 }catch(e){return agentError(e);}
}
