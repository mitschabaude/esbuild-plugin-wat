import fs from 'fs';

let code = fs.readFileSync(process.argv[2], {encoding: 'utf8'});
console.log('export default ' + JSON.stringify(code));
