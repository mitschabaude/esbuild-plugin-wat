import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
// import createWabt from 'wabt';
import {decode} from '@webassemblyjs/wasm-parser';
import {print} from '@webassemblyjs/wast-printer';
import {
  traverse,
  isNumberLiteral,
  identifier,
  funcImportDescr,
  moduleExport,
  moduleExportDescr,
  moduleImport,
  numberLiteral,
  signature,
  global,
  globalType,
  module,
  program,
  objectInstruction,
  numberLiteralFromRaw,
} from '@webassemblyjs/ast';
// import {parse} from '@webassemblyjs/wast-parser';

// main();

// async function main() {
//   let watPath = process.argv[2] ?? 'experiments/sumwast.wat';
//   let bundle = await bundleWat(watPath);
//   console.log(bundle);
// }

export {bundleWasm};

// console.log(await import.meta.resolve('@webassemblyjs/ast'));

let wabt;
async function bundleWasm(wabt_, watPath) {
  wabt = wabt_;
  let absPath = path.resolve('.', watPath);

  // add meta module
  let dataEndArgs = [numberLiteralFromRaw('0')];
  let i32const = objectInstruction('const', 'i32', dataEndArgs);
  let dataEndGlobal = global(
    globalType('i32', 'const'),
    [i32const],
    identifier('data_end')
  );
  let dataEndExport = moduleExport(
    'data_end',
    moduleExportDescr('Global', identifier('data_end'))
  );
  let metaModuleAst = program([module('meta', [dataEndGlobal, dataEndExport])]);
  let metaModule = {name: 'meta', path: 'meta', ast: metaModuleAst};
  let specialModules = [metaModule];

  // add stuff that has to be exported
  let commonPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    './memory.wat'
  );
  let moduleList = [];
  enumerateModules(commonPath, moduleList, specialModules);
  let commonImports = moduleList.find(m => m.name === 'memory').imports;
  commonImports.add('memory_alloc');
  commonImports.add('memory_free');
  commonImports.add('memory_memory');
  enumerateModules(absPath, moduleList, specialModules);

  // set global data end
  let maxDataEnd = Math.max(...moduleList.map(m => m.dataEnd));
  dataEndArgs[0] = numberLiteralFromRaw(maxDataEnd + '');

  let entryPoint = moduleList[moduleList.length - 1];
  entryPoint.imports.add('*');

  // modify entrypoint
  let entryPointFields = entryPoint.ast.body[0].fields;

  let fixedImports = [
    moduleImport(
      './memory',
      'memory_alloc',
      funcImportDescr(
        identifier('alloc'),
        signature([{id: undefined, valtype: 'i32'}], ['i32'])
      )
    ),
    moduleImport(
      './memory',
      'memory_free',
      funcImportDescr(identifier('free'), signature([], []))
    ),
    moduleImport('./memory', 'memory_memory', {
      type: 'Memory',
      limits: {type: 'Limit', min: 1},
      id: numberLiteral(0, '0'),
    }),
  ];
  for (let fi of fixedImports) {
    if (
      !entryPointFields.find(
        f => f.type === 'ModuleImport' && f.name === fi.name
      )
    ) {
      entryPointFields.push(fi);
    }
  }

  entryPointFields.push(
    moduleExport('memory', moduleExportDescr('Mem', numberLiteral(0, '0'))),
    moduleExport('alloc', moduleExportDescr('Func', identifier('alloc'))),
    moduleExport('free', moduleExportDescr('Func', identifier('free')))
  );

  let importMap = {}; // {[modulename_exportname] : [unique id within module]}
  let bundleAst = {
    type: 'Program',
    body: [{type: 'Module', id: null, fields: []}],
  };
  let fields = bundleAst.body[0].fields;

  for (let mod of moduleList) {
    treeshakeModule(mod.ast, {
      moduleName: mod.name,
      imports: mod.imports,
      isEntryPoint: mod === entryPoint,
      importMap,
    });
    let imports = mod.ast.body[0].fields.filter(f => f.type === 'ModuleImport');
    let nonImports = mod.ast.body[0].fields.filter(
      f => f.type !== 'ModuleImport'
    );
    fields.splice(0, 0, ...imports);
    fields.push(...nonImports);
  }

  // collect some metadata
  let exportNames = bundleAst.body[0].fields
    .filter(f => f.type === 'ModuleExport')
    .map(node => node.name);
  let watchFiles = moduleList.map(m => m.absPath);

  let wat = print(bundleAst)
    .replace(/\(end\)/g, '')
    .replace(/u32/g, 'i32');

  // console.log(wat);

  let wabtModule = wabt.parseWat('', wat, wasmFeatures);
  // wat = wabtModule.toText({foldExprs: false, inlineExport: false});
  let wasm = new Uint8Array(
    wabtModule.toBinary({write_debug_names: true}).buffer
  );
  return {wasm, exportNames, watchFiles};
}

let isFileImport = /^(\/|\.\/|\.\.\/)/; // file imports start with '/' or './' or '../'

// returns de-duplicated linear list of imports that can be processed in order
function enumerateModules(absPath, moduleList, specialModules = []) {
  moduleList = moduleList ?? [];

  let dirPath = path.dirname(absPath);
  let isWat = absPath.endsWith('.wat');

  let ast = isWat ? readWat(absPath) : readWasm(absPath);
  let dataEnd = 0;

  traverse(ast, {
    ModuleImport({node}) {
      let isFile = isFileImport.test(node.module);
      let special = specialModules.find(i => i.path === node.module);
      if (!isFile && !special) return;

      let importAbsPath;

      // if import does not belong to a known module, add it to list
      if (isFile) {
        importAbsPath = path.resolve(dirPath, node.module);
        if (!moduleList.some(m => m.absPath === importAbsPath)) {
          enumerateModules(importAbsPath, moduleList);
        }
      } else {
        importAbsPath = special.path;
        if (!moduleList.some(m => m.absPath === importAbsPath)) {
          moduleList.push({
            absPath: importAbsPath,
            baseName: special.name,
            name: special.name,
            ast: special.ast,
            imports: new Set(),
            dataEnd: 0,
          });
        }
      }

      // rewrite import statement to feature unique name
      let mod = moduleList.find(m => m.absPath === importAbsPath);
      node.module = './' + mod.name;
      node.name = `${mod.name}_${node.name}`;
      mod.imports.add(node.name);
    },

    Data({node}) {
      let thisDataEnd = node.offset.args[0].value + node.init.values.length;
      if (thisDataEnd > dataEnd) dataEnd = thisDataEnd;
    },
  });

  let baseName = getModuleName(absPath);
  let i = 1;
  for (let mod of moduleList) {
    if (mod.baseName === baseName) i++;
  }
  let name = baseName + (i === 1 ? '' : i + '');
  moduleList.push({absPath, baseName, name, ast, imports: new Set(), dataEnd});
  return moduleList;
}

function treeshakeModule(ast, {imports, moduleName, isEntryPoint, importMap}) {
  imports = imports ?? new Set();
  let keepExports = imports;
  let keepAllExports = imports.has('*');

  // returns modified AST
  let {
    body: [{fields}],
  } = ast;
  let keep = new Set();
  let traversed = new Set();

  // traverse globals / functions / memories top-to-bottom
  // store nodes and normalized identifiers that are used everywhere

  let globals = []; // i -> node
  let globalsByName = {}; // id.value -> node
  let functions = [];
  let functionsByName = {};
  let memories = [];
  let identifiers = new Map(); // node -> id

  for (let node of fields) {
    switch (node.type) {
      case 'Data': {
        keep.add(node);
        break;
      }
      case 'Global': {
        let i = globals.length;
        globals.push(node);
        let id = getNormalizedId(moduleName, 'g', node, i);
        identifiers.set(node, id);
        globalsByName[id.value] = node;
        if (node.name) {
          globalsByName[node.name.value] = node;
        }
        break;
      }
      case 'Func': {
        let i = functions.length;
        functions.push(node);
        let id = getNormalizedId(moduleName, 'f', node, i);
        identifiers.set(node, id);
        functionsByName[id.value] = node;
        if (node.name) {
          functionsByName[node.name.value] = node;
        }
        break;
      }
      case 'Memory': {
        let i = memories.length;
        memories.push(node);
        let id = getNormalizedId(moduleName, 'm', node, i);
        identifiers.set(node, id);
        break;
      }
      case 'ModuleImport': {
        // let importModuleName = getModuleName(node.module);
        let isBundled = isFileImport.test(node.module);
        if (!isBundled) {
          keep.add(node);
        }
        let {descr, name} = node;
        if (isBundled && !importMap[name]) {
          let modName = node.module.slice(2);
          let actualName = name.replace(modName + '_', '');
          throw Error(`"${actualName}" is not exported from ${modName}.wat`);
        }
        switch (descr.type) {
          case 'GlobalType': {
            let i = globals.length;
            globals.push(descr);
            let originalId = descr.id;
            let id = isBundled
              ? importMap[name]
              : getNormalizedId(moduleName, 'g', descr, i);
            if (!isBundled) descr.id = id;
            identifiers.set(descr, id);
            globalsByName[id.value] = descr;
            if (originalId) {
              globalsByName[originalId.value] = descr;
            }
            break;
          }
          case 'FuncImportDescr': {
            let i = functions.length;
            functions.push(descr);
            let originalId = descr.id;
            let id = isBundled
              ? importMap[name]
              : getNormalizedId(moduleName, 'f', descr, i);
            if (!isBundled) descr.id = id;
            identifiers.set(descr, id);
            functionsByName[id.value] = descr;
            if (originalId) {
              functionsByName[originalId.value] = descr;
            }
            break;
          }
          case 'Memory': {
            let i = memories.length;
            memories.push(descr);
            let id = isBundled
              ? importMap[name]
              : getNormalizedId(moduleName, 'm', descr, i);
            if (!isBundled) descr.id = id;
            identifiers.set(descr, id);
            break;
          }
        }
      }
    }
  }

  let normalizedId = (_type, node) => identifiers.get(node);
  let getGlobal = id =>
    isNumberLiteral(id) ? globals[id.value] : globalsByName[id.value];
  let getFunction = id =>
    isNumberLiteral(id) ? functions[id.value] : functionsByName[id.value];

  function addGlobal(id) {
    if (!id?.value) throw Error('got undefined id in addGlobal');
    let node = getGlobal(id);
    if (node.type !== 'Global') {
      return;
    }
    if (!keep.has(node)) {
      node.name = normalizedId('g', node);
      // log('adding global', id.value);
      keep.add(node);
    }
  }

  function traverseFunction(id) {
    if (!id?.value) throw Error('got undefined id in traverseFunction');
    let node = getFunction(id);

    if (node.type !== 'Func') return;

    if (!keep.has(node)) {
      node.name = normalizedId('f', node);
      // console.log('adding function', id.value);
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
      // if (!node.id) console.log(node);
      // console.log('adding memory', node.id.value);
      keep.add(node);
    },

    Start({node}) {
      if (!node.index) console.log(node);
      node.index = normalizedId('f', getFunction(node.index));
      // console.log('adding start', node.index.value);
      keep.add(node);
      traverseFunction(node.index);
    },

    // doesn't seem necessary to include types
    // TypeInstruction(path) {
    //   keep.add(path.node);
    // },

    ModuleExport(path) {
      let uniqueName = `${moduleName}_${path.node.name}`;

      if (!(keepAllExports || keepExports.has(uniqueName))) return;

      // if (!path.node.descr.id) console.log(path.node);

      if (isEntryPoint) {
        // keep exports in module output
        // console.log('adding export', uniqueName);
        keep.add(path.node);
      }

      let {descr, name} = path.node;
      switch (descr.exportType) {
        case 'Func': {
          let id = normalizedId('f', getFunction(descr.id));
          descr.id = id;
          importMap[`${moduleName}_${name}`] = id;
          traverseFunction(descr.id);
          break;
        }
        case 'Global': {
          let globalNode = getGlobal(descr.id);
          let id = normalizedId('g', globalNode);
          descr.id = id;
          importMap[`${moduleName}_${name}`] = id;
          addGlobal(descr.id);
          break;
        }
        case 'Mem': {
          let id = normalizedId('m', memories[descr.id.value]);
          descr.id = id;
          importMap[`${moduleName}_${name}`] = id;
          break;
        }
      }
    },
  });

  let fieldsToKeep = fields.filter(f => keep.has(f));

  ast.body[0].fields = fieldsToKeep;
  return ast;
}

function getNormalizedId(prefix, type, node, index) {
  let stringId = node.name?.value ?? node.id?.value;
  if (stringId) {
    return identifier(`${prefix}_${stringId}`);
  } else {
    return identifier(
      `${prefix}_${type}${index.toString(10).padStart(2, '0')}`
    );
  }
}

function getModuleName(watPath) {
  return path.basename(watPath).replace('.wat', '').replace('.wasm', '');
}

function readWat(absPath) {
  let watText = fs.readFileSync(absPath, {encoding: 'utf8'});
  let wabtModule = wabt.parseWat('', watText, wasmFeatures);
  let wasmBytes = new Uint8Array(
    wabtModule.toBinary({write_debug_names: true}).buffer
  );
  let ast = decode(wasmBytes, {});
  return ast;
}

function readWasm(absPath) {
  let wasmBytes = fs.readFileSync(absPath);
  let ast = decode(wasmBytes, {});
  return ast;
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
