export { wrap };
let modules = {};
let currentId = 0;
let encoder = new TextEncoder();
let decoder = new TextDecoder();
function wrap(wasmCode, exports, windowImports = []) {
  let id = currentId++;
  let imports = {};
  for (let importStr of windowImports) {
    let value = globalThis;
    for (let key of importStr.split(".")) {
      value = value[key];
    }
    imports[importStr] = value;
  }
  let instantiated = WebAssembly.instantiate(wasmCode, { window: imports });
  modules[id] = {
    modulePromise: instantiated.then((i) => i.module),
    instancePromise: instantiated.then((i) => i.instance)
  };
  return Object.fromEntries(exports.map((n) => [n, wrapFunction(n, modules[id])]));
}
async function reinstantiate(wrapper) {
  let { modulePromise, instancePromise } = wrapper;
  if (instancePromise === void 0) {
    wrapper.instancePromise = instancePromise = modulePromise.then((m) => WebAssembly.instantiate(m));
  }
  let instance = await instancePromise;
  let memory = instance.exports.memory;
  return { instance, memory };
}
function wrapFunction(name, wrapper) {
  return async function call(...args) {
    let { instance, memory } = await reinstantiate(wrapper);
    let func = instance.exports[name];
    let { alloc, free } = instance.exports;
    let totalBytes = 0;
    for (let i = 0; i < args.length; i++) {
      let arg = args[i];
      if (typeof arg === "number") {
      } else if (typeof arg === "string") {
        totalBytes += 2 * arg.length;
      } else {
        totalBytes += arg.byteLength;
      }
    }
    let offset = alloc(totalBytes);
    let actualArgs = [];
    for (let arg of args) {
      if (typeof arg === "number") {
        actualArgs.push(arg);
      } else if (typeof arg === "string") {
        let copy = new Uint8Array(memory.buffer, offset, 2 * arg.length);
        let { written } = encoder.encodeInto(arg, copy);
        let length = written ?? 0;
        actualArgs.push(offset, length);
        offset += length;
      } else {
        let length = arg.byteLength;
        actualArgs.push(offset, length);
        let copy = new Uint8Array(memory.buffer, offset, length);
        if (ArrayBuffer.isView(arg)) {
          if (arg instanceof Uint8Array) {
            copy.set(arg);
          } else {
            copy.set(new Uint8Array(arg.buffer));
          }
        } else {
          copy.set(new Uint8Array(arg));
        }
        offset += length;
      }
    }
    try {
      let pointer = func(...actualArgs);
      return readValue({ memory, pointer });
    } catch (err) {
      console.error(err);
    } finally {
      free();
      if (memory.buffer.byteLength >= 1e7) {
        console.warn("Cleaning up Wasm instance, memory limit of 10MB was exceeded.");
        queueMicrotask(() => {
          wrapper.instancePromise = void 0;
        });
      }
    }
  };
}
function readValue(data) {
  let { memory, offset, view, pointer } = data;
  if (view === void 0 || offset === void 0) {
    if (pointer === void 0)
      return void 0;
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
      let pointer2 = view.getUint32(offset, true);
      offset += 4;
      let length = view.getUint32(offset, true);
      offset += 4;
      if (type === 3)
        value = new Uint8Array(memory.buffer.slice(pointer2, pointer2 + length));
      else
        value = decoder.decode(new Uint8Array(memory.buffer, pointer2, length));
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
      if (type === 6)
        value = Object.fromEntries(value);
      break;
    }
  }
  data.offset = offset;
  return value;
}
