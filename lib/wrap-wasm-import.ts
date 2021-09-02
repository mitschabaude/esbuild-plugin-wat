// smaller version of wrap-wasm with logic removed that can't be used in import statements
export {wrap};

type ModuleWrapper = {
  modulePromise: Promise<WebAssembly.Module>;
  instancePromise: Promise<WebAssembly.Instance> | undefined;
};
let modules: Record<string, ModuleWrapper> = {};
let currentId = 0;
let encoder = new TextEncoder();
let decoder = new TextDecoder();

function wrap(
  wasmCode: Uint8Array,
  exports: string[],
  windowImports = [] as string[]
): Record<string, WasmFunction> {
  let id = currentId++;
  let imports = {};
  for (let importStr of windowImports) {
    let value = globalThis;
    for (let key of importStr.split('.')) {
      value = value[key];
    }
    imports[importStr] = value;
  }
  let instantiated = WebAssembly.instantiate(wasmCode, {window: imports});
  modules[id] = {
    modulePromise: instantiated.then(i => i.module),
    instancePromise: instantiated.then(i => i.instance),
  };
  return Object.fromEntries(
    exports.map(n => [n, wrapFunction(n, modules[id])])
  ) as never;
}

async function reinstantiate(wrapper: ModuleWrapper) {
  let {modulePromise, instancePromise} = wrapper;
  if (instancePromise === undefined) {
    wrapper.instancePromise = instancePromise = modulePromise.then(m =>
      WebAssembly.instantiate(m)
    );
  }
  let instance = await instancePromise;
  let memory = instance.exports.memory as WebAssembly.Memory;
  return {instance, memory};
}

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
    let offset = alloc(totalBytes);

    // translate function arguments to numbers
    let actualArgs: number[] = [];
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
      return readValue({memory, pointer});
    } catch (err) {
      console.error(err);
    } finally {
      free();
      // garbage collect instance if it exceeds memory limit
      if (memory.buffer.byteLength >= 1e7) {
        console.warn(
          'Cleaning up Wasm instance, memory limit of 10MB was exceeded.'
        );
        queueMicrotask(() => {
          wrapper.instancePromise = undefined;
        });
      }
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
    case 0:
      value = view.getInt32(offset, true);
      offset += 4;
      break;
    case 1:
      value = view.getFloat64(offset, true);
      offset += 8;
      break;
    case 2:
      value = !!view.getUint8(offset++);
      break;
    case 3:
    case 4: {
      let pointer = view.getUint32(offset, true);
      offset += 4;
      let length = view.getUint32(offset, true);
      offset += 4;
      if (type === 3)
        value = new Uint8Array(memory.buffer.slice(pointer, pointer + length));
      else
        value = decoder.decode(new Uint8Array(memory.buffer, pointer, length));
      break;
    }
    case 5:
    case 6: {
      let length = view.getUint8(offset++);
      value = new Array(length);
      data.offset = offset;
      for (let i = 0; i < length; i++) {
        value[i] = readValue(data);
      }
      if (type === 6) value = Object.fromEntries(value);
      break;
    }
  }
  data.offset = offset;
  return value;
}
