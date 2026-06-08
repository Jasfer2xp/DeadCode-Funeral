import path from 'path';
const pr = await import(pathToFileURL('./src/github/prCreator.js').href);
function pathToFileURL(p) { const u = new URL('file://' + path.resolve(p)); return u; }
const removeBuriedCode = pr.removeBuriedCode || pr.default && pr.default.removeBuriedCode;
const src = `/** @funeral { expiry: "2020-01-01" } */\nexport default function old() { return 1; }\nexport function keep() { return 2; }`;
const item = { filePath: 'tmp.js', lineNumber: 1, functionName: 'old', language: 'javascript', expiry: new Date('2020-01-01'), reason: '' };
const out = removeBuriedCode(src, item);
console.log('OUT_START');
console.log(out);
console.log('OUT_END');
console.log('LINES:', out.split('\n').map((l,i)=>`${i}:${l}`));
