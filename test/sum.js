import sumWat from './sum.wat';
import {wrap} from './wasm-tools';

let {sum, avg} = wrap(sumWat, ['sum', 'avg'], {imports: {log: console.log}});

async function main() {
  let array = new Uint8Array(1000000);
  array.set(array.map(() => Math.random() > 0.5));
  // let array = new Uint8Array([1, 2, 3]);

  let sumResult = await sum(array);
  console.log('sum result', sumResult);

  let avgResult = await avg(array);
  console.log('avg result', avgResult);
}

main();
