# esbuild-plugin-wat

This is a plugin for [esbuild](https://esbuild.github.io) which allows you to import `.wasm` (WebAssembly) and `.wat` (WebAssembly text format) files.

Both files types will resolve in a default export which is a `Uint8Array` holding the Wasm binary. It can be directly passed into `WebAssembly.instantiate()` or `WebAssembly.compile()`.

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

Optionally, you can pass a configuration object which currently supports two options:

```js
watPlugin({
  loader: 'file', // what loader esbuild should use to load the .wasm file. Default: 'binary'
  inlineFunctions: true, // optimize .wasm/.wat files by inlining all functions. Default: false
});
```

The `loader` option directly translates into choosing an [esbuild loader](https://esbuild.github.io/content-types/) for the `.wasm` file.
For example, instead of `"binary"` (the default) you could use `"base64"` if you want to do the base64-decoding yourself, or `"file"` if you don't want to inline the binary and rather want to fetch it from a separate file.

If `inlineFunctions` is `true`, we use [binaryen](https://github.com/AssemblyScript/binaryen.js) to inline all Wasm functions. This is the only binary optimization so far that I identified as useful when writing raw `.wat`. If you compile to Wasm from a different language, you will most likely have your own optimization pipeline and you can ignore this option.
