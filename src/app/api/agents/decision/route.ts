import {accessError} from '../../../../lib/access';
import {decision,agentError} from '../../../../lib/agents-store';
export async function POST(request:Request){const denied=accessError(request,true);if(denied)return denied;try{return Response.json(await decision(request));}catch(e){return agentError(e);}}
