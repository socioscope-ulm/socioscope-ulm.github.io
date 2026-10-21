import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const client=source('../src/main.tsx');
const session=source('../src/session.ts');
const api=source('../server/index.ts');
const invite=source('../server/invite.ts');

test('password recovery and first signup return to standalone Socioscope',()=>{
 assert.ok(client.includes("auth('recover?redirect_to='+encodeURIComponent(location.origin+import.meta.env.BASE_URL)"));
 assert.ok(client.includes("auth('signup?redirect_to='+encodeURIComponent(location.origin+import.meta.env.BASE_URL)"));
 assert.ok(client.includes("auth('user',{password},'PUT',session?.access_token)"));
 assert.ok(client.includes("mode==='reset'")&&client.includes("Mot de passe oublié"));
 assert.ok(client.includes("mode==='signup'")&&client.includes("Première connexion"));
 assert.ok(session.includes("const recovery=hash.get('type')==='recovery'||hash.get('type')==='invite'"));
 assert.ok(session.includes("history.replaceState(null,'',location.pathname)"));
});

test('administrator-only new user approval and invitation links',()=>{
 assert.ok(client.includes("apiFetch('/api/members',{method:'POST'"));
 assert.ok(client.includes("apiFetch('/api/members/link',{method:'POST'"));
 assert.ok(client.includes("Lien d’activation"));
 assert.ok(client.includes("Réinitialiser"));
 assert.ok(api.includes("if(member.role!=='admin')return finish(json({error:'Administration uniquement.'},403))"));
 assert.ok(api.includes("if(!allowed?.enabled)return finish("));
 assert.ok(api.includes("if(!['GET','HEAD'].includes(req.method)&&member.role!=='admin')"));
 assert.ok(invite.includes("projectURL+'/auth/v1/admin/generate_link'"));
 assert.ok(invite.includes("redirect_to:'https://socioscope-ulm.github.io/'"));
 assert.ok(!invite.includes('fnme-pointage.github.io'));
});

test('new site no longer needs the legacy relay or old domain API origin',()=>{
 assert.ok(session.includes("SUPABASE_URL+'/functions/v1/socioscope-api'"));
 assert.ok(!session.includes('socioscope-bridge'));
 assert.ok(!session.includes('socioscope-transfer'));
 assert.ok(api.includes("const ALLOWED_ORIGINS=new Set([CLIENT_ORIGIN]);"));
 assert.ok(!api.includes("new Set([CLIENT_ORIGIN,'https://fnme-pointage.github.io'])"));
});
