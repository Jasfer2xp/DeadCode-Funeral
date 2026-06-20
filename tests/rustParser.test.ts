import { parseFile } from '../src/scanner/parsers/rust';
import { removeBuriedCode } from '../src/github/prCreator';
import * as fs from 'fs';
import * as path from 'path';

describe('Rust parser and remover', () => {
  const tmpRs = 'tmp_test_file.rs';

  afterEach(() => {
    if (fs.existsSync(tmpRs)) {
      fs.unlinkSync(tmpRs);
    }
  });

  test('parses Rust function with comment annotation', () => {
    const content = `// @funeral {\n//   expiry: "2025-01-01",\n//   reason: "Use new version"\n// }\npub fn old_function() {\n\tprintln!("hello");\n}`;
    fs.writeFileSync(tmpRs, content);
    const items = parseFile(tmpRs);
    expect(items.length).toBe(1);
    expect(items[0].functionName).toBe('old_function');
    expect(items[0].reason).toBe('Use new version');
    expect(items[0].expiry.toISOString().slice(0, 10)).toBe('2025-01-01');
  });

  test('parses Rust function with attribute annotation', () => {
    const content = `#[dead_code_funeral(expiry = "2025-01-01", reason = "Use new version")]\nfn old_function() {}`;
    fs.writeFileSync(tmpRs, content);
    const items = parseFile(tmpRs);
    expect(items.length).toBe(1);
    expect(items[0].functionName).toBe('old_function');
    expect(items[0].reason).toBe('Use new version');
    expect(items[0].expiry.toISOString().slice(0, 10)).toBe('2025-01-01');
  });

  test('removes Rust function and annotation', () => {
    const content = `#[dead_code_funeral(expiry = "2025-01-01", reason = "Use new version")]\nfn old_function() {\n\tprintln!("hello");\n}\n\nfn keep_this() {}`;
    fs.writeFileSync(tmpRs, content);
    const items = parseFile(tmpRs);
    const cleaned = removeBuriedCode(content, items[0]);
    expect(cleaned).not.toContain('old_function');
    expect(cleaned).toContain('keep_this');
    expect(cleaned).not.toContain('Use new version');
  });
});
