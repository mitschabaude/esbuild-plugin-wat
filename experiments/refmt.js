import fs from 'fs';
import {decode} from '@webassemblyjs/wasm-parser';
import {print} from '@webassemblyjs/wast-printer';
import createWabt from 'wabt';

main();
let wabt;

async function main() {
  wabt = await createWabt();

  let watPath = process.argv[2] ?? 'experiments/sum.wat';
  let watText = await fs.promises.readFile(watPath, {encoding: 'utf-8'});
  let wabtModule = wabt.parseWat('', watText, wasmFeatures);
  let wasmBytes = new Uint8Array(
    wabtModule.toBinary({write_debug_names: true}).buffer
  );
  let ast = decode(wasmBytes, {});
  // let ast = parse(watText);
  let wat = print(ast)
    .replace(/\(end\)/g, '')
    .replace(/u32/g, 'i32');

  console.log(wat);
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
