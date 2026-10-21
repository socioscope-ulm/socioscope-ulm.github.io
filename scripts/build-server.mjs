import {build} from 'esbuild';
import fs from 'node:fs/promises';
await fs.mkdir('server-dist',{recursive:true});
await build({
  entryPoints:['server/index.ts'],
  outfile:'server-dist/index.ts',
  bundle:true,
  format:'esm',
  platform:'neutral',
  target:'es2022',
  minify:true,
  external:['npm:postgres@3.4.7'],
  mainFields:['module','main'],
  conditions:['import','default']
});
