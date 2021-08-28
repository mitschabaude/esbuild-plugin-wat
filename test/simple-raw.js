import simpleWat from './simple-raw.wat';

(async () => {
  let {instance} = await WebAssembly.instantiate(simpleWat, {
    imports: {log: console.log},
  });
  let {memory, sum} = instance.exports;

  let input = new Uint8Array([1, 2, 3, 4]);
  new Uint8Array(memory.buffer, 0, 4).set(input);

  let total = await sum(0, 4);
  console.log('sum', total);
})();
