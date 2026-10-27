import test from 'node:test';
import assert from 'node:assert/strict';
import {cspFolders} from '../src/lib/csp-folders.ts';
test('meeting dates create years with all four quarters, independent of import order or document type',()=>{
 const rows=[{id:'rd2',date:'2026-12-31',kind:'rd'},{id:'cr',date:'2026-03-31',kind:'cr'},{id:'new',date:'2027-01-01',kind:'rd'},{id:'rd',date:'2026-04-01',kind:'rd'},{id:'t3',date:'2026-07-01',kind:'cr'}];
 const folders=cspFolders(rows);assert.deepEqual(folders.map(f=>f.year),[2027,2026]);
 assert.deepEqual(folders[0].quarters.map(q=>q.name),['T1','T2','T3','T4']);
 assert.deepEqual(folders[1].quarters.map(q=>q.rows.map(r=>r.id)),[['cr'],['rd'],['t3'],['rd2']]);
 assert.deepEqual(cspFolders([...rows].reverse()),folders);
 assert.deepEqual(folders[0].quarters.slice(1).map(q=>q.rows),[[],[],[]]);
});
