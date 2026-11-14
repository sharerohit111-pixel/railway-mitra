import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const output = path.join(root, 'web', 'assets', 'js', 'native-google-auth.js');

await build({
  entryPoints: [path.join(root, 'src', 'native-google-auth.js')],
  outfile: output,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'none'
});

console.log('Built isolated native Google authentication bridge.');
