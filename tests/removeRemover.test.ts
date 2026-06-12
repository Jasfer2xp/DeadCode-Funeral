import { removeBuriedCode } from '../src/github/prCreator';

test('JS remover deletes function following @funeral JSDoc', () => {
  const source = `/** @funeral { expiry: "2020-01-01", reason: "x" } */\nfunction toRemove() { return 1; }\nfunction keep() { return 2; }`;
  const item: any = { filePath: 'tmp.js', lineNumber: 1, functionName: 'toRemove', language: 'javascript', expiry: new Date('2020-01-01'), reason: 'x' };
  const out = removeBuriedCode(source, item);
  expect(out).not.toContain('toRemove');
  expect(out).toContain('keep');
});

test('PHP remover deletes function following @funeral DocBlock or DeadCode attribute', () => {
  const sourceDoc = `/** @funeral { expiry: "2020-01-01", reason: "x" } */\nfunction old_func() { return 1; }\nfunction keep() { return 2; }`;
  const itemDoc: any = { filePath: 'tmp.php', lineNumber: 1, functionName: 'old_func', language: 'php', expiry: new Date('2020-01-01'), reason: 'x' };
  const outDoc = removeBuriedCode(sourceDoc, itemDoc);
  expect(outDoc).not.toContain('old_func');
  expect(outDoc).toContain('keep');

  const sourceAttr = `#[DeadCode(expiry: \"2020-01-01\", reason: \"x\")]\nfunction old_attr() { return 1; }\nfunction keep2() { return 2; }`;
  const itemAttr: any = { filePath: 'tmp.php', lineNumber: 1, functionName: 'old_attr', language: 'php', expiry: new Date('2020-01-01'), reason: 'x' };
  const outAttr = removeBuriedCode(sourceAttr, itemAttr);
  expect(outAttr).not.toContain('old_attr');
  expect(outAttr).toContain('keep2');

  // PHP: attribute list with multiple attributes on same line
  const sourceAttrMulti = `#[Other]
#[DeadCode(expiry: "2020-01-01", reason: "x")]
function old_attr2() { return 1; }
function keep3() { return 2; }`;
  const itemAttrMulti: any = { filePath: 'tmp.php', lineNumber: 2, functionName: 'old_attr2', language: 'php', expiry: new Date('2020-01-01'), reason: 'x' };
  const outAttrMulti = removeBuriedCode(sourceAttrMulti, itemAttrMulti);
  expect(outAttrMulti).not.toContain('old_attr2');
  expect(outAttrMulti).toContain('keep3');
});
