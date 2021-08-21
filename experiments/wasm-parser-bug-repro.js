// import createWabt from 'wabt';
import {parse} from '@webassemblyjs/wast-parser';
import {encodeNode} from '@webassemblyjs/wasm-gen';
// import fs from 'fs';
import {decode} from '@webassemblyjs/wasm-parser';
import {print} from '@webassemblyjs/wast-printer';

// prettier-ignore
let wasmBytes = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // magic header
  0x01, 0x00, 0x00, 0x00, // version
  0x06, 0x06, 0x01, // globals section with 6 bytes, 1 global
  // GLOBAL
    0x7f, // type i32
    0x00, // not mutable
    // initialiation
    0x41, 0x00, // i32.const 0
    0x0b, // end of initialization
]);

// decode with wasm-parser
let ast = decode(wasmBytes, {});

// print with wast-printer
console.log(print(ast));

console.log(ast.body[0].fields[0]);

/* OUTPUT:
(module
  (global i32 (i32.const 0)(end))
)
*/

const watText = `
  (module
    (global i32 (i32.const 0))
  )
`;

let ast2 = parse(watText);
console.log(ast2.body[0].fields[0]);

console.log(encodeNode(ast2.body[0].fields[0]));
