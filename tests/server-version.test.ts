import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDeploymentVersion} from '../server/version.ts';
import {readFileSync} from 'node:fs';

test('numero du serveur calcule depuis le vrai identifiant Supabase',()=>{
 assert.equal(parseDeploymentVersion('ovssjbldmsowzojeftyr_f9fa2860-b24c-4d95-ab65-9c52e2c573cd_21'),21);
 assert.equal(parseDeploymentVersion('ovssjbldmsowzojeftyr_f9fa2860-b24c-4d95-ab65-9c52e2c573cd_22'),22);
 assert.equal(parseDeploymentVersion('ovssjbldmsowzojeftyr_f9fa2860-b24c-4d95-ab65-9c52e2c573cd_123'),123);
 assert.equal(parseDeploymentVersion(''),null);
 assert.equal(parseDeploymentVersion(null),null);
 assert.equal(parseDeploymentVersion(undefined),null);
 assert.equal(parseDeploymentVersion('not-a-deployment'),null);
 assert.equal(parseDeploymentVersion('something_0'),null);
 assert.equal(parseDeploymentVersion('something_-23'),null);
});

test('numero de version transmis uniquement pour l administrateur',()=>{
 const code=readFileSync(new URL('../server/index.ts',import.meta.url),'utf8');
 assert.match(code,/member\.role==='admin'\?\{serverVersion:currentServerVersion\(\)\}:\{\}/);
 assert.match(code,/if\(path==='\/api\/session'\)/);
 const dashboard=readFileSync(new URL('../src\/app\/dashboard.tsx',import.meta.url),'utf8');
 assert.match(dashboard,/\{isAdmin&&<AdminServerVersion initialVersion=\{serverVersion\}\/>\}/);
 const widget=readFileSync(new URL('../src/app/admin-server-version.tsx',import.meta.url),'utf8');
 assert.match(widget,/fetch\('\/api\/session'/);
 assert.match(widget,/session\.role==='admin'/);
 assert.match(widget,/className="server-version"/);
 assert.match(widget,/window\.addEventListener\('focus'/);
 assert.ok(!dashboard.includes("Version serveur v22"));
});
