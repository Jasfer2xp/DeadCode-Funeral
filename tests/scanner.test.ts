import { parseFile } from '../src/scanner/parsers/typescript';
import * as fs from 'fs';

test('typescript parser finds @funeral in JSDoc', () => {
  const tmp = 'tmp_test_file.ts';
  const content = `/**\n * @funeral {\n *   expiry: "2025-09-01",\n *   reason: "Use x instead"\n * }\n */\nfunction oldThing() {}`;
  fs.writeFileSync(tmp, content);
  const items = parseFile(tmp);
  fs.unlinkSync(tmp);
  expect(items.length).toBe(1);
  expect(items[0].functionName).toBe('oldThing');
  expect(items[0].reason).toBe('Use x instead');
});
