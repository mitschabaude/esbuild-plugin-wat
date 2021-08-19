import path from 'path';
import fs from 'fs';
import createWabt from 'wabt';
import binaryen from 'binaryen';
import {traverse, signatures} from '@webassemblyjs/ast';
import {decode} from '@webassemblyjs/wasm-parser';
import identifierToIndex from '@webassemblyjs/ast/lib/transform/wast-identifier-to-index/index.js';

main();
let wabt;

async function main() {
  wabt = await createWabt();

  let watPath = process.argv[2] ?? 'experiments/common.wat';
  let watBytes = await fs.promises.readFile(watPath);
  let watText = new TextDecoder().decode(watBytes);
  let wabtModule = wabt.parseWat(watPath, watText, wasmFeatures);
  // console.log(wabtModule);
  let wasmBytes = new Uint8Array(
    wabtModule.toBinary({write_debug_names: true}).buffer
  );

  let ast = decode(wasmBytes, {});
  identifierToIndex.transform(ast);
  let {
    body: [{fields}],
  } = ast;
  // console.log(signatures);
  let [mem] = fields.filter(
    f => f.type === 'ModuleExport' && f.descr.exportType === 'Mem'
  );
  // console.log('memory', mem);
  let funcExports = fields.filter(
    f => f.type === 'ModuleExport' && f.descr.exportType === 'Func'
  );
  let funcExportIds = funcExports.map(f => f.descr.id.value);
  let funcs = fields.filter(
    f => f.type === 'Func' && funcExportIds.includes(f.name.value)
  );
  console.log(...funcExportIds);
  console.log(funcs[0].body[0]);

  traverse(funcs[0], {
    Instr(path) {
      let {node} = path;
      if (node.id === 'get_global') {
        console.log(node.args);
      }
    },
  });

  // let mod = binaryen.readBinary(wasmBytes);

  // let n = mod.getNumFunctions();
  // console.log(n);
  // for (let i = 0; i < n; i++) {
  //   let f = mod.getFunctionByIndex(i);
  //   let info = binaryen.getFunctionInfo(f);
  //   let id = binaryen.getExpressionId(info.body);
  //   console.log(id);
  //   console.log(binaryen.getExpressionType(id));
  //   // binaryen.getExpressionInfo(info.body);
  //   // if (!info.module) continue;
  //   // console.log(binaryen.getExpressionInfo(f));
  //   console.log(info);
  // }

  // n = mod.getNumExports();
  // console.log(n);
  // for (let i = 0; i < n; i++) {
  //   let f = mod.getExportByIndex(i);
  //   let info = binaryen.getExportInfo(f);
  //   // if (!info.module) continue;
  //   // console.log(binaryen.getExpressionInfo(f));
  //   console.log(info);
  // }

  // // console.log(mod.emitText());
}
// console.log(binaryen);

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
