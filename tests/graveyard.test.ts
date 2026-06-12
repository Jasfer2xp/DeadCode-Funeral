import { appendRecord } from '../src/graveyard/logger';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

test('appendRecord writes to GRAVEYARD.md', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadcode-graveyard-'));
  const item: any = { filePath: 'a.js', lineNumber: 2, functionName: 'old', language: 'javascript', reason: 'r' };
  const grave = path.join(tmpDir, 'GRAVEYARD.md');

  try {
    appendRecord(item, 5, tmpDir);
    const after = fs.readFileSync(grave, 'utf8');
    expect(after).toContain('old');
    expect(after).toContain('PR:** #5');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
