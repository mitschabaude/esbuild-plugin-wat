/* eslint-env node */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import findCacheDir from 'find-cache-dir';
import {bundleWasm} from './lib/bundle-wasm.js';
import {collectWasmImports} from './lib/collect-wasm-imports.js';
import wrapWasmCode from './lib/wrap-wasm-code.js';

export {watPlugin as default};

let wabt;
let cacheDir = findCacheDir({name: 'eslint-plugin-wat', create: true});
let wasmFilter = /\.(wat|wasm)$/;

// TODO: integrate wrap-wasm
function watPlugin({
  inlineFunctions = false,
  bundle = false, // bundle wasm files together based on custom import syntax
  wrap = false, // import functions directly with import statement
  treeshakeWasmImports = wrap, // strip away unused wasm when using wrap
  ignoreCache = false,
  loader = 'binary',
  wasmFeatures = {},
} = {}) {
  wasmFeatures = {
    ...defaultWasmFeatures,
    ...wasmFeatures,
  };
  // don't cache when bundling, otherwise we're stale on updates to deep imported files
  ignoreCache = ignoreCache || bundle;

  const wasmBytes = {};

  return {
    name: 'esbuild-plugin-wat',
    async setup(build) {
      let wasmImports =
        treeshakeWasmImports &&
        (await collectWasmImports(build.initialOptions.entryPoints));

      build.onResolve(
        {filter: wasmFilter},
        async ({path: wasmPath, namespace, resolveDir}) => {
          if (namespace === 'wasm-stub') {
            return {
              path: wasmPath,
              namespace: 'wasm-binary',
            };
          }

          if (!resolveDir) return; // ignore unresolvable paths
          wasmPath = path.isAbsolute(wasmPath)
            ? wasmPath
            : path.resolve(resolveDir, wasmPath);

          let isWat = wasmPath.endsWith('.wat');
          let originalBytes = await fs.promises.readFile(wasmPath);
          let {
            bytes,
            meta: {watchFiles, exportNames, windowImports},
          } = await fromCache(
            wasmPath,
            originalBytes,
            async bytes => {
              let watchFiles, exportNames, windowImports;
              if (bundle) {
                let imports = treeshakeWasmImports
                  ? wasmImports[wasmPath]
                  : undefined;
                let bundleResult = await bundleWasm({
                  path: wasmPath,
                  wrap,
                  imports,
                });
                bytes = bundleResult.wasm;
                watchFiles = bundleResult.watchFiles;
                exportNames = bundleResult.exportNames;
                windowImports = bundleResult.windowImports;
              } else if (isWat) {
                wabt = wabt ?? (await (await import('wabt')).default());
                let wabtModule = wabt.parseWat('', bytes, wasmFeatures);
                bytes = new Uint8Array(wabtModule.toBinary({}).buffer);
              }
              if (inlineFunctions) {
                bytes = transformInlineFunctions(bytes);
              }
              return {bytes, meta: {watchFiles, exportNames, windowImports}};
            },
            ignoreCache
          );

          wasmBytes[wasmPath] = bytes;

          return {
            path: wasmPath,
            namespace: 'wasm-stub',
            watchFiles: watchFiles ?? [wasmPath],
            pluginData: {exportNames, windowImports},
          };
        }
      );

      // Virtual modules in the "wasm-stub" namespace are filled with
      // the JavaScript code for compiling the WebAssembly binary. The
      // binary itself is imported from a second virtual module.
      build.onLoad(
        {filter: /.*/, namespace: 'wasm-stub'},
        async ({path: wasmPath, pluginData: {exportNames, windowImports}}) => {
          let contents;
          if (wrap && exportNames) {
            let exportString = exportNames.join(', ');
            contents = `import wasm from ${JSON.stringify(wasmPath)};
import {wrap} from '__wrap-wasm';
let {${exportString}} = wrap(wasm, ${JSON.stringify(
              exportNames
            )}, ${JSON.stringify(windowImports)});
export {${exportString}};
`;
          } else {
            contents = `import wasm from ${JSON.stringify(wasmPath)};
let exportNames = ${JSON.stringify(exportNames)};
export {wasm as default, exportNames};
`;
          }
          return {
            contents,
            loader: 'js',
          };
        }
      );

      build.onLoad(
        {filter: /.*/, namespace: 'wasm-binary'},
        async ({path: wasmPath}) => {
          return {
            contents: wasmBytes[wasmPath],
            loader,
          };
        }
      );

      build.onResolve({filter: /__wrap-wasm$/}, ({path}) => {
        return {path, namespace: 'wrap-wasm'};
      });
      build.onLoad({filter: /.*/, namespace: 'wrap-wasm'}, () => {
        return {contents: wrapWasmCode, loader: 'js'};
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
