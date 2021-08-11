export {wrap, allocate, free};
let modules = {};
let currentId = 0;

function wrap(wasmCode, exports, {fallback, imports} = {}) {
  let id = currentId++;
  let importObject = imports !== void 0 ? {imports} : {};
  let instantiated = WebAssembly.instantiate(wasmCode, importObject).catch(
    err => {
      if (fallback === void 0) throw err;
      console.warn(err);
      console.warn('falling back to version without experimental feature');
      wasmCode = fallback;
      return WebAssembly.instantiate(wasmCode, importObject);
    }
  );
  let modulePromise = instantiated.then(i => i.module);
  let instancePromise = instantiated.then(i => i.instance);
  modules[id] = {
    modulePromise,
    instancePromise,
    imports: importObject,
    offsets: void 0,
  };
  let moduleProxy = Object.fromEntries(
    exports.map(name => [name, wrapFunction(name, modules[id])])
  );
  return moduleProxy;
}

async function instantiate(wrapper) {
  let {modulePromise, instancePromise, imports, offsets} = wrapper;
  if (instancePromise === void 0) {
    instancePromise = modulePromise.then(m =>
      WebAssembly.instantiate(m, imports)
    );
    wrapper.instancePromise = instancePromise;
    wrapper.offsets = void 0;
  }
  let instance = await instancePromise;
  let memory = instance.exports.memory;
  if (offsets === void 0) {
    let offset = instance.exports.offset?.value ?? 0;
    offsets = [offset];
    wrapper.offsets = offsets;
  }
  return {instance, memory, offsets};
}

function wrapFunction(name, wrapper) {
  return async function call(...args) {
    let {instance, memory, offsets} = await instantiate(wrapper);
    let func = instance.exports[name];
    let actualArgs = [];
    let totalBytes = 0;
    for (let arg of args) {
      if (typeof arg !== 'number') {
        totalBytes += arg.byteLength;
      }
    }
    let view = allocate(memory, offsets, totalBytes);
    let offset = view.byteOffset;
    for (let arg of args) {
      if (typeof arg === 'number') {
        actualArgs.push(arg);
      } else {
        let length = arg.byteLength;
        actualArgs.push(offset, length);
        let copy = new Uint8Array(memory.buffer, offset, length);
        copy.set(arg);
        offset += length;
      }
    }
    try {
      let result = func(...actualArgs);
      if (result !== void 0) {
        switch (result & 7) {
          case 0:
            return result >> 3;
          case 1: {
            return instance.exports.result_f64.value;
          }
          case 2: {
            let pointer = result >> 3;
            let length = new DataView(memory.buffer, pointer, 4).getUint32(0);
            return new Uint8Array(memory.buffer.slice(pointer + 1, length));
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      free(wrapper, memory, offsets, view);
    }
  };
}

const MAX_PERSISTENT_BYTES = 1e6;
const bytesPerPage = 65536;
function allocate(memory, offsets, byteLength) {
  let byteOffset = offsets[offsets.length - 1];
  if (memory !== void 0 && byteLength > 0) {
    if (byteOffset + byteLength > memory.buffer.byteLength) {
      const missingPages = Math.ceil(
        (byteOffset + byteLength - memory.buffer.byteLength) / bytesPerPage
      );
      memory.grow(missingPages);
    }
    offsets.push(byteOffset + byteLength);
  }
  return {byteOffset, byteLength};
}
function free(wrapper, memory, offsets, {byteOffset, byteLength}) {
  if (memory === void 0 || byteLength === 0) return;
  let i = offsets.indexOf(byteOffset + byteLength);
  if (i !== -1) offsets.splice(i, 1);
  if (memory.buffer.byteLength >= MAX_PERSISTENT_BYTES) {
    queueMicrotask(() => {
      wrapper.instancePromise = void 0;
      wrapper.offsets = void 0;
    });
  }
}
