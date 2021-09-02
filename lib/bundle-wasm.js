import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
import {decode} from '@webassemblyjs/wasm-parser';
import {print} from '@webassemblyjs/wast-printer';
import {
  traverse,
  isNumberLiteral,
  identifier,
  module,
  program,
  numberLiteralFromRaw,
} from '@webassemblyjs/ast';
import {parse} from '@webassemblyjs/wast-parser';
let wabt;

export {bundleWasm};

// import.meta.resolve
let memoryPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  './memory.wat'
);
let wrapperModules = {
  [memoryPath]: {
    memory: '(memory 1)',
    alloc: '(func (param i32) (result i32))',
    free: '(func)',
  },
};

async function bundleWasm({path: wasmPath, wrap = false, imports}) {
  wabt = wabt ?? (await (await import('wabt')).default());
  let absPath = path.resolve('.', wasmPath);

  // add meta module
  let metaModuleAst = parse(`(module
    (global $data_end i32 (i32.const 0))
    (export "data_end" (global $data_end))
  )`);
  let dataEndArgs = metaModuleAst.body[0].fields[0].init[0].args;
  let metaModule = {name: 'meta', path: 'meta', ast: metaModuleAst};
  let specialModules = [metaModule];

  // parse entrypoint, add wrappers, enumerate bundled modules
  let moduleList = [];
  let entryPointAst = absPath.endsWith('.wat')
    ? readWat(absPath)
    : readWasm(absPath);

  // entryPointAst = parse(
  //   await fs.promises.readFile(absPath, {encoding: 'utf8'})
  // );
  // console.log(
  //   entryPointAst.body[0].fields.find(n => n.type === 'Global').init[0].args
  // );
  if (wrap) {
    addWrappers(entryPointAst, imports, wrapperModules);
  }
  let windowImports = new Set();
  enumerateModules(
    absPath,
    moduleList,
    specialModules,
    windowImports,
    entryPointAst
  );
  let entryPoint = moduleList[moduleList.length - 1];
  entryPoint.imports = imports
    ? new Set(
        [...imports].map(i => (i === '*' ? i : `${entryPoint.name}_${i}`))
      )
    : new Set(['*']);

  // set global data end
  let maxDataEnd = Math.max(...moduleList.map(m => m.dataEnd));
  dataEndArgs[0] = numberLiteralFromRaw(maxDataEnd + '');

  // bundle everything together
  let importMap = {}; // {[modulename_exportname] : [unique id within module]}
  let bundleAstFields = [];
  let bundleAst = program([module(null, bundleAstFields)]);

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
    bundleAstFields.splice(0, 0, ...imports);
    bundleAstFields.push(...nonImports);
  }

  // treeshake the final bundle again to remove unused deep imports
  treeshakeModule(bundleAst, {
    moduleName: entryPoint.name,
    imports: entryPoint.imports,
    isEntryPoint: true,
    importMap: {},
  });

  // collect some metadata
  let exportNames = bundleAst.body[0].fields
    .filter(f => f.type === 'ModuleExport')
    .map(node => node.name);
  let watchFiles = moduleList.filter(m => !m.isSpecial).map(m => m.absPath);

  // produce wat output & compile to wasm
  let wat = print(bundleAst)
    .replace(/\(end\)/g, '')
    .replace(/u32/g, 'i32')
    .replace(/u64/g, 'i64');

  // console.log(wat);

  let wabtModule = wabt.parseWat('', wat, wasmFeatures);
  // wat = wabtModule.toText({foldExprs: false, inlineExport: false});
  let wasm = new Uint8Array(
    wabtModule.toBinary({write_debug_names: false}).buffer
  );
  return {
    wasm,
    wat,
    exportNames,
    watchFiles,
    windowImports: [...windowImports],
  };
}

function addWrappers(ast, imports, wrapperModules) {
  let fields = ast.body[0].fields;
  let varId = 0;
  let isSameImport = m => n =>
    n.type === 'ModuleImport' && n.module === m.module && n.name === m.name;
  let isSameExport = m => n => n.type === 'ModuleExport' && n.name === m.name;

  for (let modulePath in wrapperModules) {
    let definitions = wrapperModules[modulePath];
    for (let name in definitions) {
      let definition = definitions[name];
      let importNode = parse(`(import "${modulePath}" "${name}" ${definition})`)
        .body[0];
      importNode.descr.id = identifier('wrapper_var_' + varId++);
      let exportNode = exportFromImport(importNode);

      if (!fields.some(isSameImport(importNode))) {
        fields.push(importNode);
      }
      if (!fields.some(isSameExport(exportNode))) {
        fields.push(exportNode);
      }
      imports?.add(name);
    }
  }
}

let isFileImport = /^(\/|\.\/|\.\.\/)/; // file imports start with '/' or './' or '../'

// returns de-duplicated linear list of imports that can be processed in order
function enumerateModules(
  absPath,
  moduleList,
  specialModules = [],
  windowImports = [],
  ast
) {
  moduleList = moduleList ?? [];

  let dirPath = path.dirname(absPath);
  let isWat = absPath.endsWith('.wat');

  ast = ast ?? (isWat ? readWat(absPath) : readWasm(absPath));
  let dataEnd = 0;

  traverse(ast, {
    ModuleImport({node}) {
      if (node.module === 'window') {
        windowImports.add(node.name);
        return;
      }

      let isFile = isFileImport.test(node.module);
      let special = specialModules.find(i => i.path === node.module);

      if (!isFile && !special) return;

      let importAbsPath;

      // if import does not belong to a known module, add it to list
      if (isFile) {
        let importPath = node.module;
        importAbsPath = path.isAbsolute(importPath)
          ? importPath
          : path.resolve(dirPath, importPath);
        if (!moduleList.some(m => m.absPath === importAbsPath)) {
          enumerateModules(
            importAbsPath,
            moduleList,
            specialModules,
            windowImports
          );
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
            isSpecial: true,
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
  let memoriesByName = {};
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
        if (node.id) {
          memoriesByName[node.id.value] = node;
        }
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
            let originalId = descr.id;
            let id = isBundled
              ? importMap[name]
              : getNormalizedId(moduleName, 'm', descr, i);
            if (!isBundled) descr.id = id;
            identifiers.set(descr, id);
            if (originalId) {
              memoriesByName[originalId.value] = descr;
            }
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
  let getMemory = id =>
    isNumberLiteral(id) ? memories[id.value] : memoriesByName[id.value];

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
        case 'Mem':
        case 'Memory': {
          let memoryNode = getMemory(descr.id);
          let id = normalizedId('m', memoryNode);
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

function exportFromImport(importNode) {
  let varName = importNode.descr.id.value;
  let nodeType = {
    Mem: 'memory',
    Memory: 'memory',
    FuncImportDescr: 'func',
    GlobalType: 'global',
  }[importNode.descr.type];
  let exportString = `(export "${importNode.name}" (${nodeType} $${varName}))`;
  let exportNode = parse(exportString).body[0];
  return exportNode;
}

function readWat(absPath) {
  let watText = fs.readFileSync(absPath, {encoding: 'utf8'});
  let wabtModule = wabt.parseWat('', watText, wasmFeatures);
  let wasmBytes = new Uint8Array(
    wabtModule.toBinary({write_debug_names: true}).buffer
  );
  let ast = decode(wasmBytes, {dump: false});
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
