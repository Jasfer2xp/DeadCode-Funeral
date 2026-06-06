import { parseFile } from '../src/scanner/parsers/csharp';
import * as fs from 'fs';

test('csharp parser finds DeadCode attribute', () => {
  const tmp = 'tmp_test.cs';
  const content = `[DeadCode(expiry: "2025-01-01", reason: "x")]\npublic void OldMethod() { }`;
  fs.writeFileSync(tmp, content);
  const items = parseFile(tmp);
  fs.unlinkSync(tmp);
  console.log('C# parser items:', items);
  expect(items.length).toBeGreaterThanOrEqual(1);
  // functionName extraction may be heuristic; ensure we parsed expiry and reason
  expect(items[0].expiry instanceof Date).toBeTruthy();
  expect(items[0].reason).toBe('x');
});
