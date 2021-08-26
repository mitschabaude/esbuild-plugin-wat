import {build} from 'esbuild';
import path from 'path';
import watPlugin from '../index.js';

main();

async function main() {
  let file = process.argv[2];
  await build({
    entryPoints: [file],
    outfile: path.resolve('./dist', file),
    bundle: true,
    format: 'esm',

    plugins: [watPlugin({bundle: true, wrap: true})],
  });
}
