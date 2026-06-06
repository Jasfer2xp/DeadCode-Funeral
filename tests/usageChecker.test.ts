import { checkUsage } from '../src/scanner/usageChecker';
import * as fs from 'fs';

test('usage checker finds function calls in other files', () => {
  const root = '.';
  const defining = 'defining_temp.js';
  const other = 'other_temp.js';
  fs.writeFileSync(defining, 'function foo() {}');
  fs.writeFileSync(other, 'foo();\nbar();');

  const res = checkUsage(root, defining, 'foo');

  fs.unlinkSync(defining);
  fs.unlinkSync(other);

  expect(res.isUsed).toBe(true);
  expect(res.usageLocations.length).toBeGreaterThan(0);
});
