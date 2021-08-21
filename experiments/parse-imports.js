import path from 'path';
import fs from 'fs';
import createWabt from 'wabt';
import AST, {traverse, isNumberLiteral, identifier} from '@webassemblyjs/ast';
import {decode} from '@webassemblyjs/wasm-parser';
import {print} from '@webassemblyjs/wast-printer';
import {encodeNode, encodeU32} from '@webassemblyjs/wasm-gen';

main();
let wabt;

async function main() {
  wabt = await createWabt();

  let watPath = process.argv[2] ?? 'experiments/common.wat';
  let watBytes = await fs.promises.readFile(watPath);
  let wabtModule = wabt.parseWat('', watBytes, wasmFeatures);
  // console.log(wabtModule);
  let wasmBytes = new Uint8Array(
    wabtModule.toBinary({write_debug_names: true}).buffer
  );

  let prefix = path.basename(watPath).replace('.wat', '');

  let ast = decode(wasmBytes, {});
  let {
    body: [{fields}],
  } = ast;

  let keep = new Set();
  let traversed = new Set();

  let globals = fields.filter(f => f.type === 'Global');
  let functions = fields.filter(f => f.type === 'Func');
  let memories = fields.filter(f => f.type === 'Memory');

  let ids = {
    m: normalizedIds(prefix, 'm', memories),
    f: normalizedIds(prefix, 'f', functions),
    g: normalizedIds(prefix, 'g', globals),
  };
  let normalizedId = (type, node) => ids[type].get(node);

  let globalsByName = {
    ...byName(globals),
    ...Object.fromEntries([...ids.g].map(([node, id]) => [id.value, node])),
  };
  let functionsByName = {
    ...byName(functions),
    ...Object.fromEntries([...ids.f].map(([node, id]) => [id.value, node])),
  };

  let getGlobal = id =>
    isNumberLiteral(id) ? globals[id.value] : globalsByName[id.value];
  let getFunction = id =>
    isNumberLiteral(id) ? functions[id.value] : functionsByName[id.value];

  // console.log(functionsByName);

  function addGlobal(id) {
    let node = getGlobal(id);
    if (!keep.has(node)) {
      node.name = normalizedId('g', node);
      console.log('adding global', id.value);
      keep.add(node);
    }
  }

  function traverseFunction(id) {
    let node = getFunction(id);
    if (!keep.has(node)) {
      node.name = normalizedId('f', node);
      console.log('adding function', id.value);
      keep.add(node);
    }
    if (traversed.has(node)) return;
    traversed.add(node);
    traverse(node, {
      CallInstruction(path) {
        path.node.index = normalizedId('f', getFunction(path.node.index));
        traverseFunction(path.node.index);
      },
      Instr(path) {
        if (path.node.id === 'get_global' || path.node.id === 'set_global') {
          path.node.args[0] = normalizedId('g', getGlobal(path.node.args[0]));
          addGlobal(path.node.args[0]);
        }
      },
    });
  }

  traverse(ast, {
    Memory({node}) {
      node.id = normalizedId('m', node);
      console.log('adding memory', node.id.value);
      keep.add(node);
    },

    Start({node}) {
      node.index = normalizedId('f', getFunction(node.index));
      console.log('adding start', node.index.value);
      keep.add(node);
    },

    // doesn't seem necessary to include types
    // TypeInstruction(path) {
    //   keep.add(path.node);
    // },

    ModuleExport(path) {
      // console.log(path);
      console.log('adding export', path.node.descr.id.value);
      keep.add(path.node);

      if (path.node.descr.exportType === 'Func') {
        path.node.descr.id = normalizedId('f', getFunction(path.node.descr.id));
        traverseFunction(path.node.descr.id);
      }
      if (path.node.descr.exportType === 'Global') {
        path.node.descr.id = normalizedId('g', getGlobal(path.node.descr.id));
        addGlobal(path.node.descr.id);
      }
    },
  });

  let fieldsToKeep = fields.filter(f => keep.has(f));

  // console.log(fieldsToKeep);

  // console.log('BEFORE');
  // console.log(print(ast));

  ast.body[0].fields = fieldsToKeep;

  console.log('AFTER');
  let wat = print(ast)
    .replace(/\(end\)/g, '')
    .replace(/u32/g, 'i32');
  console.log(wat);
  wabtModule = wabt.parseWat(watPath, wat, {mutable_globals: true});
  // console.log(wabtModule.toText({foldExprs: false, inlineExport: false}));
  // binaryen.parseWast(wat);
}

function treeshakeModule(ast, importedExports, moduleName) {
  // returns modified AST
  // TODO: only regard exports imported elsewhere
  let {
    body: [{fields}],
  } = ast;

  let keep = new Set();
  let traversed = new Set();
  let prefix = moduleName;

  let globals = fields.filter(f => f.type === 'Global');
  let functions = fields.filter(f => f.type === 'Func');
  let memories = fields.filter(f => f.type === 'Memory');

  let ids = {
    m: normalizedIds(prefix, 'm', memories),
    f: normalizedIds(prefix, 'f', functions),
    g: normalizedIds(prefix, 'g', globals),
  };
  let normalizedId = (type, node) => ids[type].get(node);

  let globalsByName = {
    ...byName(globals),
    ...Object.fromEntries([...ids.g].map(([node, id]) => [id.value, node])),
  };
  let functionsByName = {
    ...byName(functions),
    ...Object.fromEntries([...ids.f].map(([node, id]) => [id.value, node])),
  };

  let getGlobal = id =>
    isNumberLiteral(id) ? globals[id.value] : globalsByName[id.value];
  let getFunction = id =>
    isNumberLiteral(id) ? functions[id.value] : functionsByName[id.value];

  function addGlobal(id) {
    let node = getGlobal(id);
    if (!keep.has(node)) {
      node.name = normalizedId('g', node);
      console.log('adding global', id.value);
      keep.add(node);
    }
  }

  function traverseFunction(id) {
    let node = getFunction(id);
    if (!keep.has(node)) {
      node.name = normalizedId('f', node);
      console.log('adding function', id.value);
      keep.add(node);
    }
    if (traversed.has(node)) return;
    traversed.add(node);
    traverse(node, {
      CallInstruction(path) {
        path.node.index = normalizedId('f', getFunction(path.node.index));
        traverseFunction(path.node.index);
      },
      Instr(path) {
        if (path.node.id === 'get_global' || path.node.id === 'set_global') {
          path.node.args[0] = normalizedId('g', getGlobal(path.node.args[0]));
          addGlobal(path.node.args[0]);
        }
      },
    });
  }

  traverse(ast, {
    Memory({node}) {
      node.id = normalizedId('m', node);
      console.log('adding memory', node.id.value);
      keep.add(node);
    },

    Start({node}) {
      node.index = normalizedId('f', getFunction(node.index));
      console.log('adding start', node.index.value);
      keep.add(node);
    },

    // doesn't seem necessary to include types
    // TypeInstruction(path) {
    //   keep.add(path.node);
    // },

    ModuleExport(path) {
      console.log('adding export', path.node.descr.id.value);
      keep.add(path.node);

      if (path.node.descr.exportType === 'Func') {
        path.node.descr.id = normalizedId('f', getFunction(path.node.descr.id));
        traverseFunction(path.node.descr.id);
      }
      if (path.node.descr.exportType === 'Global') {
        path.node.descr.id = normalizedId('g', getGlobal(path.node.descr.id));
        addGlobal(path.node.descr.id);
      }
    },
  });

  let fieldsToKeep = fields.filter(f => keep.has(f));

  ast.body[0].fields = fieldsToKeep;
  return ast;
}

function byName(list) {
  return Object.fromEntries(
    list.filter(x => x.name?.value).map(x => [x.name.value, x])
  );
}

function normalizedIds(prefix, type, list) {
  let ids = new Map();
  for (let i = 0; i < list.length; i++) {
    let x = list[i];
    if (x.name?.value) {
      ids.set(x, identifier(`${prefix}_${x.name.value}`));
    } else {
      ids.set(
        x,
        identifier(`${prefix}_${type}${i.toString(16).padStart(2, '0')}`)
      );
    }
  }
  return ids;
}

const wasmFeatures = {
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
