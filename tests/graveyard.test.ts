import { appendRecord } from '../src/graveyard/logger';
import * as fs from 'fs';

test('appendRecord writes to GRAVEYARD.md', () => {
  const tmpDir = '.';
  const item: any = { filePath: 'a.js', lineNumber: 2, functionName: 'old', language: 'javascript', reason: 'r' };
  const grave = 'GRAVEYARD.md';
  const before = fs.existsSync(grave) ? fs.readFileSync(grave, 'utf8') : '';
  appendRecord(item, 5, tmpDir);
  const after = fs.readFileSync(grave, 'utf8');
  expect(after.length).toBeGreaterThan(before.length);
});
