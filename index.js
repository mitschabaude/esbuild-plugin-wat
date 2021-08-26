/* eslint-env node */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import findCacheDir from 'find-cache-dir';
import {bundleWasm} from './lib/bundle-wasm.js';
// import {collectWasmImports} from './lib/collect-wasm-imports.js';

export {watPlugin as default};

let wabt;
let cacheDir = findCacheDir({name: 'eslint-plugin-wat', create: true});

// TODO: integrate wrap-wasm
function watPlugin({
  inlineFunctions = false,
  bundle = false, // bundle wasm files together based on custom import syntax
  wrap = false, // not implemented -- import functions directly with import statement
  treeshakeWasmImports = false, // not implemented -- strip away unused wasm when using wrap
  ignoreCache = false,
  loader = 'binary',
  wasmFeatures = {},
} = {}) {
  wasmFeatures = {
    ...defaultWasmFeatures,
    ...wasmFeatures,
  };
  // don't cache when bundling, otherwise we're stale on updates to imported files
  ignoreCache ||= bundle;

  return {
    name: 'esbuild-plugin-wat',
    async setup(build) {
      if (wrap && treeshakeWasmImports) {
        // TODO: collect all wasm imports to know what to tree-shake
        // let wasmImports = collectWasmImports(build.initialOptions.entryPoints);
      }

      build.onLoad({filter: /.wat$/}, async ({path: watPath}) => {
        let watBytes = await fs.promises.readFile(watPath);
        let {
          bytes,
          meta: {watchFiles},
        } = await fromCache(
          watPath,
          watBytes,
          async watBytes => {
            if (wabt === undefined) {
              let createWabt = (await import('wabt')).default;
              wabt = await createWabt();
            }
            let bytes, watchFiles;
            if (bundle) {
              let bundleResult = await bundleWasm(wabt, watPath);
              // TODO: use bundleResult.exportNames to expose info to wasm wrapper
              bytes = bundleResult.wasm;
              watchFiles = bundleResult.watchFiles;
            } else {
              let wabtModule = wabt.parseWat('', watBytes, wasmFeatures);
              bytes = new Uint8Array(wabtModule.toBinary({}).buffer);
            }
            if (inlineFunctions) {
              bytes = transformInlineFunctions(bytes);
            }
            return {bytes, meta: {watchFiles}};
          },
          ignoreCache
        );
        return {
          contents: bytes,
          loader,
          watchFiles,
        };
      });

      build.onLoad({filter: /.wasm$/}, async ({path: wasmPath}) => {
        let wasmBytes = await fs.promises.readFile(wasmPath);
        let {
          bytes,
          meta: {watchFiles},
        } = await fromCache(
          wasmPath,
          wasmBytes,
          async bytes => {
            let watchFiles;
            if (bundle) {
              if (wabt === undefined) {
                wabt = await (await import('wabt')).default();
              }
              let bundleResult = await bundleWasm(wabt, wasmPath);
              bytes = bundleResult.wasm;
              watchFiles = bundleResult.watchFiles;
            }
            if (inlineFunctions) {
              bytes = transformInlineFunctions(bytes);
            }
            return {bytes, meta: {watchFiles}};
          },
          ignoreCache
        );
        return {
          contents: bytes,
          loader,
          watchFiles,
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
async function fromCache(key, content, transform, ignoreCache) {
  let keyHash = hash(key);
  let contentHash = hash(content);
  let bytes, meta;

  try {
    bytes = await fs.promises.readFile(
      path.resolve(cacheDir, `${keyHash}.${contentHash}.wasm`)
    );
    meta = JSON.parse(
      await fs.promises.readFile(
        path.resolve(cacheDir, `${keyHash}.${contentHash}.json`),
        {encoding: 'utf8'}
      )
    );
  } catch {}
  console.log(ignoreCache);

  if (bytes === undefined || meta === undefined || ignoreCache) {
    let result = await transform(content);
    bytes = result.bytes;
    meta = result.meta;
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
          bytes
        );
        fs.promises.writeFile(
          path.resolve(cacheDir, `${keyHash}.${contentHash}.json`),
          JSON.stringify(meta),
          {encoding: 'utf8'}
        );
      });
  }
  return {bytes, meta};
}
