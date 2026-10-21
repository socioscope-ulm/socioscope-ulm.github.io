import {agentAuth,agentError} from '../../../lib/agents-store';
import {payrollReferences} from '../../../lib/payroll-store';
export async function GET(request:Request){try{await agentAuth(request);return Response.json({references:await payrollReferences()},{headers:{'Cache-Control':'no-store'}});}catch(e){return agentError(e);}}
