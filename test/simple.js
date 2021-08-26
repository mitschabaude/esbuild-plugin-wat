import {sum} from './simple.wat';

(async () => {
  let total = await sum(new Uint8Array([1, 2, 3, 4]));
  console.log('sum', total);
})();
