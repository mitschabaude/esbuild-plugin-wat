/* eslint-env node */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import findCacheDir from 'find-cache-dir';
import {bundleWat} from './lib/parse-imports.js';

export {watPlugin as default};

let wabt;
let cacheDir = findCacheDir({name: 'eslint-plugin-wat', create: true});

// TODO: bundle .wasm, watchFiles
function watPlugin({
  inlineFunctions = false,
  bundle = false,
  loader = 'binary',
  wasmFeatures = {},
} = {}) {
  wasmFeatures = {
    ...defaultWasmFeatures,
    ...wasmFeatures,
  };
  return {
    name: 'esbuild-plugin-wat',
    setup(build) {
      build.onLoad({filter: /.wat$/}, async ({path: watPath}) => {
        let watBytes = await fs.promises.readFile(watPath);
        let wasmBytes = await fromCache(watPath, watBytes, async watBytes => {
          if (wabt === undefined) {
            let createWabt = (await import('wabt')).default;
            wabt = await createWabt();
          }
          let bytes;
          if (bundle) {
            bytes = bundleWat(wabt, watPath);
          } else {
            let wabtModule = wabt.parseWat(watPath, watBytes, wasmFeatures);
            bytes = new Uint8Array(wabtModule.toBinary({}).buffer);
          }
          if (inlineFunctions) {
            bytes = transformInlineFunctions(bytes);
          }
          return bytes;
        });
        return {
          contents: wasmBytes,
          loader,
        };
      });

      build.onLoad({filter: /.wasm$/}, async ({path: wasmPath}) => {
        let wasmBytes = await fs.promises.readFile(wasmPath);
        wasmBytes = await fromCache(wasmPath, wasmBytes, bytes => {
          if (inlineFunctions) {
            bytes = transformInlineFunctions(bytes);
          }
          return bytes;
        });
        return {
          contents: wasmBytes,
          loader,
        };
      });
    },
  };
}

const defaultWasmFeatures = {
  exceptions: true,
  mutable_globals: true,
  sat_float_to_int: true,
  sign_extension: true,
  simd: true,
  threads: true,
  multi_value: true,
  tail_call: true,
  bulk_memory: true,
  reference_types: true,
  annotations: true,
  gc: true,
};

let binaryen;
async function transformInlineFunctions(wasmBytes) {
  if (binaryen === undefined) {
    // this import takes forever which is why we make it optional
    binaryen = (await import('binaryen')).default;
  }
  let module = binaryen.readBinary(wasmBytes);

  binaryen.setOptimizeLevel(3);
  binaryen.setShrinkLevel(0);
  binaryen.setFlexibleInlineMaxSize(1000000000);
  module.runPasses(['inlining-optimizing']);
  // module.optimize();

  return module.emitBinary();
}

function hash(stuff) {
  return crypto.createHash('sha1').update(stuff).digest('base64url');
}

//  memoize bytes-to-bytes transform
async function fromCache(key, content, transform) {
  let keyHash = hash(key);
  let contentHash = hash(content);
  let result;

  try {
    result = await fs.promises.readFile(
      path.resolve(cacheDir, `${keyHash}.${contentHash}.wasm`)
    );
  } catch {}

  if (result === undefined) {
    result = await transform(content);
    // clean old cached files, then write new one
    fs.promises
      .readdir(cacheDir)
      .then(files =>
        Promise.all(
          files
            .filter(f => f.startsWith(keyHash))
            .map(f => fs.promises.unlink(path.resolve(cacheDir, f)))
        )
      )
      .then(() => {
        fs.promises.writeFile(
          path.resolve(cacheDir, `${keyHash}.${contentHash}.wasm`),
          result
        );
      });
  }
  return result;
}
