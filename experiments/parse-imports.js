import path from 'path';
import fs from 'fs';
// import createWabt from 'wabt';
import AST, {traverse, isNumberLiteral, identifier} from '@webassemblyjs/ast';
import {decode} from '@webassemblyjs/wasm-parser';
import {print} from '@webassemblyjs/wast-printer';
import {parse} from '@webassemblyjs/wast-parser';

main();
let wabt;

async function main() {
  // wabt = await createWabt();

  let watPath = process.argv[2] ?? 'experiments/sum-wast.wat';
  let watText = await fs.promises.readFile(watPath, {encoding: 'utf-8'});
  // let wabtModule = wabt.parseWat('', watText, wasmFeatures);
  // // console.log(wabtModule);
  // let wasmBytes = new Uint8Array(
  //   wabtModule.toBinary({write_debug_names: true}).buffer
  // );
  // let ast = decode(wasmBytes, {});
  let ast = parse(watText);

  let moduleName = path.basename(watPath).replace('.wat', '');

  let modules = {}; // {[absPath]: {name, imports: Set([export1, export2, ...])}

  // console.log(print(ast));

  enumerateImports(ast, modules);
  treeshakeModule(ast, {
    moduleName,
    imports: new Set(['*']),
    // modules[watPath]?.imports,
    isEntryPoint: true,
  });

  console.log('AFTER');
  let wat = print(ast)
    .replace(/\(end\)/g, '')
    .replace(/u32/g, 'i32');
  console.log(wat);
  // let wabtModule = wabt.parseWat(watPath, wat, {mutable_globals: true});
  // console.log(wabtModule.toText({foldExprs: false, inlineExport: false}));
  // binaryen.parseWast(wat);
}

function enumerateImports(ast) {
  traverse(ast, {
    ModuleImport(path) {
      console.log(path.node);
    },
  });
}

function treeshakeModule(ast, {imports, moduleName, isEntryPoint}) {
  imports = imports ?? new Set();
  let keepExports = imports;
  let keepAllExports = imports.has('*');

  // returns modified AST
  // TODO: only regard exports imported elsewhere
  let {
    body: [{fields}],
  } = ast;

  let keep = new Set();
  let traversed = new Set();

  let globals = fields.filter(f => f.type === 'Global');
  let functions = fields.filter(f => f.type === 'Func');
  let memories = fields.filter(f => f.type === 'Memory');

  let moduleImports = fields.filter(f => f.type === 'ModuleImport');

  let ids = {
    m: normalizedIds(moduleName, 'm', memories),
    f: normalizedIds(moduleName, 'f', functions),
    g: normalizedIds(moduleName, 'g', globals),
  };
  let normalizedId = (type, node) => ids[type].get(node);

  let importedFuncNames = {};
  let importedGlobalNames = {};

  console.log(ids.g);

  for (let moduleImport of moduleImports) {
    let prefix = getModuleName(moduleImport.module);
    let {descr} = moduleImport;
    if (descr.type === 'Memory') {
      ids.m.set(descr, getNormalizedId(prefix, 'm', descr, 0));
    }
    if (moduleImport.descr.type === 'FuncImportDescr') {
      importedFuncNames[descr.id.value] = descr;
      ids.f.set(descr, getNormalizedId(prefix, 'f', descr, 0));
    }
  }
  // console.log(ids.f);

  let globalsByName = {
    ...byName(globals),
    ...Object.fromEntries([...ids.g].map(([node, id]) => [id.value, node])),
  };
  let functionsByName = {
    ...byName(functions),
    ...importedFuncNames,
    ...Object.fromEntries([...ids.f].map(([node, id]) => [id.value, node])),
  };

  // console.log(functionsByName);

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
    if (!id?.value) console.log(id);
    let node = getFunction(id);
    // console.log(node);
    if (node.type !== 'Func') return;

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
      if (!node.id) console.log(node);
      console.log('adding memory', node.id.value);
      keep.add(node);
    },

    Start({node}) {
      if (!node.index) console.log(node);
      node.index = normalizedId('f', getFunction(node.index));
      console.log('adding start', node.index.value);
      keep.add(node);
      traverseFunction(node.index);
    },

    // doesn't seem necessary to include types
    // TypeInstruction(path) {
    //   keep.add(path.node);
    // },

    ModuleExport(path) {
      if (!(keepAllExports || keepExports.has(path.node.name))) return;
      // console.log(path.node)

      if (!path.node.descr.id) console.log(path.node);

      if (isEntryPoint) {
        // keep exports in module output
        console.log('adding export', path.node.descr.id.value);
        keep.add(path.node);
      }

      if (path.node.descr.exportType === 'Func') {
        // console.log(path.node.descr.id);
        // console.log(getFunction(path.node.descr.id));
        path.node.descr.id = normalizedId('f', getFunction(path.node.descr.id));
        // console.log(path.node.descr.id);
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

function getNormalizedId(prefix, type, node, index) {
  let stringId = node.name?.value ?? node.id?.value;
  if (stringId) {
    return identifier(`${prefix}_${stringId}`);
  } else {
    return identifier(
      `${prefix}_${type}${index.toString(16).padStart(2, '0')}`
    );
  }
}

function normalizedIds(prefix, type, list) {
  let ids = new Map();
  for (let i = 0; i < list.length; i++) {
    let x = list[i];
    ids.set(x, getNormalizedId(prefix, type, x, i));
  }
  return ids;
}

function getModuleName(watPath) {
  return path.basename(watPath).replace('.wat', '');
}

function joinMaps(map1, map2) {
  for (let entry of map2) {
    let [key, value] = entry;
    map1.set(key, value);
  }
  return map1;
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
