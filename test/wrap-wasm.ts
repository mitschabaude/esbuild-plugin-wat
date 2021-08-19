// tools for using small wasm modules in the browser, deno and node
export {wrap};

type ModuleWrapper = {
  imports: WebAssembly.Imports;
  modulePromise: Promise<WebAssembly.Module>;
  instancePromise: Promise<WebAssembly.Instance> | undefined;
  maxPersistentMemory: number;
};
let modules: Record<string, ModuleWrapper> = {};
let currentId = 0;
let encoder = new TextEncoder();
let decoder = new TextDecoder();

function wrap<E extends string[] | undefined>(
  wasmCode: Uint8Array,
  {
    exports,
    fallback,
    imports,
    maxPersistentMemory = MAX_PERSISTENT_BYTES,
  }: {
    exports?: E;
    fallback?: string | Uint8Array;
    imports?: WebAssembly.ModuleImports;
    maxPersistentMemory?: number;
  } = {}
): E extends string[]
  ? Record<E[number], WasmFunction> & {isReady: Promise<void>}
  : Promise<Record<string, WasmFunction> & {isReady: Promise<void>}> {
  let id = currentId++;
  let importObject: WebAssembly.Imports = imports ? {imports} : {};
  let instantiated = instantiate(
    wasmCode,
    importObject,
    fallback
  ) as Promise<WebAssembly.WebAssemblyInstantiatedSource>;

  modules[id] = {
    modulePromise: instantiated.then(i => i.module),
    instancePromise: instantiated.then(i => i.instance),
    imports: importObject,
    maxPersistentMemory,
  };

  let wrap = (exports: string[]) =>
    ({
      ...Object.fromEntries(
        exports.map(name => [name, wrapFunction(name, modules[id])])
      ),
      isReady: instantiated.then(() => {}),
    } as Record<string, WasmFunction> & {isReady: Promise<void>});

  return (
    exports
      ? wrap(exports as string[])
      : instantiated.then(i =>
          wrap(
            WebAssembly.Module.exports(i.module)
              .filter(m => m.kind === 'function')
              .map(m => m.name)
          )
        )
  ) as never;
}

async function instantiate(
  wasmCode: Uint8Array,
  importObject: WebAssembly.Imports,
  wasmCodeFallback?: string | Uint8Array
) {
  try {
    let wasmBytes = wasmCode;
    return WebAssembly.instantiate(wasmBytes, importObject);
  } catch (err) {
    if (wasmCodeFallback === undefined) throw err;
    console.warn(err);
    console.warn('falling back to version without experimental feature');
    let wasmBytes = wasmCodeFallback;
    return WebAssembly.instantiate(wasmBytes, importObject);
  }
}

async function reinstantiate(wrapper: ModuleWrapper) {
  let {modulePromise, instancePromise, imports} = wrapper;
  if (instancePromise === undefined) {
    instancePromise = modulePromise.then(m =>
      WebAssembly.instantiate(m, imports)
    );
    wrapper.instancePromise = instancePromise;
  }
  let instance = await instancePromise;
  let memory = instance.exports.memory as WebAssembly.Memory;

  return {instance, memory};
}

const INT = 0;
const FLOAT = 1;
const BOOL = 2;
const BYTES = 3;
const STRING = 4;
const ARRAY = 5;
const OBJECT = 6;

type WasmFunction = (...args: number[]) => undefined | number;

function wrapFunction(name: string, wrapper: ModuleWrapper) {
  return async function call(
    ...args: ({byteLength: number} | number | string)[]
  ) {
    let {instance, memory} = await reinstantiate(wrapper);
    let func = instance.exports[name] as WasmFunction;
    let {alloc, free} = instance.exports as Record<string, WasmFunction>;

    // figure out how much memory to allocate
    let totalBytes = 0;
    for (let i = 0; i < args.length; i++) {
      let arg = args[i];
      if (typeof arg === 'number') {
      } else if (typeof arg === 'string') {
        totalBytes += 2 * arg.length;
      } else {
        totalBytes += arg.byteLength;
      }
    }
    let view = {
      byteOffset: alloc(totalBytes) as number,
      byteLength: totalBytes,
    };

    // translate function arguments to numbers
    let actualArgs: number[] = [];
    let offset = view.byteOffset;
    for (let arg of args) {
      if (typeof arg === 'number') {
        actualArgs.push(arg);
      } else if (typeof arg === 'string') {
        let copy = new Uint8Array(memory.buffer, offset, 2 * arg.length);
        let {written} = encoder.encodeInto(arg, copy);
        let length = written ?? 0;
        actualArgs.push(offset, length);
        offset += length;
      } else {
        let length = arg.byteLength;
        actualArgs.push(offset, length);
        let copy = new Uint8Array(memory.buffer, offset, length);
        if (ArrayBuffer.isView(arg)) {
          if (arg instanceof Uint8Array) {
            // Uint8Array
            copy.set(arg as Uint8Array);
          } else {
            // other TypedArray
            copy.set(new Uint8Array(arg.buffer as ArrayBuffer));
          }
        } else {
          // ArrayBuffer
          copy.set(new Uint8Array(arg as ArrayBuffer));
        }
        offset += length;
      }
    }
    try {
      let pointer = func(...actualArgs);
      let value = readValue({memory, pointer});
      return value;
    } catch (err) {
      console.error(err);
    } finally {
      free();
      cleanup(wrapper, memory);
    }
  };
}

function readValue(data: {
  memory: WebAssembly.Memory;
  view?: DataView;
  offset?: number;
  pointer?: number;
}) {
  let {memory, offset, view, pointer} = data;
  if (view === undefined || offset === undefined) {
    if (pointer === undefined) return undefined;
    data.view = view = new DataView(memory.buffer, pointer, 128);
    data.offset = offset = 0;
  }
  let type = view.getUint8(offset++);
  let value;
  switch (type) {
    case INT:
      value = view.getInt32(offset, true);
      offset += 4;
      break;
    case FLOAT:
      value = view.getFloat64(offset, true);
      offset += 8;
      break;
    case BOOL:
      value = !!view.getUint8(offset++);
      break;
    case BYTES: {
      let pointer = view.getUint32(offset, true);
      offset += 4;
      let length = view.getUint32(offset, true);
      offset += 4;
      value = new Uint8Array(memory.buffer.slice(pointer, pointer + length));
      break;
    }
    case STRING: {
      let pointer = view.getUint32(offset, true);
      offset += 4;
      let length = view.getUint32(offset, true);
      offset += 4;
      value = decoder.decode(new Uint8Array(memory.buffer, pointer, length));
      break;
    }
    case ARRAY: {
      let length = view.getUint8(offset++);
      value = new Array(length);
      data.offset = offset;
      for (let i = 0; i < length; i++) {
        value[i] = readValue(data);
      }
      break;
    }
    case OBJECT: {
      let length = view.getUint8(offset++);
      let entries = new Array(length);
      data.offset = offset;
      for (let i = 0; i < length; i++) {
        entries[i] = readValue(data);
      }
      value = Object.fromEntries(entries);
      break;
    }
  }
  data.offset = offset;
  return value;
}

// memory management
const MAX_PERSISTENT_BYTES = 1e7;

// garbage collect instance if it exceeds memory limit
function cleanup(wrapper: ModuleWrapper, memory: WebAssembly.Memory) {
  let maxMem = wrapper.maxPersistentMemory;
  if (memory.buffer.byteLength >= maxMem) {
    console.warn(
      `Cleaning up Wasm instance, memory limit of ${maxMem}B was exceeded.`
    );
    queueMicrotask(() => {
      wrapper.instancePromise = undefined;
    });
  }
}

// old JS memory management, superseeded by version which is accessible from Wasm

// const bytesPerPage = 65536;

// function allocate(
//   memory: WebAssembly.Memory | undefined,
//   offsets: number[],
//   byteLength: number
// ) {
//   let byteOffset = offsets[offsets.length - 1];
//   if (memory !== undefined && byteLength > 0) {
//     if (byteOffset + byteLength > memory.buffer.byteLength) {
//       const missingPages = Math.ceil(
//         (byteOffset + byteLength - memory.buffer.byteLength) / bytesPerPage
//       );
//       memory.grow(missingPages);
//     }
//     offsets.push(byteOffset + byteLength);
//   }
//   // console.log('allocated', byteOffset, byteLength);
//   return {byteOffset, byteLength};
// }

// function free(
//   wrapper: ModuleWrapper,
//   memory: WebAssembly.Memory,
//   offsets: number[],
//   {byteOffset, byteLength}: {byteOffset: number; byteLength: number}
// ) {
//   if (memory === undefined || byteLength === 0) return;
//   let i = offsets.indexOf(byteOffset + byteLength);
//   if (i !== -1) offsets.splice(i, 1);
//   // console.log('freed', byteOffset, byteLength);
//   if (memory.buffer.byteLength >= MAX_PERSISTENT_BYTES) {
//     // let memory be garbage collected after current consumers dispose references
//     // => have to replace memory AND instances which hold a reference to memory
//     queueMicrotask(() => {
//       wrapper.instancePromise = undefined;
//       wrapper.offsets = undefined;
//     });
//   }
// }
