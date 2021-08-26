export default "export { wrap };\nlet modules = {};\nlet currentId = 0;\nlet encoder = new TextEncoder();\nlet decoder = new TextDecoder();\nfunction wrap(wasmCode, exports) {\n  let id = currentId++;\n  let instantiated = WebAssembly.instantiate(wasmCode);\n  modules[id] = {\n    modulePromise: instantiated.then((i) => i.module),\n    instancePromise: instantiated.then((i) => i.instance)\n  };\n  return Object.fromEntries(exports.map((n) => [n, wrapFunction(n, modules[id])]));\n}\nasync function reinstantiate(wrapper) {\n  let { modulePromise, instancePromise } = wrapper;\n  if (instancePromise === void 0) {\n    wrapper.instancePromise = instancePromise = modulePromise.then((m) => WebAssembly.instantiate(m));\n  }\n  let instance = await instancePromise;\n  let memory = instance.exports.memory;\n  return { instance, memory };\n}\nfunction wrapFunction(name, wrapper) {\n  return async function call(...args) {\n    let { instance, memory } = await reinstantiate(wrapper);\n    let func = instance.exports[name];\n    let { alloc, free } = instance.exports;\n    let totalBytes = 0;\n    for (let i = 0; i < args.length; i++) {\n      let arg = args[i];\n      if (typeof arg === \"number\") {\n      } else if (typeof arg === \"string\") {\n        totalBytes += 2 * arg.length;\n      } else {\n        totalBytes += arg.byteLength;\n      }\n    }\n    let offset = alloc(totalBytes);\n    let actualArgs = [];\n    for (let arg of args) {\n      if (typeof arg === \"number\") {\n        actualArgs.push(arg);\n      } else if (typeof arg === \"string\") {\n        let copy = new Uint8Array(memory.buffer, offset, 2 * arg.length);\n        let { written } = encoder.encodeInto(arg, copy);\n        let length = written ?? 0;\n        actualArgs.push(offset, length);\n        offset += length;\n      } else {\n        let length = arg.byteLength;\n        actualArgs.push(offset, length);\n        let copy = new Uint8Array(memory.buffer, offset, length);\n        if (ArrayBuffer.isView(arg)) {\n          if (arg instanceof Uint8Array) {\n            copy.set(arg);\n          } else {\n            copy.set(new Uint8Array(arg.buffer));\n          }\n        } else {\n          copy.set(new Uint8Array(arg));\n        }\n        offset += length;\n      }\n    }\n    try {\n      let pointer = func(...actualArgs);\n      return readValue({ memory, pointer });\n    } catch (err) {\n      console.error(err);\n    } finally {\n      free();\n      if (memory.buffer.byteLength >= 1e7) {\n        console.warn(\"Cleaning up Wasm instance, memory limit of 10MB was exceeded.\");\n        queueMicrotask(() => {\n          wrapper.instancePromise = void 0;\n        });\n      }\n    }\n  };\n}\nfunction readValue(data) {\n  let { memory, offset, view, pointer } = data;\n  if (view === void 0 || offset === void 0) {\n    if (pointer === void 0)\n      return void 0;\n    data.view = view = new DataView(memory.buffer, pointer, 128);\n    data.offset = offset = 0;\n  }\n  let type = view.getUint8(offset++);\n  let value;\n  switch (type) {\n    case 0:\n      value = view.getInt32(offset, true);\n      offset += 4;\n      break;\n    case 1:\n      value = view.getFloat64(offset, true);\n      offset += 8;\n      break;\n    case 2:\n      value = !!view.getUint8(offset++);\n      break;\n    case 3:\n    case 4: {\n      let pointer2 = view.getUint32(offset, true);\n      offset += 4;\n      let length = view.getUint32(offset, true);\n      offset += 4;\n      if (type === 3)\n        value = new Uint8Array(memory.buffer.slice(pointer2, pointer2 + length));\n      else\n        value = decoder.decode(new Uint8Array(memory.buffer, pointer2, length));\n      break;\n    }\n    case 5:\n    case 6: {\n      let length = view.getUint8(offset++);\n      value = new Array(length);\n      data.offset = offset;\n      for (let i = 0; i < length; i++) {\n        value[i] = readValue(data);\n      }\n      if (type === 6)\n        value = Object.fromEntries(value);\n      break;\n    }\n  }\n  data.offset = offset;\n  return value;\n}\n"