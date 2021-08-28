# esbuild-plugin-wat

This is a plugin for [esbuild](https://esbuild.github.io) which allows you to import `.wasm` (WebAssembly) and `.wat` (WebAssembly text format) files.

Both files types will resolve in a default export which is a `Uint8Array` holding the Wasm binary. It can be directly passed into `WebAssembly.instantiate()` or `WebAssembly.compile()`.

```sh
yarn add esbuild-plugin-wat
```

Example:

```js
import exampleWasm from 'example.wat';
let {instance} = await WebAssembly.instantiate(exampleWasm);
```

The bundle produced by esbuild will look similar to this:

```js
var example_default = __toBinary('AGFzbQEAAAABDAJgAn9/AGA...'); // <-- Wasm binary gets inlined as base64
var {instance} = await WebAssembly.instantiate(example_default);
```

`.wat` is converted to `.wasm` with [wabt](https://github.com/AssemblyScript/wabt.js) (and cached, for performance).

## Usage

```js
import {build} from 'esbuild';
import watPlugin from 'esbuild-plugin-wat';

build({
  /* ... */
  plugins: [watPlugin()],
});
```

Optionally, you can pass a configuration object which currently supports three options:

```js
watPlugin({
  loader: 'file', // how esbuild should load the .wasm file. Default: 'binary'
  inlineFunctions: true, // optimize wasm by inlining all functions. Default: false
  wasmFeatures: {simd: false}, // selectively disable wasm features
  bundle: true // experimental: bundle multiple wat files using import syntax. Default: false
});
```

The `loader` option directly translates into choosing an [esbuild loader](https://esbuild.github.io/content-types/) for the `.wasm` file.
For example, instead of `"binary"` (the default) you could use `"base64"` if you want to do the base64-decoding yourself, or `"file"` if you don't want to inline the binary and rather want to fetch it from a separate file.

If `inlineFunctions` is `true`, we use [binaryen](https://github.com/AssemblyScript/binaryen.js) to inline all Wasm functions. This is the only binary optimization so far that I identified as useful when writing raw `.wat`. If you compile to Wasm from a different language, you will most likely have your own optimization pipeline and you can ignore this option.

The `wasmFeatures` are passed to `parseWat()` from `wabt.js`, see **WasmFeatures** in the [wabt API](https://github.com/AssemblyScript/wabt.js#api). Contrary to `wabt.js`, we enable all features by default (since supporting additional language features at compile time is unlikely to break code not using that feature), so passing `true` for a feature does nothing and passing `false` disables it.

### Bundling

The experimental `bundle` option allows you to combine multiple wasm/wat files into one. This is achieved with the following import syntax:

```wat
;; main.wat
(import "./util.wat" "some_function" (func $f (param i32) (result i32)))
```

The statement above tells our bundler to look for the file `"./util.wat"` at a path relative to `main.wat`, take the code for `"some_function"` and include it into our bundled wat (the import statement is removed).

Note that this is normal, spec-compliant wasm syntax, which requires two strings to specify an import. The original intended usage is to specify imports that are dynamically supplied by the host runtime. However, here we instead statically link the wasm modules together.

This enables two things:

* Split code into multiple files when writing raw wat
* When importing .wasm, allows to pack code compiled from different languages into one wasm binary
