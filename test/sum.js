import sum from './sum-import';
import minimist from 'minimist';
import {avg, double, isSumEven, howIsSum, createArray} from './sum.wat';

async function main() {
  // let array = new Uint8Array(10);
  // array.set(array.map(() => Math.random() > 0.5));
  let bytes = new Uint8Array([1, 2, 3, 4]);

  let sumResult = await sum(bytes);
  console.log('sum', sumResult);

  let avgResult = await avg(bytes);
  console.log('avg', avgResult);

  let doubleResult = await double(bytes);
  console.log('double', doubleResult.toString());

  console.log(
    'isSumEven',
    await isSumEven(bytes),
    await isSumEven(new Uint8Array([1, 1, 0])),
    await isSumEven(new Uint8Array([1, 1, 1]))
  );

  console.log(
    'howIsSum',
    await howIsSum(bytes),
    await howIsSum(new Uint8Array([1, 1, 0])),
    await howIsSum(new Uint8Array([1, 1, 1]))
  );

  // let str = '🤪 hello world! 🤪 ';
  // let twiceResult = await twice(str);
  // console.log(`twice "${twiceResult}"`);

  let arrayResult = await createArray();
  console.log('array', JSON.stringify(arrayResult));

  bytes = new Uint8Array(500000);
  bytes.set(bytes.map(() => Math.random() > 0.5));
  sumResult = await sum(bytes);
  console.log('sum', sumResult);
  avgResult = await avg(bytes);
  console.log('avg', avgResult);

  bytes = new Uint8Array(2000000);
  bytes.set(bytes.map(() => Math.random() > 0.5));
  sumResult = await sum(bytes);
  console.log('sum', sumResult);
  avgResult = await avg(bytes);
  console.log('avg', avgResult);

  doubleResult = await double(new Uint8Array([3, 4, 5]));
  console.log('double', doubleResult.toString());
}

main();
