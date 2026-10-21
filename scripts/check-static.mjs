import fs from 'node:fs';import assert from 'node:assert/strict';
const files=fs.readdirSync('docs',{recursive:true}).filter(f=>fs.statSync('docs/'+f).isFile());
assert.ok(!files.some(f=>/seed|sources\//.test(f)));
const all=files.filter(f=>/\.(js|html)$/.test(f)).map(f=>fs.readFileSync('docs/'+f,'utf8')).join('');
for(const name of ['agents-seed','rup-seed','LOUVET STEPHANE','LOUVET STÉPHANE','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DB_URL'])assert.ok(!all.includes(name),'Unexpected private content '+name);
console.log('Static release: no seed datasets, no source documents, no server secrets.');
