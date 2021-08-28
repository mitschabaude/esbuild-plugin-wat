import {sum, avg} from './sum.wat';

async function main() {
  let bytes = new Uint8Array([1, 2, 3, 4]);

  let sumResult = await sum(bytes);
  console.log('sum', sumResult);

  let avgResult = await avg(bytes);
  console.log('avg', avgResult);
}

main();
