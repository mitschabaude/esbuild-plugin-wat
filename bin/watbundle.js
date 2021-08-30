#!/usr/bin/env node
import minimist from 'minimist';
import path from 'path';
import {bundleWasm} from '../lib/bundle-wasm.js';
import fs from 'fs';

let {
  _: [watPath],
  wrap,
  wat,
  all,
  o,
  imports,
} = minimist(process.argv.slice(2));

(async () => {
  imports = imports?.split(',');

  let result = await bundleWasm({path: watPath, wrap, imports});

  if (all) console.log(result);
  else if (wat) console.log(result.wat);
  else {
    let dir = path.dirname(watPath);
    let base = path
      .basename(watPath)
      .replace('.wat', '.wasm')
      .replace('.wast', '.wasm');

    let out = o ?? path.resolve(dir, base);
    fs.writeFileSync(out, result.wasm);
  }
})();
