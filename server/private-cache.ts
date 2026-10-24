import {db} from './storage';
import {createCachedRead} from './result-cache';
import {databaseResultStore} from './result-cache-db';

export const cachedAgentRead=createCachedRead(databaseResultStore(db),'agents-results-v1:'+Deno.env.get('DENO_DEPLOYMENT_ID'),{
 report:status=>console.info('Socioscope result cache '+status)
});
