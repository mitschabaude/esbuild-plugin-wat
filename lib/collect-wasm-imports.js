import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import parseImports from 'parse-imports';

export {collectWasmImports};

async function collectWasmImports(entryPoints) {
  let wasmImports = {}; // {[absolute path of wasm file]: [...imported names]}
  let traversed = new Set(); // absolute paths of js files

  await Promise.all(
    entryPoints.map(file =>
      collectWasmImportsInFile(file, traversed, wasmImports)
    )
  );

  return wasmImports;
}

let isWasmFile = /\.(wasm|wat)$/;
let isJsFile = /^[^.]+((\.js|\.ts|\.jsx|\.tsx)?)$/;

async function collectWasmImportsInFile(filePath, traversed, wasmImports) {
  if (traversed.has(filePath)) return;
  traversed.add(filePath);

  let require = createRequire(pathToFileURL(filePath));

  let dirPath = path.dirname(filePath);

  let code = await fs.promises.readFile(filePath, {encoding: 'utf8'});

  // TODO: imports should be processed async ("in parallel")

  for (const $import of await parseImports(code)) {
    let {
      moduleSpecifier: {type: importType, value: importPath},
      importClause,
    } = $import;
    if (
      importClause === undefined ||
      importPath === undefined ||
      (importType !== 'absolute' && importType !== 'relative')
    ) {
      continue;
    }

    let fileName = importPath.split('/').pop();
    if (isWasmFile.test(fileName)) {
      // console.log('wasm file', importPath, importClause);
      let absPath =
        importType === 'absolute'
          ? importPath
          : path.resolve(dirPath, importPath);
      wasmImports[absPath] = wasmImports[absPath] ?? new Set();
      let importSet = wasmImports[absPath];
      if (importClause.default) {
        importSet.add('default');
      }
      if (importClause.namespace) {
        importSet.add('*');
      }
      for (let namedImport of importClause.named) {
        importSet.add(namedImport.specifier);
      }
    } else {
      // if (isJsFile.test(fileName)) {
      // console.log('js file', importPath, importClause);
      let absPath = require.resolve(importPath);
      collectWasmImportsInFile(absPath, traversed, wasmImports);
    }
    // }
  }
}
