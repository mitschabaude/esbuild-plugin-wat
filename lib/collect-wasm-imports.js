import fs from 'fs';
import path from 'path';
import parseImports from 'parse-imports';
export {collectWasmImports};

collectWasmImports(['./test/sum.js']);

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

// type ModuleSpecifierType =
//   | 'invalid'
//   | 'absolute'
//   | 'relative'
//   | 'builtin'
//   | 'package'
//   | 'unknown'

// type Import = {
//   startIndex: number
//   endIndex: number
//   isDynamicImport: boolean
//   moduleSpecifier: {
//     type: ModuleSpecifierType
//     isConstant: boolean
//     code: string
//     value?: string
//     resolved?: string
//   }
//   importClause?: {
//     default?: string
//     named: string[]
//     namespace?: string
//   }
// }

let isWasmFile = /(.wasm|.wat)$/;
let isJsFile = /(.js|.ts|.jsx|.tsx)$/;

async function collectWasmImportsInFile(file, traversed) {
  if (traversed.has(file)) return;

  let code = await fs.promises.readFile(file, {encoding: 'utf8'});

  for (const $import of await parseImports(code)) {
    let {
      moduleSpecifier: {type, value},
      importClause,
    } = $import;
    if (
      importClause === undefined ||
      value === undefined ||
      (type !== 'absolute' && type !== 'relative')
    )
      continue;

    // !isWasmFile.test(value)
    console.log(value, importClause);
  }
}
