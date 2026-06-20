import { parseFile } from '../src/scanner/parsers/go';
import { removeBuriedCode } from '../src/github/prCreator';
import * as fs from 'fs';
import * as path from 'path';

describe('Go parser and remover', () => {
  const tmpGo = 'tmp_test_file.go';

  afterEach(() => {
    if (fs.existsSync(tmpGo)) {
      fs.unlinkSync(tmpGo);
    }
  });

  test('parses Go function with comment annotation', () => {
    const content = `package main\n\n// @funeral {\n//   expiry: "2025-01-01",\n//   reason: "Use new version"\n// }\nfunc oldFunction() {\n\tprintln("hello")\n}`;
    fs.writeFileSync(tmpGo, content);
    const items = parseFile(tmpGo);
    expect(items.length).toBe(1);
    expect(items[0].functionName).toBe('oldFunction');
    expect(items[0].reason).toBe('Use new version');
    expect(items[0].expiry.toISOString().slice(0, 10)).toBe('2025-01-01');
  });

  test('removes Go function and comment annotation', () => {
    const content = `package main\n\n// @funeral {\n//   expiry: "2025-01-01",\n//   reason: "Use new version"\n// }\nfunc oldFunction() {\n\tprintln("hello")\n}\n\nfunc keepThis() {}`;
    fs.writeFileSync(tmpGo, content);
    const items = parseFile(tmpGo);
    const cleaned = removeBuriedCode(content, items[0]);
    expect(cleaned).not.toContain('oldFunction');
    expect(cleaned).toContain('keepThis');
    expect(cleaned).not.toContain('Use new version');
  });
});
